import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const seed = JSON.parse(await readFile(new URL('manage/links.json', root), 'utf8'));
const files = new Map();
for (const item of seed) files.set(item.slug, { html: await readFile(new URL(`${item.slug}/index.html`, root), 'utf8'), sha: `sha-${item.slug}` });
const tabs = await (await fetch('http://127.0.0.1:9226/json/list')).json();
const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let serial = 0;
const pending = new Map();
const errors = [];
const writes = [];
let failReads = false;
let stale = false;
function send(method, params={}) {
  const id = ++serial;
  return new Promise((resolve,reject)=>{
    pending.set(id, {resolve,reject}); ws.send(JSON.stringify({id,method,params}));
  });
}
ws.onmessage = async event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const p = pending.get(message.id); pending.delete(message.id);
    if (message.error) p?.reject(new Error(message.error.message)); else p?.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  if (message.method === 'Page.javascriptDialogOpening') await send('Page.handleJavaScriptDialog', {accept:true});
  if (message.method !== 'Fetch.requestPaused') return;
  const {requestId,request} = message.params;
  try {
    const url = new URL(request.url);
    let data;
    let status = 200;
    let contentType = 'application/json';
    if (url.hostname === 'api.github.com') {
      if (failReads && request.method === 'GET') { status=503; data={message:'QA offline'}; }
      else if (url.pathname === '/user') data={login:'qa-user'};
      else if (url.pathname === '/repos/ksrtlink/atk') data={permissions:{push:true}};
      else if (url.pathname.includes('/git/trees/')) data={truncated:false,tree:[...files].map(([slug,f])=>({type:'blob',path:`${slug}/index.html`,sha:f.sha}))};
      else {
        const path = url.pathname.split('/contents/')[1];
        const slug = path?.split('/')[0];
        const file = files.get(slug);
        if (request.method === 'PUT') {
          const body = JSON.parse(request.postData);
          writes.push({path,body,authorization:request.headers.Authorization});
          const html = Buffer.from(body.content,'base64').toString('utf8');
          files.set(slug,{html,sha:`new-${writes.length}`});
          status=201;data={content:{sha:`new-${writes.length}`},commit:{sha:`commit-${writes.length}`}};
        } else if (!file) { status=404;data={message:'Not Found'}; }
        else if (!path.includes('/')) data=[{name:'index.html',type:'file'}];
        else data={sha:stale && slug==='insights' ? 'changed-elsewhere' : file.sha,content:Buffer.from(file.html).toString('base64')};
      }
    } else {
      contentType='text/html';
      const slug=url.pathname.split('/')[2];
      data=files.get(slug)?.html || 'Not found';
      if (!files.has(slug)) status=404;
    }
    await send('Fetch.fulfillRequest',{requestId,responseCode:request.method==='OPTIONS'?200:status,responseHeaders:[{name:'Content-Type',value:contentType},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Methods',value:'GET,PUT,OPTIONS'},{name:'Access-Control-Allow-Headers',value:'authorization,content-type,x-github-api-version'}],body:Buffer.from(typeof data==='string'?data:JSON.stringify(data)).toString('base64')});
  } catch(error) { errors.push(error.message); await send('Fetch.failRequest',{requestId,errorReason:'Failed'}); }
};
async function evaluate(expression) {
  const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expression) {
  for(let i=0;i<120;i++) { if(await evaluate(expression))return; await new Promise(r=>setTimeout(r,100)); }
  throw new Error(`Timed out: ${expression}`);
}
async function fill(id,value) { await evaluate(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('input',{bubbles:true}))`); }
async function click(id) { await evaluate(`document.getElementById(${JSON.stringify(id)}).click()`); }
const report=[];
function passed(name){report.push(name);}
try {
  await send('Page.enable');await send('Runtime.enable');
  await send('Fetch.enable',{patterns:[{urlPattern:'https://api.github.com/*'},{urlPattern:'https://ksrtlink.github.io/*'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/manage/'});
  await waitFor(`document.querySelectorAll('.link-row').length===8`);
  assert.equal(await evaluate(`document.getElementById('total').textContent`),'8');
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
  passed('Desktop: all eight links render, no horizontal overflow');
  await mkdir(new URL('.qa/',root),{recursive:true});
  let shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await writeFile(new URL('.qa/desktop.png',root),Buffer.from(shot.data,'base64'));
  await fill('search','military');
  assert.equal(await evaluate(`document.querySelectorAll('.link-row').length`),2);
  await fill('search','no-such-link');
  assert.equal(await evaluate(`document.getElementById('empty').classList.contains('hidden')`),false);
  await click('clear-search');
  passed('Search, empty state, clear search');
  await fill('destination','https://example.com/launch?source=qr&lang=ar');await fill('slug','insights');
  await click('submit');
  assert.match(await evaluate(`document.getElementById('form-error').textContent`),/already exists/);
  assert.equal(writes.length,0);
  passed('Duplicate names blocked without a write');
  await fill('slug','new-launch');await click('submit');
  await waitFor(`document.getElementById('connection-dialog').open`);
  await fill('token','github_pat_QA_ONLY');await click('connect-submit');
  await waitFor(`document.getElementById('connection-label').textContent==='GitHub connected'`);
  assert.equal(await evaluate(`document.getElementById('token').value`),'');
  assert.equal(await evaluate(`localStorage.length+sessionStorage.length`),0);
  passed('Connect verifies account permissions; no token persisted');
  await click('submit');
  await waitFor(`document.getElementById('result-heading').textContent==='Ready for the world.'`);
  assert.equal(writes.length,1);assert.equal(writes[0].path,'new-launch/index.html');
  assert.equal(writes[0].body.sha,undefined);
  assert.equal(await evaluate(`document.getElementById('result-link').href`),'https://ksrtlink.github.io/atk/new-launch/');
  assert.equal(await evaluate(`document.querySelectorAll('.link-row').length`),9);
  passed('Create saves redirect, adds library row, verifies published destination');
  await evaluate(`document.querySelector('[aria-label="Edit Insights destination"]').click()`);
  assert.equal(await evaluate(`document.getElementById('slug').disabled`),true);
  await fill('destination','https://example.com/updated');await click('submit');
  await waitFor(`document.getElementById('result-heading').textContent==='Ready for the world.' && !document.getElementById('submit').disabled`);
  assert.equal(writes.length,2);assert.equal(writes[1].body.sha,'sha-insights');
  assert.equal(writes[1].path,'insights/index.html');
  passed('Edit preserves slug, confirms destination, supplies concurrency SHA');
  await evaluate(`document.querySelector('[aria-label="Edit Insights destination"]').click()`);
  stale=true;await fill('destination','https://example.com/concurrent');await click('submit');
  await waitFor(`document.getElementById('form-error').textContent.includes('changed since')`);
  assert.equal(writes.length,2);stale=false;await click('cancel-edit');
  passed('Concurrent change blocks overwrite');
  failReads=true;await click('refresh');
  await waitFor(`document.getElementById('source-status').classList.contains('warning')`);
  assert.equal(await evaluate(`document.querySelectorAll('.link-row').length`),9);
  passed('Failed refresh retains library with a visible stale-data warning');
  failReads=false;
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);
  shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await writeFile(new URL('.qa/mobile.png',root),Buffer.from(shot.data,'base64'));
  passed('Mobile: no horizontal overflow');
  await click('connect');await click('disconnect');
  assert.equal(await evaluate(`document.getElementById('connection-label').textContent`),'Connect GitHub');
  await send('Page.reload');
  await waitFor(`document.querySelectorAll('.link-row').length===9`);
  assert.equal(await evaluate(`document.getElementById('connection-label').textContent`),'Connect GitHub');
  passed('Disconnect and reload clear the connection');
  assert.deepEqual(errors,[]);
  passed('No JavaScript exceptions');
  console.log(JSON.stringify({passed:report,simulatedWrites:writes.length,screenshots:['.qa/desktop.png','.qa/mobile.png']},null,2));
} finally { ws.close(); }

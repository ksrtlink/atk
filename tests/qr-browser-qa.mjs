// Requires the local HTTP server, a headless browser on port 9226,
// test-only jsQR 1.4.0 at .qa/jsQR.js, and ZXing 0.21.3 at .qa/zxing.js.
// No live GitHub writes occur.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=new URL('../',import.meta.url);
const seed=JSON.parse(await readFile(new URL('manage/links.json',root),'utf8'));
const originals=new Map(await Promise.all(seed.map(async l=>[l.slug,await readFile(new URL(`${l.slug}/index.html`,root),'utf8')])));
const tabs=await(await fetch('http://127.0.0.1:9226/json/list')).json();
const ws=new WebSocket((tabs.find(t=>t.url.startsWith('http://127.0.0.1:4173/')) || tabs.find(t=>t.type==='page' && !t.url.startsWith('edge:'))).webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let seq=0;const pending=new Map(),errors=[],requests=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
ws.onmessage=async e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(new Error(m.error.message)):p?.resolve(m.result);return;}
  if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);
  if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);
  if(m.method==='Fetch.requestPaused'){
    const {requestId,request}=m.params;let data;
    if(request.url.includes('/git/trees/'))data={truncated:false,tree:seed.map(l=>({type:'blob',path:`${l.slug}/index.html`}))};
    else {const slug=new URL(request.url).pathname.split('/contents/')[1].split('/')[0];data={sha:slug,content:Buffer.from(originals.get(slug)).toString('base64')};}
    await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'x-github-api-version'}],body:Buffer.from(JSON.stringify(data)).toString('base64')});
  }
};
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function waitFor(expression){for(let i=0;i<200;i++){if(await ev(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error(`Timeout: ${expression}`);}
async function click(id){await ev(`document.getElementById(${JSON.stringify(id)}).click()`);}
async function fill(id,value,event='input'){await ev(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}))`);}
async function ready(){await waitFor(`!!document.querySelector('#qr-preview svg') && !document.getElementById('qr-download').disabled`);}
const downloadDir=new URL(`.qa/qr-downloads-${Date.now()}/`,root);await mkdir(downloadDir,{recursive:true});
const report=[];
let exportCount=0;
async function decode(dataURL){return ev(`(async()=>{const img=new Image();img.src=${JSON.stringify(dataURL)};await img.decode();const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);const p=ctx.getImageData(0,0,canvas.width,canvas.height);let url=jsQR(p.data,p.width,p.height)?.data;if(!url){try{const gray=Uint8ClampedArray.from({length:p.width*p.height},(_,i)=>(p.data[i*4]+2*p.data[i*4+1]+p.data[i*4+2])/4);const source=new ZXing.RGBLuminanceSource(gray,p.width,p.height);const bitmap=new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));url=new ZXing.QRCodeReader().decode(bitmap).getText()}catch{}}return {width:canvas.width,height:canvas.height,url}})()`);}
async function exportFile(format,size=1024,expected='https://ksrtlink.github.io/atk/women-in-intelligence/'){
  const dir=new URL(`export-${++exportCount}/`,downloadDir);await mkdir(dir,{recursive:true});
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:fileURLToPath(dir)});
  await fill('qr-format',format,'change');await fill('qr-size',String(size),'change');
  await click('qr-download');await waitFor(`document.getElementById('qr-quality').textContent.includes('exported at')`);
  const extension=format==='jpeg'?'jpg':format;
  const file=new URL(`women-in-intelligence-qr.${extension}`,dir);
  let buffer;
  for(let i=0;i<100;i++){try{buffer=await readFile(file);break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(buffer?.length>100,format);
  if(format==='png')assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  if(format==='jpeg')assert.equal(buffer.subarray(0,3).toString('hex'),'ffd8ff');
  if(format==='svg')assert.ok(buffer.toString().includes('<svg'));
  const mime={svg:'image/svg+xml',png:'image/png',jpeg:'image/jpeg'}[format];
  const scan=await decode(`data:${mime};base64,${buffer.toString('base64')}`);
  assert.equal(scan.url,expected,await ev(`JSON.stringify([...document.querySelectorAll('#qr-dialog input[type=radio]:checked')].map(e=>e.value))`));assert.equal(scan.width,size);assert.equal(scan.height,size);
  report.push(`${extension.toUpperCase()} download: ${size} × ${size}, decoded exact URL`);
}
try{
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Fetch.enable',{patterns:[{urlPattern:'https://api.github.com/*'}]});
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:fileURLToPath(downloadDir)});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/manage/'});
  await waitFor(`document.querySelectorAll('.link-row').length===8`);
  assert.equal(requests.some(r=>r.includes('qr-code-styling')),false);
  await ev(`document.querySelector('.link-row:last-child .qr-button').click()`);
  await ready();
  assert.equal(await ev(`document.getElementById('qr-url').value`),'https://ksrtlink.github.io/atk/women-in-intelligence/');
  assert.equal(await ev(`document.getElementById('connection-label').textContent`),'Connect GitHub');
  report.push('QR action preselects exact short link without GitHub authentication; renderer lazy-loaded');
  await ev(`new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='../.qa/jsQR.js';s.onload=resolve;s.onerror=reject;document.head.append(s)})`);
  await ev(`new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='../.qa/zxing.js';s.onload=resolve;s.onerror=reject;document.head.append(s)})`);
  await exportFile('svg');await exportFile('png');await exportFile('jpeg');
  const dots=['square','dots','rounded','extra-rounded','classy','classy-rounded'];
  const borders=['square','extra-rounded'];const centers=['square','dot'];
  for(const dot of dots)for(const border of borders)for(const center of centers){
    await ev(`document.querySelector('[name=qr-dots][value="${dot}"]').click();document.querySelector('[name=qr-border][value="${border}"]').click();document.querySelector('[name=qr-center][value="${center}"]').click()`);
    await ready();
    await exportFile('png');
  }
  report.push('All 24 combinations of six dot shapes, two corner-border shapes, and two center shapes decoded');
  await click('qr-reset');await ready();
  for(const link of seed){await fill('qr-saved',`https://ksrtlink.github.io/atk/${link.slug}/`,'change');await ready();const svg=await ev(`btoa(new XMLSerializer().serializeToString(document.querySelector('#qr-preview svg')))`);const scan=await decode(`data:image/svg+xml;base64,${svg}`);assert.equal(scan.url,`https://ksrtlink.github.io/atk/${link.slug}/`);}
  report.push('All eight library links decoded to their exact GitHub Pages paths');
  await fill('qr-url','javascript:alert(1)');await waitFor(`!document.getElementById('qr-error').classList.contains('hidden')`);
  assert.equal(await ev(`document.getElementById('qr-download').disabled`),true);
  assert.equal(await ev(`document.querySelector('#qr-preview svg')===null`),true);
  await fill('qr-url','https://ksrtlink.github.io/atk/women-in-intelligence/');await ready();
  await ev(`document.querySelector('.swatch-pink').click()`);
  await waitFor(`document.getElementById('qr-quality').textContent.includes('too light')`);
  assert.equal(await ev(`document.getElementById('qr-download').disabled`),true);
  await click('qr-reset');await ready();
  report.push('Invalid URLs clear preview; low-contrast colors block export; reset restores safe defaults');
  await ev(`document.querySelector('.swatch-purple').click()`);await ready();
  await fill('qr-format','svg','change');await fill('qr-size','2048','change');
  // Use a fresh directory so the second SVG export cannot read the previous file.
  const largeDir=new URL('large/',downloadDir);await mkdir(largeDir,{recursive:true});
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:fileURLToPath(largeDir)});
  await click('qr-download');await waitFor(`document.getElementById('qr-quality').textContent.includes('2048')`);
  let large;
  for(let i=0;i<100;i++){try{large=await readFile(new URL('women-in-intelligence-qr.svg',largeDir));break;}catch{await new Promise(r=>setTimeout(r,100));}}
  const scan=await decode(`data:image/svg+xml;base64,${large.toString('base64')}`);assert.equal(scan.width,2048);assert.equal(scan.url,'https://ksrtlink.github.io/atk/women-in-intelligence/');
  report.push('Brand-purple SVG export at 2048 px decoded');
  for(const [name,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<650});
    assert.equal(await ev(`document.getElementById('qr-dialog').scrollWidth<=document.getElementById('qr-dialog').clientWidth`),true,name);
    const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(new URL(`.qa/qr-${name}.png`,root),Buffer.from(shot.data,'base64'));
  }
  await click('qr-close');assert.equal(await ev(`document.getElementById('qr-dialog').open`),false);
  await click('open-qr');await ready();
  report.push('Desktop/mobile layout, close, and reopen passed');
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(r=>r.startsWith('http://127.0.0.1:4173/') || r.startsWith('https://api.github.com/') || r.startsWith('data:') || r.startsWith('blob:')),JSON.stringify(requests));
  report.push('No JavaScript exceptions or external QR service requests');
  console.log(JSON.stringify({passed:report,downloads:fileURLToPath(downloadDir)},null,2));
}finally{ws.close();}

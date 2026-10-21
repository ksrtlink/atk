import { writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

// A disposable page isolates WebGL fault injection from all other QA suites.
const target = await (await fetch("http://127.0.0.1:9226/json/new?about:blank",{method:"PUT"})).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
let verifiedCharlie=false;
const pending = new Map(),
  errors = [];
export const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const tokens = {};
ws.onmessage = async (event) => {
  const m = JSON.parse(event.data);
  if (m.id) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p?.reject(Error(m.error.message)) : p?.resolve(m.result);
    return;
  }
  if (m.method === "Runtime.exceptionThrown")
    errors.push(m.params.exceptionDetails);
  if (m.method === "Fetch.requestPaused") {
    const { requestId, request } = m.params;
    let result = {};
    const body = request.postData?.startsWith("{")
      ? JSON.parse(request.postData)
      : {};
    if (
      request.method !== "OPTIONS" &&
      (request.url.includes("signInWithPassword") ||
        request.url.includes("signUp"))
    )
      result = tokens[body.email.split("@")[0]] || {error:{message:"INVALID_LOGIN_CREDENTIALS"}};
    else if (request.url.includes("/token")) {
      const id = new URLSearchParams(request.postData)
        .get("refresh_token")
        .replace("-refresh", "");
      const t = tokens[id === "charlie" && verifiedCharlie ? "charlieVerified" : id];
      result = {
        id_token: t.idToken,
        refresh_token: t.refreshToken,
        user_id: t.localId,
        expires_in: t.expiresIn,
      };
    }
    await send("Fetch.fulfillRequest", {
      requestId,
      responseCode: result?.error ? 400 : 200,
      responseHeaders: [
        { name: "Content-Type", value: "application/json" },
        { name: "Access-Control-Allow-Origin", value: "*" },
        { name: "Access-Control-Allow-Headers", value: "content-type" },
      ],
      body: Buffer.from(JSON.stringify(result)).toString("base64"),
    });
  }
};
export async function ev(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
export async function wait(expression) {
  for (let i = 0; i < 150; i++) {
    if (await ev(expression)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(
    "Timeout " +
      expression +
      "\n" +
      (await ev("document.body.innerText.slice(-1800)")),
  );
}
export const click = async (id) => {
  await send("Page.bringToFront");
  return ev(`document.getElementById(${JSON.stringify(id)}).click()`);
};
export const fill = (id, value) =>
  ev(
    `document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('input',{bubbles:true}))`,
  );
export async function shot(name, width = 1440, height = 1000) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 650,
  });
  await ev("document.fonts.ready");
  await ev("Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))");
  assert.equal(
    await ev("document.documentElement.scrollWidth<=innerWidth"),
    true,
    name + " overflow",
  );
  const r = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await mkdir(new URL("../../.qa/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../../.qa/" + name + ".png", import.meta.url),
    Buffer.from(r.data, "base64"),
  );
}

try {
 const base=process.env.BASE_URL||'http://127.0.0.1:4174';await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__csp=[];document.addEventListener('securitypolicyviolation',e=>__csp.push({directive:e.violatedDirective,blocked:e.blockedURI}));"});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/'});await wait("!!document.querySelector('.hero-motion-toggle')");await ev("sessionStorage.clear();localStorage.removeItem('tinytrail.hero-motion-paused');tinytrailAppearance.set('light')");await send('Page.reload',{ignoreCache:true});await wait("document.querySelector('.hero-headline')?.dataset.techReady==='true'");
 assert.equal(await ev("document.querySelectorAll('h1').length"),1);assert.deepEqual(await ev("[...document.querySelectorAll('.hero-title-fallback')].map(e=>e.textContent)"),['Share more.','Keep it simple.']);assert.equal(await ev("document.querySelector('[data-hero-tech]').getAttribute('aria-hidden')"),'true');const ax=await send('Accessibility.getFullAXTree');assert.ok(ax.nodes.some(n=>n.role?.value==='heading'&&n.name?.value==='Share more. Keep it simple.'));

 const painted="[...document.querySelectorAll('.hero-tech-line canvas')].every(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return d.some((v,i)=>i%4===3&&v>0)})";assert.ok(await ev(painted));assert.equal(await ev("document.querySelectorAll('.hero-tech-line canvas').length"),2);
 await shot('tech-text-light',1440,1000);await ev("tinytrailAppearance.set('dark')");await wait("document.querySelector('.hero-headline')?.dataset.techReady==='true'");await shot('tech-text-dark',1440,1000);
 const before=await ev("document.querySelector('.hero-tech-line canvas').toDataURL()");const box=await ev("(()=>{const r=document.querySelector('.hero-title-fallback').getBoundingClientRect();return {x:r.x+r.width*.55,y:r.y+r.height*.6}})()");await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x,y:box.y});await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:box.x,y:box.y});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:box.x,y:box.y});await wait(`document.querySelector('.hero-tech-line canvas').toDataURL()!==${JSON.stringify(before)}`);
 await ev("document.querySelector('.hero-motion-toggle').click()");await wait("!document.querySelector('.hero-tech-line canvas') && !document.querySelector('.hero-distortion canvas')");assert.equal(await ev("getComputedStyle(document.querySelector('.hero-title-fallback')).opacity"),'1');await ev("document.querySelector('.hero-motion-toggle').click()");await wait("document.querySelector('.hero-headline')?.dataset.techReady==='true'");
 for(const [width,height,label]of [[768,1024,'tablet'],[390,844,'mobile'],[320,740,'small']]){await shot('tech-text-'+label,width,height);await wait("document.querySelector('.hero-headline')?.dataset.techReady==='true'");assert.ok(await ev(painted));assert.ok(await ev("[...document.querySelectorAll('.hero-tech-line')].every(e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth+2&&r.height>20})"));}
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait("!document.querySelector('.hero-tech-line canvas')");assert.equal(await ev("getComputedStyle(document.querySelector('.hero-title-fallback')).opacity"),'1');await send('Emulation.setEmulatedMedia',{features:[]});await wait("document.querySelector('.hero-headline')?.dataset.techReady==='true'");await ev("document.querySelector('.closing').scrollIntoView()");await wait("!document.querySelector('.hero-tech-line canvas')");await ev('scrollTo(0,0)');await wait("document.querySelector('.hero-headline')?.dataset.techReady==='true'");assert.deepEqual(await ev('__csp'),[]);
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='2d'?null:get.call(this,type,...args)};"});await send('Page.reload',{ignoreCache:true});await wait("!!document.querySelector('.hero-title-fallback') && !!document.querySelector('.hero-motion-toggle')");assert.equal(await ev("document.querySelector('.hero-headline').dataset.techReady"),undefined);assert.equal(await ev("getComputedStyle(document.querySelector('.hero-title-fallback')).opacity"),'1');
 assert.deepEqual(await ev('__csp'),[]);assert.deepEqual(errors,[]);console.log(base+' TechText checks passed: real canvas text, hover/click changes, semantic heading, theme colors, pause/reduced-motion/offscreen and unavailable-2D fallbacks, responsive 1440/768/390/320 layouts and strict CSP.');
}finally{ws.close();await fetch('http://127.0.0.1:9226/json/close/'+target.id);}

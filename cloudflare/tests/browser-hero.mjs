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
 const base=process.env.BASE_URL||'http://127.0.0.1:4174';
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});errors.length=0;
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__csp=[];window.__heroFrames=0;window.__heroErrors=[];document.addEventListener('securitypolicyviolation',e=>__csp.push({directive:e.violatedDirective,blocked:e.blockedURI}));if(window.WebGL2RenderingContext){const original=WebGL2RenderingContext.prototype.drawArrays;WebGL2RenderingContext.prototype.drawArrays=function(...args){original.apply(this,args);if(this.canvas.closest('.hero-distortion')){window.__heroFrames++;const error=this.getError();if(error)__heroErrors.push(error);if(window.__sampleHero){const pixels=new Uint8Array(16*16*4);this.readPixels(Math.max(0,Math.floor(this.canvas.width*.75)-8),Math.max(0,Math.floor(this.canvas.height*.5)-8),16,16,this.RGBA,this.UNSIGNED_BYTE,pixels);window.__heroSample=Array.from(pixels);window.__sampleHero=false;}}};}`});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/'});await wait("!!document.querySelector('.hero-motion-toggle')");await ev("sessionStorage.clear();localStorage.removeItem('tinytrail.hero-motion-paused');tinytrailAppearance.set('light')");await send('Page.reload',{ignoreCache:true});await wait("window.__heroFrames>5 && !!document.querySelector('.hero-motion-toggle')");
 assert.equal(await ev("document.querySelector('.hero-distortion').getAttribute('data-motion-image')"),'/hero-grid-light.webp');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 assert.equal(await ev("Math.round(document.querySelector('.hero-art').getBoundingClientRect().width)===Math.round(document.querySelector('.product-hero').getBoundingClientRect().width)"),true);
 await ev('window.__sampleHero=true');await wait('!!window.__heroSample');assert.ok(await ev('__heroSample.some((v,i)=>i%4!==3&&v>20)'));
 const frames=await ev('__heroFrames');await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1040,y:320});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1150,y:400});await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:1150,y:400});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:1150,y:400});await wait(`__heroFrames>${frames+3}`);
 assert.deepEqual(await ev('__heroErrors'),[]);assert.deepEqual(await ev('__csp'),[]);await ev("document.querySelector('.hero-motion-toggle').click()");await wait("!document.querySelector('.hero-distortion canvas')");assert.equal(await ev("document.querySelector('.hero-motion-toggle').getAttribute('aria-pressed')"),'true');await shot('grid-hero-light',1440,1000);
 await send('Page.reload',{ignoreCache:true});await wait("!!document.querySelector('.hero-motion-toggle')");assert.equal(await ev("!!document.querySelector('.hero-distortion canvas')"),false);assert.equal(await ev("document.querySelector('.hero-motion-toggle').textContent.trim()"),'Play motion');
 await ev("tinytrailAppearance.set('dark');document.querySelector('.hero-motion-toggle').click()");await wait("document.querySelector('.hero-distortion')?.getAttribute('data-motion-image')==='/hero-grid-dark.webp' && window.__heroFrames>3");await ev("document.querySelector('.hero-motion-toggle').click()");await shot('grid-hero-dark',1440,1000);
 for(const [w,h,label]of [[768,1024,'tablet'],[390,844,'mobile'],[320,740,'small']]){await shot('grid-hero-'+label,w,h);assert.ok(await ev("document.querySelector('.hero-art').getBoundingClientRect().height>200"));}
 await ev("document.querySelector('.hero-motion-toggle').click()");await wait("document.querySelector('.hero-distortion')?.getAttribute('data-motion-image')==='/landing-hero-dark.webp' && !!document.querySelector('.hero-distortion canvas')");
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait("!document.querySelector('.hero-distortion canvas') && !document.querySelector('.hero-motion-toggle')");assert.equal(await ev("getComputedStyle(document.querySelector('.hero-copy h1')).animationName"),'none');assert.ok(await ev("document.querySelector('.hero-art img').naturalWidth>0"));
 await send('Emulation.setEmulatedMedia',{features:[]});await wait("!!document.querySelector('.hero-distortion canvas')");await ev('document.querySelector(".closing").scrollIntoView()');await wait("!document.querySelector('.hero-distortion canvas')");await ev('scrollTo(0,0)');await wait("!!document.querySelector('.hero-distortion canvas')");
 assert.deepEqual(await ev('__csp'),[]);assert.deepEqual(await ev('__heroErrors'),[]);
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args)};"});await send('Page.reload',{ignoreCache:true});await wait("!!document.querySelector('.hero-motion-toggle') && document.querySelector('.hero-art img').complete");assert.ok(await ev("document.querySelector('.hero-art img').naturalWidth>0"));
 await ev("document.querySelector('.hero-actions .text-link').click()");assert.equal(await ev('location.hash'),'#quick-tools');await click('hero-qr-tab');await fill('hero-url','https://example.com/hero-motion');await ev("document.getElementById('hero-create-form').requestSubmit()");await wait("location.pathname==='/signin/' && !!document.getElementById('signin-submit')");assert.equal(await ev("JSON.parse(sessionStorage.getItem('tinytrail.create-draft')).tool"),'qr');assert.equal(await ev("!!document.querySelector('[data-hero-motion]')"),false);
 assert.deepEqual(await ev('__csp'),[]);assert.deepEqual(await ev('__heroErrors'),[]);assert.deepEqual(errors,[]);console.log(base+' hero checks passed: real WebGL rendering/pointer/ripple, seamless width, pause persistence, both images, 1440/768/390/320 layouts, live reduced-motion/offscreen fallbacks, unavailable GPU, CSP and QR draft handoff.');
}finally{ws.close();await fetch('http://127.0.0.1:9226/json/close/'+target.id);}

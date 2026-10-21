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

async function viewportShot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(new URL('../../.qa/'+name+'.png',import.meta.url),Buffer.from(r.data,'base64'));}
try {
 const base=process.env.BASE_URL||'http://127.0.0.1:4174';await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__csp=[];document.addEventListener('securitypolicyviolation',e=>__csp.push({directive:e.violatedDirective,blocked:e.blockedURI}));"});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base+'/'});await wait("!!document.querySelector('[data-sharing-expand]') && !!document.querySelector('.hero-motion-toggle')");await ev("localStorage.removeItem('tinytrail.hero-motion-paused');tinytrailAppearance.set('light')");await send('Page.reload',{ignoreCache:true});await wait("document.querySelector('.sharing-story')?.dataset.expandReady==='true' && document.querySelector('.sharing-expand-scroll img').complete");
 const track=await ev("document.querySelector('.sharing-expand-scroll>div').getBoundingClientRect().top+scrollY");await ev(`scrollTo(0,${track})`);await wait("parseFloat(document.querySelector('.sharing-expand-scroll>div>div>div').style.clipPath.match(/[0-9.]+/)[0])>14.9");await viewportShot('scroll-expand-start');
 await ev(`scrollTo(0,${track+900*.325})`);await wait("Math.abs(parseFloat(document.querySelector('.sharing-expand-scroll>div>div>div').style.clipPath.match(/[0-9.]+/)[0])-7.5)<.4");assert.ok(await ev("Math.abs(document.querySelector('.sharing-expand-scroll>div>div').getBoundingClientRect().top)<2"));await viewportShot('scroll-expand-mid');
 await ev(`scrollTo(0,${track+900*.7})`);await wait("document.querySelector('.sharing-expand-scroll>div>div>div').style.clipPath.startsWith('inset(0%')");assert.equal(await ev("document.querySelector('.sharing-expand-caption').parentElement.style.opacity"),'1');assert.equal(await ev("getComputedStyle(document.querySelector('.sharing-expand-scroll img')).transform"),'matrix(1, 0, 0, 1, 0, 0)');await viewportShot('scroll-expand-end');
 await ev("tinytrailAppearance.set('dark')");await wait("document.querySelector('.sharing-expand-scroll img').src.endsWith('/sharing-art-dark.webp') && document.querySelector('.sharing-expand-scroll img').complete");await viewportShot('scroll-expand-dark');assert.ok(await ev("document.documentElement.scrollWidth<=innerWidth"));
 const ax=await send('Accessibility.getFullAXTree');assert.equal(ax.nodes.filter(n=>n.role?.value==='heading'&&n.name?.value==='Everything you share. A little more you.').length,1);
 await ev('scrollTo(0,0)');await ev("document.querySelector('.hero-motion-toggle').click()");await wait("!document.querySelector('.sharing-expand-scroll') && !document.querySelector('.sharing-story').dataset.expandReady");assert.equal(await ev("getComputedStyle(document.querySelector('.sharing-static')).display"),'contents');await ev("document.querySelector('.hero-motion-toggle').click()");await wait("!!document.querySelector('.sharing-expand-scroll')");
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await wait("!document.querySelector('.sharing-expand-scroll')");assert.equal(await ev("!!document.getElementById('sharing-heading')"),true);await send('Emulation.setEmulatedMedia',{features:[]});await wait("!!document.querySelector('.sharing-expand-scroll')");
 for(const [width,height,label]of [[768,1024,'tablet'],[390,844,'mobile'],[320,740,'small'],[1024,480,'short-landscape']]){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<650});await wait("!document.querySelector('.sharing-expand-scroll')");await ev("document.querySelector('.sharing-story').scrollIntoView()");assert.ok(await ev("document.documentElement.scrollWidth<=innerWidth"));assert.ok(await ev("document.getElementById('sharing-heading').getBoundingClientRect().width>100"));await viewportShot('scroll-expand-'+label);}
 await ev("document.querySelector('a[href=\"#questions\"]').click()");assert.equal(await ev('location.hash'),'#questions');assert.deepEqual(await ev('__csp'),[]);assert.deepEqual(errors,[]);console.log(base+' ScrollExpand checks passed: actual start/mid/full scroll geometry, sticky stage, media zoom, overlay, light/dark art, accessible original heading, global pause, live reduced motion, mobile/tablet fallback, anchors and strict CSP.');
}finally{ws.close();await fetch('http://127.0.0.1:9226/json/close/'+target.id);}

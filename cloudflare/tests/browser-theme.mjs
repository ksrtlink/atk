import { writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import jsQR from "jsqr";
import {PNG} from "pngjs";
import { unzipSync, strFromU8 } from "fflate";
await fetch("http://127.0.0.1:4174/qa/reset", { method: "POST" });
const tabs = await (await fetch("http://127.0.0.1:9226/json/list")).json(),
  target = tabs.find((t) => t.type === "page" && !t.url.startsWith("edge:"));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map(),
  errors = [];
export const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const tokens = await (await fetch("http://127.0.0.1:4174/qa/tokens")).json();
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
      result = tokens[body.email.split("@")[0]];
    else if (request.url.includes("/token")) {
      const id = new URLSearchParams(request.postData)
        .get("refresh_token")
        .replace("-refresh", "");
      const t = tokens[id];
      result = {
        id_token: t.idToken,
        refresh_token: t.refreshToken,
        user_id: t.localId,
        expires_in: t.expiresIn,
      };
    }
    await send("Fetch.fulfillRequest", {
      requestId,
      responseCode: 200,
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
export async function login(id) {
  await send('Page.navigate',{url:'http://127.0.0.1:4174/signin/?next='+encodeURIComponent('/manage/')});
  await wait("document.getElementById('signin-submit') && !document.getElementById('signin-submit').disabled");
  await fill('signin-email',id+'@example.com');await fill('signin-password','password-test');
  await ev("document.getElementById('signin-form').requestSubmit()");
  await wait("location.pathname==='/manage/' && document.getElementById('account-top') && document.body && !document.body.classList.contains('auth-pending')");
}
export async function logout() {await click('account-top');await click('auth-signout');await wait("location.pathname==='/' && document.getElementById('home-signin') && !document.getElementById('home-signin').hidden");}
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
 await send('Page.enable');await send('Runtime.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__csp=[];document.addEventListener('securitypolicyviolation',e=>__csp.push({directive:e.violatedDirective,blocked:e.blockedURI}));"});await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Fetch.enable',{patterns:[{urlPattern:'https://identitytoolkit.googleapis.com/*'},{urlPattern:'https://securetoken.googleapis.com/*'}]});
 errors.length=0; // Ignore exceptions replayed from the previous QA document on Runtime.enable.
 await send('Page.navigate',{url:'http://127.0.0.1:4174/'});await wait("!!document.querySelector('[data-appearance-root] button')");await ev("sessionStorage.clear();localStorage.removeItem('tinytrail.appearance')");
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});await send('Page.reload',{ignoreCache:true});await wait("document.documentElement.dataset.mode==='dark' && !!document.querySelector('[data-appearance-root] button')");assert.equal(await ev("tinytrailAppearance.get().preference"),'system');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});await wait("document.documentElement.dataset.mode==='light'");
 await ev("document.querySelector('[data-appearance-root] button').click()");await wait("document.querySelectorAll('[role=option]').length===3");assert.deepEqual(await ev("[...document.querySelectorAll('[role=option]')].map(e=>e.textContent.trim())"),['System','Light','Dark']);await ev("[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.trim()==='Dark').click()");await wait("document.documentElement.dataset.mode==='dark' && document.querySelector('[data-appearance-root]').textContent==='Dark'");assert.equal(await ev("localStorage.getItem('tinytrail.appearance')"),'dark');
 assert.deepEqual(await ev('__csp'),[]);await send('Page.reload',{ignoreCache:true});await wait("document.documentElement.dataset.mode==='dark' && !!document.querySelector('[data-appearance-root] button')");assert.equal(await ev("getComputedStyle(document.body).color"),'oklch(0.97 0 none)');
 for(const [width,height,name] of [[1440,1000,'theme-dark-home'],[768,1024,'theme-dark-tablet'],[390,844,'theme-dark-mobile'],[320,740,'theme-dark-small']])await shot(name,width,height);
 await ev("document.querySelector('[data-appearance-root] button').focus()");await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});await wait("document.querySelectorAll('[role=option]').length===3");await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await wait("document.querySelector('[data-appearance-root] button').getAttribute('aria-expanded')==='false'");assert.equal(await ev("!!document.activeElement.closest('[data-appearance-root]')"),true);
 await send('Page.navigate',{url:'http://127.0.0.1:4174/signin/'});await wait("!!document.querySelector('[data-appearance-root] button')");assert.equal(await ev("document.documentElement.dataset.mode"),'dark');await shot('theme-dark-signin',1440,1000);await shot('theme-dark-signin-mobile',320,740);
 await login('alice');await wait("!!document.querySelector('[data-appearance-root] button')");assert.equal(await ev("document.documentElement.dataset.mode"),'dark');await shot('theme-dark-dashboard',1440,1000);await shot('theme-dark-dashboard-mobile',390,844);
 await ev("(async()=>{const {openQRBuilder}=await import('/manage/qr-builder.mjs');await openQRBuilder({url:'https://example.com/dark-qr',trackingAvailable:false});})()");await wait("document.getElementById('qr-dialog')?.open && !document.getElementById('qr-download').disabled");assert.equal(await ev("getComputedStyle(document.querySelector('.qr-board')).backgroundColor"),'rgb(255, 255, 255)');assert.equal(await ev("getComputedStyle(document.querySelector('.qr-preview-panel')).backgroundImage"),'none');assert.equal(await ev("getComputedStyle(document.querySelector('.qr-tabs [aria-selected=true]')).backgroundColor"),'oklch(0.269 0 0)');assert.ok(await ev("Math.abs(document.getElementById('qr-dialog').getBoundingClientRect().x-(innerWidth-document.getElementById('qr-dialog').getBoundingClientRect().width)/2)<2"));await shot('theme-dark-qr',1440,1000);await shot('theme-dark-qr-mobile',390,844);await click('qr-close');
 await ev("tinytrailAppearance.set('light')");await shot('theme-light-dashboard',1440,1000);await ev("tinytrailAppearance.set('invalid')");assert.equal(await ev("tinytrailAppearance.get().preference"),'light');await ev("tinytrailAppearance.set('system')");await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});await wait("document.documentElement.dataset.mode==='dark'");await ev("dispatchEvent(new StorageEvent('storage',{key:'tinytrail.appearance',newValue:'light'}))");assert.equal(await ev("document.documentElement.dataset.mode"),'light');await ev("tinytrailAppearance.set('light')");await send('Emulation.setEmulatedMedia',{features:[]});
 assert.deepEqual(await ev('__csp'),[]);assert.deepEqual(errors,[]);console.log('Kumo theme checks passed: OS preference, menu selection/keyboard, persistence, cross-tab sync, invalid values, all routes, 320/390/768/1440 layouts, and white QR artwork.');
}finally{await send('Fetch.disable');ws.close();}

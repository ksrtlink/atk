import { writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
await fetch("http://127.0.0.1:4174/qa/reset", { method: "POST" });
const tabs = await (await fetch("http://127.0.0.1:9226/json/list")).json(),
  target = tabs.find((t) => t.type === "page" && !t.url.startsWith("edge:"));
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
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Fetch.enable',{patterns:[{urlPattern:'https://identitytoolkit.googleapis.com/*'},{urlPattern:'https://securetoken.googleapis.com/*'}]});
 await send('Page.navigate',{url:'http://127.0.0.1:4174/'});await wait("document.getElementById('home-signin')");await ev("sessionStorage.clear()");
 await send('Page.navigate',{url:'http://127.0.0.1:4174/manage/?create=1#invite=qa-opaque'});
 await wait("location.pathname==='/signin/' && document.getElementById('signin-submit') && !document.getElementById('signin-submit').disabled");
 assert.equal(await ev("new URLSearchParams(location.search).get('next')"),'/manage/?create=1#invite=qa-opaque');assert.equal(await ev("!!document.querySelector('.sidebar')"),false);
 await send('Page.navigate',{url:'http://127.0.0.1:4174/signin/'});await wait("document.getElementById('signin-submit') && !document.getElementById('signin-submit').disabled");
 await shot('signin-desktop',1440,1000);assert.equal(await ev("Math.round(document.querySelector('.signin-visual').getBoundingClientRect().width)"),720);
 await shot('signin-mobile',390,844);await shot('signin-small-mobile',320,740);
 await fill('signin-email','unknown@example.com');await fill('signin-password','bad-password');await ev("document.getElementById('signin-form').requestSubmit()");await wait("!document.getElementById('signin-error').hidden");assert.match(await ev("document.getElementById('signin-error').textContent"),/Check your email/);assert.equal(await ev("document.getElementById('signin-password').value"),'');
 await fill('signin-email','alice@example.com');await click('signin-reset');await wait("!document.getElementById('signin-message').hidden");assert.match(await ev("document.getElementById('signin-message').textContent"),/If this account exists/);
 await fill('signin-password','password-test');await click('signin-show');assert.equal(await ev("document.getElementById('signin-password').type"),'text');await ev("document.getElementById('signin-form').requestSubmit()");
 await wait("location.pathname==='/' && !document.getElementById('home-account')?.hidden && document.getElementById('home-account-summary').textContent==='Signed in'");
 assert.equal(await ev("document.querySelector('[data-home-logo]').getAttribute('href')"),'/manage/');assert.equal(await ev("document.getElementById('home-account-email').textContent"),'alice@example.com');assert.equal(await ev("document.getElementById('home-signin').hidden"),true);
 await shot('landing-signedin-mobile',390,844);await shot('landing-signedin-desktop',1440,1000);
 await ev("document.querySelector('[data-home-logo]').click()");await wait("location.pathname==='/manage/' && !document.body.classList.contains('auth-pending')");
 await ev("document.querySelector('[data-view=people]').click()");await wait("document.getElementById('people-new') && !document.getElementById('people-new').classList.contains('hidden')");await click('people-new');assert.equal(await ev("document.getElementById('people-more').open"),false);await shot('simplified-contact-editor');await fill('people-booking','not-a-url');assert.equal(await ev("document.getElementById('people-form').reportValidity()"),false);assert.equal(await ev("document.getElementById('people-more').open"),true);await fill('people-booking','');
 await ev("document.querySelector('[data-view=resources]').click()");await wait("document.getElementById('resource-new')");await click('resource-new');await shot('simplified-resource-editor');
 await ev("document.querySelector('.brand').click()");await wait("location.pathname==='/' && document.getElementById('home-account') && !document.getElementById('home-account').hidden && document.getElementById('home-account-summary').textContent==='Signed in'");await ev("document.getElementById('home-account').open=true");await click('home-signout');await wait("!document.getElementById('home-signin').hidden");await ev("history.back()");await wait("location.pathname==='/signin/' && document.getElementById('signin-form-panel') && !document.getElementById('signin-form-panel').hidden");assert.equal(await ev("!!document.querySelector('.sidebar')"),false);
 await send('Page.navigate',{url:'http://127.0.0.1:4174/signin/?mode=signup'});await wait("document.getElementById('signin-submit') && !document.getElementById('signin-submit').disabled");assert.equal(await ev("document.getElementById('signin-password').autocomplete"),'new-password');
 await fill('signin-email','charlie@example.com');await fill('signin-password','password-test');await ev("document.getElementById('signin-form').requestSubmit()");await wait("!document.getElementById('verification-actions').hidden");assert.equal(await ev("document.getElementById('signin-dashboard').hidden"),true);assert.equal(await ev("!!document.querySelector('.sidebar')"),false);await shot('signin-verification',1440,1000);
 await click('signin-resend');await wait("document.getElementById('signin-resend').disabled && !document.getElementById('signin-check').disabled");await click('signin-check');await wait("document.getElementById('signin-message').textContent.includes('not verified')");
 verifiedCharlie=true;await click('signin-check');await wait("location.pathname==='/' && document.getElementById('home-account') && !document.getElementById('home-account').hidden && document.getElementById('home-account-summary').textContent==='Signed in'");
 await send('Page.navigate',{url:'http://127.0.0.1:4174/signin/?next=https://evil.example/'});await wait("!document.getElementById('signin-session')?.hidden");assert.equal(await ev("document.getElementById('signin-dashboard').getAttribute('href')"),'/manage/');
 await click('signin-signout');await wait("!document.getElementById('signin-form-panel').hidden");
 assert.deepEqual(errors,[]);console.log('Sign-in browser checks passed: guest guard/no dashboard, safe invitation return, 50/50 desktop, mobile/320px, errors/reset/password toggle, verified homepage state/logo, dashboard sign-out, signup/verification/resend/check and open-redirect rejection.');
}finally{await send('Fetch.disable');ws.close();}

import { writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
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
export const click = (id) =>
  ev(`document.getElementById(${JSON.stringify(id)}).click()`);
export const fill = (id, value) =>
  ev(
    `document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('input',{bubbles:true}))`,
  );
export async function login(id) {
  await click("account-top");
  await click("auth-login-tab");
  await fill("auth-email", id + "@example.com");
  await fill("auth-password", "password-test");
  await ev("document.getElementById('auth-form').requestSubmit()");
  await wait("!document.getElementById('account-dialog').open");
}
export async function logout() {
  await click("account-top");
  await click("auth-signout");
}
export async function shot(name, width = 1440, height = 1000) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 650,
  });
  await ev("document.fonts.ready");
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
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: "sessionStorage.removeItem('link-studio.account')",
  });
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Fetch.enable", {
    patterns: [
      { urlPattern: "https://identitytoolkit.googleapis.com/*" },
      { urlPattern: "https://securetoken.googleapis.com/*" },
    ],
  });
  await send("Page.navigate", { url: "http://127.0.0.1:4174/" });
  await wait("document.getElementById('hero-create-form')");
  await wait("document.readyState === 'complete'");
  const theme = await ev("({accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),radius:getComputedStyle(document.documentElement).getPropertyValue('--radius').trim()})");
  assert.equal(await ev("getComputedStyle(document.querySelector('.primary')).backgroundColor"), "rgb(255, 94, 31)");
  await shot("landing-desktop");
  await shot("landing-mobile", 390, 844);
  await click("hero-qr-tab");
  assert.equal(await ev("document.getElementById('hero-qr-tab').getAttribute('aria-pressed')"),"true");
  await fill("hero-url","https://example.com/hero-draft");
  await ev("document.getElementById('hero-create-form').requestSubmit()");
  await wait("location.pathname==='/manage/' && document.getElementById('account-dialog')?.open");
  assert.equal(await ev("JSON.parse(sessionStorage.getItem('tinytrail.create-draft')).tool"),"qr");
  await wait(
    "document.getElementById('notice')?.textContent.includes('Sign in')",
  );
  assert.equal(await ev("document.getElementById('open-qr').disabled"), true);
  assert.equal(await ev("getComputedStyle(document.getElementById('company-switcher')).display"), "none");
  assert.equal(await ev("getComputedStyle(document.getElementById('assigned-company')).display"), "none");
  assert.equal(await ev("fetch('/manage/links.json').then(r=>r.status)"), 404);
  await login("alice");
  await wait("document.getElementById('qr-dialog')?.open");
  assert.equal(await ev("document.getElementById('qr-url').value"),"https://example.com/hero-draft");
  await click("qr-close");
  await send("Page.navigate", {url:"http://127.0.0.1:4174/"});
  await wait("document.readyState==='complete' && document.getElementById('hero-create-form')");
  await fill("hero-url","https://example.com/link-draft");
  await ev("document.getElementById('hero-create-form').requestSubmit()");
  await wait("location.pathname==='/manage/' && document.getElementById('account-dialog')?.open");
  await login("alice");
  await wait("document.getElementById('destination').value==='https://example.com/link-draft'");
  assert.equal(await ev("document.getElementById('list-count').textContent"),"0");
  assert.equal(await ev("sessionStorage.getItem('tinytrail.create-draft')"),null);
  await wait("document.getElementById('page-title').textContent.includes('personal')");
  assert.equal(await ev("document.getElementById('open-qr').disabled"),false);
  assert.equal(await ev("getComputedStyle(document.getElementById('company-switcher')).display"),"none");
  await fill("destination","https://example.com/personal");
  await fill("slug","my-private-browser-link");
  await ev("document.getElementById('link-form').requestSubmit()");
  await wait("document.getElementById('links').innerText.includes('my-private-browser-link')");
  await fill("destination","https://example.com/automatic-name");
  await fill("slug","");
  await ev("window.__nativeFetch=window.fetch;window.__dropLinkResponse=true;window.fetch=async(...args)=>{const response=await window.__nativeFetch(...args);if(window.__dropLinkResponse && String(args[0]).endsWith('/api/links') && args[1]?.method==='POST'){window.__dropLinkResponse=false;throw Error('Simulated lost create response');}return response;}");
  await ev("document.getElementById('link-form').requestSubmit()");
  await wait("document.getElementById('app-error').innerText.includes('Connection interrupted')");
  assert.match(await ev("document.getElementById('slug').value"),/^[a-f0-9]{8}$/);
  await ev("window.fetch=window.__nativeFetch;document.getElementById('link-form').requestSubmit()");
  await wait("document.getElementById('list-count').textContent==='2'");
  assert.match(await ev("[...document.querySelectorAll('.link-row')].find(row=>row.innerText.includes('automatic-name')).querySelector('.short-link').href"),/\/r\/[a-f0-9]{8}$/);

  await shot("personal-desktop",1440,1000);
  await shot("personal-mobile",390,844);
  await click("request-company");
  await fill("company-name", "Northstar Company");
  await fill("company-website", "https://example.com");
  await fill("company-use", "Reports and events");
  await ev("document.getElementById('access-form').requestSubmit()");
  await wait(
    "document.getElementById('notice').textContent.includes('pending')",
  );
  await logout();
  await login("admin");
  await ev("document.querySelector('[data-view=admin]').click()");
  await wait(
    "document.getElementById('admin-requests').innerText.includes('Northstar')",
  );
  await ev(
    "[...document.querySelectorAll('#admin-requests button')].find(b=>b.textContent==='Approve company').click()",
  );
  await wait(
    "document.getElementById('admin-requests').innerText.includes('approved')",
  );
  assert.equal(
    await ev("document.querySelectorAll('#admin-legacy .list-item').length"),
    8,
  );
  await logout();
  await login("alice");
  await wait(
    "document.getElementById('workspace-label').textContent==='Northstar Company'",
  );
  assert.equal(
    await ev(
      "document.getElementById('admin-nav').classList.contains('hidden')",
    ),
    true,
  );
  assert.equal(await ev("getComputedStyle(document.getElementById('company-switcher')).display"), "none");
  assert.equal(await ev("document.getElementById('assigned-company-name').textContent"), "Northstar Company");
  assert.equal(await ev("getComputedStyle(document.querySelector('.button.primary')).backgroundColor"), "rgb(255, 94, 31)");
  assert.deepEqual(await ev("({accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),radius:getComputedStyle(document.documentElement).getPropertyValue('--radius').trim()})"), theme);
  const forged = await ev(`fetch('/api/links',{headers:{Authorization:${JSON.stringify("Bearer " + tokens.alice.idToken)},'X-Workspace-Id':'tinytrail-internal'}}).then(r=>r.status)`);
  assert.equal(forged,403);
  await click("personal-open");
  await wait("document.getElementById('page-title').textContent.includes('personal') && document.getElementById('links').innerText.includes('my-private-browser-link')");
  await click("open-qr");
  await wait("document.getElementById('qr-dialog')?.open");
  await ev("document.getElementById('qr-mode').value='static';document.getElementById('qr-mode').dispatchEvent(new Event('change'))");
  await fill("qr-url","https://example.com/my-private-qr");
  await fill("qr-design-title","My private QR");
  await wait("!document.getElementById('qr-download').disabled");
  await click("qr-save-profile");
  await wait("document.getElementById('designs').innerText.includes('My private QR')");
  await click("qr-close");
  await click("company-open");
  await wait("document.getElementById('workspace-label').textContent==='Northstar Company'");
  assert.equal(await ev("document.getElementById('designs').innerText.includes('My private QR')"),false);


  await click("open-qr");
  await wait("document.getElementById('qr-dialog')?.open");
  await ev(
    "document.getElementById('qr-mode').value='static';document.getElementById('qr-mode').dispatchEvent(new Event('change'))",
  );
  await fill("qr-url", "https://example.com/direct");
  await wait("!document.getElementById('qr-download').disabled");
  await fill("qr-design-title", "Direct company QR");
  await click("qr-save-profile");
  await wait(
    "document.getElementById('designs').innerText.includes('Direct company QR')",
  );
  await shot("enterprise-qr", 1440, 1000);
  await click("qr-close");
  await ev("document.querySelector('[data-view=bulk]').click()");
  await wait("document.getElementById('batch-dots')");
  await fill(
    "bulk-input",
    "title,url,slug\nAnnual report,https://example.com/report,annual-report\nProduct guide,https://example.com/guide,product-guide",
  );
  await click("bulk-preview");
  await wait("!document.getElementById('bulk-create').disabled");
  await click("bulk-create");
  await wait(
    "document.getElementById('bulk-status').textContent.includes('2 created')",
  );
  await wait("!document.getElementById('bulk-zip').disabled");
  await shot("enterprise-bulk", 1440, 1000);
  const downloadDir = new URL(
    "../../.qa/enterprise-downloads-" + Date.now() + "/",
    import.meta.url,
  );
  await mkdir(downloadDir, { recursive: true });
  await send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: decodeURIComponent(
      downloadDir.pathname.replace(/^\/([A-Z]:)/, "$1"),
    ),
  });
  await ev(
    "window.__exports=[];const oldCreate=URL.createObjectURL;URL.createObjectURL=blob=>{window.__exports.push(blob);return oldCreate(blob)}",
  );
  await click("bulk-zip");
  await wait(
    "window.__exports.length===1 && !document.getElementById('bulk-zip').disabled",
  );
  await click("bulk-pdf");
  await wait(
    "window.__exports.length===2 && !document.getElementById('bulk-pdf').disabled",
  );
  assert.equal(
    await ev(
      "document.getElementById('app-error').classList.contains('hidden')",
    ),
    true,
    await ev("document.getElementById('app-error').textContent"),
  );
  for (const [i, name] of [
    [0, "tinytrail-qr-codes.zip"],
    [1, "tinytrail-print-sheets.pdf"],
  ]) {
    const base64 = await ev(
      `new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(window.__exports[${i}]);})`,
    );
    await writeFile(new URL(name, downloadDir), Buffer.from(base64, "base64"));
  }
  const zip = unzipSync(
    await readFile(new URL("tinytrail-qr-codes.zip", downloadDir)),
  );
  const manifest = JSON.parse(strFromU8(zip["manifest.json"]));
  assert.equal(manifest.length, 2);
  assert.equal(Object.keys(zip).length, 3);
  console.log(
    "Export files verified at " + decodeURIComponent(downloadDir.pathname),
  );

  await fill("bulk-mode", "qr");
  await fill("bulk-input", "https://example.com/report?regions=emea,apac");
  await click("bulk-preview");
  await wait("!document.getElementById('bulk-create').disabled");
  assert.equal(
    await ev(
      "document.querySelector('#bulk-preview-table input[aria-label=url]').value",
    ),
    "https://example.com/report?regions=emea,apac",
  );
  await ev("document.querySelector('[data-view=links]').click()");
  await shot("enterprise-desktop", 1440, 1000);
  await shot("enterprise-mobile", 390, 844);
  await logout();
  assert.equal(
    await ev("document.getElementById('links').childElementCount"),
    0,
  );
  assert.equal(await ev("document.getElementById('qr-url').value"), "");
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(
    JSON.stringify(
      {
        passed: [
          "landing desktop/mobile, link/QR handoff and automatic short names",
          "anonymous QR blocked and legacy JSON absent",
          "company request and admin approval",
          "admin-only original library",
          "direct QR saved without a short link",
          "bulk creates two links and designs",
          "ZIP and vector PDF exports triggered",
          "desktop/mobile workspace fits",
          "sign-out clears previous company and QR data",
        ],
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  ws.close();
}

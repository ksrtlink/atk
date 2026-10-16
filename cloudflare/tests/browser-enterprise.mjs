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
  await wait("document.getElementById('motion-toggle')");
  await shot("landing-desktop");
  await shot("landing-mobile", 390, 844);
  await click("motion-toggle");
  assert.equal(
    await ev("document.body.classList.contains('motion-paused')"),
    true,
  );
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  assert.equal(
    await ev(
      "getComputedStyle(document.querySelector('.source-box')).animationName",
    ),
    "none",
  );
  await send("Emulation.setEmulatedMedia", { features: [] });
  await send("Page.navigate", { url: "http://127.0.0.1:4174/manage/" });
  await wait(
    "document.getElementById('notice')?.textContent.includes('Sign in')",
  );
  assert.equal(await ev("document.getElementById('open-qr').disabled"), true);
  assert.equal(await ev("fetch('/manage/links.json').then(r=>r.status)"), 404);
  await login("alice");
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
          "landing desktop/mobile and pause/reduced motion",
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

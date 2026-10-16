import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import {
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
} from "@zxing/library";
const base = "http://127.0.0.1:4174";
await fetch(base + "/qa/reset", { method: "POST" });
const tokens = await (await fetch(base + "/qa/tokens")).json();
async function api(
  path,
  { user = "alice", wid, method = "GET", body, headers = {} } = {},
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      Authorization: "Bearer " + tokens[user].idToken,
      ...(wid ? { "X-Workspace-Id": wid } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      "User-Agent": "Mozilla/5.0 Chrome/140.0 Windows NT 10.0",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  return r;
}
async function data(path, options) {
  const r = await api(path, options);
  const b = await r.json();
  assert.ok(r.ok, JSON.stringify(b));
  return b;
}
await data("/api/access-requests", {
  method: "POST",
  body: {
    company: "Analytics company",
    website: "https://example.com",
    useCase: "Release 1 QA",
  },
});
const wid = (
  await data("/api/admin/requests/alice", {
    user: "admin",
    method: "POST",
    body: { action: "approve" },
  })
).workspaceId;
await data("/api/links", {
  wid,
  method: "POST",
  headers: { "Idempotency-Key": crypto.randomUUID() },
  body: { slug: "report", destination: "https://example.com/report" },
});
const tabs = await (await fetch("http://127.0.0.1:9226/json/list")).json(),
  target = tabs.find((t) => t.type === "page" && !t.url.startsWith("edge:"));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map(),
  errors = [];
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
ws.onmessage = async (event) => {
  const m = JSON.parse(event.data);
  if (m.id) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p?.reject(Error(m.error.message)) : p?.resolve(m.result);
    return;
  }
  if (m.method === "Runtime.exceptionThrown")
    errors.push(m.params.exceptionDetails.text);
  if (m.method !== "Fetch.requestPaused") return;
  const { requestId, request } = m.params;
  let value = {};
  if (request.method !== "OPTIONS") {
    if (request.url.includes("signInWithPassword")) value = tokens.alice;
    else if (request.url.includes("/token"))
      value = {
        id_token: tokens.alice.idToken,
        refresh_token: tokens.alice.refreshToken,
        user_id: "alice",
        expires_in: "3600",
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
    body: Buffer.from(JSON.stringify(value)).toString("base64"),
  });
};
async function ev(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function wait(expression) {
  for (let i = 0; i < 150; i++) {
    if (await ev(expression)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(
    "Timed out " +
      expression +
      "\n" +
      (await ev("document.body.innerText.slice(-2000)")),
  );
}
const click = (id) =>
    ev(`document.getElementById(${JSON.stringify(id)}).click()`),
  fill = (id, value) =>
    ev(
      `document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('input',{bubbles:true}))`,
    );
const dir = new URL("../../.qa/release1-browser/", import.meta.url);
await mkdir(dir, { recursive: true });
async function shot(name, width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 650,
  });
  assert.equal(
    await ev("document.documentElement.scrollWidth<=innerWidth"),
    true,
    name,
  );
  const r = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(new URL(name + ".png", dir), Buffer.from(r.data, "base64"));
}
function decode(bytes) {
  const png = PNG.sync.read(Buffer.from(bytes));
  let value = jsQR(
    new Uint8ClampedArray(png.data),
    png.width,
    png.height,
  )?.data;
  if (!value) {
    const gray = new Uint8ClampedArray(png.width * png.height);
    for (let i = 0; i < gray.length; i++)
      gray[i] =
        (png.data[i * 4] + 2 * png.data[i * 4 + 1] + png.data[i * 4 + 2]) / 4;
    value = new QRCodeReader()
      .decode(
        new BinaryBitmap(
          new HybridBinarizer(
            new RGBLuminanceSource(gray, png.width, png.height),
          ),
        ),
      )
      .getText();
  }
  return value;
}
async function blobBytes(index) {
  return Buffer.from(
    await ev(
      `new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(window.__exports[${index}]);})`,
    ),
    "base64",
  );
}
try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: "sessionStorage.removeItem('link-studio.account')",
  });
  await send("Fetch.enable", {
    patterns: [
      { urlPattern: "https://identitytoolkit.googleapis.com/*" },
      { urlPattern: "https://securetoken.googleapis.com/*" },
    ],
  });
  await send("Page.navigate", { url: base + "/manage/" });
  await wait(
    "document.getElementById('notice')?.textContent.includes('Sign in')",
  );
  await click("account-top");
  await fill("auth-email", "alice@example.com");
  await fill("auth-password", "password-test");
  await ev("document.getElementById('auth-form').requestSubmit()");
  await wait("!document.getElementById('account-dialog').open");
  await ev("document.querySelector('[data-view=analytics]').click()");
  await wait(
    "document.getElementById('analytics-total').textContent==='Not measured'",
  );
  await click("analytics-toggle");
  await wait("document.getElementById('analytics-total').textContent==='0'");
  await api("/r/report", { user: "alice" });
  await click("open-qr");
  await wait("document.getElementById('qr-dialog')?.open");
  assert.equal(await ev("document.getElementById('qr-mode').value"), "tracked");
  await fill("qr-url", base + "/r/report");
  await fill("qr-design-title", "Tracked report");
  await click("qr-prepare-tracking");
  await wait("!document.getElementById('qr-download').disabled");
  const encoded = await ev(
    "document.getElementById('qr-preview-url').textContent",
  );
  assert.match(encoded, /\/q\/[0-9a-f-]{36}$/);
  await ev("document.querySelector('[name=qr-dots][value=dots]').click()");
  await wait("!document.getElementById('qr-download').disabled");
  assert.equal(
    await ev("document.getElementById('qr-preview-url').textContent"),
    encoded,
  );
  await click("qr-save-profile");
  await wait(
    "document.getElementById('designs').innerText.includes('Tracked report')",
  );
  await ev(
    "window.__exports=[];const original=URL.createObjectURL;URL.createObjectURL=blob=>{window.__exports.push(blob);return original(blob)}",
  );
  await fill("qr-format", "png");
  await ev(
    "document.getElementById('qr-format').dispatchEvent(new Event('change'))",
  );
  await click("qr-download");
  await wait("window.__exports.length===1");
  assert.equal(decode(await blobBytes(0)), encoded);
  await click("qr-close");
  await api(new URL(encoded).pathname);
  await data("/api/links/report", {
    wid,
    method: "PATCH",
    body: { version: 1, destination: "https://example.com/updated" },
  });
  const redirected = await api(new URL(encoded).pathname);
  assert.equal(
    redirected.headers.get("Location"),
    "https://example.com/updated",
  );
  await ev("document.querySelector('[data-view=analytics]').click()");
  await wait("document.getElementById('analytics-total').textContent==='3'");
  assert.equal(
    await ev("document.getElementById('analytics-links').textContent"),
    "1",
  );
  assert.equal(
    await ev("document.getElementById('analytics-qr').textContent"),
    "2",
  );
  await shot("analytics-desktop", 1440, 1000);
  await shot("analytics-mobile", 390, 844);
  await fetch(base + "/qa/analytics-failure?enabled=1");
  await click("analytics-refresh");
  await wait(
    "!document.getElementById('analytics-error').classList.contains('hidden')",
  );
  assert.equal(
    await ev(
      "document.getElementById('analytics-report').classList.contains('hidden')",
    ),
    true,
  );
  assert.equal(
    await ev("document.getElementById('analytics-export').disabled"),
    true,
  );
  await fetch(base + "/qa/analytics-failure?enabled=0");
  await click("analytics-refresh");
  await wait(
    "document.getElementById('analytics-total').textContent==='3' && !document.getElementById('analytics-export').disabled",
  );
  await click("analytics-export");
  await wait("window.__exports.length===2");
  const csv = (await blobBytes(1)).toString("utf8");
  assert.ok(csv.includes('"qr_visits","2"'));
  await writeFile(new URL("report.csv", dir), csv);
  await ev("document.querySelector('[data-view=bulk]').click()");
  await wait("document.getElementById('batch-tracking')");
  assert.equal(
    await ev("document.getElementById('batch-tracking').value"),
    "tracked",
  );
  await fill(
    "bulk-input",
    "title,url,slug\nFirst,https://example.com/first,first\nSecond,https://example.com/second,second",
  );
  await click("bulk-preview");
  await wait("!document.getElementById('bulk-create').disabled");
  await click("bulk-create");
  await wait(
    "document.getElementById('bulk-status').textContent.includes('2 created') && !document.getElementById('bulk-zip').disabled",
  );
  await fill("bulk-format", "png");
  await click("bulk-zip");
  await wait("window.__exports.length===3");
  const archive = unzipSync(await blobBytes(2)),
    manifest = JSON.parse(strFromU8(archive["manifest.json"]));
  assert.equal(manifest.length, 2);
  for (const item of manifest) {
    assert.match(item.url, /\/q\/[0-9a-f-]{36}$/);
    assert.equal(decode(archive[item.file]), item.url);
  }
  await writeFile(new URL("bulk-tracked.zip", dir), await blobBytes(2));
  await ev("document.querySelector('[data-view=analytics]').click()");
  await wait(
    "!document.getElementById('analytics-report').classList.contains('hidden')",
  );
  await click("account-top");
  await click("auth-signout");
  assert.equal(
    await ev("document.getElementById('analytics-total').textContent"),
    "",
  );
  assert.equal(
    await ev("document.getElementById('qr-tracked-url').textContent"),
    "",
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        passed: [
          "uninstrumented data labeled honestly",
          "owner opt-in starts collection",
          "individual PNG decodes to stable tracking URL",
          "style edits preserve identity",
          "QR target follows link edits without double-counting",
          "dashboard reconciles 1 link + 2 QR visits",
          "CSV equals displayed counts",
          "bulk PNGs decode to saved /q URLs",
          "desktop/mobile layout and sign-out privacy",
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

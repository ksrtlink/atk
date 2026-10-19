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
  assert.equal(theme.radius,"8px");
  assert.equal(await ev("getComputedStyle(document.body).color"),"rgb(38, 38, 38)");
  assert.equal(await ev("getComputedStyle(document.body).backgroundColor"),"rgb(247, 247, 248)");
  assert.equal(await ev("getComputedStyle(document.querySelector('.hero-tool')).borderRadius"),"16px");
  assert.equal(await ev("getComputedStyle(document.querySelector('.primary')).color"),"rgb(255, 255, 255)");

  await shot("landing-desktop");
  await shot("landing-mobile", 390, 844);
  assert.ok(await ev("document.getElementById('hero-create-submit').getBoundingClientRect().height>=44"));
  await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});
  assert.equal(await ev("getComputedStyle(document.getElementById('hero-create-submit')).transitionDuration"),"0s");
  await send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-transparency",value:"reduce"}]});
  assert.equal(await ev("getComputedStyle(document.querySelector('.header')).backdropFilter"),"none");
  await send("Emulation.setEmulatedMedia",{features:[]});

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
  await ev("document.getElementById('qr-mode').value='static';document.getElementById('qr-mode').dispatchEvent(new Event('change'))");
  await wait("!document.getElementById('qr-download').disabled");
  await click("qr-tab-style");
  assert.equal(await ev("document.getElementById('qr-tab-style').getAttribute('aria-selected')"), "true");
  await ev("document.querySelector('[name=qr-dots][value=dots]').click()");
  assert.equal(await ev("getComputedStyle(document.querySelector('[name=qr-dots]:checked + .qr-shape-art')).boxShadow"), "none");
  assert.equal(await ev("getComputedStyle(document.querySelector('[name=qr-dots]:checked + .qr-shape-art')).borderTopColor"), "rgba(0, 0, 0, 0)");
  await ev("document.getElementById('qr-tab-style').focus()");
  await send("Input.dispatchKeyEvent", {type:"keyDown",key:"ArrowRight",code:"ArrowRight"});
  await send("Input.dispatchKeyEvent", {type:"keyUp",key:"ArrowRight",code:"ArrowRight"});
  assert.equal(await ev("document.activeElement.id"), "qr-tab-export");
  assert.equal(await ev("getComputedStyle(document.activeElement).outlineWidth"), "2px");
  assert.equal(await ev("document.getElementById('qr-tab-export').getAttribute('aria-selected')"), "true");
  await click("qr-tab-style");
  await ev("document.activeElement.blur()");
  await wait("!document.getElementById('qr-download').disabled");
  await shot("qr-style-desktop");
  await shot("qr-style-mobile",390,844);
  await send("Emulation.setDeviceMetricsOverride", {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await click("qr-preview-toggle");
  assert.equal(await ev("document.getElementById('qr-preview-panel').hidden"), true);
  await click("qr-minimize");
  await wait("!document.getElementById('qr-dialog').open && !document.getElementById('qr-resume').classList.contains('hidden')");
  await click("qr-resume");
  await wait("document.getElementById('qr-dialog').open");
  assert.equal(await ev("document.getElementById('qr-url').value"), "https://example.com/hero-draft");
  assert.equal(await ev("document.querySelector('[name=qr-dots]:checked').value"), "dots");
  await click("qr-preview-toggle");
  assert.equal(await ev("document.getElementById('qr-preview-panel').hidden"), false);
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
  await ev("document.querySelector('[data-view=people]').click()");
  await wait("document.getElementById('people-new') && !document.getElementById('people-new').classList.contains('hidden')");
  await click("people-new");await fill("people-slug","qa-contact");await fill("people-name","Nadia Example");await fill("people-title","Consultant");await fill("people-organization","Example team");await fill("people-email","nadia@example.com");await fill("people-intro","A clear introduction for a professional contact card.");
  await ev("document.getElementById('people-form').requestSubmit()");await wait("document.getElementById('people-dirty').textContent==='Draft saved'");
  assert.equal(await ev("fetch('/people/qa-contact').then(r=>r.status)"),404);
  await click("people-consent");await click("people-publish");await wait("document.getElementById('people-status').textContent.startsWith('Published.')");
  assert.equal(await ev("fetch('/people/qa-contact').then(r=>r.text()).then(t=>t.includes('Nadia Example'))"),true);
  assert.equal(await ev("fetch('/people/qa-contact/contact.vcf').then(r=>r.text()).then(t=>t.includes('FN:Nadia Example'))"),true);
  await fill("people-name","Unpublished name");assert.equal(await ev("document.getElementById('people-publish').disabled"),true);
  assert.equal(await ev("fetch('/people/qa-contact').then(r=>r.text()).then(t=>t.includes('Unpublished name'))"),false);
  await fill("people-name","Nadia Example");await shot("people-editor-desktop");await shot("people-editor-mobile",390,844);
  await click("people-qr");await wait("document.getElementById('qr-dialog')?.open");assert.match(await ev("document.getElementById('qr-url').value"),/\/people\/qr\/[0-9a-f-]{36}$/);
  await wait("!document.getElementById('qr-download').disabled");const profileQR=await ev("document.getElementById('qr-url').value");
  await ev("window.__profileExport=null;window.__profileObjectURL=URL.createObjectURL;URL.createObjectURL=function(b){window.__profileExport=b;return window.__profileObjectURL(b)}");
  await fill("qr-format","png");await ev("document.getElementById('qr-format').dispatchEvent(new Event('change'))");await click("qr-download");await wait("!!window.__profileExport");
  const profilePNG=await ev("new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(window.__profileExport);})");
  const profileImage=PNG.sync.read(Buffer.from(profilePNG,"base64"));assert.equal(jsQR(new Uint8ClampedArray(profileImage.data),profileImage.width,profileImage.height)?.data,profileQR);
  await ev("URL.createObjectURL=window.__profileObjectURL;delete window.__profileObjectURL;delete window.__profileExport");
  await click("qr-close");await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await ev("document.querySelector('[data-view=links]').click()");

  await wait("document.getElementById('page-title').textContent.includes('personal')");
  assert.equal(await ev("document.getElementById('open-qr').disabled"),false);
  assert.equal(await ev("getComputedStyle(document.getElementById('company-switcher')).display"),"none");
  await click("sidebar-toggle");
  assert.equal(await ev("document.body.classList.contains('sidebar-collapsed')"), true);
  assert.equal(await ev("document.querySelectorAll('.enterprise-nav .ui-icon use').length"), 8);
  await click("sidebar-toggle");
  await fill("destination", "https://example.com/retained-draft");
  await click("creator-toggle");
  assert.equal(await ev("document.getElementById('creator-panel').classList.contains('hidden')"), true);
  await click("creator-toggle");
  assert.equal(await ev("document.getElementById('destination').value"), "https://example.com/retained-draft");
  await fill("destination","https://example.com/personal?x=one%20two&x=2&utm_source=existing#details");
  await ev("document.querySelector('#link-utm details').open=true");
  await fill("link-utm-source", "newsletter");
  await fill("link-utm-medium", "email");
  await fill("link-utm-campaign", "October launch");
  assert.ok(await ev("document.getElementById('link-utm-preview').textContent.includes('utm_source=existing')"));
  await fill("link-utm-policy", "replace");
  const taggedDestination = await ev("document.getElementById('link-utm-preview').textContent");
  assert.equal(taggedDestination, "https://example.com/personal?x=one%20two&x=2&utm_source=newsletter&utm_medium=email&utm_campaign=October+launch#details");
  await shot("campaign-builder-desktop",1440,1000);
  await shot("campaign-builder-mobile",390,844);
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await click("open-qr");
  await wait("document.getElementById('qr-dialog')?.open");
  assert.equal(await ev("document.getElementById('qr-url').value"),taggedDestination);
  await click("qr-close");
  await fill("slug","my-private-browser-link");
  await ev("document.getElementById('link-form').requestSubmit()");
  await wait("document.getElementById('links').innerText.includes('my-private-browser-link')");
  assert.equal(await ev("[...document.querySelectorAll('.link-row')].find(r=>r.innerText.includes('my-private-browser-link')).querySelector('.destination').textContent"),taggedDestination);
  assert.equal(await ev("document.getElementById('link-utm-source').value"), "");
  await fill("destination","https://example.com/automatic-name");
  await fill("slug","");
  await ev("window.__nativeFetch=window.fetch;window.__dropLinkResponse=true;window.fetch=async(...args)=>{const response=await window.__nativeFetch(...args);if(window.__dropLinkResponse && String(args[0]).endsWith('/api/links') && args[1]?.method==='POST'){window.__dropLinkResponse=false;throw Error('Simulated lost create response');}return response;}");
  await ev("document.getElementById('link-form').requestSubmit()");
  await wait("document.getElementById('app-error').innerText.includes('Connection interrupted')");
  assert.match(await ev("document.getElementById('slug').value"),/^[a-f0-9]{8}$/);
  await ev("window.fetch=window.__nativeFetch;document.getElementById('link-form').requestSubmit()");
  await wait("document.getElementById('list-count').textContent==='2'");
  assert.match(await ev("[...document.querySelectorAll('.link-row')].find(row=>row.innerText.includes('automatic-name')).querySelector('.short-link').href"),/\/r\/[a-f0-9]{8}$/);

  await ev("[...document.querySelectorAll('.link-row')].find(r=>r.innerText.includes('my-private-browser-link')).querySelectorAll('button')[3].click()");
  await wait("document.getElementById('routing-dialog')?.open");
  await ev("document.getElementById('routing-enabled').checked=true");
  await click("routing-add-audience");
  await ev("document.querySelector('[data-routing-field=country]').value='AE';document.querySelector('[data-routing-field=country]').dispatchEvent(new Event('input'))");
  await ev("document.querySelector('[data-routing-field=language]').value='ar';document.querySelector('[data-routing-field=language]').dispatchEvent(new Event('input'))");
  await ev("document.querySelector('#routing-audiences [data-routing-field=destination]').value='https://example.com/arabic';document.querySelector('#routing-audiences [data-routing-field=destination]').dispatchEvent(new Event('input'))");
  await click("routing-add-schedule");
  for(const [field,value] of [["timezone","Asia/Dubai"],["localStart","2026-10-20T09:00"],["localEnd","2026-10-20T10:00"],["destination","https://example.com/event"]])
    await ev(`document.querySelector('#routing-schedules [data-routing-field=${field}]').value=${JSON.stringify(value)};document.querySelector('#routing-schedules [data-routing-field=${field}]').dispatchEvent(new Event('input'))`);
  await ev("document.querySelector('.routing-test').open=true");
  await fill("routing-test-country","AE");await fill("routing-test-language","ar-AE");await fill("routing-test-time","2026-10-20T05:30");
  await click("routing-test");
  await wait("document.getElementById('routing-test-result').textContent==='Schedule: https://example.com/event'");
  await fill("routing-test-time","2026-10-20T07:00");await click("routing-test");
  await wait("document.getElementById('routing-test-result').textContent==='Audience rule: https://example.com/arabic'");
  await fill("routing-test-country","US");await fill("routing-test-language","en");await click("routing-test");
  await wait("document.getElementById('routing-test-result').textContent.startsWith('Fallback: ')");
  assert.equal(await ev("document.getElementById('routing-test-result').textContent"),"Fallback: "+taggedDestination);
  await ev("document.getElementById('routing-form').requestSubmit()");
  await wait("document.getElementById('routing-test-result').textContent.startsWith('Rules saved')");
  await shot("routing-desktop",1440,1000);await shot("routing-mobile",390,844);
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await click("routing-close");
  assert.equal(await ev("document.querySelector('[data-view=team] .nav-label').textContent"), "QR presets");
  assert.equal(await ev("getComputedStyle(document.getElementById('library-contexts')).display"), "none");
  assert.equal(await ev("document.querySelector('.sidebar').innerText.includes('company')"), false);
  await ev("[...document.querySelectorAll('.link-row')].find(r=>r.innerText.includes('my-private-browser-link')).querySelector('.danger').click()");
  await wait("document.getElementById('delete-link-dialog')?.open");
  await shot("delete-link-dialog",1440,1000);
  await click("delete-link-cancel");
  assert.equal(await ev("document.getElementById('list-count').textContent"), "2");
  await ev("[...document.querySelectorAll('.link-row')].find(r=>r.innerText.includes('my-private-browser-link')).querySelector('.danger').click()");
  await click("delete-link-confirm");
  await wait("document.getElementById('list-count').textContent==='1'");
  await ev("document.getElementById('link-status').value='trash';document.getElementById('link-status').dispatchEvent(new Event('change'))");
  assert.equal(await ev("document.getElementById('links').innerText.includes('my-private-browser-link')"),true);
  await shot("link-trash",1440,1000);
  await ev("document.querySelector('#links button').click()");
  await wait("document.getElementById('list-count').textContent==='0' && !document.getElementById('empty').classList.contains('hidden')");
  await ev("document.getElementById('link-status').value='active';document.getElementById('link-status').dispatchEvent(new Event('change'))");
  assert.equal(await ev("document.getElementById('list-count').textContent"), "2");
  await shot("personal-desktop",1440,1000);
  await shot("personal-mobile",390,844);
  await click("account-top");
  await ev("document.getElementById('team-upgrade').open=true");
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
  await click("qr-tab-export");
  await click("qr-save-profile");
  await wait("document.getElementById('designs').innerText.includes('My private QR')");
  await click("qr-minimize");
  await wait("!document.getElementById('qr-dialog').open");
  await click("company-open");
  await wait("document.getElementById('workspace-label').textContent==='Northstar Company'");
  assert.equal(await ev("document.getElementById('designs').innerText.includes('My private QR')"),false);
  assert.equal(await ev("document.getElementById('qr-resume').classList.contains('hidden')"),true);
  await click("qr-resume");
  assert.equal(await ev("document.getElementById('qr-dialog').open"),false);


  await click("open-qr");
  await wait("document.getElementById('qr-dialog')?.open");
  await ev(
    "document.getElementById('qr-mode').value='static';document.getElementById('qr-mode').dispatchEvent(new Event('change'))",
  );
  await fill("qr-url", "https://example.com/direct");
  await wait("!document.getElementById('qr-download').disabled");
  await fill("qr-design-title", "Direct company QR");
  await click("qr-tab-export");
  await click("qr-save-profile");
  await wait(
    "document.getElementById('designs').innerText.includes('Direct company QR')",
  );
  await shot("enterprise-qr", 1440, 1000);
  await shot("enterprise-qr-mobile",390,844);
  assert.equal(await ev("document.getElementById('qr-dialog').scrollWidth <= document.getElementById('qr-dialog').clientWidth"),true);
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await click("qr-close");
  await ev("document.querySelector('[data-view=bulk]').click()");
  await wait("document.getElementById('batch-dots')");
  await fill("bulk-utm-source", "newsletter");
  await fill("bulk-utm-campaign", "batch-launch");
  await fill(
    "bulk-input",
    "title,url,slug,utm_source\nAnnual report,https://example.com/report,annual-report,poster\nProduct guide,https://example.com/guide,product-guide,",
  );
  await click("bulk-preview");
  await wait("!document.getElementById('bulk-create').disabled");
  await click("bulk-create");
  await wait(
    "document.getElementById('bulk-status').textContent.includes('2 created')",
  );
  await wait("!document.getElementById('bulk-zip').disabled");
  await wait("[...document.querySelectorAll('.link-row .destination')].some(x=>x.textContent.includes('utm_campaign=batch-launch'))");
  const savedBatchURLs=await ev("[...document.querySelectorAll('.link-row .destination')].map(x=>x.textContent)");
  assert.ok(savedBatchURLs.includes("https://example.com/report?utm_source=poster&utm_campaign=batch-launch"));
  assert.ok(savedBatchURLs.includes("https://example.com/guide?utm_source=newsletter&utm_campaign=batch-launch"));
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

  await ev("document.querySelector('#bulk-utm .text-button').click()");
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
  await ev("document.querySelector('#bulk-utm details').open=true");
  await fill("bulk-utm-source", "shared");
  await fill("bulk-utm-medium", "qr");
  assert.equal(await ev("document.getElementById('bulk-create').disabled"),true);
  await fill("bulk-input", "title,url,utm_source,utm_campaign\nOne,https://example.com/one?keep=a%20b#top,row-source,launch\nTwo,https://example.com/two,,launch");
  await click("bulk-preview");
  await wait("!document.getElementById('bulk-create').disabled");
  const campaignRows=await ev("[...document.querySelectorAll('#bulk-preview-table input[aria-label=url]')].map(x=>x.value)");
  assert.equal(campaignRows[0],"https://example.com/one?keep=a%20b&utm_source=row-source&utm_medium=qr&utm_campaign=launch#top");
  assert.equal(campaignRows[1],"https://example.com/two?utm_source=shared&utm_medium=qr&utm_campaign=launch");
  await shot("campaign-bulk-desktop",1440,1000);
  await ev("document.querySelector('[data-view=links]').click()");
  await shot("enterprise-desktop", 1440, 1000);
  await shot("enterprise-mobile", 390, 844);
  await ev("document.querySelector('[data-view=resources]').click()");
  await wait("document.getElementById('resource-new')");
  await click("resource-new");
  await fill("resource-title", "Conference resources");
  await fill("resource-slug", "browser-resources");
  await fill("resource-description", "Everything for the event, in one place.");
  await ev("document.querySelector('[data-resource-field=label]').value='Programme';document.querySelector('[data-resource-field=label]').dispatchEvent(new Event('input'))");
  await ev("document.querySelector('[data-resource-field=url]').value='https://example.com/programme';document.querySelector('[data-resource-field=url]').dispatchEvent(new Event('input'))");
  await ev("document.getElementById('resource-form').requestSubmit()");
  await wait("document.getElementById('resource-public-url').textContent.includes('/p/browser-resources') && document.getElementById('resource-dirty').textContent==='Draft saved'");
  const resourceURL=await ev("document.getElementById('resource-public-url').textContent");
  assert.equal(await ev(`fetch(${JSON.stringify(resourceURL)}).then(r=>r.status)`),404);
  await ev("document.getElementById('resource-consent').checked=true;document.getElementById('resource-consent').dispatchEvent(new Event('change'))");
  await click("resource-publish");
  await wait("document.getElementById('resource-list').innerText.includes('Published')");
  await fill("resource-title", "Private next edition");
  await ev("document.getElementById('resource-form').requestSubmit()");
  await wait("document.getElementById('resource-dirty').textContent==='Draft saved'");
  assert.equal(await ev(`fetch(${JSON.stringify(resourceURL)}).then(r=>r.text()).then(s=>s.includes('Private next edition'))`),false);
  await shot("resource-editor-desktop",1440,1000);
  await shot("resource-editor-mobile",390,844);
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await click("resource-qr");
  await wait("document.getElementById('qr-dialog').open && !document.getElementById('qr-download').disabled");
  assert.equal(await ev("document.getElementById('qr-mode').value"),"static");
  assert.equal(await ev("document.getElementById('qr-url').value"),resourceURL);
  await fill("qr-format","png");
  await ev("window.__exports=[];document.getElementById('qr-format').dispatchEvent(new Event('change'))");
  await click("qr-download");
  await wait("window.__exports.length===1");
  const resourcePNG=await ev("new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(window.__exports[0]);})");
  const image=PNG.sync.read(Buffer.from(resourcePNG,"base64"));
  assert.equal(jsQR(new Uint8ClampedArray(image.data),image.width,image.height)?.data,resourceURL);
  await click("qr-close");
  await send("Page.navigate",{url:resourceURL});
  await wait("document.querySelector('.resource-public-link')");
  assert.equal(await ev("document.querySelector('h1').textContent"),"Conference resources");
  await shot("resource-public-desktop",1440,1000);
  await shot("resource-public-mobile",390,844);
  await send("Page.navigate",{url:"http://127.0.0.1:4174/manage/"});
  await wait("document.getElementById('notice').textContent.includes('Sign in')");
  await login("alice");
  await ev("document.querySelector('[data-view=resources]').click()");
  await wait("document.querySelector('#resource-list button')");
  await ev("document.querySelector('#resource-list button').click()");
  await wait("document.getElementById('resource-title').value==='Private next edition'");
  await click("resource-unpublish");
  await wait("document.getElementById('resource-publish-note').textContent.includes('Private draft')");
  assert.equal(await ev(`fetch(${JSON.stringify(resourceURL)}).then(r=>r.status)`),410);
  await logout();
  assert.equal(
    await ev("document.getElementById('links').childElementCount"),
    0,
  );
  assert.equal(await ev("document.getElementById('qr-url')?.value || ''"), "");
  assert.equal(await ev("document.getElementById('bulk-utm-source')?.value || ''"), "");
  assert.equal(await ev("document.getElementById('resource-title').value"), "");
  assert.equal(await ev("document.getElementById('resource-items').childElementCount"), 0);
  assert.equal(await ev("document.getElementById('people-name')?.value || ''"), "");
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(
    JSON.stringify(
      {
        passed: [
          "contact-card creation/publication, private drafts, vCard download, stable profile QR and mobile editor",
          "schedule timezone conversion, rule preview precedence, saved audience rules and mobile editor",
    "resource drafts/public snapshots, publication, mobile pages, decoded page QR and unpublish",
    "campaign URL preview, keep/replace, individual link/QR destinations, CSV overrides and preview invalidation",
    "white accent actions, solo navigation, link deletion cancel/confirm/Trash/restore",
    "layered theme, sidebar icons and collapse, creation panel hides without losing input",
    "QR tabs support keyboard arrows, soft selection, hide preview, minimize/resume",
    "minimized QR draft is discarded when changing workspace",
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

import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
const project = new URL("../", import.meta.url),
  source = new URL("../manage/", project),
  output = new URL("public/manage/", project);
await mkdir(output, { recursive: true });
for (const file of [
  "styles.css",
  "core.mjs",
  "qr-core.mjs",
  "qr-builder.mjs",
  "qr-builder.css",
  "vendor",
])
  await cp(new URL(file, source), new URL(file, output), { recursive: true });
for (const file of ["kearney-logo.svg", "links.json"])
  await rm(new URL(file, output), { force: true });
for (const file of [
  "app.mjs",
  "auth.mjs",
  "accounts.css",
  "tinytrail.css",
  "enterprise.css",
  "tinytrail-logo.svg",
  "tinytrail-icon.svg",
  "bulk.mjs",
])
  await cp(new URL(`ui/${file}`, project), new URL(file, output));
let html = await readFile(new URL("ui/index.html", project), "utf8");
html = html.replace(
  "<!--ACCOUNT_DIALOG-->",
  (await readFile(new URL("ui/account-dialog.html", project), "utf8"))
    .replace("YOUR PERSONAL WORKSPACE", "YOUR COMPANY ACCOUNT")
    .replace(
      "One email account for your links and saved QR designs.",
      "Sign in to your company’s shared link and QR studio.",
    ),
);
await writeFile(new URL("index.html", output), html);
let qr = await readFile(new URL("qr-builder.mjs", source), "utf8");
qr = qr
  .replaceAll("Kearney code color presets", "TinyTrail code color presets")
  .replaceAll(
    "Use Kearney ${name} code color",
    "Use TinyTrail ${name} code color",
  )
  .replaceAll("Kearney ${name} ·", "TinyTrail ${name} ·")
  .replaceAll("Save to my profile", "Save to company")
  .replace(
    "No GitHub connection needed.",
    "Use a company short link or enter a direct website URL.",
  )
  .replace("`${BASE}insights/`", "''");
qr = qr
  .replace(
    "button.setAttribute('aria-label',`Use TinyTrail ${name} code color`);",
    'const label={slate:"Ink",purple:"Teal",blue:"Blue",pink:"Rose"}[name];button.setAttribute(\'aria-label\',`Use TinyTrail ${label} code color`);',
  )
  .replace(
    "button.title=`TinyTrail ${name} · ${color}`;",
    "button.title=`TinyTrail ${label} · ${color}`;",
  );
// Keep the shared legacy application untouched; extend only the company build.
qr = qr.replace(
  "let savingProfile = false;",
  "let savingProfile = false;\nlet presetHandler=null;",
);
qr = qr.replace("design=null}={}", "design=null,presets=[],onPreset=null}={}");
qr = qr.replace(
  "  saveHandler=onSave;",
  `  saveHandler=onSave;
  presetHandler=onPreset;
  let controls=$('qr-company-presets');
  if(!controls){controls=document.createElement('div');controls.id='qr-company-presets';controls.className='qr-preset-controls';controls.innerHTML='<label for="qr-preset-select">Company style preset</label><select id="qr-preset-select"><option value="">Choose a preset</option></select><label for="qr-preset-name">Save current style as a company preset</label><input id="qr-preset-name" maxlength="100" placeholder="e.g. Company print style"><button id="qr-preset-save" class="button secondary" type="button">Save company preset</button>';$('.qr-controls');dialog.querySelector('.qr-controls').prepend(controls);}
  const presetSelect=$('qr-preset-select');presetSelect.replaceChildren(new Option('Choose a preset',''));for(const p of presets)presetSelect.append(new Option(p.name,p.id));
  presetSelect.onchange=()=>{const p=presets.find(p=>p.id===presetSelect.value);if(!p)return;const c=p.settings;for(const [name,value]of[['qr-dots',c.dots],['qr-border',c.border],['qr-center',c.center]]){const input=[...dialog.querySelectorAll('input[name="'+name+'"]')].find(i=>i.value===value);if(input)input.checked=true;}$('qr-foreground').value=c.foreground;$('qr-background').value=c.background;$('qr-size').value=c.size;schedule();};
  $('qr-preset-save').onclick=async()=>{try{if(!current||!presetHandler)throw Error('Enter a valid URL and style first.');$('qr-preset-save').disabled=true;await presetHandler({name:$('qr-preset-name').value,settings:current});$('qr-quality').textContent='Company preset saved. Reopen the designer to select it.';}catch(e){$('qr-error').textContent=e.message;$('qr-error').classList.remove('hidden');}finally{$('qr-preset-save').disabled=false;}};
`,
);
qr = qr.replace("$('.qr-controls');", "");
await writeFile(new URL("qr-builder.mjs", output), qr);
await writeFile(
  new URL("qr-core.mjs", output),
  (await readFile(new URL("qr-core.mjs", source), "utf8")).replace(
    "|| 'kearney'",
    "|| 'tinytrail'",
  ),
);
await build({
  entryPoints: [fileURLToPath(new URL("ui/exports.mjs", project))],
  outfile: fileURLToPath(new URL("exports.mjs", output)),
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  legalComments: "eof",
});
let landing = await readFile(new URL("ui/landing.html", project), "utf8");
landing = landing.replaceAll(
  "<!--SAMPLE_QR-->",
  await QRCode.toString("https://example.com/annual-report", {
    type: "svg",
    margin: 4,
    color: { dark: "#18181b", light: "#ffffff" },
  }),
);
await writeFile(new URL("public/index.html", project), landing);
for (const file of ["landing.css", "landing.mjs"])
  await cp(new URL("ui/" + file, project), new URL("public/" + file, project));
await writeFile(
  new URL("public/_headers", project),
  "/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n",
);
const notices = [];
for (const name of [
  "fflate",
  "jspdf",
  "svg2pdf.js",
  "qrcode",
  "canvg",
  "html2canvas",
  "dompurify",
  "raf",
  "rgbcolor",
  "stackblur-canvas",
  "text-segmentation",
  "utrie",
  "pako",
  "fast-png",
  "iobuffer",
  "performance-now",
]) {
  const root = new URL("node_modules/" + name + "/", project);
  const pkg = JSON.parse(
    await readFile(new URL("package.json", root), "utf8").catch(() => "{}"),
  );
  if (!pkg.name) continue;
  let license = "";
  for (const file of [
    "LICENSE",
    "LICENSE.txt",
    "LICENSE.md",
    "license",
    "license.txt",
  ]) {
    try {
      license = await readFile(new URL(file, root), "utf8");
      break;
    } catch {}
  }
  notices.push(
    pkg.name + " " + pkg.version + " (" + pkg.license + ")\n" + license,
  );
}
await writeFile(new URL("EXPORT-LICENSES.txt", output), notices.join("\n\n"));
console.log(
  "Built landing page, company studio, and lazy-loaded export tools.",
);

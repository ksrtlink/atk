import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import {kumoHTML} from "./kumo-html.mjs";
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
  "utm.mjs",
  "resources.mjs",
  "people.mjs",
  "people-photo.mjs",
  "staff-tools.mjs",
  "staff-distribution.mjs",
  "routing.mjs",
  "health.mjs",
  "contact-inbox.mjs",
  "activity.mjs",
  "auth.mjs",
  "auth-navigation.mjs",
  "accounts.css",
  "tinytrail.css",
  "enterprise.css",
  "tinytrail-logo.svg",
  "tinytrail-icon.svg",
  "bulk.mjs",
  "analytics.mjs",
  "analytics.css",
])
  await cp(new URL(`ui/${file}`, project), new URL(file, output));
const iconNames = ["link", "user", "files", "qr-code", "stack", "chart-bar", "clock-counter-clockwise", "users", "shield-check", "sidebar-simple", "eye", "minus", "x"];
const symbols = await Promise.all(iconNames.map(async name => {
  const svg = await readFile(new URL(`node_modules/@phosphor-icons/core/assets/regular/${name}.svg`, project), "utf8");
  return `<symbol id="${name}" viewBox="0 0 256 256">${svg.replace(/^.*?<svg[^>]*>/s, "").replace(/<\/svg>\s*$/, "")}</symbol>`;
}));
await writeFile(new URL("icons.svg", output), `<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor">${symbols.join("")}</svg>`);
await mkdir(new URL("public/shared/", project), {recursive:true});
await cp(new URL("shared/routing.mjs",project),new URL("public/shared/routing.mjs",project));
await cp(new URL("shared/staff-distribution.mjs",project),new URL("public/shared/staff-distribution.mjs",project));
let html = await readFile(new URL("ui/index.html", project), "utf8");
html = html.replace(
  "<!--ACCOUNT_DIALOG-->",
  (await readFile(new URL("ui/account-dialog.html", project), "utf8"))
    .replace("YOUR PERSONAL WORKSPACE", "YOUR TINYTRAIL ACCOUNT")
    .replace(
      "One email account for your links and saved QR designs.",
      "Your links and QR codes, in one place.",
    ).replace("Use your work email, or another email permitted by this workspace.", "Use an email you can verify. Company access is managed separately.",
    ),
);
await writeFile(new URL("index.html", output), kumoHTML(html));
await cp(
  new URL("ui/qr-builder.mjs", project),
  new URL("qr-builder.mjs", output),
);
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
const landing = await readFile(new URL("ui/landing.html", project), "utf8");
await writeFile(new URL("public/index.html", project), kumoHTML(landing));
await cp(new URL("ui/fonts/",project),new URL("public/fonts/",project),{recursive:true});
await mkdir(new URL("public/signin/", project), {recursive:true});
await writeFile(new URL("public/signin/index.html", project), kumoHTML(await readFile(new URL("ui/signin.html",project),"utf8")));
for(const file of ["signin.css","signin.mjs","signin-art.webp"]) await cp(new URL("ui/"+file,project),new URL("public/"+file,project));
for (const file of ["landing.css", "landing.mjs", "landing-visual.css", "landing-hero.webp", "sharing-art.webp", "theme.css", "cloudflare-style.css", "resource-page.css"])
  await cp(new URL("ui/" + file, project), new URL("public/" + file, project));
await writeFile(
  new URL("public/_headers", project),
  "/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n",
);
const notices = [];
for (const name of [
  "@phosphor-icons/core",
  "fflate",
  "jspdf",
  "svg2pdf.js",
  "@cloudflare/kumo",
  "react",
  "react-dom",
  "@base-ui/react",
  "@floating-ui/react",
  "@phosphor-icons/react",
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

await cp(new URL('node_modules/@cloudflare/kumo/dist/styles/kumo-standalone.css',project),new URL('public/kumo.css',project));
for(const file of ['appearance-init.js','kumo-alignment.css','landing-hero-dark.webp','sharing-art-dark.webp'])await cp(new URL('ui/'+file,project),new URL('public/'+file,project));
await build({entryPoints:[fileURLToPath(new URL('ui/appearance.jsx',project))],outfile:fileURLToPath(new URL('public/appearance.mjs',project)),bundle:true,format:'esm',platform:'browser',minify:true,define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});

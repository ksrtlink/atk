import assert from "node:assert/strict";
const origin = process.argv[2] || "https://tinytrail.link";
async function get(path) {
  return fetch(origin + path, {
    redirect: "manual",
    signal: AbortSignal.timeout(25000),
  });
}
const landing = await get("/");
assert.equal(landing.status, 200);
assert.ok((await landing.text()).includes("Every link."));
const app = await get("/manage/");
assert.equal(app.status, 200);
assert.ok((await app.text()).includes("Company workspace"));
for (const path of [
  "/api/links",
  "/api/designs",
  "/api/legacy",
  "/api/admin/requests",
])
  assert.equal((await get(path)).status, 401, path);
assert.equal((await get("/manage/links.json")).status, 404);
const config = await (await get("/api/config")).json();
assert.equal(config.authReady, true);
assert.equal(config.publicOrigin, "https://tinytrail.link");
const redirect = await get("/r/insights");
assert.equal(redirect.status, 302);
assert.equal(
  redirect.headers.get("Location"),
  "https://www.kearney.com/industry/aerospace-defense/insights",
);
for (const asset of [
  "/landing.css",
  "/landing.mjs",
  "/manage/app.mjs",
  "/manage/bulk.mjs",
  "/manage/exports.mjs",
  "/manage/enterprise.css",
])
  assert.equal((await get(asset)).status, 200, asset);
console.log(
  "Live landing, company studio, private API gates, original redirect, and required assets passed.",
);

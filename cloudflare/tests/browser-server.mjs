import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { verifyFirebaseToken } from "../src/auth.mjs";
import { createApp } from "../src/worker.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
  assets = resolve(root, "public"),
  sql = new DatabaseSync(":memory:");
for (const n of [
  "0001_schema.sql",
  "0002_original_links.sql",
  "0003_enterprise.sql",
  "0004_analytics.sql", "0005_personal.sql", "0006_link_trash.sql", "0007_resource_pages.sql", "0008_link_routing.sql", "0009_people.sql", "0010_staff_tools.sql",
])
  sql.exec(await readFile(resolve(root, "migrations/" + n), "utf8"));
let failAnalytics = false;
function prepare(query, args = []) {
  if (failAnalytics && query.includes("FROM engagement_events"))
    throw Error("Injected report storage failure");
  return {
    query,
    args,
    bind(...values) {
      return prepare(query, values);
    },
    async first() {
      return sql.prepare(query).get(...args) || null;
    },
    async all() {
      return { results: sql.prepare(query).all(...args) };
    },
    async run() {
      return { meta: sql.prepare(query).run(...args) };
    },
  };
}
const DB = {
  prepare,
  async batch(statements) {
    sql.exec("BEGIN");
    try {
      const results = [];
      for (const s of statements)
        results.push(
          /^\s*SELECT|\bRETURNING\b/i.test(s.query)
            ? { results: sql.prepare(s.query).all(...s.args) }
            : { meta: sql.prepare(s.query).run(...s.args) },
        );
      failAnalytics = false;
      sql.exec("COMMIT");
      return results;
    } catch (e) {
      failAnalytics = false;
      sql.exec("ROLLBACK");
      throw e;
    }
  },
};
const pair = await generateKeyPair("RS256"),
  jwk = await exportJWK(pair.publicKey);
jwk.kid = "browser-test";
jwk.alg = "RS256";
const resolver = createLocalJWKSet({ keys: [jwk] }),
  tokens = {};
for (const [id, email, verified] of [
  ["admin", "admin@example.com", true],
  ["alice", "alice@example.com", true],
  ["bob", "bob@example.com", true],
  ["charlie", "charlie@example.com", false],
  ["charlieVerified", "charlie@example.com", true],
]) {
  const uid = id === "charlieVerified" ? "charlie" : id;
  tokens[id] = {
    idToken: await new SignJWT({
      email,
      email_verified: verified,
      auth_time: Math.floor(Date.now() / 1000),
      name: uid,
    })
      .setProtectedHeader({ alg: "RS256", kid: "browser-test" })
      .setSubject(uid)
      .setAudience("test-project")
      .setIssuer("https://securetoken.google.com/test-project")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(pair.privateKey),
    refreshToken: uid + "-refresh",
    email,
    localId: uid,
    expiresIn: "3600",
  };
}
const env = {
  DB,
  FIREBASE_PROJECT_ID: "test-project",
  FIREBASE_API_KEY: "public-test-key",
  PUBLIC_ORIGIN: "http://127.0.0.1:4174",
  ADMIN_EMAILS: "admin@example.com",
  ANALYTICS_ENABLED: "true",
  TRACKED_QR_ENABLED: "true",
  ANALYTICS_RETENTION_DAYS: "90",
  ASSETS: {
    async fetch(request) {
      let name = decodeURIComponent(new URL(request.url).pathname);
      if (name.endsWith("/")) name += "index.html";
      const path = resolve(assets, "." + name);
      if (!path.startsWith(assets + sep))
        return new Response("Not found", { status: 404 });
      try {
        return new Response(await readFile(path), {
          headers: {
            "Content-Type":
              {
                ".html": "text/html;charset=utf-8",
                ".mjs": "text/javascript",
                ".js": "text/javascript",
                ".css": "text/css",
                ".json": "application/json",
                ".svg": "image/svg+xml",
              }[extname(path)] || "application/octet-stream",
            "Cache-Control": "no-store",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  },
};
const app = createApp((value, settings) =>
  verifyFirebaseToken(value, settings, resolver),
);
createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/qa/analytics-failure")) {
      failAnalytics =
        new URL(req.url, "http://localhost").searchParams.get("enabled") ===
        "1";
      res.writeHead(200);
      res.end("Test-only report failure toggled");
      return;
    }
    if (req.url === "/qa/reset" && req.method === "POST") {
      failAnalytics = false;
      sql.exec(
        "DELETE FROM people_import_rows; DELETE FROM people_events; DELETE FROM people_revisions; DELETE FROM people; DELETE FROM people_imports; DELETE FROM people_templates; DELETE FROM link_routing_revisions; DELETE FROM link_routing; DELETE FROM resource_events; DELETE FROM resource_revisions; DELETE FROM resource_pages; DELETE FROM engagement_events; DELETE FROM analytics_periods; DELETE FROM analytics_settings; DELETE FROM bulk_rows; DELETE FROM bulk_jobs; DELETE FROM presets; DELETE FROM invitations; DELETE FROM access_requests; DELETE FROM memberships; DELETE FROM qr_designs; DELETE FROM tracked_qrs; DELETE FROM links WHERE legacy=0; DELETE FROM workspaces; DELETE FROM users;",
      );
      res.writeHead(200);
      res.end("Reset loopback test database");
      return;
    }
    if (req.url === "/qa/tokens") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(tokens));
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const background = [];
    const response = await app.fetch(
      new Request("http://127.0.0.1:4174" + req.url, {
        method: req.method,
        headers: req.headers,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : Buffer.concat(chunks),
      }),
      env,
      { waitUntil: (task) => background.push(task) },
    );
    await Promise.all(background);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    console.error(e.message);
    res.writeHead(500);
    res.end("Test harness error");
  }
}).listen(4174, "127.0.0.1", () =>
  console.log("Enterprise browser test server at http://127.0.0.1:4174"),
);

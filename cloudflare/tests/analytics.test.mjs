import test from "node:test";
import assert from "node:assert/strict";
import { sqliteD1 } from "./enterprise.test.mjs";
import { createApp } from "../src/worker.mjs";
import { DAY, FILTER_VERSION, prune, csvCell } from "../src/analytics.mjs";
const style = {
  dots: "dots",
  border: "extra-rounded",
  center: "dot",
  foreground: "#202b38",
  background: "#ffffff",
  size: 1024,
};
function fixture() {
  const DB = sqliteD1();
  for (const uid of ["owner", "member", "other"])
    DB.sql
      .prepare("INSERT INTO users(uid,email,display_name) VALUES(?,?,?)")
      .run(uid, uid + "@example.com", uid);
  for (const [id, name] of [
    ["a", "Company A"],
    ["b", "Company B"],
  ])
    DB.sql.prepare("INSERT INTO workspaces(id,name) VALUES(?,?)").run(id, name);
  for (const [wid, uid, role] of [
    ["a", "owner", "owner"],
    ["a", "member", "member"],
    ["b", "other", "owner"],
  ])
    DB.sql.prepare("INSERT INTO memberships VALUES(?,?,?)").run(wid, uid, role);
  const env = {
      DB,
      FIREBASE_PROJECT_ID: "test",
      FIREBASE_API_KEY: "public",
      PUBLIC_ORIGIN: "https://tinytrail.link",
      ANALYTICS_ENABLED: "true",
      TRACKED_QR_ENABLED: "true",
      ANALYTICS_RETENTION_DAYS: "90",
    },
    tasks = [],
    app = createApp(async (uid) => ({
      uid,
      email: uid + "@example.com",
      verified: true,
      name: uid,
    }));
  async function request(
    path,
    {
      method = "GET",
      user = "owner",
      wid = "a",
      body,
      headers = {},
      cf,
      flush = true,
    } = {},
  ) {
    const request = new Request("https://tinytrail.link" + path, {
      method,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36",
        ...(user
          ? { Authorization: "Bearer " + user, "X-Workspace-Id": wid }
          : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (cf) Object.defineProperty(request, "cf", { value: cf });
    const response = await app.fetch(request, env, {
      waitUntil: (p) => tasks.push(p),
    });
    if (flush) {
      while (tasks.length) await Promise.all(tasks.splice(0));
    }
    return response;
  }
  async function data(path, opts) {
    const r = await request(path, opts),
      b = await r.json();
    assert.ok(r.ok, JSON.stringify(b));
    return b;
  }
  async function enable() {
    await data("/api/analytics/settings", {
      method: "POST",
      body: { enabled: true },
    });
  }
  async function link(slug = "report", wid = "a", user = "owner") {
    return (
      await data("/api/links", {
        method: "POST",
        wid,
        user,
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: { slug, destination: "https://example.com/" + slug },
      })
    ).link;
  }
  const query = (from = Date.now() - DAY, to = Date.now() + 1000) =>
    "/api/analytics?from=" +
    encodeURIComponent(new Date(from).toISOString()) +
    "&to=" +
    encodeURIComponent(new Date(to).toISOString());
  return { DB, env, app, tasks, request, data, enable, link, query };
}
test("eligible short-link GET records one coarse event; HEAD, missing, prefetch and bots record none", async () => {
  const f = fixture();
  await f.enable();
  await f.link();
  await f.request("/r/report", {
    user: null,
    headers: { Referer: "https://news.example.com/path?private=value" },
    cf: { country: "AE" },
  });
  const event = f.DB.sql.prepare("SELECT * FROM engagement_events").get();
  assert.equal(event.event_type, "link_visit");
  assert.equal(event.referrer_host, "news.example.com");
  assert.equal(event.country, "AE");
  assert.equal(event.device, "desktop");
  assert.equal(event.browser, "chrome");
  assert.equal(event.filter_version, FILTER_VERSION);
  for (const opts of [
    { method: "HEAD" },
    { headers: { Purpose: "prefetch" } },
    { headers: { "Sec-Purpose": "prerender" } },
    { headers: { "User-Agent": "Googlebot/2.1" } },
    { cf: { botManagement: { verifiedBot: true } } },
  ])
    await f.request("/r/report", { user: null, ...opts });
  assert.equal((await f.request("/r/missing", { user: null })).status, 404);
  assert.equal(
    f.DB.sql.prepare("SELECT COUNT(*) AS n FROM engagement_events").get().n,
    1,
  );
  assert.ok(
    !f.DB.sql
      .prepare("PRAGMA table_info(engagement_events)")
      .all()
      .some((c) => /ip_address|user_agent|cookie/i.test(c.name)),
  );
});
test("tracked QR resolves linked destination internally, survives link edits and disable, and never double-counts", async () => {
  const f = fixture();
  await f.enable();
  await f.link();
  const id = crypto.randomUUID(),
    body = { id, title: "Report QR", linkSlug: "report" };
  const asset = (await f.data("/api/tracked-qrs", { method: "POST", body }))
    .asset;
  assert.equal(
    (await f.data("/api/tracked-qrs", { method: "POST", body })).asset.id,
    id,
  );
  let r = await f.request("/q/" + id, { user: null });
  assert.equal(r.headers.get("Location"), "https://example.com/report");
  assert.deepEqual(
    f.DB.sql
      .prepare(
        "SELECT event_type,COUNT(*) AS n FROM engagement_events GROUP BY event_type",
      )
      .all()
      .map((r) => ({ ...r })),
    [{ event_type: "qr_visit", n: 1 }],
  );
  await f.data("/api/links/report", {
    method: "PATCH",
    body: { version: 1, destination: "https://example.com/updated" },
  });
  r = await f.request("/q/" + id, { user: null });
  assert.equal(r.headers.get("Location"), "https://example.com/updated");
  await f.data("/api/tracked-qrs/" + id, {
    method: "PATCH",
    body: { version: 1, state: "disabled" },
  });
  assert.equal((await f.request("/q/" + id, { user: null })).status, 410);
  assert.equal(
    f.DB.sql.prepare("SELECT COUNT(*) AS n FROM engagement_events").get().n,
    2,
  );
  assert.equal(
    (
      await f.request("/api/tracked-qrs/" + id, {
        method: "PATCH",
        body: { version: 1, state: "active" },
      })
    ).status,
    409,
  );
  assert.equal(asset.publicUrl, "https://tinytrail.link/q/" + id);
});
test("feature flags never strand issued QR codes; collection failure is observable and cannot block redirect", async () => {
  const f = fixture();
  await f.enable();
  await f.link();
  const asset = (
    await f.data("/api/tracked-qrs", {
      method: "POST",
      body: {
        id: crypto.randomUUID(),
        title: "Direct",
        destination: "https://example.com/direct",
      },
    })
  ).asset;
  f.env.ANALYTICS_ENABLED = "false";
  f.env.TRACKED_QR_ENABLED = "false";
  assert.equal((await f.request("/q/" + asset.id, { user: null })).status, 302);
  assert.equal(
    f.DB.sql.prepare("SELECT COUNT(*) AS n FROM engagement_events").get().n,
    0,
  );
  assert.equal(
    (
      await f.request("/api/tracked-qrs", {
        method: "POST",
        body: {
          id: crypto.randomUUID(),
          title: "New",
          destination: "https://example.com/new",
        },
      })
    ).status,
    409,
  );
  f.env.ANALYTICS_ENABLED = "true";
  const original = f.env.DB.prepare.bind(f.env.DB),
    logs = [];
  const log = console.error;
  console.error = (value) => logs.push(value);
  try {
    f.env.DB.prepare = (q) => {
      if (q.startsWith("INSERT OR IGNORE INTO engagement_events"))
        throw Error("secret failure details");
      return original(q);
    };
    assert.equal((await f.request("/r/report", { user: null })).status, 302);
  } finally {
    console.error = log;
  }
  assert.ok(logs.some((l) => l.includes("event_insert")));
  assert.ok(logs.every((l) => !l.includes("secret")));
});
test("background collection is outside redirect latency", async () => {
  const f = fixture();
  await f.enable();
  await f.link();
  const original = f.env.DB.prepare.bind(f.env.DB);
  f.env.DB.prepare = (q) =>
    q.startsWith("SELECT enabled FROM analytics_settings")
      ? {
          bind() {
            return { first: () => new Promise(() => {}) };
          },
        }
      : original(q);
  const result = await Promise.race([
    f.request("/r/report", { user: null, flush: false }),
    new Promise((r) => setTimeout(() => r(null), 100)),
  ]);
  assert.equal(result?.status, 302);
});
test("cross-workspace asset IDs are rejected in creation, updates, designs, reports, CSV and bulk", async () => {
  const f = fixture();
  await f.link("other-report", "b", "other");
  assert.equal(
    (
      await f.request("/api/tracked-qrs", {
        method: "POST",
        body: {
          id: crypto.randomUUID(),
          title: "Stolen",
          linkSlug: "other-report",
        },
      })
    ).status,
    404,
  );
  const asset = (
    await f.data("/api/tracked-qrs", {
      user: "other",
      wid: "b",
      method: "POST",
      body: {
        id: crypto.randomUUID(),
        title: "B",
        destination: "https://example.com/b",
      },
    })
  ).asset;
  for (const path of [
    "/api/tracked-qrs/" + asset.id,
    f.query() + "&assetType=qr&assetId=" + asset.id,
    f.query() + "&assetType=qr&assetId=" + asset.id + "&format=csv",
  ])
    assert.equal((await f.request(path)).status, 404);
  assert.equal(
    (
      await f.request("/api/designs", {
        method: "POST",
        body: {
          id: crypto.randomUUID(),
          title: "Other design",
          url: asset.publicUrl,
          trackedQrId: asset.id,
          settings: style,
        },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request("/api/analytics/settings", {
        user: "member",
        method: "POST",
        body: { enabled: true },
      })
    ).status,
    403,
  );
});
test("bulk tracked QR rows reuse stable identities on retry and images encode the saved /q URLs", async () => {
  const f = fixture();
  const id = crypto.randomUUID();
  await f.data("/api/bulk", {
    method: "POST",
    body: {
      id,
      tracked: true,
      mode: "both",
      settings: style,
      rows: [
        { title: "Bulk QR", url: "https://example.com/bulk", slug: "bulk" },
      ],
    },
  });
  let result = await f.data("/api/bulk/" + id + "/run", {
    method: "POST",
    body: {},
  });
  const encoded = result.rows[0].result.url;
  assert.match(encoded, /^https:\/\/tinytrail.link\/q\/[0-9a-f-]{36}$/);
  result = await f.data("/api/bulk/" + id + "/run", {
    method: "POST",
    body: { retry: true },
  });
  assert.equal(result.rows[0].result.url, encoded);
  assert.equal(
    f.DB.sql.prepare("SELECT COUNT(*) AS n FROM tracked_qrs").get().n,
    1,
  );
  assert.equal(
    result.rows[0].result.design.trackedQrId,
    encoded.split("/").pop(),
  );
});
test("report date boundaries, zero-filled days, unknown dimensions and equal prior-zero comparisons are honest", async () => {
  const f = fixture();
  await f.enable();
  await f.link();
  const day = Math.floor(Date.now() / DAY) * DAY;
  f.DB.sql
    .prepare("UPDATE analytics_periods SET started_at=?")
    .run(day - 10 * DAY);
  f.DB.sql
    .prepare("UPDATE analytics_settings SET tracking_since=?")
    .run(day - 10 * DAY);
  f.DB.sql
    .prepare("UPDATE links SET created_at=? WHERE slug=?")
    .run(new Date(day - 10 * DAY).toISOString(), "report");
  for (const at of [day - 2 * DAY, day - 1, day])
    f.DB.sql
      .prepare("INSERT INTO engagement_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        crypto.randomUUID(),
        "a",
        "link",
        "report",
        "link_visit",
        at,
        "unknown",
        "unknown",
        "unknown",
        "unknown",
        "unknown/direct",
        FILTER_VERSION,
      );
  const report = await f.data(f.query(day - 3 * DAY, day));
  assert.equal(report.totals.visits, 2);
  assert.deepEqual(
    report.series.map((d) => d.visits),
    [0, 1, 1],
  );
  assert.equal(report.comparison.previous, 0);
  assert.equal(report.comparison.percent, null);
  assert.equal(report.comparison.label, "No prior visits");
  assert.equal(report.breakdowns.countries[0].label, "unknown");
  assert.equal(report.timezone, "UTC");
  for (const path of [
    "/api/analytics?from=bad&to=bad",
    f.query(day - 91 * DAY, day),
    f.query() + "&assetType=link",
    f.query() + "&campaign=123",
  ])
    assert.equal((await f.request(path)).status, 400);
});
test("uninstrumented existing assets are not fabricated zeros and partial retained coverage is marked", async () => {
  const f = fixture();
  await f.link();
  let r = await f.data(f.query());
  assert.equal(r.totals.visits, null);
  assert.equal(r.assets[0].visits, null);
  assert.equal(r.assets[0].trackingStatus, "not_instrumented");
  await f.enable();
  r = await f.data(f.query());
  assert.equal(r.coverage.partial, true);
  assert.equal(r.comparison.percent, null);
  assert.ok(r.collection.trackingSince);
  assert.equal((await f.request("/r/insights", { user: null })).status, 302);
  assert.equal(
    f.DB.sql.prepare("SELECT COUNT(*) AS n FROM engagement_events").get().n,
    0,
  );
});
test("report and CSV failures are explicit; CSV formula protection includes leading whitespace", async () => {
  const f = fixture();
  await f.enable();
  for (const input of ["=cmd", "  =cmd", "\t+SUM(1)", "\r@thing", " -42"])
    assert.ok(csvCell(input).startsWith("\"'"));
  const original = f.env.DB.prepare.bind(f.env.DB),
    log = console.error;
  console.error = () => {};
  try {
    f.env.DB.prepare = (q) => {
      if (q.includes("FROM engagement_events")) throw Error("storage offline");
      return original(q);
    };
    assert.equal((await f.request(f.query())).status, 503);
    assert.equal((await f.request(f.query() + "&format=csv")).status, 503);
  } finally {
    console.error = log;
  }
});
test("retention removes expired events while preserving current events and issued QR identities", async () => {
  const f = fixture();
  await f.enable();
  await f.link();
  for (const at of [Date.now() - 91 * DAY, Date.now()])
    f.DB.sql
      .prepare("INSERT INTO engagement_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(
        crypto.randomUUID(),
        "a",
        "link",
        "report",
        "link_visit",
        at,
        "unknown",
        "unknown",
        "unknown",
        "unknown",
        "unknown/direct",
        FILTER_VERSION,
      );
  await prune(f.env);
  assert.equal(
    f.DB.sql.prepare("SELECT COUNT(*) AS n FROM engagement_events").get().n,
    1,
  );
  const plans = f.DB.sql
    .prepare(
      "EXPLAIN QUERY PLAN SELECT * FROM engagement_events WHERE workspace_id=? AND asset_type=? AND asset_id=? AND occurred_at>=? AND occurred_at<?",
    )
    .all("a", "link", "report", 0, Date.now());
  assert.ok(plans.some((p) => p.detail.includes("events_asset_time")));
});

import { Problem, publicOrigin, linkInput } from "./domain.mjs";
export const FILTER_VERSION = "tinytrail-2026-10-v1";
export const DAY = 86400000;
export const flags = (env) => ({
  collection: env.ANALYTICS_ENABLED === "true",
  creation: env.TRACKED_QR_ENABLED === "true",
  retentionDays: env.ANALYTICS_RETENTION_DAYS === "30" ? 30 : 90,
});
const bad = (status, message, code = "validation") => {
  throw new Problem(status, message, code);
};
const uuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const dbHelpers = (db) => ({
  s: (q, ...args) => db.prepare(q).bind(...args),
  first: (q, ...args) =>
    db
      .prepare(q)
      .bind(...args)
      .first(),
  all: async (q, ...args) =>
    (
      await db
        .prepare(q)
        .bind(...args)
        .all()
    ).results,
});
export function operationalFailure(operation) {
  console.error(
    JSON.stringify({
      component: "tinytrail-analytics",
      operation,
      status: "failed",
      filterVersion: FILTER_VERSION,
    }),
  );
}
export function dimensions(request) {
  const ua = request.headers.get("User-Agent") || "";
  const device = /ipad|tablet/i.test(ua)
    ? "tablet"
    : /mobile|iphone|android/i.test(ua)
      ? "mobile"
      : /windows|macintosh|x11|linux/i.test(ua)
        ? "desktop"
        : "unknown";
  const browser = /Edg\//i.test(ua)
    ? "edge"
    : /Firefox\//i.test(ua)
      ? "firefox"
      : /Chrome\/|CriOS\//i.test(ua)
        ? "chrome"
        : /Safari\//i.test(ua)
          ? "safari"
          : "unknown";
  const os = /iphone|ipad|ipod/i.test(ua)
    ? "ios"
    : /android/i.test(ua)
      ? "android"
      : /windows/i.test(ua)
        ? "windows"
        : /macintosh/i.test(ua)
          ? "macos"
          : /linux|x11/i.test(ua)
            ? "linux"
            : "unknown";
  let referrer = "unknown/direct";
  try {
    const u = new URL(request.headers.get("Referer"));
    if (["http:", "https:"].includes(u.protocol) && u.hostname.length <= 253)
      referrer = u.hostname.toLowerCase();
  } catch {}
  const cc = request.cf?.country;
  return {
    country:
      typeof cc === "string" &&
      /^[A-Z]{2}$/.test(cc) &&
      !["XX", "T1"].includes(cc)
        ? cc
        : "unknown",
    device,
    browser,
    os,
    referrer,
  };
}
export function eligible(request) {
  if (request.method !== "GET") return false;
  if (
    ["Purpose", "Sec-Purpose", "X-Purpose"].some((h) =>
      /prefetch|prerender|preview/i.test(request.headers.get(h) || ""),
    )
  )
    return false;
  if (request.cf?.botManagement?.verifiedBot) return false;
  return !/bot\b|spider|crawl|headless|preview|slack|discord|facebookexternalhit|whatsapp|telegram|curl\/|wget\/|python-requests|uptime|monitor/i.test(
    request.headers.get("User-Agent") || "",
  );
}
export function collect(request, env, ctx, asset) {
  if (!flags(env).collection || !asset.workspace_id || !eligible(request))
    return;
  const id = crypto.randomUUID(),
    at = Date.now(),
    d = dimensions(request);
  if (!ctx?.waitUntil) {
    operationalFailure("missing_execution_context");
    return;
  }
  const write = (async () => {
    const { first, s } = dbHelpers(env.DB);
    const setting = await first(
      "SELECT enabled FROM analytics_settings WHERE workspace_id=?",
      asset.workspace_id,
    );
    if (!setting?.enabled) return;
    await s(
      "INSERT OR IGNORE INTO engagement_events(id,workspace_id,asset_type,asset_id,event_type,occurred_at,country,device,browser,os,referrer_host,filter_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      id,
      asset.workspace_id,
      asset.type,
      asset.id,
      asset.type === "qr" ? "qr_visit" : "link_visit",
      at,
      d.country,
      d.device,
      d.browser,
      d.os,
      d.referrer,
      FILTER_VERSION,
    ).run();
  })();
  try {
    ctx.waitUntil(write.catch(() => operationalFailure("event_insert")));
  } catch {
    operationalFailure("event_schedule");
  }
}
export async function collectionSettings(env, wid) {
  const { first, all } = dbHelpers(env.DB),
    f = flags(env);
  const row = await first(
    "SELECT * FROM analytics_settings WHERE workspace_id=?",
    wid,
  );
  return {
    ...f,
    workspaceEnabled: !!row?.enabled,
    trackingSince: row?.tracking_since
      ? new Date(row.tracking_since).toISOString()
      : null,
    periods: (
      await all(
        "SELECT started_at,ended_at FROM analytics_periods WHERE workspace_id=? ORDER BY started_at",
        wid,
      )
    ).map((p) => ({ from: p.started_at, to: p.ended_at })),
    timezone: "UTC",
    filterVersion: FILTER_VERSION,
    bestEffort: true,
  };
}
export async function changeSettings(env, wid, role, enabled) {
  if (role !== "owner")
    bad(403, "Only company owners can change collection.", "forbidden");
  if (typeof enabled !== "boolean") bad(400, "Choose enabled or disabled.");
  if (enabled && !flags(env).collection)
    bad(409, "Collection is disabled for this deployment.", "feature_disabled");
  const { s } = dbHelpers(env.DB),
    now = Date.now();
  if (enabled)
    await env.DB.batch([
      s(
        "INSERT OR IGNORE INTO analytics_settings(workspace_id,enabled,tracking_since,updated_at) VALUES(?,0,NULL,?)",
        wid,
        now,
      ),
      s(
        "INSERT INTO analytics_periods(id,workspace_id,started_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM analytics_periods WHERE workspace_id=? AND ended_at IS NULL)",
        crypto.randomUUID(),
        wid,
        now,
        wid,
      ),
      s(
        "UPDATE analytics_settings SET enabled=1,tracking_since=COALESCE(tracking_since,?),updated_at=? WHERE workspace_id=?",
        now,
        now,
        wid,
      ),
    ]);
  else
    await env.DB.batch([
      s(
        "UPDATE analytics_periods SET ended_at=? WHERE workspace_id=? AND ended_at IS NULL",
        now,
        wid,
      ),
      s(
        "INSERT INTO analytics_settings(workspace_id,enabled,tracking_since,updated_at) VALUES(?,0,NULL,?) ON CONFLICT(workspace_id) DO UPDATE SET enabled=0,updated_at=excluded.updated_at",
        wid,
        now,
      ),
    ]);
  return collectionSettings(env, wid);
}
export async function qrRecord(env, row) {
  const { first } = dbHelpers(env.DB);
  const link = row.link_slug
    ? row.link_short_url !== undefined
      ? { short_url: row.link_short_url, destination: row.link_destination }
      : await first(
          "SELECT short_url,destination FROM links WHERE slug=? AND workspace_id=?",
          row.link_slug,
          row.workspace_id,
        )
    : null;
  return {
    id: row.id,
    title: row.title,
    publicUrl: row.public_url,
    linkSlug: row.link_slug,
    sourceUrl: link?.short_url || row.destination,
    destination: link?.destination || row.destination,
    state: row.state,
    version: row.version,
    createdAt: row.created_at,
  };
}
async function target(env, wid, body, request) {
  const { first } = dbHelpers(env.DB);
  if (body.linkSlug) {
    if (typeof body.linkSlug !== "string")
      bad(400, "Choose a valid company link.");
    const link = await first(
      "SELECT slug FROM links WHERE slug=? AND workspace_id=? AND legacy=0",
      body.linkSlug,
      wid,
    );
    if (!link) bad(404, "The target link is not in this company.", "not_found");
    return { linkSlug: link.slug, destination: null };
  }
  return {
    linkSlug: null,
    destination: linkInput(
      { slug: "qr-target", destination: body.destination },
      env,
      request,
    ).destination,
  };
}
export async function createTracked(env, wid, user, body, request) {
  if (typeof body.id === "string") body.id = body.id.toLowerCase();
  if (!flags(env).creation)
    bad(
      409,
      "New tracked QR codes are disabled for this deployment.",
      "feature_disabled",
    );
  if (!uuid(body.id)) bad(400, "A valid tracking ID is required.");
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 100)
    bad(400, "Give the QR a title of up to 100 characters.");
  const t = await target(env, wid, body, request),
    { first } = dbHelpers(env.DB);
  const prior = await first("SELECT * FROM tracked_qrs WHERE id=?", body.id);
  if (prior) {
    if (prior.workspace_id !== wid)
      bad(404, "Tracked QR not found.", "not_found");
    if (
      prior.link_slug !== t.linkSlug ||
      prior.destination !== t.destination ||
      prior.title !== title
    )
      bad(
        409,
        "This tracking ID already has a different destination.",
        "conflict",
      );
    return qrRecord(env, prior);
  }
  let row;
  try {
    row = await first(
      "INSERT INTO tracked_qrs(id,workspace_id,title,public_url,link_slug,destination,created_by) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM tracked_qrs WHERE workspace_id=?)<? RETURNING *",
      body.id,
      wid,
      title,
      `${publicOrigin(env, request)}/q/${body.id}`,
      t.linkSlug,
      t.destination,
      user.uid,
      wid,
      Number.isInteger(Number(env.MAX_TRACKED_QRS_PER_WORKSPACE)) && Number(env.MAX_TRACKED_QRS_PER_WORKSPACE)>0 && Number(env.MAX_TRACKED_QRS_PER_WORKSPACE)<=1000 ? Number(env.MAX_TRACKED_QRS_PER_WORKSPACE) : 200,
    );
  } catch (error) {
    const replay = await first(
      "SELECT * FROM tracked_qrs WHERE id=? AND workspace_id=?",
      body.id,
      wid,
    );
    if (
      replay &&
      replay.link_slug === t.linkSlug &&
      replay.destination === t.destination &&
      replay.title === title
    )
      return qrRecord(env, replay);
    throw error;
  }
  if (!row) bad(429, "Company tracked QR allowance reached.", "quota");
  return qrRecord(env, row);
}
export async function updateTracked(env, wid, body, id, request) {
  if (!uuid(id) || !Number.isInteger(body.version))
    bad(400, "Provide the saved tracking ID and version.");
  const { first } = dbHelpers(env.DB),
    prior = await first(
      "SELECT * FROM tracked_qrs WHERE id=? AND workspace_id=?",
      id,
      wid,
    );
  if (!prior) bad(404, "Tracked QR not found.", "not_found");
  const t =
    body.destination !== undefined || body.linkSlug !== undefined
      ? await target(env, wid, body, request)
      : { linkSlug: prior.link_slug, destination: prior.destination };
  const state = body.state ?? prior.state;
  if (!["active", "disabled"].includes(state))
    bad(400, "Choose active or disabled.");
  const row = await first(
    "UPDATE tracked_qrs SET link_slug=?,destination=?,state=?,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND workspace_id=? AND version=? RETURNING *",
    t.linkSlug,
    t.destination,
    state,
    id,
    wid,
    body.version,
  );
  if (!row) bad(409, "This tracked QR changed. Reopen it.", "conflict");
  return qrRecord(env, row);
}
export async function checkDesignTracking(env, wid, body) {
  if (!body.trackedQrId) return null;
  if (!uuid(body.trackedQrId)) bad(400, "Invalid tracking ID.");
  const { first } = dbHelpers(env.DB),
    row = await first(
      "SELECT * FROM tracked_qrs WHERE id=? AND workspace_id=? AND state='active'",
      body.trackedQrId,
      wid,
    );
  if (!row || row.public_url !== body.url)
    bad(404, "The tracked QR is not available in this company.", "not_found");
  return row.id;
}
const parseTime = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  )
    bad(400, "Use complete ISO UTC dates for from and to.");
  const n = Date.parse(value);
  if (
    !Number.isFinite(n) ||
    new Date(n).toISOString().replace(".000Z", "Z") !==
      value.replace(".000Z", "Z")
  )
    bad(400, "Invalid UTC date.");
  return n;
};
export function reportRange(params, retention) {
  const from = parseTime(params.get("from")),
    to = parseTime(params.get("to"));
  if (from >= to || to - from > retention * DAY || to > Date.now() + DAY)
    bad(400, `Choose a positive UTC interval of at most ${retention} days.`);
  const channel = params.get("channel") || "all";
  if (!["all", "link", "qr"].includes(channel))
    bad(400, "Choose all, link, or qr.");
  const type = params.get("assetType"),
    id = params.get("assetId");
  if (
    (type && !id) ||
    (!type && id) ||
    (type && !["link", "qr"].includes(type)) ||
    (type && channel !== "all" && type !== channel)
  )
    bad(400, "Choose a valid asset and matching channel.");
  for (const key of params.keys())
    if (
      !["from", "to", "channel", "assetType", "assetId", "format"].includes(key)
    )
      bad(400, "Unsupported analytics filter.");
  if (params.has("format") && !["csv", "json"].includes(params.get("format")))
    bad(400, "Choose JSON or CSV format.");
  return { from, to, channel, type, id };
}
function coverage(periods, from, to, cutoff, created = 0) {
  const start = Math.max(from, cutoff, created),
    end = Math.min(to, Date.now()),
    segments = [];
  for (const p of periods) {
    const a = Math.max(start, p.from),
      b = Math.min(end, p.to ?? end);
    if (b > a) segments.push({ from: a, to: b });
  }
  let measured = 0,
    cursor = start;
  for (const p of segments) {
    if (p.to > cursor) {
      measured += p.to - Math.max(cursor, p.from);
      cursor = p.to;
    }
  }
  return {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    measuredSince: segments.length
      ? new Date(segments[0].from).toISOString()
      : null,
    partial: measured < Math.max(0, end - from) || !segments.length,
    segments: segments.map((p) => ({
      from: new Date(p.from).toISOString(),
      to: new Date(p.to).toISOString(),
    })),
  };
}
export async function analyticsReport(env, wid, params) {
  const { first, all } = dbHelpers(env.DB),
    settings = await collectionSettings(env, wid),
    r = reportRange(params, settings.retentionDays),
    cutoff = Date.now() - settings.retentionDays * DAY;
  let selected = null;
  if (r.type) {
    selected = await first(
      r.type === "link"
        ? "SELECT slug AS id,created_at FROM links WHERE slug=? AND workspace_id=? AND legacy=0"
        : "SELECT id,created_at FROM tracked_qrs WHERE id=? AND workspace_id=?",
      r.id,
      wid,
    );
    if (!selected)
      bad(404, "The analytics asset is not in this company.", "not_found");
  }
  const created = selected ? Date.parse(selected.created_at) : 0,
    span = r.to - r.from,
    previousFrom = r.from - span;
  const conditions = ["workspace_id=?", "occurred_at>=?", "occurred_at<?"],
    args = [wid, Math.max(previousFrom, cutoff), r.to];
  if (r.channel !== "all") {
    conditions.push("asset_type=?");
    args.push(r.channel);
  }
  if (r.type) {
    conditions.push("asset_type=?", "asset_id=?");
    args.push(r.type, r.id);
  }
  const where = conditions.join(" AND ");
  const totals = await first(
    `SELECT SUM(CASE WHEN occurred_at>=? AND asset_type='link' THEN 1 ELSE 0 END) AS links,SUM(CASE WHEN occurred_at>=? AND asset_type='qr' THEN 1 ELSE 0 END) AS qr,SUM(CASE WHEN occurred_at<? THEN 1 ELSE 0 END) AS previous FROM engagement_events WHERE ${where}`,
    r.from,
    r.from,
    r.from,
    ...args,
  );
  const currentConditions = conditions.map((c) =>
      c === "occurred_at>=?" ? "occurred_at>=?" : c,
    ),
    currentArgs = [wid, Math.max(r.from, cutoff), r.to, ...args.slice(3)],
    currentWhere = currentConditions.join(" AND ");
  const daily = await all(
      `SELECT strftime('%Y-%m-%d',occurred_at/1000,'unixepoch') AS day,COUNT(*) AS visits FROM engagement_events WHERE ${currentWhere} GROUP BY day ORDER BY day`,
      ...currentArgs,
    ),
    byDay = new Map(daily.map((d) => [d.day, d.visits]));
  const series = [];
  for (let t = Math.floor(r.from / DAY) * DAY; t < r.to; t += DAY) {
    const day = new Date(t).toISOString().slice(0, 10);
    series.push({ day, visits: byDay.get(day) || 0 });
  }
  const rankings = await all(
    `SELECT asset_type,asset_id,COUNT(*) AS visits FROM engagement_events WHERE ${currentWhere} GROUP BY asset_type,asset_id ORDER BY visits DESC,asset_type,asset_id LIMIT 2000`,
    ...currentArgs,
  );
  const links = await all(
      "SELECT slug AS id,title,created_at FROM links WHERE workspace_id=? AND legacy=0 ORDER BY created_at DESC LIMIT 1000",
      wid,
    ),
    qrs = await all(
      "SELECT id,title,created_at,state FROM tracked_qrs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 1000",
      wid,
    );
  const counts = new Map(
    rankings.map((a) => [a.asset_type + ":" + a.asset_id, a.visits]),
  );
  const assets = [
    ...links.map((a) => ({ ...a, type: "link" })),
    ...qrs.map((a) => ({ ...a, type: "qr" })),
  ]
    .filter(
      (a) =>
        (r.channel === "all" || r.channel === a.type) &&
        (!r.type || (r.type === a.type && a.id === r.id)),
    )
    .map((a) => {
      const cov = coverage(
        settings.periods,
        r.from,
        r.to,
        cutoff,
        Date.parse(a.created_at),
      );
      return {
        id: a.id,
        type: a.type,
        title: a.title,
        state: a.state || "active",
        trackingStatus: cov.measuredSince ? "instrumented" : "not_instrumented",
        trackingSince: cov.measuredSince,
        visits: cov.measuredSince ? counts.get(a.type + ":" + a.id) || 0 : null,
      };
    });
  const breakdowns = {};
  for (const [name, column] of [
    ["countries", "country"],
    ["devices", "device"],
    ["browsers", "browser"],
    ["operatingSystems", "os"],
    ["referrers", "referrer_host"],
  ])
    breakdowns[name] = await all(
      `SELECT ${column} AS label,COUNT(*) AS visits FROM engagement_events WHERE ${currentWhere} GROUP BY ${column} ORDER BY visits DESC,label LIMIT 20`,
      ...currentArgs,
    );
  const currentCoverage = coverage(
      settings.periods,
      r.from,
      r.to,
      cutoff,
      created,
    ),
    priorCoverage = coverage(
      settings.periods,
      previousFrom,
      r.from,
      cutoff,
      created,
    );
  const current = Number(totals.links || 0) + Number(totals.qr || 0),
    previous = Number(totals.previous || 0),
    hasCoverage = !!currentCoverage.measuredSince;
  const health = await first(
    "SELECT COUNT(*) AS storedEvents,MAX(occurred_at) AS latestEventAt,MIN(occurred_at) AS oldestEventAt FROM engagement_events WHERE workspace_id=?",
    wid,
  );
  return {
    timezone: "UTC",
    filterVersion: FILTER_VERSION,
    bestEffort: true,
    filters: {
      from: new Date(r.from).toISOString(),
      to: new Date(r.to).toISOString(),
      channel: r.channel,
      assetType: r.type,
      assetId: r.id,
    },
    collection: {
      globalEnabled: settings.collection,
      workspaceEnabled: settings.workspaceEnabled,
      trackingSince: settings.trackingSince,
      retentionDays: settings.retentionDays,
    },
    coverage: currentCoverage,
    totals: hasCoverage
      ? {
          visits: current,
          linkVisits: Number(totals.links || 0),
          qrVisits: Number(totals.qr || 0),
        }
      : { visits: null, linkVisits: null, qrVisits: null },
    series: series.map((d) => ({
      ...d,
      visits:
        settings.periods.some(
          (p) =>
            p.from < Math.min(r.to, Date.parse(d.day) + DAY) &&
            (p.to ?? Date.now()) > Math.max(r.from, Date.parse(d.day), created),
        ) && Date.parse(d.day) + DAY > cutoff
          ? d.visits
          : null,
    })),
    comparison: {
      previous: priorCoverage.measuredSince ? previous : null,
      percent:
        previous > 0 && !currentCoverage.partial && !priorCoverage.partial
          ? ((current - previous) / previous) * 100
          : null,
      label:
        currentCoverage.partial || priorCoverage.partial
          ? "Partial measurement coverage"
          : previous === 0
            ? "No prior visits"
            : "Compared with the preceding equal UTC interval",
      coverage: priorCoverage,
    },
    assets,
    rankedAssets: rankings
      .slice(0, 50)
      .map((a) => ({
        ...a,
        title:
          assets.find((x) => x.type === a.asset_type && x.id === a.asset_id)
            ?.title || a.asset_id,
      })),
    breakdowns,
    staticDesigns: (
      await first(
        "SELECT COUNT(*) AS n FROM qr_designs WHERE workspace_id=? AND tracked_qr_id IS NULL",
        wid,
      )
    ).n,
    health: {
      storedEvents: health.storedEvents,
      latestEventAt: health.latestEventAt
        ? new Date(health.latestEventAt).toISOString()
        : null,
      pruningPending:
        health.oldestEventAt !== null && health.oldestEventAt < cutoff,
    },
  };
}
export function csvCell(value) {
  let s = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
export function reportCSV(report) {
  const rows = [
    ["Type", "Key", "Visits", "From UTC", "To UTC"],
    [
      "coverage",
      report.coverage.partial ? "partial" : "complete",
      "",
      report.filters.from,
      report.filters.to,
    ],
    ["timezone", "UTC"],
    ["filter_policy", report.filterVersion],
    ["total", "link_visits", report.totals.linkVisits],
    ["total", "qr_visits", report.totals.qrVisits],
    ["comparison", report.comparison.label, report.comparison.previous],
    ...report.series.map((d) => ["day", d.day, d.visits]),
    ...report.assets.map((a) => [
      "asset",
      a.title,
      a.visits,
      a.trackingSince || "not instrumented",
      a.type + ":" + a.id,
    ]),
    ...Object.entries(report.breakdowns).flatMap(([kind, items]) =>
      items.map((i) => [kind, i.label, i.visits]),
    ),
  ];
  return "\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
export async function prune(env) {
  if (!env.DB) return;
  const { s, first } = dbHelpers(env.DB),
    cutoff = Date.now() - flags(env).retentionDays * DAY;
  for (let i = 0; i < 10; i++) {
    const result = await s(
      "DELETE FROM engagement_events WHERE id IN (SELECT id FROM engagement_events WHERE occurred_at<? ORDER BY occurred_at LIMIT 1000)",
      cutoff,
    ).run();
    if ((result.meta?.changes ?? result.changes ?? 0) < 1000) break;
  }
  await s(
    "DELETE FROM analytics_periods WHERE ended_at IS NOT NULL AND ended_at<?",
    cutoff,
  ).run();
  const pending = await first(
    "SELECT 1 AS n FROM engagement_events WHERE occurred_at<? LIMIT 1",
    cutoff,
  );
  if (pending)
    console.warn(
      JSON.stringify({
        component: "tinytrail-analytics",
        operation: "retention_prune",
        status: "more_rows_pending",
      }),
    );
}

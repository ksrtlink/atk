import {
  collect,
  flags,
  analyticsReport,
  reportCSV,
  collectionSettings,
  changeSettings,
  createTracked,
  updateTracked,
  qrRecord,
  checkDesignTracking,
  prune,
  operationalFailure,
} from "./analytics.mjs";
import { verifyFirebaseToken } from "./auth.mjs";
import {
  Problem,
  publicOrigin,
  linkInput,
  designInput,
  linkRecord,
  designRecord,
} from "./domain.mjs";
const security = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      ...security,
      "Content-Type": "application/json;charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
const fail = (status, message, code = "validation") => {
  throw new Problem(status, message, code);
};
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const limit = (value) =>
  Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 1000
    ? Number(value)
    : 200;
const text = (value, max = 100) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(400, `Enter text of up to ${max} characters.`);
  return value.trim();
};
const email = (value) => {
  const s = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail(400, "Enter a valid email.");
  return s;
};
async function hash(value) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function bodyJSON(request) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    fail(415, "Send JSON data.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "Missing request body.");
  let length = 0,
    chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 200000) {
      await reader.cancel();
      fail(413, "The request is too large.");
    }
    chunks.push(value);
  }
  try {
    const bytes = new Uint8Array(length);
    let i = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, i);
      i += chunk.length;
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || Array.isArray(data) || typeof data !== "object") throw Error();
    return data;
  } catch {
    fail(400, "Invalid JSON data.");
  }
}
export function createApp(authenticate = verifyFirebaseToken) {
  return {
    async fetch(request, env, ctx) {
      try {
        const url = new URL(request.url),
          path = url.pathname,
          method = request.method;
        if (!path.startsWith("/api/")) {
          if (!["GET", "HEAD"].includes(method))
            return new Response("Method not allowed", {
              status: 405,
              headers: { ...security, Allow: "GET, HEAD" },
            });
          const qrRoute = path.match(/^\/q\/([0-9a-f-]{36})\/?$/);
          if (qrRoute) {
            if (!env.DB) fail(503, "Storage unavailable.");
            const row = await env.DB.prepare(
              "SELECT q.*,l.destination AS link_destination FROM tracked_qrs q LEFT JOIN links l ON l.slug=q.link_slug AND l.workspace_id=q.workspace_id WHERE q.id=?",
            )
              .bind(qrRoute[1])
              .first();
            if (!row)
              return new Response("This QR code was not found.", {
                status: 404,
                headers: security,
              });
            if (row.state !== "active")
              return new Response("This QR code is currently disabled.", {
                status: 410,
                headers: { ...security, "Cache-Control": "no-store" },
              });
            const destination = row.link_slug
              ? row.link_destination
              : row.destination;
            if (!destination)
              return new Response("This destination is unavailable.", {
                status: 503,
                headers: security,
              });
            const checked = linkInput(
              { slug: "qr-target", destination },
              env,
              request,
            );
            const response = new Response(null, {
              status: 302,
              headers: {
                ...security,
                Location: checked.destination,
                "Cache-Control": "no-store",
              },
            });
            collect(request, env, ctx, {
              workspace_id: row.workspace_id,
              type: "qr",
              id: row.id,
            });
            return response;
          }
          const redirect = path.match(/^\/r\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
          if (redirect) {
            if (!env.DB) fail(503, "Storage unavailable.");
            const row = await env.DB.prepare(
              "SELECT destination,workspace_id,slug FROM links WHERE slug=?",
            )
              .bind(redirect[1])
              .first();
            if (!row)
              return new Response("This short link was not found.", {
                status: 404,
                headers: security,
              });
            const response = new Response(null, {
              status: 302,
              headers: {
                ...security,
                Location: row.destination,
                "Cache-Control": "no-store",
              },
            });
            collect(request, env, ctx, {
              workspace_id: row.workspace_id,
              type: "link",
              id: row.slug,
            });
            return response;
          }
          return env.ASSETS
            ? env.ASSETS.fetch(request)
            : new Response("Not found", { status: 404 });
        }
        if (
          request.headers.get("Origin") &&
          request.headers.get("Origin") !== url.origin
        )
          fail(403, "Cross-origin requests are not allowed.", "forbidden");
        if (path === "/api/config" && method === "GET")
          return json({
            authReady: !!(env.FIREBASE_PROJECT_ID && env.FIREBASE_API_KEY),
            firebase: {
              projectId: env.FIREBASE_PROJECT_ID || "",
              apiKey: env.FIREBASE_API_KEY || "",
            },
            publicOrigin: publicOrigin(env, request),
            features: { analytics: true, trackedQR: flags(env).creation },
          });
        if (!env.DB) fail(503, "Storage is not configured.", "configuration");
        const header = request.headers.get("Authorization") || "";
        if (!header.startsWith("Bearer "))
          fail(401, "Sign in to your workspace.", "unauthenticated");
        let user;
        try {
          user = await authenticate(header.slice(7), env);
        } catch {
          fail(
            401,
            "Your session expired. Please sign in again.",
            "unauthenticated",
          );
        }
        if (!user.verified)
          fail(403, "Verify your email before continuing.", "email_unverified");
        const domains = (env.ALLOWED_EMAIL_DOMAINS || "")
          .split(",")
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean);
        const adminEmails = (env.ADMIN_EMAILS || "")
          .split(",")
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean);
        const admin = adminEmails.includes(user.email);
        if (
          !admin &&
          domains.length &&
          !domains.includes(user.email.split("@").pop())
        )
          fail(403, "This email domain does not have access.", "email_domain");
        const db = env.DB,
          stmt = (q, ...args) => db.prepare(q).bind(...args),
          first = (q, ...args) => stmt(q, ...args).first(),
          all = async (q, ...args) => (await stmt(q, ...args).all()).results;
        await stmt(
          "INSERT INTO users(uid,email,display_name) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET email=excluded.email,display_name=excluded.display_name",
          user.uid,
          user.email,
          user.name || "",
        ).run();
        const personalId = "personal-" + user.uid;
        await stmt("INSERT OR IGNORE INTO workspaces(id,name,kind,personal_owner_uid) VALUES(?,'Personal workspace','personal',?)", personalId, user.uid).run();
        const personal = await first("SELECT * FROM workspaces WHERE id=? AND kind='personal' AND personal_owner_uid=?", personalId, user.uid);
        if (!personal) fail(503, "Your personal workspace could not be opened.");
        personal.role = "owner";
        personal.bulkRows = 10;
        if (admin) {
          await db.batch([
            stmt(
              "INSERT OR IGNORE INTO workspaces(id,name) VALUES('tinytrail-internal','TinyTrail internal')",
            ),
            stmt(
              "INSERT OR IGNORE INTO memberships(workspace_id,uid,role) VALUES('tinytrail-internal',?,'owner')",
              user.uid,
            ),
          ]);
        }
        const memberships = await all(
          "SELECT w.*,m.role FROM workspaces w JOIN memberships m ON m.workspace_id=w.id WHERE m.uid=? ORDER BY w.created_at",
          user.uid,
        );
        if (path === "/api/me" && method === "GET")
          return json({
            user: { uid: user.uid, email: user.email, name: user.name },
            platformAdmin: admin,
            personalWorkspace: personal,
            workspaces: admin || memberships.length === 1 ? memberships : [],
            assignedWorkspaceId: !admin && memberships.length === 1 ? memberships[0].id : null,
            canSwitchCompanies: admin && memberships.length > 1,
            companyAccessIssue: !admin && memberships.length > 1 ? "multiple_assignments" : null,
            accessRequest: await first(
              "SELECT * FROM access_requests WHERE uid=?",
              user.uid,
            ),
            legacyCounts: {
              links: (
                await first(
                  "SELECT COUNT(*) AS n FROM links WHERE owner_uid=? AND workspace_id IS NULL AND legacy=0",
                  user.uid,
                )
              ).n,
              designs: (
                await first(
                  "SELECT COUNT(*) AS n FROM qr_designs WHERE owner_uid=? AND workspace_id IS NULL",
                  user.uid,
                )
              ).n,
            },
          });
        if (path === "/api/access-requests" && method === "POST") {
          const b = await bodyJSON(request),
            company = text(b.company),
            website = new URL(text(b.website, 500));
          if (
            website.protocol !== "https:" ||
            website.username ||
            website.password
          )
            fail(400, "Enter a company HTTPS website.");
          const old = await first(
            "SELECT * FROM access_requests WHERE uid=?",
            user.uid,
          );
          if (old) return json({ request: old });
          if (!admin && memberships.length)
            fail(409, "Your account already has an assigned company. Contact the platform administrator to change it.", "company_assignment");
          await stmt(
            "INSERT INTO access_requests(uid,company,website,use_case) VALUES(?,?,?,?)",
            user.uid,
            company,
            website.href,
            text(b.useCase, 1000),
          ).run();
          return json(
            {
              request: await first(
                "SELECT * FROM access_requests WHERE uid=?",
                user.uid,
              ),
            },
            201,
          );
        }
        if (path.startsWith("/api/admin/") || path === "/api/legacy") {
          if (!admin)
            fail(
              403,
              "Platform administrator access is required.",
              "forbidden",
            );
          if (path === "/api/legacy" && method === "GET")
            return json({
              links: (
                await all("SELECT * FROM links WHERE legacy=1 ORDER BY slug")
              ).map(linkRecord),
            });
          if (path === "/api/admin/requests" && method === "GET")
            return json({
              requests: await all(
                "SELECT a.*,u.email FROM access_requests a JOIN users u ON u.uid=a.uid ORDER BY a.created_at DESC",
              ),
            });
          const match = path.match(/^\/api\/admin\/requests\/([^/]+)$/);
          if (match && method === "POST") {
            const b = await bodyJSON(request),
              r = await first(
                "SELECT * FROM access_requests WHERE uid=?",
                decodeURIComponent(match[1]),
              );
            if (!r) fail(404, "Request not found.");
            if (r.status !== "pending") return json({ request: r });
            if (b.action === "decline") {
              await stmt(
                "UPDATE access_requests SET status='declined' WHERE uid=? AND status='pending'",
                r.uid,
              ).run();
              return json({ ok: true });
            }
            if (b.action !== "approve") fail(400, "Choose approve or decline.");
            const targetUser = await first("SELECT email FROM users WHERE uid=?", r.uid),
              targetAdmin = adminEmails.includes(targetUser?.email),
              assigned = await first("SELECT workspace_id FROM memberships WHERE uid=? LIMIT 1", r.uid);
            if (!targetAdmin && assigned)
              fail(409, "This account already has an assigned company. Resolve its assignment before approving another company.", "company_assignment");
            const id = "company-" + r.uid;
            await db.batch([
              stmt(
                "INSERT INTO workspaces(id,name,website) SELECT ?,?,? WHERE ? OR NOT EXISTS(SELECT 1 FROM memberships WHERE uid=?)",
                id,
                r.company,
                r.website,
                targetAdmin ? 1 : 0,
                r.uid,
              ),
              stmt(
                "INSERT INTO memberships(workspace_id,uid,role) SELECT id,?,'owner' FROM workspaces WHERE id=? AND (? OR NOT EXISTS(SELECT 1 FROM memberships WHERE uid=?))",
                r.uid,
                id,
                targetAdmin ? 1 : 0,
                r.uid,
              ),
              stmt(
                "UPDATE access_requests SET status='approved',workspace_id=? WHERE uid=? AND status='pending' AND EXISTS(SELECT 1 FROM memberships WHERE uid=? AND workspace_id=?)",
                id,
                r.uid,
                r.uid,
                id,
              ),
            ]);
            if (!(await first("SELECT 1 FROM memberships WHERE uid=? AND workspace_id=?", r.uid, id)))
              fail(409, "The company assignment changed. Refresh this request.", "company_assignment");
            return json({ workspaceId: id });
          }
          fail(404, "Endpoint not found.");
        }
        if (path === "/api/invitations/accept" && method === "POST") {
          const b = await bodyJSON(request),
            digest = await hash(text(b.token, 200));
          const invite = await first(
            "SELECT * FROM invitations WHERE token_hash=?",
            digest,
          );
          if (
            !invite ||
            invite.email !== user.email ||
            invite.expires_at < Date.now() ||
            invite.accepted_by
          )
            fail(
              403,
              "This invitation is expired, already used, or belongs to another email.",
              "invitation",
            );
          if (!admin && memberships.some(w => w.id !== invite.workspace_id))
            fail(409, "Your account already belongs to another company. Contact the platform administrator to change your assignment.", "company_assignment");
          await db.batch([
            stmt(
              "INSERT OR IGNORE INTO memberships(workspace_id,uid,role) SELECT workspace_id,?,'member' FROM invitations WHERE id=? AND accepted_by IS NULL AND expires_at>? AND email=? AND (? OR NOT EXISTS(SELECT 1 FROM memberships WHERE uid=? AND workspace_id<>?))",
              user.uid,
              invite.id,
              Date.now(),
              user.email,
              admin ? 1 : 0,
              user.uid,
              invite.workspace_id,
            ),
            stmt(
              "UPDATE invitations SET accepted_by=? WHERE id=? AND accepted_by IS NULL AND email=? AND EXISTS(SELECT 1 FROM memberships WHERE uid=? AND workspace_id=?)",
              user.uid,
              invite.id,
              user.email,
              user.uid,
              invite.workspace_id,
            ),
          ]);
          if (!(await first("SELECT 1 FROM memberships WHERE uid=? AND workspace_id=?", user.uid, invite.workspace_id)))
            fail(409, "Your company assignment changed. Contact the platform administrator.", "company_assignment");
          return json({ workspaceId: invite.workspace_id });
        }
        const assigned = !admin && memberships.length === 1 ? memberships[0] : null;
        const wid = request.headers.get("X-Workspace-Id") || assigned?.id || personal.id,
          isPersonal = wid === personal.id,
          membership = isPersonal ? personal : memberships.find((w) => w.id === wid);
        if (!membership || (!isPersonal && !admin && assigned?.id !== wid))
          fail(403, "Your account does not have access to this company. Contact your administrator.", "membership");
        if (isPersonal) env = {...env, MAX_TRACKED_QRS_PER_WORKSPACE: "25"};
        const owner = () => {
          if (membership.role !== "owner")
            fail(403, "Company owner access is required.", "forbidden");
        };
        if (path === "/api/analytics/settings" && method === "GET")
          return json(await collectionSettings(env, wid));
        if (path === "/api/analytics/settings" && method === "POST")
          return json(
            await changeSettings(
              env,
              wid,
              membership.role,
              (await bodyJSON(request)).enabled,
            ),
          );
        if (path === "/api/analytics" && method === "GET") {
          let report;
          try {
            report = await analyticsReport(env, wid, url.searchParams);
          } catch (error) {
            if (!(error instanceof Problem)) operationalFailure("report_query");
            throw error;
          }
          if (url.searchParams.get("format") === "csv")
            return new Response(reportCSV(report), {
              headers: {
                ...security,
                "Cache-Control": "private, no-store",
                "Content-Type": "text/csv;charset=utf-8",
                "Content-Disposition":
                  'attachment; filename="tinytrail-analytics.csv"',
              },
            });
          return json(report);
        }
        if (path === "/api/tracked-qrs" && method === "GET") {
          const rows = await all(
            "SELECT q.*,l.short_url AS link_short_url,l.destination AS link_destination FROM tracked_qrs q LEFT JOIN links l ON l.slug=q.link_slug AND l.workspace_id=q.workspace_id WHERE q.workspace_id=? ORDER BY q.created_at DESC LIMIT 1000",
            wid,
          );
          return json({
            assets: await Promise.all(rows.map((row) => qrRecord(env, row))),
          });
        }
        if (path === "/api/tracked-qrs" && method === "POST")
          return json(
            {
              asset: await createTracked(
                env,
                wid,
                user,
                await bodyJSON(request),
                request,
              ),
            },
            201,
          );
        const qm = path.match(/^\/api\/tracked-qrs\/([0-9a-f-]{36})$/);
        if (qm && method === "GET") {
          const row = await first(
            "SELECT * FROM tracked_qrs WHERE id=? AND workspace_id=?",
            qm[1],
            wid,
          );
          if (!row) fail(404, "Tracked QR not found.", "not_found");
          return json({ asset: await qrRecord(env, row) });
        }
        if (qm && method === "PATCH")
          return json({
            asset: await updateTracked(
              env,
              wid,
              await bodyJSON(request),
              qm[1],
              request,
            ),
          });
        const maxLinks = isPersonal ? 25 : limit(env.MAX_LINKS_PER_WORKSPACE),
          maxDesigns = isPersonal ? 25 : limit(env.MAX_DESIGNS_PER_WORKSPACE),
          maxBulkRows = isPersonal ? 10 : 100;
        async function saveLink(body, key) {
          const data = linkInput(body, env, request);
          if (!uuid(key)) fail(400, "A valid request ID is required.");
          const prior = await first(
            "SELECT * FROM links WHERE workspace_id=? AND request_id=?",
            wid,
            key,
          );
          if (prior) {
            if (
              prior.workspace_id !== wid ||
              prior.slug !== data.slug ||
              prior.destination !== data.destination
            )
              fail(
                409,
                "Request ID already used for a different link.",
                "conflict",
              );
            return linkRecord(prior);
          }
          let row;
          try {
            row = await first(
              "INSERT INTO links(slug,destination,title,owner_uid,short_url,request_id,workspace_id,updated_by) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM links WHERE workspace_id=?)<? RETURNING *",
              data.slug,
              data.destination,
              data.title,
              user.uid,
              `${publicOrigin(env, request)}/r/${data.slug}`,
              key,
              wid,
              user.uid,
              wid,
              maxLinks,
            );
          } catch (e) {
            if (String(e).includes("UNIQUE")) {
              const replay = await first(
                "SELECT * FROM links WHERE workspace_id=? AND request_id=?",
                wid,
                key,
              );
              if (
                replay &&
                replay.slug === data.slug &&
                replay.destination === data.destination
              )
                return linkRecord(replay);
              fail(409, "That short name is already in use.", "conflict");
            }
            throw e;
          }
          if (!row) fail(429, "Workspace link allowance reached.", "quota");
          return linkRecord(row);
        }
        async function saveDesign(body) {
          const data = designInput(body);
          const trackedQrId = await checkDesignTracking(env, wid, body);
          if (!uuid(body.id)) fail(400, "A valid design ID is required.");
          const prior = await first(
            "SELECT * FROM qr_designs WHERE id=?",
            body.id,
          );
          if (prior) {
            if (prior.workspace_id !== wid)
              fail(404, "Design not found.", "not_found");
            if (!Number.isInteger(body.version)) {
              if (
                prior.title === data.title &&
                prior.url === data.url &&
                prior.settings_json === JSON.stringify(data.settings) &&
                (prior.tracked_qr_id || null) === trackedQrId
              )
                return designRecord(prior);
              fail(409, "Reopen the saved design before editing.", "conflict");
            }
            const row = await first(
              "UPDATE qr_designs SET title=?,url=?,settings_json=?,version=version+1,updated_by=?,tracked_qr_id=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND workspace_id=? AND version=? RETURNING *",
              data.title,
              data.url,
              JSON.stringify(data.settings),
              user.uid,
              trackedQrId,
              body.id,
              wid,
              body.version,
            );
            if (!row) fail(409, "This design changed. Reopen it.", "conflict");
            return designRecord(row);
          }
          let row;
          try {
            row = await first(
              "INSERT INTO qr_designs(id,owner_uid,title,url,settings_json,workspace_id,updated_by,tracked_qr_id) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM qr_designs WHERE workspace_id=?)<? RETURNING *",
              body.id,
              user.uid,
              data.title,
              data.url,
              JSON.stringify(data.settings),
              wid,
              user.uid,
              trackedQrId,
              wid,
              maxDesigns,
            );
          } catch (error) {
            if (!String(error).includes("UNIQUE")) throw error;
            const replay = await first(
              "SELECT * FROM qr_designs WHERE id=? AND workspace_id=?",
              body.id,
              wid,
            );
            if (
              replay &&
              replay.title === data.title &&
              replay.url === data.url &&
              replay.settings_json === JSON.stringify(data.settings) &&
              (replay.tracked_qr_id || null) === trackedQrId
            )
              return designRecord(replay);
            fail(
              409,
              "This design was saved by another request. Reopen it.",
              "conflict",
            );
          }
          if (!row) fail(429, "Workspace QR allowance reached.", "quota");
          return designRecord(row);
        }
        if (path === "/api/workspace" && method === "GET")
          return json({
            workspace: membership,
            members: await all(
              "SELECT m.uid,m.role,u.email FROM memberships m JOIN users u ON u.uid=m.uid WHERE m.workspace_id=?",
              wid,
            ),
            limits: { links: maxLinks, designs: maxDesigns, bulkRows: maxBulkRows },
          });
        if (path === "/api/members" && method === "DELETE") {
          if (isPersonal) fail(403, "Personal workspaces cannot have team members.");
          owner();
          const b = await bodyJSON(request);
          const result = await stmt(
            "DELETE FROM memberships WHERE workspace_id=? AND uid=? AND (role<>'owner' OR (SELECT COUNT(*) FROM memberships WHERE workspace_id=? AND role='owner')>1)",
            wid,
            text(b.uid, 128),
            wid,
          ).run();
          if (!result.meta?.changes && !result.changes)
            fail(
              409,
              "Cannot remove the last company owner or an unknown member.",
            );
          return json({ ok: true });
        }
        if (path === "/api/invitations" && method === "POST") {
          if (isPersonal) fail(403, "Personal workspaces cannot invite members.");
          owner();
          const b = await bodyJSON(request),
            inviteEmail = email(b.email);
          if (
            (
              await first(
                "SELECT COUNT(*) AS n FROM invitations WHERE workspace_id=? AND accepted_by IS NULL AND expires_at>?",
                wid,
                Date.now(),
              )
            ).n >= 100
          )
            fail(429, "Too many outstanding invitations.");
          const value = crypto.randomUUID() + crypto.randomUUID(),
            id = crypto.randomUUID();
          await stmt(
            "INSERT INTO invitations(id,workspace_id,email,token_hash,expires_at,created_by) VALUES(?,?,?,?,?,?)",
            id,
            wid,
            inviteEmail,
            await hash(value),
            Date.now() + 7 * 86400000,
            user.uid,
          ).run();
          return json(
            {
              url: `${publicOrigin(env, request)}/manage/#invite=${value}`,
              expiresInDays: 7,
            },
            201,
          );
        }
        if (path === "/api/transfer" && method === "GET")
          return json({
            links: (
              await all(
                "SELECT * FROM links WHERE owner_uid=? AND workspace_id IS NULL AND legacy=0",
                user.uid,
              )
            ).map(linkRecord),
            designs: (
              await all(
                "SELECT * FROM qr_designs WHERE owner_uid=? AND workspace_id IS NULL",
                user.uid,
              )
            ).map(designRecord),
          });
        if (path === "/api/transfer" && method === "POST") {
          const b = await bodyJSON(request);
          if (b.confirm !== true)
            fail(400, "Confirm the shared company transfer.");
          // Transactional guarded updates prevent concurrent transfers from exceeding allowances.
          const guard = `(SELECT COUNT(*) FROM links WHERE workspace_id=?) + (SELECT COUNT(*) FROM links WHERE owner_uid=? AND workspace_id IS NULL AND legacy=0)<=? AND (SELECT COUNT(*) FROM qr_designs WHERE workspace_id=?) + (SELECT COUNT(*) FROM qr_designs WHERE owner_uid=? AND workspace_id IS NULL)<=?`;
          const results = await db.batch([
            stmt(
              `UPDATE links SET workspace_id=?,updated_by=? WHERE owner_uid=? AND workspace_id IS NULL AND legacy=0 AND ${guard}`,
              wid,
              user.uid,
              user.uid,
              wid,
              user.uid,
              maxLinks,
              wid,
              user.uid,
              maxDesigns,
            ),
            stmt(
              `UPDATE qr_designs SET workspace_id=?,updated_by=? WHERE owner_uid=? AND workspace_id IS NULL AND ${guard}`,
              wid,
              user.uid,
              user.uid,
              wid,
              user.uid,
              maxLinks,
              wid,
              user.uid,
              maxDesigns,
            ),
          ]);
          const remaining = (
            await first(
              "SELECT (SELECT COUNT(*) FROM links WHERE owner_uid=? AND workspace_id IS NULL AND legacy=0)+(SELECT COUNT(*) FROM qr_designs WHERE owner_uid=? AND workspace_id IS NULL) AS n",
              user.uid,
              user.uid,
            )
          ).n;
          if (remaining)
            fail(
              429,
              "Transfer exceeds your company allowance. No remaining records were transferred.",
              "quota",
            );
          return json({ ok: true });
        }
        if (path === "/api/availability" && method === "POST") {
          const b = await bodyJSON(request);
          if (!Array.isArray(b.slugs) || b.slugs.length > 100)
            fail(400, "Check up to 100 short names.");
          const names = b.slugs.filter(
            (s) => typeof s === "string" && s.length <= 64,
          );
          return json({
            unavailable: (
              await all(
                "SELECT slug FROM links WHERE slug IN (SELECT value FROM json_each(?))",
                JSON.stringify(names),
              )
            ).map((r) => r.slug),
          });
        }
        if (path === "/api/links" && method === "GET")
          return json({
            links: (
              await all(
                "SELECT * FROM links WHERE workspace_id=? ORDER BY created_at DESC LIMIT 1000",
                wid,
              )
            ).map(linkRecord),
          });
        if (path === "/api/links" && method === "POST")
          return json(
            {
              link: await saveLink(
                await bodyJSON(request),
                request.headers.get("Idempotency-Key"),
              ),
            },
            201,
          );
        const lm = path.match(/^\/api\/links\/([a-z0-9-]+)$/);
        if (lm && method === "PATCH") {
          const b = await bodyJSON(request),
            data = linkInput(
              { slug: lm[1], destination: b.destination },
              env,
              request,
            );
          if (!Number.isInteger(b.version))
            fail(400, "Saved version is required.");
          const old = await first(
            "SELECT * FROM links WHERE slug=? AND workspace_id=? AND legacy=0",
            lm[1],
            wid,
          );
          if (!old) fail(404, "Link not found.", "not_found");
          const row = await first(
            "UPDATE links SET destination=?,version=version+1,updated_by=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug=? AND workspace_id=? AND version=? RETURNING *",
            data.destination,
            user.uid,
            lm[1],
            wid,
            b.version,
          );
          if (!row)
            fail(409, "This link changed. Refresh before editing.", "conflict");
          return json({ link: linkRecord(row) });
        }
        if (path === "/api/designs" && method === "GET")
          return json({
            designs: (
              await all(
                "SELECT * FROM qr_designs WHERE workspace_id=? ORDER BY updated_at DESC LIMIT 1000",
                wid,
              )
            ).map(designRecord),
          });
        if (path === "/api/designs" && method === "POST")
          return json(
            { design: await saveDesign(await bodyJSON(request)) },
            201,
          );
        if (path === "/api/presets" && method === "GET")
          return json({
            presets: (
              await all(
                "SELECT * FROM presets WHERE workspace_id=? ORDER BY name",
                wid,
              )
            ).map((p) => ({
              id: p.id,
              name: p.name,
              settings: JSON.parse(p.settings_json),
            })),
          });
        if (path === "/api/presets" && method === "POST") {
          const b = await bodyJSON(request),
            d = designInput({
              title: text(b.name),
              url: "https://example.com/",
              settings: b.settings,
            });
          if (
            (
              await first(
                "SELECT COUNT(*) AS n FROM presets WHERE workspace_id=?",
                wid,
              )
            ).n >= 30
          )
            fail(429, "Company preset allowance reached.");
          await stmt(
            "INSERT INTO presets(id,workspace_id,name,settings_json,created_by) VALUES(?,?,?,?,?)",
            crypto.randomUUID(),
            wid,
            d.title,
            JSON.stringify(d.settings),
            user.uid,
          ).run();
          return json({ ok: true }, 201);
        }
        if (path === "/api/bulk" && method === "GET")
          return json({
            jobs: await all(
              "SELECT * FROM bulk_jobs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 50",
              wid,
            ),
          });
        if (path === "/api/bulk" && method === "POST") {
          const b = await bodyJSON(request);
          if (
            !uuid(b.id) ||
            !["links", "qr", "both"].includes(b.mode) ||
            !Array.isArray(b.rows) ||
            !b.rows.length ||
            b.rows.length > maxBulkRows
          )
            fail(400, `Choose 1–${maxBulkRows} rows and a supported workflow.`);
          const settings = designInput({
            title: "Batch",
            url: "https://example.com/",
            settings: b.settings,
          }).settings;
          const rows = b.rows.map((r, i) => {
            const input = {
              title: text(r.title || `QR ${i + 1}`),
              url: text(r.url, 4096),
              slug: r.slug || "",
              key: crypto.randomUUID(),
              designId: crypto.randomUUID(),
              trackingId: crypto.randomUUID(),
            };
            if (b.mode !== "qr")
              linkInput(
                { slug: input.slug, destination: input.url },
                env,
                request,
              );
            if (b.mode !== "links")
              designInput({
                title: input.title,
                url:
                  b.mode === "qr" && b.tracked !== true
                    ? input.url
                    : "https://example.com/",
                settings,
              });
            if (b.mode === "qr" && b.tracked === true)
              linkInput(
                { slug: "qr-target", destination: input.url },
                env,
                request,
              );
            if (
              r.trackedQrId !== undefined ||
              r.assetId !== undefined ||
              r.linkSlug !== undefined
            )
              fail(
                400,
                "Bulk rows accept destination URLs, not existing asset IDs.",
              );
            return input;
          });
          if (b.tracked !== undefined && typeof b.tracked !== "boolean")
            fail(400, "Choose tracked or static QR mode.");
          if (b.tracked === true && !flags(env).creation)
            fail(
              409,
              "New tracked QR codes are disabled for this deployment.",
              "feature_disabled",
            );
          const existing = await first(
            "SELECT * FROM bulk_jobs WHERE id=?",
            b.id,
          );
          if (existing) {
            if (existing.workspace_id !== wid) fail(404, "Job not found.");
            return json({ id: b.id });
          }
          if (
            (
              await first(
                "SELECT COUNT(*) AS n FROM bulk_jobs WHERE workspace_id=?",
                wid,
              )
            ).n >= (isPersonal ? 10 : 200)
          )
            fail(429, "Company batch allowance reached.");
          await db.batch([
            stmt(
              "INSERT INTO bulk_jobs(id,workspace_id,created_by,mode,settings_json,tracked) VALUES(?,?,?,?,?,?)",
              b.id,
              wid,
              user.uid,
              b.mode,
              JSON.stringify(settings),
              b.tracked === true ? 1 : 0,
            ),
            stmt(
              "INSERT INTO bulk_rows(job_id,row_index,input_json) SELECT ?,CAST(key AS INTEGER),value FROM json_each(?)",
              b.id,
              JSON.stringify(rows),
            ),
          ]);
          return json({ id: b.id }, 201);
        }
        const bm = path.match(/^\/api\/bulk\/([0-9a-f-]+)(\/run)?$/);
        if (bm) {
          const job = await first(
            "SELECT * FROM bulk_jobs WHERE id=? AND workspace_id=?",
            bm[1],
            wid,
          );
          if (!job) fail(404, "Job not found.", "not_found");
          if (method === "POST" && bm[2]) {
            const b = await bodyJSON(request);
            if (b.retry)
              await stmt(
                "UPDATE bulk_rows SET error=NULL WHERE job_id=? AND result_json IS NULL",
                job.id,
              ).run();
            const rows = await all(
              "SELECT * FROM bulk_rows WHERE job_id=? AND result_json IS NULL AND error IS NULL ORDER BY row_index LIMIT 5",
              job.id,
            );
            for (const row of rows) {
              const input = JSON.parse(row.input_json);
              try {
                let link = null,
                  design = null;
                if (job.mode !== "qr")
                  link = await saveLink(
                    { slug: input.slug, destination: input.url },
                    input.key,
                  );
                let tracking = null;
                if (job.mode !== "links" && job.tracked)
                  tracking = await createTracked(
                    env,
                    wid,
                    user,
                    {
                      id: input.trackingId,
                      title: input.title,
                      ...(link
                        ? { linkSlug: link.slug }
                        : { destination: input.url }),
                    },
                    request,
                  );
                if (job.mode !== "links")
                  design = await saveDesign({
                    id: input.designId,
                    title: input.title,
                    url: tracking?.publicUrl || link?.shortUrl || input.url,
                    settings: JSON.parse(job.settings_json),
                    ...(tracking ? { trackedQrId: tracking.id } : {}),
                  });
                await stmt(
                  "UPDATE bulk_rows SET result_json=?,error=NULL WHERE job_id=? AND row_index=?",
                  JSON.stringify({
                    title: input.title,
                    url: design?.url || link.shortUrl,
                    link,
                    design,
                  }),
                  job.id,
                  row.row_index,
                ).run();
              } catch (e) {
                if (!(e instanceof Problem)) throw e;
                await stmt(
                  "UPDATE bulk_rows SET error=? WHERE job_id=? AND row_index=? AND result_json IS NULL",
                  e.message,
                  job.id,
                  row.row_index,
                ).run();
              }
            }
          } else if (method !== "GET" || bm[2])
            fail(404, "Endpoint not found.");
          return json({
            job: {
              id: job.id,
              mode: job.mode,
              tracked: !!job.tracked,
              settings: JSON.parse(job.settings_json),
            },
            rows: (
              await all(
                "SELECT * FROM bulk_rows WHERE job_id=? ORDER BY row_index",
                job.id,
              )
            ).map((r) => ({
              index: r.row_index,
              input: JSON.parse(r.input_json),
              result: r.result_json ? JSON.parse(r.result_json) : null,
              error: r.error,
            })),
          });
        }
        fail(404, "Endpoint not found.", "not_found");
      } catch (error) {
        if (error instanceof Problem)
          return json({ error: error.message, code: error.code }, error.status);
        if (error instanceof TypeError)
          return json(
            { error: "Check the submitted values.", code: "validation" },
            400,
          );
        return json(
          {
            error:
              "The service could not complete this request. Please try again.",
            code: "service_error",
          },
          503,
        );
      }
    },
    async scheduled(controller, env, ctx) {
      const task = prune(env).catch(() => operationalFailure("retention_prune"));
      if (ctx?.waitUntil) ctx.waitUntil(task);
      else await task;
    },
  };
}
const app = createApp();
export default {
  fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  },
  scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};

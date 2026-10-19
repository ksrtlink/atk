import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { createApp } from "../src/worker.mjs";
const migrations = await Promise.all(
  ["0001_schema.sql", "0002_original_links.sql", "0003_enterprise.sql", "0004_analytics.sql", "0005_personal.sql", "0006_link_trash.sql", "0007_resource_pages.sql"].map(
    (n) => readFile(new URL("../migrations/" + n, import.meta.url), "utf8"),
  ),
);
export function sqliteD1() {
  const sql = new DatabaseSync(":memory:");
  for (const migration of migrations) sql.exec(migration);
  function prepare(query, args = []) {
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
  return {
    sql,
    prepare,
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const results = [];
        for (const s of statements) {
          const query = sql.prepare(s.query);
          results.push(
            /^\s*SELECT|\bRETURNING\b/i.test(s.query)
              ? { results: query.all(...s.args) }
              : { meta: query.run(...s.args) },
          );
        }
        sql.exec("COMMIT");
        return results;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
const style = {
  dots: "dots",
  border: "extra-rounded",
  center: "dot",
  foreground: "#202b38",
  background: "#ffffff",
  size: 1024,
};
function fixture() {
  const db = sqliteD1(),
    env = {
      DB: db,
      FIREBASE_PROJECT_ID: "test-project",
      FIREBASE_API_KEY: "public-key",
      PUBLIC_ORIGIN: "https://tinytrail.link",
      ADMIN_EMAILS: "admin@example.com",
    },
    app = createApp(async (value) => {
      if (value === "bad") throw Error();
      return {
        uid: value === "unverified" ? "alice" : value,
        email:
          (value === "admin"
            ? "admin"
            : value === "unverified"
              ? "alice"
              : value) + "@example.com",
        verified: value !== "unverified",
        name: value,
      };
    });
  async function request(
    path,
    { user = "alice", wid, method = "GET", body, key, headers = {} } = {},
  ) {
    return app.fetch(
      new Request("https://tinytrail.link" + path, {
        method,
        headers: {
          ...(user ? { Authorization: "Bearer " + user } : {}),
          ...(wid ? { "X-Workspace-Id": wid } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    );
  }
  async function data(path, opts) {
    const r = await request(path, opts),
      value = await r.json();
    assert.ok(r.ok, `${r.status}: ${JSON.stringify(value)}`);
    return value;
  }
  async function approve(user = "alice") {
    await data("/api/access-requests", {
      user,
      method: "POST",
      body: {
        company: user + " company",
        website: "https://example.com",
        useCase: "Reports and events",
      },
    });
    return (
      await data("/api/admin/requests/" + user, {
        user: "admin",
        method: "POST",
        body: { action: "approve" },
      })
    ).workspaceId;
  }
  return { db, env, request, data, approve };
}
async function create(
  f,
  wid,
  slug = "report",
  user = "alice",
  key = crypto.randomUUID(),
) {
  return f.request("/api/links", {
    wid,
    user,
    method: "POST",
    key,
    body: { slug, destination: "https://example.com/" + slug },
  });
}
test("anonymous, unverified, pending and non-admin users cannot access company or original libraries", async () => {
  const f = fixture();
  for (const user of [null, "bad", "unverified", "alice"]) {
    assert.equal(
      (await f.request("/api/links", { user })).status,
      user === "alice" ? 200 : user === "unverified" ? 403 : 401,
    );
    assert.notEqual((await f.request("/api/legacy", { user })).status, 200);
  }
  assert.equal(
    (await f.data("/api/legacy", { user: "admin" })).links.length,
    8,
  );
  assert.equal((await f.request("/r/insights", { user: null })).status, 302);
  assert.equal(
    (await f.request("/api/me", { headers: { Origin: "https://evil.com" } }))
      .status,
    403,
  );
});
test("approval creates a shared company and invitation is exact-email, single-use, expiring and owner-only", async () => {
  const f = fixture(),
    wid = await f.approve();
  assert.equal((await f.data("/api/me")).workspaces[0].role, "owner");
  assert.equal(
    (await f.request("/api/admin/requests", { user: "alice" })).status,
    403,
  );
  assert.equal(
    (
      await f.request("/api/invitations", {
        wid,
        method: "POST",
        user: "bob",
        body: { email: "charlie@example.com" },
      })
    ).status,
    403,
  );
  const invite = await f.data("/api/invitations", {
      wid,
      method: "POST",
      body: { email: "bob@example.com" },
    }),
    value = new URL(invite.url).hash.slice(8);
  assert.ok(
    !f.db.sql
      .prepare("SELECT token_hash FROM invitations")
      .get()
      .token_hash.includes(value),
  );
  assert.equal(
    (
      await f.request("/api/invitations/accept", {
        user: "charlie",
        method: "POST",
        body: { token: value },
      })
    ).status,
    403,
  );
  await f.data("/api/invitations/accept", {
    user: "bob",
    method: "POST",
    body: { token: value },
  });
  assert.equal(
    (
      await f.request("/api/invitations/accept", {
        user: "bob",
        method: "POST",
        body: { token: value },
      })
    ).status,
    403,
  );
  const other = await f.data("/api/invitations", {
    wid,
    method: "POST",
    body: { email: "charlie@example.com" },
  });
  f.db.sql.exec("UPDATE invitations SET expires_at=0");
  assert.equal(
    (
      await f.request("/api/invitations/accept", {
        user: "charlie",
        method: "POST",
        body: { token: new URL(other.url).hash.slice(8) },
      })
    ).status,
    403,
  );
});
test("company members share edits, other companies cannot access items, removed members lose access", async () => {
  const f = fixture(),
    wid = await f.approve(),
    other = await f.approve("charlie");
  await f.data("/api/me", { user: "bob" });
  f.db.sql
    .prepare("INSERT INTO memberships VALUES(?,?,'member')")
    .run(wid, "bob");
  assert.equal((await create(f, wid)).status, 201);
  assert.equal(
    (await f.data("/api/links", { wid, user: "bob" })).links.length,
    1,
  );
  assert.equal(
    (await f.data("/api/links", { wid: other, user: "charlie" })).links.length,
    0,
  );
  assert.equal(
    (
      await f.request("/api/links/report", {
        wid: other,
        user: "charlie",
        method: "PATCH",
        body: { destination: "https://example.com/hijack", version: 1 },
      })
    ).status,
    404,
  );
  await f.data("/api/links/report", {
    wid,
    user: "bob",
    method: "PATCH",
    body: { destination: "https://example.com/updated", version: 1 },
  });
  assert.equal(
    (
      await f.request("/api/links/report", {
        wid,
        method: "PATCH",
        body: { destination: "https://example.com/stale", version: 1 },
      })
    ).status,
    409,
  );
  assert.equal(
    (await f.request("/r/report", { user: null })).headers.get("Location"),
    "https://example.com/updated",
  );
  assert.equal(
    (
      await f.request("/api/members", {
        wid,
        method: "DELETE",
        body: { uid: "alice" },
      })
    ).status,
    409,
  );
  await f.data("/api/members", { wid, method: "DELETE", body: { uid: "bob" } });
  assert.equal(
    (await f.request("/api/links", { wid, user: "bob" })).status,
    403,
  );
});
test("direct QR designs save in an empty company, preserve settings, and reject cross-company changes", async () => {
  const f = fixture(),
    wid = await f.approve(),
    other = await f.approve("bob"),
    design = {
      id: crypto.randomUUID(),
      title: "Direct QR",
      url: "https://example.com/no-short-link",
      settings: style,
    };
  await f.data("/api/designs", { wid, method: "POST", body: design });
  assert.equal((await f.data("/api/links", { wid })).links.length, 0);
  assert.deepEqual(
    (await f.data("/api/designs", { wid })).designs[0].settings,
    style,
  );
  assert.equal(
    (
      await f.request("/api/designs", {
        wid: other,
        user: "bob",
        method: "POST",
        body: { ...design, version: 1 },
      })
    ).status,
    404,
  );
  await f.data("/api/designs", {
    wid,
    method: "POST",
    body: { ...design, title: "Updated", version: 1 },
  });
  assert.equal(
    (
      await f.request("/api/designs", {
        wid,
        method: "POST",
        body: { ...design, version: 1 },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request("/api/designs", {
        wid,
        method: "POST",
        body: {
          ...design,
          id: crypto.randomUUID(),
          settings: { ...style, foreground: "#eeeeee" },
        },
      })
    ).status,
    400,
  );
});
test("existing records require confirmation to transfer and retain URLs, versions and settings", async () => {
  const f = fixture(),
    wid = await f.approve();
  f.db.sql
    .prepare(
      "INSERT INTO links(slug,destination,title,owner_uid,short_url) VALUES(?,?,?,?,?)",
    )
    .run(
      "old",
      "https://example.com/old",
      "Old",
      "alice",
      "https://old.example/r/old",
    );
  f.db.sql
    .prepare(
      "INSERT INTO qr_designs(id,owner_uid,title,url,settings_json) VALUES(?,?,?,?,?)",
    )
    .run(
      crypto.randomUUID(),
      "alice",
      "Old QR",
      "https://example.com",
      JSON.stringify(style),
    );
  assert.equal((await f.data("/api/links", { wid })).links.length, 0);
  assert.equal((await f.data("/api/transfer", { wid })).links.length, 1);
  assert.equal(
    (
      await f.request("/api/transfer", {
        wid,
        method: "POST",
        body: { confirm: false },
      })
    ).status,
    400,
  );
  await f.data("/api/transfer", {
    wid,
    method: "POST",
    body: { confirm: true },
  });
  const l = (await f.data("/api/links", { wid })).links[0];
  assert.equal(l.shortUrl, "https://old.example/r/old");
  assert.equal(l.version, 1);
  assert.deepEqual(
    (await f.data("/api/designs", { wid })).designs[0].settings,
    style,
  );
  assert.equal(
    (await f.data("/api/legacy", { user: "admin" })).links.length,
    8,
  );
});
test("bulk rows persist partial results and resume safely without duplicate links or designs", async () => {
  const f = fixture(),
    wid = await f.approve(),
    id = crypto.randomUUID();
  await create(f, wid, "taken");
  const body = {
    id,
    mode: "both",
    settings: style,
    rows: [
      { title: "One", url: "https://example.com/one", slug: "one" },
      { title: "Taken", url: "https://example.com/taken", slug: "taken" },
    ],
  };
  await f.data("/api/bulk", { wid, method: "POST", body });
  await f.data("/api/bulk", { wid, method: "POST", body });
  let r = await f.data("/api/bulk/" + id + "/run", {
    wid,
    method: "POST",
    body: {},
  });
  assert.ok(r.rows[0].result);
  assert.ok(r.rows[1].error);
  r = await f.data("/api/bulk/" + id + "/run", {
    wid,
    method: "POST",
    body: { retry: true },
  });
  assert.ok(r.rows[0].result);
  assert.equal((await f.data("/api/designs", { wid })).designs.length, 1);
  assert.equal((await f.data("/api/links", { wid })).links.length, 2);
  const other = await f.approve("bob");
  assert.equal(
    (await f.request("/api/bulk/" + id, { wid: other, user: "bob" })).status,
    404,
  );
  assert.equal(
    (
      await f.request("/api/bulk", {
        wid,
        method: "POST",
        body: {
          ...body,
          id: crypto.randomUUID(),
          rows: Array(101).fill(body.rows[0]),
        },
      })
    ).status,
    400,
  );
});
test("server enforces company quotas, preserves idempotency and supports QR-only batches", async () => {
  const f = fixture(),
    wid = await f.approve();
  f.env.MAX_LINKS_PER_WORKSPACE = "1";
  const key = crypto.randomUUID();
  assert.equal((await create(f, wid, "one", "alice", key)).status, 201);
  assert.equal((await create(f, wid, "one", "alice", key)).status, 201);
  assert.equal((await create(f, wid, "two")).status, 429);
  const id = crypto.randomUUID();
  await f.data("/api/bulk", {
    wid,
    method: "POST",
    body: {
      id,
      mode: "qr",
      settings: style,
      rows: [{ title: "Direct", url: "https://example.com/direct" }],
    },
  });
  const r = await f.data("/api/bulk/" + id + "/run", {
    wid,
    method: "POST",
    body: {},
  });
  assert.equal(r.rows[0].result.design.url, "https://example.com/direct");
  assert.equal((await f.data("/api/links", { wid })).links.length, 1);
});
test("original eight published destinations and addresses are preserved exactly", async () => {
  const f = fixture();
  for (const link of (await f.data("/api/legacy", { user: "admin" })).links) {
    assert.equal(link.shortUrl, `https://ksrtlink.github.io/atk/${link.slug}/`);
    assert.equal(
      (await f.request("/r/" + link.slug, { user: null })).headers.get(
        "Location",
      ),
      link.url,
    );
  }
});

test("100-row jobs resume in bounded chunks and concurrent retries preserve successful results", async () => {
  const f = fixture(),
    wid = await f.approve(),
    id = crypto.randomUUID();
  const rows = Array.from({ length: 100 }, (_, i) => ({
    title: "Item " + i,
    url: "https://example.com/item-" + i,
    slug: "item-" + i,
  }));
  await f.data("/api/bulk", {
    wid,
    method: "POST",
    body: { id, mode: "both", settings: style, rows },
  });
  let r = await f.data("/api/bulk/" + id + "/run", {
    wid,
    method: "POST",
    body: {},
  });
  assert.equal(r.rows.filter((r) => r.result).length, 5);
  for (let i = 0; i < 19; i++)
    r = await f.data("/api/bulk/" + id + "/run", {
      wid,
      method: "POST",
      body: {},
    });
  assert.equal(r.rows.filter((r) => r.result).length, 100);
  await Promise.all([
    f.data("/api/bulk/" + id + "/run", {
      wid,
      method: "POST",
      body: { retry: true },
    }),
    f.data("/api/bulk/" + id + "/run", {
      wid,
      method: "POST",
      body: { retry: true },
    }),
  ]);
  assert.equal((await f.data("/api/links", { wid })).links.length, 100);
  assert.equal((await f.data("/api/designs", { wid })).designs.length, 100);
});

test("failed transfer is atomic when allowance is insufficient and can be retried after adjustment", async () => {
  const f = fixture(),
    wid = await f.approve();
  await create(f, wid, "existing");
  f.db.sql
    .prepare(
      "INSERT INTO links(slug,destination,title,owner_uid,short_url) VALUES(?,?,?,?,?)",
    )
    .run(
      "old",
      "https://example.com/old",
      "Old",
      "alice",
      "https://old.example/r/old",
    );
  f.env.MAX_LINKS_PER_WORKSPACE = "1";
  assert.equal(
    (
      await f.request("/api/transfer", {
        wid,
        method: "POST",
        body: { confirm: true },
      })
    ).status,
    429,
  );
  assert.equal((await f.data("/api/transfer", { wid })).links.length, 1);
  f.env.MAX_LINKS_PER_WORKSPACE = "3";
  await f.data("/api/transfer", {
    wid,
    method: "POST",
    body: { confirm: true },
  });
  assert.equal((await f.data("/api/transfer", { wid })).links.length, 0);
});

test('two active batch runners converge on one link and one design',async()=>{const f=fixture(),wid=await f.approve(),id=crypto.randomUUID();await f.data('/api/bulk',{wid,method:'POST',body:{id,mode:'both',settings:style,rows:[{title:'Concurrent',url:'https://example.com/concurrent',slug:'concurrent'}]}});const results=await Promise.all([f.request('/api/bulk/'+id+'/run',{wid,method:'POST',body:{}}),f.request('/api/bulk/'+id+'/run',{wid,method:'POST',body:{}})]);for(const r of results)assert.equal(r.status,200,await r.text());const job=await f.data('/api/bulk/'+id,{wid});assert.ok(job.rows[0].result);assert.equal(job.rows[0].error,null);assert.equal((await f.data('/api/links',{wid})).links.length,1);assert.equal((await f.data('/api/designs',{wid})).designs.length,1);});


test("ordinary accounts open one assigned company and cannot join a second company", async () => {
  const f = fixture(), wid = await f.approve(), other = await f.approve("charlie");
  const me = await f.data("/api/me");
  assert.equal(me.assignedWorkspaceId, wid);
  assert.equal(me.canSwitchCompanies, false);
  assert.equal(me.workspaces.length, 1);
  assert.equal((await f.request("/api/links")).status, 200);
  assert.equal((await f.request("/api/links", {wid: other})).status, 403);
  const invite = await f.data("/api/invitations", {user:"charlie", wid:other, method:"POST", body:{email:"alice@example.com"}});
  const result = await f.request("/api/invitations/accept", {method:"POST", body:{token:new URL(invite.url).hash.slice(8)}});
  assert.equal(result.status, 409);
  assert.equal(f.db.sql.prepare("SELECT count(*) AS n FROM memberships WHERE uid='alice'").get().n, 1);
  assert.equal(f.db.sql.prepare("SELECT accepted_by FROM invitations").get().accepted_by, null);
});

test("pending company approval cannot override an invitation assignment", async () => {
  const f = fixture(), wid = await f.approve("charlie");
  await f.data("/api/access-requests", {method:"POST", body:{company:"Alice",website:"https://example.com",useCase:"Links"}});
  const invite = await f.data("/api/invitations", {user:"charlie", wid, method:"POST", body:{email:"alice@example.com"}});
  await f.data("/api/invitations/accept", {method:"POST", body:{token:new URL(invite.url).hash.slice(8)}});
  assert.equal((await f.request("/api/admin/requests/alice",{user:"admin",method:"POST",body:{action:"approve"}})).status,409);
  assert.equal(f.db.sql.prepare("SELECT count(*) AS n FROM workspaces WHERE id='company-alice'").get().n,0);
  assert.equal((await f.data("/api/me")).assignedWorkspaceId,wid);
});

test("ambiguous ordinary assignments fail closed while admin switching still requires membership", async () => {
  const f=fixture(), wid=await f.approve(), other=await f.approve("bob");
  f.db.sql.prepare("INSERT INTO memberships(workspace_id,uid,role) VALUES(?,?,'member')").run(other,"alice");
  const me=await f.data("/api/me");
  assert.equal(me.companyAccessIssue,"multiple_assignments");
  assert.deepEqual(me.workspaces,[]);
  for(const id of [wid,other]) assert.equal((await f.request("/api/links",{wid:id})).status,403);
  await f.data("/api/me",{user:"admin"});
  f.db.sql.prepare("INSERT INTO memberships(workspace_id,uid,role) VALUES(?,'admin','member')").run(wid);
  const admin=await f.data("/api/me",{user:"admin"});
  assert.equal(admin.canSwitchCompanies,true);
  assert.equal((await f.request("/api/links",{user:"admin",wid})).status,200);
  assert.equal((await f.request("/api/links",{user:"admin",wid:other})).status,403);
});


test("simultaneous invitations to two companies assign only one company", async () => {
  const f=fixture(), a=await f.approve(), b=await f.approve("bob");
  const invitations=await Promise.all([[a,"alice"],[b,"bob"]].map(([wid,user])=>f.data("/api/invitations",{wid,user,method:"POST",body:{email:"charlie@example.com"}})));
  const responses=await Promise.all(invitations.map(invite=>f.request("/api/invitations/accept",{user:"charlie",method:"POST",body:{token:new URL(invite.url).hash.slice(8)}})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  assert.equal(f.db.sql.prepare("SELECT count(*) AS n FROM memberships WHERE uid='charlie'").get().n,1);
  assert.equal(f.db.sql.prepare("SELECT count(*) AS n FROM invitations WHERE accepted_by='charlie'").get().n,1);
});


test("verified individuals get one private workspace without approval and cannot share it", async () => {
  const f=fixture(), me=await f.data("/api/me"), personal=me.personalWorkspace.id;
  assert.equal(me.personalWorkspace.kind,"personal");
  assert.deepEqual(me.workspaces,[]);
  assert.equal((await f.data("/api/me")).personalWorkspace.id,personal);
  assert.equal((await f.request("/api/links")).status,200);
  assert.equal((await create(f,personal,"private-report")).status,201);
  assert.equal((await f.request("/api/links",{user:"bob",wid:personal})).status,403);
  assert.equal((await f.request("/api/links",{user:"admin",wid:personal})).status,403);
  assert.equal((await f.request("/api/invitations",{wid:personal,method:"POST",body:{email:"bob@example.com"}})).status,403);
  assert.equal((await f.request("/api/members",{wid:personal,method:"DELETE",body:{uid:"alice"}})).status,403);
  assert.throws(()=>f.db.sql.prepare("INSERT INTO memberships VALUES(?,'alice','owner')").run(personal));
  assert.throws(()=>f.db.sql.prepare("UPDATE workspaces SET personal_owner_uid='bob' WHERE id=?").run(personal));
});

test("joining a company keeps personal records private", async () => {
  const f=fixture(), personal=(await f.data("/api/me")).personalWorkspace.id;
  await create(f,personal,"my-private-link");
  const designId=crypto.randomUUID();
  assert.equal((await f.request("/api/designs",{wid:personal,method:"POST",body:{id:designId,title:"My QR",url:"https://example.com/private",settings:style}})).status,201);
  const wid=await f.approve("bob");
  const invite=await f.data("/api/invitations",{user:"bob",wid,method:"POST",body:{email:"alice@example.com"}});
  await f.data("/api/invitations/accept",{method:"POST",body:{token:new URL(invite.url).hash.slice(8)}});
  assert.equal((await f.data("/api/links",{wid})).links.length,0);
  assert.equal((await f.data("/api/links",{wid:personal})).links.length,1);
  assert.equal((await f.data("/api/designs",{wid})).designs.length,0);
  assert.equal((await f.request("/api/designs",{user:"bob",wid,method:"POST",body:{id:designId,version:1,title:"Steal",url:"https://example.com",settings:style}})).status,404);
  assert.equal((await f.request("/api/transfer",{wid,method:"POST",body:{confirm:true}})).status,200);
  assert.equal((await f.data("/api/links",{wid:personal})).links.length,1);
});

test("personal limits bound saved links, QR designs and bulk rows on the server", async () => {
  const f=fixture(), wid=(await f.data("/api/me")).personalWorkspace.id;
  assert.deepEqual((await f.data("/api/workspace",{wid})).limits,{links:25,designs:25,bulkRows:10});
  for(let i=0;i<25;i++) assert.equal((await create(f,wid,"private-"+i)).status,201);
  assert.equal((await create(f,wid,"over-limit")).status,429);
  const tooMany=await f.request("/api/bulk",{wid,method:"POST",body:{id:crypto.randomUUID(),mode:"qr",rows:Array.from({length:11},(_,i)=>({title:"QR "+i,url:"https://example.com/"+i})),settings:style}});
  assert.equal(tooMany.status,400);
  f.env.TRACKED_QR_ENABLED="true";
  for(let i=0;i<25;i++) assert.equal((await f.request("/api/tracked-qrs",{wid,method:"POST",body:{id:crypto.randomUUID(),title:"Tracked QR",destination:"https://example.com"}})).status,201);
  assert.equal((await f.request("/api/tracked-qrs",{wid,method:"POST",body:{id:crypto.randomUUID(),title:"Extra tracked QR",destination:"https://example.com"}})).status,429);

  for(let i=0;i<25;i++) assert.equal((await f.request("/api/designs",{wid,method:"POST",body:{id:crypto.randomUUID(),title:"Private QR",url:"https://example.com",settings:style}})).status,201);
  assert.equal((await f.request("/api/designs",{wid,method:"POST",body:{id:crypto.randomUUID(),title:"Extra QR",url:"https://example.com",settings:style}})).status,429);
});


test("deleted links go to private Trash, stop redirects and tracked QR codes, and restore the same address", async () => {
  const f=fixture(), wid=(await f.data("/api/me")).personalWorkspace.id;
  await create(f,wid,"trash-link");
  f.env.TRACKED_QR_ENABLED="true";
  const asset=(await f.data("/api/tracked-qrs",{wid,method:"POST",body:{id:crypto.randomUUID(),title:"Printed QR",linkSlug:"trash-link"}})).asset;
  assert.equal((await f.request("/r/trash-link",{user:null})).status,302);
  assert.equal((await f.request(new URL(asset.publicUrl).pathname,{user:null})).status,302);
  assert.equal((await f.request("/api/links/trash-link",{wid,method:"DELETE",body:{version:0}})).status,409);
  const removed=await f.data("/api/links/trash-link",{wid,method:"DELETE",body:{version:1}});
  assert.ok(removed.link.deletedAt);
  assert.equal(removed.link.version,2);
  assert.equal((await f.data("/api/links",{wid})).links.length,0);
  assert.equal((await f.data("/api/links",{wid})).deletedLinks.length,1);
  assert.equal((await f.request("/r/trash-link",{user:null})).status,410);
  assert.equal((await f.request(new URL(asset.publicUrl).pathname,{user:null})).status,410);
  assert.equal((await f.request("/api/links/trash-link",{wid,method:"PATCH",body:{version:2,destination:"https://example.com/new"}})).status,404);
  assert.equal((await create(f,wid,"trash-link")).status,409);
  const other=(await f.data("/api/me",{user:"bob"})).personalWorkspace.id;
  for (const [path,method] of [["/api/links/trash-link","DELETE"],["/api/links/trash-link/restore","POST"]])
    assert.equal((await f.request(path,{user:"bob",wid:other,method,body:{version:2}})).status,404);
  assert.equal((await f.data("/api/links",{user:"bob",wid:other})).deletedLinks.length,0);
  assert.equal((await f.request("/api/links/trash-link/restore",{wid,method:"POST",body:{version:1}})).status,409);
  const restored=await f.data("/api/links/trash-link/restore",{wid,method:"POST",body:{version:2}});
  assert.equal(restored.link.deletedAt,null);
  assert.equal(restored.link.shortUrl,removed.link.shortUrl);
  assert.equal((await f.request("/r/trash-link",{user:null})).status,302);
  assert.equal((await f.request(new URL(asset.publicUrl).pathname,{user:null})).status,302);
  assert.equal((await f.data("/api/links",{wid})).deletedLinks.length,0);
});

test("restore enforces active-link quotas and deletion cannot change the original legacy links", async () => {
  const f=fixture(), wid=(await f.data("/api/me")).personalWorkspace.id;
  for(let i=0;i<25;i++) await create(f,wid,"quota-trash-"+i);
  await f.data("/api/links/quota-trash-0",{wid,method:"DELETE",body:{version:1}});
  await create(f,wid,"replacement");
  assert.equal((await f.request("/api/links/quota-trash-0/restore",{wid,method:"POST",body:{version:2}})).status,429);
  await f.data("/api/links/replacement",{wid,method:"DELETE",body:{version:1}});
  assert.equal((await f.request("/api/links/quota-trash-0/restore",{wid,method:"POST",body:{version:2}})).status,200);
  const legacy=f.db.sql.prepare("SELECT slug,workspace_id FROM links WHERE legacy=1 LIMIT 1").get();
  assert.equal((await f.request("/api/links/"+legacy.slug,{wid,method:"DELETE",body:{version:1}})).status,404);
  assert.equal(f.db.sql.prepare("SELECT deleted_at FROM links WHERE slug=?").get(legacy.slug).deleted_at,null);
});

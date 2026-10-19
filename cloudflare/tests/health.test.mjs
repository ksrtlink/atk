import test from 'node:test';import assert from 'node:assert/strict';import{sqliteD1}from'./enterprise.test.mjs';import{createApp}from'../src/worker.mjs';import{scheduledHealth,runHealth,targetSet}from'../src/health.mjs';
function fixture(check=async()=>({state:"healthy",reason:"http_ok",httpStatus:200,redirects:0,elapsedMs:1})) {
 const DB=sqliteD1(),tasks=[];
 for(const uid of ["owner","member","other"])DB.sql.prepare("INSERT INTO users(uid,email) VALUES(?,?)").run(uid,uid+"@example.com");
 for(const id of ["a","b"])DB.sql.prepare("INSERT INTO workspaces(id,name) VALUES(?,?)").run(id,id);
 for(const [wid,uid,role] of [["a","owner","owner"],["a","member","member"],["b","other","owner"]])DB.sql.prepare("INSERT INTO memberships VALUES(?,?,?)").run(wid,uid,role);
 const env={DB,FIREBASE_PROJECT_ID:"test",FIREBASE_API_KEY:"public",PUBLIC_ORIGIN:"https://tinytrail.link",ANALYTICS_ENABLED:"true",TRACKED_QR_ENABLED:"true",ANALYTICS_RETENTION_DAYS:"90",LINK_HEALTH_ENABLED:"true"};
 const app=createApp(async uid=>({uid,email:uid+"@example.com",verified:uid!=="unverified"}),{healthCheck:check});
 async function request(path,{method="GET",user="owner",wid="a",body,headers={}}={}) {
  return app.fetch(new Request("https://tinytrail.link"+path,{method,headers:{...(user?{Authorization:"Bearer "+user,"X-Workspace-Id":wid}:{}),...(body?{"Content-Type":"application/json"}:{}),...headers},body:body?JSON.stringify(body):undefined}),env,{waitUntil:task=>tasks.push(task)});
 }
 async function data(path,opts){const r=await request(path,opts),d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
 async function flush(){await Promise.all(tasks.splice(0));}
 return {DB,env,app,request,data,flush};
}


async function seed(f,slug='monitor-test',wid='a',uid='owner'){await f.data('/api/me');f.DB.sql.prepare("INSERT INTO links(slug,destination,title,owner_uid,short_url,workspace_id,updated_by) VALUES(?,?,'Monitor',?,?,?,?)").run(slug,'https://example.com/'+slug,uid,'https://tinytrail.link/r/'+slug,wid,uid);return slug;}
async function enable(f,slug,version=0){return f.data(`/api/links/${slug}/health`,{method:'PUT',body:{version,enabled:true}});}

test('monitoring is owner-controlled, isolated, feature-gated and never accepts arbitrary check URLs',async()=>{
 const calls=[],f=fixture(async url=>{calls.push(url);return{state:'healthy',reason:'http_ok',httpStatus:200,redirects:0,elapsedMs:1};}),slug=await seed(f);
 assert.equal((await f.request(`/api/links/${slug}/health`,{user:null})).status,401);assert.equal((await f.request(`/api/links/${slug}/health`,{user:'other',wid:'b'})).status,404);
 assert.equal((await f.request(`/api/links/${slug}/health`,{user:'member',method:'PUT',body:{version:0,enabled:true}})).status,403);
 await enable(f,slug);assert.equal((await f.data(`/api/links/${slug}/health`,{user:'member'})).enabled,true);
 await f.data(`/api/links/${slug}/health/check`,{method:'POST',body:{url:'http://127.0.0.1/'}});assert.deepEqual(calls,['https://example.com/'+slug]);
 f.env.LINK_HEALTH_ENABLED='false';assert.equal((await f.request(`/api/links/${slug}/health`)).status,503);
});

test('all enabled schedule/audience destinations are monitored and identical URLs are deduplicated',async()=>{
 const f=fixture(),slug=await seed(f),audiences=Array.from({length:20},(_,i)=>({id:crypto.randomUUID(),country:'AE',language:'',destination:'https://example.net/a-'+i})),schedules=Array.from({length:20},(_,i)=>({id:crypto.randomUUID(),timezone:'UTC',start:new Date(Date.UTC(2027,0,i+1)).toISOString(),end:new Date(Date.UTC(2027,0,i+1,1)).toISOString(),destination:'https://example.net/s-'+i}));
 await f.data(`/api/links/${slug}/routing`,{method:'PUT',body:{version:0,linkVersion:1,config:{enabled:true,schedules,audiences}}});const r=await enable(f,slug);assert.equal(r.targets.length,41);
 const duplicates=await targetSet({destination:'https://example.com/a#first',routing_json:JSON.stringify({enabled:true,schedules:[],audiences:[{destination:'https://example.com/a#second'}]})});assert.equal(duplicates.length,1);assert.equal(duplicates[0].labels.length,2);assert.equal((await targetSet({destination:'https://example.com/',routing_json:JSON.stringify({enabled:false,schedules,audiences})})).length,1);
});

test('leases prevent duplicate concurrent checks, daily results persist and manual repeat has a cooldown',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;await new Promise(r=>setTimeout(r,10));return{state:'broken',reason:'http_missing',httpStatus:404,redirects:0,elapsedMs:1};}),slug=await seed(f);await enable(f,slug);
 await Promise.all([runHealth(f.env,{check:async()=>{calls++;return{state:'broken',reason:'http_missing',httpStatus:404};}}),runHealth(f.env,{check:async()=>{calls++;return{state:'healthy',reason:'http_ok',httpStatus:200};}})]);assert.equal(calls,1);
 let r=await f.data(`/api/links/${slug}/health`);assert.equal(r.targets[0].state,'broken');assert.ok(r.targets[0].nextCheckAt>Date.now()+86000000);
 await f.data(`/api/links/${slug}/health/check`,{method:'POST',body:{}});assert.equal(calls,2);
 assert.equal((await f.request(`/api/links/${slug}/health/check`,{method:'POST',body:{}})).status,429);
});

test('changed destinations invalidate coverage until synchronized; deleted links stop monitoring',async()=>{
 const f=fixture(),slug=await seed(f);await enable(f,slug);
 f.DB.sql.prepare("UPDATE links SET destination='https://example.org/new',version=version+1 WHERE slug=?").run(slug);
 assert.equal((await f.data(`/api/links/${slug}/health`)).stale,true);
 let checked=[];await scheduledHealth(f.env,async url=>{checked.push(url);return{state:'healthy',reason:'http_ok',httpStatus:200};});assert.deepEqual(checked,['https://example.org/new']);assert.equal((await f.data(`/api/links/${slug}/health`)).targets[0].url,'https://example.org/new');
 f.DB.sql.prepare("UPDATE links SET deleted_at='2026-10-20T00:00:00Z' WHERE slug=?").run(slug);await scheduledHealth(f.env,async()=>{throw Error('must not check deleted');});assert.equal((await f.data(`/api/links/${slug}/health`)).enabled,false);assert.equal((await f.data(`/api/links/${slug}/health`)).targets.length,0);
});

test('company and global monitoring allowances are atomic and disabling frees space',async()=>{
 const f=fixture();for(let i=0;i<13;i++){const slug=await seed(f,'quota-'+i);if(i<12)await enable(f,slug);else assert.equal((await f.request(`/api/links/${slug}/health`,{method:'PUT',body:{enabled:true,version:0}})).status,409);}
 await f.data('/api/links/quota-0/health',{method:'PUT',body:{enabled:false,version:1}});await enable(f,'quota-12');assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM link_health WHERE enabled=1').get().n,12);
 assert.equal((await f.request('/api/links/quota-12/health',{method:'PUT',body:{enabled:false,version:0}})).status,409);
});

test('transfer isolation hides old target data and replaces old-company monitoring with new owner settings',async()=>{
 const f=fixture(),slug=await seed(f);await enable(f,slug);f.DB.sql.prepare("UPDATE links SET workspace_id='b',version=version+1 WHERE slug=?").run(slug);
 assert.equal((await f.request(`/api/links/${slug}/health`)).status,404);const report=await f.data(`/api/links/${slug}/health`,{user:'other',wid:'b'});assert.equal(report.version,0);assert.equal(report.targets.length,0);
 await f.data(`/api/links/${slug}/health`,{user:'other',wid:'b',method:'PUT',body:{enabled:true,version:0}});assert.equal(f.DB.sql.prepare('SELECT workspace_id FROM link_health WHERE slug=?').get(slug).workspace_id,'b');assert.equal(f.DB.sql.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('health cron runs its queue without engagement collection and leaves pruning on the original cron',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return{state:'healthy',reason:'http_ok',httpStatus:200};}),slug=await seed(f);await enable(f,slug);
 await f.app.scheduled({cron:'*/5 * * * *'},f.env,{waitUntil:p=>f.flushPromise=p});await f.flushPromise;assert.equal(calls,1);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM engagement_events').get().n,0);
});

test('global and personal quotas are enforced and summaries never cross workspaces',async()=>{
 const f=fixture();for(const [wid,uid]of[['a','owner'],['b','other']])for(let i=0;i<12;i++){const slug=await seed(f,wid+'-global-'+i,wid,uid);await f.data(`/api/links/${slug}/health`,{user:uid,wid,method:'PUT',body:{version:0,enabled:true}});}
 assert.equal((await f.data('/api/link-health')).monitors.length,12);assert.equal((await f.data('/api/link-health',{user:'other',wid:'b'})).monitors.length,12);
 f.DB.sql.exec("INSERT INTO users(uid,email) VALUES('third','third@example.com');INSERT INTO workspaces(id,name) VALUES('c','Third');INSERT INTO memberships VALUES('c','third','owner');");await seed(f,'global-overflow','c','third');
 assert.equal((await f.request('/api/links/global-overflow/health',{user:'third',wid:'c',method:'PUT',body:{version:0,enabled:true}})).status,409);
 await f.data('/api/links/a-global-0/health',{method:'PUT',body:{version:1,enabled:false}});await f.data('/api/links/global-overflow/health',{user:'third',wid:'c',method:'PUT',body:{version:0,enabled:true}});
 const p=fixture();for(let i=0;i<4;i++){const slug=await seed(p,'personal-'+i,'personal-owner','owner');const r=await p.request(`/api/links/${slug}/health`,{wid:'personal-owner',method:'PUT',body:{version:0,enabled:true}});assert.equal(r.status,i<3?200:409);}
});

test('an expired lease can be recovered and a late older result cannot overwrite its replacement',async()=>{
 const f=fixture(),slug=await seed(f);await enable(f,slug);let finish,started;const entered=new Promise(r=>started=r),hold=new Promise(r=>finish=r);
 const first=runHealth(f.env,{check:async()=>{started();await hold;return{state:'broken',reason:'http_missing',httpStatus:404};}});await entered;
 f.DB.sql.prepare('UPDATE link_health_targets SET lease_until=0 WHERE slug=?').run(slug);
 await runHealth(f.env,{check:async()=>({state:'healthy',reason:'http_ok',httpStatus:200})});finish();await first;
 assert.equal((await f.data(`/api/links/${slug}/health`)).targets[0].state,'healthy');
});

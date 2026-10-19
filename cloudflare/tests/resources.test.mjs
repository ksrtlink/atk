import test from "node:test";
import assert from "node:assert/strict";
import {sqliteD1} from "./enterprise.test.mjs";
import {createApp} from "../src/worker.mjs";
import {pruneResources} from "../src/resources.mjs";
function fixture() {
 const DB=sqliteD1(),tasks=[];
 for(const uid of ["owner","member","other"])DB.sql.prepare("INSERT INTO users(uid,email) VALUES(?,?)").run(uid,uid+"@example.com");
 for(const id of ["a","b"])DB.sql.prepare("INSERT INTO workspaces(id,name) VALUES(?,?)").run(id,id);
 for(const [wid,uid,role] of [["a","owner","owner"],["a","member","member"],["b","other","owner"]])DB.sql.prepare("INSERT INTO memberships VALUES(?,?,?)").run(wid,uid,role);
 const env={DB,FIREBASE_PROJECT_ID:"test",FIREBASE_API_KEY:"public",PUBLIC_ORIGIN:"https://tinytrail.link",ANALYTICS_ENABLED:"true",TRACKED_QR_ENABLED:"true",ANALYTICS_RETENTION_DAYS:"90"};
 const app=createApp(async uid=>({uid,email:uid+"@example.com",verified:uid!=="unverified"}));
 async function request(path,{method="GET",user="owner",wid="a",body,headers={}}={}) {
  return app.fetch(new Request("https://tinytrail.link"+path,{method,headers:{...(user?{Authorization:"Bearer "+user,"X-Workspace-Id":wid}:{}),...(body?{"Content-Type":"application/json"}:{}),...headers},body:body?JSON.stringify(body):undefined}),env,{waitUntil:task=>tasks.push(task)});
 }
 async function data(path,opts){const r=await request(path,opts),d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
 async function flush(){await Promise.all(tasks.splice(0));}
 return {DB,env,request,data,flush};
}
const content=(title="Conference resources")=>({title,description:"Approved materials",items:[{id:crypto.randomUUID(),label:"Programme",description:"Download the programme",url:"https://example.com/programme?edition=2026#agenda"}]});
async function create(f,slug="conference",opts={}) {return (await f.data("/api/resources",{method:"POST",body:{id:crypto.randomUUID(),slug,content:content()},...opts})).page;}
async function publish(f,page){return (await f.data(`/api/resources/${page.id}/publish`,{method:"POST",body:{version:page.version,confirmPublic:true}})).page;}

test("resource drafts stay private, public output is escaped and HEAD does not expose extra data",async()=>{
 const f=fixture(),page=await create(f);
 assert.equal((await f.request("/p/conference",{user:null})).status,404);
 assert.equal((await f.request(`/api/resources/${page.id}`,{user:null})).status,401);
 assert.equal((await f.request(`/api/resources/${page.id}`,{user:"other",wid:"b"})).status,404);
 const d={...page.content,title:'<script>alert(1)</script>',description:'<img src=x onerror=alert(1)>'};
 const saved=(await f.data(`/api/resources/${page.id}`,{method:"PATCH",body:{version:page.version,content:d}})).page;
 await publish(f,saved);
 const response=await f.request("/p/conference",{user:null}),html=await response.text();
 assert.equal(response.status,200);assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(!html.includes('<script>'));
 assert.ok(!html.includes(page.id));assert.ok(!html.includes('actor_uid'));assert.match(response.headers.get("Content-Security-Policy"),/default-src 'none'/);
 assert.equal(await (await f.request("/p/conference",{user:null,method:"HEAD"})).text(),"");
});

test("resource publishing is owner-only and requires explicit approval; members can edit drafts",async()=>{
 const f=fixture(),page=await create(f);
 assert.equal((await f.request(`/api/resources/${page.id}/publish`,{method:"POST",body:{version:1}})).status,400);
 for(const action of ["publish","unpublish"])assert.equal((await f.request(`/api/resources/${page.id}/${action}`,{user:"member",method:"POST",body:{version:1,confirmPublic:true}})).status,403);
 assert.equal((await f.request(`/api/resources/${page.id}`,{user:"member",method:"DELETE",body:{version:1}})).status,403);
 const edit=(await f.data(`/api/resources/${page.id}`,{user:"member",method:"PATCH",body:{version:1,content:{...page.content,title:"Reviewed draft"}}})).page;
 await publish(f,edit);
 assert.ok((await (await f.request('/p/conference',{user:null})).text()).includes("Reviewed draft"));
 assert.equal((await f.request(`/api/resources/${page.id}`,{user:"other",wid:"a"})).status,403);
 assert.equal((await f.data("/api/resources",{user:"other",wid:"b"})).pages.length,0);
});

test("public snapshots stay unchanged through edits and revision restores; stale writers cannot overwrite",async()=>{
 const f=fixture(),page=await publish(f,await create(f));
 const edited=(await f.data(`/api/resources/${page.id}`,{method:"PATCH",body:{version:page.version,content:{...page.content,title:"Unpublished new title"}}})).page;
 assert.ok(!(await (await f.request('/p/conference',{user:null})).text()).includes("Unpublished new title"));
 assert.equal((await f.request(`/api/resources/${page.id}`,{method:"PATCH",body:{version:page.version,content:content("Stale")}})).status,409);
 const restored=(await f.data(`/api/resources/${page.id}/restore`,{method:"POST",body:{version:edited.version,revision:1}})).page;
 assert.equal(restored.content.title,"Conference resources");assert.equal(restored.publicUrl,page.publicUrl);
 assert.equal((await f.data(`/api/resources/${page.id}`)).revisions.length,4);
});

test("archiving and unpublishing revoke published pages and clicks while preserving the address",async()=>{
 const f=fixture(),page=await publish(f,await create(f));
 const click=`/p/conference/go/${page.content.items[0].id}`;
 let r=await f.request(click,{user:null});assert.equal(r.status,302);assert.equal(r.headers.get('Location'),page.content.items[0].url);
 assert.equal((await f.request('/p/conference/go/'+crypto.randomUUID(),{user:null})).status,404);
 let next=(await f.data(`/api/resources/${page.id}/unpublish`,{method:"POST",body:{version:page.version}})).page;
 assert.equal((await f.request(click,{user:null})).status,410);
 next=await publish(f,next);
 next=(await f.data(`/api/resources/${page.id}`,{method:"DELETE",body:{version:next.version}})).page;
 assert.equal((await f.request('/p/conference',{user:null})).status,410);
 assert.equal((await f.request(`/api/resources/${page.id}/publish`,{method:"POST",body:{version:next.version,confirmPublic:true}})).status,409);
 next=(await f.data(`/api/resources/${page.id}/activate`,{method:"POST",body:{version:next.version}})).page;
 assert.equal(next.state,'draft');assert.equal((await f.request('/p/conference',{user:null})).status,410);
 next=await publish(f,next);assert.equal(next.publicUrl,page.publicUrl);
 assert.equal((await f.request(click,{user:null})).status,302);
});

test("resource validation rejects credentials, self redirects, invalid items and cross-workspace restore",async()=>{
 const f=fixture(),page=await create(f);
 for(const url of ['javascript:alert(1)','https://user:pass@example.com','https://tinytrail.link/r/anything']){
  const c=content();c.items[0].url=url;
  assert.equal((await f.request(`/api/resources/${page.id}`,{method:"PATCH",body:{version:1,content:c}})).status,400);
 }
 const c=content();c.items.push(c.items[0]);assert.equal((await f.request(`/api/resources/${page.id}`,{method:"PATCH",body:{version:1,content:c}})).status,400);
 assert.equal((await f.request(`/api/resources/${page.id}/restore`,{user:"other",wid:"b",method:"POST",body:{version:1,revision:1}})).status,404);
 assert.equal((await f.request('/api/resources',{method:'POST',body:{id:crypto.randomUUID(),slug:'conference',content:content()}})).status,409);
});

test("resource events respect opt-in and exclusions, reconcile counts and prune only expired events",async()=>{
 const f=fixture(),page=await publish(f,await create(f)),click=`/p/conference/go/${page.content.items[0].id}`;
 await f.request('/p/conference',{user:null});await f.flush();assert.equal(f.DB.sql.prepare('SELECT COUNT(*) n FROM resource_events').get().n,0);
 await f.data('/api/analytics/settings',{method:'POST',body:{enabled:true}});
 await f.request('/p/conference',{user:null});await f.request(click,{user:null});
 await f.request('/p/conference',{user:null,method:'HEAD'});await f.request(click,{user:null,headers:{'User-Agent':'Googlebot'}});
 await f.request('/p/conference',{user:null,headers:{Purpose:'prefetch'}});await f.flush();
 const report=await f.data(`/api/resources/${page.id}/report?days=30`);
 assert.equal(report.pageViews,1);assert.equal(report.resourceClicks,1);assert.equal(report.items[0].item_id,page.content.items[0].id);
 assert.equal((await f.request(`/api/resources/${page.id}/report?days=100`)).status,400);
 f.DB.sql.prepare("INSERT INTO resource_events VALUES(?,?,?,?,?,?,?)").run(crypto.randomUUID(),'a',page.id,null,'page_view',Date.now()-91*86400000,'test');
 await pruneResources(f.env);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) n FROM resource_events').get().n,2);
});

test("resource history is bounded and failed revision writes roll back the page update",async()=>{
 const f=fixture();let page=await create(f);
 const batch=f.env.DB.batch.bind(f.env.DB);
 f.env.DB.batch=async statements=>{statements[1]=f.env.DB.prepare('INSERT INTO missing_resource_revision_table VALUES(1)');return batch(statements);};
 assert.equal((await f.request(`/api/resources/${page.id}`,{method:'PATCH',body:{version:1,content:{...page.content,title:'Must roll back'}}})).status,503);
 f.env.DB.batch=batch;
 assert.equal((await f.data(`/api/resources/${page.id}`)).page.content.title,page.content.title);
 for(let i=0;i<52;i++)page=(await f.data(`/api/resources/${page.id}`,{method:'PATCH',body:{version:page.version,content:{...page.content,title:'Revision '+i}}})).page;
 const history=(await f.data(`/api/resources/${page.id}`)).revisions;
 assert.equal(history.length,50);assert.equal(history[0].version,page.version);
});


test("personal resource-page quotas include restore and creation retries cannot duplicate pages",async()=>{
 const f=fixture(),wid=(await f.data('/api/me')).personalWorkspace.id,ids=[];
 const body={id:crypto.randomUUID(),slug:'personal-first',content:content()};
 const first=await f.data('/api/resources',{wid,method:'POST',body});
 assert.equal((await f.data('/api/resources',{wid,method:'POST',body})).page.id,first.page.id);
 ids.push(first.page);
 for(let i=1;i<10;i++)ids.push(await create(f,'personal-'+i,{wid}));
 assert.equal((await f.request('/api/resources',{wid,method:'POST',body:{id:crypto.randomUUID(),slug:'too-many',content:content()}})).status,429);
 const archived=(await f.data('/api/resources/'+ids[0].id,{wid,method:'DELETE',body:{version:1}})).page;
 await create(f,'replacement',{wid});
 assert.equal((await f.request('/api/resources/'+archived.id+'/activate',{wid,method:'POST',body:{version:archived.version}})).status,429);
});

test("resource measurement failures never block published pages or resource redirects",async()=>{
 const f=fixture(),page=await publish(f,await create(f));
 await f.data('/api/analytics/settings',{method:'POST',body:{enabled:true}});
 const prepare=f.env.DB.prepare.bind(f.env.DB),logs=[],log=console.error;
 f.env.DB.prepare=q=>{if(q.includes('INSERT OR IGNORE INTO resource_events'))throw Error('Injected storage failure');return prepare(q);};
 console.error=x=>logs.push(x);
 try {
  assert.equal((await f.request('/p/conference',{user:null})).status,200);
  assert.equal((await f.request('/p/conference/go/'+page.content.items[0].id,{user:null})).status,302);
  await f.flush();
  assert.equal(logs.length,2);assert.ok(logs.every(x=>JSON.parse(x).operation==='resource_event_insert'));
 } finally {console.error=log;f.env.DB.prepare=prepare;}
});

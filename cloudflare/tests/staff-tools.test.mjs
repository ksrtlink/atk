import test from "node:test";import assert from "node:assert/strict";import {sqliteD1} from "./enterprise.test.mjs";import {createApp} from "../src/worker.mjs";
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


const row=(slug="contact-one")=>({slug,name:"Contact One",email:"contact@example.com"});
async function preview(f,rows){return f.data("/api/people-imports/preview",{method:"POST",body:{rows}});}
async function create(f,rows){const {templateVersion}=await preview(f,rows);return(await f.data("/api/people-imports",{method:"POST",body:{id:crypto.randomUUID(),rows,templateVersion}})).job;}
async function run(f,job,retry=false){return(await f.data(`/api/people-imports/${job.id}/run`,{method:"POST",body:{retry}})).job;}

test("company templates are owner-only, versioned, validated and affect only new explicitly templated drafts",async()=>{
 const f=fixture();assert.equal((await f.request("/api/people-template",{user:"member"})).status,403);
 let t=(await f.data("/api/people-template")).template;assert.equal(t.version,0);
 t=(await f.data("/api/people-template",{method:"PUT",body:{version:0,content:{organization:"Example Co",office:"Dubai"},editable:["intro","phone"]}})).template;
 assert.equal(t.version,1);assert.equal((await f.request("/api/people-template",{method:"PUT",body:{version:0,content:{},editable:[]}})).status,409);
 const p=(await f.data("/api/people",{method:"POST",body:{id:crypto.randomUUID(),slug:"template-card",useTemplate:true,content:{name:"Nadia"}}})).profile;
 assert.equal(p.content.organization,"Example Co");assert.deepEqual(p.editable,["intro","phone"]);assert.equal(p.state,"draft");
 await f.data("/api/people-template",{method:"PUT",body:{version:1,content:{organization:"New Co"},editable:[]}});
 assert.equal((await f.data(`/api/people/${p.id}`)).profile.content.organization,"Example Co");
 assert.equal((await f.request("/api/people-template",{method:"PUT",body:{version:2,content:{},editable:["workspace_id"]}})).status,400);
});

test("import preview is read-only, reports duplicate/invalid/unknown-employee rows and preserves existing cards",async()=>{
 const f=fixture(),before=f.DB.sql.prepare("SELECT COUNT(*) AS n FROM people").get().n;
 const p=await preview(f,[row(),row(),{...row("bad-email"),email:"bad"},{...row("staff"),employeeEmail:"other@example.com"}]);
 assert.equal(p.rows[0].error,null);for(const r of p.rows.slice(1))assert.ok(r.error);assert.equal(f.DB.sql.prepare("SELECT COUNT(*) AS n FROM people").get().n,before);
 assert.equal((await f.request("/api/people-imports",{method:"POST",body:{id:crypto.randomUUID(),rows:[row(),row()],templateVersion:0}})).status,400);
 assert.equal((await f.request("/api/people-imports/preview",{method:"POST",body:{rows:Array.from({length:101},(_,i)=>row('n-'+i))}})).status,400);
});

test("import chunks resume safely with fixed identities, private drafts and exact approved-member assignments",async()=>{
 const f=fixture(),rows=Array.from({length:12},(_,i)=>({...row('staff-'+i),employeeEmail:"member@example.com"}));let job=await create(f,rows),id=job.id;
 job=await run(f,job);assert.equal(job.rows.filter(r=>r.result?.status==="created").length,10);
 job=await run(f,job);assert.equal(job.id,id);assert.equal(job.rows.filter(r=>r.result?.status==="created").length,12);
 const qr=f.DB.sql.prepare("SELECT qr_id FROM people ORDER BY id").all();await run(f,job);assert.deepEqual(f.DB.sql.prepare("SELECT qr_id FROM people ORDER BY id").all(),qr);
 assert.equal((await f.data("/api/people",{user:"member"})).profiles.length,12);
 assert.equal((await f.request("/people/staff-0",{user:null})).status,404);
 const same=await f.data("/api/people-imports",{method:"POST",body:{id,rows}});assert.equal(same.job.id,id);
 assert.equal((await f.request("/api/people-imports",{method:"POST",body:{id,rows:[row('changed')]}})).status,409);
 assert.equal((await f.request(`/api/people-imports/${id}`,{user:"other",wid:"b"})).status,404);
 assert.equal((await f.request(`/api/people-imports/${id}/run`,{user:"member",method:"POST",body:{}})).status,403);
});

test("commit races never overwrite cards, errors are visible and later rows continue",async()=>{
 const f=fixture();let job=await create(f,Array.from({length:12},(_,i)=>row('batch-'+i)));
 await f.data('/api/people',{method:'POST',body:{id:crypto.randomUUID(),slug:'batch-0',content:{name:'Existing person'}}});
 job=await run(f,job);assert.equal(job.rows[0].result.status,'error');assert.match(job.rows[0].result.error,/reserved/);
 job=await run(f,job);assert.equal(job.rows[11].result.status,'created');
 assert.equal(f.DB.sql.prepare("SELECT draft_json FROM people WHERE slug='batch-0'").get().draft_json.includes('Existing person'),true);
 const count=f.DB.sql.prepare("SELECT COUNT(*) AS n FROM people").get().n;job=await run(f,job,true);assert.equal(job.rows[0].result.status,'error');assert.equal(f.DB.sql.prepare("SELECT COUNT(*) AS n FROM people").get().n,count);
});

test("removed employee assignment fails at commit; concurrent runners preserve identities and results",async()=>{
 const f=fixture();let job=await create(f,[{...row('assigned'),employeeEmail:'member@example.com'},row('unassigned')]);
 f.DB.sql.prepare("DELETE FROM memberships WHERE uid='member'").run();
 const results=await Promise.all([run(f,job),run(f,job)]);job=(await f.data(`/api/people-imports/${job.id}`)).job;
 assert.equal(job.rows[0].result.status,'error');assert.equal(job.rows[1].result.status,'created');assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM people').get().n,1);
 assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM people_revisions').get().n,1);assert.equal(results.length,2);
});

test("template changes invalidate preview and import history removal retains created cards",async()=>{
 const f=fixture(),rows=[row('retained-card')],p=await preview(f,rows);
 await f.data('/api/people-template',{method:'PUT',body:{version:0,content:{organization:'Changed'},editable:[]}});
 assert.equal((await f.request('/api/people-imports',{method:'POST',body:{id:crypto.randomUUID(),rows,templateVersion:p.templateVersion}})).status,409);
 let job=await run(f,await create(f,rows)),id=job.rows[0].result.profile_id;
 assert.equal((await f.request(`/api/people-imports/${job.id}`,{user:'member',method:'DELETE'})).status,403);
 await f.data(`/api/people-imports/${job.id}`,{method:'DELETE'});
 assert.equal((await f.request(`/api/people-imports/${job.id}`)).status,404);
 assert.equal((await f.data(`/api/people/${id}`)).profile.content.name,'Contact One');
 assert.equal(f.DB.sql.prepare('SELECT source_import_id FROM people WHERE id=?').get(id).source_import_id,null);
 assert.equal(f.DB.sql.prepare('PRAGMA foreign_key_check').all().length,0);
});

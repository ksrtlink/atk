import test from "node:test";
import assert from "node:assert/strict";
import {sqliteD1} from "./enterprise.test.mjs";
import {createApp} from "../src/worker.mjs";
import {localToUTC,utcToLocal,preferredLanguage,resolveDestination} from "../shared/routing.mjs";
import {routingInput} from "../src/routing.mjs";
const config=()=>({enabled:true,schedules:[],audiences:[]});
const audience=(country,language,destination)=>({id:crypto.randomUUID(),country,language,destination});
const schedule=(start,end,destination="https://example.com/event")=>({id:crypto.randomUUID(),start,end,timezone:"UTC",destination});
const env={PUBLIC_ORIGIN:"https://tinytrail.link"},req=new Request("https://tinytrail.link/api");

test("timezone conversion round-trips explicit zones including fractional offsets",()=>{
 assert.equal(localToUTC('2026-10-20T09:00','Asia/Dubai'),'2026-10-20T05:00:00.000Z');
 assert.equal(utcToLocal('2026-10-20T05:00:00.000Z','Asia/Dubai'),'2026-10-20T09:00');
 assert.equal(localToUTC('2026-10-20T09:00','Asia/Kathmandu'),'2026-10-20T03:15:00.000Z');
});
test("timezone conversion rejects skipped, repeated and invalid local times",()=>{
 assert.throws(()=>localToUTC('2026-03-08T02:30','America/New_York'),/does not exist/);
 assert.throws(()=>localToUTC('2026-11-01T01:30','America/New_York'),/occurs twice/);
 assert.throws(()=>localToUTC('2026-02-30T12:00','UTC'));
 assert.throws(()=>localToUTC('2026-10-20T09:00','Not/A_Zone'));
});
test("language preferences respect quality, zero exclusions, specificity and unknown values",()=>{
 assert.equal(preferredLanguage('en;q=0.5,fr-CA;q=0.9'),'fr-ca');
 assert.equal(preferredLanguage('en;Q=0,ar;q=1'),'ar');
 assert.equal(preferredLanguage('*,en;q=0'), '');
 const c=config();c.audiences=[audience('','en-GB','https://example.com/gb'),audience('','en','https://example.com/en')];
 assert.equal(resolveDestination('https://example.com/default',c,{language:'en-GB,en;q=0.9'}).destination,'https://example.com/gb');
 assert.equal(resolveDestination('https://example.com/default',c,{language:'en-US'}).destination,'https://example.com/en');
 assert.equal(resolveDestination('https://example.com/default',c,{language:'*'}).matched,'fallback');
});
test("schedules use inclusive start/exclusive end and override ordered audience rules",()=>{
 const c=config(),start='2026-10-20T10:00:00Z',end='2026-10-20T11:00:00Z';c.schedules=[schedule(start,end)];c.audiences=[audience('AE','','https://example.com/ae')];
 const r=at=>resolveDestination('https://example.com/default',c,{country:'AE'},Date.parse(at));
 assert.equal(r('2026-10-20T09:59:59.999Z').matched,'audience');
 assert.equal(r(start).matched,'schedule');assert.equal(r('2026-10-20T10:59:59.999Z').matched,'schedule');assert.equal(r(end).matched,'audience');
 c.enabled=false;assert.equal(r(start).matched,'fallback');
});
test("audience ordering is deterministic, both conditions must match and unknown country falls back",()=>{
 const c=config();c.audiences=[audience('AE','ar','https://example.com/ae-ar'),audience('AE','','https://example.com/ae'),audience('','fr','https://example.com/fr')];
 assert.equal(resolveDestination('https://example.com/default',c,{country:'AE',language:'ar-AE'}).destination,'https://example.com/ae-ar');
 assert.equal(resolveDestination('https://example.com/default',c,{country:'AE',language:'en'}).destination,'https://example.com/ae');
 assert.equal(resolveDestination('https://example.com/default',c,{country:'XX',language:'fr'}).destination,'https://example.com/fr');
 assert.equal(resolveDestination('https://example.com/default',c,{country:'ZZ'}).matched,'fallback');
});
test("rule validation rejects overlap, credentials, loops, invalid zones and empty audience conditions",()=>{
 const c=config();c.schedules=[schedule('2026-10-20T10:00:00Z','2026-10-20T12:00:00Z'),schedule('2026-10-20T11:00:00Z','2026-10-20T13:00:00Z')];assert.throws(()=>routingInput(c,env,req),/overlap/);
 c.schedules[1].start='2026-10-20T12:00:00Z';assert.equal(routingInput(c,env,req).schedules.length,2);
 for(const destination of ['javascript:alert(1)','https://user:pass@example.com','https://tinytrail.link/r/report']){const r=config();r.audiences=[audience('AE','',destination)];assert.throws(()=>routingInput(r,env,req));}
 const invalid=config();invalid.schedules=[schedule('2026-02-30T10:00:00Z','2026-03-02T11:00:00Z')];assert.throws(()=>routingInput(invalid,env,req));
 const r=config();r.audiences=[audience('','','https://example.com/')];assert.throws(()=>routingInput(r,env,req));
});
function fixture() {
 const DB=sqliteD1();for(const uid of ['owner','other'])DB.sql.prepare('INSERT INTO users(uid,email) VALUES(?,?)').run(uid,uid+'@example.com');
 for(const wid of ['a','b'])DB.sql.prepare('INSERT INTO workspaces(id,name) VALUES(?,?)').run(wid,wid);
 DB.sql.prepare("INSERT INTO memberships VALUES('a','owner','owner'),('b','other','owner')").run();
 const settings={...env,DB,FIREBASE_PROJECT_ID:'test',FIREBASE_API_KEY:'public',TRACKED_QR_ENABLED:'true'},app=createApp(async uid=>({uid,email:uid+'@example.com',verified:true}));
 async function request(path,{method='GET',user='owner',wid='a',body,country,language}={}){const request=new Request('https://tinytrail.link'+path,{method,headers:{...(user?{Authorization:'Bearer '+user,'X-Workspace-Id':wid}:{}),...(body?{'Content-Type':'application/json'}:{}),...(language?{'Accept-Language':language}:{})},body:body?JSON.stringify(body):undefined});if(country)Object.defineProperty(request,'cf',{value:{country}});return app.fetch(request,settings);}
 async function data(path,opts){const r=await request(path,opts),d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;}
 return {DB,settings,request,data};
}
async function seed(f){await f.data('/api/me');f.DB.sql.prepare("INSERT INTO links(slug,destination,title,owner_uid,short_url,workspace_id,updated_by) VALUES('route-test','https://example.com/default','Route test','owner','https://tinytrail.link/r/route-test','a','owner')").run();return 'route-test';}
test("saved audience rules change link and linked-QR resolution without changing either public address",async()=>{
 const f=fixture(),slug=await seed(f),c=config();c.audiences=[audience('AE','ar','https://example.com/arabic')];
 const saved=await f.data(`/api/links/${slug}/routing`,{method:'PUT',body:{version:0,linkVersion:1,config:c}});assert.equal(saved.version,1);
 const asset=(await f.data('/api/tracked-qrs',{method:'POST',body:{id:crypto.randomUUID(),title:'Printed QR',linkSlug:slug}})).asset;
 for(const path of ['/r/'+slug,new URL(asset.publicUrl).pathname]){
  const match=await f.request(path,{user:null,country:'AE',language:'ar-AE'});assert.equal(match.status,302);assert.equal(match.headers.get('Location'),'https://example.com/arabic');assert.equal(match.headers.get('Cache-Control'),'no-store');
  assert.equal((await f.request(path,{user:null,country:'US',language:'en'})).headers.get('Location'),'https://example.com/default');
 }
 assert.equal((await f.request(`/api/links/${slug}/routing`,{method:'PUT',body:{version:0,linkVersion:1,config:c}})).status,409);
 assert.equal((await f.request(`/api/links/${slug}/routing`,{user:'other',wid:'b'})).status,404);
 assert.equal((await f.request(`/api/links/${slug}/routing`,{user:null})).status,401);
});
test("routing preview is read-only; fallback edits, deleted links and legacy protection retain their contracts",async()=>{
 const f=fixture(),slug=await seed(f),c=config();c.schedules=[schedule('2026-10-20T10:00:00Z','2026-10-20T11:00:00Z')];
 const preview=await f.data(`/api/links/${slug}/routing/preview`,{method:'POST',body:{config:c,country:'',language:'',at:'2026-10-20T10:00:00Z'}});assert.equal(preview.matched,'schedule');
 assert.equal(f.DB.sql.prepare('SELECT COUNT(*) n FROM link_routing').get().n,0);
 await f.data(`/api/links/${slug}/routing`,{method:'PUT',body:{version:0,linkVersion:1,config:c}});
 await f.data(`/api/links/${slug}`,{method:'PATCH',body:{version:1,destination:'https://example.com/new-default'}});
 assert.equal((await f.request(`/api/links/${slug}/routing`,{method:'PUT',body:{version:1,linkVersion:1,config:c}})).status,409);
 const get=await f.data(`/api/links/${slug}/routing`);assert.equal(get.fallback,'https://example.com/new-default');
 const legacy=f.DB.sql.prepare('SELECT slug FROM links WHERE legacy=1 LIMIT 1').get().slug;
 assert.equal((await f.request(`/api/links/${legacy}/routing`)).status,404);
 await f.data(`/api/links/${slug}`,{method:'DELETE',body:{version:2}});
 assert.equal((await f.request('/r/'+slug,{user:null})).status,410);
 assert.equal((await f.request(`/api/links/${slug}/routing`)).status,404);
});

import test from "node:test";
import assert from "node:assert/strict";
import {sqliteD1} from "./enterprise.test.mjs";
import {createApp} from "../src/worker.mjs";
import {vcard,fold} from "../src/vcard.mjs";
import {prunePeople} from "../src/people.mjs";
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

const content=(name="Nadia Example")=>({name,givenName:"Nadia",familyName:"Example",organization:"Example team",title:"Consultant",email:"nadia@example.com",phone:"+971 50 123 4567",resources:[]});
async function create(f,slug="nadia") {return (await f.data("/api/people",{method:"POST",body:{id:crypto.randomUUID(),slug,content:content()}})).profile;}
async function change(f,p,action,body={}) {return(await f.data(`/api/people/${p.id}${action?"/"+action:""}`,{method:action?"POST":"PATCH",body:{version:p.version,...body}})).profile;}
async function publish(f,p){return change(f,p,"publish",{confirmPublic:true});}

test("profile draft privacy, owner-only creation/publication and approved public snapshots",async()=>{
 const f=fixture();let p=await create(f);
 assert.equal((await f.request("/people/nadia",{user:null})).status,404);
 assert.equal((await f.request("/people/nadia/contact.vcf",{user:null})).status,404);
 assert.equal((await f.request("/api/people",{user:null})).status,401);
 assert.equal((await f.request("/api/people",{user:"member",method:"POST",body:{}})).status,403);
 assert.equal((await f.request(`/api/people/${p.id}/publish`,{user:"member",method:"POST",body:{version:1,confirmPublic:true}})).status,404);
 assert.equal((await f.request(`/api/people/${p.id}/publish`,{method:"POST",body:{version:1}})).status,400);
 p=await publish(f,p);
 const html=await(await f.request("/people/nadia",{user:null})).text();assert.ok(html.includes("Nadia Example"));assert.ok(!html.includes(p.id));assert.ok(!html.includes("assigned_uid"));
 p=await change(f,p,null,{content:{...p.content,name:"Unpublished change"}});
 assert.ok(!(await(await f.request("/people/nadia",{user:null})).text()).includes("Unpublished change"));
 const vc=await(await f.request("/people/nadia/contact.vcf",{user:null})).text();assert.ok(vc.includes("FN:Nadia Example"));assert.ok(!vc.includes("Unpublished"));
 assert.equal((await f.request(`/api/people/${p.id}`,{method:"PATCH",body:{version:1,content:content()}})).status,409);
});

test("only assigned employees can read/edit allowed fields; cross-workspace and administrative writes denied",async()=>{
 const f=fixture();let p=await create(f);
 assert.equal((await f.data("/api/people",{user:"member"})).profiles.length,0);
 assert.equal((await f.request(`/api/people/${p.id}`,{user:"other",wid:"b"})).status,404);
 assert.equal((await f.request(`/api/people/${p.id}/assignment`,{method:"POST",body:{version:1,assignedUid:"other",editable:["intro"]}})).status,400);
 p=await change(f,p,"assignment",{assignedUid:"member",editable:["intro"]});
 let own=await f.data(`/api/people/${p.id}`,{user:"member"});assert.equal(own.profile.assignedUid,undefined);
 const edited=await f.data(`/api/people/${p.id}`,{user:"member",method:"PATCH",body:{version:p.version,content:{...p.content,intro:"Hello"}}});p=edited.profile;
 for(const [method,action,extra]of [["PATCH","",{content:{...p.content,title:"Director"}}],["POST","/publish",{confirmPublic:true}],["POST","/assignment",{assignedUid:"member",editable:["name"]}],["DELETE","",{}]])assert.equal((await f.request(`/api/people/${p.id}${action}`,{user:"member",method,body:{version:p.version,...extra}})).status,403);
 assert.equal((await f.data("/api/people",{user:"member"})).members.length,0);
});

test("disable gates all public routes, identity is retained and edits do not change QR address",async()=>{
 const f=fixture();let p=await publish(f,await create(f)),qr=p.qrUrl;
 let response=await f.request(new URL(qr).pathname,{user:null});assert.equal(response.status,302);assert.equal(response.headers.get("Location"),p.publicUrl);
 p=(await f.data(`/api/people/${p.id}`,{method:"DELETE",body:{version:p.version}})).profile;
 for(const path of ["/people/nadia","/people/nadia/contact.vcf","/people/nadia/go/email",new URL(qr).pathname])assert.equal((await f.request(path,{user:null})).status,410);
 p=await change(f,p,"activate");assert.equal((await f.request("/people/nadia",{user:null})).status,410);
 p=await publish(f,p);assert.equal(p.qrUrl,qr);
 assert.equal((await f.request("/api/people",{method:"POST",body:{id:crypto.randomUUID(),slug:"nadia",content:content("Other")}})).status,409);
});

test("public actions use saved values, escaped HTML, safe contact headers and no-store",async()=>{
 const f=fixture();let p=await create(f);p=await change(f,p,null,{content:{...p.content,name:'<script>alert(1)</script>',intro:'One; two, three\nFour'}});p=await publish(f,p);
 const r=await f.request("/people/nadia",{user:null}),html=await r.text();assert.ok(html.includes("&lt;script&gt;"));assert.ok(!html.includes("<script>"));assert.match(r.headers.get("Content-Security-Policy"),/default-src 'none'/);
 assert.equal((await f.request("/people/nadia/go/email",{user:null})).headers.get("Location"),"mailto:nadia%40example.com");
 assert.equal((await f.request("/people/nadia/go/phone",{user:null})).headers.get("Location"),"tel:+971501234567");
 assert.equal((await f.request("/people/nadia/go/booking",{user:null})).status,404);
 const vc=await f.request("/people/nadia/contact.vcf",{user:null});assert.match(vc.headers.get("Content-Type"),/^text\/vcard/);assert.equal(vc.headers.get("Cache-Control"),"no-store");assert.equal(vc.headers.get("Content-Disposition"),'attachment; filename="nadia.vcf"');
 assert.equal(await(await f.request("/people/nadia/contact.vcf",{user:null,method:"HEAD"})).text(),"");
});

test("vCard escapes Unicode punctuation and injection, folds UTF-8 without splitting characters",()=>{
 const name="محمد, 李; Example " .repeat(12),text=vcard({...content(name),intro:"Line 1\nLine 2; x,y\\z"},"https://tinytrail.link/people/nadia","2026-10-20T12:00:00Z");
 const unfolded=text.replace(/\r\n /g,"");assert.ok(unfolded.includes("FN:"+name.replace(/;/g,"\\;").replace(/,/g,"\\,")));assert.ok(unfolded.includes("NOTE:Line 1\\nLine 2\\; x\\,y\\\\z"));
 assert.ok(text.startsWith("BEGIN:VCARD\r\nVERSION:4.0\r\n"));assert.ok(text.endsWith("END:VCARD\r\n"));
 for(const line of text.split("\r\n"))assert.ok(new TextEncoder().encode(line).length<=75);
 assert.equal(fold("🙂".repeat(100)).replace(/\r\n /g,""),"🙂".repeat(100));assert.ok(!text.includes("�"));
});

test("profile funnel counts separately, opts in, excludes HEAD/bot and prunes 90-day events",async()=>{
 const f=fixture(),p=await publish(f,await create(f));
 await f.request("/people/nadia",{user:null});await f.flush();assert.equal(f.DB.sql.prepare("SELECT COUNT(*) AS n FROM people_events").get().n,0);
 await f.data("/api/analytics/settings",{method:"POST",body:{enabled:true}});
 for(const path of ["/people/nadia","/people/nadia/contact.vcf","/people/nadia/go/email",new URL(p.qrUrl).pathname])await f.request(path,{user:null});
 await f.request("/people/nadia",{user:null,method:"HEAD"});await f.request("/people/nadia",{user:null,headers:{"User-Agent":"Googlebot"}});await f.flush();
 assert.deepEqual(f.DB.sql.prepare("SELECT kind,COUNT(*) AS n FROM people_events GROUP BY kind ORDER BY kind").all().map(r=>[r.kind,r.n]),[["contact_download",1],["profile_action",1],["profile_qr_visit",1],["profile_view",1]]);
 assert.equal(f.DB.sql.prepare("SELECT COUNT(*) AS n FROM engagement_events").get().n,0);
 f.DB.sql.prepare("UPDATE people_events SET occurred_at=? WHERE kind='profile_view'").run(Date.now()-91*86400000);await prunePeople(f.env);assert.equal(f.DB.sql.prepare("SELECT COUNT(*) AS n FROM people_events").get().n,3);
});

test("sharing assets require authorized access and use the published snapshot through later draft edits",async()=>{
 const f=fixture();let p=await create(f);
 assert.equal((await f.request(`/api/people/${p.id}/distribution`)).status,409);
 p=await publish(f,p);p=await change(f,p,null,{content:{...p.content,name:'Private draft name'}});
 const asset=await f.data(`/api/people/${p.id}/distribution`);assert.equal(asset.content.name,'Nadia Example');assert.equal(asset.qrUrl,p.qrUrl);
 assert.equal((await f.request(`/api/people/${p.id}/distribution`,{user:'member'})).status,404);
 assert.equal((await f.request(`/api/people/${p.id}/distribution`,{user:'other',wid:'b'})).status,404);
 p=await change(f,p,'assignment',{assignedUid:'member',editable:[]});
 assert.equal((await f.data(`/api/people/${p.id}/distribution`,{user:'member'})).content.name,'Nadia Example');
 p=(await f.data(`/api/people/${p.id}`,{method:'DELETE',body:{version:p.version}})).profile;
 assert.equal((await f.request(`/api/people/${p.id}/distribution`,{user:'member'})).status,409);
});

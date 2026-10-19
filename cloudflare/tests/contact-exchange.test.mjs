import test from 'node:test';
import assert from 'node:assert/strict';
import {SignJWT,decodeJwt} from 'jose';
import {sqliteD1} from './enterprise.test.mjs';
import {createApp} from '../src/worker.mjs';
import {CONTACT_POLICY,CONTACT_CONSENT,pruneContacts} from '../src/contact-exchange.mjs';
const secret='test-only-contact-secret-32-characters-long',origin='https://tinytrail.link';
async function fixture(){
 const DB=sqliteD1();for(const uid of ['owner','employee','member','other'])DB.sql.prepare('INSERT INTO users(uid,email) VALUES(?,?)').run(uid,uid+'@example.com');
 for(const id of ['a','b'])DB.sql.prepare('INSERT INTO workspaces(id,name) VALUES(?,?)').run(id,id);
 for(const [wid,uid,role]of [['a','owner','owner'],['a','employee','member'],['a','member','member'],['b','other','owner']])DB.sql.prepare('INSERT INTO memberships VALUES(?,?,?)').run(wid,uid,role);
 const env={DB,PUBLIC_ORIGIN:origin,FIREBASE_PROJECT_ID:'test',FIREBASE_API_KEY:'public',CONTACT_EXCHANGE_ENABLED:'true',CONTACT_EXCHANGE_POLICY:CONTACT_POLICY,CONTACT_EXCHANGE_SECRET:secret,ANALYTICS_ENABLED:'true',ANALYTICS_RETENTION_DAYS:'90'},app=createApp(async uid=>({uid,email:uid+'@example.com',verified:uid!=='unverified'}));
 const request=(path,{method='GET',user='owner',wid='a',body,form,headers={}}={})=>app.fetch(new Request(origin+path,{method,headers:{...(user?{Authorization:'Bearer '+user,'X-Workspace-Id':wid}:{}),...(body?{'Content-Type':'application/json'}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded',Origin:origin,'CF-Connecting-IP':'203.0.113.9'}:{}),...headers},body:body?JSON.stringify(body):form?new URLSearchParams(form).toString():undefined}),env,{waitUntil:()=>{}});
 const data=async(path,options)=>{const r=await request(path,options),d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;};
 let p=(await data('/api/people',{method:'POST',body:{id:crypto.randomUUID(),slug:'nadia',content:{name:'Nadia <Example>',organization:'Example',resources:[]}}})).profile;
 p=(await data('/api/people/'+p.id+'/assignment',{method:'POST',body:{version:p.version,assignedUid:'employee',editable:[]}})).profile;
 p=(await data('/api/people/'+p.id+'/publish',{method:'POST',body:{version:p.version,confirmPublic:true}})).profile;
 const base='/api/people/'+p.id+'/exchange',publicPath='/people/nadia/exchange';
 await data(base,{method:'PUT',body:{enabled:true,policy:CONTACT_POLICY}});
 async function form(event=null){const path=publicPath+(event?'?event='+event:''),r=await request(path,{user:null}),html=await r.text();assert.equal(r.status,200,html);const token=html.match(/name="token" value="([^"]+)"/)[1],claims=decodeJwt(token);assert.equal(claims.nbf,claims.iat+2); // Issued forms impose a short minimum delay.
  // Advance this signed test fixture past nbf without sleeping; real signatures are verified by the Worker.
  claims.nbf=Math.floor(Date.now()/1000)-1;const ready=await new SignJWT(claims).setProtectedHeader({alg:'HS256'}).sign(new TextEncoder().encode(secret));
  return{path,values:{token:ready,name:'Visitor',email:'visitor@example.com',organization:'',phone:'',message:'Hello\r\nAgain',consent:CONTACT_POLICY,website:''},issued:token};}
 const post=(f,extra={})=>request(f.path,{method:'POST',user:null,form:{...f.values,...extra}});
 return{DB,env,request,data,p,base,publicPath,form,post};
}
test('contact exchange is voluntary, consented, idempotent and stores no raw network identifiers',async()=>{
 const f=await fixture();const card=await f.request('/people/nadia',{user:null}),html=await card.text();assert.match(html,/Save contact/);assert.match(html,/Share your details/);assert.doesNotMatch(html,/Nadia <Example>/);
 const form=await f.form();assert.equal((await f.post(form,{consent:''})).status,400);assert.equal((await f.post(form)).status,303);assert.equal((await f.post(form)).status,303);
 const records=f.DB.sql.prepare('SELECT * FROM contact_submissions').all();assert.equal(records.length,1);assert.equal(records[0].consent_text,CONTACT_CONSENT);assert.equal(records[0].consent_version,CONTACT_POLICY);assert.equal(records[0].expires_at-records[0].consent_at,90*86400000);assert.equal(JSON.parse(records[0].fields_json).message,'Hello\r\nAgain');
 const buckets=f.DB.sql.prepare('SELECT * FROM contact_abuse_buckets').all();assert.equal(buckets.length,2);assert.ok(buckets.every(b=>/^[a-f0-9]{64}$/.test(b.id)&&b.count===1));assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM contact_submission_events').get().n,0);
});
test('only receiving employee and owners can read/export/update/delete contacts',async()=>{
 const f=await fixture(),form=await f.form();await f.post(form);
 for(const [user,wid,status]of [[null,'a',401],['unverified','a',403],['member','a',404],['other','a',403],['other','b',404]])assert.equal((await f.request(f.base+'/inbox',{user,wid})).status,status);
 const contacts=(await f.data(f.base+'/inbox',{user:'employee'})).submissions;assert.equal(contacts.length,1);const c=contacts[0];assert.equal(c.fields.email,'visitor@example.com');
 assert.equal((await f.request(f.base,{method:'PUT',user:'employee',body:{enabled:false}})).status,403);
 assert.equal((await f.request(f.base+'/inbox/'+c.id,{method:'PATCH',user:'employee',body:{version:1,state:'reviewed'}})).status,200);
 assert.equal((await f.request(f.base+'/inbox/'+c.id,{method:'DELETE',body:{version:1}})).status,409);
 assert.equal((await f.request(f.base+'/inbox/'+c.id,{method:'DELETE',body:{version:2}})).status,200);
 assert.equal((await f.data(f.base+'/inbox')).submissions.length,0);assert.equal((await f.post(form)).status,303);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) n FROM contact_submissions').get().n,0,'retry cannot recreate a deleted contact');
});
test('disabled deployment, unapproved policy and missing secret hide collection without affecting cards',async()=>{
 for(const patch of [{CONTACT_EXCHANGE_ENABLED:'false'},{CONTACT_EXCHANGE_POLICY:''},{CONTACT_EXCHANGE_SECRET:''}]){const f=await fixture();Object.assign(f.env,patch);assert.equal((await f.request(f.publicPath,{user:null})).status,404);assert.equal((await f.request(f.base)).status,503);const r=await f.request('/people/nadia',{user:null});assert.equal(r.status,200);assert.doesNotMatch(await r.text(),/Share your details/);assert.equal((await f.request('/people/nadia/contact.vcf',{user:null})).status,200);}
});
test('cross-origin, malformed, overlarge, tampered, early and expired forms are rejected',async()=>{
 const f=await fixture(),form=await f.form();assert.equal((await f.request(form.path,{method:'POST',user:null,form:form.values,headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await f.post(form,{website:'spam.example'})).status,400);assert.equal((await f.post(form,{token:'wrong'})).status,400);assert.equal((await f.post(form,{token:form.issued})).status,400);
 assert.equal((await f.post(form,{message:'x'.repeat(17000)})).status,413);assert.equal((await f.post(form,{email:'evil@example.com\r\nInjected: yes'})).status,400);assert.equal((await f.post(form,{name:'\u0000'})).status,400);
 const expired=await new SignJWT({...decodeJwt(form.values.token),exp:Math.floor(Date.now()/1000)-1}).setProtectedHeader({alg:'HS256'}).sign(new TextEncoder().encode(secret));assert.equal((await f.post(form,{token:expired})).status,400);
 assert.equal((await f.request(form.path,{method:'POST',user:null,body:{...form.values},headers:{Origin:origin}})).status,415);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) n FROM contact_submissions').get().n,0);
});
test('event links reuse profiles and validate stored association/version for attribution',async()=>{
 const f=await fixture(),id=crypto.randomUUID();await f.data(f.base+'/events',{method:'POST',body:{id,name:'Conference <2026>'}});await f.data(f.base+'/events',{method:'POST',body:{id,name:'Conference <2026>'}});
 const events=(await f.data(f.base+'/events',{user:'employee'})).events;assert.equal(events.length,1);assert.equal(events[0].url,origin+'/people/nadia?event='+id);
 f.DB.sql.prepare('INSERT INTO analytics_settings(workspace_id,enabled,updated_at) VALUES(?,1,0)').run('a');const form=await f.form(id);await f.post(form);
 const c=(await f.data(f.base+'/inbox')).submissions[0];assert.equal(c.event.id,id);assert.equal(c.event.name,'Conference <2026>');const counted=f.DB.sql.prepare('SELECT * FROM contact_submission_events').all();assert.equal(counted.length,1);assert.equal(counted[0].kind,'contact_submission');assert.equal(counted[0].campaign_id,id);
 assert.equal((await f.request(f.publicPath+'?event='+crypto.randomUUID(),{user:null})).status,404);
 const other=crypto.randomUUID();f.DB.sql.prepare('INSERT INTO contact_campaigns(id,profile_id,workspace_id,name,created_by,created_at) VALUES(?,?,?,?,?,?)').run(other,f.p.id,'b','Other','other',Date.now());assert.equal((await f.request(f.publicPath+'?event='+other,{user:null})).status,404);
 const pending=await f.form(id);await f.data(f.base+'/events/'+id,{method:'PATCH',body:{version:1,active:false}});assert.equal((await f.post(pending)).status,404);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) n FROM people').get().n,1);
});
test('public form versions invalidate after changes and feature/profile opt-out closes POST',async()=>{
 const f=await fixture(),form=await f.form();await f.data(f.base,{method:'PUT',body:{enabled:false}});assert.equal((await f.post(form)).status,404);await f.data(f.base,{method:'PUT',body:{enabled:true,policy:CONTACT_POLICY}});assert.equal((await f.post(form)).status,409);
 const fresh=await f.form();f.DB.sql.prepare("UPDATE people SET state='disabled',version=version+1 WHERE id=?").run(f.p.id);assert.equal((await f.post(fresh)).status,404);assert.equal((await f.request(f.base+'/inbox')).status,200,'Disabling a public card does not hide its retained private inbox');
});
test('IP and profile quotas are atomic, retries do not consume allowance, missing network context fails closed',async()=>{
 const f=await fixture();for(let i=0;i<10;i++){const form=await f.form();assert.equal((await f.post(form)).status,303);assert.equal((await f.post(form)).status,303);}const limited=await f.form();assert.equal((await f.post(limited)).status,429);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) n FROM contact_submissions').get().n,10);
 assert.equal((await f.request(limited.path,{method:'POST',user:null,form:limited.values,headers:{'CF-Connecting-IP':''}})).status,503);
 f.DB.sql.prepare('UPDATE contact_abuse_buckets SET count=100 WHERE expires_at>?').run(Date.now());assert.equal((await f.request(limited.path,{method:'POST',user:null,form:limited.values,headers:{'CF-Connecting-IP':'203.0.113.10'}})).status,429);
});
test('submission transaction rolls back receipts and quota when storage fails',async()=>{
 const f=await fixture(),form=await f.form();f.DB.sql.exec("CREATE TRIGGER reject_contact BEFORE INSERT ON contact_submissions BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END;");assert.equal((await f.post(form)).status,503);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) n FROM contact_receipts').get().n,0);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) n FROM contact_abuse_buckets').get().n,0);f.DB.sql.exec('DROP TRIGGER reject_contact');assert.equal((await f.post(form)).status,303);
});
test('CSV protects all submitted text and retains consent provenance',async()=>{
 const f=await fixture(),form=await f.form();await f.post(form,{name:'=HYPERLINK("https://evil.example")',organization:'@formula',phone:'+971 50 123 4567',message:'\t+formula\nsecond line'});const r=await f.request(f.base+'/export',{user:'employee'}),csv=await r.text();assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.match(csv,/'=HYPERLINK/);assert.match(csv,/'@formula/);assert.match(csv,/'\+971/);assert.match(csv,/'\+formula/);assert.match(csv,/contact-exchange-v1/);assert.match(csv,/does not subscribe me to marketing/);
});
test('expired contacts are immediately invisible and pruning runs while collection is disabled',async()=>{
 const f=await fixture(),form=await f.form();await f.post(form);const now=Date.now();f.DB.sql.prepare('UPDATE contact_submissions SET expires_at=?').run(now-1);assert.equal((await f.data(f.base+'/inbox')).submissions.length,0);assert.doesNotMatch(await(await f.request(f.base+'/export')).text(),/visitor@example/);f.DB.sql.prepare('UPDATE contact_receipts SET expires_at=?').run(now-1);f.DB.sql.prepare('UPDATE contact_abuse_buckets SET expires_at=?').run(now-1);f.env.CONTACT_EXCHANGE_ENABLED='false';await pruneContacts(f.env);for(const table of ['contact_submissions','contact_receipts','contact_abuse_buckets'])assert.equal(f.DB.sql.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);assert.equal(f.DB.sql.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('inbox pagination does not skip contacts with matching timestamps and hides expired data',async()=>{
 const f=await fixture(),now=Date.now();const insert=f.DB.sql.prepare('INSERT INTO contact_submissions(id,workspace_id,profile_id,fields_json,consent_version,consent_text,consent_at,expires_at) VALUES(?,?,?,?,?,?,?,?)');for(let i=0;i<53;i++)insert.run(crypto.randomUUID(),'a',f.p.id,JSON.stringify({name:'Person '+i,email:'p'+i+'@example.com'}),CONTACT_POLICY,CONTACT_CONSENT,now,now+86400000);const first=await f.data(f.base+'/inbox');assert.equal(first.submissions.length,50);const second=await f.data(f.base+'/inbox?'+new URLSearchParams(first.next));assert.equal(second.submissions.length,3);assert.equal(new Set([...first.submissions,...second.submissions].map(x=>x.id)).size,53);assert.equal(second.next,null);assert.equal((await f.request(f.base+'/inbox?before=garbage')).status,400);
});

test('submission reports use completed UTC periods, owner/employee access and honest analytics coverage',async()=>{
 const f=await fixture();let report=await f.data(f.base+'/report',{user:'employee'});assert.equal(report.coverage.workspaceEnabled,false);assert.deepEqual(report.events,[]);assert.equal(report.timezone,'UTC');
 f.DB.sql.prepare('INSERT INTO analytics_settings(workspace_id,enabled,updated_at) VALUES(?,1,0)').run('a');const end=Date.parse(report.to),insert=f.DB.sql.prepare("INSERT INTO contact_submission_events VALUES(?,?,?,?,?,'contact_submission')");insert.run(crypto.randomUUID(),'a',f.p.id,null,end-1);insert.run(crypto.randomUUID(),'a',f.p.id,null,end);insert.run(crypto.randomUUID(),'a',f.p.id,null,end-31*86400000);report=await f.data(f.base+'/report');assert.equal(report.events[0].submissions,1);assert.equal(report.coverage.workspaceEnabled,true);assert.equal((await f.request(f.base+'/report',{user:'member'})).status,404);assert.equal((await f.request(f.base+'/report?days=365')).status,400);
});
test('cross-profile and cross-workspace contact mutations cannot retrieve or remove another inbox',async()=>{
 const f=await fixture(),form=await f.form();await f.post(form);const id=(await f.data(f.base+'/inbox')).submissions[0].id;
 for(const action of ['inbox','export','report','events'])assert.equal((await f.request(f.base+'/'+action,{user:'member'})).status,404);
 for(const method of ['PATCH','DELETE'])for(const [user,wid]of [['member','a'],['other','b']])assert.equal((await f.request(f.base+'/inbox/'+id,{method,user,wid,body:{version:1,state:'reviewed'}})).status,404);
 assert.equal((await f.request(f.base+'/events',{method:'POST',user:'employee',body:{id:crypto.randomUUID(),name:'Unauthorized'}})).status,403);assert.equal((await f.data(f.base+'/inbox')).submissions.length,1);
});

test('CSV export paginates beyond 500 contacts without omissions or repeated headers',async()=>{
 const f=await fixture(),now=Date.now(),insert=f.DB.sql.prepare('INSERT INTO contact_submissions(id,workspace_id,profile_id,fields_json,consent_version,consent_text,consent_at,expires_at) VALUES(?,?,?,?,?,?,?,?)');for(let i=0;i<507;i++)insert.run(crypto.randomUUID(),'a',f.p.id,JSON.stringify({name:'Export '+i,email:'export'+i+'@example.invalid',message:'Safe'}),CONTACT_POLICY,CONTACT_CONSENT,now,now+86400000);
 const first=await f.data(f.base+'/export?format=json');assert.equal(first.rows,500);assert.ok(first.next);const second=await f.data(f.base+'/export?'+new URLSearchParams({format:'json',...first.next}));assert.equal(second.rows,7);assert.equal(second.next,null);const csv=first.csv+second.csv;assert.equal((csv.match(/"Consent version"/g)||[]).length,1);for(let i=0;i<507;i++)assert.ok(csv.includes('"export'+i+'@example.invalid"'));const raw=await f.request(f.base+'/export');assert.ok(raw.headers.get('X-Next-Cursor'));assert.equal((await f.request(f.base+'/export?format=exe')).status,400);
});

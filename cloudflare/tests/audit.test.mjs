import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteD1} from './enterprise.test.mjs';
import {createApp} from '../src/worker.mjs';
import {pruneAudit} from '../src/audit.mjs';
const DAY=86400000;
function fixture(){
 const DB=sqliteD1();for(const uid of ['owner','member','other'])DB.sql.prepare('INSERT INTO users(uid,email,display_name) VALUES(?,?,?)').run(uid,uid+'@example.com',uid);
 for(const id of ['a','b'])DB.sql.prepare('INSERT INTO workspaces(id,name) VALUES(?,?)').run(id,id);
 for(const [wid,uid,role]of [['a','owner','owner'],['a','member','member'],['b','other','owner']])DB.sql.prepare('INSERT INTO memberships VALUES(?,?,?)').run(wid,uid,role);
 const env={DB,PUBLIC_ORIGIN:'https://tinytrail.link',FIREBASE_PROJECT_ID:'test',FIREBASE_API_KEY:'public',ANALYTICS_ENABLED:'true',TRACKED_QR_ENABLED:'true',CONTACT_EXCHANGE_ENABLED:'true',CONTACT_EXCHANGE_POLICY:'contact-exchange-v1',CONTACT_EXCHANGE_SECRET:'local-test-only-contact-secret-longer-than-32'},app=createApp(async uid=>({uid,email:uid+'@example.com',verified:uid!=='unverified'}));
 const request=(path,{method='GET',user='owner',wid='a',body,key,headers={}}={})=>app.fetch(new Request('https://tinytrail.link'+path,{method,headers:{...(user?{Authorization:'Bearer '+user,'X-Workspace-Id':wid}:{}),...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{}),...headers},body:body?JSON.stringify(body):undefined}),env,{waitUntil:()=>{}});
 const data=async(path,options)=>{const r=await request(path,options),d=await r.json();assert.ok(r.ok,JSON.stringify(d));return d;};
 const log=()=>DB.sql.prepare("SELECT * FROM audit_records WHERE workspace_id='a' ORDER BY rowid").all();
 const link=async(slug='audit-link')=>{const key=crypto.randomUUID(),body={slug,title:'Secret internal title',destination:'https://example.com/private?token=NEVER-IN-AUDIT#fragment'};return{...(await data('/api/links',{method:'POST',key,body})),key,body};};return{DB,env,app,request,data,log,link};
}
test('activity records verified link actors, create/edit/Trash/restore and ignores failed/replayed operations',async()=>{
 const f=fixture(),l=await f.link();await f.data('/api/links',{method:'POST',key:l.key,body:l.body});assert.equal(f.log().length,1);assert.equal(f.log()[0].actor_uid,'owner');
 const changed=await f.data('/api/links/audit-link',{method:'PATCH',user:'member',body:{title:'New secret title',destination:'https://example.org/changed?token=SECRET',version:1}});assert.equal(changed.link.version,2);
 assert.equal((await f.request('/api/links/audit-link',{method:'PATCH',body:{destination:'https://example.org/no',version:1}})).status,409);
 await f.data('/api/links/audit-link',{method:'DELETE',body:{version:2}});await f.data('/api/links/audit-link/restore',{method:'POST',body:{version:3}});
 assert.deepEqual(f.log().map(r=>[r.action,r.actor_uid,r.subject_version]),[['link.created','owner',1],['link.updated','member',2],['link.deleted','owner',3],['link.restored','owner',4]]);
 assert.equal((await f.request('/r/audit-link',{user:null})).status,302);assert.equal((await f.request('/r/audit-link',{user:null,method:'HEAD'})).status,302);assert.equal(f.log().length,4,'Visits must not generate administrative activity');
 const raw=JSON.stringify(f.log());for(const privateText of ['NEVER-IN-AUDIT','Secret internal title','New secret title','example.org','example.com','@example.com'])assert.ok(!raw.includes(privateText));
});
test('owners can read only their workspace, members and anonymous/unverified accounts cannot read activity',async()=>{
 const f=fixture();await f.link();
 for(const [user,wid,status]of [[null,'a',401],['unverified','a',403],['member','a',403],['other','a',403]])assert.equal((await f.request('/api/activity',{user,wid})).status,status);
 assert.equal((await f.data('/api/activity',{user:'other',wid:'b'})).records.length,0);assert.equal((await f.request('/api/activity',{method:'DELETE'})).status,405);
 const result=await f.data('/api/activity');assert.equal(result.records.length,1);assert.equal(result.records[0].actor.uid,'owner');assert.equal(result.timezone,'UTC');assert.equal(result.retentionDays,90);assert.ok(result.recordingSince);
 for(const q of ['days=365','type=users','until=invalid','before=123','cursor='+('a'.repeat(32)),'type=link&type=qr','workspace=b'])assert.equal((await f.request('/api/activity?'+q)).status,400,q);
});
test('audit failures roll back the actual asset change rather than losing the activity record',async()=>{
 const f=fixture();await f.link();f.DB.sql.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_records WHEN NEW.workspace_id='a' BEGIN SELECT RAISE(ABORT,'synthetic audit storage failure'); END;");
 assert.equal((await f.request('/api/links/audit-link',{method:'PATCH',body:{title:'Should roll back',destination:'https://example.org/failed',version:1}})).status,503);
 const row=f.DB.sql.prepare("SELECT * FROM links WHERE slug='audit-link'").get();assert.equal(row.version,1);assert.match(row.destination,/NEVER-IN-AUDIT/);assert.equal(f.log().length,1);f.DB.sql.exec('DROP TRIGGER reject_audit');
});
test('tracked QR and analytics setting changes attribute the current verified actor',async()=>{
 const f=fixture(),id=crypto.randomUUID();await f.data('/api/tracked-qrs',{method:'POST',body:{id,title:'QR title',destination:'https://example.com/'}});await f.data('/api/tracked-qrs/'+id,{method:'PATCH',user:'member',body:{version:1,state:'disabled',updatedBy:'other'}});
 await f.data('/api/analytics/settings',{method:'POST',body:{enabled:true}});await f.data('/api/analytics/settings',{method:'POST',body:{enabled:true}});await f.data('/api/analytics/settings',{method:'POST',body:{enabled:false}});
 assert.deepEqual(f.log().filter(r=>r.subject_type==='qr').map(r=>[r.action,r.actor_uid]),[['qr.created','owner'],['qr.disabled','member']]);assert.deepEqual(f.log().filter(r=>r.subject_type==='analytics').map(r=>[r.action,r.actor_uid]),[['analytics.enabled','owner'],['analytics.disabled','owner']]);
});
test('profile/resource/routing revision activity records metadata without draft or photo bytes',async()=>{
 const f=fixture(),p=(await f.data('/api/people',{method:'POST',body:{id:crypto.randomUUID(),slug:'audit-person',content:{name:'PRIVATE PERSON',intro:'SECRET INTRO',resources:[]}}})).profile;
 await f.data('/api/people/'+p.id+'/publish',{method:'POST',body:{version:p.version,confirmPublic:true}});
 const r=(await f.data('/api/resources',{method:'POST',body:{id:crypto.randomUUID(),slug:'audit-resource',content:{title:'PRIVATE RESOURCE',description:'SECRET BODY',items:[]}}})).page;
 assert.ok(r);const records=f.log();assert.ok(records.some(r=>r.action==='profile.created'&&r.subject_id===p.id));assert.ok(records.some(r=>r.action==='profile.published'));
 assert.ok(records.some(r=>r.subject_type==='resource'));for(const value of ['PRIVATE PERSON','SECRET INTRO','PRIVATE RESOURCE','SECRET BODY'])assert.ok(!JSON.stringify(records).includes(value));
});
test('contact review/deletion is atomic, scoped and preserves no submitted fields in audit',async()=>{
 const f=fixture(),p=(await f.data('/api/people',{method:'POST',body:{id:crypto.randomUUID(),slug:'audit-contact',content:{name:'Recipient',resources:[]}}})).profile,id=crypto.randomUUID(),now=Date.now();
 f.DB.sql.prepare('INSERT INTO contact_submissions(id,workspace_id,profile_id,fields_json,consent_version,consent_text,consent_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(id,'a',p.id,JSON.stringify({name:'PRIVATE VISITOR',email:'secret-visitor@example.invalid',message:'PRIVATE MESSAGE'}),'contact-exchange-v1','CONSENT BODY',now,now+DAY);
 const path='/api/people/'+p.id+'/exchange/inbox/'+id;await f.data(path,{method:'PATCH',body:{version:1,state:'reviewed',updatedBy:'other'}});assert.equal((await f.request(path,{method:'DELETE',body:{version:1}})).status,409);assert.equal(f.log().filter(r=>r.action==='contact.deleted').length,0);
 f.DB.sql.exec("CREATE TRIGGER reject_contact_audit BEFORE INSERT ON audit_records WHEN NEW.action='contact.deleted' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");assert.equal((await f.request(path,{method:'DELETE',body:{version:2}})).status,503);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) n FROM contact_submissions WHERE id=?').get(id).n,1);f.DB.sql.exec('DROP TRIGGER reject_contact_audit');
 await f.data(path,{method:'DELETE',body:{version:2}});const records=f.log().filter(r=>r.subject_type==='contact');assert.deepEqual(records.map(r=>[r.action,r.actor_kind,r.actor_uid]),[['contact.received','visitor',null],['contact.reviewed','user','owner'],['contact.deleted','user','owner']]);for(const value of ['PRIVATE VISITOR','secret-visitor','PRIVATE MESSAGE','CONSENT BODY'])assert.ok(!JSON.stringify(records).includes(value));
});
test('activity uses stable cursor pages and type filters, and current account labels are not historical snapshots',async()=>{
 const f=fixture(),now=Date.now()-1000;const insert=f.DB.sql.prepare("INSERT INTO audit_records(workspace_id,actor_uid,actor_kind,action,subject_type,subject_id,occurred_at) VALUES('a','member','user','link.created','link',?,?)");for(let i=0;i<57;i++)insert.run('page-'+i,now);const first=await f.data('/api/activity?type=link');assert.equal(first.records.length,50);const second=await f.data('/api/activity?'+new URLSearchParams({type:'link',until:first.until,...first.next}));assert.equal(second.records.length,7);assert.equal(second.next,null);assert.equal(new Set([...first.records,...second.records].map(r=>r.id)).size,57);assert.equal((await f.data('/api/activity?type=profile')).records.length,0);
 f.DB.sql.prepare("UPDATE users SET display_name='<img src=x onerror=alert(1)>' WHERE uid='member'").run();const result=await f.data('/api/activity');assert.equal(result.records[0].actor.label,'<img src=x onerror=alert(1)>');assert.ok(!JSON.stringify(f.log()).includes('onerror'));
});
test('expired audit metadata is immediately unavailable, pruning is bounded and has no recursive activity',async()=>{
 const f=fixture();await f.link();f.DB.sql.prepare("UPDATE audit_records SET occurred_at=? WHERE workspace_id='a'").run(Date.now()-91*DAY);assert.equal((await f.data('/api/activity?days=90')).records.length,0);await pruneAudit(f.env);assert.equal(f.log().length,0);assert.equal(f.DB.sql.prepare('PRAGMA foreign_key_check').all().length,0);
});
test('the hourly maintenance path remains below the free D1 query ceiling even when every batch is full',async()=>{
 const f=fixture();let calls=0;const original=f.DB.prepare.bind(f.DB);f.DB.prepare=query=>{const base=original(query);const wrap=statement=>({bind:(...a)=>wrap(statement.bind(...a)),first:async()=>{calls++;return statement.first();},all:async()=>{calls++;return statement.all();},run:async()=>{calls++;const r=await statement.run();if(query.startsWith('DELETE'))r.meta.changes=1000;return r;}});return wrap(base);};await f.app.scheduled({cron:'17 * * * *'},f.env);assert.ok(calls<=25,'Maximum maintenance query calls: '+calls);assert.ok(calls>=18,'Test must exercise full batches');
});

test('operators can pause capture for rollback without hiding retained records or interrupting mutations',async()=>{
 const f=fixture();await f.link();f.DB.sql.prepare('UPDATE audit_policy SET enabled=0 WHERE id=1').run();await f.data('/api/links/audit-link',{method:'PATCH',body:{title:'Paused update',destination:'https://example.org/paused',version:1}});assert.equal(f.log().length,1);let report=await f.data('/api/activity');assert.equal(report.recordingEnabled,false);assert.equal(report.previousPauses,1);f.DB.sql.prepare('UPDATE audit_policy SET enabled=1 WHERE id=1').run();await f.data('/api/links/audit-link',{method:'PATCH',body:{destination:'https://example.org/resumed',version:2}});assert.equal(f.log().length,2);report=await f.data('/api/activity');assert.equal(report.recordingEnabled,true);assert.equal(report.previousPauses,1);
});

test('personal activity belongs only to its account and cannot be read by a company owner',async()=>{
 const f=fixture();await f.data('/api/links',{method:'POST',user:'member',wid:'personal-member',key:crypto.randomUUID(),body:{slug:'solo-activity',destination:'https://example.com/private-solo'}});const personal=await f.data('/api/activity',{user:'member',wid:'personal-member'});assert.equal(personal.records.length,1);assert.equal(personal.records[0].actor.uid,'member');assert.equal((await f.data('/api/activity')).records.length,0);assert.equal((await f.request('/api/activity',{user:'owner',wid:'personal-member'})).status,403);
});

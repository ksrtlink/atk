import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/worker.mjs';

const schema=await readFile(new URL('../migrations/0001_schema.sql',import.meta.url),'utf8');
const seed=await readFile(new URL('../migrations/0002_original_links.sql',import.meta.url),'utf8');
function d1(){
  const sql=new DatabaseSync(':memory:');sql.exec(schema);sql.exec(seed);
  return {sql,prepare(query){return {bind(...args){return {async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return sql.prepare(query).run(...args);}};},async all(){return {results:sql.prepare(query).all()};},async first(){return sql.prepare(query).get()||null;}};}};
}
const alice={uid:'alice',email:'alice@example.com',name:'Alice',verified:true};
const bob={uid:'bob',email:'bob@example.com',name:'Bob',verified:true};
function fixture(){
  const db=d1();
  const env={DB:db,FIREBASE_PROJECT_ID:'test-project',FIREBASE_API_KEY:'public-test-key',PUBLIC_ORIGIN:'https://old.workers.dev'};
  const app=createApp(async token=>{if(token==='alice')return alice;if(token==='bob')return bob;if(token==='unverified')return {...alice,verified:false};throw new Error('invalid');});
  async function request(path,{user='alice',method='GET',body,headers={}}={}){
    const request=new Request(`https://app.workers.dev${path}`,{method,headers:{...(user?{Authorization:`Bearer ${user}`}:{ }),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
    return app.fetch(request,env);
  }
  return {env,db,request};
}
const create=(f,slug='new-report',user='alice',requestId=crypto.randomUUID())=>f.request('/api/links',{method:'POST',user,headers:{'Idempotency-Key':requestId},body:{slug,destination:'https://example.com/report?campaign=qr'}});
test('original eight QR addresses are unchanged and available without login',async()=>{
  const f=fixture();const response=await f.request('/api/legacy',{user:null});assert.equal(response.status,200);
  const {links}=await response.json();assert.equal(links.length,8);
  for(const link of links){assert.equal(link.shortUrl,`https://ksrtlink.github.io/atk/${link.slug}/`);assert.equal(link.legacy,true);}
  assert.equal((await f.request('/r/insights',{user:null})).headers.get('Location'),'https://www.kearney.com/industry/aerospace-defense/insights');
});
test('anonymous, invalid, and unverified identities cannot read private profiles or create links',async()=>{
  const f=fixture();for(const user of [null,'invalid','unverified']){
    const expected=user==='unverified'?403:401;
    assert.equal((await f.request('/api/links',{user})).status,expected);
    assert.equal((await create(f,'new-report',user)).status,expected);
  }
  assert.equal(f.db.sql.prepare('SELECT COUNT(*) AS count FROM users').get().count,0);
});
test('verified users create links and only see or edit their own records',async()=>{
  const f=fixture();const response=await create(f);assert.equal(response.status,201);
  const {link}=await response.json();assert.equal(link.shortUrl,'https://old.workers.dev/r/new-report');
  assert.equal((await(await f.request('/api/links',{user:'alice'})).json()).links.length,1);
  assert.equal((await(await f.request('/api/links',{user:'bob'})).json()).links.length,0);
  assert.equal((await f.request('/api/links/new-report',{method:'PATCH',user:'bob',body:{version:1,destination:'https://example.com/hijacked'}})).status,404);
  assert.equal((await f.request('/api/links/new-report',{method:'PATCH',body:{version:1,destination:'https://example.com/updated'}})).status,200);
  const redirect=await f.request('/r/new-report',{user:null});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('Location'),'https://example.com/updated');assert.equal(redirect.headers.get('Cache-Control'),'no-store');
  assert.equal((await f.request('/api/links/new-report',{method:'PATCH',body:{version:1,destination:'https://example.com/stale'}})).status,409);
});
test('duplicate names and replayed requests cannot overwrite existing links',async()=>{
  const f=fixture();const key=crypto.randomUUID();assert.equal((await create(f,'shared-name','alice',key)).status,201);
  assert.equal((await create(f,'shared-name','alice',key)).status,200);
  assert.equal((await create(f,'another-name','alice',key)).status,409);
  assert.equal((await create(f,'shared-name','bob')).status,409);
  assert.equal((await create(f,'insights')).status,409);
  assert.equal((await f.request('/api/links/insights',{method:'PATCH',body:{version:1,destination:'https://example.com/new'}})).status,404);
});
test('existing link addresses survive changing the configured public domain',async()=>{
  const f=fixture();await create(f,'before');f.env.PUBLIC_ORIGIN='https://kearney.page';
  const next=await(await create(f,'after')).json();assert.equal(next.link.shortUrl,'https://kearney.page/r/after');
  const {links}=await(await f.request('/api/links')).json();assert.equal(links.find(l=>l.slug==='before').shortUrl,'https://old.workers.dev/r/before');
  assert.equal((await f.request('/r/before',{user:null})).status,302);
});
test('saved QR designs persist per user and prevent cross-user or stale writes',async()=>{
  const f=fixture();const design={id:crypto.randomUUID(),title:'Report QR',url:'https://old.workers.dev/r/report',settings:{dots:'dots',border:'square',center:'dot',foreground:'#7823DC',background:'#FFFFFF',size:1024}};
  let response=await f.request('/api/designs',{method:'POST',body:design});assert.equal(response.status,201);
  assert.equal((await f.request('/api/designs',{method:'POST',body:design})).status,200);
  assert.equal((await(await f.request('/api/designs',{user:'bob'})).json()).designs.length,0);
  assert.equal((await f.request('/api/designs',{method:'POST',user:'bob',body:{...design,version:1}})).status,404);
  response=await f.request('/api/designs',{method:'POST',body:{...design,title:'Updated',version:1}});assert.equal(response.status,200);
  assert.equal((await response.json()).design.version,2);
  assert.equal((await f.request('/api/designs',{method:'POST',body:{...design,version:1}})).status,409);
});
test('validates destinations, shapes, colors, content size, origin, and optional email domains',async()=>{
  const f=fixture();
  for(const destination of ['javascript:alert(1)','https://app.workers.dev/r/loop','https://old.workers.dev/r/loop','https://user:password@example.com'])assert.equal((await f.request('/api/links',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:{slug:'test',destination}})).status,400);
  assert.equal((await f.request('/api/links',{headers:{Origin:'https://attacker.example'}})).status,403);
  assert.equal((await f.request('/api/links',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:{slug:'x',destination:'https://example.com/'+ 'a'.repeat(21000)}})).status,413);
  f.env.ALLOWED_EMAIL_DOMAINS='kearney.com';assert.equal((await f.request('/api/me')).status,403);
});
test('quotas are enforced inside the insert rather than by trusting the browser',async()=>{
  const f=fixture();f.env.MAX_LINKS_PER_USER='1';assert.equal((await create(f,'one')).status,201);assert.equal((await create(f,'two')).status,429);
});

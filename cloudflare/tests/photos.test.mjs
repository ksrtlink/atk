import test from 'node:test';import assert from 'node:assert/strict';import{PNG}from'pngjs';import{deflateSync}from'node:zlib';import{sqliteD1}from'./enterprise.test.mjs';import{createApp}from'../src/worker.mjs';import{photoPNG,photoDataURL,crc}from'../src/photo.mjs';
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


function portrait(color=100){const p=new PNG({width:64,height:64});for(let i=0;i<p.data.length;i+=4){p.data[i]=color;p.data[i+1]=150;p.data[i+2]=200;p.data[i+3]=255;}return PNG.sync.write(p);}
function chunk(type,data){const b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length);b.write(type,4);Buffer.from(data).copy(b,8);b.writeUInt32BE(crc(b.subarray(4,b.length-4)),b.length-4);return b;}
async function create(f,slug='portrait'){return(await f.data('/api/people',{method:'POST',body:{id:crypto.randomUUID(),slug,content:{name:'Portrait Person'}}})).profile;}
async function upload(f,p,color=100,opts={}){return(await f.data(`/api/people/${p.id}/photo`,{method:'POST',body:{id:crypto.randomUUID(),version:p.version,dataURL:photoDataURL(portrait(color))},...opts})).profile;}
async function publish(f,p){return(await f.data(`/api/people/${p.id}/publish`,{method:'POST',body:{version:p.version,confirmPublic:true}})).profile;}

test('photo PNG validates CRC, pixels and dimensions, strips hints and rejects unsupported/oversized/animated content',async()=>{
 const bytes=portrait(),p=await photoPNG(photoDataURL(bytes));assert.equal(p.width,64);assert.equal(p.height,64);assert.deepEqual(Buffer.from(p.bytes),bytes);
 const hints=Buffer.concat([bytes.subarray(0,33),chunk('pHYs',Buffer.alloc(9)),bytes.subarray(33)]);assert.deepEqual(Buffer.from((await photoPNG(photoDataURL(hints))).bytes),bytes);
 const bad=Buffer.from(bytes);bad[bad.length-1]^=1;await assert.rejects(()=>photoPNG(photoDataURL(bad)));
 const head=Buffer.from(bytes.subarray(16,29));head.writeUInt32BE(257);const large=Buffer.concat([bytes.subarray(0,8),chunk('IHDR',head),bytes.subarray(33)]);await assert.rejects(()=>photoPNG(photoDataURL(large)));
 for(const type of['acTL','tEXt','eXIf'])await assert.rejects(()=>photoPNG(photoDataURL(Buffer.concat([bytes.subarray(0,33),chunk(type,Buffer.alloc(8)),bytes.subarray(33)]))));
 await assert.rejects(()=>photoPNG('data:image/svg+xml;base64,PHN2Zy8+'));await assert.rejects(()=>photoPNG(photoDataURL(Buffer.alloc(120001))));await assert.rejects(()=>photoPNG(photoDataURL(Buffer.concat([bytes,Buffer.from('extra')]))));
});

test('photo decompression is bounded and rejects truncated pixels, invalid filters and malformed zlib streams',async()=>{
 const bytes=portrait(),header=Buffer.from(bytes.subarray(16,29));header.writeUInt32BE(1);header.writeUInt32BE(1,4);
 for(const data of[deflateSync(Buffer.alloc(1000000)),deflateSync(Buffer.from([0,1])),deflateSync(Buffer.from([9,0,0,0,255])),Buffer.from('not zlib')]){
  const b=Buffer.concat([bytes.subarray(0,8),chunk('IHDR',header),chunk('IDAT',data),chunk('IEND',Buffer.alloc(0))]);await assert.rejects(()=>photoPNG(photoDataURL(b)));
 }
});

test('draft photos remain private; only published snapshot photo is served, with safe PNG headers and vCard URL',async()=>{
 const f=fixture();let p=await upload(f,await create(f));assert.ok(p.content.photoId);assert.equal((await f.request('/people/portrait/photo',{user:null})).status,404);
 assert.equal((await f.request(`/api/people/${p.id}/photo`,{user:null})).status,401);assert.equal((await f.request(`/api/people/${p.id}/photo`,{user:'member'})).status,404);
 assert.equal((await f.data(`/api/people/${p.id}/photo`)).width,64);p=await publish(f,p);
 const first=await f.request('/people/portrait/photo',{user:null});assert.equal(first.status,200);assert.equal(first.headers.get('Content-Type'),'image/png');assert.equal(first.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(first.headers.get('Cache-Control'),'no-store');assert.deepEqual(Buffer.from(await first.arrayBuffer()),portrait());
 assert.ok((await(await f.request('/people/portrait',{user:null})).text()).includes('class="profile-photo"'));assert.ok((await(await f.request('/people/portrait/contact.vcf',{user:null})).text()).includes('PHOTO;MEDIATYPE=image/png:'));
 p=await upload(f,p,200);assert.deepEqual(Buffer.from(await(await f.request('/people/portrait/photo',{user:null})).arrayBuffer()),portrait());
 assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM people_photos').get().n,2);p=await publish(f,p);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM people_photos').get().n,1);assert.deepEqual(Buffer.from(await(await f.request('/people/portrait/photo',{user:null})).arrayBuffer()),portrait(200));
 p=(await f.data(`/api/people/${p.id}`,{method:'DELETE',body:{version:p.version}})).profile;assert.equal((await f.request('/people/portrait/photo',{user:null})).status,410);
});

test('photo changes require field permission, workspace membership and current version; photos cannot move between profiles',async()=>{
 const f=fixture();let p=await upload(f,await create(f));const other=await create(f,'another');
 assert.equal((await f.request(`/api/people/${other.id}`,{method:'PATCH',body:{version:other.version,content:{...other.content,photoId:p.content.photoId}}})).status,400);
 assert.equal((await f.request(`/api/people/${p.id}/photo`,{user:'other',wid:'b'})).status,404);
 p=(await f.data(`/api/people/${p.id}/assignment`,{method:'POST',body:{version:p.version,assignedUid:'member',editable:['intro']}})).profile;
 const body={version:p.version,id:crypto.randomUUID(),dataURL:photoDataURL(portrait(50))};assert.equal((await f.request(`/api/people/${p.id}/photo`,{user:'member',method:'POST',body})).status,403);
 p=(await f.data(`/api/people/${p.id}/assignment`,{method:'POST',body:{version:p.version,assignedUid:'member',editable:['photoId']}})).profile;
 assert.equal((await f.request(`/api/people/${p.id}/photo`,{method:'DELETE',body:{version:1}})).status,409);
 p=await upload(f,p,150,{user:'member'});assert.ok(p.content.photoId);
 f.DB.sql.prepare("DELETE FROM memberships WHERE uid='member'").run();assert.equal((await f.request(`/api/people/${p.id}/photo`,{user:'member'})).status,403);
});

test('photo retries are idempotent, replacements are bounded, removal respects public snapshot and publishing deletes orphan data',async()=>{
 const f=fixture();let p=await create(f),body={id:crypto.randomUUID(),version:p.version,dataURL:photoDataURL(portrait())};
 p=(await f.data(`/api/people/${p.id}/photo`,{method:'POST',body})).profile;const v=p.version;
 assert.equal((await f.data(`/api/people/${p.id}/photo`,{method:'POST',body})).profile.version,v);
 p=await publish(f,p);for(let i=0;i<5;i++)p=await upload(f,p,80+i);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM people_photos').get().n,2);
 p=(await f.data(`/api/people/${p.id}/photo`,{method:'DELETE',body:{version:p.version}})).profile;assert.equal(p.content.photoId,null);assert.equal((await f.request('/people/portrait/photo',{user:null})).status,200);
 p=await publish(f,p);assert.equal((await f.request('/people/portrait/photo',{user:null})).status,404);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM people_photos').get().n,0);assert.equal(f.DB.sql.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('failed photo revision rolls back upload and profile mutation; concurrent replacements keep only the winner',async()=>{
 const f=fixture();let p=await create(f);f.DB.sql.exec("CREATE TRIGGER fail_photo BEFORE INSERT ON people_revisions WHEN NEW.action='photo_updated' BEGIN SELECT RAISE(ABORT,'qa'); END;");
 assert.equal((await f.request(`/api/people/${p.id}/photo`,{method:'POST',body:{version:p.version,id:crypto.randomUUID(),dataURL:photoDataURL(portrait())}})).status,503);
 assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM people_photos').get().n,0);assert.equal((await f.data(`/api/people/${p.id}`)).profile.version,p.version);f.DB.sql.exec('DROP TRIGGER fail_photo');
 const results=await Promise.all([90,100].map(color=>f.request(`/api/people/${p.id}/photo`,{method:'POST',body:{version:p.version,id:crypto.randomUUID(),dataURL:photoDataURL(portrait(color))}})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM people_photos').get().n,1);
});

test('portrait requests do not inflate profile or contact engagement counts',async()=>{
 const f=fixture(),p=await publish(f,await upload(f,await create(f)));await f.data('/api/analytics/settings',{method:'POST',body:{enabled:true}});
 for(const method of['GET','GET','HEAD'])assert.equal((await f.request('/people/portrait/photo',{user:null,method})).status,200);
 await f.flush();assert.equal(f.DB.sql.prepare('SELECT COUNT(*) AS n FROM people_events').get().n,0);
});

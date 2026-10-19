import test from 'node:test';import assert from 'node:assert/strict';import {publicIP,healthURL,checkTarget} from '../src/health-net.mjs';import {checkHealthConfig}from'../scripts/health-config.mjs';
const env={PUBLIC_ORIGIN:'https://tinytrail.link'},request=new Request('https://tinytrail.link/api/health');
const answer=(ips=['8.8.8.8'])=>Response.json({Status:0,Answer:ips.map(data=>({type:data.includes(':')?28:1,data}))});
function network(handler,ips=['8.8.8.8']){const calls=[];return{calls,fetch:async(url,options)=>{calls.push({url,options});if(url.startsWith('https://cloudflare-dns.com/'))return answer(new URL(url).searchParams.get('type')==='A'?ips:[]);return handler(url,options);}};}

test('public address classification rejects reserved IPv4/IPv6, mapped private and metadata addresses',()=>{
 for(const ip of['127.0.0.1','0.0.0.0','10.1.1.1','172.16.1.1','192.168.1.1','169.254.169.254','100.100.100.200','168.63.129.16','192.0.2.1','198.18.1.1','224.0.0.1','255.255.255.255','::1','::','fd00::1','fe80::1','ff02::1','2001:db8::1','1::1','::ffff:127.0.0.1','64:ff9b::a00:1','2002:7f00:1::','fe80::1%eth0'])assert.equal(publicIP(ip),false,ip);
 for(const ip of['8.8.8.8','1.1.1.1','2606:4700:4700::1111','::ffff:8.8.8.8'])assert.equal(publicIP(ip),true,ip);
});

test('URL gates reject credentials, non-web schemes/ports, local names, unusual loopback syntax and own hosts',()=>{
 for(const url of['file:///etc/passwd','ftp://example.com','https://user:pass@example.com','https://example.com:8443/','http://localhost/','http://x.local/','http://metadata.google.internal/','http://2130706433/','http://0x7f000001/','http://0177.0.0.1/','http://[::ffff:127.0.0.1]/','https://tinytrail.link./p/test','https://ksrtlink.github.io/atk/','http://printer/'])assert.throws(()=>healthURL(url,env,request),url);
 assert.equal(healthURL('https://example.com/path?x=1#part',env,request).href,'https://example.com/path?x=1');
});

test('HEAD checks preserve status distinctions and omit credentials, cookies, referrers and engagement signals',async()=>{
 for(const[status,state]of[[200,'healthy'],[204,'healthy'],[404,'broken'],[410,'broken'],[401,'blocked'],[403,'blocked'],[429,'blocked'],[451,'blocked'],[405,'unknown'],[501,'unknown'],[500,'unreachable'],[503,'unreachable']]){
  const n=network((url,o)=>{assert.equal(o.method,'HEAD');assert.equal(o.redirect,'manual');assert.equal(o.credentials,'omit');assert.equal(o.referrerPolicy,'no-referrer');assert.equal(o.headers['Sec-Purpose'],'prefetch');assert.equal(new Headers(o.headers).has('Authorization'),false);assert.equal(new Headers(o.headers).has('Cookie'),false);return new Response(null,{status});});
  const r=await checkTarget('https://example.com/',env,request,n.fetch);assert.equal(r.state,state,status);assert.equal(r.httpStatus,status);assert.equal(n.calls.length,3);
 }
});

test('DNS gate rejects any private answer including mixed public/private and malformed/truncated responses',async()=>{
 for(const ips of[['127.0.0.1'],['8.8.8.8','10.0.0.1'],['::ffff:169.254.169.254'],['fd00::1']]){const n=network(()=>{throw Error('must not fetch target');},ips);assert.equal((await checkTarget('https://public-name.example/',env,request,n.fetch)).state,'blocked');assert.equal(n.calls.filter(c=>c.options.method==='HEAD').length,0);}
 for(const response of[()=>Response.json({Status:2}),()=>Response.json({Status:0,TC:true,Answer:[]}),()=>new Response('bad'),()=>new Response('x'.repeat(8193)),()=>new Response(null,{status:500})]){const r=await checkTarget('https://example.com/',env,request,async()=>response());assert.equal(r.state,'unreachable');}
});

test('redirects are revalidated, bounded, and never reach private/downgraded/credentialed targets',async()=>{
 for(const [location,reason]of[['http://127.0.0.1/','https_downgrade'],['https://10.0.0.1/','private_address'],['https://u:p@example.net/','unsafe_address'],['http://example.net/','https_downgrade'],['https://tinytrail.link/r/a','unsafe_address']]){
  let count=0;const n=network(()=>{count++;return new Response(null,{status:302,headers:{Location:location}});});const r=await checkTarget('https://example.com/',env,request,n.fetch);assert.equal(r.state,'blocked');assert.equal(r.reason,reason);assert.equal(count,1);
 }
 const n=network(url=>new Response(null,{status:302,headers:{Location:new URL('/'+(Number(new URL(url).pathname.slice(1)||0)+1),url).href}}));const r=await checkTarget('https://example.com/0',env,request,n.fetch);assert.equal(r.reason,'redirect_limit');assert.equal(n.calls.filter(c=>c.options.method==='HEAD').length,3);
 const loop=network(()=>new Response(null,{status:302,headers:{Location:'https://example.com/'}}));assert.equal((await checkTarget('https://example.com/',env,request,loop.fetch)).reason,'redirect_loop');
});

test('connection-time failure after public DNS is not misreported as healthy; timeout and header sizes are bounded',async()=>{
 const n=network(()=>{throw Error('native public-only fetch rejected changed/private DNS');});assert.equal((await checkTarget('https://example.com/',env,request,n.fetch)).state,'unreachable');
 const huge=network(()=>new Response(null,{status:200,headers:{'X-Huge':'x'.repeat(17000)}}));assert.equal((await checkTarget('https://example.com/',env,request,huge.fetch)).reason,'header_limit');
 const timeout=await checkTarget('https://example.com/',env,request,(url,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(Error('aborted')))),{timeoutMs:100});assert.equal(timeout.reason,'timeout');assert.ok(timeout.elapsedMs<1000);
});

test('enabled monitoring deployment requires strict public egress and the bounded queue cron',()=>{
 const c={vars:{LINK_HEALTH_ENABLED:'true',PUBLIC_ORIGIN:'https://tinytrail.link'},compatibility_flags:['global_fetch_strictly_public'],triggers:{crons:['*/5 * * * *']}};checkHealthConfig(c);
 assert.throws(()=>checkHealthConfig({...c,compatibility_flags:[]}));assert.throws(()=>checkHealthConfig({...c,compatibility_flags:[...c.compatibility_flags,'global_fetch_private_origin']}));assert.throws(()=>checkHealthConfig({...c,triggers:{crons:[]}}));checkHealthConfig({vars:{LINK_HEALTH_ENABLED:'false'}});
});

test('DNS resolver redirects are refused without contacting the redirect location and response streams are canceled',async()=>{
 let cancels=0,calls=[];const fetcher=async(url,options)=>{calls.push(url);assert.equal(options.redirect,'manual');return new Response(new ReadableStream({cancel(){cancels++;}}),{status:302,headers:{Location:'http://127.0.0.1/'}});};
 const result=await checkTarget('https://example.com/',env,request,fetcher);assert.equal(result.state,'unreachable');assert.equal(result.reason,'dns_unavailable');assert.equal(calls.length,2);assert.ok(calls.every(url=>url.startsWith('https://cloudflare-dns.com/')));assert.equal(cancels,2);
});

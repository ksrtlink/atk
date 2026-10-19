import ipaddr from "ipaddr.js";
import {publicOrigin} from "./domain.mjs";
class CheckFailure extends Error{constructor(state,reason){super(reason);this.state=state;this.reason=reason;}}
const fail=(state,reason)=>{throw new CheckFailure(state,reason);};
export function publicIP(value){try{const address=ipaddr.process(value);return !address.zoneId&&address.range()==="unicast"&&address.toString()!=="168.63.129.16"&&(address.kind()==="ipv4"||address.match(ipaddr.parse("2000::"),3));}catch{return false;}}
export function healthURL(value,env,request){
 let url;try{url=new URL(value);}catch{fail("blocked","unsafe_address");}
 if(!["https:","http:"].includes(url.protocol)||url.username||url.password||url.href.length>4096||url.port&&!((url.protocol==="https:"&&url.port==="443")||(url.protocol==="http:"&&url.port==="80")))fail("blocked","unsafe_address");
 const host=url.hostname.replace(/^\[|\]$/g,"").toLowerCase().replace(/\.$/,"");
 const local=host==="localhost"||host.endsWith(".localhost")||["local","internal","home.arpa","invalid","test","onion"].some(s=>host===s||host.endsWith("."+s));
 if(local||host.includes("%")||new Set([new URL(request.url).hostname,new URL(publicOrigin(env,request)).hostname,"ksrtlink.github.io"].map(h=>h.toLowerCase().replace(/\.$/,""))).has(host))fail("blocked","unsafe_address");
 if(ipaddr.isValid(host)){if(!publicIP(host))fail("blocked","private_address");}
 else if(!host.includes(".")||host.length>253||host.split(".").some(p=>!p||p.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(p)))fail("blocked","unsafe_address");
 url.hash="";return url;
}
async function boundedJSON(response){
 if(!response.ok||!response.body){await response.body?.cancel();fail("unreachable","dns_unavailable");}
 const reader=response.body.getReader(),chunks=[];let count=0;
 try{while(true){const{done,value}=await reader.read();if(done)break;count+=value.length;if(count>8192)fail("unreachable","dns_response_limit");chunks.push(value);}}
 finally{try{await reader.cancel();}catch{}}
 const buffer=new Uint8Array(count);let at=0;for(const b of chunks){buffer.set(b,at);at+=b.length;}
 try{return JSON.parse(new TextDecoder().decode(buffer));}catch{fail("unreachable","dns_unavailable");}
}
async function validateDNS(host,fetcher,signal){
 if(ipaddr.isValid(host))return;
 const responses=await Promise.all(["A","AAAA"].map(async type=>{
  const endpoint=new URL("https://cloudflare-dns.com/dns-query");endpoint.searchParams.set("name",host);endpoint.searchParams.set("type",type);
  const response=await fetcher(endpoint.href,{headers:{Accept:"application/dns-json"},redirect:"manual",credentials:"omit",cache:"no-store",signal});return boundedJSON(response);
 }));
 let addresses=[];
 for(const data of responses){if(![0,3].includes(data.Status)||data.TC||!Array.isArray(data.Answer??[])||(data.Answer??[]).length>64)fail("unreachable","dns_unavailable");for(const record of data.Answer??[])if([1,28].includes(record.type)){if(typeof record.data!=="string"||!publicIP(record.data))fail("blocked","private_address");addresses.push(record.data);}}
 if(!addresses.length)fail("unreachable","dns_unavailable");
}
// Production always uses global fetch with global_fetch_strictly_public enabled.
// DNS inspection is a preflight, not a substitute for that connection-time boundary.
export async function checkTarget(value,env,request,fetcher=globalThis.fetch,{timeoutMs=12000}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(12000,Math.max(100,timeoutMs))),started=Date.now();let hops=0,code=null;
 try{
  let url=healthURL(value,env,request);const seen=new Set();
  for(;hops<3;hops++){
   if(seen.has(url.href))fail("unknown","redirect_loop");seen.add(url.href);
   await validateDNS(url.hostname.replace(/^\[|\]$/g,""),fetcher,controller.signal);
   const response=await fetcher(url.href,{method:"HEAD",redirect:"manual",credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer",headers:{"User-Agent":"TinyTrail-Link-Health/1.0",Accept:"*/*","Sec-Purpose":"prefetch"},signal:controller.signal});
   code=response.status;let headerBytes=0;for(const[key,val]of response.headers){headerBytes+=key.length+val.length;if(headerBytes>16384){await response.body?.cancel();fail("unknown","header_limit");}}
   const location=response.headers.get("Location");await response.body?.cancel();
   if([301,302,303,307,308].includes(code)){
    if(!location)fail("unknown","missing_redirect");if(hops===2)fail("unknown","redirect_limit");
    let next;try{next=new URL(location,url);}catch{fail("blocked","unsafe_address");}
    if(url.protocol==="https:"&&next.protocol==="http:")fail("blocked","https_downgrade");url=healthURL(next.href,env,request);continue;
   }
   const state=code>=200&&code<300?"healthy":[404,410].includes(code)?"broken":[401,403,407,429,451].includes(code)?"blocked":[405,501].includes(code)?"unknown":code>=500?"unreachable":"unknown";
   return{state,reason:state==="healthy"?"http_ok":state==="broken"?"http_missing":state==="blocked"?"http_restricted":code===405||code===501?"head_unsupported":"http_response",httpStatus:code,redirects:hops,elapsedMs:Date.now()-started};
  }
 }catch(error){return{state:error instanceof CheckFailure?error.state:"unreachable",reason:error instanceof CheckFailure?error.reason:controller.signal.aborted?"timeout":"network_error",httpStatus:code,redirects:hops,elapsedMs:Date.now()-started};}
 finally{clearTimeout(timer);}
}

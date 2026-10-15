import { verifyFirebaseToken } from './auth.mjs';
import { Problem, publicOrigin, linkInput, designInput, linkRecord, designRecord } from './domain.mjs';

const security = {
  'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
  'X-Frame-Options':'DENY', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{...security,'Content-Type':'application/json;charset=utf-8','Cache-Control':'private, no-store'}});}
function boundedLimit(value,fallback){const n=Number(value);return Number.isInteger(n)&&n>0&&n<=1000?n:fallback;}
function uuid(value){return typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
async function bodyJSON(request){
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new Problem(415,'Send JSON data.','validation');
  if(Number(request.headers.get('Content-Length')||0)>20000)throw new Problem(413,'The request is too large.','validation');
  const reader=request.body?.getReader();if(!reader)throw new Problem(400,'Missing request body.','validation');
  let length=0,chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>20000){await reader.cancel();throw new Problem(413,'The request is too large.','validation');}chunks.push(value);}
  try{const bytes=new Uint8Array(length);let i=0;for(const chunk of chunks){bytes.set(chunk,i);i+=chunk.length;}const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||Array.isArray(data)||typeof data!=='object')throw new Error();return data;}
  catch{throw new Problem(400,'Invalid JSON data.','validation');}
}
function checkOrigin(request){const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)throw new Problem(403,'Cross-origin requests are not allowed.','forbidden');}

// The injected authenticator is for tests only. Production always uses Firebase signature verification.
export function createApp(authenticate=verifyFirebaseToken){
  return {async fetch(request,env){
    try{
      const url=new URL(request.url);const path=url.pathname;
      if(path.startsWith('/api/')){
        checkOrigin(request);
        if(path==='/api/config'&&request.method==='GET')return json({
          authReady:!!(env.FIREBASE_PROJECT_ID&&env.FIREBASE_API_KEY),
          firebase:{projectId:env.FIREBASE_PROJECT_ID||'',apiKey:env.FIREBASE_API_KEY||''},
          publicOrigin:publicOrigin(env,request),allowedEmailDomains:(env.ALLOWED_EMAIL_DOMAINS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean)
        });
        if(!env.DB)throw new Problem(503,'Storage is not configured yet.','configuration');
        // The original eight records are shared read-only; they never expose profile data.
        if(path==='/api/legacy'&&request.method==='GET'){
          const result=await env.DB.prepare('SELECT * FROM links WHERE legacy=1 ORDER BY slug LIMIT 100').all();
          return json({links:result.results.map(linkRecord)});
        }
        const header=request.headers.get('Authorization')||'';
        if(!header.startsWith('Bearer '))throw new Problem(401,'Sign in to your profile.','unauthenticated');
        let user;
        try{user=await authenticate(header.slice(7),env);}catch{throw new Problem(401,'Your session expired. Please sign in again.','unauthenticated');}
        if(!user.verified)throw new Problem(403,'Verify your email address before opening your profile.','email_unverified');
        const domains=(env.ALLOWED_EMAIL_DOMAINS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
        if(domains.length&&!domains.includes(user.email.split('@').pop()))throw new Problem(403,'This email domain does not have access to the workspace.','email_domain');
        await env.DB.prepare('INSERT INTO users(uid,email,display_name) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET email=excluded.email,display_name=excluded.display_name').bind(user.uid,user.email,user.name).run();
        if(path==='/api/me'&&request.method==='GET')return json({user:{uid:user.uid,email:user.email,name:user.name}});
        if(path==='/api/links'&&request.method==='GET'){
          const result=await env.DB.prepare('SELECT * FROM links WHERE owner_uid=? ORDER BY created_at DESC LIMIT 1000').bind(user.uid).all();return json({links:result.results.map(linkRecord)});
        }
        if(path==='/api/links'&&request.method==='POST'){
          const data=linkInput(await bodyJSON(request),env,request);
          const requestId=request.headers.get('Idempotency-Key');
          if(!uuid(requestId))throw new Problem(400,'A valid request ID is required.','validation');
          const prior=await env.DB.prepare('SELECT * FROM links WHERE owner_uid=? AND request_id=?').bind(user.uid,requestId).first();
          if(prior){if(prior.slug!==data.slug||prior.destination!==data.destination)throw new Problem(409,'This request ID was already used for a different link.','conflict');return json({link:linkRecord(prior)},200);}
          const shortUrl=`${publicOrigin(env,request)}/r/${data.slug}`;
          let row;
          try{row=await env.DB.prepare('INSERT INTO links(slug,destination,title,owner_uid,short_url,request_id) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM links WHERE owner_uid=?) < ? RETURNING *').bind(data.slug,data.destination,data.title,user.uid,shortUrl,requestId,user.uid,boundedLimit(env.MAX_LINKS_PER_USER,200)).first();}
          catch(error){if(String(error).includes('UNIQUE'))throw new Problem(409,'That short name is already in use. Choose another.','conflict');throw error;}
          if(!row)throw new Problem(429,'Your profile has reached its link limit.','quota');
          return json({link:linkRecord(row)},201);
        }
        const match=path.match(/^\/api\/links\/([a-z0-9-]+)$/);
        if(match&&request.method==='PATCH'){
          const old=await env.DB.prepare('SELECT * FROM links WHERE slug=? AND owner_uid=? AND legacy=0').bind(match[1],user.uid).first();
          if(!old)throw new Problem(404,'This link is not in your profile.','not_found');
          const body=await bodyJSON(request);const data=linkInput({slug:old.slug,destination:body.destination},env,request);
          if(!Number.isInteger(body.version))throw new Problem(400,'The saved version is required.','validation');
          const row=await env.DB.prepare("UPDATE links SET destination=?,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug=? AND owner_uid=? AND version=? AND legacy=0 RETURNING *").bind(data.destination,old.slug,user.uid,body.version).first();
          if(!row)throw new Problem(409,'This link changed in another tab. Refresh before editing.','conflict');return json({link:linkRecord(row)});
        }
        if(path==='/api/designs'&&request.method==='GET'){
          const result=await env.DB.prepare('SELECT * FROM qr_designs WHERE owner_uid=? ORDER BY updated_at DESC LIMIT 1000').bind(user.uid).all();return json({designs:result.results.map(designRecord)});
        }
        if(path==='/api/designs'&&request.method==='POST'){
          const body=await bodyJSON(request);const data=designInput(body);
          if(!uuid(body.id))throw new Problem(400,'A valid design ID is required.','validation');
          const prior=await env.DB.prepare('SELECT * FROM qr_designs WHERE id=?').bind(body.id).first();
          if(prior){
            if(prior.owner_uid!==user.uid)throw new Problem(404,'Design not found.','not_found');
            if(!Number.isInteger(body.version)){
              if(prior.title===data.title&&prior.url===data.url&&prior.settings_json===JSON.stringify(data.settings))return json({design:designRecord(prior)});
              throw new Problem(409,'This design is already saved. Reopen it before changing it.','conflict');
            }
            const row=await env.DB.prepare("UPDATE qr_designs SET title=?,url=?,settings_json=?,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND owner_uid=? AND version=? RETURNING *").bind(data.title,data.url,JSON.stringify(data.settings),body.id,user.uid,body.version).first();
            if(!row)throw new Problem(409,'This design changed in another tab. Reopen it before saving.','conflict');return json({design:designRecord(row)});
          }
          const row=await env.DB.prepare('INSERT INTO qr_designs(id,owner_uid,title,url,settings_json) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM qr_designs WHERE owner_uid=?) < ? RETURNING *').bind(body.id,user.uid,data.title,data.url,JSON.stringify(data.settings),user.uid,boundedLimit(env.MAX_DESIGNS_PER_USER,200)).first();
          if(!row)throw new Problem(429,'Your profile has reached its QR design limit.','quota');return json({design:designRecord(row)},201);
        }
        throw new Problem(404,'API endpoint not found.','not_found');
      }
      if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{...security,'Allow':'GET, HEAD'}});
      if(path==='/')return Response.redirect(`${url.origin}/manage/`,302);
      const redirect=path.match(/^\/r\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
      if(redirect){
        if(!env.DB)return new Response('Service temporarily unavailable',{status:503,headers:security});
        const row=await env.DB.prepare('SELECT destination FROM links WHERE slug=?').bind(redirect[1]).first();
        if(!row)return new Response('This short link was not found.',{status:404,headers:security});
        return new Response(null,{status:302,headers:{...security,'Location':row.destination,'Cache-Control':'no-store'}});
      }
      if(env.ASSETS)return env.ASSETS.fetch(request);
      return new Response('Not found',{status:404,headers:security});
    }catch(error){
      if(error instanceof Problem)return json({error:error.message,code:error.code},error.status);
      // Do not echo database errors, tokens, or request bodies to clients or logs.
      return json({error:'The service could not complete this request. Please try again.',code:'service_error'},503);
    }
  }};
}
export default createApp();

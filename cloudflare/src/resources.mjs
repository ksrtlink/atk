import {Problem,publicOrigin,linkInput} from "./domain.mjs";
import {validateSlug,escapeHTML} from "../../manage/core.mjs";
import {eligible,flags,FILTER_VERSION,DAY,collectionSettings,operationalFailure} from "./analytics.mjs";
const bad=(status,message,code="validation")=>{throw new Problem(status,message,code);};
const uuid=v=>typeof v==="string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const db=env=>({s:(q,...args)=>env.DB.prepare(q).bind(...args),first:(q,...args)=>env.DB.prepare(q).bind(...args).first(),all:async(q,...args)=>(await env.DB.prepare(q).bind(...args).all()).results});
const plain=(v,max,required=false)=>{
 if(typeof v!=="string" || v.trim().length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v) || (required&&!v.trim())) bad(400,`Use ${required?"1–":"up to "}${max} characters.`);
 return v.trim();
};
export function resourceContent(value,env,request) {
 if(!value || !Array.isArray(value.items) || value.items.length>30) bad(400,"Add up to 30 resource links.");
 const seen=new Set();
 const items=value.items.map(item=>{
   if(!uuid(item.id) || seen.has(item.id)) bad(400,"Resource items need distinct identifiers.");
   seen.add(item.id);
   return {id:item.id,label:plain(item.label,100,true),description:plain(item.description??"",180),url:linkInput({slug:"resource-target",destination:item.url},env,request).destination};
 });
 return {title:plain(value.title,100,true),description:plain(value.description??"",500),items};
}
function record(row,env,request) {
 return {id:row.id,slug:row.slug,content:JSON.parse(row.draft_json),publishedContent:row.published_json?JSON.parse(row.published_json):null,state:row.state,version:row.version,publicUrl:`${publicOrigin(env,request)}/p/${row.slug}`,publishedAt:row.published_at,updatedAt:row.updated_at};
}
export async function resourceAPI({path,method,request,env,wid,user,role,personal,body}) {
 const {s,first,all}=db(env), max=personal?10:100;
 const publishOwner=()=>{if(role!=="owner")bad(403,"Only the workspace owner can publish or unpublish pages.","forbidden");};
 if(path==="/api/resources" && method==="GET") return {pages:(await all("SELECT * FROM resource_pages WHERE workspace_id=? ORDER BY updated_at DESC LIMIT 1000",wid)).map(row=>record(row,env,request)),canPublish:role==="owner",limit:max};
 if(path==="/api/resources" && method==="POST") {
   const b=await body();
   if(!uuid(b.id))bad(400,"A valid page identifier is required.");
   let slug;try{slug=validateSlug(b.slug);}catch{bad(400,"Use a lowercase page address with letters, numbers and hyphens.");}
   const content=JSON.stringify(resourceContent(b.content,env,request));
   const old=await first("SELECT * FROM resource_pages WHERE id=?",b.id);
   if(old) {
     if(old.workspace_id!==wid)bad(404,"Page not found.","not_found");
     if(old.slug!==slug || old.draft_json!==content)bad(409,"This creation request already exists. Open the saved page.","conflict");
     return {page:record(old,env,request)};
   }
   const mutation=crypto.randomUUID();
   let result;
   try {result=await env.DB.batch([
     s("INSERT INTO resource_pages(id,workspace_id,slug,draft_json,mutation_id,created_by,updated_by) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM resource_pages WHERE workspace_id=? AND state<>'archived')<? RETURNING *",b.id,wid,slug,content,mutation,user.uid,user.uid,wid,max),
     s("INSERT INTO resource_revisions(resource_id,version,content_json,action,actor_uid) SELECT id,version,draft_json,'created',? FROM resource_pages WHERE id=? AND mutation_id=?",user.uid,b.id,mutation),
   ]);}catch(e){if(String(e).includes("UNIQUE"))bad(409,"That page address is already in use.","conflict");throw e;}
   const row=result[0].results?.[0];if(!row)bad(429,"Your resource-page allowance is full. Archive an unused page first.","quota");
   return {page:record(row,env,request)};
 }
 const match=path.match(/^\/api\/resources\/([0-9a-f-]{36})(?:\/(publish|unpublish|revisions|restore|report|activate))?$/);
 if(!match)bad(404,"Endpoint not found.","not_found");
 const [,_id,action]=match;
 const old=await first("SELECT * FROM resource_pages WHERE id=? AND workspace_id=?",_id,wid);
 if(!old)bad(404,"Page not found.","not_found");
 if(method==="GET" && !action) return {page:record(old,env,request),revisions:(await all("SELECT version,content_json,action,created_at FROM resource_revisions WHERE resource_id=? ORDER BY version DESC LIMIT 50",_id)).map(r=>({version:r.version,content:JSON.parse(r.content_json),action:r.action,createdAt:r.created_at}))};
 if(method==="GET" && action==="report") {
   const days=Number(new URL(request.url).searchParams.get("days")||30);
   if(![7,30,90].includes(days))bad(400,"Choose 7, 30 or 90 days.");
   const end=Date.parse(new Date().toISOString().slice(0,10))+DAY,start=end-days*DAY,retained=Math.max(start,Date.now()-flags(env).retentionDays*DAY);
   const totals=await all("SELECT kind,COUNT(*) AS visits FROM resource_events WHERE workspace_id=? AND resource_id=? AND occurred_at>=? AND occurred_at<? GROUP BY kind",wid,_id,retained,end);
   const items=await all("SELECT item_id,COUNT(*) AS visits FROM resource_events WHERE workspace_id=? AND resource_id=? AND kind='resource_click' AND occurred_at>=? AND occurred_at<? GROUP BY item_id ORDER BY visits DESC LIMIT 100",wid,_id,retained,end);
   return {days,from:new Date(start).toISOString(),to:new Date(end).toISOString(),timezone:"UTC",pageViews:totals.find(t=>t.kind==="page_view")?.visits||0,resourceClicks:totals.find(t=>t.kind==="resource_click")?.visits||0,items,coverage:await collectionSettings(env,wid)};
 }
 if(!((method==="PATCH"&&!action)||(method==="DELETE"&&!action)||(method==="POST"&&["publish","unpublish","restore","activate"].includes(action))))bad(405,"Method not allowed.");
 const b=await body();
 if(!Number.isInteger(b.version))bad(400,"Saved version is required.");
 if(old.version!==b.version)bad(409,"This page changed. Reload it before saving.","conflict");
 let draft=old.draft_json,published=old.published_json,state=old.state,kind="saved";
 if(method==="PATCH") {
   if(state==="archived")bad(409,"Restore this archived page before editing.");
   draft=JSON.stringify(resourceContent(b.content,env,request));
 } else if(action==="publish") {
   publishOwner();
   if(state==="archived")bad(409,"Restore the page before publishing.");
   if(b.confirmPublic!==true)bad(400,"Confirm these links are approved for public sharing.");
   if(!JSON.parse(draft).items.length)bad(400,"Add at least one link before publishing.");
   published=draft;state="published";kind="published";
 } else if(action==="unpublish") {publishOwner();state="draft";kind="unpublished";}
 else if(method==="DELETE") {publishOwner();state="archived";kind="archived";}
 else if(action==="activate") {publishOwner();state="draft";kind="restored";}
 else if(action==="restore") {
   const rev=await first("SELECT content_json FROM resource_revisions WHERE resource_id=? AND version=?",_id,b.revision);
   if(!rev)bad(404,"Revision not found.","not_found");
   if(state==="archived")bad(409,"Restore this archived page first.");
   draft=rev.content_json;kind="revision_restored";
 }
 const mutation=crypto.randomUUID(),stamp=new Date().toISOString();
 const quota=old.state==="archived"&&state!=="archived";
 const result=await env.DB.batch([
   s(`UPDATE resource_pages SET draft_json=?,published_json=?,state=?,version=version+1,mutation_id=?,updated_by=?,updated_at=?,published_at=CASE WHEN ?='published' THEN ? ELSE published_at END,first_published_at=CASE WHEN ?='published' THEN COALESCE(first_published_at,?) ELSE first_published_at END WHERE id=? AND workspace_id=? AND version=? ${quota?"AND (SELECT COUNT(*) FROM resource_pages WHERE workspace_id=? AND state<>'archived')<?":""} RETURNING *`,draft,published,state,mutation,user.uid,stamp,kind,stamp,kind,stamp,_id,wid,b.version,...(quota?[wid,max]:[])),
   s("INSERT INTO resource_revisions(resource_id,version,content_json,action,actor_uid) SELECT id,version,draft_json,?,? FROM resource_pages WHERE id=? AND mutation_id=?",kind,user.uid,_id,mutation),
   s("DELETE FROM resource_revisions WHERE resource_id=? AND version NOT IN (SELECT version FROM resource_revisions WHERE resource_id=? ORDER BY version DESC LIMIT 50)",_id,_id),
 ]);
 const row=result[0].results?.[0];if(!row)bad(quota?429:409,quota?"Your page allowance is full.":"This page changed. Reload and retry.",quota?"quota":"conflict");
 return {page:record(row,env,request)};
}
function event(request,env,ctx,row,kind,itemId=null) {
 if(!flags(env).collection||!eligible(request)||!ctx?.waitUntil)return;
 const id=crypto.randomUUID(),at=Date.now(),{s,first}=db(env);
 const task=(async()=>{
  if(!(await first("SELECT enabled FROM analytics_settings WHERE workspace_id=?",row.workspace_id))?.enabled)return;
  await s("INSERT OR IGNORE INTO resource_events(id,workspace_id,resource_id,item_id,kind,occurred_at,filter_version) VALUES(?,?,?,?,?,?,?)",id,row.workspace_id,row.id,itemId,kind,at,FILTER_VERSION).run();
 })().catch(()=>operationalFailure("resource_event_insert"));
 try{ctx.waitUntil(task);}catch{operationalFailure("resource_event_schedule");}
}
const publicHeaders={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY","Permissions-Policy":"camera=(), microphone=(), geolocation=()"};
export async function publicResource(request,env,ctx) {
 const path=new URL(request.url).pathname,match=path.match(/^\/p\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/go\/([0-9a-f-]{36}))?\/?$/);
 if(!match)return new Response("Page not found.",{status:404,headers:publicHeaders});
 const row=await db(env).first("SELECT * FROM resource_pages WHERE slug=?",match[1]);
 if(!row||row.state!=="published"||!row.published_json)return new Response("This page is not published.",{status:row?.first_published_at?410:404,headers:publicHeaders});
 const content=JSON.parse(row.published_json);
 if(match[2]) {
   const item=content.items.find(item=>item.id===match[2]);
   if(!item)return new Response("Resource not found.",{status:404,headers:publicHeaders});
   const target=linkInput({slug:"resource-target",destination:item.url},env,request).destination;
   event(request,env,ctx,row,"resource_click",item.id);
   return new Response(null,{status:302,headers:{...publicHeaders,Location:target}});
 }
 event(request,env,ctx,row,"page_view");
 const e=escapeHTML;
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${e(content.title)} · TinyTrail</title><link rel="icon" href="/manage/tinytrail-icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/resource-page.css"></head><body><a class="skip" href="#resources">Skip to resources</a><div class="resource-public"><header><a href="/"><img src="/manage/tinytrail-logo.svg" alt="TinyTrail" width="142" height="43"></a></header><main id="resources"><h1>${e(content.title)}</h1>${content.description?`<p class="resource-intro">${e(content.description)}</p>`:""}<div class="resource-public-links">${content.items.map(item=>`<a class="resource-public-link" href="/p/${e(row.slug)}/go/${e(item.id)}"><span><strong>${e(item.label)}</strong>${item.description?`<span>${e(item.description)}</span>`:""}</span><span aria-hidden="true">↗</span></a>`).join("")}</div></main><footer>Published with <a href="/">TinyTrail</a></footer></div></body></html>`;
 return new Response(request.method==="HEAD"?null:html,{headers:{...publicHeaders,"Content-Type":"text/html;charset=utf-8","Content-Security-Policy":"default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
}
export async function pruneResources(env) {
 if(!env.DB)return;
 const cutoff=Date.now()-flags(env).retentionDays*DAY;
 for(let i=0;i<10;i++) {const result=await db(env).s("DELETE FROM resource_events WHERE id IN (SELECT id FROM resource_events WHERE occurred_at<? ORDER BY occurred_at LIMIT 1000)",cutoff).run();if((result.meta?.changes??result.changes??0)<1000)break;}
}

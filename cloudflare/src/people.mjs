import {Problem,publicOrigin,linkInput} from "./domain.mjs";
import {validateSlug,escapeHTML} from "../../manage/core.mjs";
import {flags,eligible,FILTER_VERSION,DAY,operationalFailure,collectionSettings} from "./analytics.mjs";
import {peoplePhoto} from "./people-photo.mjs";
import {vcard} from "./vcard.mjs";
const bad=(status,message)=>{throw new Problem(status,message);};
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const db=env=>({s:(q,...a)=>env.DB.prepare(q).bind(...a),first:(q,...a)=>env.DB.prepare(q).bind(...a).first(),all:async(q,...a)=>(await env.DB.prepare(q).bind(...a).all()).results});
export const profileFields={name:100,givenName:80,familyName:80,pronunciation:100,title:120,department:120,organization:120,email:254,phone:50,office:300,intro:800,linkedin:2048,booking:2048};
export function profileContent(value,env,request){
 if(!value||typeof value!=="object"||Array.isArray(value))bad(400,"Provide profile fields.");
 const content={};
 for(const [key,max]of Object.entries(profileFields)){
  const v=value[key]??"";if(typeof v!=="string"||v.trim().length>max||/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(v)||key!=="intro"&&/[\r\n]/.test(v))bad(400,`Check ${key}; maximum ${max} characters.`);content[key]=v.trim();
 }
 if(!content.name)bad(400,"A display name is required.");
 if(content.email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(content.email))bad(400,"Use a valid public contact email.");
 if(content.phone&&!/^\+?[\d ()\-.]{5,50}$/.test(content.phone))bad(400,"Use an international phone number.");
 for(const key of ["linkedin","booking"])if(content[key])content[key]=linkInput({slug:"profile-target",destination:content[key]},env,request).destination;
 if(content.linkedin){const u=new URL(content.linkedin);if(u.protocol!=="https:"||!/(^|\.)linkedin\.com$/.test(u.hostname))bad(400,"Use an HTTPS LinkedIn address.");}
 if(!Array.isArray(value.resources??[])||(value.resources??[]).length>8)bad(400,"Add up to eight approved resources.");
 const ids=new Set();content.resources=(value.resources??[]).map(x=>{if(!uuid(x.id)||ids.has(x.id)||typeof x.label!=="string"||!x.label.trim()||x.label.length>100||/[\r\n\u0000-\u001f]/.test(x.label))bad(400,"Check resource labels and identifiers.");ids.add(x.id);return{id:x.id,label:x.label.trim(),url:linkInput({slug:"profile-target",destination:x.url},env,request).destination};});
 if(value.photoId!=null&&!uuid(value.photoId))bad(400,"Use a saved profile photo.");content.photoId=value.photoId??null;
 return content;
}
function record(row,env,request,owner){return{id:row.id,slug:row.slug,content:{...JSON.parse(row.draft_json),photoId:JSON.parse(row.draft_json).photoId??null},state:row.state,version:row.version,assignedUid:owner?row.assigned_uid:undefined,editable:JSON.parse(row.editable_json),publicUrl:`${publicOrigin(env,request)}/people/${row.slug}`,qrUrl:`${publicOrigin(env,request)}/people/qr/${row.qr_id}`,publishedAt:row.published_at,updatedAt:row.updated_at};}
export async function peopleAPI({path,method,request,env,wid,user,role,personal,body}){
 const {s,first,all}=db(env),owner=role==="owner",scope=owner?"":" AND assigned_uid=?",args=owner?[]:[user.uid],max=personal?1:250;
 const requireOwner=()=>{if(!owner)bad(403,"Only the workspace owner can manage publication and assignments.");};
 if(path==="/api/people"&&method==="GET")return{profiles:(await all(`SELECT * FROM people WHERE workspace_id=?${scope} ORDER BY updated_at DESC LIMIT 300`,wid,...args)).map(r=>record(r,env,request,owner)),canManage:owner,personal,limit:max,members:owner?(personal?[{uid:user.uid,email:user.email}]:await all("SELECT u.uid,u.email FROM memberships m JOIN users u ON u.uid=m.uid WHERE m.workspace_id=? ORDER BY u.email LIMIT 500",wid)):[]};
 if(path==="/api/people"&&method==="POST"){
  requireOwner();const b=await body();if(!uuid(b.id))bad(400,"A profile identifier is required.");let slug;try{slug=validateSlug(b.slug);}catch{bad(400,"Use a lowercase address with letters, numbers and hyphens.");}if(slug==="qr")bad(400,"Choose another address.");
  const defaults=b.useTemplate===true&&!personal?await first("SELECT content_json,editable_json FROM people_templates WHERE workspace_id=?",wid):null;
  if(b.content?.photoId)bad(400,"Save the card before adding a photo.");
  const allowed=defaults?.editable_json||"[]",draft=JSON.stringify(profileContent({...JSON.parse(defaults?.content_json||"{}"),...b.content},env,request)),old=await first("SELECT * FROM people WHERE id=?",b.id);
  if(old){if(old.workspace_id!==wid)bad(404,"Profile not found.");if(old.slug!==slug||old.draft_json!==draft)bad(409,"Creation already exists. Open the saved profile.");return{profile:record(old,env,request,owner)};}
  const mutation=crypto.randomUUID();let result;
  try{result=await env.DB.batch([s("INSERT INTO people(id,workspace_id,slug,qr_id,draft_json,mutation_id,created_by,updated_by,editable_json) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM people WHERE workspace_id=?)<? RETURNING *",b.id,wid,slug,crypto.randomUUID(),draft,mutation,user.uid,user.uid,allowed,wid,max),s("INSERT INTO people_revisions(profile_id,version,content_json,action,actor_uid) SELECT id,version,draft_json,'created',? FROM people WHERE id=? AND mutation_id=?",user.uid,b.id,mutation)]);}catch(e){if(String(e).includes("UNIQUE"))bad(409,"That profile address is already reserved.");throw e;}
  if(!result[0].results?.[0])bad(429,"Profile allowance reached.");return{profile:record(result[0].results[0],env,request,owner)};
 }
 const match=path.match(/^\/api\/people\/([0-9a-f-]{36})(?:\/(publish|unpublish|activate|assignment|report|distribution|photo))?$/);if(!match)bad(404,"Endpoint not found.");
 const row=await first(`SELECT * FROM people WHERE id=? AND workspace_id=?${scope}`,match[1],wid,...args);if(!row)bad(404,"Profile not found.");const action=match[2];
 if(action==="photo"){const result=await peoplePhoto({row,owner,user,env,method,body});return method==="GET"?result:{profile:record(result,env,request,owner)};}
 if(method==="GET"&&!action)return{profile:record(row,env,request,owner)};
 if(method==="GET"&&action==="distribution"){if(row.state!=="published"||!row.published_json)bad(409,"Publish this card before creating sharing assets.");return{content:JSON.parse(row.published_json),publicUrl:`${publicOrigin(env,request)}/people/${row.slug}`,qrUrl:`${publicOrigin(env,request)}/people/qr/${row.qr_id}`,slug:row.slug,publishedAt:row.published_at};}
 if(method==="GET"&&action==="report"){
  const days=Number(new URL(request.url).searchParams.get("days")||30);if(![7,30,90].includes(days))bad(400,"Choose 7, 30 or 90 days.");const end=Date.parse(new Date().toISOString().slice(0,10)),start=end-days*DAY;
  return{timezone:"UTC",from:new Date(start).toISOString(),to:new Date(end).toISOString(),counts:await all("SELECT kind,COUNT(*) AS count FROM people_events WHERE workspace_id=? AND profile_id=? AND occurred_at>=? AND occurred_at<? GROUP BY kind",wid,row.id,start,end),coverage:await collectionSettings(env,wid)};
 }
 if(!((method==="PATCH"&&!action)||(method==="DELETE"&&!action)||(method==="POST"&&["publish","unpublish","activate","assignment"].includes(action))))bad(405,"Method not allowed.");
 const b=await body();if(!Number.isInteger(b.version))bad(400,"Saved version is required.");if(b.version!==row.version)bad(409,"Profile changed. Reload before saving.");
 let draft=row.draft_json,published=row.published_json,state=row.state,assigned=row.assigned_uid,editable=row.editable_json,kind="saved";
 if(method==="PATCH"){
  if(state==="disabled")bad(409,"Activate this profile before editing.");const content=profileContent(b.content,env,request);
  if(!owner){const old=JSON.parse(row.draft_json),allowed=JSON.parse(editable);for(const key of [...Object.keys(profileFields),"resources","photoId"])if(JSON.stringify(content[key]??null)!==JSON.stringify(old[key]??null)&&!allowed.includes(key))bad(403,"This field is managed by your workspace owner.");}
  if(content.photoId&&!await first("SELECT 1 FROM people_photos WHERE id=? AND profile_id=?",content.photoId,row.id))bad(400,"That photo does not belong to this card.");
  draft=JSON.stringify(content);
 }else{
  requireOwner();
  if(action==="publish"){if(state==="disabled")bad(409,"Activate the profile first.");if(b.confirmPublic!==true)bad(400,"Confirm this contact information is approved for public sharing.");published=draft;state="published";kind="published";}
  if(action==="unpublish"){state="draft";kind="unpublished";}
  if(method==="DELETE"){state="disabled";kind="disabled";}
  if(action==="activate"){state="draft";kind="activated";}
  if(action==="assignment"){
   assigned=b.assignedUid||null;if(assigned&&!(personal?assigned===user.uid:await first("SELECT 1 FROM memberships WHERE workspace_id=? AND uid=?",wid,assigned)))bad(400,"Select an approved workspace member.");
   if(!Array.isArray(b.editable)||b.editable.length>20||b.editable.some(k=>![...Object.keys(profileFields),"resources","photoId"].includes(k))||new Set(b.editable).size!==b.editable.length)bad(400,"Choose valid editable fields.");editable=JSON.stringify(b.editable);kind="assigned";
  }
 }
 const mutation=crypto.randomUUID(),stamp=new Date().toISOString();
 const result=await env.DB.batch([s("UPDATE people SET draft_json=?,published_json=?,state=?,assigned_uid=?,editable_json=?,version=version+1,mutation_id=?,updated_by=?,updated_at=?,published_at=CASE WHEN ?='published' THEN ? ELSE published_at END,first_published_at=CASE WHEN ?='published' THEN COALESCE(first_published_at,?) ELSE first_published_at END WHERE id=? AND workspace_id=? AND version=? RETURNING *",draft,published,state,assigned,editable,mutation,user.uid,stamp,kind,stamp,kind,stamp,row.id,wid,row.version),s("INSERT INTO people_revisions(profile_id,version,content_json,action,actor_uid) SELECT id,version,draft_json,?,? FROM people WHERE id=? AND mutation_id=?",kind,user.uid,row.id,mutation),s("DELETE FROM people_revisions WHERE profile_id=? AND version NOT IN (SELECT version FROM people_revisions WHERE profile_id=? ORDER BY version DESC LIMIT 50)",row.id,row.id),s("DELETE FROM people_photos WHERE profile_id=? AND id NOT IN (SELECT COALESCE(json_extract(draft_json,'$.photoId'),'') FROM people WHERE id=? UNION SELECT COALESCE(json_extract(published_json,'$.photoId'),'') FROM people WHERE id=?)",row.id,row.id,row.id)]);
 if(!result[0].results?.[0])bad(409,"Profile changed. Reload before saving.");return{profile:record(result[0].results[0],env,request,owner)};
}
function event(request,env,ctx,row,kind,action=null){
 if(!flags(env).collection||!eligible(request)||!ctx?.waitUntil)return;
 const task=(async()=>{if(!(await db(env).first("SELECT enabled FROM analytics_settings WHERE workspace_id=?",row.workspace_id))?.enabled)return;await db(env).s("INSERT INTO people_events VALUES(?,?,?,?,?,?,?)",crypto.randomUUID(),row.workspace_id,row.id,kind,action,Date.now(),FILTER_VERSION).run();})().catch(()=>operationalFailure("people_event_insert"));try{ctx.waitUntil(task);}catch{operationalFailure("people_event_schedule");}
}
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY"};
export async function publicPerson(request,env,ctx){
 const path=new URL(request.url).pathname,qr=path.match(/^\/people\/qr\/([0-9a-f-]{36})\/?$/),match=path.match(/^\/people\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/(contact\.vcf|photo|go\/([a-z0-9-]+)))?\/?$/);
 if(!qr&&!match)return new Response("Profile not found.",{status:404,headers});
 const row=await db(env).first(`SELECT * FROM people WHERE ${qr?"qr_id":"slug"}=?`,qr?qr[1]:match[1]);
 if(!row||row.state!=="published"||!row.published_json)return new Response("This profile is not published.",{status:row?.first_published_at?410:404,headers});
 const content=JSON.parse(row.published_json),url=`${publicOrigin(env,request)}/people/${row.slug}`;
 if(qr){event(request,env,ctx,row,"profile_qr_visit");return new Response(null,{status:302,headers:{...headers,Location:url}});}
 if(match[2]==="photo"){const image=content.photoId?await db(env).first("SELECT data,width,height FROM people_photos WHERE id=? AND profile_id=?",content.photoId,row.id):null;if(!image)return new Response("Photo not found.",{status:404,headers});return new Response(request.method==="HEAD"?null:new Uint8Array(image.data),{headers:{...headers,"Content-Type":"image/png","Content-Security-Policy":"default-src 'none'; sandbox"}});}
 if(match[2]==="contact.vcf"){event(request,env,ctx,row,"contact_download");return new Response(request.method==="HEAD"?null:vcard(content,url,row.published_at),{headers:{...headers,"Content-Type":"text/vcard;charset=utf-8","Content-Disposition":`attachment; filename="${row.slug}.vcf"`}});}
 if(match[3]){
  const key=match[3];let target;
  if(key==="email"&&content.email)target="mailto:"+encodeURIComponent(content.email);
  else if(key==="phone"&&content.phone)target="tel:"+content.phone.replace(/[^+\d]/g,"");
  else if(["linkedin","booking"].includes(key))target=content[key];
  else target=content.resources.find(x=>x.id===key)?.url;
  if(!target)return new Response("Action not found.",{status:404,headers});
  if(!["email","phone"].includes(key))target=linkInput({slug:"profile-action",destination:target},env,request).destination;
  event(request,env,ctx,row,"profile_action",key);return new Response(null,{status:302,headers:{...headers,Location:target}});
 }
 const e=escapeHTML,actions=[["email","Email"],["phone","Call"],["linkedin","LinkedIn"],["booking","Book a meeting"]].filter(([key])=>content[key]).concat(content.resources.map(x=>[x.id,x.label]));
 event(request,env,ctx,row,"profile_view");
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${e(content.name)} · TinyTrail</title><link rel="stylesheet" href="/resource-page.css"></head><body><a class="skip" href="#profile">Skip to profile</a><div class="resource-public"><header><a href="/"><img src="/manage/tinytrail-logo.svg" alt="TinyTrail" width="142" height="43"></a></header><main id="profile">${content.photoId?`<img class="profile-photo" src="/people/${e(row.slug)}/photo" width="96" height="96" alt="Portrait of ${e(content.name)}">`:""}<p class="resource-intro">${e(content.organization)}</p><h1>${e(content.name)}</h1>${content.pronunciation?`<p>${e(content.pronunciation)}</p>`:""}<p>${e([content.title,content.department].filter(Boolean).join(" · "))}</p>${content.office?`<p>${e(content.office)}</p>`:""}${content.intro?`<p class="resource-intro">${e(content.intro)}</p>`:""}<div class="resource-public-links"><a class="resource-public-link profile-contact" href="/people/${e(row.slug)}/contact.vcf">Save contact<span aria-hidden="true">↓</span></a>${actions.map(([key,label])=>`<a class="resource-public-link" href="/people/${e(row.slug)}/go/${e(key)}"><strong>${e(label)}</strong><span aria-hidden="true">↗</span></a>`).join("")}</div></main><footer>Published with <a href="/">TinyTrail</a></footer></div></body></html>`;
 return new Response(request.method==="HEAD"?null:html,{headers:{...headers,"Content-Type":"text/html;charset=utf-8","Content-Security-Policy":"default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
}
export async function prunePeople(env){if(!env.DB)return;const cutoff=Date.now()-flags(env).retentionDays*DAY;for(let i=0;i<10;i++){const r=await db(env).s("DELETE FROM people_events WHERE id IN (SELECT id FROM people_events WHERE occurred_at<? ORDER BY occurred_at LIMIT 1000)",cutoff).run();if((r.meta?.changes??0)<1000)break;}}

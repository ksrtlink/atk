import {Problem,publicOrigin} from "./domain.mjs";
import {checkTarget} from "./health-net.mjs";
import {operationalFailure} from "./analytics.mjs";
const fail=(status,message)=>{throw new Problem(status,message);};
const db=env=>({s:(q,...a)=>env.DB.prepare(q).bind(...a),first:(q,...a)=>env.DB.prepare(q).bind(...a).first(),all:async(q,...a)=>(await env.DB.prepare(q).bind(...a).all()).results});
const enabled=env=>env.LINK_HEALTH_ENABLED==="true";
const DAY=86400000,GLOBAL_LIMIT=24;
const sourceSQL="SELECT l.*,COALESCE(r.version,0) AS routing_version,r.config_json AS routing_json,h.version AS monitor_version,h.enabled AS monitoring,h.link_version AS synced_link_version,h.routing_version AS synced_routing_version FROM links l LEFT JOIN link_routing r ON r.slug=l.slug AND r.workspace_id=l.workspace_id LEFT JOIN link_health h ON h.slug=l.slug AND h.workspace_id=l.workspace_id";
export async function healthSummary(env,wid){
 if(!enabled(env))fail(503,"Link monitoring is not enabled on this deployment.");
 return{monitors:await db(env).all("SELECT h.slug,h.enabled,(h.link_version<>l.version OR h.routing_version<>COALESCE(r.version,0)) AS stale,COUNT(t.target_id) AS targets,SUM(t.state='pending') AS pending,SUM(t.state='healthy') AS healthy,SUM(t.state='broken') AS broken,SUM(t.state='blocked') AS blocked,SUM(t.state='unreachable') AS unreachable,SUM(t.state='unknown') AS unknown,MAX(t.checked_at) AS lastCheckedAt FROM link_health h JOIN links l ON l.slug=h.slug AND l.workspace_id=h.workspace_id LEFT JOIN link_routing r ON r.slug=l.slug AND r.workspace_id=l.workspace_id LEFT JOIN link_health_targets t ON t.slug=h.slug WHERE h.workspace_id=? AND l.deleted_at IS NULL GROUP BY h.slug LIMIT 100",wid)};
}
export async function targetSet(row){
 const destinations=[{url:row.destination,label:"Default destination"}];let routing;
 try{routing=row.routing_json?JSON.parse(row.routing_json):null;}catch{fail(409,"Saved routing rules could not be read. Check the Rules editor.");}
 if(routing?.enabled){if(!Array.isArray(routing.schedules)||!Array.isArray(routing.audiences)||routing.schedules.length>20||routing.audiences.length>20)fail(409,"Check the saved destination rules.");for(const [kind,rules]of[["Schedule",routing.schedules],["Audience",routing.audiences]])rules.forEach((r,i)=>destinations.push({url:r.destination,label:`${kind} ${i+1}`}));}
 const unique=new Map();for(const {url,label}of destinations){let destination;try{const u=new URL(url);u.hash="";destination=u.href;}catch{fail(409,"Check the saved destination address.");}const previous=unique.get(destination);if(previous)previous.labels.push(label);else unique.set(destination,{destination,labels:[label]});}
 return Promise.all([...unique.values()].map(async target=>({...target,id:[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(target.destination)))].map(n=>n.toString(16).padStart(2,"0")).join("")})));
}
async function sync(env,row){
 const targets=await targetSet(row),token=crypto.randomUUID(),{s}=db(env),now=Date.now();
 await env.DB.batch([
  s("UPDATE link_health SET link_version=?,routing_version=?,sync_token=? WHERE slug=? AND enabled=1 AND version=? AND EXISTS(SELECT 1 FROM links l LEFT JOIN link_routing r ON r.slug=l.slug AND r.workspace_id=l.workspace_id WHERE l.slug=? AND l.version=? AND COALESCE(r.version,0)=? AND l.deleted_at IS NULL)",row.version,row.routing_version,token,row.slug,row.monitor_version,row.slug,row.version,row.routing_version),
  s("DELETE FROM link_health_targets WHERE slug=? AND target_id NOT IN(SELECT json_extract(value,'$.id') FROM json_each(?)) AND EXISTS(SELECT 1 FROM link_health WHERE slug=? AND sync_token=?)",row.slug,JSON.stringify(targets),row.slug,token),
  s("INSERT INTO link_health_targets(slug,target_id,destination,labels_json,due_at) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.destination'),json_extract(value,'$.labels'),? FROM json_each(?) WHERE EXISTS(SELECT 1 FROM link_health WHERE slug=? AND sync_token=?) ON CONFLICT(slug,target_id) DO UPDATE SET labels_json=excluded.labels_json",row.slug,now,JSON.stringify(targets),row.slug,token),
 ]);
}
export async function runHealth(env,{slug=null,limit=4,check=checkTarget}={}){
 if(!enabled(env))return{checked:0};const {s,all}=db(env),now=Date.now(),lease=crypto.randomUUID();
 const result=await s(`UPDATE link_health_targets SET lease_token=?,lease_until=? WHERE (slug,target_id) IN(SELECT t.slug,t.target_id FROM link_health_targets t JOIN link_health h ON h.slug=t.slug JOIN links l ON l.slug=h.slug AND l.workspace_id=h.workspace_id LEFT JOIN link_routing r ON r.slug=l.slug AND r.workspace_id=l.workspace_id WHERE h.enabled=1 AND l.deleted_at IS NULL AND l.legacy=0 AND h.link_version=l.version AND h.routing_version=COALESCE(r.version,0) AND t.due_at<=? AND t.lease_until<=? ${slug?"AND t.slug=?":""} ORDER BY t.due_at,t.slug,t.target_id LIMIT ?) RETURNING *`,lease,now+60000,now,now,...(slug?[slug]:[]),Math.min(4,Math.max(1,limit))).all();
 const request=new Request(publicOrigin(env,new Request("https://tinytrail.link"))+"/api/link-health");
 await Promise.all(result.results.map(async target=>{
  let outcome;try{outcome=await check(target.destination,env,request);}catch{outcome={state:"unreachable",reason:"check_failed",httpStatus:null,redirects:0,elapsedMs:0};}
  if(!["healthy","broken","blocked","unreachable","unknown"].includes(outcome.state))outcome={state:"unknown",reason:"check_failed",httpStatus:null,redirects:0,elapsedMs:0};
  await s("UPDATE link_health_targets SET state=?,reason=?,http_status=?,checked_at=?,elapsed_ms=?,redirects=?,due_at=?,lease_until=0,lease_token=NULL WHERE slug=? AND target_id=? AND lease_token=? AND EXISTS(SELECT 1 FROM link_health h JOIN links l ON l.slug=h.slug AND l.workspace_id=h.workspace_id LEFT JOIN link_routing r ON r.slug=l.slug AND r.workspace_id=l.workspace_id WHERE h.slug=? AND h.enabled=1 AND l.deleted_at IS NULL AND h.link_version=l.version AND h.routing_version=COALESCE(r.version,0))",outcome.state,outcome.reason,outcome.httpStatus??null,Date.now(),Math.min(30000,Math.max(0,outcome.elapsedMs||0)),outcome.redirects||0,Date.now()+DAY,target.slug,target.target_id,lease,target.slug).run();
 }));return{checked:result.results.length};
}
export async function scheduledHealth(env,check=checkTarget){
 if(!enabled(env)||!env.DB)return;const {s,first}=db(env);
 await env.DB.batch([s("DELETE FROM link_health_targets WHERE slug IN(SELECT h.slug FROM link_health h JOIN links l ON l.slug=h.slug WHERE h.workspace_id<>l.workspace_id)"),s("DELETE FROM link_health WHERE slug IN(SELECT h.slug FROM link_health h JOIN links l ON l.slug=h.slug WHERE h.workspace_id<>l.workspace_id)"),s("UPDATE link_health SET enabled=0,version=version+1 WHERE enabled=1 AND slug IN(SELECT slug FROM links WHERE deleted_at IS NOT NULL)"),s("DELETE FROM link_health_targets WHERE slug IN(SELECT slug FROM link_health WHERE enabled=0)")]);
 const row=await first(sourceSQL+" WHERE h.enabled=1 AND l.deleted_at IS NULL AND (h.link_version<>l.version OR h.routing_version<>COALESCE(r.version,0)) ORDER BY h.updated_at LIMIT 1");
 if(row)try{await sync(env,row);}catch{operationalFailure("health_target_sync");}
 await runHealth(env,{check});
}
export async function healthAPI({slug,action,method,env,wid,user,role,personal,body,check=checkTarget}){
 if(!enabled(env))fail(503,"Link monitoring is not enabled on this deployment.");const {s,first,all}=db(env),max=personal?3:12;
 let row=await first(sourceSQL+" WHERE l.slug=? AND l.workspace_id=?",slug,wid);if(!row||row.legacy)fail(404,"Link not found.");
 async function report(){
  const monitor=await first("SELECT * FROM link_health WHERE slug=? AND workspace_id=?",slug,wid),active=!row.deleted_at;
  return{enabled:!!monitor?.enabled,active,version:monitor?.version||0,canManage:role==="owner",limit:max,globalLimit:GLOBAL_LIMIT,stale:!!monitor?.enabled&&(monitor.link_version!==row.version||monitor.routing_version!==row.routing_version),targets:(await all("SELECT target_id,destination,labels_json,state,reason,http_status,checked_at,due_at FROM link_health_targets WHERE slug=? AND EXISTS(SELECT 1 FROM link_health h WHERE h.slug=link_health_targets.slug AND h.workspace_id=?) ORDER BY target_id",slug,wid)).map(t=>({id:t.target_id,url:t.destination,labels:JSON.parse(t.labels_json),state:t.state,reason:t.reason,httpStatus:t.http_status,checkedAt:t.checked_at,nextCheckAt:t.due_at}))};
 }
 if(method==="GET"&&!action)return report();if(role!=="owner")fail(403,"Only the workspace owner can manage monitoring.");
 if(method==="PUT"&&!action){
  const b=await body();if(typeof b.enabled!=="boolean"||!Number.isInteger(b.version)||b.version<0)fail(400,"Choose monitoring status and the saved version.");if(row.deleted_at&&b.enabled)fail(409,"Restore the link before enabling monitoring.");
  await env.DB.batch([s("DELETE FROM link_health_targets WHERE slug=? AND EXISTS(SELECT 1 FROM link_health WHERE slug=? AND workspace_id<>?)",slug,slug,wid),s("DELETE FROM link_health WHERE slug=? AND workspace_id<>?",slug,wid)]);
  const old=await first("SELECT * FROM link_health WHERE slug=? AND workspace_id=?",slug,wid);if((old?.version||0)!==b.version)fail(409,"Monitoring changed. Reload before saving.");
  const saved=old?await s("UPDATE link_health SET enabled=?,version=version+1,updated_by=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug=? AND workspace_id=? AND version=? AND (?=0 OR ((SELECT COUNT(*) FROM link_health WHERE enabled=1 AND slug<>?)<? AND (SELECT COUNT(*) FROM link_health WHERE enabled=1 AND workspace_id=? AND slug<>?)<?)) RETURNING *",b.enabled?1:0,user.uid,slug,wid,b.version,b.enabled?1:0,slug,GLOBAL_LIMIT,wid,slug,max).all():await s("INSERT INTO link_health(slug,workspace_id,enabled,updated_by) SELECT ?,?,?,? WHERE (?=0 OR ((SELECT COUNT(*) FROM link_health WHERE enabled=1)<? AND (SELECT COUNT(*) FROM link_health WHERE enabled=1 AND workspace_id=?)<?)) ON CONFLICT(slug) DO NOTHING RETURNING *",slug,wid,b.enabled?1:0,user.uid,b.enabled?1:0,GLOBAL_LIMIT,wid,max).all();
  if(!saved.results?.length)fail(409,"Monitoring changed or the pilot monitoring allowance is full.");
  if(b.enabled){row=await first(sourceSQL+" WHERE l.slug=? AND l.workspace_id=?",slug,wid);await sync(env,row);}
  else await s("DELETE FROM link_health_targets WHERE slug=?",slug).run();return report();
 }
 if(method==="POST"&&action==="check"){
  if(row.deleted_at)fail(409,"This link is in Trash.");const monitor=await first("SELECT * FROM link_health WHERE slug=? AND workspace_id=?",slug,wid);if(!monitor?.enabled)fail(409,"Enable monitoring first.");
  if(row.synced_link_version!==row.version||row.synced_routing_version!==row.routing_version)await sync(env,row);
  const now=Date.now(),pending=await first("SELECT COUNT(*) AS n FROM link_health_targets WHERE slug=? AND due_at<=?",slug,now);
  if(!pending.n){const changed=await s("UPDATE link_health SET last_requested=? WHERE slug=? AND last_requested<? RETURNING slug",now,slug,now-300000).all();if(!changed.results?.length)fail(429,"Wait five minutes before repeating completed checks.");await s("UPDATE link_health_targets SET due_at=? WHERE slug=?",now,slug).run();}
  await runHealth(env,{slug,limit:2,check});return report();
 }
 fail(405,"Method not allowed.");
}

import {Problem,linkInput} from "./domain.mjs";
import {timeZone,resolveDestination} from "../shared/routing.mjs";
const bad=(status,msg,code="validation")=>{throw new Problem(status,msg,code);};
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const emptyRouting=()=>({enabled:false,schedules:[],audiences:[]});
export function routingInput(b,env,request) {
 if(typeof b?.enabled!=="boolean"||!Array.isArray(b.schedules)||!Array.isArray(b.audiences)||b.schedules.length>20||b.audiences.length>20)bad(400,"Use up to 20 schedules and 20 audience rules.");
 const seen=new Set(),id=rule=>{if(!uuid(rule.id)||seen.has(rule.id))bad(400,"Rules need distinct identifiers.");seen.add(rule.id);return rule.id;};
 const destination=rule=>linkInput({slug:"routing-target",destination:rule.destination},env,request).destination;
 const instant=value=>{
  const m=typeof value==="string"&&value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/i);
  if(!m)bad(400,"Schedule times require an explicit UTC or numeric offset.");
  const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
  if(y<2000||y>2100||month<1||month>12||day<1||day>new Date(Date.UTC(y,month,0)).getUTCDate()||Number(m[4])>23||Number(m[5])>59||Number(m[6]||0)>59||!Number.isFinite(Date.parse(value)))bad(400,"Choose valid schedule dates between 2000 and 2100.");
  return new Date(value).toISOString();
 };
 const schedules=b.schedules.map(rule=>{
  let zone;try{zone=timeZone(rule.timezone);}catch(e){bad(400,e.message);}
  const start=instant(rule.start),end=instant(rule.end);if(start>=end)bad(400,"Each schedule must end after it starts.");
  return {id:id(rule),start,end,timezone:zone,destination:destination(rule)};
 });
 const ordered=[...schedules].sort((a,b)=>a.start.localeCompare(b.start));
 for(let i=1;i<ordered.length;i++)if(ordered[i].start<ordered[i-1].end)bad(400,"Schedules cannot overlap. Adjacent start/end boundaries are allowed.");
 const audiences=b.audiences.map(rule=>{
  const country=typeof rule.country==="string"?rule.country.trim().toUpperCase():"";
  let language=typeof rule.language==="string"?rule.language.trim().toLowerCase():"";
  if(country&&(!/^[A-Z]{2}$/.test(country)||["XX","ZZ"].includes(country)))bad(400,"Use a two-letter country code, such as AE or US.");
  if(language){try{language=Intl.getCanonicalLocales(language)[0].toLowerCase();}catch{bad(400,"Use a valid language tag, such as en or en-GB.");}if(language.length>35)bad(400,"The language tag is too long.");}
  if(!country&&!language)bad(400,"Each audience rule needs a country, language or both.");
  return {id:id(rule),country,language,destination:destination(rule)};
 });
 return {enabled:b.enabled,schedules,audiences};
}
export function resolvedLink(row,request,env) {
 if(!row.routing_json)return row.destination;
 try{
  const result=resolveDestination(row.destination,JSON.parse(row.routing_json),{country:request.cf?.country||"",language:request.headers.get("Accept-Language")||""});
  return result.matched==="fallback"?row.destination:linkInput({slug:"routing-target",destination:result.destination},env,request).destination;
 } catch {console.error(JSON.stringify({component:"tinytrail-routing",operation:"resolve_config",status:"failed"}));return row.destination;}
}
export async function routingAPI({slug,method,action,body,env,wid,user,request}) {
 const s=(q,...args)=>env.DB.prepare(q).bind(...args),first=(q,...args)=>s(q,...args).first();
 const link=await first("SELECT * FROM links WHERE slug=? AND workspace_id=? AND legacy=0 AND deleted_at IS NULL",slug,wid);
 if(!link)bad(404,"Link not found.","not_found");
 const old=await first("SELECT * FROM link_routing WHERE slug=? AND workspace_id=?",slug,wid),config=old?JSON.parse(old.config_json):emptyRouting();
 if(method==="GET"&&!action)return {config,version:old?.version||0,linkVersion:link.version,fallback:link.destination};
 if(!((method==="POST"&&action==="preview")||(method==="PUT"&&!action)))bad(405,"Method not allowed.");
 const b=await body();
 if(method==="POST"&&action==="preview") {
  const rules=routingInput(b.config||config,env,request),now=b.at===undefined?Date.now():Date.parse(b.at);
  if(!Number.isFinite(now))bad(400,"Choose a valid test time.");
  if(typeof b.country!=="string"||b.country.length>2||typeof b.language!=="string"||b.language.length>200)bad(400,"Choose a test country and language.");
  return resolveDestination(link.destination,rules,{country:b.country.toUpperCase(),language:b.language},now);
 }
 if(method!=="PUT"||action)bad(405,"Method not allowed.");
 if(!Number.isInteger(b.version)||b.version!==(old?.version||0)||b.linkVersion!==link.version)bad(409,"This link or its rules changed. Reload before saving.","conflict");
 const saved=JSON.stringify(routingInput(b.config,env,request)),mutation=crypto.randomUUID();
 const change=old?s("UPDATE link_routing SET config_json=?,version=version+1,mutation_id=?,updated_by=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE slug=? AND workspace_id=? AND version=? AND EXISTS(SELECT 1 FROM links WHERE slug=? AND workspace_id=? AND version=? AND deleted_at IS NULL) RETURNING *",saved,mutation,user.uid,slug,wid,b.version,slug,wid,b.linkVersion):s("INSERT INTO link_routing(slug,workspace_id,config_json,mutation_id,updated_by) SELECT slug,workspace_id,?,?,? FROM links WHERE slug=? AND workspace_id=? AND version=? AND deleted_at IS NULL ON CONFLICT(slug) DO NOTHING RETURNING *",saved,mutation,user.uid,slug,wid,b.linkVersion);
 const result=await env.DB.batch([change,s("INSERT INTO link_routing_revisions(slug,version,config_json,actor_uid) SELECT slug,version,config_json,? FROM link_routing WHERE slug=? AND mutation_id=?",user.uid,slug,mutation),s("DELETE FROM link_routing_revisions WHERE slug=? AND version NOT IN(SELECT version FROM link_routing_revisions WHERE slug=? ORDER BY version DESC LIMIT 50)",slug,slug)]);
 const row=result[0].results?.[0];if(!row)bad(409,"This link or its rules changed. Reload and retry.","conflict");
 return {config:JSON.parse(row.config_json),version:row.version,linkVersion:link.version,fallback:link.destination};
}

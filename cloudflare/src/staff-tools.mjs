import {Problem} from "./domain.mjs";
import {profileContent,profileFields} from "./people.mjs";
import {validateSlug} from "../../manage/core.mjs";
const fail=(status,message)=>{throw new Problem(status,message);};
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const db=env=>({s:(q,...a)=>env.DB.prepare(q).bind(...a),first:(q,...a)=>env.DB.prepare(q).bind(...a).first(),all:async(q,...a)=>(await env.DB.prepare(q).bind(...a).all()).results});
const editable=value=>{if(!Array.isArray(value)||value.length>20||value.some(k=>![...Object.keys(profileFields),"resources"].includes(k))||new Set(value).size!==value.length)fail(400,"Choose valid employee-editable fields.");return value;};
const template=row=>row?{content:JSON.parse(row.content_json),editable:JSON.parse(row.editable_json),version:row.version}:{content:{organization:"",department:"",office:""},editable:[],version:0};
async function normalize(rows,env,request,wid){
 if(!Array.isArray(rows)||!rows.length||rows.length>100)fail(400,"Import 1 to 100 rows.");
 const {first}=db(env),defaults=template(await first("SELECT * FROM people_templates WHERE workspace_id=?",wid)),seen=new Set(),out=[];
 for(let i=0;i<rows.length;i++){
  const value=rows[i];let row={index:i,id:crypto.randomUUID(),slug:"",content:null,assignedUid:null,editable:defaults.editable,error:null};
  try{
   if(!value||typeof value!=="object"||Array.isArray(value))fail(400,"Provide a contact row.");
   row.slug=validateSlug(value.slug);if(row.slug==="qr")fail(400,"Choose another page address.");
   if(seen.has(row.slug))fail(400,"Duplicate address in this file.");seen.add(row.slug);
   row.content=profileContent({...defaults.content,...value,resources:[]},env,request);
   if(await first("SELECT 1 FROM people WHERE slug=?",row.slug))fail(409,"Address already reserved; imports never overwrite cards.");
   if(value.employeeEmail){if(typeof value.employeeEmail!=="string"||value.employeeEmail.length>254)fail(400,"Check employee account email.");const assigned=await first("SELECT u.uid FROM users u JOIN memberships m ON m.uid=u.uid WHERE m.workspace_id=? AND u.email=?",wid,value.employeeEmail.trim().toLowerCase());if(!assigned)fail(400,"Employee email must match an approved workspace member.");row.assignedUid=assigned.uid;}
  }catch(e){if(e instanceof Problem)row.error=e.message;else row.error="Check the page address and contact fields.";}
  out.push(row);
 }
 return {rows:out,templateVersion:defaults.version};
}
export async function staffToolsAPI({path,method,request,env,wid,user,role,personal,body}){
 if(role!=="owner"||personal)fail(403,"Company owner access is required.");
 const {s,first,all}=db(env);
 if(path==="/api/people-template"){
  if(method==="GET")return{template:template(await first("SELECT * FROM people_templates WHERE workspace_id=?",wid))};
  if(method!=="PUT")fail(405,"Method not allowed.");
  const b=await body();if(!Number.isInteger(b.version)||b.version<0)fail(400,"Saved version is required.");
  const input=profileContent({name:"Template",organization:b.content?.organization??"",department:b.content?.department??"",office:b.content?.office??""},env,request),content=JSON.stringify(Object.fromEntries(["organization","department","office"].map(k=>[k,input[k]]))),allowed=JSON.stringify(editable(b.editable));
  let result;
  try{result=b.version===0?await s("INSERT INTO people_templates(workspace_id,content_json,editable_json,updated_by) VALUES(?,?,?,?) ON CONFLICT(workspace_id) DO NOTHING RETURNING *",wid,content,allowed,user.uid).all():await s("UPDATE people_templates SET content_json=?,editable_json=?,version=version+1,updated_by=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE workspace_id=? AND version=? RETURNING *",content,allowed,user.uid,wid,b.version).all();}catch{fail(409,"Template changed. Reload before saving.");}
  if(!result.results?.length)fail(409,"Template changed. Reload before saving.");return{template:template(result.results[0])};
 }
 if(path==="/api/people-imports/preview"&&method==="POST")return await normalize((await body()).rows,env,request,wid);
 if(path==="/api/people-imports"&&method==="GET")return{jobs:await all("SELECT id,created_at FROM people_imports WHERE workspace_id=? ORDER BY created_at DESC LIMIT 50",wid)};
 if(path==="/api/people-imports"&&method==="POST"){
  const b=await body();if(!uuid(b.id))fail(400,"An import identifier is required.");
  const old=await first("SELECT * FROM people_imports WHERE id=?",b.id);if(old){if(old.workspace_id!==wid)fail(404,"Import not found.");if(old.request_json!==JSON.stringify(b.rows))fail(409,"This import identifier belongs to another file preview.");return{job:await report(old)};}
  if((await first("SELECT COUNT(*) AS n FROM people_imports WHERE workspace_id=?",wid)).n>=100)fail(429,"Import history limit reached. Contact the administrator.");
  const normalized=await normalize(b.rows,env,request,wid);if(b.templateVersion!==normalized.templateVersion)fail(409,"The company template changed. Validate the preview again.");const rows=normalized.rows;if(rows.some(r=>r.error))fail(400,"Correct all preview errors before starting the import.");
  await s("INSERT OR IGNORE INTO people_imports(id,workspace_id,rows_json,request_json,created_by) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM people_imports WHERE workspace_id=?)<100",b.id,wid,JSON.stringify(rows),JSON.stringify(b.rows),user.uid,wid).run();const saved=await first("SELECT * FROM people_imports WHERE id=?",b.id);if(!saved)fail(429,"Import history allowance reached.");if(saved.workspace_id!==wid)fail(404,"Import not found.");if(saved.request_json!==JSON.stringify(b.rows))fail(409,"Import identifier belongs to another preview.");return{job:await report(saved)};
 }
 const match=path.match(/^\/api\/people-imports\/([0-9a-f-]{36})(?:\/(run))?$/);if(!match)fail(404,"Endpoint not found.");
 const job=await first("SELECT * FROM people_imports WHERE id=? AND workspace_id=?",match[1],wid);if(!job)fail(404,"Import not found.");
 if(method==="GET"&&!match[2])return{job:await report(job)};
 if(method==="DELETE"&&!match[2]){await env.DB.batch([s("UPDATE people SET source_import_id=NULL WHERE workspace_id=? AND source_import_id=?",wid,job.id),s("DELETE FROM people_import_rows WHERE import_id=?",job.id),s("DELETE FROM people_imports WHERE id=? AND workspace_id=?",job.id,wid)]);return{removed:true};}
 if(method!=="POST"||match[2]!=="run")fail(405,"Method not allowed.");
 const results=await all("SELECT row_index,status FROM people_import_rows WHERE import_id=?",job.id),done=new Set(results.filter(r=>r.status==="created").map(r=>r.row_index));
 const run=await body();if(run.retry!==undefined&&typeof run.retry!=="boolean")fail(400,"Choose whether to retry failed rows.");const failed=new Set(results.filter(r=>r.status==="error").map(r=>r.row_index));
 for(const row of JSON.parse(job.rows_json).filter(r=>!done.has(r.index)&&(run.retry?failed.has(r.index):!failed.has(r.index))).slice(0,10)){
  try{
   if(row.assignedUid&&!await first("SELECT 1 FROM memberships WHERE workspace_id=? AND uid=?",wid,row.assignedUid))fail(400,"Assigned employee no longer has workspace access.");
   const mutation=crypto.randomUUID();
   const result=await env.DB.batch([
    s("INSERT INTO people(id,workspace_id,slug,qr_id,assigned_uid,editable_json,draft_json,mutation_id,created_by,updated_by,source_import_id) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM people WHERE workspace_id=?)<250 ON CONFLICT(id) DO NOTHING RETURNING id",row.id,wid,row.slug,crypto.randomUUID(),row.assignedUid,JSON.stringify(row.editable),JSON.stringify(row.content),mutation,user.uid,user.uid,job.id,wid),
    s("INSERT OR IGNORE INTO people_revisions(profile_id,version,content_json,action,actor_uid) SELECT id,version,draft_json,'imported',? FROM people WHERE id=? AND source_import_id=? AND mutation_id=?",user.uid,row.id,job.id,mutation),
    s("INSERT INTO people_import_rows(import_id,row_index,profile_id,status,error) SELECT ?,?,id,'created',NULL FROM people WHERE id=? AND workspace_id=? AND source_import_id=? ON CONFLICT(import_id,row_index) DO UPDATE SET profile_id=excluded.profile_id,status='created',error=NULL",job.id,row.index,row.id,wid,job.id),
   ]);
   if(!(await first("SELECT 1 FROM people_import_rows WHERE import_id=? AND row_index=? AND status='created'",job.id,row.index)))fail(429,"Card allowance reached.");
  }catch(e){const message=e instanceof Problem?e.message:String(e).includes("UNIQUE")?"Page address is now reserved. No existing card was changed.":"Import failed. Retry this row.";await s("INSERT INTO people_import_rows(import_id,row_index,status,error) VALUES(?,?,'error',?) ON CONFLICT(import_id,row_index) DO UPDATE SET error=CASE WHEN status='created' THEN NULL ELSE excluded.error END,status=CASE WHEN status='created' THEN 'created' ELSE 'error' END",job.id,row.index,message).run();}
 }
 return{job:await report(job)};
 async function report(job){const results=await all("SELECT row_index,profile_id,status,error FROM people_import_rows WHERE import_id=? ORDER BY row_index",job.id);return{id:job.id,createdAt:job.created_at,rows:JSON.parse(job.rows_json).map(row=>({...row,result:results.find(r=>r.row_index===row.index)||null}))};}
}

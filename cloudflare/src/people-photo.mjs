import {Problem} from "./domain.mjs";
import {photoPNG,photoDataURL} from "./photo.mjs";
const fail=(status,message)=>{throw new Problem(status,message);};
const uuid=v=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export async function peoplePhoto({row,owner,user,env,method,body}){
 const s=(q,...a)=>env.DB.prepare(q).bind(...a),first=(q,...a)=>s(q,...a).first(),draft=JSON.parse(row.draft_json);
 if(method==="GET"){
  if(!draft.photoId)fail(404,"No draft photo.");const photo=await first("SELECT * FROM people_photos WHERE id=? AND profile_id=?",draft.photoId,row.id);if(!photo)fail(404,"Photo not found.");return{dataURL:photoDataURL(photo.data),width:photo.width,height:photo.height};
 }
 if(!["POST","DELETE"].includes(method))fail(405,"Method not allowed.");
 if(row.state==="disabled")fail(409,"Activate this card before editing.");
 if(!owner&&!JSON.parse(row.editable_json).includes("photoId"))fail(403,"Your workspace owner manages this photo.");
 const b=await body();if(!Number.isInteger(b.version))fail(400,"Saved version is required.");
 let photo=null;
 if(method==="POST"){
  if(!uuid(b.id))fail(400,"A photo identifier is required.");photo=await photoPNG(b.dataURL);
  const old=await first("SELECT profile_id,sha256 FROM people_photos WHERE id=?",b.id);
  if(old){if(old.profile_id!==row.id)fail(404,"Photo not found.");if(old.sha256===photo.hash&&draft.photoId===b.id)return row;fail(409,"Choose the image again to create a new photo draft.");}
 }
 if(b.version!==row.version)fail(409,"This card changed. Reload before updating its photo.");
 const mutation=crypto.randomUUID(),stamp=new Date().toISOString(),photoId=method==="POST"?b.id:null,newDraft=JSON.stringify({...draft,photoId});
 const statements=[];
 if(photo)statements.push(s("INSERT INTO people_photos(id,profile_id,data,width,height,sha256) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM people WHERE id=? AND version=?)",photoId,row.id,photo.bytes,photo.width,photo.height,photo.hash,row.id,row.version));
 statements.push(s("UPDATE people SET draft_json=?,version=version+1,mutation_id=?,updated_by=?,updated_at=? WHERE id=? AND workspace_id=? AND version=? RETURNING *",newDraft,mutation,user.uid,stamp,row.id,row.workspace_id,row.version));
 const resultIndex=statements.length-1;
 statements.push(s("INSERT INTO people_revisions(profile_id,version,content_json,action,actor_uid) SELECT id,version,draft_json,'photo_updated',? FROM people WHERE id=? AND mutation_id=?",user.uid,row.id,mutation));
 statements.push(s("DELETE FROM people_revisions WHERE profile_id=? AND version NOT IN (SELECT version FROM people_revisions WHERE profile_id=? ORDER BY version DESC LIMIT 50)",row.id,row.id));
 // Retain only the current draft and approved snapshot. Never leave abandoned uploads.
 statements.push(s("DELETE FROM people_photos WHERE profile_id=? AND id NOT IN (SELECT COALESCE(json_extract(draft_json,'$.photoId'),'') FROM people WHERE id=? UNION SELECT COALESCE(json_extract(published_json,'$.photoId'),'') FROM people WHERE id=?)",row.id,row.id,row.id));
 let result;try{result=await env.DB.batch(statements);}catch(e){if(String(e).includes("UNIQUE"))fail(409,"Photo changed. Reload before retrying.");throw e;}
 const saved=result[resultIndex].results?.[0];if(!saved)fail(409,"This card changed. Reload before updating its photo.");return saved;
}

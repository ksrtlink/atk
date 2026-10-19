import {Problem} from './domain.mjs';
import {DAY,operationalFailure} from './analytics.mjs';
export const AUDIT_TYPES=['link','design','qr','profile','resource','routing','template','preset','bulk','staff_import','event','contact','contact_settings','analytics'];
export async function auditAPI({env,wid,role,method,params}){
 if(role!=='owner')throw new Problem(403,'Only the workspace owner can read activity.');
 if(method!=='GET')throw new Problem(405,'Activity is read-only.');
 const allowed=new Set(['days','type','until','before','cursor']);for(const key of params.keys())if(!allowed.has(key)||params.getAll(key).length!==1)throw new Problem(400,'Unsupported activity filter.');
 const s=(q,...a)=>env.DB.prepare(q).bind(...a),coverage=await s("SELECT *,CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER) AS server_now FROM audit_policy WHERE id=1").first();if(!coverage)throw new Problem(503,'Activity settings are unavailable.');
 const now=coverage.server_now,days=Number(params.get('days')||30),type=params.get('type')||'',until=Number(params.get('until')||(now+1)),before=params.get('before'),cursor=params.get('cursor');
 if(![7,30,90].includes(days)||type&&!AUDIT_TYPES.includes(type)||!Number.isSafeInteger(until)||until>now+1000||until<now-90*DAY||before&&(!/^\d{13}$/.test(before)||!/^[a-f0-9]{32}$/.test(cursor||'')||Number(before)>until)||cursor&&!before)throw new Problem(400,'Check the activity period and cursor.');
 const start=Math.max(until-days*DAY,now-90*DAY);
 const rows=(await s(`SELECT a.*,u.display_name AS current_name,u.email AS current_email FROM audit_records a LEFT JOIN users u ON u.uid=a.actor_uid WHERE a.workspace_id=? AND a.occurred_at>=? AND a.occurred_at<? ${type?'AND a.subject_type=?':''} ${before?'AND (a.occurred_at<? OR (a.occurred_at=? AND a.id<?))':''} ORDER BY a.occurred_at DESC,a.id DESC LIMIT 51`,wid,start,until,...(type?[type]:[]),...(before?[Number(before),Number(before),cursor]:[])).all()).results;
 const more=rows.length>50;if(more)rows.pop();const last=rows.at(-1);
 return{records:rows.map(r=>({id:r.id,actor:{uid:r.actor_uid,kind:r.actor_kind,label:r.actor_kind==='visitor'?'Visitor':r.actor_kind==='system'?'System':r.current_name||r.current_email||'Former account'},action:r.action,subject:{type:r.subject_type,id:r.subject_id,version:r.subject_version},at:new Date(r.occurred_at).toISOString()})),next:more?{before:last.occurred_at,cursor:last.id}:null,until,from:new Date(start).toISOString(),to:new Date(until).toISOString(),timezone:'UTC',retentionDays:90,recordingSince:coverage?new Date(coverage.started_at).toISOString():null,recordingEnabled:coverage?.enabled===1,previousPauses:coverage?.pauses||0,types:AUDIT_TYPES};
}
export async function pruneAudit(env,{batches=2}={}){
 if(!env.DB)return;const cutoff=Date.now()-90*DAY;for(let i=0;i<Math.min(10,Math.max(1,batches));i++){const r=await env.DB.prepare('DELETE FROM audit_records WHERE id IN (SELECT id FROM audit_records WHERE occurred_at<? ORDER BY occurred_at LIMIT 1000)').bind(cutoff).run();if((r.meta?.changes??0)<1000)break;}
 const pending=await env.DB.prepare('SELECT 1 FROM audit_records WHERE occurred_at<? LIMIT 1').bind(cutoff).first();if(pending)operationalFailure('audit_retention_more_pending');
}

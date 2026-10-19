// Shared deterministic matching and timezone conversion; no network or storage.
export function timeZone(value) {
 if(typeof value!=="string"||value.length>80)throw Error("Choose a valid IANA timezone, such as UTC or Asia/Dubai.");
 try{return new Intl.DateTimeFormat("en",{timeZone:value}).resolvedOptions().timeZone;}catch{throw Error("Choose a valid IANA timezone, such as UTC or Asia/Dubai.");}
}
const formatter=zone=>new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
function parts(date,zone){return Object.fromEntries(formatter(zone).formatToParts(date).filter(p=>p.type!=="literal").map(p=>[p.type,Number(p.value)]));}
const number=p=>Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second||0);
export function localToUTC(value,zone) {
 zone=timeZone(zone);
 const m=typeof value==="string"&&value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
 if(!m)throw Error("Enter a date and time.");
 const [,year,month,day,hour,minute]=m.map(Number),naive=Date.UTC(year,month-1,day,hour,minute);
 const check=new Date(naive);
 if(year<2000||year>2100||check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day||hour>23||minute>59)throw Error("Choose a valid date between 2000 and 2100.");
 const offsets=new Set();
 for(let h=-36;h<=36;h+=6){const t=naive+h*3600000;offsets.add(number(parts(new Date(t),zone))-t);}
 const matches=[...offsets].map(offset=>naive-offset).filter(t=>number(parts(new Date(t),zone))===naive);
 if(!matches.length)throw Error("This local time does not exist because the clocks change. Choose another time or UTC.");
 if(matches.length>1)throw Error("This local time occurs twice because the clocks change. Use UTC to choose an unambiguous time.");
 return new Date(matches[0]).toISOString();
}
export function utcToLocal(value,zone) {
 const p=parts(new Date(value),timeZone(zone)),pad=n=>String(n).padStart(2,"0");
 return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
export function preferredLanguage(header) {
 return String(header||"").slice(0,2048).split(",").slice(0,20).map((s,i)=>{
  const [tag,...params]=s.trim().split(";");let q=1;
  const qPart=params.find(p=>/^q=/i.test(p.trim()));
  if(qPart){const v=qPart.trim().slice(2);if(!/^(?:0(?:\.\d{1,3})?|1(?:\.0{1,3})?)$/.test(v))q=0;else q=Number(v);}
  return {tag:tag.toLowerCase(),q,i};
 }).filter(p=>p.q>0&&/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/.test(p.tag)).sort((a,b)=>b.q-a.q||a.i-b.i)[0]?.tag||"";
}
export function resolveDestination(fallback,config,{country="",language=""}={},now=Date.now()) {
 if(!config?.enabled)return {destination:fallback,matched:"fallback",ruleId:null};
 for(const rule of config.schedules||[])if(now>=Date.parse(rule.start)&&now<Date.parse(rule.end))return {destination:rule.destination,matched:"schedule",ruleId:rule.id};
 const cc=/^[A-Z]{2}$/.test(country)&&!["XX","ZZ","T1"].includes(country)?country:"",lang=preferredLanguage(language);
 for(const rule of config.audiences||[]){const country=(rule.country||"").toUpperCase(),language=(rule.language||"").toLowerCase();if((!country||country===cc)&&(!language||lang===language||lang.startsWith(language+"-")))return {destination:rule.destination,matched:"audience",ruleId:rule.id};}
 return {destination:fallback,matched:"fallback",ruleId:null};
}

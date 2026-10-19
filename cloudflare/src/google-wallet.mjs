import {importPKCS8,SignJWT} from 'jose';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const API_URL='https://walletobjects.googleapis.com/walletobjects/v1/genericClass/';
export const WALLET_SCOPE='https://www.googleapis.com/auth/wallet_object.issuer';
class WalletFailure extends Error{constructor(code){super(code);this.code=code;}}
const stop=code=>{throw new WalletFailure(code);};
function configuration(env){
 const raw=env.GOOGLE_WALLET_MODE||'disabled',mode=['disabled','demo','live'].includes(raw)?raw:'invalid';
 if(mode==='disabled')return{mode};if(mode==='invalid')stop('invalid_mode');
 const missing=['GOOGLE_WALLET_ISSUER_ID','GOOGLE_WALLET_CLASS_ID','GOOGLE_WALLET_SERVICE_ACCOUNT'].filter(k=>!env[k]);if(missing.length)return{mode,missing};
 const issuer=env.GOOGLE_WALLET_ISSUER_ID,classId=env.GOOGLE_WALLET_CLASS_ID;
 if(typeof issuer!=='string'||!/^\d{6,32}$/.test(issuer))stop('invalid_issuer');
 if(typeof classId!=='string'||!classId.startsWith(issuer+'.')||classId.length>192||!/^[0-9]+\.[A-Za-z0-9._-]+$/.test(classId))stop('invalid_class');
 let credentials;try{if(typeof env.GOOGLE_WALLET_SERVICE_ACCOUNT!=='string'||env.GOOGLE_WALLET_SERVICE_ACCOUNT.length>16384)stop('invalid_credentials');credentials=JSON.parse(env.GOOGLE_WALLET_SERVICE_ACCOUNT);}catch{stop('invalid_credentials');}
 if(!credentials||credentials.type!=='service_account'||typeof credentials.client_email!=='string'||!/^[A-Za-z0-9._-]{1,120}@[a-z0-9.-]{1,160}\.gserviceaccount\.com$/.test(credentials.client_email)||typeof credentials.private_key!=='string'||credentials.private_key.length>12000||!credentials.private_key.startsWith('-----BEGIN PRIVATE KEY-----')||credentials.token_uri&&credentials.token_uri!==TOKEN_URL||credentials.private_key_id!=null&&(typeof credentials.private_key_id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(credentials.private_key_id)))stop('invalid_credentials');
 return{mode,issuer,classId,credentials};
}
async function discard(response){if(response.body)await response.body.cancel().catch(()=>{});}
async function json(response,limit){
 if(!response.body)stop('invalid_response');const reader=response.body.getReader();let size=0;const chunks=[];
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit)stop('response_too_large');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))stop('invalid_response');return value;}catch{stop('invalid_response');}
}
function responseFailure(response,token=false){
 const status=response.status;if(status>=300&&status<400)return'unexpected_redirect';if(status===429)return'rate_limited';if(status>=500)return'provider_unavailable';if(status===401||token&&status===400)return'credentials_rejected';if(status===403)return'issuer_access_denied';if(status===404)return'class_not_found';return'invalid_response';
}
/** A connection check only: no pass issuance, provider writes, device registration or production-readiness claim. */
export async function checkGoogleWallet(env,{transport=fetch,timeoutMs=8000}={}){
 const base={provider:'google',connected:false,productionReady:false};const requested=env.GOOGLE_WALLET_MODE||'disabled';let mode=['disabled','demo','live'].includes(requested)?requested:'invalid';
 try{
  const config=configuration(env);mode=config.mode;if(mode==='disabled')return{...base,mode,status:'disabled'};if(config.missing)return{...base,mode,status:'not_configured',missing:config.missing};
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.min(10000,Math.max(50,timeoutMs)));
  try{
   let key;try{key=await importPKCS8(config.credentials.private_key,'RS256');if(key.algorithm.modulusLength<2048||key.algorithm.modulusLength>4096)stop('invalid_private_key');}catch{stop('invalid_private_key');}
   const assertion=await new SignJWT({scope:WALLET_SCOPE}).setProtectedHeader({alg:'RS256',typ:'JWT',...(config.credentials.private_key_id?{kid:config.credentials.private_key_id}:{})}).setIssuer(config.credentials.client_email).setAudience(TOKEN_URL).setIssuedAt().setExpirationTime('1h').sign(key);
   const options={redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal:controller.signal};
   const response=await transport(TOKEN_URL,{...options,method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}).toString()});
   if(!response.ok){const code=responseFailure(response,true);await discard(response);stop(code);}const token=await json(response,16384);
   if(token.token_type!=='Bearer'||typeof token.access_token!=='string'||!/^[-A-Za-z0-9._~+/=]{1,8192}$/.test(token.access_token)||!Number.isInteger(token.expires_in)||token.expires_in<1||token.expires_in>3600)stop('invalid_token_response');
   const resource=await transport(API_URL+encodeURIComponent(config.classId),{...options,method:'GET',headers:{Accept:'application/json',Authorization:'Bearer '+token.access_token}});
   if(!resource.ok){const code=responseFailure(resource);await discard(resource);stop(code);}const value=await json(resource,32768);if(value.id!==config.classId)stop('class_mismatch');
   return{...base,mode,connected:true,status:'class_access_verified'};
  }catch(error){if(controller.signal.aborted)stop('timeout');throw error;}finally{clearTimeout(timer);}
 }catch(error){return{...base,mode,status:'connection_failed',reason:error instanceof WalletFailure?error.code:'connection_failed'};}
}

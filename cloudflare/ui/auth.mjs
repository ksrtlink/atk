let config;
let session=null;
let refreshing=null;
let generation=0;
const storageKey='link-studio.account';
const listeners=new Set();
const AUTH_ORIGIN='https://identitytoolkit.googleapis.com/v1/';
export const account=()=>session?{email:session.email,uid:session.uid}:null;
export const onAccountChange=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
function emit(){for(const fn of listeners)fn(account());}
function persist(){
  try{if(session)sessionStorage.setItem(storageKey,JSON.stringify({refreshToken:session.refreshToken,email:session.email,uid:session.uid}));else sessionStorage.removeItem(storageKey);}catch{}
}
const errors={
  EMAIL_EXISTS:'An account already exists for that email. Sign in instead.',
  INVALID_LOGIN_CREDENTIALS:'Check your email and password and try again.',
  INVALID_PASSWORD:'Check your email and password and try again.',
  EMAIL_NOT_FOUND:'Check your email and password and try again.',
  TOO_MANY_ATTEMPTS_TRY_LATER:'Too many attempts. Please wait before trying again.',
  OPERATION_NOT_ALLOWED:'Email sign-in is not enabled yet. Contact the workspace owner.',
  USER_DISABLED:'This account is disabled.',INVALID_EMAIL:'Enter a valid email address.',
  TOKEN_EXPIRED:'Your session expired. Please sign in again.',INVALID_REFRESH_TOKEN:'Your session expired. Please sign in again.'
};
function errorMessage(code){return code?.startsWith('WEAK_PASSWORD')?'Use a password with at least 8 characters.':errors[code]||'The account service could not complete this request. Please try again.';}
async function identity(method,body){
  if(!config?.authReady)throw new Error('Email accounts are not configured yet.');
  let response;
  try{response=await fetch(`${AUTH_ORIGIN}accounts:${method}?key=${encodeURIComponent(config.firebase.apiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',signal:AbortSignal.timeout(20000)});}
  catch{throw new Error('Could not reach the email account service. Check your connection.');}
  const data=await response.json();if(!response.ok)throw new Error(errorMessage(data.error?.message));return data;
}
function accept(data){session={idToken:data.idToken,refreshToken:data.refreshToken,email:data.email,uid:data.localId,expiresAt:Date.now()+Number(data.expiresIn)*1000};persist();emit();}
export async function initializeAuth(settings){
  config=settings;
  if(!config.authReady)return;
  try{
    const stored=JSON.parse(sessionStorage.getItem(storageKey)||'null');
    if(stored?.refreshToken && stored.email && stored.uid){session={...stored,idToken:'',expiresAt:0};await token();emit();}else{session=null;}
  }catch{session=null;persist();}
}
export async function signIn(email,password){const data=await identity('signInWithPassword',{email,password,returnSecureToken:true});accept(data);}
export async function signUp(email,password){
  if(password.length<8)throw new Error('Use a password with at least 8 characters.');
  const data=await identity('signUp',{email,password,returnSecureToken:true});accept(data);
  await sendVerification();
}
export async function sendVerification(){await identity('sendOobCode',{requestType:'VERIFY_EMAIL',idToken:await token()});}
export async function resetPassword(email){
  if(!email)throw new Error('Enter your email address first.');
  await identity('sendOobCode',{requestType:'PASSWORD_RESET',email});
}
export function signOut(){generation++;session=null;refreshing=null;persist();emit();}
export async function token(force=false){
  if(!session)throw new Error('Sign in to your profile.');
  if(!force&&session.idToken&&session.expiresAt>Date.now()+60000)return session.idToken;
  if(refreshing)return refreshing;
  const epoch=generation;const previous=session;
  refreshing=(async()=>{
    let response;
    try{response=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.firebase.apiKey)}`,{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:previous.refreshToken}),credentials:'omit',signal:AbortSignal.timeout(20000)
    });}catch{throw new Error('Could not refresh your session. Check your connection.');}
    const data=await response.json();
    if(epoch!==generation||session!==previous)throw new Error('The account changed. Please try again.');
    if(!response.ok){signOut();throw new Error(errorMessage(data.error?.message));}
    session={...previous,idToken:data.id_token,refreshToken:data.refresh_token,uid:data.user_id,expiresAt:Date.now()+Number(data.expires_in)*1000};persist();return session.idToken;
  })();
  try{return await refreshing;}finally{if(epoch===generation)refreshing=null;}
}

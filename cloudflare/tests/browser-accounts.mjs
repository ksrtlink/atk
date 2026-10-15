import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
await fetch('http://127.0.0.1:4174/qa/reset',{method:'POST'});
const tokens=await(await fetch('http://127.0.0.1:4174/qa/tokens')).json();
const tabs=await(await fetch('http://127.0.0.1:9226/json/list')).json();
const target=tabs.find(t=>t.url.startsWith('http://127.0.0.1:4174/'))||tabs.find(t=>t.type==='page'&&!t.url.startsWith('edge:'));
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let seq=0,verifiedCharlie=false;const pending=new Map(),errors=[];let verificationEmails=0;
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
ws.onmessage=async event=>{
 const message=JSON.parse(event.data);
 if(message.id){const p=pending.get(message.id);pending.delete(message.id);message.error?p?.reject(new Error(message.error.message)):p?.resolve(message.result);return;}
 if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
 if(message.method!=='Fetch.requestPaused')return;
 const {requestId,request}=message.params;
 let data={};
 if(request.method!=='OPTIONS'){
  const path=new URL(request.url).pathname;
  if(path.endsWith('accounts:signInWithPassword')){const body=JSON.parse(request.postData);data=tokens[body.email.startsWith('bob')?'bob':body.email.startsWith('charlie')?(verifiedCharlie?'charlieVerified':'charlie'):'alice'];}
  else if(path.endsWith('accounts:signUp'))data=tokens.charlie;
  else if(path.endsWith('accounts:sendOobCode')){verificationEmails++;data={email:'charlie@example.com'};}
  else if(path.endsWith('/token')){const refresh=new URLSearchParams(request.postData).get('refresh_token');const source=tokens[refresh==='bob-refresh'?'bob':refresh==='charlie-refresh'?(verifiedCharlie?'charlieVerified':'charlie'):'alice'];data={id_token:source.idToken,refresh_token:source.refreshToken,user_id:source.localId,expires_in:source.expiresIn};}
 }
 await send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'},{name:'Access-Control-Allow-Origin',value:'*'},{name:'Access-Control-Allow-Headers',value:'content-type'},{name:'Access-Control-Allow-Methods',value:'POST,OPTIONS'}],body:Buffer.from(JSON.stringify(data)).toString('base64')});
};
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function waitFor(expression){for(let i=0;i<200;i++){if(await ev(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error(`Timeout: ${expression}`);}
const click=id=>ev(`document.getElementById(${JSON.stringify(id)}).click()`);
const fill=(id,value)=>ev(`document.getElementById(${JSON.stringify(id)}).value=${JSON.stringify(value)};document.getElementById(${JSON.stringify(id)}).dispatchEvent(new Event('input',{bubbles:true}))`);
async function login(email){await click('connect');await click('auth-login-tab');await fill('auth-email',email);await fill('auth-password','test-only-password');await click('auth-submit');await waitFor(`!document.getElementById('account-dialog').open && document.querySelector('#profile-notice').classList.contains('hidden')`);}
async function logout(){await click('connect');await click('auth-signout');}
const passed=[];
try{
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Fetch.enable',{patterns:[{urlPattern:'https://identitytoolkit.googleapis.com/*'},{urlPattern:'https://securetoken.googleapis.com/*'}]});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 const clear=await send('Page.addScriptToEvaluateOnNewDocument',{source:'sessionStorage.removeItem("link-studio.account")'});
 await send('Page.navigate',{url:'http://127.0.0.1:4174/manage/'});
 await waitFor(`document.querySelectorAll('.link-row').length===8`);
 await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:clear.identifier});
 assert.equal(await ev(`document.body.innerText.includes('Connect GitHub')`),false);
 passed.push('No GitHub sign-in step; all eight original URLs visible anonymously');
 await login('alice@example.com');
 assert.equal(await ev(`document.querySelectorAll('.link-row').length`),0);
 await fill('destination','https://example.com/team?source=qr');await fill('slug','team-report');await click('submit');
 await waitFor(`document.querySelectorAll('.link-row').length===1 && !document.getElementById('submit').disabled`);
 assert.equal(await ev(`document.getElementById('result-link').href`),'http://127.0.0.1:4174/r/team-report');
 passed.push('Verified email sign-in creates an immediately active database-backed link');
 await ev(`document.querySelector('.qr-button').click()`);
 await waitFor(`!!document.querySelector('#qr-preview svg')&&!document.getElementById('qr-save-profile').disabled`);
 await fill('qr-design-title','Team Report QR');await click('qr-save-profile');
 await waitFor(`document.getElementById('qr-quality').textContent.includes('Saved to your profile')`);
 await click('qr-close');await click('tab-designs');
 assert.equal(await ev(`document.querySelectorAll('.design-row').length`),1);
 passed.push('QR design and settings saved into the signed-in profile');
 await send('Page.reload');await waitFor(`document.getElementById('profile-notice').classList.contains('hidden')`);
 await click('tab-designs');assert.equal(await ev(`document.querySelectorAll('.design-row').length`),1);
 await ev(`document.querySelector('.design-row button').click()`);
 await waitFor(`!!document.querySelector('#qr-preview svg')&&!document.getElementById('qr-save-profile').disabled`);
 assert.equal(await ev(`document.getElementById('qr-url').value`),'http://127.0.0.1:4174/r/team-report');
 assert.equal(await ev(`document.getElementById('qr-design-title').value`),'Team Report QR');
 await click('qr-close');passed.push('Reload restores the email session and saved QR design from the backend');
 await logout();await login('bob@example.com');
 assert.equal(await ev(`document.querySelectorAll('.link-row').length`),0);await click('tab-designs');assert.equal(await ev(`document.querySelectorAll('.design-row').length`),0);
 passed.push('Another user cannot see the first user’s links or QR designs');
 await logout();await click('connect');await click('auth-register-tab');await fill('auth-email','charlie@example.com');await fill('auth-password','test-only-password');await click('auth-submit');
 await waitFor(`document.getElementById('auth-message').textContent.includes('Verification') || document.getElementById('auth-message').textContent.includes('verification')`);
 assert.ok(verificationEmails>=1);assert.equal(await ev(`document.getElementById('profile-notice').classList.contains('hidden')`),false);
 verifiedCharlie=true;await click('auth-check');await waitFor(`!document.getElementById('account-dialog').open && document.getElementById('profile-notice').classList.contains('hidden')`);
 passed.push('Sign-up requests an email verification; profile opens only after verified identity refresh');
 await logout();await login('alice@example.com');await click('tab-links');
 await ev(`document.querySelector('.edit-button').click()`);await fill('destination','https://example.com/team-updated');await click('submit');
 await waitFor(`document.getElementById('result-heading').textContent.includes('updated')`);
 assert.equal(await ev(`document.getElementById('result-link').href`),'http://127.0.0.1:4174/r/team-report');
 passed.push('Editing updates the destination while preserving the short URL');
 await mkdir(new URL('../../.qa/',import.meta.url),{recursive:true});
 for(const [name,width,height]of[['desktop',1440,1000],['mobile',390,844]]){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<650});
   assert.equal(await ev(`document.documentElement.scrollWidth<=innerWidth`),true,name);
   const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(new URL(`../../.qa/accounts-${name}.png`,import.meta.url),Buffer.from(shot.data,'base64'));
 }
 assert.deepEqual(errors,[]);passed.push('Desktop/mobile layout passed, no JavaScript exceptions');
 console.log(JSON.stringify({passed,identityProvider:'simulated Firebase responses',backend:'real RSA verification and SQLite; no live emails sent'},null,2));
}finally{ws.close();}

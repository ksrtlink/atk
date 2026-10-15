import { validateSlug, titleFor } from './core.mjs';
import { initializeAuth, account, onAccountChange, signIn, signUp, signOut, sendVerification, resetPassword, token } from './auth.mjs';

const $=id=>document.getElementById(id);
let config={authReady:false,publicOrigin:location.origin};
let ownLinks=[],legacy=[],designs=[],view='legacy',verified=false,editing=null,registering=false,busy=false,loading=false,profileVersion=0,toastTimer;
let createKey=null;
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function notify(text){$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4000);}
function errorAt(id,message){$(id).textContent=message;$(id).classList.toggle('hidden',!message);}
async function api(path,{method='GET',body,auth=true,requestId}={}){
  if(!path.startsWith('/api/'))throw new Error('Unsupported request.');
  const headers={Accept:'application/json'};const uid=account()?.uid;
  if(auth)headers.Authorization=`Bearer ${await token()}`;
  if(body)headers['Content-Type']='application/json';
  if(requestId)headers['Idempotency-Key']=requestId;
  let response;
  try{response=await fetch(path,{method,headers,body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)});}
  catch{throw new Error(method==='GET'?'Could not load your library. Check your connection.':'The save was not confirmed. Refresh your profile before trying again.');}
  const data=await response.json();
  if(auth&&uid!==account()?.uid)throw new Error('The account changed. Please try again.');
  if(!response.ok){const error=new Error(data.error||'The request could not be completed.');error.code=data.code;throw error;}
  return data;
}
function openAccount(){
  if(!config.authReady){notify('Email accounts are not activated on this deployment yet.');return;}
  accountUI();if(!$('account-dialog').open)$('account-dialog').showModal();
}
function accountUI(){
  const user=account();
  $('connection-label').textContent=user?user.email:'Sign in with email';
  $('connection-label').classList.add('profile-name');$('connect').classList.toggle('connected',verified);
  $('account-top').textContent=user?'My account ↗':'Sign in with email ↗';
  $('auth-signedin').classList.toggle('hidden',!user);$('auth-signedout').classList.toggle('hidden',!!user);
  $('auth-current-email').textContent=user?.email||'';
  $('auth-verified-note').textContent=verified?'Your email is verified. Your links and QR designs are saved to this profile.':'Check your inbox and verify your email, then select “I’ve verified my email”.';
  if(verified)errorAt('auth-message','');
  $('auth-check').classList.toggle('hidden',verified);$('auth-resend').classList.toggle('hidden',verified);
  $('profile-notice').classList.toggle('hidden',verified);
  $('profile-message').textContent=user?'Verify your email to create links and save QR designs.':'Sign in with your email to create links and save QR designs.';
  $('profile-signin').textContent=user?'Verify email':'Sign in';
  $('form-note').textContent=verified?'Saved to your profile. Ready immediately, with no publishing wait.':'Sign in with a verified email to create links.';
}
function count(){return view==='designs'?designs.length:view==='legacy'?legacy.length:ownLinks.length;}
function render(){
  const query=$('search').value.trim().toLowerCase();
  for(const [id,name]of[['tab-links','links'],['tab-designs','designs'],['tab-legacy','legacy']]){
    $(id).classList.toggle('active',view===name);$(id).setAttribute('aria-pressed',String(view===name));
  }
  const heading=view==='designs'?'Saved QR designs':view==='legacy'?'Original links':'My links';
  $('library-heading').replaceChildren(document.createTextNode(heading+' '),el('span','',''+count()));
  $('total').textContent=ownLinks.length;$('nav-count').textContent=ownLinks.length;
  $('links').replaceChildren();
  $('export').classList.toggle('hidden',view==='designs');
  const items=(view==='designs'?designs:view==='legacy'?legacy:ownLinks).filter(item=>`${item.title} ${item.slug||''} ${item.url}`.toLowerCase().includes(query));
  $('empty').classList.toggle('hidden',!!items.length);
  $('empty').querySelector('h3').textContent=query?'No matching items':view==='designs'?'Your QR designs will appear here':view==='links'?'A fresh start for your links':'No original links available';
  $('empty').querySelector('p').textContent=query?'Try a different name or destination.':!verified?'Sign in with a verified email to use your personal library.':view==='designs'?'Open the QR builder and choose “Save to my profile”.':'Create your first short link using the form.';
  for(const [index,item]of items.entries()){
    if(view==='designs'){
      const row=el('article','design-row'),body=el('div');body.append(el('h3','',item.title),el('p','',item.url));
      const button=el('button','button secondary compact','Open designer');button.addEventListener('click',()=>openQR(item.url,item));row.append(body,button);$('links').append(row);continue;
    }
    const row=el('article','link-row'),body=el('div','link-body'),heading=el('h3','',item.title);
    if(item.legacy)heading.append(el('span','legacy-badge','ORIGINAL · READ ONLY'));
    const short=el('a','short-link',item.shortUrl.replace(/^https?:\/\//,''));short.href=item.shortUrl;short.target='_blank';short.rel='noopener noreferrer';
    const destination=el('a','destination',`→ ${item.url}`);destination.href=item.url;destination.target='_blank';destination.rel='noopener noreferrer';destination.title=item.url;
    body.append(heading,short,destination);
    const actions=el('div','row-actions');
    for(const [label,handler]of[['QR',()=>openQR(item.shortUrl)],['Copy',()=>copy(item.shortUrl)]]){
      const button=el('button',label==='QR'?'qr-button':'',label);button.setAttribute('aria-label',`${label} ${item.title}`);button.addEventListener('click',handler);actions.append(button);
    }
    if(!item.legacy){const edit=el('button','edit-button','Edit');edit.setAttribute('aria-label',`Edit ${item.title}`);edit.addEventListener('click',()=>editLink(item));actions.append(edit);}
    row.append(el('span','link-index',String(index+1).padStart(2,'0')),body,actions);$('links').append(row);
  }
}
function setView(next){view=next;$('search').value='';render();}
async function refreshLegacy(){
  try{const data=await api('/api/legacy',{auth:false});legacy=data.links;}
  catch{
    try{const response=await fetch('./links.json');const data=await response.json();legacy=data.map(l=>({...l,legacy:true,shortUrl:`https://ksrtlink.github.io/atk/${l.slug}/`}));}
    catch{legacy=[];}
  }
}
async function loadProfile(){
  const ticket=++profileVersion;
  verified=false;ownLinks=[];designs=[];accountUI();render();
  if(!account())return;
  $('source-status').textContent='Opening your profile…';
  try{
    await api('/api/me');
    const [linkData,qrData]=await Promise.all([api('/api/links'),api('/api/designs')]);
    if(ticket!==profileVersion)return;
    ownLinks=linkData.links;designs=qrData.designs;verified=true;
    $('source-status').classList.remove('warning');$('source-status').textContent='Saved to your profile · Private to your account';
  }catch(error){
    if(ticket!==profileVersion)return;
    $('source-status').textContent=error.message;$('source-status').classList.add('warning');
    if(error.code==='email_unverified')errorAt('auth-message','Verification is required. Check your inbox, then refresh your verification below.');
    else errorAt('auth-error',error.message);
  }
  accountUI();render();
}
async function refresh(){
  if(loading||busy)return;loading=true;$('refresh').disabled=true;
  try{await refreshLegacy();if(account())await loadProfile();else{$('source-status').textContent='Original links are available. Sign in for your personal library.';render();}}
  finally{loading=false;$('refresh').disabled=false;}
}
function updatePreview(){
  $('preview').textContent=editing?editing.shortUrl:`${config.publicOrigin}/r/${$('slug').value||'your-name'}`;
}
function editLink(link){
  if(busy)return;editing=link;createKey=null;$('slug').value=link.slug;$('slug').disabled=true;$('destination').value=link.url;
  $('form-heading').textContent='A new destination.';$('form-description').textContent='Keep your short link and QR codes. Update where they lead.';
  $('submit').textContent='Save destination ↗';$('cancel-edit').classList.remove('hidden');errorAt('form-error','');updatePreview();$('destination').focus();
}
function resetForm(){
  if(busy)return;editing=null;createKey=null;$('link-form').reset();$('slug').disabled=false;
  $('form-heading').textContent='Make it a short link.';$('form-description').textContent='Paste a destination. Give it a name. It’s ready to share.';
  $('submit').textContent='Create short link ↗';$('cancel-edit').classList.add('hidden');errorAt('form-error','');updatePreview();
}
$('link-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;errorAt('form-error','');
  if(!verified){openAccount();return;}
  let slug,destination;
  try{slug=validateSlug($('slug').value);const parsed=new URL($('destination').value.trim());if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error();destination=parsed.href;}
  catch{errorAt('form-error','Enter a valid short name and a full HTTP or HTTPS destination.');return;}
  busy=true;$('submit').disabled=true;$('destination').disabled=true;$('slug').disabled=true;
  const wasEditing=!!editing;
  try{
    let response;
    if(editing){response=await api(`/api/links/${encodeURIComponent(slug)}`,{method:'PATCH',body:{destination,version:editing.version}});}
    else{createKey ||= crypto.randomUUID();response=await api('/api/links',{method:'POST',body:{slug,destination},requestId:createKey});}
    const link=response.link;ownLinks=[link,...ownLinks.filter(l=>l.slug!==link.slug)];
    $('result-link').textContent=link.shortUrl;$('result-link').href=link.shortUrl;
    $('result-heading').textContent=wasEditing?'Your destination is updated.':'Ready to share.';
    $('publish-status').textContent='Saved to your profile. The redirect is active immediately.';
    $('result').classList.remove('hidden');$('check-publish').dataset.url=link.shortUrl;$('check-publish').textContent='Open link ↗';
    busy=false;resetForm();setView('links');notify(wasEditing?'Destination updated. Your QR codes keep working.':'Short link created and saved.');
  }catch(error){errorAt('form-error',error.message);}
  finally{busy=false;$('submit').disabled=false;$('destination').disabled=false;$('slug').disabled=!!editing;$('submit').textContent=editing?'Save destination ↗':'Create short link ↗';}
});
async function copy(text){try{await navigator.clipboard.writeText(text);notify('Link copied.');}catch{notify('Select and copy the displayed link.');}}
async function openQR(url='',design=null){
  try{
    const {openQRBuilder}=await import('./qr-builder.mjs');
    const owner=account()?.uid;
    let saved={id:design?.id||crypto.randomUUID(),version:design?.version};
    const onSave=verified?async value=>{
      if(owner!==account()?.uid)throw new Error('Your account changed. Reopen the designer.');
      const response=await api('/api/designs',{method:'POST',body:{...value,...saved}});
      saved={id:response.design.id,version:response.design.version};
      designs=[response.design,...designs.filter(d=>d.id!==saved.id)];render();
    }:null;
    await openQRBuilder({url,links:[...ownLinks,...legacy],design,onSave});
    if(!verified)notify('QR downloads are available. Sign in to save a design to your profile.');
  }catch(error){notify(error.message||'The QR builder could not load.');}
}
function authTab(isRegister){registering=isRegister;$('auth-login-tab').classList.toggle('active',!isRegister);$('auth-register-tab').classList.toggle('active',isRegister);$('auth-submit').textContent=isRegister?'Create account ↗':'Sign in ↗';$('auth-password').autocomplete=isRegister?'new-password':'current-password';errorAt('auth-error','');}
$('auth-form').addEventListener('submit',async event=>{
  event.preventDefault();$('auth-submit').disabled=true;errorAt('auth-error','');errorAt('auth-message','');
  const password=$('auth-password').value;$('auth-password').value='';
  try{
    if(registering){await signUp($('auth-email').value.trim(),password);errorAt('auth-message','Account created. Check your inbox for the verification email, then choose “I’ve verified my email”.');}
    else await signIn($('auth-email').value.trim(),password);
    await loadProfile();
    if(verified){$('account-dialog').close();setView('links');notify('Welcome. Your profile is ready.');}
  }catch(error){errorAt('auth-error',error.message);}
  finally{$('auth-submit').disabled=false;accountUI();}
});
$('auth-check').addEventListener('click',async()=>{
  $('auth-check').disabled=true;errorAt('auth-error','');
  try{await token(true);await loadProfile();if(verified){errorAt('auth-message','');$('account-dialog').close();setView('links');notify('Email verified. Welcome to your profile.');}}
  catch(error){errorAt('auth-error',error.message);}finally{$('auth-check').disabled=false;}
});
$('auth-resend').addEventListener('click',async()=>{
  $('auth-resend').disabled=true;
  try{await sendVerification();errorAt('auth-message','Verification email sent. Check your inbox and spam folder.');}
  catch(error){errorAt('auth-error',error.message);}finally{setTimeout(()=>$('auth-resend').disabled=false,30000);}
});
$('auth-reset').addEventListener('click',async()=>{
  $('auth-reset').disabled=true;
  try{await resetPassword($('auth-email').value.trim());errorAt('auth-message','If that email has an account, a password reset email is on its way.');}
  catch(error){errorAt('auth-error',error.message);}finally{setTimeout(()=>$('auth-reset').disabled=false,10000);}
});
$('auth-signout').addEventListener('click',()=>{signOut();$('account-dialog').close();notify('Signed out. Your saved work stays in your profile.');});
onAccountChange(()=>{
  profileVersion++;verified=false;ownLinks=[];designs=[];
  if($('qr-dialog')?.open)$('qr-dialog').close();
  $('result').classList.add('hidden');busy=false;resetForm();accountUI();render();
});
for(const id of ['connect','account-top','profile-signin'])$(id).addEventListener('click',openAccount);
$('auth-close').addEventListener('click',()=>$('account-dialog').close());
$('account-dialog').addEventListener('close',()=>{$('auth-password').value='';errorAt('auth-error','');});
$('auth-login-tab').addEventListener('click',()=>authTab(false));$('auth-register-tab').addEventListener('click',()=>authTab(true));
for(const [id,next]of[['tab-links','links'],['tab-designs','designs'],['tab-legacy','legacy']])$(id).addEventListener('click',()=>setView(next));
$('refresh').addEventListener('click',refresh);$('search').addEventListener('input',render);
$('clear-search').addEventListener('click',()=>{$('search').value='';render();});
$('slug').addEventListener('input',()=>{createKey=null;updatePreview();});$('destination').addEventListener('input',()=>{createKey=null;});
$('cancel-edit').addEventListener('click',resetForm);$('nav-create').addEventListener('click',()=>{resetForm();setView('links');$('destination').focus();});
for(const id of ['nav-qr','open-qr'])$(id).addEventListener('click',()=>openQR());
$('copy-result').addEventListener('click',()=>copy($('result-link').href));
$('check-publish').addEventListener('click',()=>{const url=$('check-publish').dataset.url;if(url)window.open(url,'_blank','noopener,noreferrer');});
$('export').addEventListener('click',()=>{
  const items=view==='legacy'?legacy:ownLinks;const cell=value=>`"${String(value).replace(/"/g,'""')}"`;
  const csv=['Name,Short link,Destination',...items.map(l=>[l.title,l.shortUrl,l.url].map(cell).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));const a=el('a');a.href=url;a.download='my-links.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
try{config=await api('/api/config',{auth:false});}
catch{$('source-status').textContent='The account service is unavailable. Original links are available in preview.';}
$('setup-notice').classList.toggle('hidden',config.authReady);
updatePreview();await refreshLegacy();await initializeAuth(config);
if(account()){view='links';await loadProfile();}else{$('source-status').textContent='Original QR links are preserved. Sign in for your personal library.';accountUI();render();}

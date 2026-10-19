const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Could not prepare this image.")),"image/png"));
const dataURL=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error("Could not read this image."));reader.readAsDataURL(blob);});
export async function preparePortrait(file){
 if(!file||file.size>5000000||!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Choose a JPG, PNG or WebP image under 5 MB.");
 let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw Error("This image could not be decoded. Try another JPG or PNG.");}
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width>8192||bitmap.height>8192||bitmap.width*bitmap.height>25000000)throw Error("Choose an image no larger than 25 megapixels.");
  const edge=Math.min(bitmap.width,bitmap.height),canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
  for(const limit of[256,192,128]){const size=Math.min(edge,limit);canvas.width=size;canvas.height=size;ctx.fillStyle="#fff";ctx.fillRect(0,0,size,size);ctx.drawImage(bitmap,(bitmap.width-edge)/2,(bitmap.height-edge)/2,edge,edge,0,0,size,size);const blob=await png(canvas);if(blob.size<=120000)return await dataURL(blob);}
  throw Error("This image is still too large. Choose a simpler portrait.");
 }finally{bitmap.close();}
}
export function mountPeoplePhoto({root,api,act,message,getState,onSaved,onBusy}){
 let generation=0,previewId=null,loadingId=null,busy=false;
 root.innerHTML=`<div class="people-photo-row"><img id="people-photo-preview" width="80" height="80" alt="Draft profile portrait" hidden><div><label for="people-photo-file">Profile photo</label><input id="people-photo-file" type="file" accept="image/jpeg,image/png,image/webp"><p class="field-hint">Centered square portrait. JPG, PNG or WebP, up to 5 MB.</p><button id="people-photo-remove" type="button" class="text-button">Remove draft photo</button><p id="people-photo-status" class="field-hint" role="status"></p></div></div>`;
 const $=id=>root.querySelector("#"+id);
 function update(){
  const {profile,canManage,dirty}=getState(),allowed=canManage||profile?.editable.includes("photoId");root.classList.toggle("hidden",!profile||profile.state==="disabled");
  $("people-photo-file").disabled=busy||dirty||!allowed;$("people-photo-remove").disabled=busy||dirty||!allowed||!profile?.content.photoId;$("people-photo-remove").dataset.locked=String($("people-photo-remove").disabled);
  $("people-photo-status").textContent=busy?"Preparing photo…":!allowed?"Your workspace owner manages this photo.":dirty?"Save your draft before changing the photo.":"Photo changes stay private until the card is published.";
  const id=profile?.content.photoId||null;
  if(!id){previewId=loadingId=null;$("people-photo-preview").removeAttribute("src");$("people-photo-preview").hidden=true;return;}
  if(id===previewId||id===loadingId)return;const ticket=generation,pid=profile.id;loadingId=id;
  api(`/api/people/${pid}/photo`).then(result=>{if(ticket!==generation||getState().profile?.id!==pid||getState().profile?.content.photoId!==id)return;previewId=id;$("people-photo-preview").src=result.dataURL;$("people-photo-preview").hidden=false;}).catch(e=>{if(ticket===generation&&getState().profile?.id===pid)$("people-photo-status").textContent=e.message;}).finally(()=>{if(loadingId===id)loadingId=null;});
 }
 async function mutate(method,file){
  const {profile,dirty}=getState();if(!profile||dirty)throw Error("Save the draft before changing its photo.");
  const ticket=generation,id=profile.id,version=profile.version;busy=true;onBusy(true);update();
  try{
   const body={version};if(method==="POST"){body.id=crypto.randomUUID();body.dataURL=await preparePortrait(file);}
   if(ticket!==generation||getState().profile?.id!==id)return;
   const result=await api(`/api/people/${id}/photo`,{method,body});if(ticket!==generation||getState().profile?.id!==id)return;
   await onSaved(result.profile);if(ticket===generation)message("Photo saved to draft. Publish the card to apply it publicly.");
  }finally{if(ticket===generation){busy=false;onBusy(false);$("people-photo-file").value="";update();}}
 }
 $("people-photo-file").onchange=act(()=>{const file=$("people-photo-file").files[0];if(file)return mutate("POST",file);});
 $("people-photo-remove").onclick=act(()=>mutate("DELETE"));
 return{update,reset(){generation++;busy=false;previewId=loadingId=null;onBusy(false);$("people-photo-file").value="";$("people-photo-preview").removeAttribute("src");$("people-photo-preview").hidden=true;$("people-photo-status").textContent="";root.classList.add("hidden");}};
}

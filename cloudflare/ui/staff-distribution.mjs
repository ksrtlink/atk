import {signatureHTML,signatureText,signatureDocument} from "../shared/staff-distribution.mjs";
import {qrOptions} from "./qr-core.mjs";
import {loadQRLibrary} from "./qr-builder.mjs";
const el=(tag,cls="",text="")=>Object.assign(document.createElement(tag),{className:cls,textContent:text});
const image=blob=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(Error("Could not render the QR image."));};img.src=url;});
const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("Could not export this image.")),"image/png"));
function fit(ctx,text,x,y,width,{size=44,min=24,lines=2,lineHeight=1.25,color="#1e1e1e",weight=400}={}){
 text=String(text||"");ctx.fillStyle=color;
 const wrap=()=>{let out=[],line="";for(const word of text.split(/\s+/)){if(ctx.measureText((line?line+" ":"")+word).width<=width)line+=(line?" ":"")+word;else{if(line)out.push(line);line=word;}}if(line)out.push(line);return out;};
 let output;for(;size>=min;size--){ctx.font=`${weight} ${size}px -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif`;output=wrap();if(output.length<=lines&&output.every(s=>ctx.measureText(s).width<=width))break;}
 output=output.slice(0,lines);for(let i=0;i<output.length;i++){let value=output[i];if(ctx.measureText(value).width>width||i===lines-1&&wrap().length>lines){const chars=[...value];while(chars.length&&ctx.measureText(chars.join("")+"…").width>width)chars.pop();value=chars.join("")+"…";}ctx.fillText(value,x,y+i*(size+1)*lineHeight);}return output.length*(size+1)*lineHeight;
}
export async function sharingCanvas(value,type){
 const QR=await loadQRLibrary(),qr=new QR(qrOptions({url:value.qrUrl,dots:"square",border:"square",center:"square",foreground:"#1e1e1e",background:"#ffffff",size:1024})),qrImage=await image(await qr.getRawData("png"));
 const canvas=document.createElement("canvas"),background=type==="background";canvas.width=background?1920:1004;canvas.height=background?1080:650;
 const ctx=canvas.getContext("2d");ctx.fillStyle=background?"#f3f3f2":"#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.textBaseline="top";
 const c=value.content;
 if(background){
  ctx.fillStyle="#ff5e1f";ctx.fillRect(80,800,64,5);
  let y=840;y+=fit(ctx,c.name,80,y,1180,{size:56,min:32,lines:2,weight:600})+12;
  fit(ctx,[c.title,c.organization].filter(Boolean).join(" · "),80,y,1180,{size:28,min:22,lines:2,color:"#52525b"});
  ctx.drawImage(qrImage,1500,680,340,340);fit(ctx,"View contact card",1510,1020,320,{size:20,min:18,lines:1,color:"#52525b"});
 }else{
  ctx.fillStyle="#ff5e1f";ctx.fillRect(58,58,60,5);let y=100;
  y+=fit(ctx,c.name,58,y,430,{size:48,min:30,lines:3,weight:650})+15;
  y+=fit(ctx,[c.title,c.organization].filter(Boolean).join(" · "),58,y,430,{size:28,min:22,lines:3,color:"#52525b"})+22;
  for(const text of[c.email,c.phone].filter(Boolean)){y+=fit(ctx,text,58,y,430,{size:23,min:18,lines:2})+12;}
  ctx.drawImage(qrImage,540,90,410,410);fit(ctx,"View contact card",570,505,350,{size:22,min:18,lines:1,color:"#52525b"});
  fit(ctx,new URL(value.publicUrl).host+new URL(value.publicUrl).pathname,58,580,880,{size:19,min:16,lines:1,color:"#52525b"});
 }
 return canvas;
}
function download(blob,name){const url=URL.createObjectURL(blob),a=el("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
let dialog,epoch=0,activeId=null,apiCall,notify,actCall,previewURL=null;
function reset(){epoch++;activeId=null;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;if(dialog){dialog.close();dialog.querySelector(".staff-sharing-preview").replaceChildren();}}
function mount(){dialog=el("dialog","staff-sharing-dialog");dialog.id="staff-sharing-dialog";dialog.setAttribute("aria-labelledby","staff-sharing-heading");dialog.innerHTML=`<div class="section-heading"><h2 id="staff-sharing-heading">Sharing assets</h2><button id="staff-sharing-close" class="text-button" aria-label="Close sharing assets">Close</button></div><p class="field-hint">Uses the approved public card. Downloaded files won’t update automatically.</p><label for="staff-sharing-type">Asset</label><select id="staff-sharing-type"><option value="card">Print card · 85 × 55 mm</option><option value="background">Meeting background · 1920 × 1080</option><option value="signature">Email signature</option></select><div class="staff-sharing-preview" aria-label="Sharing asset preview"></div><div class="action-row"><button id="staff-sharing-png" class="button primary">Download PNG</button><button id="staff-sharing-pdf" class="button secondary">Download print PDF</button><button id="staff-sharing-copy" class="button primary hidden">Copy signature</button><button id="staff-sharing-html" class="button secondary hidden">Download signature HTML</button></div><p id="staff-sharing-status" class="field-hint" role="status"></p>`;document.body.append(dialog);dialog.querySelector("#staff-sharing-close").onclick=reset;dialog.addEventListener("cancel",reset);document.addEventListener("tinytrail:clear-qr",reset);
 const $=id=>dialog.querySelector("#"+id);
 $("staff-sharing-type").onchange=()=>render().catch(e=>{$("staff-sharing-status").textContent=e.message;});
 for(const [id,kind]of[["staff-sharing-png","png"],["staff-sharing-pdf","pdf"],["staff-sharing-copy","copy"],["staff-sharing-html","html"]])$(id).onclick=event=>actCall(async()=>{
  const ticket=epoch,profileId=activeId,type=$("staff-sharing-type").value,value=await apiCall(`/api/people/${profileId}/distribution`);if(ticket!==epoch||profileId!==activeId)return;
  if(kind==="copy"){if(!navigator.clipboard?.write||!window.ClipboardItem)throw Error("Rich-text copying is unavailable here. Download and open the HTML signature instead.");await navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([signatureHTML(value)],{type:"text/html"}),"text/plain":new Blob([signatureText(value)],{type:"text/plain"})})]);notify("Signature copied. Paste it into your email signature settings.");return;}
  if(kind==="html"){download(new Blob([signatureDocument(value)],{type:"text/html;charset=utf-8"}),value.slug+"-signature.html");return;}
  const canvas=await sharingCanvas(value,kind==="pdf"?"card":type);if(ticket!==epoch)return;
  if(kind==="pdf"){const {contactCardPDF}=await import("./exports.mjs");if(ticket!==epoch)return;download(contactCardPDF(canvas.toDataURL("image/png")),value.slug+"-print-card.pdf");}
  else {const blob=await png(canvas);if(ticket!==epoch)return;download(blob,value.slug+(type==="background"?"-meeting-background.png":"-print-card.png"));}
 })(event);
}
async function render(){const ticket=++epoch,profileId=activeId,type=dialog.querySelector("#staff-sharing-type").value,status=dialog.querySelector("#staff-sharing-status");status.textContent="Preparing preview…";
 const value=await apiCall(`/api/people/${profileId}/distribution`);if(ticket!==epoch||profileId!==activeId)return;
 const box=dialog.querySelector(".staff-sharing-preview"),signature=type==="signature";for(const [id,show]of[["staff-sharing-png",!signature],["staff-sharing-pdf",type==="card"],["staff-sharing-copy",signature],["staff-sharing-html",signature]])dialog.querySelector("#"+id).classList.toggle("hidden",!show);
 if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;box.replaceChildren();
 if(signature){const preview=el("div","staff-signature-preview");preview.attachShadow({mode:"open"}).innerHTML=signatureHTML(value);box.append(preview);status.textContent="Text and links only. Paste the copied signature into your email settings and check its formatting.";}
 else{const canvas=await sharingCanvas(value,type);if(ticket!==epoch)return;const blob=await png(canvas);if(ticket!==epoch)return;previewURL=URL.createObjectURL(blob);const img=el("img");img.src=previewURL;img.alt=`${type==="card"?"Print card":"Meeting background"} for ${value.content.name}`;box.append(img);status.textContent=type==="card"?"PDF has an 85 × 55 mm page. Print at actual size; scan a sample before a full print run.":"Keep your video clear of the QR corner. Check the layout in your meeting app before sharing.";}
}
export async function openStaffSharing({id,api,act,message}){if(!dialog)mount();reset();activeId=id;apiCall=api;actCall=act;notify=message;dialog.querySelector("#staff-sharing-type").value="card";dialog.showModal();try{await render();}catch(e){reset();throw e;}}

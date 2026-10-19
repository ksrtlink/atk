const $=id=>document.getElementById(id);
const el=(tag,cls="",value="")=>Object.assign(document.createElement(tag),{className:cls,textContent:value});
export function mountResources({api,act,message,getState,onQR}) {
 let pages=[],selected=null,items=[],revisions=[],canPublish=false,generation=0,createId=null,dirty=false;
 const root=$("view-resources");
 root.innerHTML=`<div class="section-heading"><h2>Resource pages</h2><button id="resource-new" class="button primary">New page</button></div><p class="field-hint">Share a collection of links with one page and QR code.</p><div id="resource-list" class="resource-grid"></div><section id="resource-editor" class="box hidden" aria-labelledby="resource-heading"><div class="section-heading"><h2 id="resource-heading">New resource page</h2><button id="resource-close" class="text-button">Close editor</button></div><form id="resource-form"><div class="form-grid"><div><label for="resource-title">Page title</label><input id="resource-title" required maxlength="100" placeholder="Event resources"></div><div><label for="resource-slug">Page address</label><input id="resource-slug" required maxlength="64" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="event-resources"></div></div><label for="resource-description">Introduction (optional)</label><textarea id="resource-description" maxlength="500" rows="2"></textarea><div class="section-heading"><h3>Links</h3><button id="resource-add" class="button secondary" type="button">Add link</button></div><p class="field-hint">Add URLs approved for public sharing. Don’t include private documents or access tokens.</p><div id="resource-items"></div><div class="action-row"><button id="resource-save" class="button primary" type="submit">Save draft</button><span id="resource-dirty" class="field-hint"></span></div></form><div id="resource-publishing"><p id="resource-public-url" class="resource-address"></p><p id="resource-publish-note" class="field-hint"></p><label id="resource-consent-label" class="check"><input id="resource-consent" type="checkbox">I approve these links and page text for public sharing.</label><div class="action-row"><button id="resource-publish" class="button primary">Publish saved draft</button><button id="resource-unpublish" class="button secondary">Unpublish</button><button id="resource-qr" class="button secondary">Design page QR</button><button id="resource-copy" class="button secondary">Copy page URL</button></div></div><details class="resource-preview"><summary>Draft preview</summary><div id="resource-preview"></div></details><details id="resource-revisions"><summary>Revision history · latest 50</summary><div id="resource-history"></div></details><div id="resource-measurement"><h3>Page engagement</h3><label for="resource-report-days">Reporting period · UTC</label><select id="resource-report-days"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select><button id="resource-report-refresh" class="button secondary">Refresh</button><p id="resource-report" role="status"></p></div><p id="resource-error" class="form-error hidden" role="alert"></p></section>`;
 const content=()=>({title:$("resource-title").value.trim(),description:$("resource-description").value.trim(),items:items.map(item=>({...item}))});
 function state() {
  dirty=!selected||JSON.stringify(content())!==JSON.stringify(selected.content);
  $("resource-dirty").textContent=dirty?"Unsaved changes":"Draft saved";
  $("resource-save").disabled=!!selected&&!dirty;
  $("resource-publishing").classList.toggle("hidden",!selected||selected.state==="archived");
  $("resource-revisions").classList.toggle("hidden",!selected);
  $("resource-measurement").classList.toggle("hidden",!selected);
  $("resource-publish").classList.toggle("hidden",!canPublish);
  $("resource-unpublish").classList.toggle("hidden",!canPublish||selected?.state!=="published");
  $("resource-consent-label").classList.toggle("hidden",!canPublish);
  $("resource-publish").disabled=dirty||!$("resource-consent").checked||!items.length;
  $("resource-publish-note").textContent=!canPublish?"Only the workspace owner can publish this page.":dirty?"Save the draft before publishing. The current public version stays unchanged.":selected?.state==="published"?"Published. Republish to apply the saved draft.":"Private draft. Publishing makes the page and its links public.";
  $("resource-public-url").textContent=selected?.publicUrl||"";
  $("resource-qr").disabled=selected?.state!=="published";
  $("resource-copy").disabled=selected?.state!=="published";
  $("resource-add").disabled=items.length>=30;
  preview();
 }
 function preview() {
  const box=$("resource-preview");box.replaceChildren(el("h3","",$("resource-title").value||"Your page title"),el("p","",$("resource-description").value));
  for(const item of items) {const card=el("div","resource-preview-item");card.append(el("strong","",item.label||"Resource link"),el("p","",item.description||""),el("small","",item.url));box.append(card);}
 }
 function renderItems() {
  $("resource-items").replaceChildren();
  items.forEach((item,index)=>{
   const row=el("div","resource-item-editor"),fields=el("div","resource-item-fields");
   for(const [key,label,max] of [["label","Link label",100],["url","Website URL",4096],["description","Description (optional)",180]]) {
    const wrap=el("div"),l=el("label","",label),input=el("input");input.id=`resource-item-${item.id}-${key}`;l.htmlFor=input.id;input.value=item[key];input.maxLength=max;input.required=key!=="description";input.type=key==="url"?"url":"text";input.dataset.resourceField=key;input.oninput=()=>{item[key]=input.value;$("resource-consent").checked=false;state();};wrap.append(l,input);fields.append(wrap);
   }
   const actions=el("div","action-row");
   for(const [label,disabled,run] of [["Move up",index===0,()=>{[items[index-1],items[index]]=[items[index],items[index-1]];}],["Move down",index===items.length-1,()=>{[items[index+1],items[index]]=[items[index],items[index+1]];}],["Remove",false,()=>{items.splice(index,1);}]]){
    const b=el("button","text-button",label);b.type="button";b.disabled=disabled;b.onclick=()=>{run();$("resource-consent").checked=false;renderItems();state();};actions.append(b);
   }
   row.append(fields,actions);$("resource-items").append(row);
  });
 }
 function show(page=null,history=[]) {
  selected=page;revisions=history;createId=page?.id||crypto.randomUUID();
  items=page?structuredClone(page.content.items):[{id:crypto.randomUUID(),label:"",url:"",description:""}];
  $("resource-title").value=page?.content.title||"";$("resource-slug").value=page?.slug||"";$("resource-slug").disabled=!!page;
  $("resource-description").value=page?.content.description||"";$("resource-consent").checked=false;
  $("resource-heading").textContent=page?"Edit resource page":"New resource page";
  $("resource-editor").classList.remove("hidden");$("resource-error").classList.add("hidden");
  $("resource-form").classList.toggle("hidden",page?.state==="archived");
  $("resource-history").replaceChildren();
  for(const rev of revisions){const row=el("div","list-item"),label=el("span","",`Version ${rev.version} · ${rev.action.replaceAll("_"," ")} · ${new Date(rev.createdAt).toLocaleString()}`),b=el("button","button secondary","Restore draft");b.disabled=page?.state==="archived";b.onclick=act(async()=>{if(dirty)throw Error("Save your current draft before restoring a revision.");await change("restore",{revision:rev.version});});row.append(label,b);$("resource-history").append(row);}
  renderItems();state();
 }
 async function open(id) {
  const ticket=generation,r=await api("/api/resources/"+id);if(ticket!==generation)return;show(r.page,r.revisions);await report();
 }
 function renderList() {
  $("resource-list").replaceChildren();
  if(!pages.length)$("resource-list").append(el("p","box","No resource pages yet. Create your first page."));
  for(const page of pages) {
   const card=el("article","box resource-card");card.append(el("h3","",page.content.title),el("p","field-hint",page.state==="published"?(JSON.stringify(page.content)!==JSON.stringify(page.publishedContent)?"Published · draft changes":"Published"):page.state==="archived"?"Archived":"Private draft"),el("p","resource-address",page.publicUrl));
   const actions=el("div","action-row"),edit=el("button","button secondary",page.state==="archived"?"History":"Edit");edit.onclick=act(()=>open(page.id));actions.append(edit);
   if(page.state==="published"){const qr=el("button","button secondary","QR code");qr.onclick=act(()=>onQR(page.publicUrl));actions.append(qr);}
   if(canPublish){const archive=el("button","text-button",page.state==="archived"?"Restore page":"Archive");archive.onclick=act(async()=>{await api(`/api/resources/${page.id}${page.state==="archived"?"/activate":""}`,{method:page.state==="archived"?"POST":"DELETE",body:{version:page.version}});if(selected?.id===page.id){selected=null;$("resource-editor").classList.add("hidden");}await refresh();message(page.state==="archived"?"Page restored as a private draft.":"Page archived. Its public address is inactive.");});actions.append(archive);}
   card.append(actions);$("resource-list").append(card);
  }
 }
 async function refresh() {const ticket=generation,r=await api("/api/resources");if(ticket!==generation)return;pages=r.pages;canPublish=r.canPublish;$("resource-new").disabled=pages.filter(p=>p.state!=="archived").length>=r.limit;renderList();if(selected)state();}
 async function change(action,extra={}) {
  if(!selected)return;
  const id=selected.id,ticket=generation;
  await api(`/api/resources/${id}/${action}`,{method:"POST",body:{version:selected.version,...extra}});
  if(ticket!==generation)return;await refresh();await open(id);
 }
 async function report() {
  if(!selected)return;const ticket=generation,id=selected.id;
  $("resource-report").textContent="Loading engagement…";
  try{const r=await api(`/api/resources/${id}/report?days=${$("resource-report-days").value}`);if(ticket!==generation||selected?.id!==id)return;$("resource-report").textContent=!r.coverage.trackingSince?"Not measured. The workspace owner can enable measurement in Analytics.":`${r.pageViews} page requests · ${r.resourceClicks} resource clicks · UTC. ${(!r.coverage.workspaceEnabled||!r.coverage.collection)?"Measurement is currently off. ":""}Counts cover enabled periods only and represent HTTP requests, not unique people. Measurement began ${new Date(r.coverage.trackingSince).toLocaleDateString()}.`;}
  catch(e){if(ticket===generation)$("resource-report").textContent=e.message;}
 }
 $("resource-new").onclick=()=>show();
 $("resource-close").onclick=()=>{$("resource-editor").classList.add("hidden");selected=null;items=[];};
 $("resource-add").onclick=()=>{items.push({id:crypto.randomUUID(),label:"",url:"",description:""});renderItems();state();};
 for(const id of ["resource-title","resource-description"])$(id).oninput=()=>{$("resource-consent").checked=false;state();};
 $("resource-consent").onchange=state;
 $("resource-form").onsubmit=async e=>{
  e.preventDefault();const ticket=generation;$("resource-save").disabled=true;
  try{const r=await api(selected?`/api/resources/${selected.id}`:"/api/resources",{method:selected?"PATCH":"POST",body:{id:createId,slug:$("resource-slug").value,content:content(),...(selected?{version:selected.version}:{})}});if(ticket!==generation)return;await refresh();await open(r.page.id);message("Private draft saved.");}
  catch(e){if(ticket===generation){$("resource-error").textContent=e.message;$("resource-error").classList.remove("hidden");}}
  finally{if(ticket===generation)state();}
 };
 $("resource-publish").onclick=act(async()=>{if(dirty)throw Error("Save the draft first.");await change("publish",{confirmPublic:$("resource-consent").checked});message("Page published.");});
 $("resource-unpublish").onclick=act(async()=>{await change("unpublish");message("Page is now private. Its public URL is inactive.");});
 $("resource-qr").onclick=act(()=>onQR(selected.publicUrl));
 $("resource-copy").onclick=act(async()=>{await navigator.clipboard.writeText(selected.publicUrl);message("Page URL copied.");});
 $("resource-report-refresh").onclick=act(report);$("resource-report-days").onchange=act(report);
 function reset(){generation++;pages=[];selected=null;items=[];revisions=[];createId=null;$("resource-list").replaceChildren();$("resource-form").reset();$("resource-editor").classList.add("hidden");$("resource-items").replaceChildren();$("resource-preview").replaceChildren();$("resource-history").replaceChildren();$("resource-public-url").textContent="";$("resource-report").textContent="";}
 return {refresh,reset};
}

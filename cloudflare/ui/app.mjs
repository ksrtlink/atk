import {signInURL} from './auth-navigation.mjs';
import { mountCampaignBuilder } from "./utm.mjs";
import { validateSlug, validateURL } from "./core.mjs";
import {
  initializeAuth,
  account,
  onAccountChange,
  signIn,
  signUp,
  signOut,
  sendVerification,
  resetPassword,
  token,
} from "./auth.mjs";
const $ = (id) => document.getElementById(id);
let analyticsView = null;
let resourcesView = null;
let peopleView = null;
let activityView = null;
let healthSummaries = new Map();
let creatorHidden = false;
try { creatorHidden = localStorage.getItem("tinytrail.creator-hidden") === "true"; } catch {}
export const node = (tag, cls = "", value = "") =>
  Object.assign(document.createElement(tag), {
    className: cls,
    textContent: value,
  });
let config,
  me = null,
  workspace = null,
  links = [],
  deletedLinks = [],
  designs = [],
  presets = [],
  editing = null,
  view = "links",
  epoch = 0,
  register = false,
  busy = false,
  createKey = null,
  bulk = null;
const linkCampaign = mountCampaignBuilder($("link-utm"), {prefix:"link-utm",getURL:()=>$("destination").value,onChange:()=>{createKey=null;}});
export function message(value) {
  $("toast").textContent = value;
  $("toast").classList.remove("hidden");
  clearTimeout(message.timer);
  message.timer = setTimeout(() => $("toast").classList.add("hidden"), 4500);
}
function error(value = "") {
  $("app-error").textContent = value;
  $("app-error").classList.toggle("hidden", !value);
}
export async function api(
  path,
  { method = "GET", body, auth = true, key, responseType = "json" } = {},
) {
  const uid = account()?.uid,
    wid = workspace?.id,
    headers = { Accept: "application/json" };
  if (auth) headers.Authorization = `Bearer ${await token()}`;
  if (wid) headers["X-Workspace-Id"] = wid;
  if (body) headers["Content-Type"] = "application/json";
  if (key) headers["Idempotency-Key"] = key;
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw Error(
      "Connection interrupted. Refresh or resume to confirm saved results.",
    );
  }
  const data =
    response.ok && responseType === "blob"
      ? await response.blob()
      : await response.json();
  if (auth && (uid !== account()?.uid || wid !== workspace?.id))
    throw Error("The account or company changed. Reopen this view.");
  if (!response.ok) {
    const e = Error(data.error || "The request failed.");
    e.code = data.code;
    if (e.code === "membership") {
      workspace = null;
      clearLibrary();
      ui();
    }
    throw e;
  }
  return data;
}
export function act(fn) {
  return async (event) => {
    error();
    const button = event?.currentTarget;
    if (button?.tagName === "BUTTON") button.disabled = true;
    try {
      await fn(event);
    } catch (e) {
      error(e.message);
    } finally {
      if (button?.isConnected)
        button.disabled = button.dataset.locked === "true";
    }
  };
}
function clearLibrary() {
  healthSummaries.clear();
  links = [];
  deletedLinks = [];
  $("link-status").value = "active";
  designs = [];
  presets = [];
  editing = null;
  createKey = null;
  $("link-form").reset();
  linkCampaign.reset();
  $("slug").disabled = false;
  $("form-heading").textContent = "Create a link or QR code.";
  $("submit").textContent = "Shorten link";
  $("cancel-edit").classList.add("hidden");
  $("result").classList.add("hidden");
  $("links").replaceChildren();
  $("designs").replaceChildren();
  $("members").replaceChildren();
  $("presets").replaceChildren();
  $("admin-requests").replaceChildren();
  $("admin-legacy").replaceChildren();
  $("invite-url").value = "";
  $("invite-url").classList.add("hidden");
  $("invite-copy").classList.add("hidden");
  $("invite-result").textContent = "";
  $("transfer-items").replaceChildren();
  $("transfer-confirm").checked = false;
  document.dispatchEvent(new Event("tinytrail:clear-qr"));
  $("qr-resume").classList.add("hidden");
  $("qr-dialog")?.close();
  for (const id of ["qr-url", "qr-design-title", "qr-preset-name"])
    if ($(id)) $(id).value = "";
  for (const id of [
    "qr-preview",
    "qr-preview-url",
    "qr-tracked-url",
    "qr-tracking-note",
    "qr-preset-select",
    "qr-saved",
  ])
    $(id)?.replaceChildren();
  bulk?.reset();
  resourcesView?.reset();
  peopleView?.reset();
  activityView?.reset();
  analyticsView?.reset();
}
let requestCompany = false;
function ui() {
  const personal = workspace?.kind === "personal";
  $("activity-nav").classList.toggle("hidden", !workspace || workspace.role!=="owner");
  if(workspace?.role!=="owner"){activityView?.reset();if(view==="activity")view="links";}
  const user = account();
  $("connect").textContent = user?.email || "Sign in with email";
  $("account-top").textContent = user ? "My account" : "Sign in";
  $("auth-signedin").classList.toggle("hidden", !user);
  $("auth-signedout").classList.toggle("hidden", !!user);
  $("auth-heading").textContent = user ? "Your account" : "Welcome to Tinytrail.";
  $("auth-current-email").textContent = user?.email || "";
  $("auth-verified-note").textContent = me
    ? "Email verified. Your library is private."
    : "Verify your email, then refresh verification to continue.";
  $("auth-check").classList.toggle("hidden", !!me);
  $("auth-resend").classList.toggle("hidden", !!me);
  $("access-refresh").classList.toggle("hidden", !me || !!workspace);
  $("member-content").classList.toggle("hidden", !workspace);
  $("admin-nav").classList.toggle("hidden", !me?.platformAdmin);
  $("access-panel").classList.toggle(
    "hidden",
    !requestCompany || !!me?.accessRequest,
  );
  $("access-form").classList.toggle("hidden", !me);
  $("access-status").textContent = me?.accessRequest
    ? `Your request is ${me.accessRequest.status}.`
    : "";
  $("notice").textContent = !user
    ? "Sign in to open your private library."
    : !me
      ? "Verify your email to continue."
      : !workspace
        ? me.accessRequest
          ? `Company access: ${me.accessRequest.status}. Refresh after your administrator approves the request.`
          : "Request a company workspace, or accept an invitation from your owner."
        : personal && me?.accessRequest?.status === "pending" ? "Your personal workspace is ready. Company access: pending approval." : "";
  $("workspace-label").textContent = workspace?.name || "Your workspace";
  $("page-title").textContent = !workspace ? "Links & QR codes." : personal ? "Your personal links & QR codes." : "Your company’s links & QR codes.";
  $("workspace-description").textContent = personal ? "Private links and QR designs. Ready to share when you are." : "Consistent links. Considered QR codes. Ready for the real world.";
  $("assigned-company").querySelector(".company-context-label").textContent = personal ? "Your private library" : "Your company";
  $("library-contexts").classList.toggle("hidden", !workspace || !me?.workspaces.length);
  $("personal-open").setAttribute("aria-pressed", String(personal));
  $("company-open").setAttribute("aria-pressed", String(!personal));
  $("team-upgrade").classList.toggle("hidden", !personal || !!me?.workspaces.length);
  $("personal-account-note").classList.toggle("hidden", !personal);
  $("company-members-box").classList.toggle("hidden", personal);
  document.querySelector('[data-view="team"] .nav-label').textContent = personal ? "QR presets" : "Company & team";
  document.querySelector('#view-links h2').firstChild.nodeValue = personal ? "Your links " : "Company links ";
  document.querySelector('[data-view="team"] use').setAttribute("href", `/manage/icons.svg#${personal ? "qr-code" : "users"}`);
  $("presets-note").textContent = personal ? "Styles saved here are private to your account." : "Styles saved here are shared with your company.";
  const switchable = !personal && !!me?.canSwitchCompanies;
  $("company-switcher").classList.toggle("hidden", !switchable);
  $("assigned-company").classList.toggle("hidden", !workspace || switchable);
  $("assigned-company-name").textContent = workspace?.name || "";
  $("assigned-company-role").textContent = workspace ? (personal ? "Only you have access" : workspace.role === "owner" ? "Company owner" : "Team member") : "";
  if (me?.companyAccessIssue) {
    $("notice").textContent = "Your company assignment needs review. Contact the platform administrator.";
    $("access-form").classList.add("hidden");
  }
  for (const item of document.querySelectorAll(".enterprise-nav button"))
    item.title = item.querySelector(".nav-label")?.textContent.trim() || "";
  $("open-qr").disabled = !workspace;
  $("creator-panel").classList.toggle("hidden", !workspace || !["links","designs"].includes(view) || creatorHidden);
  $("creator-toggle").classList.toggle("hidden", !workspace || !["links","designs"].includes(view));
  $("creator-toggle").textContent = creatorHidden ? "Show creation panel" : "Hide creation panel";
  $("creator-toggle").setAttribute("aria-expanded", String(!creatorHidden));
  $("transfer-panel").classList.toggle(
    "hidden",
    !workspace ||
      !((me?.legacyCounts.links || 0) + (me?.legacyCounts.designs || 0)),
  );
  $("transfer-summary").textContent =
    `${me?.legacyCounts.links || 0} previous links and ${me?.legacyCounts.designs || 0} previous QR designs are available to transfer into ${workspace?.name || "your workspace"}.`;
  $("transfer-privacy").textContent = personal ? "Imported items stay private to you. Their URLs will stay the same." : "Transferred items will be visible and editable by all members of this company. Their URLs will stay the same.";
  $("transfer-confirm-label").textContent = personal ? " I confirm importing these items into my private library." : " I confirm sharing these items with my assigned company.";
  $("transfer-submit").textContent = personal ? "Import into personal library" : "Transfer to company";
  $("preview").textContent = editing
    ? editing.shortUrl
    : `${config?.publicOrigin || location.origin}/r/${$("slug").value || "your-name"}`;
  for (const name of ["links", "designs", "resources", "people", "bulk", "team", "admin", "analytics", "activity"])
    $("view-" + name).classList.toggle(
      "hidden",
      view !== name || (name === "admin" ? !me?.platformAdmin : !workspace),
    );
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
    b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false");
  });
}
function render() {
  const query = $("search").value.toLowerCase();
  $("links").replaceChildren();
  const trash = $("link-status").value === "trash";
  const visibleLinks = trash ? deletedLinks : links;
  $("list-count").textContent = visibleLinks.length;
  $("empty").classList.toggle("hidden", !!visibleLinks.length);
  $("empty").textContent = trash ? "Trash is empty." : "No links yet. Create your first link.";
  $("export").disabled = trash;
  for (const link of visibleLinks.filter((l) =>
    `${l.title} ${l.url} ${l.slug}`.toLowerCase().includes(query),
  )) {
    const row = node("article", "link-row"),
      body = node("div", "link-body"),
      a = node("a", "short-link", link.shortUrl.replace(/^https?:\/\//, ""));
    if (!trash) a.href = link.shortUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    body.append(
      node("h3", "", link.title),
      a,
      node("span", "destination", link.url),
    );
    const actions = node("div", "row-actions");
    const restoreLink = async () => {
      await api("/api/links/" + link.slug + "/restore", {method:"POST",body:{version:link.version}});
      await refreshLibrary();
      message("Link restored.");
    };
    const deleteLink = () => confirmDelete(link);
    const monitored=healthSummaries.get(link.slug),healthLabel=!monitored?.enabled?"Health":monitored.stale||monitored.pending?"Health · pending":monitored.broken?"Health · issue":monitored.blocked||monitored.unreachable||monitored.unknown?"Health · review":"Health · OK";
    const monitorAction=()=>config.features?.linkHealth&&!link.legacy?[[healthLabel,async()=>{const {openHealth}=await import("./health.mjs");await openHealth({link,request:api,onRefresh:refreshLibrary});}]]:[];
    for (const [label, fn] of (trash ? [["Restore", restoreLink],...monitorAction()] : [
      ["QR", () => openQR(link.shortUrl)],
      [
        "Copy",
        () =>
          navigator.clipboard
            .writeText(link.shortUrl)
            .then(() => message("Link copied.")),
      ],
      [
        "Edit",
        () => {
          creatorHidden = false;
          linkCampaign.reset();
          editing = link;
          $("slug").value = link.slug;
          $("slug").disabled = true;
          $("destination").value = link.url;
          $("form-heading").textContent = "Update the destination.";
          $("submit").textContent = "Save destination";
          $("cancel-edit").classList.remove("hidden");
          ui();
          $("destination").focus();
        },
      ],
      ...monitorAction(),
      ...(!link.legacy ? [["Rules",async()=>{const {openRouting}=await import("./routing.mjs");await openRouting({link,request:api,onSaved:refreshLibrary});}],["Delete", deleteLink]] : []),
    ])) {
      const button = node("button", label === "Delete" ? "danger" : "", label);
      button.onclick = act(fn);
      actions.append(button);
    }
    row.append(node("span", "link-index", "↗"), body, actions);
    $("links").append(row);
  }
  $("designs").replaceChildren();
  if (!designs.length)
    $("designs").append(
      node(
        "p",
        "box",
        "No QR codes yet. Create one from any URL.",
      ),
    );
  for (const d of designs) {
    const row = node("article", "design-row"),
      body = node("div");
    body.append(node("h3", "", d.title), node("p", "", d.url));
    body.append(
      node(
        "small",
        "field-hint",
        d.trackedQrId ? "Tracked QR URL" : "Static QR: no QR-specific tracking",
      ),
    );
    const b = node("button", "button secondary", "Open designer");
    b.onclick = act(() => openQR(d.url, d));
    row.append(body, b);
    $("designs").append(row);
  }
}
async function load() {
  const ticket = ++epoch;
  error();
  clearLibrary();
  me = null;
  workspace = null;
  ui();
  if (!account()) return;
  try {
    const result = await api("/api/me");
    if (ticket !== epoch) return;
    me = result;
    const invite = new URLSearchParams(location.hash.slice(1)).get("invite");
    if (invite) {
      const accepted = await api("/api/invitations/accept", {
        method: "POST",
        body: { token: invite },
      });
      sessionStorage.setItem("tinytrail.workspace", accepted.workspaceId);
      history.replaceState(null, "", location.pathname);
      me = await api("/api/me");
      message("Invitation accepted. Welcome to your company.");
    }
    $("workspace-select").replaceChildren();
    for (const w of me.workspaces)
      $("workspace-select").append(new Option(w.name, w.id));
    if (!me.workspaces.length)
      $("workspace-select").append(new Option("No approved company", ""));
    const available = [me.personalWorkspace, ...me.workspaces].filter(Boolean);
    workspace = available.find(w => w.id === sessionStorage.getItem("tinytrail.workspace")) || me.workspaces.find(w => w.id === me.assignedWorkspaceId) || me.workspaces[0] || me.personalWorkspace;
    if (workspace) $("workspace-select").value = workspace.id;
    ui();
    if (workspace) { await refreshLibrary(); await resumeCreateDraft(); }
  } catch (e) {
    if (ticket !== epoch) return;
    error(e.message);
    ui();
  }
}
async function resumeCreateDraft() {
  const raw = sessionStorage.getItem("tinytrail.create-draft");
  if (!raw) return;
  sessionStorage.removeItem("tinytrail.create-draft");
  try {
    const draft = JSON.parse(raw);
    if (!["link","qr"].includes(draft.tool) || !Number.isFinite(draft.createdAt) || Date.now()-draft.createdAt > 30*60*1000 || draft.createdAt > Date.now()) return;
    const url = validateURL(draft.url);
    if (draft.tool === "qr") await openQR(url);
    else { await setView("links"); $("destination").value=url; $("slug").focus(); }
  } catch { message("Start again with a valid website URL."); }
}
async function refreshLibrary() {
  if (!workspace) return;
  const ticket = epoch;
  const [a, b, c, h] = await Promise.all([
    api("/api/links"),
    api("/api/designs"),
    api("/api/presets"),
    config.features?.linkHealth?api("/api/link-health"):Promise.resolve({monitors:[]}),
  ]);
  if (ticket !== epoch) return;
  links = a.links;
  deletedLinks = a.deletedLinks || [];
  designs = b.designs;
  presets = c.presets;
  healthSummaries=new Map(h.monitors.map(m=>[m.slug,m]));
  render();
  const info = await api("/api/workspace");
  $("allowance").textContent =
    `${links.length} / ${info.limits.links} ${workspace.kind === "personal" ? "personal" : "company"} links · ${designs.length} / ${info.limits.designs} saved QR designs`;
  await renderTeam(info);
  if (bulk) await bulk.refresh();
}
async function renderTeam(info) {
  $("members").replaceChildren();
  for (const member of info.members) {
    const row = node("div", "list-item"),
      body = node("div", "", member.email);
    body.append(node("small", "", member.role));
    row.append(body);
    if (workspace.role === "owner" && member.uid !== account().uid) {
      const b = node("button", "button secondary", "Remove");
      b.onclick = act(async () => {
        await api("/api/members", {
          method: "DELETE",
          body: { uid: member.uid },
        });
        await refreshLibrary();
      });
      row.append(b);
    }
    $("members").append(row);
  }
  $("invite-form").classList.toggle("hidden", workspace.role !== "owner" || workspace.kind === "personal");
  $("presets").replaceChildren();
  for (const p of presets)
    $("presets").append(node("div", "list-item", p.name));
  if (!presets.length) $("presets").textContent = "No saved presets yet.";
}
async function openQR(url = "", design = null, {staticOnly=false} = {}) {
  if (!workspace)
    throw Error("Sign in and verify your email before creating QR codes.");
  const { openQRBuilder } = await import("./qr-builder.mjs");
  const asset = design?.trackedQrId
    ? (await api("/api/tracked-qrs/" + design.trackedQrId)).asset
    : null;
  const wid = workspace.id,
    uid = account().uid;
  let saved = {
    id: design?.id || crypto.randomUUID(),
    version: design?.version,
  };
  await openQRBuilder({
    url,
    links,
    design,
    asset,
    trackingAvailable: !staticOnly && !!config.features?.trackedQR,
    onVisibility: state => {
      $("qr-resume").classList.toggle("hidden", state !== "minimized" || wid !== workspace?.id || uid !== account()?.uid);
    },
    onPrepare: async (value) => {
      if (wid !== workspace?.id || uid !== account()?.uid)
        throw Error("The company changed. Reopen the designer.");
      const link = links.find((l) => l.shortUrl === value.url);
      const body = {
        ...(link ? { linkSlug: link.slug } : { destination: value.url }),
        title: value.title,
      };
      return (
        await api(
          "/api/tracked-qrs" + (value.asset ? "/" + value.asset.id : ""),
          {
            method: value.asset ? "PATCH" : "POST",
            body: {
              ...body,
              ...(value.asset
                ? { version: value.asset.version, state: "active" }
                : { id: value.id }),
            },
          },
        )
      ).asset;
    },
    onSave: async (value) => {
      if (wid !== workspace?.id || uid !== account()?.uid)
        throw Error("The company changed. Reopen the designer.");
      const r = await api("/api/designs", {
        method: "POST",
        body: { ...value, ...saved },
      });
      saved = { id: r.design.id, version: r.design.version };
      await refreshLibrary();
    },
    presets,
    onPreset: async (value) => {
      await api("/api/presets", { method: "POST", body: value });
      await refreshLibrary();
    },
  });
}
function openAccount() {
  if (!config?.authReady)
    throw Error("Email accounts are temporarily unavailable.");
  ui();
  if(!account()){location.assign(signInURL(location.pathname+location.search+location.hash));return;}
  $("account-dialog").showModal();
}
async function adminView() {
  if (!me?.platformAdmin) return;
  const [r, l] = await Promise.all([
    api("/api/admin/requests"),
    api("/api/legacy"),
  ]);
  $("admin-requests").replaceChildren();
  if (!r.requests.length) $("admin-requests").textContent = "No requests yet.";
  for (const item of r.requests) {
    const row = node("div", "list-item"),
      body = node("div", "", item.company);
    body.append(
      node("small", "", `${item.email} · ${item.status}`),
      node("p", "", item.use_case),
      node("small", "", item.website),
    );
    row.append(body);
    if (item.status === "pending") {
      const actions = node("div", "action-row");
      for (const action of ["approve", "decline"]) {
        const b = node(
          "button",
          "button secondary",
          action === "approve" ? "Approve company" : "Decline",
        );
        b.onclick = act(async () => {
          await api("/api/admin/requests/" + encodeURIComponent(item.uid), {
            method: "POST",
            body: { action },
          });
          await adminView();
        });
        actions.append(b);
      }
      row.append(actions);
    }
    $("admin-requests").append(row);
  }
  $("admin-legacy").replaceChildren();
  for (const link of l.links) {
    const row = node("div", "list-item"),
      body = node("div", "", link.title),
      a = node("a", "", link.shortUrl);
    a.href = link.shortUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    body.append(node("small", "", link.url), a);
    const b = node("button", "button secondary", "QR");
    b.onclick = act(() => openQR(link.shortUrl));
    row.append(body, b);
    $("admin-legacy").append(row);
  }
}
async function setView(next) {
  view = next;
  ui();
  if (next === "admin") await adminView();
  if (next === "analytics" && workspace) {
    if (!analyticsView) {
      const { mountAnalytics } = await import("./analytics.mjs");
      analyticsView = mountAnalytics({
        api,
        act,
        message,
        getState: () => ({ workspace, links, designs }),
      });
    }
    await analyticsView.refresh();
  }
  if (next === "activity" && workspace?.role==="owner") {
    if(!activityView){const {mountActivity}=await import("./activity.mjs");activityView=mountActivity({api,act,getState:()=>({user:me?.user,workspace})});}
    await activityView.refresh();
  }
  if (next === "people" && workspace) {
    if (!peopleView) {const {mountPeople}=await import("./people.mjs");peopleView=mountPeople({api,act,message,onQR:url=>openQR(url,null,{staticOnly:true})});}
    await peopleView.refresh();
  }
  if (next === "resources" && workspace) {
    if (!resourcesView) {
      const {mountResources}=await import("./resources.mjs");
      resourcesView=mountResources({api,act,message,getState:()=>({workspace}),onQR:url=>openQR(url,null,{staticOnly:true})});
    }
    await resourcesView.refresh();
  }
  if (next === "bulk" && workspace) {
    if (!bulk) {
      const { mountBulk } = await import("./bulk.mjs");
      bulk = await mountBulk({
        api,
        act,
        message,
        getState: () => ({
          workspace,
          links,
          designs,
          presets,
          features: config.features,
        }),
        onChange: refreshLibrary,
      });
    }
    await bulk.refresh();
  }
}
for (const b of document.querySelectorAll("[data-view]"))
  b.onclick = act(() => setView(b.dataset.view));
for (const id of ["connect", "account-top"]) $(id).onclick = act(openAccount);
$("auth-close").onclick = () => $("account-dialog").close();
$("auth-signout").onclick = () => {
  sessionStorage.removeItem("tinytrail.create-draft");
  signOut();
  $("account-dialog").close();
  document.body.classList.add("auth-pending");
  location.assign("/");
};
onAccountChange(() => {
  epoch++;
  me = null;
  workspace = null;
  clearLibrary();
  $("workspace-select").replaceChildren(new Option("No company selected", ""));
  $("view-admin").classList.add("hidden");
  ui();
});
for (const [id, value] of [
  ["auth-login-tab", false],
  ["auth-register-tab", true],
])
  $(id).onclick = () => {
    register = value;
    $("auth-submit").textContent = value ? "Create account" : "Sign in";
    $("auth-login-tab").classList.toggle("active", !value);
    $("auth-register-tab").classList.toggle("active", value);
  };
$("auth-form").onsubmit = act(async (e) => {
  e.preventDefault();
  const password = $("auth-password").value;
  $("auth-password").value = "";
  $("auth-submit").disabled = true;
  try {
    await (register ? signUp : signIn)($("auth-email").value.trim(), password);
    if (register) {
      $("auth-message").textContent =
        "Check your inbox for the verification email.";
      $("auth-message").classList.remove("hidden");
    }
    await load();
    if (me) $("account-dialog").close();
  } catch (e) {
    $("auth-error").textContent = e.message;
    $("auth-error").classList.remove("hidden");
  } finally {
    $("auth-submit").disabled = false;
  }
});
$("auth-check").onclick = act(async () => {
  await token(true);
  await load();
  if (me) $("account-dialog").close();
});
$("auth-resend").onclick = act(async () => {
  await sendVerification();
  message("Verification email sent.");
});
$("auth-reset").onclick = act(async () => {
  await resetPassword($("auth-email").value.trim());
  message("If this account exists, a reset email is on its way.");
});
$("workspace-select").onchange = act(async () => {
  if (!me?.canSwitchCompanies) return;
  epoch++;
  workspace =
    me.workspaces.find((w) => w.id === $("workspace-select").value) || null;
  sessionStorage.setItem("tinytrail.workspace", workspace?.id || "");
  clearLibrary();
  ui();
  await refreshLibrary();
  if (view === "admin") await adminView();
});
async function changeContext(next) {
  if (!next) return;
  epoch++;
  workspace = next;
  sessionStorage.setItem("tinytrail.workspace", next.id);
  clearLibrary();
  ui();
  await refreshLibrary();
  await setView(view === "admin" ? "links" : view);
}
$("personal-open").onclick = act(() => changeContext(me?.personalWorkspace));
$("company-open").onclick = act(() => changeContext(me?.workspaces.find(w => w.id === me.assignedWorkspaceId) || me?.workspaces[0]));
$("request-company").onclick = () => { $("account-dialog").close(); requestCompany = !requestCompany; ui(); if (requestCompany) $("access-panel").scrollIntoView({block:"start",behavior:"smooth"}); };
$("access-refresh").onclick = act(load);
$("access-form").onsubmit = act(async (e) => {
  e.preventDefault();
  await api("/api/access-requests", {
    method: "POST",
    body: {
      company: $("company-name").value,
      website: $("company-website").value,
      useCase: $("company-use").value,
    },
  });
  await load();
  message("Request received. Your company is awaiting approval.");
});
$("invite-form").onsubmit = act(async (e) => {
  e.preventDefault();
  const r = await api("/api/invitations", {
    method: "POST",
    body: { email: $("invite-email").value },
  });
  $("invite-url").value = r.url;
  $("invite-url").classList.remove("hidden");
  $("invite-copy").classList.remove("hidden");
  $("invite-result").textContent =
    "Share this link with the invited colleague. It expires in seven days and requires their verified email.";
});
$("invite-copy").onclick = act(async () => {
  await navigator.clipboard.writeText($("invite-url").value);
  message("Invitation copied.");
});
$("transfer-preview").onclick = act(async () => {
  const r = await api("/api/transfer");
  $("transfer-items").replaceChildren();
  for (const item of [...r.links, ...r.designs])
    $("transfer-items").append(
      node("p", "", `${item.title} — ${item.shortUrl || item.url}`),
    );
  $("transfer-items").classList.remove("hidden");
});
$("transfer-submit").onclick = act(async () => {
  if (!$("transfer-confirm").checked)
    throw Error(
      "Confirm that these items will be shared with your selected company.",
    );
  await api("/api/transfer", { method: "POST", body: { confirm: true } });
  await load();
  message("Previous library transferred. URLs remain unchanged.");
});
$("link-form").onsubmit = act(async (e) => {
  e.preventDefault();
  if (busy) return;
  busy = true;
  $("submit").disabled = true;
  try {
    const body = {
      slug: validateSlug($("slug").value || crypto.randomUUID().replaceAll("-", "").slice(0, 8)),
      destination: validateURL(linkCampaign.build()),
      ...(editing ? { version: editing.version } : {}),
    };
    if (!$("slug").value) $("slug").value = body.slug;
    createKey ||= crypto.randomUUID();
    const r = await api(editing ? "/api/links/" + editing.slug : "/api/links", {
      method: editing ? "PATCH" : "POST",
      body,
      key: createKey,
    });
    $("result-link").textContent = r.link.shortUrl;
    $("result-link").href = r.link.shortUrl;
    $("result").classList.remove("hidden");
    editing = null;
    createKey = null;
    $("link-form").reset();
  linkCampaign.reset();
    $("slug").disabled = false;
    $("cancel-edit").classList.add("hidden");
    $("form-heading").textContent = "Create a link or QR code.";
    $("submit").textContent = "Shorten link";
    ui();
    await refreshLibrary();
    message("Destination saved.");
  } finally {
    busy = false;
    $("submit").disabled = false;
  }
});
$("cancel-edit").onclick = () => {
  editing = null;
  createKey = null;
  $("link-form").reset();
  linkCampaign.reset();
  $("slug").disabled = false;
  $("cancel-edit").classList.add("hidden");
  $("form-heading").textContent = "Create a link or QR code.";
  $("submit").textContent = "Shorten link";
  ui();
};
for (const id of ["slug", "destination"])
  $(id).oninput = () => {
    createKey = null;
    linkCampaign.update();
    ui();
  };
$("search").oninput = render;
$("link-status").onchange = render;
$("refresh").onclick = act(load);
$("creator-toggle").onclick = () => {
  creatorHidden = !creatorHidden;
  try { localStorage.setItem("tinytrail.creator-hidden", String(creatorHidden)); } catch {}
  ui();
};
$("sidebar-toggle").onclick = () => {
  const collapsed = document.body.classList.toggle("sidebar-collapsed");
  $("sidebar-toggle").setAttribute("aria-expanded", String(!collapsed));
  $("sidebar-toggle").setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
};
$("qr-resume").onclick = act(async () => {
  if (!workspace) return;
  const { resumeQRBuilder } = await import("./qr-builder.mjs");
  resumeQRBuilder();
});
$("open-qr").onclick = act(() => openQR($("destination").value.trim() ? validateURL(linkCampaign.build()) : ""));
$("design-new").onclick = act(() => openQR());
$("result-qr").onclick = act(() => openQR($("result-link").href));
export function download(name, blob) {
  const u = URL.createObjectURL(blob),
    a = node("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 30000);
}
export const csvCell = (value) =>
  '"' +
  String(value ?? "")
    .replace(/"/g, '""')
    .replace(/^(?=[\s\u0000-\u001f]*[=+@-])/u, "'") +
  '"';
$("export").onclick = () =>
  download(
    "company-links.csv",
    new Blob(
      [
        "\ufeffTitle,Short link,Destination\r\n" +
          links
            .map((l) => [l.title, l.shortUrl, l.url].map(csvCell).join(","))
            .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    ),
  );
try {
  config = await api("/api/config", { auth: false });
  await initializeAuth(config);
  if(!account()) {
    location.replace(signInURL(location.pathname+location.search+location.hash,new URLSearchParams(location.search).has("request")));
  } else {
    // Verify identity before revealing the dashboard; API permissions remain authoritative.
    const response=await fetch('/api/me',{headers:{Authorization:'Bearer '+await token()},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)});
    if(response.status===401||response.status===403)location.replace(signInURL(location.pathname+location.search+location.hash));
    else if(!response.ok)throw Error('Could not open your workspace. Please refresh.');
    else {await load();document.body.classList.remove('auth-pending');}
  }
} catch (e) {
  if(!me)location.replace(signInURL(location.pathname+location.search+location.hash));
  else {document.body.classList.remove("auth-pending");error(e.message);}
}

let deleteDialog, pendingDelete;
function confirmDelete(link) {
  if (!deleteDialog) {
    deleteDialog = document.createElement("dialog");
    deleteDialog.id = "delete-link-dialog";
    deleteDialog.setAttribute("aria-labelledby", "delete-link-heading");
    deleteDialog.innerHTML = '<h2 id="delete-link-heading">Delete this link?</h2><p id="delete-link-name"></p><p>The link and QR codes using it will stop opening. You can restore it from Trash.</p><p id="delete-link-error" role="alert"></p><div class="action-row"><button id="delete-link-cancel" class="button secondary" autofocus>Keep link</button><button id="delete-link-confirm" class="button danger">Delete link</button></div>';
    document.body.append(deleteDialog);
    $("delete-link-cancel").onclick = () => deleteDialog.close();
    deleteDialog.onclose = () => { if (!deleteDialog.open) pendingDelete = null; };
    document.addEventListener("tinytrail:clear-qr", () => { pendingDelete = null; deleteDialog.close(); });
    $("delete-link-confirm").onclick = async () => {
      if (!pendingDelete) return;
      const item = pendingDelete;
      $("delete-link-confirm").disabled = true;
      try {
        await api("/api/links/" + item.slug, {method:"DELETE",body:{version:item.version}});
        if (pendingDelete !== item) return;
        if (editing?.slug === item.slug) $("cancel-edit").click();
        $("result").classList.add("hidden");
        deleteDialog.close();
        await refreshLibrary();
        message("Link moved to Trash.");
      } catch (e) { if (pendingDelete === item) $("delete-link-error").textContent = e.message; }
      finally { $("delete-link-confirm").disabled = false; }
    };
  }
  pendingDelete = link;
  $("delete-link-name").textContent = link.shortUrl;
  $("delete-link-error").textContent = "";
  deleteDialog.showModal();
}

// History restoration must revalidate storage and identity before revealing private content.
window.addEventListener('pagehide',()=>document.body.classList.add('auth-pending'));
window.addEventListener('pageshow',async event=>{if(!event.persisted)return;document.body.classList.add('auth-pending');clearLibrary();try{await initializeAuth(config);if(!account()){location.replace(signInURL(location.pathname+location.search+location.hash));return;}const r=await fetch('/api/me',{headers:{Authorization:'Bearer '+await token(true)},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(20000)});if(!r.ok){location.replace(signInURL(location.pathname+location.search+location.hash));return;}await load();document.body.classList.remove('auth-pending');}catch{location.replace(signInURL(location.pathname+location.search+location.hash));}});

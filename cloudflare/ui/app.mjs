import { validateSlug } from "./core.mjs";
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
export const node = (tag, cls = "", value = "") =>
  Object.assign(document.createElement(tag), {
    className: cls,
    textContent: value,
  });
let config,
  me = null,
  workspace = null,
  links = [],
  designs = [],
  presets = [],
  editing = null,
  view = "links",
  epoch = 0,
  register = false,
  busy = false,
  createKey = null,
  bulk = null;
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
  links = [];
  designs = [];
  presets = [];
  editing = null;
  createKey = null;
  $("link-form").reset();
  $("slug").disabled = false;
  $("form-heading").textContent = "Make it a short link.";
  $("submit").textContent = "Create short link";
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
  analyticsView?.reset();
}
function ui() {
  const user = account();
  $("connect").textContent = user?.email || "Sign in with email";
  $("account-top").textContent = user ? "My account" : "Sign in";
  $("auth-signedin").classList.toggle("hidden", !user);
  $("auth-signedout").classList.toggle("hidden", !!user);
  $("auth-current-email").textContent = user?.email || "";
  $("auth-verified-note").textContent = me
    ? "Email verified. Company access is managed by your workspace owner."
    : "Verify your email, then refresh verification to continue.";
  $("auth-check").classList.toggle("hidden", !!me);
  $("auth-resend").classList.toggle("hidden", !!me);
  $("access-refresh").classList.toggle("hidden", !me || !!workspace);
  $("member-content").classList.toggle("hidden", !workspace);
  $("admin-nav").classList.toggle("hidden", !me?.platformAdmin);
  $("access-panel").classList.toggle(
    "hidden",
    !!workspace || !!me?.accessRequest,
  );
  $("access-form").classList.toggle("hidden", !me);
  $("access-status").textContent = me?.accessRequest
    ? `Your request is ${me.accessRequest.status}.`
    : "";
  $("notice").textContent = !user
    ? "Sign in with a verified email to request company access."
    : !me
      ? "Verify your email to continue."
      : !workspace
        ? me.accessRequest
          ? `Company access: ${me.accessRequest.status}. Refresh after your administrator approves the request.`
          : "Request a company workspace, or accept an invitation from your owner."
        : "";
  $("workspace-label").textContent = workspace?.name || "Company workspace";
  $("open-qr").disabled = !workspace;
  $("transfer-panel").classList.toggle(
    "hidden",
    !workspace ||
      !((me?.legacyCounts.links || 0) + (me?.legacyCounts.designs || 0)),
  );
  $("transfer-summary").textContent =
    `${me?.legacyCounts.links || 0} previous links and ${me?.legacyCounts.designs || 0} previous QR designs are available to transfer into ${workspace?.name || "your company"}.`;
  $("preview").textContent = editing
    ? editing.shortUrl
    : `${config?.publicOrigin || location.origin}/r/${$("slug").value || "your-name"}`;
  for (const name of ["links", "designs", "bulk", "team", "admin", "analytics"])
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
  $("list-count").textContent = links.length;
  $("empty").classList.toggle("hidden", !!links.length);
  for (const link of links.filter((l) =>
    `${l.title} ${l.url} ${l.slug}`.toLowerCase().includes(query),
  )) {
    const row = node("article", "link-row"),
      body = node("div", "link-body"),
      a = node("a", "short-link", link.shortUrl.replace(/^https?:\/\//, ""));
    a.href = link.shortUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    body.append(
      node("h3", "", link.title),
      a,
      node("span", "destination", link.url),
    );
    const actions = node("div", "row-actions");
    for (const [label, fn] of [
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
    ]) {
      const button = node("button", "", label);
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
        "No QR designs yet. Create one from any URL—no saved link needed.",
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
      await api("/api/invitations/accept", {
        method: "POST",
        body: { token: invite },
      });
      history.replaceState(null, "", location.pathname);
      me = await api("/api/me");
      message("Invitation accepted. Welcome to your company.");
    }
    $("workspace-select").replaceChildren();
    for (const w of me.workspaces)
      $("workspace-select").append(new Option(w.name, w.id));
    if (!me.workspaces.length)
      $("workspace-select").append(new Option("No approved company", ""));
    workspace =
      me.workspaces.find(
        (w) => w.id === sessionStorage.getItem("tinytrail.workspace"),
      ) ||
      me.workspaces[0] ||
      null;
    if (workspace) $("workspace-select").value = workspace.id;
    ui();
    if (workspace) await refreshLibrary();
  } catch (e) {
    if (ticket !== epoch) return;
    error(e.message);
    ui();
  }
}
async function refreshLibrary() {
  if (!workspace) return;
  const ticket = epoch;
  const [a, b, c] = await Promise.all([
    api("/api/links"),
    api("/api/designs"),
    api("/api/presets"),
  ]);
  if (ticket !== epoch) return;
  links = a.links;
  designs = b.designs;
  presets = c.presets;
  render();
  const info = await api("/api/workspace");
  $("allowance").textContent =
    `${links.length} / ${info.limits.links} company links · ${designs.length} / ${info.limits.designs} saved QR designs`;
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
  $("invite-form").classList.toggle("hidden", workspace.role !== "owner");
  $("presets").replaceChildren();
  for (const p of presets)
    $("presets").append(node("div", "list-item", p.name));
  if (!presets.length) $("presets").textContent = "No company presets yet.";
}
async function openQR(url = "", design = null) {
  if (!workspace)
    throw Error("Join an approved company before creating QR codes.");
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
    trackingAvailable: !!config.features?.trackedQR,
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
  signOut();
  $("account-dialog").close();
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
  epoch++;
  workspace =
    me.workspaces.find((w) => w.id === $("workspace-select").value) || null;
  sessionStorage.setItem("tinytrail.workspace", workspace?.id || "");
  clearLibrary();
  ui();
  await refreshLibrary();
  if (view === "admin") await adminView();
});
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
      slug: validateSlug($("slug").value),
      destination: $("destination").value,
      ...(editing ? { version: editing.version } : {}),
    };
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
    $("slug").disabled = false;
    $("cancel-edit").classList.add("hidden");
    $("form-heading").textContent = "Make it a short link.";
    $("submit").textContent = "Create short link";
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
  $("slug").disabled = false;
  $("cancel-edit").classList.add("hidden");
  $("form-heading").textContent = "Make it a short link.";
  $("submit").textContent = "Create short link";
  ui();
};
for (const id of ["slug", "destination"])
  $(id).oninput = () => {
    createKey = null;
    ui();
  };
$("search").oninput = render;
$("refresh").onclick = act(load);
for (const id of ["open-qr", "design-new"]) $(id).onclick = act(() => openQR());
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
  await load();
  if (!account() && new URLSearchParams(location.search).has("request")) {
    register = true;
    $("auth-register-tab").click();
    openAccount();
  }
} catch (e) {
  error(e.message);
}

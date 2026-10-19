// Campaign tags are destination parameters, not TinyTrail engagement identifiers.
export const UTM_FIELDS = ["source", "medium", "campaign", "term", "content"];
export function campaignURL(input, values = {}, { replace = false } = {}) {
  let url;
  try { url = new URL(String(input).trim()); } catch { throw Error("Enter a full website URL first."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
    throw Error("Use an HTTP or HTTPS URL without credentials.");
  // Preserve unrelated query bytes (including duplicates and encoding) and fragments.
  let changed = false;
  let parts = url.search ? url.search.slice(1).split("&") : [];
  const keyOf = part => [...new URLSearchParams(part).keys()][0]?.toLowerCase();
  for (const field of UTM_FIELDS) {
    const raw = values[field] ?? values[`utm_${field}`] ?? "";
    if (typeof raw !== "string") throw Error("Campaign values must be text.");
    const value = raw.trim();
    if (!value) continue;
    if (value.length > 200 || /[\u0000-\u001f\u007f]/u.test(value))
      throw Error("Use up to 200 characters per campaign field, without control characters.");
    const key = `utm_${field}`;
    if (parts.some(part => keyOf(part) === key)) {
      if (!replace) continue;
      parts = parts.filter(part => keyOf(part) !== key);
    }
    parts.push(new URLSearchParams({[key]:value}).toString());
    changed = true;
  }
  if (changed) url.search = parts.join("&");
  if (url.href.length > 4096) throw Error("The campaign URL exceeds 4,096 characters. Shorten the campaign values.");
  return url.href;
}

export function mountCampaignBuilder(container, { prefix, getURL = null, onChange = () => {} }) {
  // Labels and options are static; URL and campaign input are never rendered as HTML.
  container.classList.add("campaign-builder");
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Campaign tracking (optional)";
  details.append(summary);
  const body = document.createElement("div");
  body.className = "campaign-body";
  const grid = document.createElement("div");
  grid.className = "campaign-grid";
  const inputs = {};
  const labels = {source:"Source",medium:"Medium",campaign:"Campaign",term:"Term",content:"Content"};
  const examples = {source:"newsletter",medium:"email",campaign:"annual-report",term:"Optional keyword",content:"Optional variation"};
  for (const field of UTM_FIELDS) {
    const wrap = document.createElement("div"), label = document.createElement("label"), input = document.createElement("input");
    input.id = `${prefix}-${field}`;
    input.type = "text";
    input.maxLength = 200;
    input.placeholder = examples[field];
    input.autocomplete = "off";
    label.htmlFor = input.id;
    label.textContent = labels[field];
    wrap.append(label,input);
    grid.append(wrap);
    inputs[field] = input;
  }
  const policyLabel = document.createElement("label"), policy = document.createElement("select");
  policy.id = `${prefix}-policy`;
  policyLabel.htmlFor = policy.id;
  policyLabel.textContent = "Existing campaign tags";
  policy.append(new Option("Keep existing values", "keep"), new Option("Replace supplied fields", "replace"));
  const hint = document.createElement("p");
  hint.className = "field-hint";
  hint.textContent = getURL ? "Tags apply when you create a link or QR code. Blank fields leave existing tags unchanged." : "Shared tags apply on preview. Nonblank UTM columns in the CSV override these fields.";
  const preview = document.createElement("output");
  preview.id = `${prefix}-preview`;
  preview.className = "campaign-preview";
  preview.setAttribute("aria-label", "Campaign URL preview");
  const error = document.createElement("p");
  error.id = `${prefix}-error`;
  error.className = "campaign-error";
  error.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "action-row";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "text-button";
  clear.textContent = "Clear fields";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.id = `${prefix}-copy`;
  copy.className = "button secondary";
  copy.textContent = "Copy campaign URL";
  copy.hidden = !getURL;
  actions.append(clear,copy);
  body.append(hint,grid,policyLabel,policy,preview,error,actions);
  details.append(body);
  container.append(details);
  const values = () => Object.fromEntries(UTM_FIELDS.map(field => [field,inputs[field].value]));
  const options = () => ({replace:policy.value === "replace"});
  const active = () => UTM_FIELDS.some(field => inputs[field].value.trim());
  const build = (url = getURL?.()) => campaignURL(url, values(), options());
  function update() {
    preview.textContent = "";
    error.textContent = "";
    preview.hidden = !getURL || !active();
    copy.disabled = true;
    if (!getURL || !active()) return;
    try { preview.textContent = build(); copy.disabled = false; }
    catch (e) { error.textContent = e.message; }
  }
  function reset() {
    for (const input of Object.values(inputs)) input.value = "";
    policy.value = "keep";
    details.open = false;
    update();
  }
  for (const control of [...Object.values(inputs),policy]) control.addEventListener("input", () => { update(); onChange(); });
  clear.onclick = () => { reset(); onChange(); };
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(build()); error.textContent = "Campaign URL copied."; }
    catch { error.textContent = "Could not copy. Select the preview URL to copy it."; }
  };
  update();
  return { values, options, build, update, reset };
}

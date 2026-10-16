import { BASE } from "./core.mjs";
import {
  qrURL,
  qrOptions,
  qrFilename,
  colorQuality,
  FORMATS,
  SIZES,
} from "./qr-core.mjs";

let dialog;
let libraryPromise;
let version = 0;
let timer;
let current = null;
let downloading = false;
let saveHandler = null;
let savingProfile = false;
let presetHandler = null;
let trackedAsset = null,
  prepareHandler = null,
  trackingKey = null;
const $ = (id) => document.getElementById(id);

function loadLibrary() {
  if (window.QRCodeStyling) return Promise.resolve(window.QRCodeStyling);
  if (!libraryPromise)
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL(
        "./vendor/qr-code-styling-1.9.2.js",
        import.meta.url,
      ).href;
      script.onload = () =>
        window.QRCodeStyling
          ? resolve(window.QRCodeStyling)
          : reject(new Error("QR library unavailable."));
      script.onerror = () => {
        script.remove();
        libraryPromise = null;
        reject(
          new Error("Could not load the QR library. Refresh and try again."),
        );
      };
      document.head.append(script);
    });
  return libraryPromise;
}
function shapes(name, title, values) {
  return `<fieldset class="qr-shapes"><legend>${title}</legend><div class="qr-shape-options">${values.map(([value, label], i) => `<label class="qr-shape"><input type="radio" name="${name}" value="${value}" ${i === 0 ? "checked" : ""}><span class="qr-shape-art ${name} shape-${value}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span>${label}</span></label>`).join("")}</div></fieldset>`;
}
function mount() {
  dialog = document.createElement("dialog");
  dialog.id = "qr-dialog";
  dialog.className = "qr-dialog";
  dialog.setAttribute("aria-labelledby", "qr-heading");
  // Static interface markup only. URL and repository values are assigned using textContent/value.
  dialog.innerHTML = `
    <div class="qr-header"><div><div class="eyebrow">LINK STUDIO / QR DESIGNER</div><h2 id="qr-heading">A code worth sharing.</h2></div><button class="icon-button" id="qr-close" aria-label="Close QR builder">×</button></div>
    <div class="qr-layout">
      <section class="qr-preview-panel" aria-label="QR code preview">
        <div class="qr-preview-label"><span class="eyebrow">LIVE PREVIEW</span><span id="qr-preview-tag">SVG</span></div>
        <div class="qr-board" id="qr-preview" aria-label="QR preview" role="img"></div>
        <p id="qr-preview-url" class="qr-preview-url"></p>
        <p class="qr-scan-note">Scan with your phone before printing.</p>
        <div class="qr-preview-foot"><span>MADE TO CONNECT</span><span>↗</span></div>
      </section>
      <section class="qr-controls" aria-label="QR code settings">
        <div class="qr-section"><div class="qr-step">01 <span>Choose your link</span></div><label for="qr-mode">QR destination mode</label><select id="qr-mode"><option value="tracked">Tracked QR · stable TinyTrail URL</option><option value="static">Static QR · encodes the exact URL</option></select><p id="qr-tracking-note" class="field-hint"></p><label for="qr-saved">From your link library</label><select id="qr-saved"><option value="">Use a different URL</option></select><label for="qr-url">URL to encode</label><input id="qr-url" type="url" maxlength="4096" placeholder="https://…" spellcheck="false" autocomplete="off"><p class="field-hint">Use a workspace short link or enter a direct website URL.</p><button id="qr-prepare-tracking" class="button secondary" type="button">Create tracking URL</button><p id="qr-tracked-url" class="field-hint"></p></div>
        <div class="qr-section"><div class="qr-step">02 <span>Make it yours</span></div>
          <div class="qr-colors"><div><label for="qr-foreground">Code color</label><div class="qr-color-input"><input id="qr-foreground" type="color"><output id="qr-color-value"></output></div></div><div><label for="qr-background">Background</label><div class="qr-color-input"><input id="qr-background" type="color"><output id="qr-bg-value"></output></div></div></div>
          <div class="qr-swatches" id="qr-swatches" aria-label="TinyTrail code color presets"></div>
          ${shapes("qr-dots", "Dot shape", [
            ["square", "Square"],
            ["dots", "Dots"],
            ["rounded", "Rounded"],
            ["extra-rounded", "Soft"],
            ["classy", "Classy"],
            ["classy-rounded", "Classy soft"],
          ])}
          <div class="qr-corner-grid">${shapes("qr-border", "Corner border", [
            ["square", "Square"],
            ["extra-rounded", "Rounded"],
          ])}${shapes("qr-center", "Corner center", [
            ["square", "Square"],
            ["dot", "Circle"],
          ])}</div>
        </div>
        <div class="qr-section qr-export"><div class="qr-step">03 <span>Ready to share</span></div><div class="qr-export-options"><div><label for="qr-format">File format</label><select id="qr-format"><option value="svg">SVG · vector</option><option value="png">PNG · image</option><option value="jpeg">JPG · image</option></select></div><div><label for="qr-size">Export dimensions</label><select id="qr-size"><option value="512">512 × 512</option><option value="1024" selected>1024 × 1024</option><option value="2048">2048 × 2048</option></select></div></div>
          <p id="qr-quality" class="qr-quality" role="status"></p><p id="qr-error" class="form-error hidden" role="alert"></p><div id="qr-profile" class="hidden"><label for="qr-design-title">Design name</label><input id="qr-design-title" maxlength="100" placeholder="Name this QR design"><button class="button secondary" id="qr-save-profile" type="button">Save to workspace</button></div><div class="qr-download-row"><button class="text-button" id="qr-reset">Reset style</button><button class="button primary" id="qr-download" disabled>Download SVG <span>↓</span></button></div><p class="qr-private-note">Generated in your browser. Your URL is never sent to a QR service.</p>
        </div>
      </section>
    </div>`;
  document.body.append(dialog);
  const palette = getComputedStyle(document.documentElement);
  for (const name of ["slate", "purple", "blue", "pink"]) {
    const color = palette.getPropertyValue(`--brand-${name}`).trim();
    const button = document.createElement("button");
    button.type = "button";
    button.className = `qr-swatch swatch-${name}`;
    const label = { slate: "Ink", purple: "Teal", blue: "Blue", pink: "Rose" }[
      name
    ];
    button.setAttribute("aria-label", `Use TinyTrail ${label} code color`);
    button.title = `TinyTrail ${label} · ${color}`;
    button.dataset.color = color.toLowerCase();
    button.addEventListener("click", () => {
      $("qr-foreground").value = color;
      schedule();
    });
    $("qr-swatches").append(button);
  }
  $("qr-mode").addEventListener("change", () => {
    trackingUI();
    schedule();
  });
  $("qr-prepare-tracking").addEventListener("click", async () => {
    const requestedKey = trackingKey;
    $("qr-prepare-tracking").disabled = true;
    try {
      const source = sourceURL();
      if (!prepareHandler) throw Error("Tracked QR creation is unavailable.");
      const result = await prepareHandler({
        url: source,
        id: trackingKey,
        asset: trackedAsset,
        title: $("qr-design-title").value.trim() || "Workspace QR",
      });
      if (!dialog.open || requestedKey !== trackingKey) return;
      trackedAsset = result;
      trackingKey = result.id;
      trackingUI();
      schedule();
    } catch (error) {
      $("qr-error").textContent = error.message;
      $("qr-error").classList.remove("hidden");
    } finally {
      $("qr-prepare-tracking").disabled = false;
    }
  });
  $("qr-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    clearTimeout(timer);
    version++;
    current = null;
  });
  $("qr-saved").addEventListener("change", () => {
    if ($("qr-saved").value) {
      $("qr-url").value = $("qr-saved").value;
      schedule();
    }
  });
  $("qr-url").addEventListener("input", () => {
    $("qr-saved").value = [...$("qr-saved").options].some(
      (o) => o.value === $("qr-url").value,
    )
      ? $("qr-url").value
      : "";
    schedule();
  });
  for (const id of ["qr-foreground", "qr-background"])
    $(id).addEventListener("input", schedule);
  dialog
    .querySelectorAll("input[type=radio]")
    .forEach((el) => el.addEventListener("change", schedule));
  $("qr-format").addEventListener("change", downloadLabel);
  $("qr-size").addEventListener("change", () => {
    if (current) current.size = Number($("qr-size").value);
  });
  $("qr-reset").addEventListener("click", () => {
    resetStyle();
    schedule();
  });
  $("qr-download").addEventListener("click", download);
  $("qr-save-profile").addEventListener("click", async () => {
    if (!current || !saveHandler || savingProfile) return;
    const title = $("qr-design-title").value.trim();
    if (!title) {
      $("qr-error").textContent = "Give your QR design a name.";
      $("qr-error").classList.remove("hidden");
      return;
    }
    savingProfile = true;
    $("qr-save-profile").disabled = true;
    const { url, ...config } = { ...current, size: Number($("qr-size").value) };
    try {
      await saveHandler({
        title,
        url,
        settings: config,
        ...($("qr-mode").value === "tracked"
          ? { trackedQrId: trackedAsset.id }
          : {}),
      });
      $("qr-quality").textContent =
        "Saved to your workspace. You can reopen this design on any device.";
      $("qr-error").classList.add("hidden");
    } catch (error) {
      $("qr-error").textContent =
        error.message || "The design could not be saved.";
      $("qr-error").classList.remove("hidden");
    } finally {
      savingProfile = false;
      $("qr-save-profile").disabled = false;
    }
  });
  resetStyle();
}
function resetStyle() {
  const palette = getComputedStyle(document.documentElement);
  $("qr-foreground").value = palette.getPropertyValue("--brand-slate").trim();
  $("qr-background").value = palette.getPropertyValue("--brand-white").trim();
  for (const name of ["qr-dots", "qr-border", "qr-center"])
    dialog.querySelector(`input[name="${name}"][value="square"]`).checked =
      true;
}
function sourceURL() {
  const value = $("qr-url").value.trim();
  if ($("qr-mode").value === "static") return qrURL(value);
  const u = new URL(value);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.href.length > 4096
  )
    throw Error("Enter a valid HTTP or HTTPS destination without credentials.");
  return u.href;
}
function trackingUI() {
  const tracked = $("qr-mode").value === "tracked";
  $("qr-prepare-tracking").classList.toggle("hidden", !tracked);
  $("qr-prepare-tracking").textContent = trackedAsset
    ? "Update tracked destination"
    : "Create tracking URL";
  $("qr-tracking-note").textContent = tracked
    ? "Create the stable tracking URL before saving or exporting. Visits are recorded only while your workspace enables measurement. Destination changes apply to every issued copy when you choose Update tracked destination. QR visits measure requests through this URL, not confirmed physical scans."
    : "Static QR: no QR-specific tracking. A TinyTrail short link inside it may still record link visits. Existing exported QR files remain unchanged.";
  $("qr-tracked-url").textContent =
    trackedAsset && tracked ? trackedAsset.publicUrl : "";
}
function settings() {
  const source = sourceURL();
  let url = source;
  if ($("qr-mode").value === "tracked") {
    if (
      !trackedAsset ||
      trackedAsset.state !== "active" ||
      trackedAsset.sourceUrl !== source
    )
      throw Error(
        "Create or update the tracking URL to preview and export this destination.",
      );
    url = trackedAsset.publicUrl;
  }
  return {
    url,
    foreground: $("qr-foreground").value,
    background: $("qr-background").value,
    dots: dialog.querySelector("[name=qr-dots]:checked").value,
    border: dialog.querySelector("[name=qr-border]:checked").value,
    center: dialog.querySelector("[name=qr-center]:checked").value,
    size: Number($("qr-size").value),
  };
}
function downloadLabel() {
  const label =
    $("qr-format").value === "jpeg"
      ? "JPG"
      : $("qr-format").value.toUpperCase();
  $("qr-download").replaceChildren(
    document.createTextNode(`Download ${label}`),
    Object.assign(document.createElement("span"), { textContent: "↓" }),
  );
  $("qr-preview-tag").textContent = label;
}
function schedule() {
  version++;
  current = null;
  clearTimeout(timer);
  $("qr-download").disabled = true;
  // Never show an old QR after its URL or appearance has changed.
  $("qr-preview").replaceChildren();
  $("qr-preview").setAttribute("aria-busy", "true");
  $("qr-quality").textContent = "Updating preview…";
  timer = setTimeout(render, 160);
}
async function render() {
  const ticket = ++version;
  $("qr-download").disabled = true;
  $("qr-save-profile").disabled = true;
  $("qr-error").classList.add("hidden");
  try {
    const config = settings();
    $("qr-color-value").textContent = config.foreground.toUpperCase();
    $("qr-bg-value").textContent = config.background.toUpperCase();
    dialog
      .querySelectorAll(".qr-swatch")
      .forEach((el) =>
        el.setAttribute(
          "aria-pressed",
          String(el.dataset.color === config.foreground.toLowerCase()),
        ),
      );
    const quality = colorQuality(config.foreground, config.background);
    const safe = quality.darkOnLight && quality.contrast >= 4.5;
    const QR = await loadLibrary();
    const qr = new QR(qrOptions({ ...config, size: 320 }));
    await qr.getRawData("svg");
    if (ticket !== version || !dialog.open) return;
    $("qr-preview").replaceChildren();
    qr.append($("qr-preview"));
    $("qr-preview").setAttribute("aria-label", `QR code for ${config.url}`);
    $("qr-preview-url").textContent = config.url;
    $("qr-quality").textContent = safe
      ? "Dark-on-light contrast · Clear border · High error correction"
      : !quality.darkOnLight
        ? "Choose a darker code color than the background."
        : "This color pair is too light to export. Choose a darker code color or a lighter background.";
    $("qr-quality").classList.toggle("qr-quality-warning", !safe);
    current = safe ? config : null;
    $("qr-download").disabled = !safe || downloading;
    $("qr-save-profile").disabled = !safe || savingProfile;
  } catch (error) {
    if (ticket !== version) return;
    current = null;
    $("qr-preview").replaceChildren();
    $("qr-preview-url").textContent = "";
    $("qr-quality").classList.remove("qr-quality-warning");
    $("qr-quality").textContent = "Enter a valid URL to generate a QR code.";
    $("qr-error").textContent =
      error instanceof Error
        ? error.message
        : "This URL could not be encoded. Try a shorter link.";
    $("qr-error").classList.remove("hidden");
  } finally {
    if (ticket === version) $("qr-preview").setAttribute("aria-busy", "false");
  }
}
async function download() {
  if (!current || downloading) return;
  downloading = true;
  $("qr-download").disabled = true;
  const config = { ...current, size: Number($("qr-size").value) };
  const format = $("qr-format").value;
  try {
    if (!FORMATS[format] || !SIZES.includes(config.size))
      throw new Error("Choose a valid export format and size.");
    const QR = await loadLibrary();
    const qr = new QR(qrOptions(config));
    const blob = await qr.getRawData(format);
    if (
      !(blob instanceof Blob) ||
      !blob.size ||
      !blob.type.startsWith(FORMATS[format])
    )
      throw new Error("The image could not be exported. Please try again.");
    const objectURL = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectURL;
    anchor.download = `${qrFilename(config.url)}.${format === "jpeg" ? "jpg" : format}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectURL), 30000);
    $("qr-quality").textContent =
      `${format === "jpeg" ? "JPG" : format.toUpperCase()} exported at ${config.size} × ${config.size}. Scan-test the downloaded file before printing.`;
  } catch (error) {
    $("qr-error").textContent =
      error.message || "Export failed. Please try again.";
    $("qr-error").classList.remove("hidden");
  } finally {
    downloading = false;
    $("qr-download").disabled = !current;
  }
}
export async function openQRBuilder({
  url = "",
  links = [],
  onSave = null,
  design = null,
  presets = [],
  onPreset = null,
  onPrepare = null,
  asset = null,
  trackingAvailable = false,
} = {}) {
  if (!dialog) mount();
  saveHandler = onSave;
  prepareHandler = onPrepare;
  trackedAsset = asset;
  trackingKey = asset?.id || crypto.randomUUID();
  $("qr-mode").value = design
    ? asset
      ? "tracked"
      : "static"
    : trackingAvailable
      ? "tracked"
      : "static";
  $("qr-mode").querySelector('option[value="tracked"]').disabled =
    !trackingAvailable && !asset;
  trackingUI();
  presetHandler = onPreset;
  let controls = $("qr-workspace-presets");
  if (!controls) {
    controls = document.createElement("div");
    controls.id = "qr-workspace-presets";
    controls.className = "qr-preset-controls";
    controls.innerHTML =
      '<label for="qr-preset-select">Workspace style preset</label><select id="qr-preset-select"><option value="">Choose a preset</option></select><label for="qr-preset-name">Save current style as a workspace preset</label><input id="qr-preset-name" maxlength="100" placeholder="e.g. Workspace print style"><button id="qr-preset-save" class="button secondary" type="button">Save workspace preset</button>';
    dialog.querySelector(".qr-controls").prepend(controls);
  }
  const presetSelect = $("qr-preset-select");
  presetSelect.replaceChildren(new Option("Choose a preset", ""));
  for (const p of presets) presetSelect.append(new Option(p.name, p.id));
  presetSelect.onchange = () => {
    const p = presets.find((p) => p.id === presetSelect.value);
    if (!p) return;
    const c = p.settings;
    for (const [name, value] of [
      ["qr-dots", c.dots],
      ["qr-border", c.border],
      ["qr-center", c.center],
    ]) {
      const input = [
        ...dialog.querySelectorAll('input[name="' + name + '"]'),
      ].find((i) => i.value === value);
      if (input) input.checked = true;
    }
    $("qr-foreground").value = c.foreground;
    $("qr-background").value = c.background;
    $("qr-size").value = c.size;
    schedule();
  };
  $("qr-preset-save").onclick = async () => {
    try {
      if (!current || !presetHandler)
        throw Error("Enter a valid URL and style first.");
      $("qr-preset-save").disabled = true;
      await presetHandler({
        name: $("qr-preset-name").value,
        settings: current,
      });
      $("qr-quality").textContent =
        "Workspace preset saved. Reopen the designer to select it.";
    } catch (e) {
      $("qr-error").textContent = e.message;
      $("qr-error").classList.remove("hidden");
    } finally {
      $("qr-preset-save").disabled = false;
    }
  };

  $("qr-profile").classList.toggle("hidden", !onSave);
  const selected =
    asset?.sourceUrl ||
    design?.url ||
    url ||
    $("qr-url").value ||
    (links[0] ? links[0].shortUrl || `${BASE}${links[0].slug}/` : "");
  const select = $("qr-saved");
  select.replaceChildren(new Option("Use a different URL", ""));
  for (const link of links)
    select.append(
      new Option(link.title, link.shortUrl || `${BASE}${link.slug}/`),
    );
  $("qr-url").value = selected;
  select.value = links.some(
    (l) => (l.shortUrl || `${BASE}${l.slug}/`) === selected,
  )
    ? selected
    : "";
  let defaultTitle = "My QR design";
  try {
    defaultTitle = qrFilename(selected).replace(/-qr$/, "");
  } catch {}
  $("qr-design-title").value = design?.title || defaultTitle;
  if (design?.settings) {
    const config = design.settings;
    for (const [name, value] of [
      ["qr-dots", config.dots],
      ["qr-border", config.border],
      ["qr-center", config.center],
    ]) {
      const input = [...dialog.querySelectorAll(`input[name="${name}"]`)].find(
        (el) => el.value === value,
      );
      if (input) input.checked = true;
    }
    if (/^#[0-9a-f]{6}$/i.test(config.foreground))
      $("qr-foreground").value = config.foreground;
    if (/^#[0-9a-f]{6}$/i.test(config.background))
      $("qr-background").value = config.background;
    if (SIZES.includes(config.size)) $("qr-size").value = String(config.size);
  }
  if (!dialog.open) dialog.showModal();
  downloadLabel();
  schedule();
}

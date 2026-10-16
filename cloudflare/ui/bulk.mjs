import { qrOptions, colorQuality } from "./qr-core.mjs";
import { validateSlug } from "./core.mjs";
const $ = (id) => document.getElementById(id),
  el = (tag, cls = "", value = "") =>
    Object.assign(document.createElement(tag), {
      className: cls,
      textContent: value,
    });
const cell = (value) =>
  '"' +
  String(value ?? "")
    .replace(/"/g, '""')
    .replace(/^[=+@\-\t\r]/, "'$&") +
  '"';
function save(name, blob) {
  const url = URL.createObjectURL(blob),
    a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function parseCSV(input) {
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        value += '"';
        i++;
      } else if (!quoted && value) throw Error("Unexpected quote in CSV.");
      else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (quoted) throw Error("A CSV quoted field is not closed.");
  row.push(value);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
let library;
async function QR() {
  if (window.QRCodeStyling) return window.QRCodeStyling;
  if (!library)
    library = new Promise((resolve, reject) => {
      const script = el("script");
      script.src = "./vendor/qr-code-styling-1.9.2.js";
      script.onload = () => resolve(window.QRCodeStyling);
      script.onerror = () => {
        library = null;
        reject(Error("QR tools could not load."));
      };
      document.head.append(script);
    });
  return library;
}
export async function mountBulk({ api, act, message, getState, onChange }) {
  let rows = [],
    job = null,
    running = false,
    exporting = false,
    generation = 0,
    previewTicket = 0,
    createId = null;
  const field = (id, label, options) => {
    const wrap = el("div"),
      l = el("label", "", label);
    l.htmlFor = id;
    let input;
    if (Array.isArray(options)) {
      input = el("select");
      for (const option of options) input.append(new Option(option, option));
    } else {
      input = el("input");
      input.type = options;
    }
    input.id = id;
    wrap.append(l, input);
    $("bulk-style").append(wrap);
    return input;
  };
  field("batch-preset", "Company preset", []);
  field("batch-dots", "Dot shape", [
    "square",
    "dots",
    "rounded",
    "extra-rounded",
    "classy",
    "classy-rounded",
  ]);
  field("batch-border", "Corner border", ["square", "extra-rounded"]);
  field("batch-center", "Corner center", ["square", "dot"]);
  field("batch-color", "Code color", "color").value = "#202b38";
  field("batch-background", "Background", "color").value = "#ffffff";
  const settings = () => ({
    dots: $("batch-dots").value,
    border: $("batch-border").value,
    center: $("batch-center").value,
    foreground: $("batch-color").value,
    background: $("batch-background").value,
    size: 2048,
  });
  const presetName = field(
    "batch-preset-name",
    "New company preset name",
    "text",
  );
  presetName.maxLength = 100;
  const presetSave = el("button", "button secondary", "Save company preset");
  $("bulk-style").append(presetSave);
  presetSave.onclick = act(async () => {
    await api("/api/presets", {
      method: "POST",
      body: { name: presetName.value, settings: settings() },
    });
    await onChange();
    message("Company preset saved.");
  });
  function reset() {
    generation++;
    rows = [];
    job = null;
    running = false;
    createId = null;
    $("bulk-input").value = "";
    $("bulk-file").value = "";
    $("bulk-preview-table").replaceChildren();
    $("bulk-results").replaceChildren();
    $("bulk-jobs").replaceChildren();
    $("bulk-status").textContent = "";
    $("bulk-sample").replaceChildren();
    $("bulk-create").disabled = true;
    for (const id of ["bulk-resume", "bulk-csv", "bulk-zip", "bulk-pdf"])
      $(id).disabled = true;
  }
  async function refresh() {
    if (!getState().workspace) return;
    const result = await api("/api/bulk");
    $("bulk-jobs").replaceChildren();
    if (!result.jobs.length) $("bulk-jobs").textContent = "No batches yet.";
    for (const item of result.jobs) {
      const button = el(
        "button",
        "button secondary",
        `${new Date(item.created_at).toLocaleDateString()} · ${item.mode} · ${item.id.slice(0, 8)}`,
      );
      button.onclick = act(async () => {
        if (running || exporting)
          throw Error("Wait for the current batch or export.");
        await open(item.id);
      });
      $("bulk-jobs").append(button);
    }
    const previous = $("batch-preset").value;
    $("batch-preset").replaceChildren(new Option("Custom style", ""));
    for (const p of getState().presets)
      $("batch-preset").append(new Option(p.name, p.id));
    $("batch-preset").value = previous;
  }
  function invalidate() {
    rows = [];
    createId = null;
    $("bulk-create").disabled = true;
    $("bulk-preview-table").replaceChildren();
  }
  for (const id of ["bulk-input", "bulk-mode"])
    $(id).addEventListener("input", invalidate);
  $("bulk-file").onchange = act(async () => {
    const file = $("bulk-file").files[0];
    if (!file) return;
    if (file.size > 200000) throw Error("Use a CSV smaller than 200 KB.");
    $("bulk-input").value = await file.text();
    invalidate();
  });
  $("bulk-template").onclick = () =>
    save(
      "tinytrail-template.csv",
      new Blob(
        [
          "title,url,slug\r\nAnnual report,https://example.com/report,annual-report\r\nEvent programme,https://example.com/event,event-programme",
        ],
        { type: "text/csv" },
      ),
    );
  async function sample() {
    const ticket = ++previewTicket;
    $("bulk-sample").replaceChildren();
    const quality = colorQuality(settings().foreground, settings().background);
    if (!quality.darkOnLight || quality.contrast < 4.5) {
      $("bulk-create").disabled = true;
      $("bulk-status").textContent =
        "Choose dark-on-light colors with at least 4.5:1 contrast.";
      return;
    }
    if (!rows.length) return;
    const item = rows.find((r) => !r.error);
    if (!item) return;
    const Q = await QR();
    if (ticket !== previewTicket) return;
    const qr = new Q(qrOptions({ ...settings(), url: item.url, size: 320 }));
    qr.append($("bulk-sample"));
  }
  for (const id of [
    "batch-dots",
    "batch-border",
    "batch-center",
    "batch-color",
    "batch-background",
  ])
    $(id).oninput = act(async () => {
      createId = null;
      await validate();
    });
  $("batch-preset").onchange = act(async () => {
    const p = getState().presets.find((p) => p.id === $("batch-preset").value);
    if (!p) return;
    for (const [id, key] of [
      ["batch-dots", "dots"],
      ["batch-border", "border"],
      ["batch-center", "center"],
      ["batch-color", "foreground"],
      ["batch-background", "background"],
    ])
      $(id).value = p.settings[key];
    await validate();
  });
  function table(headers, values) {
    const table = el("table"),
      head = el("thead"),
      tr = el("tr");
    for (const name of headers) tr.append(el("th", "", name));
    head.append(tr);
    table.append(head);
    const body = el("tbody");
    for (const value of values) {
      const row = el("tr");
      for (const v of value) {
        const td = el("td");
        td.append(v instanceof Node ? v : document.createTextNode(v ?? ""));
        row.append(td);
      }
      body.append(row);
    }
    table.append(body);
    return table;
  }
  async function validate() {
    const ticket = ++previewTicket;
    const mode = $("bulk-mode").value,
      seen = new Set();
    const quality = colorQuality(settings().foreground, settings().background);
    let unavailable = [];
    if (mode !== "qr" && rows.length) {
      const r = await api("/api/availability", {
        method: "POST",
        body: { slugs: rows.map((r) => r.slug) },
      });
      unavailable = r.unavailable;
    }
    if (ticket !== previewTicket) return;
    for (const row of rows) {
      row.error = "";
      try {
        if (!row.title.trim() || row.title.length > 100)
          throw Error("Use a title of 1–100 characters.");
        qrOptions({ ...settings(), url: row.url });
        if (mode !== "qr") {
          validateSlug(row.slug);
          if (seen.has(row.slug))
            throw Error("Duplicate short name in this file.");
          if (unavailable.includes(row.slug))
            throw Error("Short name already in use.");
          const u = new URL(row.url);
          if (
            [location.origin, "https://ksrtlink.github.io"].includes(u.origin)
          )
            throw Error("Use the original destination website.");
          seen.add(row.slug);
        }
      } catch (e) {
        row.error = e.message;
      }
    }
    $("bulk-preview-table").replaceChildren(
      table(
        ["Title", "URL", "Short name", "Validation"],
        rows.map((row) => {
          const fields = ["title", "url", "slug"].map((key) => {
            const input = el("input");
            input.value = row[key];
            input.setAttribute("aria-label", key);
            input.disabled = key === "slug" && mode === "qr";
            input.onchange = act(async () => {
              row[key] = input.value.trim();
              createId = null;
              await validate();
            });
            return input;
          });
          return [...fields, row.error || "Ready"];
        }),
      ),
    );
    const state = getState(),
      needed = rows.length;
    const safe = quality.darkOnLight && quality.contrast >= 4.5;
    let note = `${rows.length} rows · ${rows.filter((r) => !r.error).length} ready.`;
    const info = await api("/api/workspace");
    if (ticket !== previewTicket) return;
    const quota =
      (mode !== "qr" && state.links.length + needed > info.limits.links) ||
      (mode !== "links" && state.designs.length + needed > info.limits.designs);
    if (quota) note += " This batch exceeds the remaining company allowance.";
    if (!safe) note += " Choose darker code colors.";
    $("bulk-create").disabled =
      !rows.length || rows.some((r) => r.error) || quota || !safe;
    $("bulk-status").textContent = note;
    await sample();
  }
  $("bulk-preview").onclick = act(async () => {
    if (running || exporting) throw Error("Wait for the current operation.");
    let source = $("bulk-input")
      .value.replace(/^\ufeff/, "")
      .trim();
    if (source.length > 200000)
      throw Error("Use an input smaller than 200 KB.");
    let data;
    if (/^https?:\/\//i.test(source) && !source.includes(",")) {
      data = source
        .split(/\r?\n/)
        .filter(Boolean)
        .map((url, i) => ({ title: `QR ${i + 1}`, url: url.trim(), slug: "" }));
    } else {
      const parsed = parseCSV(source),
        headers = (parsed.shift() || []).map((s) => s.trim().toLowerCase());
      if (!headers.includes("url"))
        throw Error("CSV must include a url column.");
      if (new Set(headers).size !== headers.length)
        throw Error("CSV has duplicate column headings.");
      data = parsed.map((r, i) =>
        Object.fromEntries(
          ["title", "url", "slug"].map((key) => [
            key,
            headers.includes(key)
              ? (r[headers.indexOf(key)] || "").trim()
              : key === "title"
                ? `QR ${i + 1}`
                : "",
          ]),
        ),
      );
    }
    if (!data.length || data.length > 100)
      throw Error("Import 1–100 rows per batch.");
    rows = data;
    createId = null;
    await validate();
  });
  function renderJob() {
    if (!job) return;
    const finished = job.rows.filter((r) => r.result),
      errors = job.rows.filter((r) => r.error);
    $("bulk-status").textContent =
      `${finished.length} created · ${errors.length} need attention · ${job.rows.length - finished.length - errors.length} remaining.`;
    $("bulk-results").replaceChildren(
      table(
        ["Row", "Title", "Encoded URL", "Status"],
        job.rows.map((r) => [
          String(r.index + 1),
          r.input.title,
          r.result?.url || r.input.url,
          r.error || (r.result ? "Created" : "Waiting"),
        ]),
      ),
    );
    for (const [id, disabled] of [
      ["bulk-resume", running || exporting || !job.rows.some((r) => !r.result)],
      ["bulk-csv", running || exporting || !finished.length],
      [
        "bulk-zip",
        running || exporting || !finished.some((r) => r.result.design),
      ],
      [
        "bulk-pdf",
        running || exporting || !finished.some((r) => r.result.design),
      ],
    ]) {
      $(id).disabled = disabled;
      $(id).dataset.locked = String(disabled);
    }
  }
  async function open(id) {
    job = await api("/api/bulk/" + id);
    renderJob();
  }
  async function run(retry = false) {
    if (!job || running) return;
    const ticket = generation;
    running = true;
    renderJob();
    try {
      let first = true;
      do {
        const value = await api("/api/bulk/" + job.job.id + "/run", {
          method: "POST",
          body: { retry: retry && first },
        });
        if (ticket !== generation) return;
        job = value;
        first = false;
        renderJob();
      } while (job.rows.some((r) => !r.result && !r.error));
      if (ticket === generation) await onChange();
    } finally {
      if (ticket === generation) {
        running = false;
        renderJob();
      }
    }
  }
  $("bulk-create").onclick = act(async () => {
    if (running || exporting) throw Error("Wait for the current operation.");
    createId ||= crypto.randomUUID();
    const r = await api("/api/bulk", {
      method: "POST",
      body: {
        id: createId,
        mode: $("bulk-mode").value,
        rows,
        settings: settings(),
      },
    });
    await open(r.id);
    await run();
  });
  $("bulk-resume").onclick = act(() => run(true));
  $("bulk-csv").onclick = () => {
    if (!job) return;
    save(
      "tinytrail-results.csv",
      new Blob(
        [
          "\ufeffTitle,Original URL,Short link,Encoded URL,Status\r\n" +
            job.rows
              .map((r) =>
                [
                  r.input.title,
                  r.input.url,
                  r.result?.link?.shortUrl || "",
                  r.result?.url || "",
                  r.error || (r.result ? "Created" : "Waiting"),
                ]
                  .map(cell)
                  .join(","),
              )
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
  };
  async function exportFiles(pdf) {
    if (exporting || running || !job) return;
    const ticket = generation;
    exporting = true;
    renderJob();
    try {
      const snapshot = job,
        format = $("bulk-format").value,
        Q = await QR(),
        { makeZip, bytes, printSheets } = await import("./exports.mjs");
      const files = [],
        items = [],
        manifest = [];
      for (const row of snapshot.rows.filter((r) => r.result?.design)) {
        if (ticket !== generation)
          throw Error("Company changed; export cancelled.");
        const result = row.result,
          qr = new Q(
            qrOptions({
              ...result.design.settings,
              url: result.url,
              size: 2048,
            }),
          ),
          blob = await qr.getRawData(pdf ? "svg" : format);
        const name =
          String(row.index + 1).padStart(3, "0") +
          "-" +
          row.input.title.replace(/[^a-z0-9-]/gi, "-").slice(0, 55);
        if (pdf)
          items.push({
            title: result.title,
            url: result.url,
            svg: await blob.text(),
          });
        else
          files.push([
            name + "." + (format === "jpeg" ? "jpg" : format),
            new Uint8Array(await blob.arrayBuffer()),
          ]);
        manifest.push({
          file: name + "." + (format === "jpeg" ? "jpg" : format),
          title: result.title,
          url: result.url,
        });
        $("bulk-status").textContent = `Preparing ${manifest.length} QR files…`;
      }
      if (!items.length && !files.length)
        throw Error("This batch has no successful QR designs.");
      const blob = pdf
        ? await printSheets(items, {
            paper: $("print-paper").value,
            captions: $("print-caption").value,
            onProgress: (n, total) => {
              $("bulk-status").textContent =
                `Laying out ${n} of ${total} QR codes…`;
            },
          })
        : makeZip([
            ...files,
            ["manifest.json", bytes(JSON.stringify(manifest, null, 2))],
          ]);
      if (ticket !== generation)
        throw Error("Company changed; export cancelled.");
      save(pdf ? "tinytrail-print-sheets.pdf" : "tinytrail-qr-codes.zip", blob);
      message(pdf ? "Vector print sheets exported." : "QR archive exported.");
    } finally {
      exporting = false;
      if (ticket === generation) renderJob();
    }
  }
  $("bulk-zip").onclick = act(() => exportFiles(false));
  $("bulk-pdf").onclick = act(() => exportFiles(true));
  return { refresh, reset };
}

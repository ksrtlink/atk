const $ = (id) => document.getElementById(id),
  el = (tag, value = "", cls = "") =>
    Object.assign(document.createElement(tag), {
      textContent: value,
      className: cls,
    });
function table(headers, rows) {
  const t = el("table"),
    head = el("thead"),
    h = el("tr");
  for (const name of headers) h.append(el("th", name));
  head.append(h);
  const body = el("tbody");
  for (const row of rows) {
    const tr = el("tr");
    for (const value of row) {
      const td = el("td");
      td.append(
        value instanceof Node ? value : document.createTextNode(value ?? ""),
      );
      tr.append(td);
    }
    body.append(tr);
  }
  t.append(head, body);
  return t;
}
const count = (value) =>
  value === null ? "Not measured" : Number(value).toLocaleString();
function chart(series) {
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 900 190");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    "Daily eligible visits in UTC. Missing measurement coverage is shown as a gap. The daily data table provides exact counts.",
  );
  const max = Math.max(1, ...series.map((d) => d.visits || 0)),
    step = 860 / Math.max(1, series.length);
  for (const [i, d] of series.entries()) {
    if (d.visits === null) continue;
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", String(20 + i * step));
    rect.setAttribute("y", String(160 - (140 * d.visits) / max));
    rect.setAttribute("width", String(Math.max(1, step - 3)));
    rect.setAttribute("height", String(Math.max(1, (140 * d.visits) / max)));
    rect.setAttribute("class", "analytics-bar");
    const title = document.createElementNS(ns, "title");
    title.textContent = d.day + ": " + d.visits + " visits";
    rect.append(title);
    svg.append(rect);
  }
  for (const [x, label] of [
    [20, series[0]?.day || ""],
    [780, series.at(-1)?.day || ""],
  ]) {
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", x);
    text.setAttribute("y", "185");
    text.textContent = label;
    svg.append(text);
  }
  return svg;
}
export function mountAnalytics({ api, act, message, getState }) {
  let settings = null,
    report = null,
    assets = [],
    lastQuery = null,
    generation = 0;
  const today = new Date().toISOString().slice(0, 10);
  $("analytics-to").value = today;
  $("analytics-from").value = new Date(Date.now() - 6 * 86400000)
    .toISOString()
    .slice(0, 10);
  function reset() {
    generation++;
    settings = null;
    report = null;
    assets = [];
    lastQuery = null;
    $("analytics-report").classList.add("hidden");
    $("analytics-error").classList.add("hidden");
    $("analytics-status").textContent = "";
    $("analytics-collection").textContent = "";
    $("analytics-export").disabled = true;
    $("analytics-asset").replaceChildren(new Option("All company assets", ""));
    for (const id of [
      "analytics-total",
      "analytics-links",
      "analytics-qr",
      "analytics-comparison",
      "analytics-coverage",
      "analytics-static-note",
      "analytics-health",
      "analytics-policy",
    ])
      $(id).textContent = "";
    for (const id of [
      "analytics-chart",
      "analytics-days",
      "analytics-assets",
      "analytics-breakdowns",
    ])
      $(id).replaceChildren();
  }
  function status(error = "") {
    $("analytics-error").textContent = error;
    $("analytics-error").classList.toggle("hidden", !error);
  }
  function controls() {
    const enabled = settings.collection && settings.workspaceEnabled;
    $("analytics-collection").textContent =
      `${enabled ? "Measurement enabled" : settings.workspaceEnabled ? "Collection is paused for this deployment" : "Measurement is off for this company"}. ${settings.trackingSince ? "First enabled " + new Date(settings.trackingSince).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC." : "No visits have been measured yet."} Raw events are retained for ${settings.retentionDays} days.`;
    const owner = getState().workspace?.role === "owner";
    $("analytics-toggle").classList.toggle("hidden", !owner);
    $("analytics-toggle").textContent = settings.workspaceEnabled
      ? "Disable measurement"
      : "Enable measurement";
    $("analytics-toggle").disabled =
      !settings.collection && !settings.workspaceEnabled;
  }
  function query() {
    const from = $("analytics-from").value,
      to = $("analytics-to").value;
    if (!from || !to) throw Error("Choose both UTC dates.");
    const params = new URLSearchParams({
      from: new Date(from + "T00:00:00Z").toISOString(),
      to: new Date(Date.parse(to + "T00:00:00Z") + 86400000).toISOString(),
      channel: $("analytics-channel").value,
    });
    const asset = $("analytics-asset").value;
    if (asset) {
      const i = asset.indexOf(":");
      params.set("assetType", asset.slice(0, i));
      params.set("assetId", asset.slice(i + 1));
    }
    return params.toString();
  }
  async function display() {
    const ticket = ++generation;
    status();
    $("analytics-status").textContent = "Loading stored engagement data…";
    $("analytics-export").disabled = true;
    $("analytics-report").classList.add("hidden");
    try {
      const q = query(),
        data = await api("/api/analytics?" + q);
      if (ticket !== generation) return;
      report = data;
      lastQuery = q;
      render();
      $("analytics-status").textContent =
        data.totals.visits === null
          ? "No measurement coverage for this interval. Existing static codes cannot be measured retroactively."
          : data.totals.visits === 0
            ? "No eligible visits in the measured part of this interval."
            : "";
      $("analytics-export").disabled = false;
    } catch (error) {
      if (ticket !== generation) return;
      report = null;
      lastQuery = null;
      $("analytics-status").textContent =
        "The report is unavailable. No counts have been substituted.";
      status(error.message);
    }
  }
  function render() {
    const r = report;
    $("analytics-total").textContent = count(r.totals.visits);
    $("analytics-links").textContent = count(r.totals.linkVisits);
    $("analytics-qr").textContent = count(r.totals.qrVisits);
    $("analytics-comparison").textContent =
      r.comparison.percent === null
        ? r.comparison.label
        : `${r.comparison.percent >= 0 ? "+" : ""}${r.comparison.percent.toFixed(1)}% compared with the preceding equal UTC interval.`;
    $("analytics-coverage").textContent =
      `${r.coverage.partial ? "Partial measurement coverage" : "Measured interval"} · ${r.filters.from} to ${r.filters.to} (end exclusive). ${r.coverage.measuredSince ? "Covered from " + r.coverage.measuredSince + "." : ""}`;
    $("analytics-chart").replaceChildren(chart(r.series));
    $("analytics-days").replaceChildren(
      table(
        ["UTC date", "Eligible visits"],
        r.series.map((d) => [d.day, count(d.visits)]),
      ),
    );
    const rows = r.assets.slice(0, 200).map((a) => {
      const actions = el("div", "", "action-row");
      if (a.type === "qr") {
        const asset = assets.find((q) => q.id === a.id);
        if (asset) {
          const button = el(
            "button",
            asset.state === "active" ? "Disable QR URL" : "Enable QR URL",
            "button secondary",
          );
          button.onclick = act(async () => {
            await api("/api/tracked-qrs/" + asset.id, {
              method: "PATCH",
              body: {
                version: asset.version,
                state: asset.state === "active" ? "disabled" : "active",
              },
            });
            await refresh();
            message("Tracked QR availability updated. The URL is unchanged.");
          });
          actions.append(button);
        }
      }
      return [
        a.title,
        a.type === "qr" ? "QR URL" : "Short link",
        a.trackingSince
          ? new Date(a.trackingSince).toLocaleDateString("en-GB", {
              timeZone: "UTC",
            })
          : "Not instrumented",
        a.state,
        count(a.visits),
        actions,
      ];
    });
    $("analytics-assets").replaceChildren(
      table(
        [
          "Asset",
          "Channel",
          "Coverage starts · UTC",
          "State",
          "Visits",
          "Actions",
        ],
        rows,
      ),
    );
    $("analytics-static-note").textContent =
      `${r.staticDesigns} saved QR designs have no QR-specific tracking. Existing external/static codes are untracked; a code containing /r/ may generate link visits. Asset list shows up to 200 items.`;
    $("analytics-breakdowns").replaceChildren();
    for (const [kind, values] of Object.entries(r.breakdowns)) {
      const box = el("section", "", "box"),
        names = {
          countries: "Countries · approximate",
          devices: "Device families",
          browsers: "Browser families",
          operatingSystems: "Operating systems",
          referrers: "Referrer hosts",
        };
      box.append(el("h3", names[kind]));
      if (values.length)
        box.append(
          table(
            ["Category", "Visits"],
            values.map((v) => [v.label, String(v.visits)]),
          ),
        );
      else box.append(el("p", "No measured data for this interval."));
      $("analytics-breakdowns").append(box);
    }
    $("analytics-health").textContent =
      `${r.health.storedEvents.toLocaleString()} stored events in this company. ${r.health.latestEventAt ? "Latest recorded event: " + r.health.latestEventAt + "." : "No successful event recorded yet."} ${r.health.pruningPending ? "Expired rows are awaiting the next bounded retention pass." : "No expired rows detected."}`;
    $("analytics-policy").textContent =
      `Filter policy: ${r.filterVersion}. Best-effort collection can miss events during write failures. Unknown/direct combines missing and invalid referrers; it does not prove a typed URL.`;
    $("analytics-report").classList.remove("hidden");
  }
  async function refresh() {
    const ticket = generation;
    status();
    try {
      const [s, a] = await Promise.all([
        api("/api/analytics/settings"),
        api("/api/tracked-qrs"),
      ]);
      if (ticket !== generation) return;
      settings = s;
      assets = a.assets;
      controls();
      const old = $("analytics-asset").value;
      $("analytics-asset").replaceChildren(
        new Option("All company assets", ""),
      );
      for (const link of getState().links)
        $("analytics-asset").append(
          new Option("Link · " + link.title, "link:" + link.slug),
        );
      for (const a of assets)
        $("analytics-asset").append(
          new Option("QR · " + a.title, "qr:" + a.id),
        );
      $("analytics-asset").value = old;
      await display();
    } catch (error) {
      status(error.message);
      $("analytics-report").classList.add("hidden");
      $("analytics-export").disabled = true;
    }
  }
  $("analytics-form").onsubmit = act(async (event) => {
    event.preventDefault();
    await display();
  });
  $("analytics-refresh").onclick = act(refresh);
  $("analytics-channel").onchange = () => {
    $("analytics-asset").value = "";
  };
  $("analytics-toggle").onclick = act(async () => {
    settings = await api("/api/analytics/settings", {
      method: "POST",
      body: { enabled: !settings.workspaceEnabled },
    });
    controls();
    await display();
  });
  $("analytics-export").onclick = act(async () => {
    if (!lastQuery) throw Error("Load a report first.");
    const blob = await api("/api/analytics?" + lastQuery + "&format=csv", {
        responseType: "blob",
      }),
      url = URL.createObjectURL(blob),
      a = el("a");
    a.href = url;
    a.download = "tinytrail-analytics.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
  return { refresh, reset };
}

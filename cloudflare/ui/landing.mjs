let tool = "link";
const linkTab = document.getElementById("hero-link-tab"), qrTab = document.getElementById("hero-qr-tab"), input = document.getElementById("hero-url"), error = document.getElementById("hero-create-error");
function selectTool(next) {
  tool = next;
  linkTab.setAttribute("aria-pressed", String(tool === "link"));
  qrTab.setAttribute("aria-pressed", String(tool === "qr"));
  document.getElementById("hero-tool-title").textContent = tool === "link" ? "Start with a long link." : "Make your next QR code.";
  document.getElementById("hero-tool-description").textContent = tool === "link" ? "Make it shorter. Keep it easy to share." : "One URL. Your shapes, colors, and style.";
  document.getElementById("hero-create-submit").textContent = tool === "link" ? "Shorten a link ↗" : "Design a QR code ↗";
  error.hidden = true;
}
linkTab.addEventListener("click", () => selectTool("link"));
qrTab.addEventListener("click", () => selectTool("qr"));
document.getElementById("hero-create-form").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const url = new URL(input.value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 4096) throw Error("Use a full HTTP or HTTPS website URL without embedded credentials.");
    sessionStorage.setItem("tinytrail.create-draft", JSON.stringify({url:url.href, tool, createdAt:Date.now()}));
    location.assign("/manage/?create=1");
  } catch (problem) { error.textContent = problem.message; error.hidden = false; }
});
for (const pattern of document.querySelectorAll(".pattern")) for (let i=0;i<16;i++) pattern.append(document.createElement([3,6,9,12].includes(i)?"span":"i"));

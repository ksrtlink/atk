import { zipSync, strToU8 } from "fflate";
import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
export function makeZip(files) {
  return new Blob([zipSync(Object.fromEntries(files), { level: 6 })], {
    type: "application/zip",
  });
}
export const bytes = (text) => strToU8(text);
function captionImage(pdf, text, x, y, width, lines, fontSize) {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = lines * 58;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#232326";
  ctx.font = `${fontSize}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
  ctx.textBaseline = "top";
  const output = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > 980 && line) {
      output.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) output.push(line);
  for (let i = 0; i < Math.min(lines, output.length); i++) {
    let value = output[i];
    if (i === lines - 1 && output.length > lines) {
      while (ctx.measureText(value + "�").width > 980)
        value = value.slice(0, -1);
      value += "�";
    }
    ctx.fillText(value, 0, i * 58);
  }
  pdf.addImage(
    canvas.toDataURL("image/png"),
    "PNG",
    x,
    y,
    width,
    (canvas.height * width) / 1000,
  );
}
export async function printSheets(
  items,
  { paper = "a4", captions = "both", onProgress = () => {} } = {},
) {
  const pdf = new jsPDF({
    unit: "mm",
    format: paper,
    orientation: "portrait",
    compress: true,
  });
  const w = pdf.internal.pageSize.getWidth(),
    h = pdf.internal.pageSize.getHeight(),
    cellW = (w - 24) / 2,
    cellH = (h - 32) / 3,
    size = 42;
  for (let i = 0; i < items.length; i++) {
    if (i && i % 6 === 0) pdf.addPage();
    const col = i % 2,
      row = Math.floor((i % 6) / 2),
      x = 12 + col * cellW + (cellW - size) / 2,
      y = 16 + row * cellH + 8;
    const svg = new DOMParser().parseFromString(
      items[i].svg,
      "image/svg+xml",
    ).documentElement;
    await svg2pdf(svg, pdf, { x, y, width: size, height: size });
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(35, 35, 38);
    if (captions !== "none")
      captionImage(
        pdf,
        items[i].title,
        12 + col * cellW + 7,
        y + size + 4,
        cellW - 14,
        2,
        45,
      );
    if (captions === "both")
      captionImage(
        pdf,
        items[i].url,
        12 + col * cellW + 7,
        y + size + 17,
        cellW - 14,
        2,
        28,
      );
    onProgress(i + 1, items.length);
  }
  return pdf.output("blob");
}

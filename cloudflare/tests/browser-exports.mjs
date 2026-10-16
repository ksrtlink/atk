import { writeFile, mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import {
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
} from "@zxing/library";
import assert from "node:assert/strict";
const tabs = await (await fetch("http://127.0.0.1:9226/json/list")).json(),
  target = tabs.find((t) => t.url.includes("4174/manage"));
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id) {
    const p = pending.get(m.id);
    m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
  }
};
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
const dir = new URL("../../.qa/export-check/", import.meta.url);
await mkdir(dir, { recursive: true });
try {
  const result = await ev(
    `(async()=>{const {qrOptions}=await import('./qr-core.mjs');const output=[];for(const dots of ['square','dots','rounded','extra-rounded','classy','classy-rounded'])for(const border of ['square','extra-rounded'])for(const center of ['square','dot']){const settings={url:'https://example.com/scan-test',size:512,dots,border,center,foreground:'#202b38',background:'#ffffff'};const qr=new QRCodeStyling(qrOptions(settings));const blob=await qr.getRawData('png');const base64=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob)});output.push({name:[dots,border,center].join('-'),base64});}return output;})()`,
  );
  for (const item of result) {
    const bytes = Buffer.from(item.base64, "base64"),
      png = PNG.sync.read(bytes),
      decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    let value = decoded?.data;
    if (!value) {
      const gray = new Uint8ClampedArray(png.width * png.height);
      for (let i = 0; i < gray.length; i++)
        gray[i] =
          (png.data[i * 4] + 2 * png.data[i * 4 + 1] + png.data[i * 4 + 2]) / 4;
      try {
        value = new QRCodeReader()
          .decode(
            new BinaryBitmap(
              new HybridBinarizer(
                new RGBLuminanceSource(gray, png.width, png.height),
              ),
            ),
          )
          .getText();
      } catch {}
    }
    assert.equal(value, "https://example.com/scan-test", item.name);
    await writeFile(new URL(item.name + ".png", dir), bytes);
  }
  const pdfs = await ev(
    `(async()=>{const {qrOptions}=await import('./qr-core.mjs');const {printSheets}=await import('./exports.mjs?qa=unicode');const qr=new QRCodeStyling(qrOptions({url:'https://example.com/scan-test',size:512,dots:'dots',border:'extra-rounded',center:'dot',foreground:'#202b38',background:'#ffffff'}));const svg=await(await qr.getRawData('svg')).text();const items=Array.from({length:7},(_,i)=>({title:i===0?'تقرير الشركة · 日本語 · Annual report':'Company report '+(i+1),url:'https://example.com/scan-test',svg}));const result=[];for(const paper of ['a4','letter']){const blob=await printSheets(items,{paper});result.push({paper,base64:await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.readAsDataURL(blob);})});}return result;})()`,
  );
  for (const p of pdfs)
    await writeFile(
      new URL(p.paper + ".pdf", dir),
      Buffer.from(p.base64, "base64"),
    );
  console.log(
    "Decoded all 24 QR shape combinations; exported 7-code A4 and Letter PDFs with Unicode captions.",
  );
} finally {
  ws.close();
}

import { PNG } from "pngjs";
import jsQR from "jsqr";
import {
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
} from "@zxing/library";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
let decoded = 0;
for (const [paper, w, h] of [
  ["a4", 210, 297],
  ["letter", 215.9, 279.4],
])
  for (const page of [1, 2]) {
    const png = PNG.sync.read(
      await readFile(
        new URL(`../../.qa/export-check/${paper}-${page}.png`, import.meta.url),
      ),
    );
    for (let i = 0; i < (page === 1 ? 6 : 1); i++) {
      const col = i % 2,
        row = Math.floor(i / 2),
        cw = (w - 24) / 2,
        ch = (h - 32) / 3,
        x = ((12 + col * cw + (cw - 42) / 2) / w) * png.width,
        y = ((16 + row * ch + 8) / h) * png.height,
        size = (42 / w) * png.width;
      const crop = new PNG({
        width: Math.round(size),
        height: Math.round(size),
      });
      PNG.bitblt(
        png,
        crop,
        Math.round(x),
        Math.round(y),
        crop.width,
        crop.height,
        0,
        0,
      );
      let value = jsQR(
        new Uint8ClampedArray(crop.data),
        crop.width,
        crop.height,
      )?.data;
      if (!value) {
        const gray = new Uint8ClampedArray(crop.width * crop.height);
        for (let n = 0; n < gray.length; n++)
          gray[n] =
            (crop.data[n * 4] +
              2 * crop.data[n * 4 + 1] +
              crop.data[n * 4 + 2]) /
            4;
        value = new QRCodeReader()
          .decode(
            new BinaryBitmap(
              new HybridBinarizer(
                new RGBLuminanceSource(gray, crop.width, crop.height),
              ),
            ),
          )
          .getText();
      }
      assert.equal(value, "https://example.com/scan-test");
      decoded++;
    }
  }
console.log(
  `Decoded ${decoded} QR codes from the rendered A4 and Letter PDF pages.`,
);

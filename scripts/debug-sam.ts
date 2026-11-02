// Draw every SAM detection for a few prompts on one frame, for eyeballing.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { client, segmentImage } from "../src/sam.ts";
const api = client(readFileSync(new URL("../.secrets/meta_api_key", import.meta.url), "utf8").trim());
const file = process.argv[2], prompts = process.argv.slice(3);
const jpeg = readFileSync(file); const m = await sharp(jpeg).metadata();
const cols = ["#00e676", "#ffb300", "#ff1744", "#2979ff", "#d500f9"];
let svg = "";
for (const [i, p] of prompts.entries()) {
  const objs = await segmentImage(api, `data:image/jpeg;base64,${jpeg.toString("base64")}`, p);
  console.log(p, objs.map((o) => `${o.confidence.toFixed(2)} [${o.box.left},${o.box.top},${o.box.right},${o.box.bottom}]`).join(" | "));
  for (const o of objs) svg += `<rect x="${o.box.left}" y="${o.box.top}" width="${o.box.right - o.box.left}" height="${o.box.bottom - o.box.top}" fill="none" stroke="${cols[i]}" stroke-width="${6 - i}"/><text x="${o.box.left + 6}" y="${o.box.top + 34 + i * 30}" fill="${cols[i]}" font-size="28" font-family="sans-serif">${p} ${o.confidence.toFixed(2)}</text>`;
}
writeFileSync(file.replace(".jpg", ".dbg.jpg"), await sharp(jpeg).composite([{ input: Buffer.from(`<svg width="${m.width}" height="${m.height}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`) }]).jpeg().toBuffer());

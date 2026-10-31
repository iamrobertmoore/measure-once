// Kill-unknown 3: place a pole deterministically, let Muse Image make it photoreal, paste back only the pole.
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { client, segmentImage, fullMask } from "../src/sam.ts";
import { measureStill } from "../src/measure.ts";
import { jointFit, apply, type Pt } from "../src/geometry.ts";

const file = process.argv[2];
const api = client(readFileSync(new URL("../.secrets/meta_api_key", import.meta.url), "utf8").trim());
const jpeg = readFileSync(file);
const r = await measureStill(api, jpeg);
if (!r.ok) throw new Error(r.reason);
const fit = jointFit(r.sheet, r.window);
const G = fit.G; // wall mm -> image px; window rect in wall coords comes from refitting below
// Window rectangle in wall coords: map the window corners through the inverse and take the extents.
const inv = (p: Pt) => { // invert G numerically via 3x3 inverse
  const [a, b, c, d, e, f, g, h, i] = G; const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g; const det = a * A + b * B + c * C;
  const M = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
  return apply(M, p);
};
const wc = r.window.map(inv);
const left = Math.min(wc[0].x, wc[3].x), right = Math.max(wc[1].x, wc[2].x), top = Math.min(wc[0].y, wc[1].y);
const overhang = 150, rise = 80, dia = 35; // mm
const p0 = { x: left - overhang, y: top - rise }, p1 = { x: right + overhang, y: top - rise };
const pole = [{ x: p0.x, y: p0.y - dia / 2 }, { x: p1.x, y: p1.y - dia / 2 }, { x: p1.x, y: p1.y + dia / 2 }, { x: p0.x, y: p0.y + dia / 2 }].map((p) => apply(G, p));
const fin = (x: number) => [{ x: x - 45, y: top - rise - 30 }, { x: x + 45, y: top - rise - 30 }, { x: x + 45, y: top - rise + 30 }, { x: x - 45, y: top - rise + 30 }].map((p) => apply(G, p));
const meta = await sharp(jpeg).metadata(); const W = meta.width!, H = meta.height!;
const poly = (q: Pt[], fill: string) => `<polygon points="${q.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="${fill}"/>`;
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${poly(pole, "#6b4a2b")}${poly(fin(p0.x - 45), "#4a3220")}${poly(fin(p1.x + 45), "#4a3220")}</svg>`;
const placed = await sharp(jpeg).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 92 }).toBuffer();
writeFileSync(file.replace(/\.jpe?g$/, ".placed.jpg"), placed);
console.log("pole span mm", Math.round(p1.x - p0.x), "window mm", Math.round(right - left));

const t0 = Date.now();
const edit: any = await (api.images as any).edit({
  model: "muse-image-1.0",
  image: await (await import("openai")).toFile(placed, "placed.jpg", { type: "image/jpeg" }),
  prompt: "Make the flat brown bar above the window a photorealistic rustic reclaimed-wood curtain pole with two round wooden finials and simple black brackets, lit to match the room. Keep its exact position, length and angle. Change nothing else in the photo.",
  output_format: "jpeg",
} as any);
const edited = Buffer.from(edit.data[0].b64_json, "base64");
const em = await sharp(edited).metadata();
const editedFit = await sharp(edited).resize(W, H, { fit: "fill" }).jpeg({ quality: 92 }).toBuffer();
writeFileSync(file.replace(/\.jpe?g$/, ".edited.jpg"), editedFit);
console.log("edit ms", Date.now() - t0, "edited size", em.width, em.height);

// Cut the pole out of the edited image with SAM and paste it onto the untouched original.
const poles = await segmentImage(api, `data:image/jpeg;base64,${editedFit.toString("base64")}`, "wooden pole");
console.log("SAM poles", poles.map((o) => [o.confidence.toFixed(2), o.box]));
if (!poles.length) process.exit(0);
const pm = fullMask(poles.sort((a, b) => (b.box.right - b.box.left) - (a.box.right - a.box.left))[0], W, H);
const rgbaE = await sharp(editedFit).ensureAlpha().raw().toBuffer();
for (let i = 0; i < W * H; i++) rgbaE[i * 4 + 3] = pm[i] ? 255 : 0;
const cut = await sharp(rgbaE, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
const final = await sharp(jpeg).composite([{ input: cut }]).jpeg({ quality: 92 }).toBuffer();
writeFileSync(file.replace(/\.jpe?g$/, ".final.jpg"), final);
// How much of the room changed in the raw edit (outside the pole mask): mean abs diff.
const a = await sharp(jpeg).raw().toBuffer(), b = await sharp(editedFit).raw().toBuffer();
let d = 0, n = 0; for (let i = 0; i < W * H; i++) if (!pm[i]) { for (let c = 0; c < 3; c++) d += Math.abs(a[i * 3 + c] - b[i * 3 + c]); n += 3; }
console.log("raw edit: mean abs change outside pole", (d / n).toFixed(2), "/255 (final image: 0 by construction)");

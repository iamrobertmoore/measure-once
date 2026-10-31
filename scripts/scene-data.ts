// Dump one real pipeline run as JSON for design concepts (numbers on screen come from the pipeline, not typed).
import { readFileSync, writeFileSync } from "node:fs";
import { client } from "../src/sam.ts";
import { measureStill } from "../src/measure.ts";
import { jointFit, apply, invert, type Pt } from "../src/geometry.ts";
import { sizeOptions } from "../src/catalogue.ts";
const [, , file, out] = process.argv;
const api = client(readFileSync(new URL("../.secrets/meta_api_key", import.meta.url), "utf8").trim());
const r: any = await measureStill(api, readFileSync(file));
if (!r.ok) throw new Error(r.reason);
const fit = jointFit(r.sheet, r.window); const G = fit.G, Hinv = invert(G);
const left = fit.window.x0, right = fit.window.x0 + fit.window.w, top = fit.window.y0;
const opts = sizeOptions(fit.widthMm, 35);
const best = opts[0]; const len = best.cutToMm ?? best.stockCm * 10;
const y = top - 100, x0 = (left + right) / 2 - len / 2, x1 = x0 + len;
const toImg = (p: Pt) => apply(G, p);
const data = {
  image: file.split("/").pop(), widthMm: fit.widthMm, heightMm: fit.heightMm, sheet: r.sheet, window: r.window,
  wall: { left, right, top, bottom: fit.window.y0 + fit.window.h }, G, options: opts,
  pole: { stockLeft: toImg({ x: (left + right) / 2 - best.stockCm * 5, y }), stockRight: toImg({ x: (left + right) / 2 + best.stockCm * 5, y }),
          left: toImg({ x: x0, y }), right: toImg({ x: x1, y }), finL: toImg({ x: x0 - 90, y }), finR: toImg({ x: x1 + 90, y }),
          frameL: toImg({ x: left, y }), frameR: toImg({ x: right, y }), dia: [toImg({ x: x0, y: y - 17.5 }), toImg({ x: x0, y: y + 17.5 })] },
  ticks: Array.from({ length: Math.floor((right - left) / 10) + 1 }, (_, i) => { const x = left + i * 10, L = i % 10 === 0 ? 40 : i % 5 === 0 ? 26 : 14; return [toImg({ x, y: top - 8 }), toImg({ x, y: top - 8 - L }), i % 10 === 0 ? i : null]; }),
  grid: Array.from({ length: 13 }, (_, i) => i - 6).flatMap((i) => [
    [toImg({ x: left - 900, y: top - 300 + i * 150 }), toImg({ x: right + 900, y: top - 300 + i * 150 })],
    [toImg({ x: (left + right) / 2 + i * 150, y: top - 1200 }), toImg({ x: (left + right) / 2 + i * 150, y: top + 1500 })]]),
};
writeFileSync(out, JSON.stringify(data));
console.log(Math.round(fit.widthMm), opts.map((o) => `${o.stockCm}${o.cutToMm ? "->" + o.cutToMm : ""} ${o.fit}`));

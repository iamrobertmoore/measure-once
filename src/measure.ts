// Still-frame measurement: SAM finds the A4 sheet and the window; the pixels and the geometry give millimetres.
import sharp from "sharp";
import type OpenAI from "openai";
import { segmentImage, fullMask, type SamObject } from "./sam.ts";
import { sheetPaper, quadCorners, snapToImageEdges, jointFitEdges, edgeSamples, hull, boundary, quadFromHull, apply, orderCorners, fitLine, intersect, type Pt } from "./geometry.ts";

export type Gray = { data: Float32Array; W: number; H: number };
export type RGB = { data: Uint8Array; W: number; H: number };

export async function loadRGB(buf: Buffer): Promise<RGB> {
  const { data, info } = await sharp(buf).rotate().removeAlpha().toColourspace('srgb').raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), W: info.width, H: info.height };
}

/**
 * A single-channel image tuned to one object's edge: project RGB onto the colour axis that best separates the
 * object's inside from the ring of wall around it. A white sheet on a cream wall is nearly invisible in plain grey,
 * but clear on this axis. Values are scaled so inside ~ 1 and outside ~ 0.
 */
export function contrastMap(rgb: RGB, quad: Pt[]): Float32Array {
  const { data, W, H } = rgb;
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4, cy = quad.reduce((s, p) => s + p.y, 0) / 4;
  const shrink = (k: number) => quad.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
  const inPoly = (P: Pt[], x: number, y: number) => { let c = false; for (let i = 0, j = 3; i < 4; j = i++) { const a = P[i], b = P[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
  const inner = shrink(0.8), outerA = shrink(1.15), outerB = shrink(1.35);
  const xs = quad.map((p) => p.x), ys = quad.map((p) => p.y);
  const pad = Math.max(...xs) - Math.min(...xs);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad * 0.4)), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs) + pad * 0.4));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - pad * 0.4)), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys) + pad * 0.4));
  // Medians, not means: the ring around a sheet often clips a picture frame or a bag hanging nearby.
  const ins: number[][] = [[], [], []], outs: number[][] = [[], [], []];
  const step = Math.max(1, Math.floor((x1 - x0) / 200));
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
    const i = (y * W + x) * 3;
    if (inPoly(inner, x, y)) { for (let c = 0; c < 3; c++) ins[c].push(data[i + c]); }
    else if (inPoly(outerB, x, y) && !inPoly(outerA, x, y)) { for (let c = 0; c < 3; c++) outs[c].push(data[i + c]); }
  }
  const med = (a: number[]) => { const s2 = [...a].sort((p, q) => p - q); return s2[Math.floor(s2.length / 2)] ?? 0; };
  const mi = ins.map(med), mo = outs.map(med);
  const ax = [mi[0] - mo[0], mi[1] - mo[1], mi[2] - mo[2]];
  const n2 = ax[0] ** 2 + ax[1] ** 2 + ax[2] ** 2 || 1;
  const out = new Float32Array(W * H);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * W + x) * 3;
    out[y * W + x] = ((data[i] - mo[0]) * ax[0] + (data[i + 1] - mo[1]) * ax[1] + (data[i + 2] - mo[2]) * ax[2]) / n2;
  }
  return out;
}

/**
 * Edge samples straight from colour, with a contrast axis worked out per side: the colour just inside that side
 * versus the wall just outside it. A white surround on a cream wall, lit from one side, has a different (and much
 * fainter) contrast on each side than the window as a whole has against the wall, so one axis for the whole object
 * loses the faint sides. Each side's map is scaled so wall ~ 0 and object edge ~ 1, then sampled with the object
 * as the high side, so a neighbouring darker or brighter thing (a picture, a shadow) can't be mistaken for the edge.
 */
export function edgeSamplesRGB(quad: Pt[], rgb: RGB, reach: number, samples: number, minContrast = 0.35, rule: "mid" | "outer" = "mid"): Pt[][] {
  const { data, W, H } = rgb;
  const q = orderCorners(quad);
  const px = (x: number, y: number, c: number) => { const xi = Math.round(x), yi = Math.round(y); if (xi < 0 || yi < 0 || xi >= W || yi >= H) return NaN; return data[(yi * W + xi) * 3 + c]; };
  const med = (a: number[]) => { const s2 = a.filter(Number.isFinite).sort((u, v) => u - v); return s2[Math.floor(s2.length / 2)] ?? 0; };
  const out: Pt[][] = [];
  for (let s = 0; s < 4; s++) {
    const a = q[s], b = q[(s + 1) % 4];
    const L = Math.hypot(b.x - a.x, b.y - a.y), tx = (b.x - a.x) / L, ty = (b.y - a.y) / L, nx = -ty, ny = tx;
    const ins: number[][] = [[], [], []], outs: number[][] = [[], [], []];
    for (let k = 0; k < 60; k++) {
      const t = 0.15 + (0.7 * k) / 59, cx = a.x + (b.x - a.x) * t, cy = a.y + (b.y - a.y) * t;
      for (let o = reach + 1; o <= reach + 4; o++) for (let c = 0; c < 3; c++) { ins[c].push(px(cx + nx * o, cy + ny * o, c)); outs[c].push(px(cx - nx * o, cy - ny * o, c)); }
    }
    const mi = ins.map(med), mo = outs.map(med), ax = [0, 1, 2].map((c) => mi[c] - mo[c]);
    const n2 = ax[0] ** 2 + ax[1] ** 2 + ax[2] ** 2;
    if (n2 < 9) { out.push([]); continue; } // under ~3 levels of difference: nothing to find
    // Scaled map along a band around this side only.
    const gray = new Float32Array(W * H);
    const xs = [a.x, b.x].map((v) => v), ys = [a.y, b.y];
    const pad = reach + 8;
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad)), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs) + pad));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - pad)), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys) + pad));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 3;
      gray[y * W + x] = ((data[i] - mo[0]) * ax[0] + (data[i + 1] - mo[1]) * ax[1] + (data[i + 2] - mo[2]) * ax[2]) / n2;
    }
    out.push(edgeSamples(q, gray, W, H, reach, samples, minContrast, 1, rule)[s]);
  }
  return out;
}

/** Coarse-to-fine: a long reach first re-seats any side the mask got several pixels wrong (window masks often sit
 *  a few pixels inside a pale top edge), then a short reach measures each side from its re-seated position. */
export function windowSides(quad: Pt[], rgb: RGB): { sides: Pt[][]; quad: Pt[] } {
  let q = orderCorners(quad);
  const coarse = edgeSamplesRGB(q, rgb, 14, 40, 0.35, "outer");
  const lines = coarse.map((pts, i) => (pts.length >= 10 ? fitLine(pts) : null));
  const orig = [0, 1, 2, 3].map((i) => fitLine([q[i], q[(i + 1) % 4]]));
  const use = lines.map((l, i) => l ?? orig[i]);
  q = [0, 1, 2, 3].map((i) => intersect(use[(i + 3) % 4], use[i]));
  return { sides: edgeSamplesRGB(q, rgb, 8, 60, 0.35, "outer"), quad: q };
}

export async function loadGray(buf: Buffer): Promise<Gray> {
  const { data, info } = await sharp(buf).rotate().greyscale().raw().toBuffer({ resolveWithObject: true });
  const f = new Float32Array(info.width * info.height);
  for (let i = 0; i < f.length; i++) f[i] = data[i] / 255;
  return { data: f, W: info.width, H: info.height };
}

/** How quadrilateral a mask's outline is: convex-hull area / best inscribed quad area (1 = a clean quad).
 *  Uses the hull, not the filled area, so a hollow frame mask still counts as a quad. */
function quadness(o: SamObject): number {
  const { w, h, data } = o.crop;
  const hl = hull(boundary(data, w, h));
  const q = quadFromHull(hl);
  const ar = (P: Pt[]) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; };
  return ar(q) / Math.max(1, ar(hl));
}

function quadInImage(o: SamObject, W: number, H: number): Pt[] {
  return quadCorners(fullMask(o, W, H), W, H);
}

export type StillResult =
  | { ok: true; widthMm: number; heightMm: number | null; rmsPx: number; sheet: Pt[]; window: Pt[]; sheetConf: number; windowConf: number; windowPrompt: string; G: number[]; wall: { x0: number; y0: number; w: number; h: number }; sheetTiltDeg: number; sidesUsed: number[]; paper: string }
  | { ok: false; reason: string; sheet?: Pt[]; window?: Pt[] };

export const WINDOW_PROMPTS = ["window frame", "window surround", "wooden frame"];

export async function measureStill(api: OpenAI, jpeg: Buffer, paperHint?: "A4" | "Letter"): Promise<StillResult> {
  const rgb = await loadRGB(jpeg);
  const url = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  const [sheets, ...wins] = await Promise.all([segmentImage(api, url, "sheet of paper"), ...WINDOW_PROMPTS.map((p) => segmentImage(api, url, p))]);
  const r = measureWithMasks(rgb, sheets, wins, WINDOW_PROMPTS, paperHint);
  Object.defineProperty(r, "masks", { value: { rgb, sheets, wins }, enumerable: false }); // kept for re-measuring, not serialised
  return r;
}

/** The measuring step given SAM's masks for one frame (from image calls, or from one video-tracking call per prompt). */
export function measureWithMasks(rgb: RGB, sheets: SamObject[], wins: SamObject[][], prompts: string[], paperHint?: "A4" | "Letter"): StillResult {
  const { W, H } = rgb;

  const m = 3;
  const touches = (o: SamObject) => o.box.left <= m || o.box.top <= m || o.box.right >= W - m || o.box.bottom >= H - m;
  const sheetCands = sheets.filter((o) => !touches(o) && quadness(o) > 0.9).sort((a, b) => b.confidence - a.confidence);
  if (!sheetCands.length) return { ok: false, reason: sheets.length ? "sheet not flat or cut off" : "no sheet found" };
  const sheetObj = sheetCands[0];
  const sheetArea = (sheetObj.box.right - sheetObj.box.left) * (sheetObj.box.bottom - sheetObj.box.top);

  // Window: the outermost part of the window on the wall (surround, architrave, trim or frame), because that's what
  // a pole has to clear. Both sides must be in shot; the top and bottom may be cut off or hidden (a pole only needs
  // the width). Candidates must contain the main window and be quad-like.
  const all = wins.flatMap((list, i) => list.map((o) => ({ o, prompt: prompts[i], area: (o.box.right - o.box.left) * (o.box.bottom - o.box.top) })))
    .filter((c) => c.area >= 3 * sheetArea && quadness(c.o) >= 0.8)
    .filter((c) => !(c.o.box.right > sheetObj.box.left && c.o.box.left < sheetObj.box.right && c.o.box.bottom > sheetObj.box.top && c.o.box.top < sheetObj.box.bottom)); // not overlapping the sheet
  const core = all.filter((c) => c.prompt === prompts[0]).sort((a, b) => b.o.confidence - a.o.confidence)[0];
  const contains = (a: SamObject, b: SamObject) => a.box.left <= b.box.left + 4 && a.box.right >= b.box.right - 4;
  const sidesIn = (o: SamObject) => o.box.left > m && o.box.right < W - m;
  const cands = all.filter((c) => sidesIn(c.o) && (!core || (contains(c.o, core.o) && (c.o.box.right - c.o.box.left) < 2.2 * (core.o.box.right - core.o.box.left))))
    .sort((a, b) => (b.o.box.right - b.o.box.left) - (a.o.box.right - a.o.box.left));
  const best = cands[0];
  if (!best) return { ok: false, reason: all.length ? "window's sides not in shot" : "no window found" };
  const winObj = best.o;
  const topCut = winObj.box.top <= m, bottomCut = winObj.box.bottom >= H - m;

  const sheetRough = quadInImage(sheetObj, W, H);
  const sheet = snapToImageEdges(sheetRough, contrastMap(rgb, sheetRough), W, H, 6, 40, 1);
  const winRough = quadInImage(winObj, W, H);
  const { sides } = windowSides(winRough, rgb);
  if (bottomCut || sides[2].length < 24) sides[2] = []; // bottom hidden or cluttered: width doesn't need it
  if (topCut || sides[0].length < 12) sides[0] = [];
  if (sides[1].length < 12 || sides[3].length < 12) return { ok: false, reason: "window edges unclear", sheet, window: winRough };
  const sp = sheetPaper(sheet, paperHint);
  const fit = jointFitEdges(sheet, sides, winRough, sp.portrait, Infinity, sp.paper);
  if (!Number.isFinite(fit.widthMm) || fit.rmsPx > 3) return { ok: false, reason: `geometry inconsistent (rms ${fit.rmsPx.toFixed(1)} px)`, sheet, window: winRough };
  const r = fit.window;
  const winDrawn = [{ x: r.x0, y: r.y0 }, { x: r.x0 + r.w, y: r.y0 }, { x: r.x0 + r.w, y: r.y0 + r.h }, { x: r.x0, y: r.y0 + r.h }].map((p) => apply(fit.G, p));
  return { ok: true, widthMm: fit.widthMm, heightMm: fit.heightMm, rmsPx: fit.rmsPx, sheet, window: winDrawn, sheetConf: sheetObj.confidence, windowConf: winObj.confidence, windowPrompt: best.prompt, G: fit.G, wall: r, sheetTiltDeg: fit.sheetTiltDeg, sidesUsed: fit.sidesUsed, paper: sp.paper.name! };
}

/** Debug overlay: sheet in green, window in amber. */
export async function overlay(jpeg: Buffer, quads: { pts: Pt[]; color: string }[], label: string): Promise<Buffer> {
  const meta = await sharp(jpeg).rotate().metadata();
  const W = meta.width!, H = meta.height!;
  const polys = quads.map((q) => `<polygon points="${q.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="none" stroke="${q.color}" stroke-width="3"/>`).join("");
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${polys}<rect x="20" y="20" width="${Math.min(W - 40, 16 * label.length + 40)}" height="56" fill="rgba(0,0,0,0.6)"/><text x="40" y="58" font-family="sans-serif" font-size="30" fill="white">${label}</text></svg>`;
  return sharp(jpeg).rotate().composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 85 }).toBuffer();
}

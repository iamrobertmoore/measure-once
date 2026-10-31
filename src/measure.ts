// Still-frame measurement: SAM finds the A4 sheet and the window; the pixels and the geometry give millimetres.
import sharp from "sharp";
import type OpenAI from "openai";
import { segmentImage, fullMask, type SamObject } from "./sam.ts";
import { quadCorners, snapToImageEdges, jointFit, hull, boundary, quadFromHull, type Pt } from "./geometry.ts";

export type Gray = { data: Float32Array; W: number; H: number };

export async function loadGray(buf: Buffer): Promise<Gray> {
  const { data, info } = await sharp(buf).rotate().greyscale().raw().toBuffer({ resolveWithObject: true });
  const f = new Float32Array(info.width * info.height);
  for (let i = 0; i < f.length; i++) f[i] = data[i] / 255;
  return { data: f, W: info.width, H: info.height };
}

/** How quadrilateral a mask is: mask area / area of its best inscribed quad (1 = perfect quad). */
function quadness(o: SamObject): number {
  const { w, h, data } = o.crop;
  let area = 0; for (const v of data) area += v;
  const q = quadFromHull(hull(boundary(data, w, h)));
  let s = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4]; s += a.x * b.y - b.x * a.y; }
  return area / Math.max(1, Math.abs(s) / 2);
}

function quadInImage(o: SamObject, W: number, H: number): Pt[] {
  return quadCorners(fullMask(o, W, H), W, H);
}

export type StillResult =
  | { ok: true; widthMm: number; heightMm: number; rmsPx: number; sheet: Pt[]; window: Pt[]; sheetConf: number; windowConf: number; windowPrompt: string }
  | { ok: false; reason: string; sheet?: Pt[]; window?: Pt[] };

const WINDOW_PROMPTS = ["window frame", "window"];

export async function measureStill(api: OpenAI, jpeg: Buffer): Promise<StillResult> {
  const gray = await loadGray(jpeg);
  const { W, H } = gray;
  const url = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  const [sheets, ...wins] = await Promise.all([segmentImage(api, url, "sheet of paper"), ...WINDOW_PROMPTS.map((p) => segmentImage(api, url, p))]);

  const touches = (o: SamObject) => o.box.left <= 1 || o.box.top <= 1 || o.box.right >= W - 1 || o.box.bottom >= H - 1;
  const sheetCands = sheets.filter((o) => !touches(o) && quadness(o) > 0.9).sort((a, b) => b.confidence - a.confidence);
  if (!sheetCands.length) return { ok: false, reason: sheets.length ? "sheet not flat or cut off" : "no sheet found" };
  const sheetObj = sheetCands[0];

  // Window: the largest quad-like object that isn't the sheet and doesn't leave the frame.
  let best: { o: SamObject; prompt: string; area: number } | null = null;
  wins.forEach((list, i) => list.forEach((o) => {
    if (touches(o) || quadness(o) < 0.85) return;
    const area = (o.box.right - o.box.left) * (o.box.bottom - o.box.top);
    const sheetArea = (sheetObj.box.right - sheetObj.box.left) * (sheetObj.box.bottom - sheetObj.box.top);
    if (area < 3 * sheetArea) return; // a window opening is far bigger than an A4 sheet
    if (!best || area > best.area) best = { o, prompt: WINDOW_PROMPTS[i], area };
  }));
  if (!best) return { ok: false, reason: "window not fully in frame" };
  const winObj = (best as any).o as SamObject;

  const sheetRough = quadInImage(sheetObj, W, H), winRough = quadInImage(winObj, W, H);
  const sheet = snapToImageEdges(sheetRough, gray.data, W, H, 6), window = snapToImageEdges(winRough, gray.data, W, H, 6);
  const fit = jointFit(sheet, window);
  if (!Number.isFinite(fit.widthMm) || fit.rmsPx > 3) return { ok: false, reason: `geometry inconsistent (rms ${fit.rmsPx.toFixed(1)} px)`, sheet, window };
  return { ok: true, widthMm: fit.widthMm, heightMm: fit.heightMm, rmsPx: fit.rmsPx, sheet, window, sheetConf: sheetObj.confidence, windowConf: winObj.confidence, windowPrompt: (best as any).prompt };
}

/** Debug overlay: sheet in green, window in amber. */
export async function overlay(jpeg: Buffer, quads: { pts: Pt[]; color: string }[], label: string): Promise<Buffer> {
  const meta = await sharp(jpeg).rotate().metadata();
  const W = meta.width!, H = meta.height!;
  const polys = quads.map((q) => `<polygon points="${q.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" fill="none" stroke="${q.color}" stroke-width="3"/>`).join("");
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${polys}<rect x="20" y="20" width="${Math.min(W - 40, 16 * label.length + 40)}" height="56" fill="rgba(0,0,0,0.6)"/><text x="40" y="58" font-family="sans-serif" font-size="30" fill="white">${label}</text></svg>`;
  return sharp(jpeg).rotate().composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 85 }).toBuffer();
}

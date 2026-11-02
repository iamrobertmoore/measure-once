// The pole on the buyer's own window. Code places it (the measured wall geometry fixes where and how long);
// Muse Image makes it look real; SAM 3.1 cuts out only the pole, which is pasted back onto the untouched photo.
// Nothing outside the pole changes, by construction.
import sharp from "sharp";
import { toFile } from "openai";
import type OpenAI from "openai";
import { segmentImage, fullMask } from "./sam.ts";
import { apply, type Mat3, type Pt } from "./geometry.ts";

export type PolePlan = { leftMm: number; rightMm: number; yMm: number; diameterMm: number; finialMm: number; brackets?: number };

/** Where the pole goes on the wall, in the window-aligned wall frame: centred on the window, `riseMm` above it. */
export function planPole(wall: { x0: number; y0: number; w: number }, lengthMm: number, diameterMm: number, finialMm: number, riseMm = 100, brackets = 2): PolePlan {
  const cx = wall.x0 + wall.w / 2;
  return { leftMm: cx - lengthMm / 2, rightMm: cx + lengthMm / 2, yMm: wall.y0 - riseMm, diameterMm, finialMm, brackets };
}

function polyPts(G: Mat3, pts: Pt[]) { return pts.map((p) => apply(G, p)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "); }

/** A flat placeholder pole drawn in exact perspective: the geometry Muse Image is asked to keep. */
export function placeholderSvg(G: Mat3, W: number, H: number, p: PolePlan, fill = "#7a5230"): string {
  const r = p.diameterMm / 2, f = p.finialMm;
  const bar = [{ x: p.leftMm, y: p.yMm - r }, { x: p.rightMm, y: p.yMm - r }, { x: p.rightMm, y: p.yMm + r }, { x: p.leftMm, y: p.yMm + r }];
  const fin = (x0: number, x1: number) => [{ x: x0, y: p.yMm - r * 1.6 }, { x: x1, y: p.yMm - r * 1.6 }, { x: x1, y: p.yMm + r * 1.6 }, { x: x0, y: p.yMm + r * 1.6 }];
  const brk = (x: number) => [{ x: x - 12, y: p.yMm }, { x: x + 12, y: p.yMm }, { x: x + 12, y: p.yMm + 90 }, { x: x - 12, y: p.yMm + 90 }];
  const inset = Math.min(150, (p.rightMm - p.leftMm) * 0.08);
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<polygon points="${polyPts(G, brk(p.leftMm + inset))}" fill="#222"/><polygon points="${polyPts(G, brk(p.rightMm - inset))}" fill="#222"/>` +
    (p.brackets && p.brackets >= 3 ? `<polygon points="${polyPts(G, brk((p.leftMm + p.rightMm) / 2))}" fill="#222"/>` : "") +
    `<polygon points="${polyPts(G, bar)}" fill="${fill}"/>` +
    `<polygon points="${polyPts(G, fin(p.leftMm - f, p.leftMm))}" fill="#4a3220"/><polygon points="${polyPts(G, fin(p.rightMm, p.rightMm + f))}" fill="#4a3220"/></svg>`;
}

/** Region (in image px) that the pole may occupy: the placeholder's bounding box, padded. Keeps a drifting edit honest. */
function allowedBox(G: Mat3, p: PolePlan, W: number, H: number, padPx = 24) {
  const pts = [{ x: p.leftMm - p.finialMm, y: p.yMm - 60 }, { x: p.rightMm + p.finialMm, y: p.yMm - 60 }, { x: p.rightMm + p.finialMm, y: p.yMm + 110 }, { x: p.leftMm - p.finialMm, y: p.yMm + 110 }].map((q) => apply(G, q));
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  return { x0: Math.max(0, Math.min(...xs) - padPx), x1: Math.min(W, Math.max(...xs) + padPx), y0: Math.max(0, Math.min(...ys) - padPx), y1: Math.min(H, Math.max(...ys) + padPx) };
}

export async function renderPole(api: OpenAI, photo: Buffer, G: Mat3, plan: PolePlan, style = "rustic reclaimed-wood"): Promise<{ jpeg: Buffer; placed: Buffer; usedEdit: boolean; coverage: number; outsideChangePct: number; ms: number }> {
  const t0 = Date.now();
  const meta = await sharp(photo).metadata(); const W = meta.width!, H = meta.height!;
  const placed = await sharp(photo).composite([{ input: Buffer.from(placeholderSvg(G, W, H, plan)) }]).jpeg({ quality: 92 }).toBuffer();
  const box = allowedBox(G, plan, W, H);
  // Columns the pole itself should fill (between the finial tips), to check the cut-out is whole.
  const ends = [apply(G, { x: plan.leftMm - plan.finialMm, y: plan.yMm }), apply(G, { x: plan.rightMm + plan.finialMm, y: plan.yMm })];
  const cx0 = Math.max(0, Math.round(Math.min(ends[0].x, ends[1].x))), cx1 = Math.min(W - 1, Math.round(Math.max(ends[0].x, ends[1].x)));
  const attempt = async (): Promise<{ edited: Buffer; mask: Uint8Array; coverage: number } | null> => {
    try {
      const res: any = await (api.images as any).edit({
        model: "muse-image-1.0",
        image: await toFile(placed, "placed.jpg", { type: "image/jpeg" }),
        prompt: `Turn the flat brown bar and its two end blocks into a photorealistic ${style} curtain pole with two turned wooden finials, and the small dark blocks under it into plain black metal brackets, lit to match the room. Keep its exact position, length, thickness and angle. Change nothing else in the photo.`,
        output_format: "jpeg",
        extra_body: { reasoning_strength: "low", tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false } },
      } as any);
      const edited = await sharp(Buffer.from(res.data[0].b64_json, "base64")).resize(W, H, { fit: "fill" }).jpeg({ quality: 92 }).toBuffer();
      const mask = new Uint8Array(W * H);
      const poles = await segmentImage(api, `data:image/jpeg;base64,${edited.toString("base64")}`, "wooden pole").catch(() => []);
      for (const o of poles) {
        const m = fullMask(o, W, H);
        for (let i = 0; i < m.length; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; if (x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1) mask[i] = 1; }
      }
      // SAM sometimes splits a long pole at a joint or a finial; close short gaps along each row.
      for (let y = Math.floor(box.y0); y < box.y1; y++) {
        let last = -1;
        for (let x = Math.floor(box.x0); x < box.x1; x++) if (mask[y * W + x]) { if (last >= 0 && x - last > 1 && x - last <= 60) for (let k = last + 1; k < x; k++) mask[y * W + k] = 1; last = x; }
      }
      let cols = 0; for (let x = cx0; x <= cx1; x++) { for (let y = Math.floor(box.y0); y < box.y1; y++) if (mask[y * W + x]) { cols++; break; } }
      return { edited, mask, coverage: cols / Math.max(1, cx1 - cx0 + 1) };
    } catch { return null; }
  };
  // One retry when the cut-out pole is missing a stretch (an edit that drifted or a mask with a hole).
  let best = await attempt();
  if (!best || best.coverage < 0.95) { const again = await attempt(); if (again && (!best || again.coverage > best.coverage)) best = again; }
  const edited = best?.edited ?? null;
  let mask = best?.mask ?? new Uint8Array(W * H);
  const usedEdit = !!best && best.coverage >= 0.85;
  // Fall back to the exact placeholder if the edit drifted or SAM found too little of the pole inside the allowed region.
  const source = usedEdit ? edited! : placed;
  if (!usedEdit) { mask = new Uint8Array(W * H); const ph = await sharp(placed).raw().toBuffer(), orig = await sharp(photo).raw().toBuffer(); for (let i = 0; i < W * H; i++) if (ph[i * 3] !== orig[i * 3] || ph[i * 3 + 1] !== orig[i * 3 + 1]) mask[i] = 1; }
  const rgba = await sharp(source).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < W * H; i++) rgba[i * 4 + 3] = mask[i] ? 255 : 0;
  const cut = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).blur(0.6).png().toBuffer();
  const jpeg = await sharp(photo).composite([{ input: cut }]).jpeg({ quality: 90 }).toBuffer();
  // How much the raw edit changed the rest of the room (reported, then discarded).
  let d = 0, n = 0;
  if (edited) { const a = await sharp(photo).raw().toBuffer(), b = await sharp(edited).raw().toBuffer(); for (let i = 0; i < W * H; i += 7) if (!mask[i]) { d += Math.abs(a[i * 3] - b[i * 3]) + Math.abs(a[i * 3 + 1] - b[i * 3 + 1]) + Math.abs(a[i * 3 + 2] - b[i * 3 + 2]); n += 3; } }
  return { jpeg, placed, usedEdit, coverage: best?.coverage ?? 0, outsideChangePct: n ? (d / n / 255) * 100 : 0, ms: Date.now() - t0 };
}

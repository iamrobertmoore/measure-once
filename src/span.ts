// Which edges does the pole have to span? SAM and the geometry measure the window precisely, but "the window" can
// mean the frame, the trim around it, or (for a window set back in a recess) the opening in the wall. A pole goes on
// the wall face, so what matters is the opening as seen on the wall. That's a judgement about the picture and what
// the buyer said, which is what Muse Spark is for; the measuring stays in code.
//
// 1. Code finds every strong vertical edge on the wall plane around the window (the photo is rectified with the
//    measured homography, so verticals are vertical and positions are already in millimetres).
// 2. Those edges are drawn on the frame as lettered lines, and Muse Spark is asked which pair the pole must span,
//    given what the buyer said. Picking a letter is something the model does reliably; reading off coordinates is not.
// 3. Code measures between the chosen lines on the wall plane.
import sharp from "sharp";
import type OpenAI from "openai";
import { apply, type Pt } from "./geometry.ts";
import type { RGB } from "./measure.ts";

export type SpanEdge = { label: string; xMm: number; strength: number; measured?: boolean };
export type SpanPick = { leftMm: number; rightMm: number; widthMm: number; left: string; right: string; why: string; edges: SpanEdge[] };

const LETTERS = "ABCDEFGHIJKLMN";

/** Strong vertical edges on the wall plane, in wall millimetres, across the window and some wall either side. */
export function wallEdges(rgb: RGB, G: number[], wall: { x0: number; y0: number; w: number; h: number }, heightKnown: boolean): SpanEdge[] {
  const { data, W, H } = rgb;
  const lum = (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) return NaN;
    const L = (xx: number, yy: number) => { const i = (yy * W + xx) * 3; return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; };
    return L(x0, y0) * (1 - fx) * (1 - fy) + L(x0 + 1, y0) * fx * (1 - fy) + L(x0, y0 + 1) * (1 - fx) * fy + L(x0 + 1, y0 + 1) * fx * fy;
  };
  const step = 2, dd = 4; // mm per sample across; half-width of the derivative (a moulded edge is a few mm of blur)
  const xFrom = wall.x0 - Math.max(250, 0.45 * wall.w), xTo = wall.x0 + wall.w + Math.max(250, 0.45 * wall.w);
  const hh = heightKnown && wall.h > 0 ? wall.h : 800;
  const yFrom = wall.y0 + 0.25 * hh, yTo = wall.y0 + 0.75 * hh;
  const cols: number[] = [];
  for (let X = xFrom; X <= xTo; X += step) {
    let g = 0, n = 0;
    for (let Y = yFrom; Y <= yTo; Y += 8) {
      const a = apply(G as any, { x: X - dd, y: Y }), b = apply(G as any, { x: X + dd, y: Y });
      const la = lum(a.x, a.y), lb = lum(b.x, b.y);
      if (Number.isFinite(la) && Number.isFinite(lb)) { g += Math.abs(lb - la); n++; }
    }
    cols.push(n > 5 ? g / n : 0);
  }
  // Local maxima, strongest first, at least 30 mm apart; keep those well above the wall's own texture.
  const sorted = [...cols].sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length * 0.5)];
  const peaks: { i: number; v: number }[] = [];
  for (let i = 2; i < cols.length - 2; i++) if (cols[i] >= cols[i - 1] && cols[i] >= cols[i + 1] && cols[i] > floor * 3 + 2) peaks.push({ i, v: cols[i] });
  peaks.sort((a, b) => b.v - a.v);
  // Candidates: the outline we measured (it's always one of the choices), plus strong edges OUTSIDE it on each side,
  // such as a recess opening around a set-back window. Edges inside the outline can't be the span: the pole has to
  // clear the outermost part of the window anyway. Up to three outside edges a side, strongest first, 25 mm apart.
  const xAt = (i: number) => xFrom + i * step;
  const kept: { i: number; v: number; measured?: boolean }[] = [];
  for (const side of [-1, 1]) {
    const edgeX = side < 0 ? wall.x0 : wall.x0 + wall.w;
    const mine: { i: number; v: number }[] = [];
    const reach = Math.max(80, 0.2 * wall.w); // a recess reveal or a wide trim shows as a narrow band beside the window
    for (const p of peaks) if ((side < 0 ? xAt(p.i) < edgeX - 25 && xAt(p.i) > edgeX - reach : xAt(p.i) > edgeX + 25 && xAt(p.i) < edgeX + reach) && mine.length < 3 && mine.every((k) => Math.abs(k.i - p.i) * step >= 25)) mine.push(p);
    kept.push(...mine, { i: (edgeX - xFrom) / step, v: Infinity, measured: true });
  }
  // Sub-sample peak position (parabola through the three samples), then sort left to right and label.
  return kept.map((p) => {
    if (p.measured) return { xMm: xFrom + p.i * step, strength: 0, label: "", measured: true };
    const a = cols[p.i - 1], b = cols[p.i], c = cols[p.i + 1], d = a - 2 * b + c, off = d ? (0.5 * (a - c)) / d : 0;
    return { xMm: xFrom + (p.i + off) * step, strength: p.v, label: "" };
  }).sort((u, v) => u.xMm - v.xMm).map((e, k) => ({ ...e, label: LETTERS[k] }));
}

/** The frame with each candidate edge drawn as a lettered line, for Muse Spark to choose from. */
export async function labelledFrame(jpeg: Buffer, G: number[], wall: { y0: number; h: number }, heightKnown: boolean, edges: SpanEdge[], outW = 1280) {
  const meta = await sharp(jpeg).metadata(); const W = meta.width!, H = meta.height!;
  const hh = heightKnown && wall.h > 0 ? wall.h : 800;
  const cols = ["#ff2d55", "#00c7ff", "#ffd60a", "#30d158", "#bf5af2", "#ff9f0a", "#64d2ff", "#ff375f", "#a2845e", "#ffffff", "#5e5ce6", "#ac8e68", "#32ade6", "#ff6482"];
  const parts = edges.map((e, k) => {
    const a = apply(G as any, { x: e.xMm, y: wall.y0 + 0.1 * hh }), b = apply(G as any, { x: e.xMm, y: wall.y0 + 0.9 * hh });
    const c = cols[k % cols.length];
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${c}" stroke-width="3"/>` +
      `<rect x="${a.x - 17}" y="${a.y - 44}" width="34" height="38" rx="6" fill="#000" fill-opacity="0.75"/>` +
      `<text x="${a.x}" y="${a.y - 15}" font-family="Arial, sans-serif" font-weight="700" font-size="28" fill="${c}" text-anchor="middle">${e.label}</text>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts}</svg>`;
  const drawn = await sharp(jpeg).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  return sharp(drawn).resize(outW).jpeg({ quality: 86 }).toBuffer();
}

/** Ask Muse Spark which two lettered lines the pole has to span. */
export async function askSpan(api: OpenAI, labelled: Buffer, letters: string[], transcript: string, measured = "", model = "muse-spark-1.3"): Promise<{ left: string; right: string; why: string } | null> {
  const res: any = await api.responses.create({
    model, max_output_tokens: 12000,
    input: [{ role: "user", content: [
      { type: "input_image", image_url: `data:image/jpeg;base64,${labelled.toString("base64")}` },
      { type: "input_text", text:
`A buyer filmed this window with a sheet of A4 on the wall; they want a curtain pole fixed on the wall above it.${transcript ? ` They said: "${transcript.slice(0, 600)}".` : ""}
I've drawn lettered vertical lines (${letters.join(", ")}). ${measured ? `Lines ${measured} are the window's outer edges as my measuring tool found them; the others are strong edges further out on the wall.` : ""} The pole has to span the window's opening as seen on the main wall face: the outside of any trim or surround, or, if the window is set back in a recess, the edges of the recess opening where it meets the wall face (not the frame inside the recess). Which line is the left edge of that span, and which is the right? JSON only: {"left": "<letter>", "right": "<letter>", "why": "<a few words>"}` },
    ] }],
  } as any);
  const t: string = res.output_text ?? "";
  const m = t.match(/\{[\s\S]*\}/); if (!m) return null;
  try { const j = JSON.parse(m[0]); if (letters.includes(j.left) && letters.includes(j.right)) return { left: j.left, right: j.right, why: String(j.why ?? "").slice(0, 160) }; } catch {}
  return null;
}

export async function pickSpan(api: OpenAI, jpeg: Buffer, rgb: RGB, G: number[], wall: { x0: number; y0: number; w: number; h: number }, heightKnown: boolean, transcript: string): Promise<SpanPick | null> {
  const edges = wallEdges(rgb, G, wall, heightKnown);
  if (edges.length < 2) return null;
  const img = await labelledFrame(jpeg, G, wall, heightKnown, edges);
  const a = await askSpan(api, img, edges.map((e) => e.label), transcript, edges.filter((e) => e.measured).map((e) => e.label).join(" and "));
  if (!a) return null;
  const L = edges.find((e) => e.label === a.left)!, R = edges.find((e) => e.label === a.right)!;
  if (R.xMm <= L.xMm) return null;
  return { leftMm: L.xMm, rightMm: R.xMm, widthMm: R.xMm - L.xMm, left: a.left, right: a.right, why: a.why, edges };
}

// The whole job for one buyer clip: measure (SAM + geometry), read the hands (SAM), hear the buyer
// (Voice Transcribe), size from the catalogue (code), draft the maker's reply (Muse Spark). Shared by the CLI,
// the local server and the hosted API.
import type OpenAI from "openai";
import sharp from "sharp";
import { toFile } from "openai";
import { client, segmentImage, segmentVideo, fullMask, type SamObject } from "./sam.ts";
import { measureStill, measureWithMasks, loadRGB, WINDOW_PROMPTS, type StillResult } from "./measure.ts";
import { apply, invert, summarise, type Pt } from "./geometry.ts";
import { sizeOptions, type Option } from "./catalogue.ts";
import { draftReply, type Draft } from "./agent.ts";

export type HandPoint = { frame: number; img: Pt; wallX: number; wallY: number };
export type Result = {
  ok: boolean;
  reason?: string;
  frames: { index: number; width: number; height: number; ok: boolean; reason?: string; widthMm?: number; sheet?: Pt[]; window?: Pt[]; G?: number[]; wall?: any; tiltDeg?: number }[];
  heroFrame?: number;
  widthMm?: number;
  heightMm?: number | null;
  spreadMm?: number;
  framesUsed?: number;
  hands: HandPoint[];
  handSpan?: { leftPastFrameMm: number; rightPastFrameMm: number } | null;
  transcript: string;
  options: Option[];
  draft?: Draft;
  timingsMs: Record<string, number>;
  models: string[];
};

const t = () => Date.now();

/** Fingertip estimate for a hand mask: the mask pixel furthest up the image (people point up and across at a wall). */
function fingertip(o: SamObject): Pt {
  const { x0, y0, w, h, data } = o.crop;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[y * w + x]) return { x: x0 + x, y: y0 + y };
  return { x: (o.box.left + o.box.right) / 2, y: o.box.top };
}

export async function transcribeWav(apiKey: string, wav: Buffer): Promise<string> {
  const fd = new FormData();
  fd.append("request", new Blob([JSON.stringify({
    model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK", languageBias: ["English"],
    keywords: ["curtain pole", "eyelet", "eyelets", "finial", "bracket", "alcove", "bay window", "architrave", "A4", "pinch pleat", "tab top", "blackout"],
  })], { type: "application/json" }));
  fd.append("audio", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "a.wav");
  const res = await fetch("https://api.meta.ai/v1/asr/transcribe", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, body: fd });
  if (!res.ok) throw new Error(`transcribe ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j: any = await res.json();
  return (j.transcript ?? "").trim();
}

/** The image path (no video upload): SAM image calls per frame. Slower; used for stills and as a fallback. */
export async function run(apiKey: string, input: { frames: Buffer[]; wav?: Buffer; buyerMessage?: string; diameterMm?: number; draft?: boolean }): Promise<Result> {
  const api: OpenAI = client(apiKey);
  const timings: Record<string, number> = {};
  const t0 = t();
  const [per, hands, transcript] = await Promise.all([
    Promise.all(input.frames.map((f) => measureStill(api, f).catch((e): StillResult => ({ ok: false, reason: String(e?.message || e) })))),
    Promise.all(input.frames.map((f) => segmentImage(api, `data:image/jpeg;base64,${f.toString("base64")}`, "hand").catch(() => [] as SamObject[]))),
    input.wav ? transcribeWav(apiKey, input.wav).catch((e) => `(transcription failed: ${e.message})`) : Promise.resolve(""),
  ]);
  timings.measureMs = t() - t0;
  return finish(api, apiKey, { per, frameIdx: input.frames.map((_, i) => i), frameBufs: input.frames, hands, transcript, buyerMessage: input.buyerMessage, diameterMm: input.diameterMm, draft: input.draft, timings, t0 });
}

async function finish(api: OpenAI, apiKey: string, a: { per: StillResult[]; frameIdx: number[]; frameBufs: Buffer[]; hands: SamObject[][]; transcript: string; buyerMessage?: string; diameterMm?: number; draft?: boolean; timings: Record<string, number>; t0: number }): Promise<Result> {
  const { per, frameIdx, transcript, timings } = a;
  const diameter = a.diameterMm ?? 35;
  const sizes = await Promise.all(frameIdx.map((i) => sharp(a.frameBufs[i]).metadata()));
  const frames = per.map((r, k) => r.ok
    ? { index: frameIdx[k], width: sizes[k].width!, height: sizes[k].height!, ok: true, widthMm: r.widthMm, sheet: r.sheet, window: r.window, G: r.G, wall: r.wall, tiltDeg: r.sheetTiltDeg }
    : { index: frameIdx[k], width: sizes[k].width!, height: sizes[k].height!, ok: false, reason: r.reason, sheet: (r as any).sheet, window: (r as any).window });
  let good = per.map((r, k) => ({ r, i: frameIdx[k] })).filter((x): x is { r: Extract<StillResult, { ok: true }>; i: number } => x.r.ok);
  const result: Result = { ok: false, frames, hands: [], transcript, options: [], timingsMs: timings, models: [] };
  if (good.length < 3) {
    const counts = new Map<string, number>(); per.filter((r) => !r.ok).forEach((r: any) => counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1));
    result.reason = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "not enough clear frames";
    timings.totalMs = t() - a.t0;
    return result;
  }
  // Drop frames that disagree with the rest (a hand over an edge, motion blur): keep within 2.5 MADs (min 8 mm).
  const med0 = summarise(good.map((g) => g.r.widthMm)).median;
  const mad = summarise(good.map((g) => Math.abs(g.r.widthMm - med0))).median;
  good = good.filter((g) => Math.abs(g.r.widthMm - med0) <= Math.max(8, 2.5 * 1.4826 * mad));
  if (good.length < 3) { result.reason = "not enough frames agree; hold the phone steadier"; timings.totalMs = t() - a.t0; return result; }
  const w = summarise(good.map((g) => g.r.widthMm));
  const hs = good.map((g) => g.r.heightMm).filter((v): v is number => v !== null);
  if (w.iqr > 25) { result.reason = `frames disagree by ${Math.round(w.iqr)} mm; hold the phone steadier`; timings.totalMs = t() - a.t0; return result; }
  const hero = good.reduce((x, y) => (Math.abs(y.r.widthMm - w.median) < Math.abs(x.r.widthMm - w.median) ? y : x));
  Object.assign(result, { ok: true, widthMm: w.median, heightMm: hs.length ? summarise(hs).median : null, spreadMm: w.iqr, framesUsed: good.length, heroFrame: hero.i });
  frames.forEach((f) => { if (f.ok && !good.some((g) => g.i === f.index)) { (f as any).outlier = true; } });

  // Hands: project each fingertip onto the wall with the nearest measured frame's geometry. A hand is in front of
  // the wall, so this is the point it covers from the camera: the buyer's intent, not a measurement.
  a.hands.forEach((objs, i) => {
    const near = good.reduce((x, y) => (Math.abs(y.i - i) < Math.abs(x.i - i) ? y : x));
    const Hinv = invert(near.r.G);
    for (const o of objs) {
      if (o.confidence < 0.5) continue;
      const tip = fingertip(o); const wpt = apply(Hinv, tip);
      result.hands.push({ frame: i, img: tip, wallX: wpt.x, wallY: wpt.y });
    }
  });
  if (result.hands.length >= 2) {
    const wall = hero.r.wall, left = wall.x0, right = wall.x0 + wall.w;
    const xs = result.hands.map((h) => h.wallX);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    result.handSpan = minX < left + 50 && maxX > right - 50 ? { leftPastFrameMm: left - minX, rightPastFrameMm: maxX - right } : null;
  }

  result.options = sizeOptions(w.median, diameter);
  if (a.draft !== false) {
    const t1 = t();
    const hs2 = result.handSpan ? [Math.round(result.handSpan.leftPastFrameMm / 10), Math.round(result.handSpan.rightPastFrameMm / 10)] as [number, number] : undefined;
    try { result.draft = await draftReply(api, { transcript, buyerMessage: a.buyerMessage, frameWidthMm: w.median, spreadMm: w.iqr, options: result.options, diameterMm: diameter, handSpanCm: hs2 }); result.models.push("muse-spark-1.3"); }
    catch (e: any) { result.reason = `reply draft failed: ${e.message}`; }
    timings.draftMs = t() - t1;
  }
  timings.totalMs = t() - a.t0;
  return result;
}

/** Sharpness score: variance of a Laplacian on a small grey copy. */
async function sharpness(jpeg: Buffer): Promise<number> {
  const { data, info } = await sharp(jpeg).greyscale().resize(480).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height; let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; const l = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - W] - data[i + W]; s += l; s2 += l * l; n++; }
  return s2 / n - (s / n) ** 2;
}

/**
 * The video path: one upload, one SAM 3.1 tracking call per thing we look for (the sheet, the window three ways,
 * the buyer's hands), each returning masks for every frame with identities kept. Then the geometry runs on the
 * sharpest frames where both the sheet and the window were tracked.
 */
export async function runClip(apiKey: string, input: { mp4: Buffer; frames: Buffer[]; fps: number; wav?: Buffer; buyerMessage?: string; diameterMm?: number; draft?: boolean; maxFrames?: number }): Promise<Result & { fps: number }> {
  const api: OpenAI = client(apiKey);
  const timings: Record<string, number> = {};
  const t0 = t();
  const file: any = await api.files.create({ file: await toFile(input.mp4, "clip.mp4", { type: "video/mp4" }), purpose: "user_data", expires_after: { anchor: "created_at", seconds: 3600 } } as any);
  timings.uploadMs = t() - t0;
  const t1 = t();
  const prompts = ["sheet of paper", ...WINDOW_PROMPTS, "hand"];
  const [tracks, transcript] = await Promise.all([
    Promise.all(prompts.map((p) => segmentVideo(api, file.id, p).catch(() => [] as SamObject[]))),
    input.wav ? transcribeWav(apiKey, input.wav).catch((e) => `(transcription failed: ${e.message})`) : Promise.resolve(""),
  ]);
  timings.samMs = t() - t1;
  api.files.del?.(file.id).catch?.(() => {});
  const byFrame = (objs: SamObject[], i: number) => objs.filter((o) => o.frame === i);
  const sheetT = tracks[0], winT = tracks.slice(1, 1 + WINDOW_PROMPTS.length), handT = tracks[tracks.length - 1];

  // Candidate frames: sheet and a window both tracked. Take the sharpest, spread across the clip.
  const t2 = t();
  const cand = input.frames.map((_, i) => i).filter((i) => byFrame(sheetT, i).length && winT.some((w) => byFrame(w, i).length));
  const sharp_ = await Promise.all(cand.map((i) => sharpness(input.frames[i])));
  const want = input.maxFrames ?? 10;
  const picked: number[] = [];
  for (let k = 0; k < want && cand.length; k++) {
    const lo = Math.floor((k * cand.length) / want), hi = Math.max(lo + 1, Math.floor(((k + 1) * cand.length) / want));
    let best = lo; for (let j = lo; j < hi && j < cand.length; j++) if (sharp_[j] > sharp_[best]) best = j;
    if (!picked.includes(cand[best])) picked.push(cand[best]);
  }
  const per = await Promise.all(picked.map(async (i) => {
    try { const rgb = await loadRGB(input.frames[i]); return measureWithMasks(rgb, byFrame(sheetT, i), winT.map((w) => byFrame(w, i)), WINDOW_PROMPTS); }
    catch (e: any) { return { ok: false, reason: String(e?.message || e) } as StillResult; }
  }));
  timings.geometryMs = t() - t2;
  // Reuse the frame-path logic for aggregation, hands and drafting.
  const r = await finish(api, apiKey, { per, frameIdx: picked, frameBufs: input.frames, hands: input.frames.map((_, i) => byFrame(handT, i)), transcript, buyerMessage: input.buyerMessage, diameterMm: input.diameterMm, draft: input.draft, timings, t0 });
  r.models = ["sam-3.1 (video tracking)", "muse-voice-transcribe-1.0", ...r.models.filter((m) => m.startsWith("muse-spark"))];
  return { ...r, fps: input.fps };
}

export { fullMask };

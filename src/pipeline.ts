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
  good = good.filter((g) => Math.abs(g.r.widthMm - med0) <= Math.max(15, 2.5 * 1.4826 * mad));
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
 * The clip path. SAM 3.1 tracks the buyer's hands through the whole clip in one video call; the sheet and the window
 * are segmented on the sharpest frames (image calls, which give the cleanest edges); Voice Transcribe hears the
 * request; the geometry runs on frames with no hand in the way.
 */
export async function runClip(apiKey: string, input: { mp4: Buffer; frames: Buffer[]; fps: number; wav?: Buffer; buyerMessage?: string; diameterMm?: number; draft?: boolean; maxFrames?: number }): Promise<Result & { fps: number }> {
  const api: OpenAI = client(apiKey);
  const timings: Record<string, number> = {};
  const t0 = t();
  // Pick the sharpest frames, spread across the clip.
  const sharpAll = await Promise.all(input.frames.map((f) => sharpness(f)));
  const want = input.maxFrames ?? 8, n = input.frames.length;
  const picked: number[] = [];
  for (let k = 0; k < want; k++) {
    const lo = Math.floor((k * n) / want), hi = Math.max(lo + 1, Math.floor(((k + 1) * n) / want));
    let best = lo; for (let j = lo; j < hi && j < n; j++) if (sharpAll[j] > sharpAll[best]) best = j;
    if (!picked.includes(best)) picked.push(best);
  }
  const handsP = (async () => {
    const file: any = await api.files.create({ file: await toFile(input.mp4, "clip.mp4", { type: "video/mp4" }), purpose: "user_data", expires_after: { anchor: "created_at", seconds: 3600 } } as any);
    timings.uploadMs = t() - t0;
    const h = await segmentVideo(api, file.id, "hand");
    timings.handsMs = t() - t0;
    return h;
  })().catch((e) => { timings.handsFailed = 1; return [] as SamObject[]; });
  const [per0, handT, transcript] = await Promise.all([
    Promise.all(picked.map((i) => measureStill(api, input.frames[i]).catch((e): StillResult => ({ ok: false, reason: String(e?.message || e) })))),
    handsP,
    input.wav ? transcribeWav(apiKey, input.wav).catch((e) => `(transcription failed: ${e.message})`) : Promise.resolve(""),
  ]);
  timings.measureMs = t() - t0;
  // Measure the same thing in every frame: the window outline (frame, surround or wooden frame) most frames chose.
  // Re-measure every frame against each outline on its own; keep the widest outline (the outermost part of the window
  // on the wall, which the pole must clear) that measures in at least half the frames.
  const only = (j: number) => per0.map((r) => { const m = (r as any).masks; return m ? measureWithMasks(m.rgb, m.sheets, m.wins.map((w: SamObject[], q: number) => (q === j ? w : [])), WINDOW_PROMPTS) : r; });
  const variants = WINDOW_PROMPTS.map((_, j) => only(j));
  const okCount = Math.max(1, per0.filter((r) => r.ok).length);
  const scored = variants.map((v, j) => { const ws = v.filter((r) => r.ok).map((r: any) => r.widthMm); return { j, v, n: ws.length, med: ws.length ? summarise(ws).median : 0 }; })
    .filter((x) => x.n >= Math.max(3, Math.ceil(okCount / 2)));
  if (scored.length) { const pick = scored.sort((x, y) => y.med - x.med)[0]; per0.splice(0, per0.length, ...pick.v); timings.windowOutline = pick.j; }
  const byFrame = (objs: SamObject[], i: number) => objs.filter((o) => o.frame === i);
  // Frames with a hand in view are set aside when enough hand-free frames measured.
  const handFree = picked.map((i, k) => ({ i, k })).filter(({ i, k }) => per0[k].ok && !byFrame(handT, i).some((o) => o.confidence >= 0.5));
  let per = per0, idx = picked;
  if (handFree.length >= 3) { per = handFree.map((x) => per0[x.k]); idx = handFree.map((x) => x.i); timings.framesWithHandsSetAside = picked.length - handFree.length; }
  const r = await finish(api, apiKey, { per, frameIdx: idx, frameBufs: input.frames, hands: input.frames.map((_, i) => byFrame(handT, i)), transcript, buyerMessage: input.buyerMessage, diameterMm: input.diameterMm, draft: input.draft, timings, t0 });
  r.models = ["sam-3.1", "sam-3.1 (video tracking: hands)", "muse-voice-transcribe-1.0", ...r.models.filter((m) => m.startsWith("muse-spark"))];
  return { ...r, fps: input.fps };
}

export { fullMask };

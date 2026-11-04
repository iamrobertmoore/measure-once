// The whole job for one buyer clip: measure (SAM + geometry), read the hands (SAM), hear the buyer
// (Voice Transcribe), size from the catalogue (code), draft the maker's reply (Muse Spark). Shared by the CLI,
// the local server and the hosted API.
import type OpenAI from "openai";
import sharp from "sharp";
import { toFile } from "openai";
import { client, segmentImage, segmentVideo, fullMask, type SamObject } from "./sam.ts";
import { pickSpan } from "./span.ts";
import { blindOptions, draftBlindReply } from "./blinds.ts";
import { curtainOptions, draftCurtainReply } from "./curtains.ts";
import { loadRGB } from "./measure.ts";
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
  blinds?: { options: any[]; draft?: { reply: string; questions: string[] }; model: string };
  curtains?: { options: any[]; draft?: { reply: string; questions: string[]; ranOn?: string } };
  span?: { adopted: boolean; widthMm: number; frameWidthMm: number; why: string; left: string; right: string; edges: any[]; votes: string };
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

async function finish(api: OpenAI, apiKey: string, a: { per: StillResult[]; frameIdx: number[]; frameBufs: Buffer[]; hands: SamObject[][]; transcript: string; buyerMessage?: string; diameterMm?: number; draft?: boolean; timings: Record<string, number>; t0: number; minFrames?: number; seller?: "poles" | "blinds" | "curtains" }): Promise<Result> {
  const { per, frameIdx, transcript, timings } = a;
  const diameter = a.diameterMm ?? 35;
  const sizes = await Promise.all(frameIdx.map((i) => sharp(a.frameBufs[i]).metadata()));
  const frames = per.map((r, k) => r.ok
    ? { index: frameIdx[k], width: sizes[k].width!, height: sizes[k].height!, ok: true, widthMm: r.widthMm, sheet: r.sheet, window: r.window, G: r.G, wall: r.wall, tiltDeg: r.sheetTiltDeg }
    : { index: frameIdx[k], width: sizes[k].width!, height: sizes[k].height!, ok: false, reason: r.reason, sheet: (r as any).sheet, window: (r as any).window });
  let good = per.map((r, k) => ({ r, i: frameIdx[k] })).filter((x): x is { r: Extract<StillResult, { ok: true }>; i: number } => x.r.ok);
  const result: Result = { ok: false, frames, hands: [], transcript, options: [], timingsMs: timings, models: [] };
  const minF = a.minFrames ?? 3;
  if (good.length < minF) {
    const counts = new Map<string, number>(); per.filter((r) => !r.ok).forEach((r: any) => counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1));
    result.reason = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "not enough clear frames";
    timings.totalMs = t() - a.t0;
    return result;
  }
  // Drop frames that disagree with the rest (a hand over an edge, motion blur): keep within 2.5 MADs (min 8 mm).
  const med0 = summarise(good.map((g) => g.r.widthMm)).median;
  const mad = summarise(good.map((g) => Math.abs(g.r.widthMm - med0))).median;
  good = good.filter((g) => Math.abs(g.r.widthMm - med0) <= Math.max(15, 2.5 * 1.4826 * mad));
  if (good.length < minF) { result.reason = "not enough frames agree; hold the phone steadier"; timings.totalMs = t() - a.t0; return result; }
  const w = summarise(good.map((g) => g.r.widthMm));
  const hs = good.map((g) => g.r.heightMm).filter((v): v is number => v !== null);
  // Frames that disagree usually mean a window set back in a recess (the frame shifts against the wall as the phone
  // moves), or a sheet that isn't flat on the wall. Don't refuse yet: if Muse Spark and the frames agree on an opening
  // in the wall plane (which doesn't shift), that's the measurement. Otherwise refuse below.
  const spreadTooWide = w.iqr > Math.max(25, 0.015 * w.median);
  const disagreeReason = w.iqr > 0.1 * w.median ? "the frames don't agree; is the sheet flat on the wall beside the window?" : `frames disagree by ${Math.round(w.iqr)} mm; hold the phone steadier`;
  const hero = good.reduce((x, y) => (Math.abs(y.r.widthMm - w.median) < Math.abs(x.r.widthMm - w.median) ? y : x));
  Object.assign(result, { ok: true, widthMm: w.median, heightMm: hs.length ? summarise(hs).median : null, spreadMm: w.iqr, framesUsed: good.length, heroFrame: hero.i });
  frames.forEach((f) => { if (f.ok && !good.some((g) => g.i === f.index)) { (f as any).outlier = true; } });

  // Which edges does the pole span? Muse Spark picks among edges the code found on the wall plane (the measured
  // outline, or something wider such as a recess opening); the code measures between them. Up to five frames vote.
  const t2 = t();
  const voters = [hero, ...good.filter((g) => g !== hero)].slice(0, 5); // five votes: a faint recess edge in one frame is usually clear in another
  const picks = (await Promise.all(voters.map(async (g) => {
    const buf = a.frameBufs[g.i];
    const p = await pickSpan(api, buf, await loadRGB(buf), g.r.G, g.r.wall, g.r.heightMm !== null, transcript).catch(() => null);
    return p ? { g, p } : null;
  }))).filter((x): x is NonNullable<typeof x> => !!x);
  timings.spanMs = t() - t2;
  const margin = (x: (typeof picks)[number]) => Math.max(30, 0.03 * x.g.r.widthMm);
  const wider = picks.filter((x) => x.p.widthMm > x.g.r.widthMm + margin(x));
  // A frame where the code found no edge wider than the outline had nothing else to pick, so its "the outline" isn't
  // a vote against a wider opening (the recess edge can be faint in one frame and clear in the next).
  const couldBeWider = (x: (typeof picks)[number]) => {
    const xs = x.p.edges.filter((e) => e.measured).map((e) => e.xMm), lo = Math.min(...xs), hi = Math.max(...xs);
    return x.p.edges.some((e) => !e.measured && (e.xMm < lo - margin(x) / 2 || e.xMm > hi + margin(x) / 2));
  };
  const sameAsOutline = picks.filter((x) => Math.abs(x.p.widthMm - x.g.r.widthMm) < 15 && couldBeWider(x));
  for (const by of new Set(picks.map((x: any) => x.p?.by ?? x.by).filter(Boolean))) result.models.push(`${by} (which edges)`);
  // Adopt a wider span only when the frames agree on it: the largest group of wider picks within 25 mm of each other,
  // at least two frames (one, if only one frame could be asked), and more than the frames that said "the outline".
  const groups = wider.map((x) => wider.filter((y) => Math.abs(y.p.widthMm - x.p.widthMm) <= 25));
  const agree = groups.sort((u, v) => v.length - u.length)[0] ?? [];
  if (agree.length >= Math.min(2, picks.length) && agree.length > sameAsOutline.length) {
    const spanW = summarise(agree.map((x) => x.p.widthMm)).median;
    const hp = agree.find((x) => x.g === hero) ?? agree[0];
    const hf: any = frames.find((f) => f.index === hp.g.i);
    hf.frameWall = hf.wall; hf.wall = { ...hf.wall, x0: hp.p.leftMm, w: hp.p.widthMm };
    if (hp.g !== hero) result.heroFrame = hp.g.i;
    result.span = { adopted: true, widthMm: spanW, frameWidthMm: w.median, why: hp.p.why, left: hp.p.left, right: hp.p.right, edges: hp.p.edges, votes: `${agree.length} of ${picks.length}` };
    result.widthMm = spanW;
    if (spreadTooWide) { const ws = agree.map((x) => x.p.widthMm); result.spreadMm = Math.max(...ws) - Math.min(...ws); (result as any).spreadFrom = "the opening, across the frames that agreed"; }
  } else if (picks.length) {
    const hp = picks.find((x) => x.g === hero) ?? picks[0];
    result.span = { adopted: false, widthMm: hp.p.widthMm, frameWidthMm: w.median, why: hp.p.why, left: hp.p.left, right: hp.p.right, edges: hp.p.edges, votes: sameAsOutline.length ? `${sameAsOutline.length} of ${picks.length} agreed with the outline` : `the ${picks.length} frames didn't agree on a wider opening` };
  }
  if (spreadTooWide && !result.span?.adopted) {
    Object.assign(result, { ok: false, reason: disagreeReason, widthMm: undefined, spreadMm: undefined }); timings.totalMs = t() - a.t0; return result;
  }
  const sizingMm = result.widthMm!;
  const heroWall: any = (frames.find((f) => f.index === result.heroFrame) as any).wall;

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
    const wall = heroWall, left = wall.x0, right = wall.x0 + wall.w;
    const xs = result.hands.map((h) => h.wallX);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    result.handSpan = minX < left + 50 && maxX > right - 50 ? { leftPastFrameMm: left - minX, rightPastFrameMm: maxX - right } : null;
  }

  result.options = sizeOptions(sizingMm, diameter);
  if (a.seller === "blinds") {
    // Another maker's rules on the same measurement: a made-to-measure roller blind.
    const t1 = t(), recess = !!result.span?.adopted;
    const options = blindOptions({ openingMm: sizingMm, recess, heightMm: result.heightMm ?? null });
    result.blinds = { options, model: "muse-spark-1.3" };
    if (a.draft !== false) {
      try { result.blinds.draft = await draftBlindReply(api, { transcript, openingMm: sizingMm, recess, frameMm: recess ? w.median : undefined, heightMm: result.heightMm ?? null, options }); }
      catch (e: any) { result.reason = `reply draft failed: ${e.message}`; }
    }
    timings.draftMs = t() - t1; timings.totalMs = t() - a.t0;
    if (!result.models.includes("muse-spark-1.3")) result.models.push("muse-spark-1.3");
    return result;
  }
  if (a.seller === "curtains" && result.options[0]) {
    // A third maker's rules: curtains for the pole my rules picked.
    const t1 = t();
    result.curtains = { options: curtainOptions({ pole: result.options[0], heightMm: result.heightMm ?? null }) };
    if (a.draft !== false) {
      try { const d = await draftCurtainReply(api, { transcript, openingMm: sizingMm, recess: !!result.span?.adopted, options: result.curtains.options }); result.curtains.draft = d; result.models.push(d.ranOn); }
      catch (e: any) { result.reason = `reply draft failed: ${e.message}`; }
    }
    timings.draftMs = t() - t1; timings.totalMs = t() - a.t0;
    return result;
  }
  if (a.draft !== false) {
    const t1 = t();
    const hs2 = result.handSpan ? [Math.round(result.handSpan.leftPastFrameMm / 10), Math.round(result.handSpan.rightPastFrameMm / 10)] as [number, number] : undefined;
    try { result.draft = await draftReply(api, { transcript, buyerMessage: a.buyerMessage, frameWidthMm: sizingMm, windowFrameMm: result.span?.adopted ? w.median : undefined, spreadMm: w.iqr, options: result.options, diameterMm: diameter, handSpanCm: hs2, framesUsed: result.framesUsed }); result.models.push(result.draft.ranOn || "muse-spark-1.3"); }
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
export async function runClip(apiKey: string, input: { mp4?: Buffer; frames: Buffer[]; fps: number; wav?: Buffer; buyerMessage?: string; diameterMm?: number; draft?: boolean; maxFrames?: number; paper?: "A4" | "Letter"; minFrames?: number; seller?: "poles" | "blinds" | "curtains" }): Promise<Result & { fps: number }> {
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
  const handsP = !input.mp4 ? Promise.resolve([] as SamObject[]) : (async () => {
    const file: any = await api.files.create({ file: await toFile(input.mp4!, "clip.mp4", { type: "video/mp4" }), purpose: "user_data", expires_after: { anchor: "created_at", seconds: 3600 } } as any);
    timings.uploadMs = t() - t0;
    const h = await segmentVideo(api, file.id, "hand");
    timings.handsMs = t() - t0;
    return h;
  })().catch((e) => { timings.handsFailed = 1; return [] as SamObject[]; });
  // The hands say where the buyer pointed past the frame; the width itself never waits on a slow tracking call.
  let handsDone = false; handsP.finally(() => { handsDone = true; });
  // Only a call still running at the cap counts as timed out (before, the flag was set on every run).
  const handsCapped = Promise.race([handsP, new Promise<SamObject[]>((res) => { setTimeout(() => { if (!handsDone) timings.handsTimedOut = 1; res([]); }, Number(process.env.HANDS_TIMEOUT_MS || 35000)).unref?.(); })]);
  const [per0, handT, transcript] = await Promise.all([
    Promise.all(picked.map((i) => measureStill(api, input.frames[i], input.paper).catch((e): StillResult => ({ ok: false, reason: String(e?.message || e) })))),
    handsCapped,
    input.wav ? transcribeWav(apiKey, input.wav).catch((e) => `(transcription failed: ${e.message})`) : Promise.resolve(""),
  ]);
  timings.measureMs = t() - t0;
  // Measure the same thing in every frame: the window outline (frame, surround or wooden frame) most frames chose.
  // Re-measure every frame against each outline on its own; keep the widest outline (the outermost part of the window
  // on the wall, which the pole must clear) that measures in at least half the frames.
  const only = (j: number) => per0.map((r) => { const m = (r as any).masks; return m ? measureWithMasks(m.rgb, m.sheets, m.wins.map((w: SamObject[], q: number) => (q === j ? w : [])), WINDOW_PROMPTS, input.paper) : r; });
  const variants = WINDOW_PROMPTS.map((_, j) => only(j));
  const okCount = Math.max(1, per0.filter((r) => r.ok).length);
  const scored = variants.map((v, j) => { const ws = v.filter((r) => r.ok).map((r: any) => r.widthMm); return { j, v, n: ws.length, med: ws.length ? summarise(ws).median : 0 }; })
    .filter((x) => x.n >= Math.max(Math.min(3, input.minFrames ?? 3), Math.ceil(okCount / 2)));
  // The widest reading wins only when it's clearly wider (over 2%) than the reading seen in the most frames;
  // otherwise more frames beat a few millimetres, because the median of six beats the median of three.
  if (scored.length) {
    const most = [...scored].sort((x, y) => y.n - x.n || y.med - x.med)[0];
    const widest = [...scored].sort((x, y) => y.med - x.med)[0];
    const pick = widest.med > most.med * 1.02 ? widest : most;
    per0.splice(0, per0.length, ...pick.v); timings.windowOutline = pick.j;
  }
  const byFrame = (objs: SamObject[], i: number) => objs.filter((o) => o.frame === i);
  // Frames where a hand covers the sheet or one of the window's sides are set aside when enough clear frames
  // measured. A hand elsewhere in the picture (pointing at the top of the window, say) doesn't touch the numbers.
  const inTheWay = (o: SamObject, r: any) => {
    const ov = (x0: number, y0: number, x1: number, y1: number) => o.box.left < x1 && o.box.right > x0 && o.box.top < y1 && o.box.bottom > y0;
    const xs = (q: Pt[]) => q.map((p) => p.x), ys = (q: Pt[]) => q.map((p) => p.y), pad = 30;
    const S = r.sheet as Pt[], Wq = r.window as Pt[];
    if (ov(Math.min(...xs(S)) - pad, Math.min(...ys(S)) - pad, Math.max(...xs(S)) + pad, Math.max(...ys(S)) + pad)) return true;
    const y0 = Math.min(...ys(Wq)), y1 = Math.max(...ys(Wq));
    for (const side of [[Wq[0], Wq[3]], [Wq[1], Wq[2]]]) { const x = (side[0].x + side[1].x) / 2; if (ov(x - pad, y0, x + pad, y1)) return true; }
    return false;
  };
  const handFree = picked.map((i, k) => ({ i, k })).filter(({ i, k }) => per0[k].ok && !byFrame(handT, i).some((o) => o.confidence >= 0.5 && inTheWay(o, per0[k])));
  let per = per0, idx = picked;
  if (handFree.length >= 4) { per = handFree.map((x) => per0[x.k]); idx = handFree.map((x) => x.i); timings.framesWithHandsSetAside = picked.length - handFree.length; }
  const r = await finish(api, apiKey, { per, frameIdx: idx, frameBufs: input.frames, hands: input.frames.map((_, i) => byFrame(handT, i)), transcript, buyerMessage: input.buyerMessage, diameterMm: input.diameterMm, draft: input.draft, timings, t0, minFrames: input.minFrames, seller: input.seller });
  r.models = ["sam-3.1", ...(input.mp4 ? ["sam-3.1 (video tracking: hands)"] : []), "muse-voice-transcribe-1.0", ...r.models.filter((m) => m.includes("muse-spark"))];
  return { ...r, fps: input.fps };
}

export { fullMask };

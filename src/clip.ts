// A buyer's 10-second clip: pick the sharpest frames, measure each, combine. Transcribe the voice note.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type OpenAI from "openai";
import { measureStill, type StillResult } from "./measure.ts";
import { summarise } from "./geometry.ts";

const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

async function sharpness(jpeg: Buffer): Promise<number> {
  // Variance of a Laplacian on a downscaled grey copy: higher = sharper.
  const { data, info } = await sharp(jpeg).greyscale().resize(640).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height; let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; const l = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - W] - data[i + W];
    s += l; s2 += l * l; n++;
  }
  return s2 / n - (s / n) ** 2;
}

export async function frames(videoPath: string, fps = 4, keep = 8): Promise<{ t: number; jpeg: Buffer; sharp: number }[]> {
  const dir = await mkdtemp(join(tmpdir(), "mo-"));
  try {
    await run(FFMPEG, ["-v", "error", "-i", videoPath, "-vf", `fps=${fps}`, "-q:v", "2", join(dir, "f%04d.jpg")]);
    const names = (await readdir(dir)).filter((n) => n.endsWith(".jpg")).sort();
    const all = await Promise.all(names.map(async (n, i) => { const jpeg = await readFile(join(dir, n)); return { t: i / fps, jpeg, sharp: await sharpness(jpeg) }; }));
    // Split the clip into `keep` time slices and take the sharpest frame in each, so frames span the clip.
    const out: typeof all = [];
    for (let k = 0; k < keep; k++) {
      const slice = all.slice(Math.floor((k * all.length) / keep), Math.floor(((k + 1) * all.length) / keep));
      if (slice.length) out.push(slice.reduce((a, b) => (b.sharp > a.sharp ? b : a)));
    }
    return out;
  } finally { await rm(dir, { recursive: true, force: true }); }
}

export type ClipMeasurement =
  | { ok: true; widthMm: number; heightMm: number; spreadMm: number; framesUsed: number; framesTried: number; perFrame: StillResult[] }
  | { ok: false; reason: string; framesUsed: number; framesTried: number; perFrame: StillResult[] };

export async function measureClip(api: OpenAI, videoPath: string): Promise<ClipMeasurement> {
  const fr = await frames(videoPath);
  const perFrame = await Promise.all(fr.map((f) => measureStill(api, f.jpeg).catch((e) => ({ ok: false as const, reason: String(e?.message || e) }))));
  const good = perFrame.filter((r): r is Extract<StillResult, { ok: true }> => r.ok);
  if (good.length < 3) {
    const reasons = perFrame.filter((r) => !r.ok).map((r: any) => r.reason);
    const top = reasons.sort((a, b) => reasons.filter((x) => x === b).length - reasons.filter((x) => x === a).length)[0] || "not enough clear frames";
    return { ok: false, reason: top, framesUsed: good.length, framesTried: fr.length, perFrame };
  }
  const w = summarise(good.map((g) => g.widthMm)), h = summarise(good.map((g) => g.heightMm));
  if (w.iqr > 20) return { ok: false, reason: `frames disagree by ${Math.round(w.iqr)} mm`, framesUsed: good.length, framesTried: fr.length, perFrame };
  return { ok: true, widthMm: w.median, heightMm: h.median, spreadMm: w.iqr, framesUsed: good.length, framesTried: fr.length, perFrame };
}

/** The buyer's voice: Muse Voice Transcribe with curtain-pole keywords. */
export async function transcribe(apiKey: string, videoPath: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mo-a-"));
  try {
    const wav = join(dir, "a.wav");
    await run(FFMPEG, ["-v", "error", "-i", videoPath, "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-map_metadata", "-1", wav]);
    const fd = new FormData();
    fd.append("request", new Blob([JSON.stringify({
      model: "muse-voice-transcribe-1.0", audioEncoding: "WAV", mode: "PUSH_TO_TALK", languageBias: ["English"],
      keywords: ["curtain pole", "eyelet", "finial", "bracket", "alcove", "bay window", "reveal", "architrave", "A4", "pinch pleat", "tab top"],
    })], { type: "application/json" }));
    fd.append("audio", new Blob([await readFile(wav)], { type: "audio/wav" }), "a.wav");
    const res = await fetch("https://api.meta.ai/v1/asr/transcribe", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, body: fd });
    if (!res.ok) throw new Error(`transcribe ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j: any = await res.json();
    return j.transcript ?? "";
  } finally { await rm(dir, { recursive: true, force: true }); }
}

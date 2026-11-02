// Turn a phone clip into what the pipeline needs: a light H.264 MP4 at 3 frames a second (what SAM tracks),
// the same frames as JPEGs (what the edge-snapping reads), and a 24 kHz mono WAV (what Voice Transcribe hears).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const run = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

export type Prepared = { mp4: Buffer; frames: Buffer[]; wav?: Buffer; fps: number };

export async function prepareClip(videoPath: string, fps = 3, maxSeconds = 30): Promise<Prepared> {
  const dir = await mkdtemp(join(tmpdir(), "mo-p-"));
  try {
    const mp4 = join(dir, "clip.mp4");
    await run(FFMPEG, ["-v", "error", "-y", "-i", videoPath, "-t", String(maxSeconds), "-vf", `fps=${fps},scale='min(1920,iw)':-2`, "-an",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4]);
    await run(FFMPEG, ["-v", "error", "-y", "-i", mp4, "-q:v", "2", join(dir, "f%04d.jpg")]);
    const names = (await readdir(dir)).filter((n) => /^f\d+\.jpg$/.test(n)).sort();
    const frames = await Promise.all(names.map((n) => readFile(join(dir, n))));
    let wav: Buffer | undefined;
    try {
      const w = join(dir, "a.wav");
      await run(FFMPEG, ["-v", "error", "-y", "-i", videoPath, "-t", "60", "-vn", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", "-map_metadata", "-1", w]);
      wav = await readFile(w);
    } catch { /* no audio */ }
    return { mp4: await readFile(mp4), frames, wav, fps };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

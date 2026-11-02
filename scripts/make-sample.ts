// Build a seeded sample for the judge page from a clip: frames, preview, audio and one recorded live run.
// npx tsx scripts/make-sample.ts <clip> <id> "<title>" [run.json]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { prepareClip } from "../src/prep.ts";
import { runClip } from "../src/pipeline.ts";
const [clip, id, title, runPath] = process.argv.slice(2);
const dir = `public/samples/${id}`; mkdirSync(dir, { recursive: true });
const live = `samples/${id}`; mkdirSync(live, { recursive: true });
const prep = await prepareClip(clip);
const key = readFileSync(".secrets/meta_api_key", "utf8").trim();
const r: any = runPath ? JSON.parse(readFileSync(runPath, "utf8")) : await runClip(key, prep);
// Browser assets: a small preview video with sound, the hero frame, and the recorded run.
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", clip, "-t", "30", "-vf", "scale=960:-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", `${dir}/preview.mp4`]);
const heroIdx = r.heroFrame ?? r.frames.find((f: any) => f.ok)?.index ?? 0;
await sharp(prep.frames[heroIdx]).jpeg({ quality: 86 }).toFile(`${dir}/hero.jpg`);
for (const f of r.frames) await sharp(prep.frames[f.index]).resize(480).jpeg({ quality: 70 }).toFile(`${dir}/f${f.index}.jpg`);
writeFileSync(`${dir}/run.json`, JSON.stringify({ id, title, recordedAt: new Date().toISOString(), heroIndex: heroIdx, ...r }));
// Server-side inputs for a live re-run (no ffmpeg needed at request time).
writeFileSync(`${live}/clip.mp4`, prep.mp4);
if (prep.wav) writeFileSync(`${live}/audio.wav`, prep.wav);
mkdirSync(`${live}/frames`, { recursive: true });
prep.frames.forEach((f, i) => writeFileSync(`${live}/frames/${String(i).padStart(4, "0")}.jpg`, f));
writeFileSync(`${live}/meta.json`, JSON.stringify({ id, title, fps: prep.fps, frames: prep.frames.length }));
console.log(id, r.ok, r.widthMm && Math.round(r.widthMm), "hero", heroIdx);

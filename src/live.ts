// Server-side helpers shared by the hosted API (api/*.ts) and the local server (server.ts).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const ROOT = process.cwd();
export const key = () => process.env.MODEL_API_KEY || (existsSync(join(ROOT, ".secrets/meta_api_key")) ? readFileSync(join(ROOT, ".secrets/meta_api_key"), "utf8").trim() : "");

export function loadSample(id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("unknown sample");
  const dir = join(ROOT, "samples", id);
  if (!existsSync(join(dir, "meta.json"))) throw new Error("unknown sample");
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const frames = readdirSync(join(dir, "frames")).filter((f) => f.endsWith(".jpg")).sort().map((f) => readFileSync(join(dir, "frames", f)));
  const wav = existsSync(join(dir, "audio.wav")) ? readFileSync(join(dir, "audio.wav")) : undefined;
  return { meta, mp4: readFileSync(join(dir, "clip.mp4")), frames, wav, fps: meta.fps as number };
}

// A simple daily cap so a public button can't run up a bill. Per server instance; the Meta account's own spend
// limit is the hard stop.
const caps = { day: "", runs: 0, renders: 0, sends: 0 };
export function allow(kind: "runs" | "renders" | "sends") {
  const day = new Date().toISOString().slice(0, 10);
  if (caps.day !== day) Object.assign(caps, { day, runs: 0, renders: 0, sends: 0 });
  const limit = { runs: Number(process.env.DAILY_LIVE_RUNS || 25), renders: Number(process.env.DAILY_RENDERS || 25), sends: Number(process.env.DAILY_SENDS || 25) }[kind];
  if (caps[kind] >= limit) return false;
  caps[kind]++; return true;
}
export const usage = () => ({ ...caps });

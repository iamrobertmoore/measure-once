// CLI: npm run measure -- path/to/clip.mov [out.json]   (needs MODEL_API_KEY and ffmpeg on PATH)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { prepareClip } from "../src/prep.ts";
import { runClip } from "../src/pipeline.ts";
const [file, out] = process.argv.slice(2);
const key = process.env.MODEL_API_KEY || (existsSync(".secrets/meta_api_key") ? readFileSync(".secrets/meta_api_key", "utf8").trim() : "");
if (!file || !key) { console.error("usage: MODEL_API_KEY=... npm run measure -- clip.mov [out.json]"); process.exit(1); }
const prep = await prepareClip(file);
const r = await runClip(key, { ...prep });
const summary = { ok: r.ok, reason: r.reason, widthMm: r.widthMm && Math.round(r.widthMm), heightMm: r.heightMm && Math.round(r.heightMm), spreadMm: r.spreadMm && +r.spreadMm.toFixed(1), framesUsed: r.framesUsed, of: r.frames.length, perFrame: r.frames.map((f) => (f.ok ? Math.round(f.widthMm!) : f.reason)), handSpan: r.handSpan, hands: r.hands.length, transcript: r.transcript, best: r.options[0], timingsMs: r.timingsMs };
console.log(JSON.stringify(summary, null, 1));
if (r.draft) console.log("\n" + r.draft.reply);
if (out) writeFileSync(out, JSON.stringify(r));

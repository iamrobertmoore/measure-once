// Re-runs every measured recorded clip end to end with the buyer's own lengths hidden from the edge pick (src/span.ts),
// and compares the result with the recorded run. Writes public/samples/masked.json.
// npx tsx scripts/rerun-masked.ts [reps]
import { readFileSync, writeFileSync } from "node:fs";
import { runClip } from "../src/pipeline.ts";
import { loadSample, key } from "../src/live.ts";
process.env.MODEL_API_KEY_FILE ??= ".secrets/meta_api_key";
process.env.BASETEN_API_KEY_FILE ??= ".secrets/baseten_api_key";
const OUT = process.env.SPAN_MODEL === "open" ? "public/samples/masked-open.json" : "public/samples/masked.json";
const reps = Number(process.argv[2] || 1);
const ids = ["living-room", "bathroom", "cloakroom", "recess-friend", "small-friend"];
const rows: any[] = [];
for (const id of ids) {
  const rec = JSON.parse(readFileSync(`public/samples/${id}/run.json`, "utf8"));
  const s = loadSample(id);
  for (let r = 0; r < reps; r++) {
    const t0 = Date.now();
    const x: any = await runClip(key(), { mp4: s.mp4, frames: s.frames, wav: s.wav, fps: s.fps, draft: false });
    rows.push({ id, ok: x.ok, widthMm: x.widthMm, recess: !!x.span?.adopted, votes: x.span?.votes, why: x.span?.why, recordedWidthMm: rec.widthMm, recordedRecess: !!rec.span?.adopted, secs: (Date.now() - t0) / 1000 });
    const y = rows[rows.length - 1]; console.log(id, y.ok, Math.round(y.widthMm), y.recess, "| recorded", Math.round(y.recordedWidthMm), y.recordedRecess, "|", y.votes, "|", y.why);
  }
}
writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), note: "buyer's lengths hidden from the edge pick", spanModel: process.env.SPAN_MODEL || "muse-spark-1.3", rows }, null, 1));

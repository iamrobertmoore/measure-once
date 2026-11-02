// One source for every number on every surface. Builds facts.json from the recorded runs and the scored accuracy,
// then renders README.md from README.template.md ({{key}} placeholders). `--check` fails if README.md is stale.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const acc = JSON.parse(readFileSync("public/samples/accuracy.json", "utf8"));
const run = (id: string) => JSON.parse(readFileSync(`public/samples/${id}/run.json`, "utf8"));
const lr = run("living-room"), bt = run("bathroom");
const row = (w: string) => acc.rows.find((r: any) => r.window.startsWith(w));
const cm = (mm: number) => (mm / 10).toFixed(1);
const signed = (mm: number) => (mm > 0 ? `+${mm}` : mm < 0 ? `\u2212${-mm}` : "0");
const pole = (o: any) => (o.cutToMm ? `${o.stockCm} cm pole cut to ${o.cutToMm / 10} cm` : `${o.stockCm} cm pole as supplied`);
// Code references that can't go stale: the line a pattern is on, at render time.
const ref = (file: string, pattern: string) => {
  const i = readFileSync(file, "utf8").split("\n").findIndex((l) => l.includes(pattern));
  if (i < 0) throw new Error(`ref not found: ${file} ${pattern}`);
  return `[\`${file}:${i + 1}\`](${file}#L${i + 1})`;
};
const sm = run("cloakroom");
const facts: Record<string, string | number> = {
  ref_sam_image: ref("src/measure.ts", 'segmentImage(api, url, "sheet of paper")'),
  ref_sam_video: ref("src/pipeline.ts", 'segmentVideo(api, file.id, "hand")'),
  ref_sam_pole: ref("src/render.ts", '"wooden pole"'),
  ref_voice: ref("src/pipeline.ts", 'model: "muse-voice-transcribe-1.0"'),
  ref_spark: ref("src/agent.ts", 'model: input.model ?? "muse-spark-1.3"'),
  ref_image: ref("src/render.ts", 'model: "muse-image-1.0"'),
  ref_check: ref("src/agent.ts", "export function checkNumbers"),
  ref_buyer: ref("src/agent.ts", "export function buyerLengthsCm"),
  ref_joint: ref("src/geometry.ts", "export function jointFitEdges"),
  ref_outer: ref("src/geometry.ts", 'if (rule === "outer")'),
  ref_sides: ref("src/measure.ts", "export function windowSides"),
  ref_catalogue: ref("src/catalogue.ts", "export function sizeOptions"),
  ref_hands_cap: ref("src/pipeline.ts", "handsCapped"),
  ref_hand_way: ref("src/pipeline.ts", "const inTheWay"),
  ref_polarity: ref("src/geometry.ts", "if (polarity === 1 && contrast < minContrast) continue;"),
  sm_reply_quote: (() => { const m = sm.draft?.reply?.match(/If your 59 cm[^.]*\./); if (!m) throw new Error("recess reply lacks the second size"); return m[0]; })(),
  inbox_sizing_share: "1 in 4", inbox_reply_words_median: 77, inbox_reply_words_p90: 263, inbox_wait_hours_median: 10,
  inbox_threads_read: 125, inbox_sizing_threads: 29,
  lr_tape_cm: cm(row("living").tape_mm), lr_measured_cm: cm(row("living").measured_mm), lr_err_mm: signed(row("living").error_mm),
  bt_tape_cm: cm(row("bathroom").tape_mm), bt_measured_cm: cm(row("bathroom").measured_mm), bt_err_mm: signed(row("bathroom").error_mm), within_cm: (Math.max(Math.abs(row("living").error_mm), Math.abs(row("bathroom").error_mm)) / 10).toFixed(1),
  sm_tape_cm: cm(row("small").tape_mm), sm_measured_cm: cm(row("small").measured_mm), sm_err_mm: signed(row("small").error_mm),
  median_abs_err_mm: acc.summary.medianAbsErrorMm, refused: acc.summary.refusedCorrectly, refusals: acc.summary.refusalsExpected,
  lr_pole: pole(lr.options[0]), lr_cut_each_end_cm: cm(lr.options[0].cutPerEndMm),
  bt_pole: pole(bt.options[0]),
  live_url: process.env.LIVE_URL || "https://measure-once.vercel.app",
  video_url: process.env.VIDEO_URL || "https://www.youtube.com/watch?v=TBD",
  run_seconds: (() => { const ts = ["living-room", "bathroom", "cloakroom"].map((id) => run(id).timingsMs.totalMs).sort((a: number, b: number) => a - b); return Math.round(ts[1] / 1000); })(),
  run_seconds_max: Math.max(...["living-room", "bathroom", "cloakroom"].map((id) => Math.round(run(id).timingsMs.totalMs / 1000))),
  sm_frame_cm: cm(sm.span?.frameWidthMm ?? sm.widthMm), sm_votes: sm.span?.votes ?? "",
  ...(() => { const b = JSON.parse(readFileSync("public/samples/baseline.json", "utf8")).rows; const o: any = {};
    for (const [k, id] of [["lr", "living-room"], ["bt", "bathroom"], ["sm", "cloakroom"]]) { const r = b.find((x: any) => x.id === id); o[`${k}_spark_cm`] = r.spark_alone_median_cm; o[`${k}_spark_range`] = `${Math.min(...r.spark_alone_cm)} to ${Math.max(...r.spark_alone_cm)}`; }
    o.spark_spread_cm = Math.max(...b.map((r: any) => Math.max(...r.spark_alone_cm) - Math.min(...r.spark_alone_cm)));
    return o; })(),
  ref_span: ref("src/span.ts", "export async function pickSpan"),
  ref_upload: ref("api/upload.ts", "export default async function handler"),
};
writeFileSync("facts.json", JSON.stringify(facts, null, 1) + "\n");
if (existsSync("README.template.md")) {
  const out = readFileSync("README.template.md", "utf8").replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in facts)) throw new Error(`missing fact ${k}`); return String(facts[k]); });
  if (process.argv.includes("--check")) {
    if (/TBD/.test(out)) { console.error("README still has a TBD link"); process.exit(1); }
    if (!existsSync("README.md") || readFileSync("README.md", "utf8") !== out) { console.error("README.md is stale: run npx tsx scripts/facts.ts"); process.exit(1); }
    console.log("README.md matches facts.json");
  } else { writeFileSync("README.md", out); console.log("README.md rendered"); }
}

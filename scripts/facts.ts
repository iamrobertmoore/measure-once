// One source for every number on every surface. Builds docs/readme/facts.json from the recorded runs and the scored accuracy,
// then renders README.md from docs/readme/README.template.md ({{key}} placeholders). `--check` fails if README.md is stale.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { likelyMm, poleAcross } from "../src/sure.ts";
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
// The whole tape table, every window, generated so it can't drift from the scored runs.
const tapeTable = ["| Window | Where | Tape | Measure Once | Difference |", "|---|---|---|---|---|",
  ...acc.rows.map((r: any) => {
    const home = r.window.startsWith("another home") ? "elsewhere" : "my house";
    const name = r.window.replace(/^another home: /, "");
    const what = r.recess ? " (recess opening)" : "";
    return `| ${name[0].toUpperCase() + name.slice(1)}${what} | ${home} | ${r.measured_mm !== null ? cm(r.tape_mm) + " cm" : "not needed"} | ${r.measured_mm !== null ? cm(r.measured_mm) + " cm" : "refused"} | ${r.error_mm !== null ? signed(r.error_mm) + " mm" : r.note.replace(/;.*/, "")} |`;
  })].join("\n");
const measured = acc.rows.filter((r: any) => r.error_mm !== null);
const plain = measured.filter((r: any) => !r.recess), recessRows = measured.filter((r: any) => r.recess);
// Had I cut the pole to the measurement, would it still fit the width the tape measured? (band 15 to 20 cm, 10 cm works)
const ids = JSON.parse(readFileSync("public/samples/index.json", "utf8")).samples.map((s: any) => s.id);
const fits = measured.map((r: any) => {
  const id = ids.find((i: string) => { const x = run(i); return x.ok && Math.round(x.widthMm) === r.measured_mm; });
  const o = run(id).options[0], len = o.cutToMm ?? o.stockCm * 10, over = (len - r.tape_mm) / 2;
  return { over, ok: over >= 100 && over <= 250, band: over >= 150 && over <= 200 };
});
// "How sure": is the tape inside the likely range shown to the buyer, and does the pole fit across all of it?
const sure = measured.map((r: any) => {
  const x = run(ids.find((i: string) => { const y = run(i); return y.ok && Math.round(y.widthMm) === r.measured_mm; }));
  const L = likelyMm(x.widthMm, x.spreadMm, x.framesUsed, !!x.span?.adopted), o = x.options[0];
  return { inside: r.tape_mm >= L.lo && r.tape_mm <= L.hi, holds: poleAcross(o.cutToMm ?? o.stockCm * 10, L.lo, L.hi).holds, half: L.half };
});
// One frame on its own against the median of all of them, on the plain windows (a recess is picked across frames, not per frame).
const single = plain.flatMap((r: any) => {
  const x = run(ids.find((i: string) => { const y = run(i); return y.ok && Math.round(y.widthMm) === r.measured_mm; }));
  return x.frames.filter((f: any) => f.ok && f.widthMm).map((f: any) => Math.abs(f.widthMm - r.tape_mm));
}).sort((a: number, b: number) => a - b);
// Muse Spark Open against hosted Muse Spark 1.3 as the writer, same runs and same check (scripts/compare-writers.ts).
const writers = (() => {
  const w = JSON.parse(readFileSync("public/samples/writers.json", "utf8")).rows;
  const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };
  const one = (name: string) => { const r = w.filter((x: any) => x.writer === name); return { n: r.length, first: r.filter((x: any) => x.ok && x.firstTime).length, secs: (med(r.map((x: any) => x.ms)) / 1000).toFixed(1), words: med(r.filter((x: any) => x.ok).map((x: any) => x.words)), short: r.filter((x: any) => x.ok && x.words <= 120).length }; };
  const o = one("open"), s = one("muse-spark-1.3");
  return { writers_table: ["| Writer | Drafts | Passed the number check first time | Median time | Median length | Under the 120-word ask |", "|---|---|---|---|---|---|",
    `| Muse Spark Open, on Baseten | ${o.n} | ${o.first} of ${o.n} | ${o.secs} s | ${o.words} words | ${o.short} of ${o.n} |`,
    `| Muse Spark 1.3, hosted | ${s.n} | ${s.first} of ${s.n} | ${s.secs} s | ${s.words} words | ${s.short} of ${s.n} |`].join("\n"),
    writers_open_secs: o.secs, writers_speedup: Math.round(Number(s.secs) / Number(o.secs)), writers_spark_secs: s.secs, writers_n: o.n };
})();
// Does the edge pick need a model? The same lettered edges on each clip's main frame, chosen three ways.
const ablation = (() => {
  const names: Record<string, string> = { "living-room": "Living room", bathroom: "Bathroom", cloakroom: "Small window in a recess", "recess-friend": "Another home, recess", "small-friend": "Another home, small window" };
  const rows = measured.map((r: any) => {
    const id = ids.find((i: string) => { const y = run(i); return y.ok && Math.round(y.widthMm) === r.measured_mm; });
    const sp = run(id).span, E = sp.edges as any[], x = (l: string) => E.find((e) => e.label === l).xMm;
    const m = E.filter((e) => e.measured), outline = Math.max(...m.map((e) => e.xMm)) - Math.min(...m.map((e) => e.xMm));
    const widest = Math.max(...E.map((e) => e.xMm)) - Math.min(...E.map((e) => e.xMm));
    const spark = x(sp.right) - x(sp.left);
    return { name: names[id] ?? id, tape: r.tape_mm, outline, widest, spark };
  });
  const cell = (v: number, t: number) => `${cm(v)} cm (${signed(Math.round(v - t))} mm)`;
  const worst = (k: "outline" | "widest" | "spark") => cm(Math.max(...rows.map((r) => Math.abs(r[k] - r.tape))));
  return { ablation_table: ["| Window | Tape | The code's outline only | The widest edges found | Muse Spark's pick |", "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.name} | ${cm(r.tape)} cm | ${cell(r.outline, r.tape)} | ${cell(r.widest, r.tape)} | ${cell(r.spark, r.tape)} |`),
    `| **Worst** | | **${worst("outline")} cm** | **${worst("widest")} cm** | **${worst("spark")} cm** |`].join("\n"),
    ablation_outline_worst: worst("outline"), ablation_widest_worst: worst("widest"), ablation_spark_worst: worst("spark") };
})();
// The likely range checked without fitting it to the window being checked: each window's systematic term comes only
// from the other windows of its kind (plain or recess), then is the tape inside the range?
const loo = (() => {
  const xs = measured.map((r: any) => { const id = ids.find((i: string) => { const y = run(i); return y.ok && Math.round(y.widthMm) === r.measured_mm; }); return { r, x: run(id) }; });
  let inside = 0;
  for (const { r, x } of xs) {
    const same = xs.filter((o) => o.r !== r && !!o.x.span?.adopted === !!x.span?.adopted).map((o) => Math.abs(o.r.error_mm));
    const sys = same.length ? Math.max(...same) / 2 : 29;
    const random = Math.max(0, x.spreadMm) / 1.35 / Math.sqrt(Math.max(1, x.framesUsed));
    const half = 2 * Math.sqrt(random * random + sys * sys);
    if (Math.abs(r.tape_mm - x.widthMm) <= half) inside++;
  }
  return { loo_inside: inside, loo_total: xs.length };
})();
// Today's code, re-run end to end with the buyer's lengths hidden from the edge pick (scripts/rerun-masked.ts).
const masked = (() => {
  const m = JSON.parse(readFileSync("public/samples/masked.json", "utf8")).rows;
  return { masked_runs: m.length, masked_ok: m.filter((x: any) => x.ok).length, masked_same_pick: m.filter((x: any) => x.recess === x.recordedRecess).length,
    masked_max_move_mm: Math.round(Math.max(...m.map((x: any) => Math.abs(x.widthMm - x.recordedWidthMm)))) };
})();
const errsAll = measured.map((r: any) => Math.abs(r.error_mm)).sort((a: number, b: number) => a - b);
const facts: Record<string, string | number> = {
  pole_fit_ok: fits.filter((f) => f.ok).length, pole_fit_total: fits.length, pole_fit_band: fits.filter((f) => f.band).length,
  pole_fit_overhangs: fits.map((f) => `${cm(f.over)} cm`).join(", "),
  worst_err_cm: cm(errsAll[errsAll.length - 1]), median_err_cm: cm(errsAll[Math.floor((errsAll.length - 1) / 2)]),
  tape_table: tapeTable, ...writers, ...ablation, ...loo, ...masked,
  ref_render_check: ref("src/render.ts", "best.coverage >= 0.85"),
  likely_inside: sure.filter((x) => x.inside).length, likely_holds: sure.filter((x) => x.holds).length, likely_total: sure.length,
  likely_half_cm: `${cm(Math.min(...sure.map((x) => x.half)))} to ${cm(Math.max(...sure.map((x) => x.half)))}`,
  single_frames: single.length, single_median_cm: cm(single[Math.floor((single.length - 1) / 2)]), single_worst_cm: cm(single[single.length - 1]),
  windows_total: acc.rows.length, windows_measured: measured.length, windows_refused: acc.rows.length - measured.length,
  other_homes: acc.rows.filter((r: any) => r.window.startsWith("another home")).length,
  plain_count: plain.length, plain_within_cm: (Math.max(...plain.map((r: any) => Math.abs(r.error_mm))) / 10).toFixed(1),
  recess_count: recessRows.length, recess_errs: recessRows.map((r: any) => `${signed(r.error_mm)} mm`).join(" and "),
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
  sm_reply_quote: (() => { const m = sm.draft?.reply?.match(/[^.]*\b59 cm[^.]*\b94 cm[^.]*\./); if (!m) throw new Error("recess reply lacks the second size"); return m[0].trim(); })(),
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
  run_seconds: (() => { const ts = ["living-room", "bathroom", "cloakroom", "recess-friend", "small-friend"].map((id) => run(id).timingsMs.totalMs).sort((a: number, b: number) => a - b); return Math.round(ts[2] / 1000); })(),
  run_seconds_min: Math.min(...["living-room", "bathroom", "cloakroom", "recess-friend", "small-friend"].map((id) => Math.round(run(id).timingsMs.totalMs / 1000))),
  run_seconds_max: Math.max(...["living-room", "bathroom", "cloakroom", "recess-friend", "small-friend"].map((id) => Math.round(run(id).timingsMs.totalMs / 1000))),
  sm_frame_cm: cm(sm.span?.frameWidthMm ?? sm.widthMm), sm_votes: sm.span?.votes ?? "",
  ...(() => { const b = JSON.parse(readFileSync("public/samples/baseline.json", "utf8")).rows; const o: any = {};
    for (const [k, id] of [["lr", "living-room"], ["bt", "bathroom"], ["sm", "cloakroom"]]) { const r = b.find((x: any) => x.id === id); o[`${k}_spark_cm`] = r.spark_alone_median_cm; o[`${k}_spark_range`] = `${Math.min(...r.spark_alone_cm)} to ${Math.max(...r.spark_alone_cm)}`; }
    o.spark_spread_cm = Math.max(...b.map((r: any) => Math.max(...r.spark_alone_cm) - Math.min(...r.spark_alone_cm)));
    const tapeOf: Record<string, string> = { "living-room": "living", bathroom: "bathroom", cloakroom: "small bathroom", "recess-friend": "another home: window in a recess", "small-friend": "another home: small window" };
    const label: Record<string, string> = { "living-room": "Living room", bathroom: "Bathroom", cloakroom: "Recess opening", "recess-friend": "Recess opening, another home", "small-friend": "Small window, another home" };
    const b2 = JSON.parse(readFileSync("public/samples/baseline-2.json", "utf8")).rows;
    o.baseline_count = b2.length;
    const b3 = JSON.parse(readFileSync("public/samples/baseline-3.json", "utf8")).rows;
    o.baseline_table = ["| Window | Tape | Muse Spark alone (median of its frames) | Its answers across frames | Measure Once |", "|---|---|---|---|---|",
      ...b3.map((r3: any) => { const t = row(tapeOf[r3.id]);
        return `| ${label[r3.id]} | ${cm(t.tape_mm)} cm | ${r3.spark_alone_median_cm} cm (${signed(Math.round(r3.spark_alone_median_cm * 10 - t.tape_mm))} mm) | ${Math.min(...r3.spark_alone_cm)} to ${Math.max(...r3.spark_alone_cm)} cm | ${r3.measured_cm} cm (${signed(Math.round(r3.measured_cm * 10 - t.tape_mm))} mm) |`; })].join("\n");
    const errs3 = b3.map((r3: any) => Math.abs(r3.spark_alone_median_cm * 10 - row(tapeOf[r3.id]).tape_mm) / 10).sort((x: number, y: number) => x - y);
    o.spark3_err_median = errs3[Math.floor((errs3.length - 1) / 2)].toFixed(0); o.spark3_err_max = errs3[errs3.length - 1].toFixed(0);
    o.spark3_swing = Math.max(...b3.map((r3: any) => Math.max(...r3.spark_alone_cm) - Math.min(...r3.spark_alone_cm)));
    const errs2 = b2.map((r2: any) => Math.abs(r2.spark_alone_median_cm * 10 - row(tapeOf[r2.id]).tape_mm) / 10);
    o.spark2_err_min = Math.min(...errs2).toFixed(0); o.spark2_err_max = Math.max(...errs2).toFixed(0);
    return o; })(),
  ref_span: ref("src/span.ts", "export async function pickSpan"),
  ref_mask: ref("src/span.ts", "export const maskNumbers"),
  ref_open: ref("src/open.ts", "export async function openJson"),
  ...(() => { const rp = JSON.parse(readFileSync("public/samples/repeat.json", "utf8")).rows; const all = Object.values(rp).flat() as any[];
    const spreads = Object.values(rp).map((v: any) => Math.max(...v.map((x: any) => x.widthMm)) - Math.min(...v.map((x: any) => x.widthMm)));
    return { repeat_runs: all.length, repeat_ok: all.filter((x) => x.ok).length, repeat_spread_mm: Math.round(Math.max(...spreads)), repeat_open: all.filter((x) => String(x.draftBy).includes("muse-spark-open")).length }; })(),
  open_runs: ids.filter((i: string) => run(i).draft?.ranOn?.includes("muse-spark-open")).length,
  open_secs: 3,
  ref_upload: ref("api/upload.ts", "export default async function handler"),
};
writeFileSync("docs/readme/facts.json", JSON.stringify(facts, null, 1) + "\n");
if (existsSync("docs/readme/README.template.md")) {
  const out = readFileSync("docs/readme/README.template.md", "utf8").replace(/\{\{(\w+)\}\}/g, (_, k) => { if (!(k in facts)) throw new Error(`missing fact ${k}`); return String(facts[k]); });
  if (process.argv.includes("--check")) {
    if (/TBD/.test(out)) { console.error("README still has a TBD link"); process.exit(1); }
    if (!existsSync("README.md") || readFileSync("README.md", "utf8") !== out) { console.error("README.md is stale: run npx tsx scripts/facts.ts"); process.exit(1); }
    console.log("README.md matches facts.json");
  } else { writeFileSync("README.md", out); console.log("README.md rendered"); }
}

// Muse Spark Open (open weights, on Baseten) against hosted Muse Spark 1.3 as the reply writer, on the same recorded runs:
// same numbers, same options, same prompt and the same number check. Writes public/samples/writers.json.
// npx tsx scripts/compare-writers.ts [reps]
import { readFileSync, writeFileSync } from "node:fs";
import { client } from "../src/sam.ts";
import { key } from "../src/live.ts";
import { draftReply } from "../src/agent.ts";
process.env.MODEL_API_KEY_FILE ??= ".secrets/meta_api_key"; // local runs only
process.env.BASETEN_API_KEY_FILE ??= ".secrets/baseten_api_key";
const reps = Number(process.argv[2] || 3);
const ids = JSON.parse(readFileSync("public/samples/index.json", "utf8")).samples.map((s: any) => s.id)
  .filter((id: string) => JSON.parse(readFileSync(`public/samples/${id}/run.json`, "utf8")).ok);
const rows: any[] = [];
for (const id of ids) {
  const run = JSON.parse(readFileSync(`public/samples/${id}/run.json`, "utf8"));
  const hs = run.handSpan ? [Math.round(run.handSpan.leftPastFrameMm / 10), Math.round(run.handSpan.rightPastFrameMm / 10)] as [number, number] : undefined;
  for (const writer of ["open", "muse-spark-1.3"]) for (let r = 0; r < reps; r++) {
    const t0 = Date.now();
    try {
      const d: any = await draftReply(client(key()), {
        transcript: run.transcript, frameWidthMm: run.widthMm, windowFrameMm: run.span?.adopted ? run.span.frameWidthMm : undefined,
        spreadMm: run.spreadMm, framesUsed: run.framesUsed, options: run.options, diameterMm: run.draft?.diameterMm ?? 35, handSpanCm: hs,
        ...(writer === "open" ? {} : { model: writer }),
      });
      rows.push({ id, writer, ranOn: d.ranOn, ms: Date.now() - t0, attempts: d.attempt, firstTime: d.attempt === 1 && !d.secondSizeAddedByCode, codeAddedSize: !!d.secondSizeAddedByCode, words: d.reply.split(/\s+/).filter(Boolean).length, ok: true });
    } catch (e: any) { rows.push({ id, writer, ms: Date.now() - t0, ok: false, error: String(e?.message ?? e).slice(0, 200) }); }
    const x = rows[rows.length - 1]; console.log(id, writer, x.ok, x.ranOn ?? "", x.ms, x.attempts ?? "", x.words ?? "", x.error ?? "");
  }
}
writeFileSync("public/samples/writers.json", JSON.stringify({ ranAt: new Date().toISOString(), reps, rows }, null, 1));

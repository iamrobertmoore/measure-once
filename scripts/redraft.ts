// Re-drafts the reply on a recorded run (no new measuring: same clip, same numbers, same options).
// npx tsx scripts/redraft.ts <sample-id> [...]   Uses Muse Spark Open on Baseten when a Baseten key is set.
import { readFileSync, writeFileSync } from "node:fs";
import { client } from "../src/sam.ts";
import { key } from "../src/live.ts";
import { draftReply } from "../src/agent.ts";
process.env.MODEL_API_KEY_FILE ??= ".secrets/meta_api_key"; // local runs only
process.env.BASETEN_API_KEY_FILE ??= ".secrets/baseten_api_key";
for (const id of process.argv.slice(2)) {
  const p = `public/samples/${id}/run.json`;
  const run = JSON.parse(readFileSync(p, "utf8"));
  if (!run.ok) { console.log(id, "not measured; skipped"); continue; }
  const hs = run.handSpan ? [Math.round(run.handSpan.leftPastFrameMm / 10), Math.round(run.handSpan.rightPastFrameMm / 10)] as [number, number] : undefined;
  const d = await draftReply(client(key()), {
    transcript: run.transcript, frameWidthMm: run.widthMm, windowFrameMm: run.span?.adopted ? run.span.frameWidthMm : undefined,
    spreadMm: run.spreadMm, options: run.options, diameterMm: run.draft?.diameterMm ?? 35, handSpanCm: hs,
  });
  run.draft = d;
  run.models = [...run.models.filter((m: string) => !(m.includes("muse-spark") && !m.includes("which edges"))), d.ranOn || "muse-spark-1.3"];
  writeFileSync(p, JSON.stringify(run));
  console.log(`== ${id} (${d.ranOn})\n${d.reply}\n`);
}

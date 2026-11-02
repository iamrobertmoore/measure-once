// Score recorded runs against a tape-measure answer key kept OUTSIDE this repo.
// npx tsx scripts/score.ts <answer-key.csv> <runs-dir> > public/samples/accuracy.json
import { readFileSync, existsSync } from "node:fs";
const [csvPath, runsDir] = process.argv.slice(2);
const lines = readFileSync(csvPath, "utf8").trim().split("\n").slice(1);
const rows: any[] = [], abstain: any[] = [];
for (const line of lines) {
  const cols = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
  const [id, clip, room, tape] = cols;
  const runFile = `${runsDir}/${clip.replace(/^IMG_/, "").replace(/\.MOV$/i, "")}.json`;
  if (!existsSync(runFile)) continue;
  const r = JSON.parse(readFileSync(runFile, "utf8"));
  if (id.startsWith("a")) { abstain.push({ window: room, expected: "refuse", got: r.ok ? `measured ${Math.round(r.widthMm)} mm` : `refused: ${r.reason}`, pass: !r.ok }); continue; }
  rows.push({ window: room, tape_mm: Number(tape), measured_mm: r.ok ? Math.round(r.widthMm) : null, error_mm: r.ok ? Math.round(r.widthMm - Number(tape)) : null, spread_mm: r.ok ? +r.spreadMm.toFixed(1) : null, frames: r.framesUsed ?? 0, note: r.ok ? "" : r.reason,
    // Did the drafted reply put the buyer's own number next to ours and ask, instead of silently picking one?
    // Only asked when the two differ by more than the agent's own threshold (3 cm or 3%); otherwise null.
    reply_flags_buyer_number: r.ok && Math.abs(r.widthMm - Number(tape)) > Math.max(30, 0.03 * r.widthMm) ? !!(r.draft?.reply?.includes(String(Number(tape) / 10)) && r.draft.questions?.length) : null });
}
const errs = rows.filter((r) => r.error_mm !== null).map((r) => Math.abs(r.error_mm)).sort((a, b) => a - b);
console.log(JSON.stringify({ scoredAt: new Date().toISOString(), rows, abstain, summary: { measured: errs.length, of: rows.length, medianAbsErrorMm: errs.length ? errs[Math.floor((errs.length - 1) / 2)] : null, maxAbsErrorMm: errs.length ? errs[errs.length - 1] : null, refusedCorrectly: abstain.filter((a) => a.pass).length, refusalsExpected: abstain.length } }, null, 1));

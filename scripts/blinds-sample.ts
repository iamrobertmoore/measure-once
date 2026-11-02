// Adds the roller-blind maker's options and drafted reply to a recorded run (no new measuring: same clip, same numbers).
// npx tsx scripts/blinds-sample.ts <sample-id>
import { readFileSync, writeFileSync } from "node:fs";
import { client } from "../src/sam.ts";
import { key } from "../src/live.ts";
import { blindOptions, draftBlindReply } from "../src/blinds.ts";
const id = process.argv[2];
const p = `public/samples/${id}/run.json`;
const run = JSON.parse(readFileSync(p, "utf8"));
if (!run.ok) { console.log(id, "not measured; skipped"); process.exit(0); }
const recess = !!run.span?.adopted;
const options = blindOptions({ openingMm: run.widthMm, recess, heightMm: run.heightMm ?? null });
const draft = await draftBlindReply(client(key()), { transcript: run.transcript, openingMm: run.widthMm, recess, frameMm: recess ? run.span.frameWidthMm : undefined, heightMm: run.heightMm ?? null, options });
run.blinds = { options, draft, model: "muse-spark-1.3" };
writeFileSync(p, JSON.stringify(run));
console.log(id, JSON.stringify(options), "\n", draft.reply);

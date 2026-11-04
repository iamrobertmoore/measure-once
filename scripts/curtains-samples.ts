// Adds the example curtain sizes and a drafted reply to each measured recorded run.
import { readFileSync, writeFileSync } from "node:fs";
import { client } from "../src/sam.ts";
import { key } from "../src/live.ts";
import { curtainOptions, draftCurtainReply } from "../src/curtains.ts";
process.env.MODEL_API_KEY_FILE ??= ".secrets/meta_api_key";
process.env.BASETEN_API_KEY_FILE ??= ".secrets/baseten_api_key";
for (const id of process.argv.slice(2)) {
  const p = `public/samples/${id}/run.json`, run = JSON.parse(readFileSync(p, "utf8"));
  if (!run.ok) continue;
  const options = curtainOptions({ pole: run.options[0], heightMm: run.heightMm ?? null });
  const draft = await draftCurtainReply(client(key()), { transcript: run.transcript, openingMm: run.widthMm, recess: !!run.span?.adopted, options });
  run.curtains = { options, draft };
  writeFileSync(p, JSON.stringify(run));
  console.log(`== ${id} (${draft.ranOn})`, JSON.stringify(options.map((o) => [o.heading, o.eachCurtainMm, o.fabricWidthsEach, o.sillDropMm])), `\n${draft.reply}\n`);
}

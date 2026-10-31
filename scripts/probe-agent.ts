import { readFileSync } from "node:fs";
import { client } from "../src/sam.ts";
import { sizeOptions } from "../src/catalogue.ts";
import { draftReply } from "../src/agent.ts";
const api = client(readFileSync(new URL("../.secrets/meta_api_key", import.meta.url), "utf8").trim());
const w = 1780;
const t0 = Date.now();
const d = await draftReply(api, { transcript: "It's for eyelet curtains, I want them to clear the glass when they're open. From about here to here.", frameWidthMm: w, spreadMm: 6, options: sizeOptions(w, 35), diameterMm: 35 });
console.log(Date.now() - t0, "ms"); console.log(JSON.stringify(d, null, 1));

import { readFileSync } from "node:fs";
import { client } from "../src/sam.ts";
import { measureClip, transcribe } from "../src/clip.ts";
const key = readFileSync(new URL("../.secrets/meta_api_key", import.meta.url), "utf8").trim();
const t0 = Date.now();
const [m, t] = await Promise.all([measureClip(client(key), process.argv[2]), transcribe(key, process.argv[2]).catch((e) => "ERR " + e.message)]);
console.log(JSON.stringify({ ms: Date.now() - t0, ...m, perFrame: m.perFrame.map((p: any) => p.ok ? Math.round(p.widthMm) : p.reason), transcript: t }, null, 1));

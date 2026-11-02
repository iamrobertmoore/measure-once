import { readFileSync } from "node:fs";
import OpenAI, { toFile } from "openai";
import { client, segmentVideo } from "../src/sam.ts";
const key = readFileSync(".secrets/meta_api_key","utf8").trim(); const api = client(key);
let t = Date.now();
const f = await api.files.create({ file: await toFile(readFileSync(process.argv[2]), "clip.mp4", { type: "video/mp4" }), purpose: "user_data" as any, expires_after: { anchor: "created_at", seconds: 3600 } } as any);
console.log("upload", Date.now() - t, f.id); t = Date.now();
const res = await Promise.all(["sheet of paper", "wooden frame", "hand"].map(async (p) => { const t1 = Date.now(); const o = await segmentVideo(api, f.id, p); return [p, Date.now() - t1, o.length, [...new Set(o.map(x=>x.frame))].length]; }));
console.log(res, "total", Date.now() - t);

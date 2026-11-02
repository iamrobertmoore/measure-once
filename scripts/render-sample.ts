// Render the recommended pole onto the hero frame of a measured clip: npx tsx scripts/render-sample.ts clip.mov result.json out.jpg
import { readFileSync, writeFileSync } from "node:fs";
import { prepareClip } from "../src/prep.ts";
import { client } from "../src/sam.ts";
import { renderPole, planPole } from "../src/render.ts";
import { catalogue } from "../src/catalogue.ts";
const [clip, resPath, out] = process.argv.slice(2);
const r = JSON.parse(readFileSync(resPath, "utf8"));
const prep = await prepareClip(clip);
const f = r.frames.find((x: any) => x.index === r.heroFrame);
const best = r.options[0]; const len = best.cutToMm ?? best.stockCm * 10;
const plan = planPole(f.wall, len, 35, catalogue.finialMm[35]);
const api = client(readFileSync(".secrets/meta_api_key", "utf8").trim());
const res = await renderPole(api, prep.frames[r.heroFrame], f.G, plan);
writeFileSync(out, res.jpeg); writeFileSync(out.replace(".jpg", ".placed.jpg"), res.placed);
console.log({ usedEdit: res.usedEdit, outsideChangePct: +res.outsideChangePct.toFixed(2), ms: res.ms, len });

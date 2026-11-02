import { readFileSync } from "node:fs";
import { client, segmentImage, fullMask } from "../src/sam.ts"; import { loadRGB, contrastMap } from "../src/measure.ts"; import { quadCorners, edgeSamples } from "../src/geometry.ts";
const api = client(readFileSync(".secrets/meta_api_key","utf8").trim());
const img = readFileSync(process.argv[2]); const rgb = await loadRGB(img);
const [o] = await segmentImage(api, `data:image/png;base64,${img.toString("base64")}`, "sheet of paper");
const q = quadCorners(fullMask(o, rgb.W, rgb.H), rgb.W, rgb.H); console.log("rough", q.map(p=>[p.x.toFixed(1),p.y.toFixed(1)]));
const m = contrastMap(rgb, q);
const row = Math.round((q[0].y+q[3].y)/2); console.log("profile across left edge", Array.from({length:30},(_,k)=>m[row*rgb.W+Math.round(q[0].x)-15+k].toFixed(2)).join(" "));
const s = edgeSamples(q, m, rgb.W, rgb.H, 6, 40); console.log(s.map(x=>x.length));

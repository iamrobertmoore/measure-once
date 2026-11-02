// POST /api/render {sample}: paint the recommended pole onto the hero frame (Muse Image), keep only the pole (SAM 3.1).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { client } from "../src/sam.ts";
import { renderPole, planPole } from "../src/render.ts";
import { catalogue } from "../src/catalogue.ts";
import { ROOT, key, allow } from "../src/live.ts";
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!key()) return res.status(503).json({ error: "This server has no MODEL_API_KEY." });
  if (!allow("renders")) return res.status(429).json({ error: "Today's renders are used up." });
  try {
    const id = String(req.body?.sample || ""); if (!/^[a-z0-9-]+$/.test(id)) throw new Error("unknown sample");
    const run = JSON.parse(readFileSync(join(ROOT, "public/samples", id, "run.json"), "utf8"));
    if (!run.ok) throw new Error("This clip wasn't measured, so there's no pole to show.");
    const f = run.frames.find((x: any) => x.index === run.heroIndex);
    const best = run.options[0]; const len = best.cutToMm ?? best.stockCm * 10;
    const photo = readFileSync(join(ROOT, "public/samples", id, "hero.jpg"));
    const r = await renderPole(client(key()), photo, f.G, planPole(f.wall, len, 35, catalogue.finialMm[35], 100, best.brackets));
    res.status(200).json({ image: `data:image/jpeg;base64,${r.jpeg.toString("base64")}`, usedEdit: r.usedEdit, ms: r.ms, outsideChangePct: r.outsideChangePct });
  } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
}

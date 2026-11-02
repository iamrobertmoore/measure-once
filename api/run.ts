// POST /api/run {sample}: the real pipeline, live, on one of the seeded clips.
import { runClip } from "../src/pipeline.ts";
import { loadSample, key, allow } from "../src/live.ts";
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!key()) return res.status(503).json({ error: "This server has no MODEL_API_KEY, so it can only show recorded runs." });
  if (!allow("runs")) return res.status(429).json({ error: "Today's live runs are used up. The recorded run above is the same pipeline; try again tomorrow." });
  try {
    const s = loadSample(String(req.body?.sample || ""));
    const seller = req.body?.seller === "blinds" ? "blinds" : "poles";
    const r = await runClip(key(), { mp4: s.mp4, frames: s.frames, wav: s.wav, fps: s.fps, seller });
    const heroIndex = r.heroFrame ?? 0;
    // The page draws the outlines over the hero frame, so send the frame this run picked (it can differ run to run).
    const heroImage = s.frames[heroIndex] ? `data:image/jpeg;base64,${s.frames[heroIndex].toString("base64")}` : undefined;
    res.status(200).json({ id: s.meta.id, title: s.meta.title, live: true, recordedAt: new Date().toISOString(), heroIndex, heroImage, ...r });
  } catch (e: any) { res.status(500).json({ error: String(e?.message || e) }); }
}

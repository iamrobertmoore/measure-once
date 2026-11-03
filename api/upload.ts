// POST /api/upload (multipart): try it on your own window. The browser sends up to 8 sharp frames it picked from the
// visitor's clip (or their photos) as JPEGs, plus a short mono WAV of what they said. Nothing is stored: the frames
// go to Meta's models for this one run and the result comes straight back.
import sharp from "sharp";
import { runClip } from "../src/pipeline.ts";
import { key, allow } from "../src/live.ts";

async function rawBody(req: any): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks: Buffer[] = []; for await (const c of req) chunks.push(Buffer.from(c)); return Buffer.concat(chunks);
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!key()) return res.status(503).json({ error: "This server has no MODEL_API_KEY, so it can't measure new clips." });
  const t0 = Date.now();
  try {
    const ct = String(req.headers["content-type"] || "");
    if (!ct.startsWith("multipart/form-data")) return res.status(400).json({ error: "Send the frames as multipart/form-data." });
    const fd = await new Request("http://local/upload", { method: "POST", headers: { "content-type": ct }, body: await rawBody(req) }).formData();
    const files = fd.getAll("frame").filter((f): f is File => typeof f !== "string").slice(0, 8);
    if (!files.length) return res.status(400).json({ error: "No frames came through. Pick a video or some photos of your window." });
    if (!allow("runs")) return res.status(429).json({ error: "Today's live runs are used up. Try again tomorrow, or watch a recorded run." });
    // Normalise every frame: upright, sRGB JPEG, at most 1920 px wide (what the measuring was tuned on).
    const frames = await Promise.all(files.map(async (f) => sharp(Buffer.from(await f.arrayBuffer())).rotate().resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()));
    const audio = fd.get("audio");
    const wav = audio && typeof audio !== "string" ? Buffer.from(await audio.arrayBuffer()) : undefined;
    const paperRaw = String(fd.get("paper") || "auto");
    const paper = paperRaw === "A4" || paperRaw === "Letter" ? paperRaw : undefined;
    const photos = String(fd.get("kind") || "") === "photos";
    const seller = String(fd.get("seller") || "poles") === "blinds" ? "blinds" : "poles";
    console.log(`[upload] ${files.length} frames, ${frames.reduce((n, f) => n + f.length, 0)} bytes, audio ${wav?.length ?? 0} bytes, parsed in ${Date.now() - t0} ms`);
    const r = await runClip(key(), { frames, wav, fps: 3, paper, maxFrames: 8, minFrames: photos ? 1 : 3, seller });
    console.log(`[upload] run done in ${Date.now() - t0} ms: ${JSON.stringify(r.timingsMs)}`);
    const heroIndex = r.heroFrame ?? r.frames.find((f: any) => f.ok)?.index ?? 0;
    const heroImage = `data:image/jpeg;base64,${frames[heroIndex].toString("base64")}`;
    const thumbs: Record<number, string> = {};
    for (const f of r.frames) thumbs[f.index] = `data:image/jpeg;base64,${(await sharp(frames[f.index]).resize(240).jpeg({ quality: 70 }).toBuffer()).toString("base64")}`;
    res.status(200).json({ id: "yours", title: "Your window", live: true, uploaded: true, recordedAt: new Date().toISOString(), heroIndex, heroImage, thumbs, ...r });
  } catch (e: any) { console.log(`[upload] failed after ${Date.now() - t0} ms: ${e?.message || e}`); res.status(500).json({ error: String(e?.message || e) }); }
}

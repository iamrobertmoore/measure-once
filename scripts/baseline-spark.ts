// Baseline: what does Muse Spark say the width is if it just looks at the frames (with the A4 sheet in view)?
// npx tsx scripts/baseline-spark.ts > public/samples/baseline.json   (uses the same frames the recorded runs measured)
// FAIR=1: full-size frames, and the question asks for the same span the measuring code is scored on (the outside of
// the trim, or a recess opening at the wall face), so Muse Spark alone answers the same question as the pipeline.
const FAIR = process.env.FAIR === "1";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { client } from "../src/sam.ts";
import { key } from "../src/live.ts";
process.env.MODEL_API_KEY_FILE ??= ".secrets/meta_api_key"; // local runs only
const api = client(key());
const ids = ["living-room", "bathroom", "cloakroom", "recess-friend", "small-friend"];
const ask = async (jpeg: Buffer) => {
  const small = FAIR ? jpeg : await sharp(jpeg).resize(1280).jpeg({ quality: 85 }).toBuffer();
  const res: any = await api.responses.create({
    model: "muse-spark-1.3", max_output_tokens: 12000,
    input: [{ role: "user", content: [
      { type: "input_image", image_url: `data:image/jpeg;base64,${small.toString("base64")}` },
      { type: "input_text", text: FAIR ? "There is a sheet of A4 paper (210 by 297 mm) taped flat on the wall beside this window. Using it as your scale, how wide is the span a curtain pole fixed above this window has to cover? That is the outside of any trim or surround on the wall face, or, if the window is set back in a recess, the recess opening where it meets the wall face (not the frame inside the recess). Reply with JSON only: {\"width_cm\": number}" : "There is a sheet of A4 paper (210 by 297 mm) taped flat on the wall beside this window. Using it as your scale, how wide is the window, measured across the outside of its frame or surround (where a curtain pole would need to clear it)? Reply with JSON only: {\"width_cm\": number}" },
    ] }],
  } as any);
  const t = res.output_text ?? ""; const m = t.match(/"width_cm"\s*:\s*([\d.]+)/) ?? t.match(/([\d.]+)\s*cm/); if (!m) throw new Error(`no number in: ${t.slice(0, 120)}`); return Number(m[1]);
};
const out: any[] = [];
for (const id of ids) {
  const run = JSON.parse(readFileSync(`public/samples/${id}/run.json`, "utf8"));
  const idx = run.frames.filter((f: any) => f.ok).map((f: any) => f.index);
  const vals = (await Promise.all(idx.map((i: number) => ask(readFileSync(`samples/${id}/frames/${String(i).padStart(4, "0")}.jpg`)).catch((e) => { console.error(String(e?.message || e).slice(0, 300)); return NaN; })))).filter(Number.isFinite);
  const s = [...vals].sort((a, b) => a - b), med = s[Math.floor((s.length - 1) / 2)];
  out.push({ id, frames: vals.length, spark_alone_cm: vals, spark_alone_median_cm: med, measured_cm: +(run.widthMm / 10).toFixed(1) });
}
console.log(JSON.stringify({ askedAt: new Date().toISOString(), model: "muse-spark-1.3", fair: FAIR, rows: out }, null, 1));

// Muse Spark reads what the buyer said and saw, picks among the options the code computed, and drafts the
// maker's reply. It never invents a number: every figure it may use is passed in, and the reply is checked after.
import type OpenAI from "openai";
import { catalogue, type Option } from "./catalogue.ts";

export type Draft = {
  curtainType: "eyelet" | "rings" | "tab top" | "pinch pleat" | "unknown";
  chosenStockCm: number;
  diameterMm: number;
  reply: string;
  questions: string[]; // anything the maker should ask before the buyer orders
};

const VOICE = `You write as Rob, a one-man maker in Whitstable who sells handmade reclaimed-style wooden curtain poles on Etsy.
His replies are warm, plain and practical, British English, first person, no em dashes, no exclamation marks, signed "Best wishes, Rob".
House rules: poles come in fixed lengths and the buyer cuts them down with a fine-tooth saw (instructions included);
take an equal amount off each outer end so any join stays central; poles of 240 cm and over ship in two pieces with a
centre bracket under the join; finials add length at each end; rings are not sold (eyelet curtains go straight on the pole);
holdbacks are priced individually; returns aren't accepted on cut poles, so sizing must be right first time.`;

export async function draftReply(api: OpenAI, input: {
  transcript: string; buyerMessage?: string; frameWidthMm: number; spreadMm: number; options: Option[]; diameterMm: number; model?: string; handSpanCm?: [number, number]; baseURL?: string;
}): Promise<Draft> {
  const facts = {
    measured_frame_width_cm: +(input.frameWidthMm / 10).toFixed(1),
    measurement_spread_mm: Math.round(input.spreadMm),
    options: input.options.map((o) => ({
      stock_length_cm: o.stockCm, cut_to_cm: o.cutToMm ? o.cutToMm / 10 : null, cut_each_end_cm: +(o.cutPerEndMm / 10).toFixed(1),
      past_frame_each_side_cm: +(o.overhangEachSideMm / 10).toFixed(1), two_piece: o.twoPiece, brackets: o.brackets, fit: o.fit, note: o.note,
    })),
    diameter_mm: input.diameterMm,
    finial_adds_each_end_cm: (catalogue.finialMm[input.diameterMm] ?? 90) / 10,
    listing: catalogue.listing,
    ...(input.handSpanCm ? { buyer_pointed_past_frame_cm: { left: input.handSpanCm[0], right: input.handSpanCm[1] } } : {}),
  };
  let lastErr: any;
  for (let attempt = 0; attempt < 2; attempt++) {
  try {
  const res: any = await api.responses.create({
    model: input.model ?? "muse-spark-1.3",
    max_output_tokens: 4000,
    instructions: VOICE,
    input: [{ role: "user", content: [{ type: "input_text", text:
`A buyer sent a short video of their window with a sheet of A4 on the wall. My measuring tool computed these facts (use ONLY these numbers; do not compute new ones):
${JSON.stringify(facts, null, 1)}

What the buyer said in the clip: "${input.transcript || "(nothing)"}"
${input.buyerMessage ? `Their message: "${input.buyerMessage}"` : ""}

Pick the best option for what they want, and draft my reply: one short paragraph recommending the size with the exact cut per end if any,
one line on the alternative if there is one, and one line on finial clearance. Under 140 words. Return JSON:
{"curtainType": "eyelet|rings|tab top|pinch pleat|unknown", "chosenStockCm": number, "diameterMm": number, "reply": string, "questions": string[]}` }] }],
    text: { format: { type: "json_object" } },
  } as any);
  const text = res.output_text ?? res.output?.flatMap((o: any) => o.content ?? []).map((c: any) => c.text ?? "").join("") ?? "";
  const jsonText = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const d = JSON.parse(jsonText) as Draft;
  checkNumbers(d.reply, facts);
  return d;
  } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/** Every number in the reply must be one we supplied (cm or mm forms). Throws on anything invented. */
export function checkNumbers(reply: string, facts: any) {
  const allowed = new Set<string>();
  const add = (v: number | null | undefined) => { if (v === null || v === undefined) return; for (const x of [v, v * 10, v / 10]) { allowed.add(String(+x.toFixed(1))); allowed.add(String(Math.round(x))); } };
  if (facts.buyer_pointed_past_frame_cm) { add(facts.buyer_pointed_past_frame_cm.left); add(facts.buyer_pointed_past_frame_cm.right); }
  add(facts.measured_frame_width_cm); add(facts.measurement_spread_mm); add(facts.diameter_mm); add(facts.finial_adds_each_end_cm);
  for (const o of facts.options) { add(o.brackets); add(o.stock_length_cm); add(o.cut_to_cm); add(o.cut_each_end_cm); add(o.past_frame_each_side_cm); }
  for (const n of [1, 2, 3, 4, 10, 15, 20, 890563497]) allowed.add(String(n)); // counts, the house overhang band, the listing id
  const found = reply.match(/\d+(?:\.\d+)?/g) ?? [];
  const bad = found.filter((n) => !allowed.has(String(+n)));
  if (bad.length) throw new Error(`reply contains numbers the tool didn't compute: ${bad.join(", ")}`);
}

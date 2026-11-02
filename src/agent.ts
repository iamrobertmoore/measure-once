// Muse Spark reads what the buyer said and saw, picks among the options the code computed, and drafts the
// maker's reply. It never invents a number: every figure it may use is passed in, and the reply is checked after.
import type OpenAI from "openai";
import { catalogue, sizeOptions, type Option } from "./catalogue.ts";

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
  // Lengths the buyer said out loud or wrote. If one disagrees with what we measured, the reply must say so and ask
  // which edges they meant (a window set back in a recess is the usual cause: the pole spans the opening on the wall,
  // the frame is behind it), rather than quietly preferring either number.
  const said = buyerLengthsCm(`${input.transcript} ${input.buyerMessage ?? ""}`);
  const measuredCm = input.frameWidthMm / 10;
  const clash = said.filter((v) => Math.abs(v - measuredCm) > Math.max(3, 0.03 * measuredCm));
  if (said.length) (facts as any).buyer_said_cm = said;
  if (clash.length) {
    (facts as any).buyer_number_differs_from_measured_by_cm = Math.round(Math.abs(clash[0] - measuredCm));
    // Sizes for the buyer's own number too, computed the same way, so the reply can offer both without inventing.
    (facts as any).options_if_buyer_number_is_the_span = sizeOptions(clash[0] * 10, input.diameterMm).slice(0, 2).map((o) => ({
      stock_length_cm: o.stockCm, cut_to_cm: o.cutToMm ? o.cutToMm / 10 : null, cut_each_end_cm: +(o.cutPerEndMm / 10).toFixed(1),
      past_frame_each_side_cm: +(o.overhangEachSideMm / 10).toFixed(1), brackets: o.brackets, fit: o.fit,
    }));
  }
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

${clash.length ? `The buyer said ${clash[0]} cm but the tool measured the frame at ${facts.measured_frame_width_cm} cm. Do not choose between them silently: in the reply, say both numbers plainly, say the size you recommend for the measured frame, give the size from options_if_buyer_number_is_the_span in case their number is the span the pole must cover, and ask which edges their ${clash[0]} cm runs between (for example a recess opening around a set-back window, where the pole would span the opening). Put that question in "questions" too.\n` : ""}Pick the best option for what they want, and draft my reply: one short paragraph recommending the size with the exact cut per end if any,
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
  add(facts.measured_frame_width_cm); add(facts.measurement_spread_mm);
  for (const v of facts.buyer_said_cm ?? []) add(v);
  add(facts.buyer_number_differs_from_measured_by_cm); add(facts.diameter_mm); add(facts.finial_adds_each_end_cm);
  for (const o of [...facts.options, ...(facts.options_if_buyer_number_is_the_span ?? [])]) { add(o.brackets); add(o.stock_length_cm); add(o.cut_to_cm); add(o.cut_each_end_cm); add(o.past_frame_each_side_cm); }
  for (const n of [1, 2, 3, 4, 10, 15, 20, 890563497]) allowed.add(String(n)); // counts, the house overhang band, the listing id
  const found = reply.match(/\d+(?:\.\d+)?/g) ?? [];
  const bad = found.filter((n) => !allowed.has(String(+n)));
  if (bad.length) throw new Error(`reply contains numbers the tool didn't compute: ${bad.join(", ")}`);
}

/** Lengths in a buyer's words: "222 centimetres", "59 cm", "1190 mm", "2.2 metres". Returned in cm. */
export function buyerLengthsCm(text: string): number[] {
  const out: number[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(centimet(?:er|re)s?|cms?|millimet(?:er|re)s?|mm|met(?:er|re)s?|m)\b/gi;
  for (const m of text.matchAll(re)) {
    const v = Number(m[1]), u = m[2].toLowerCase();
    const cm = u.startsWith("mil") || u === "mm" ? v / 10 : u.startsWith("c") ? v : v * 100;
    if (cm >= 20 && cm <= 800 && !out.includes(cm)) out.push(cm);
  }
  return out;
}

// Muse Spark reads what the buyer said and saw, picks among the options the code computed, and drafts the
// maker's reply. It never invents a number: every figure it may use is passed in, and the reply is checked after.
import type OpenAI from "openai";
import { catalogue, sizeOptions, type Option } from "./catalogue.ts";
import { openJson, OPEN_MODEL, OPEN_WHERE } from "./open.ts";
import { likelyMm, poleAcross } from "./sure.ts";

export type Draft = {
  curtainType: "eyelet" | "rings" | "tab top" | "pinch pleat" | "unknown";
  chosenStockCm: number;
  diameterMm: number;
  reply: string;
  questions: string[]; // anything the maker should ask before the buyer orders
  ranOn?: string; // which Meta model wrote it, and where
};

const VOICE = `You write as Rob, a one-man maker in Whitstable who sells handmade reclaimed-style wooden curtain poles on Etsy.
His replies are warm, plain and practical, British English, first person, no em dashes, no exclamation marks, signed "Best wishes, Rob".
House rules: poles come in fixed lengths and the buyer cuts them down with a fine-tooth saw (instructions included);
take an equal amount off each outer end so any join stays central; poles of 240 cm and over ship in two pieces with a
centre bracket under the join; finials add length at each end; rings are not sold (eyelet curtains go straight on the pole);
holdbacks are priced individually; returns aren't accepted on cut poles, so sizing must be right first time.`;

export async function draftReply(api: OpenAI, input: {
  transcript: string; buyerMessage?: string; frameWidthMm: number; windowFrameMm?: number; spreadMm: number; options: Option[]; diameterMm: number; model?: string; handSpanCm?: [number, number]; baseURL?: string; framesUsed?: number;
}): Promise<Draft> {
  const facts = {
    measured_width_cm: +(input.frameWidthMm / 10).toFixed(1),
    measured_what: input.windowFrameMm ? "the opening in the wall around the window (it sits back in a recess); the pole spans this" : "the outside of the window frame or its surround",
    ...(input.windowFrameMm ? { window_frame_inside_recess_cm: +(input.windowFrameMm / 10).toFixed(1) } : {}),
    measurement_spread_mm: Math.round(input.spreadMm),
    options: input.options.map((o) => ({
      stock_length_cm: o.stockCm, cut_to_cm: o.cutToMm ? o.cutToMm / 10 : null, cut_each_end_cm: +(o.cutPerEndMm / 10).toFixed(1),
      past_frame_each_side_cm: +(o.overhangEachSideMm / 10).toFixed(1), two_piece: o.twoPiece, brackets: o.brackets, fit: o.fit, note: o.note,
    })),
    diameter_mm: input.diameterMm,
    finial_adds_each_end_cm: (catalogue.finialMm[input.diameterMm] ?? 90) / 10,
    listing: catalogue.listing,
    house_overhang_band_cm: [catalogue.overhangMm.min / 10, catalogue.overhangMm.max / 10],
    ...(input.handSpanCm ? { buyer_pointed_past_frame_cm: { left: input.handSpanCm[0], right: input.handSpanCm[1] } } : {}),
  };
  // How sure: the likely range of the width, and whether the first option still fits at both ends of it.
  const L = likelyMm(input.frameWidthMm, input.spreadMm, input.framesUsed ?? 6, !!input.windowFrameMm);
  const o0 = input.options[0];
  if (o0) {
    const A = poleAcross(o0.cutToMm ?? o0.stockCm * 10, L.lo, L.hi);
    Object.assign(facts, {
      likely_width_range_cm: [+(L.lo / 10).toFixed(1), +(L.hi / 10).toFixed(1)],
      first_option_fits_across_range: A.holds,
      first_option_past_each_side_across_range_cm: [+(A.least / 10).toFixed(1), +(A.most / 10).toFixed(1)],
    });
  }
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
  const prompt = (extra: string) => `A buyer sent a short video of their window with a sheet of A4 on the wall. My measuring tool computed these facts (use ONLY these numbers; do not compute new ones; write every length in digits with its unit):
${JSON.stringify(facts, null, 1)}

What the buyer said in the clip: "${input.transcript || "(nothing)"}"
${input.buyerMessage ? `Their message: "${input.buyerMessage}"` : ""}

${clash.length ? `The buyer said ${clash[0]} cm but the tool measured ${facts.measured_width_cm} cm. Do not choose between them: in the reply, say both numbers plainly, give the size for each side by side (the measured one from options, theirs from options_if_buyer_number_is_the_span), and ask which edges their ${clash[0]} cm runs between (for example a recess opening around a set-back window, where the pole would span the opening), so they can tell you which to send. Put that question in "questions" too.\n` : ""}Pick the best option for what they want, and draft my reply: the size with the exact cut per end if any,
one line on the alternative if there is one, and one line on finial clearance. If first_option_fits_across_range is false, ask them to check the width with a tape before ordering; if it is true, you may say in one short clause that it still fits even if the window is a little wider or narrower than measured. Write two or three short paragraphs of plain, natural sentences (no run-on sentences, no list of one-line facts). Under 120 words. ${extra}
Return JSON: {"curtainType": "eyelet|rings|tab top|pinch pleat|unknown", "chosenStockCm": number, "diameterMm": number, "reply": string, "questions": string[]}`;
  const alt = (facts as any).options_if_buyer_number_is_the_span?.[0];
  const altLen = alt ? (alt.cut_to_cm ?? alt.stock_length_cm) : null;
  const hasAlt = (r: string) => altLen === null || new RegExp(`\\b${String(altLen).replace(".", "\\.")}\\s*cm`).test(r);
  let lastErr: any, best: Draft | null = null;
  // Muse Spark Open (open weights, on Baseten) drafts when a key is set; if Baseten itself fails, the hosted
  // Muse Spark takes over for the rest of this draft. A draft that fails the number check is retried either way.
  let openDown = !!input.model;
  for (let attempt = 0; attempt < 3; attempt++) {
  try {
  const userText = prompt(attempt > 0 && best ? `Your last draft left out the size for the buyer's ${clash[0]} cm. Include it: the ${alt.stock_length_cm} cm pole${alt.cut_to_cm ? ` cut to ${alt.cut_to_cm} cm, ${alt.cut_each_end_cm} cm off each end` : " as supplied"}.` : "");
  let text = "", ranOn = "";
  if (!openDown) {
    try {
      const o = await openJson(VOICE, userText);
      if (o) { text = o.text; ranOn = `${OPEN_MODEL} on ${OPEN_WHERE}`; } else openDown = true;
    } catch (e: any) { openDown = true; console.log(`[open] falling back to hosted Muse Spark: ${e?.message ?? e}`); }
  }
  if (!text) {
    const res: any = await api.responses.create({
      model: input.model ?? "muse-spark-1.3",
      max_output_tokens: 16000, reasoning: { effort: process.env.DRAFT_EFFORT || "low" },
      instructions: VOICE,
      input: [{ role: "user", content: [{ type: "input_text", text: userText }] }],
      text: { format: { type: "json_object" } },
    } as any);
    text = res.output_text ?? res.output?.flatMap((o: any) => o.content ?? []).map((c: any) => c.text ?? "").join("") ?? "";
    ranOn = input.model ?? "muse-spark-1.3";
  }
  const jsonText = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const d = JSON.parse(jsonText) as Draft;
  d.ranOn = ranOn; (d as any).attempt = attempt + 1;
  d.questions = Array.isArray(d.questions) ? d.questions : [];
  checkNumbers(d.reply, facts, d.questions);
  if (hasAlt(d.reply)) return d;
  best = d;
  } catch (e) { lastErr = e; }
  }
  // Spark kept leaving out the second size: the code writes that sentence itself, from the computed option.
  if (best && alt) {
    const line = `If your ${clash[0]} cm is the span the pole has to cover, the ${alt.stock_length_cm} cm pole${alt.cut_to_cm ? ` cut to ${alt.cut_to_cm} cm (${alt.cut_each_end_cm} cm off each end)` : " as supplied"} would fit that instead.`;
    const sign = best.reply.lastIndexOf("Best wishes");
    best.reply = sign > 0 ? `${best.reply.slice(0, sign).trimEnd()}\n${line}\n${best.reply.slice(sign)}` : `${best.reply}\n${line}`;
    (best as any).secondSizeAddedByCode = true;
    checkNumbers(best.reply, facts, best.questions);
    return best;
  }
  throw lastErr;
}

/**
 * Every length in the reply (and in the suggested questions) must be one the code computed or the buyer said, in
 * the unit it's written in: "253 cm" must be a centimetre fact, "35 mm" a millimetre fact. Bare numbers may only be
 * small counts (pieces, brackets) or a length fact; lengths spelled out in words are refused so nothing slips past.
 * Throws on anything else. This stops invented numbers; it can't stop a real number being put in the wrong place,
 * which is why the maker reads the draft before it goes.
 */
export function checkNumbers(reply: string, facts: any, questions: string[] = []) {
  const cm: number[] = [], mm: number[] = [];
  const addCm = (v: number | null | undefined) => { if (v !== null && v !== undefined && Number.isFinite(v)) { cm.push(v); mm.push(v * 10); } };
  if (facts.buyer_pointed_past_frame_cm) { addCm(facts.buyer_pointed_past_frame_cm.left); addCm(facts.buyer_pointed_past_frame_cm.right); }
  addCm(facts.measured_width_cm); addCm(facts.window_frame_inside_recess_cm); addCm(facts.finial_adds_each_end_cm); addCm(facts.buyer_number_differs_from_measured_by_cm);
  for (const v of facts.buyer_said_cm ?? []) addCm(v);
  for (const v of facts.house_overhang_band_cm ?? []) addCm(v);
  for (const v of facts.extra_cm ?? []) addCm(v);
  for (const v of [...(facts.likely_width_range_cm ?? []), ...(facts.first_option_past_each_side_across_range_cm ?? [])]) addCm(v);
  for (const o of [...facts.options, ...(facts.options_if_buyer_number_is_the_span ?? [])]) { addCm(o.stock_length_cm); addCm(o.cut_to_cm); addCm(o.cut_each_end_cm); addCm(o.past_frame_each_side_cm); }
  mm.push(facts.diameter_mm, facts.measurement_spread_mm);
  const counts = new Set<number>([1, 2, 3, 4]);
  for (const o of facts.options) if (o.brackets) counts.add(o.brackets);
  const near = (v: number, list: number[]) => list.some((f) => Math.abs(f - v) < 0.051 || Math.round(f) === v);
  const text = [reply, ...questions].join("\n");
  const bad: string[] = [];
  if (/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\s+(cm|centimet|millimet|mm|metre|meter)/i.test(text)) bad.push("a length in words");
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(cm|centimet\w*|mm|millimet\w*|metres?|meters?|m\b)?/gi)) {
    const v = Number(m[1]), u = (m[2] || "").toLowerCase();
    if (String(facts.listing).includes(m[1]) && m[1].length > 6) continue; // the listing id
    const ok = u.startsWith("c") ? near(v, cm) : u.startsWith("mi") || u === "mm" ? near(v, mm) : u ? near(v * 100, cm) : counts.has(v) || near(v, cm);
    if (!ok) bad.push(`${m[1]}${u ? " " + u : ""}`);
  }
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

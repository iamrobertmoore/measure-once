// A second maker's rules on the same measurement: a made-to-measure roller blind. This shows the desk isn't tied to
// my poles: the clip, SAM 3.1 and the geometry are the same, only the catalogue and the reply change.
// The numbers below are the usual trade rules for roller blinds (an example catalogue, not a real shop):
//  - fitted inside a recess: order the recess width less 10 mm, so the brackets and fabric clear the reveals;
//  - fitted outside (on the wall or the trim): order the opening plus 50 mm each side (80 mm for blackout), so light
//    doesn't creep round the edges;
//  - the drop: inside, the recess height less 10 mm; outside, the opening plus 50 mm above and below.
import type OpenAI from "openai";
import { checkNumbers } from "./agent.ts";

export const blinds = {
  name: "made-to-measure roller blind (example catalogue)",
  insideDeductMm: 10,
  outsideOverlapMm: 50,
  blackoutOverlapMm: 80,
  dropOverlapMm: 50,
  maxWidthMm: 3000,
  minWidthMm: 300,
};

export type BlindOption = { fit: "inside the recess" | "outside, standard" | "outside, blackout"; widthMm: number; dropMm: number | null; overlapEachSideMm: number; note: string };

export function blindOptions(m: { openingMm: number; recess: boolean; heightMm: number | null }): BlindOption[] {
  const out: BlindOption[] = [];
  const round5 = (v: number) => Math.floor(v / 5) * 5; // made to the nearest 5 mm, rounded down so it never binds
  for (const [fit, ov] of [["outside, standard", blinds.outsideOverlapMm], ["outside, blackout", blinds.blackoutOverlapMm]] as const) {
    out.push({ fit, widthMm: round5(m.openingMm + 2 * ov), dropMm: m.heightMm ? round5(m.heightMm + 2 * blinds.dropOverlapMm) : null, overlapEachSideMm: ov, note: fit.endsWith("blackout") ? "wider overlap so less light gets round the sides" : "covers the opening with a little to spare each side" });
  }
  // Inside the recess, a blind has only millimetres to spare and a video measurement can be a few centimetres out,
  // so this size is a guide: the buyer checks the recess with a tape before ordering it.
  if (m.recess) out.push({ fit: "inside the recess", widthMm: round5(m.openingMm - blinds.insideDeductMm), dropMm: m.heightMm ? round5(m.heightMm - blinds.insideDeductMm) : null, overlapEachSideMm: 0, note: "a guide only: check the recess width with a tape before ordering, as an inside blind has to be exact" });
  return out.filter((o) => o.widthMm >= blinds.minWidthMm && o.widthMm <= blinds.maxWidthMm);
}

export async function draftBlindReply(api: OpenAI, input: { transcript: string; openingMm: number; recess: boolean; frameMm?: number; heightMm: number | null; options: BlindOption[] }) {
  const facts = {
    measured_width_cm: +(input.openingMm / 10).toFixed(1),
    measured_what: input.recess ? "the recess opening on the wall" : "the outside of the window frame or its surround",
    ...(input.frameMm ? { window_frame_inside_recess_cm: +(input.frameMm / 10).toFixed(1) } : {}),
    measured_height_cm: input.heightMm ? +(input.heightMm / 10).toFixed(1) : null,
    options: input.options.map((o) => ({ fit: o.fit, width_cm: o.widthMm / 10, drop_cm: o.dropMm ? o.dropMm / 10 : null, overlap_each_side_cm: o.overlapEachSideMm / 10, note: o.note })),
  };
  // The reply checker works on centimetre facts: give it every length the reply may use.
  const cmFacts = [facts.measured_width_cm, (facts as any).window_frame_inside_recess_cm, facts.measured_height_cm, ...facts.options.flatMap((o) => [o.width_cm, o.drop_cm, o.overlap_each_side_cm])].filter((v): v is number => typeof v === "number" && v > 0);
  const checkFacts = { measured_width_cm: facts.measured_width_cm, extra_cm: cmFacts, options: [], diameter_mm: 0, measurement_spread_mm: 0, listing: "" };
  const text = `You write as the maker at a small workshop that makes roller blinds to measure. A buyer sent a short clip of their window with a sheet of A4 on the wall. My measuring tool computed these facts (use ONLY these numbers; write every length in digits with its unit):
${JSON.stringify(facts, null, 1)}

What the buyer said in the clip: "${input.transcript || "(nothing)"}"

Draft my reply, warm and practical, British English, first person, no em dashes, under 120 words, signed "Best wishes". Give the width to order for each fit option.${input.recess ? " For the inside-the-recess size, say plainly that it is a guide and ask them to check the recess width with a tape before ordering it, because a measurement from a video can be a few centimetres out and a blind inside a recess has to be exact." : ""} ${input.heightMm ? "Give the drop too." : "The drop couldn't be measured from the clip: ask them to measure the height and say which edges."} Return JSON: {"reply": string, "questions": string[]}`;
  let last: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res: any = await api.responses.create({ model: "muse-spark-1.3", max_output_tokens: 16000, input: [{ role: "user", content: [{ type: "input_text", text }] }] } as any);
      const t: string = res.output_text ?? "";
      const d = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
      d.questions = Array.isArray(d.questions) ? d.questions : [];
      checkNumbers(d.reply, checkFacts, d.questions);
      return d as { reply: string; questions: string[] };
    } catch (e) { last = e; }
  }
  throw last;
}

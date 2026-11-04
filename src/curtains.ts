// A third maker's rules on the same measurement: made-to-measure curtains, hung from the pole my rules size.
// The numbers below are the usual trade rules for made-to-measure curtains (an example catalogue, not a real shop):
//  - the pair's total width is the pole length times the heading's fullness: pencil pleat 2.25, eyelet 2;
//  - each curtain is half of that, made up from whole or half widths of 137 cm fabric;
//  - the drop is measured from the bottom of the rings (or the top of an eyelet curtain): with the pole 10 cm above the
//    window, sill length stops 1 cm above the sill, below-sill length runs 15 cm past it. Floor length needs a tape.
import type OpenAI from "openai";
import { checkNumbers } from "./agent.ts";
import { openJson, OPEN_MODEL, OPEN_WHERE } from "./open.ts";
import type { Option } from "./catalogue.ts";

export const curtains = {
  name: "made-to-measure curtains (example catalogue)",
  headings: [["pencil pleat", 2.25], ["eyelet", 2]] as const,
  fabricWidthMm: 1370,
  poleAboveWindowMm: 100,
  sillGapMm: 10,
  belowSillMm: 150,
};

export type CurtainOption = { heading: string; fullness: number; poleMm: number; eachCurtainMm: number; fabricWidthsEach: number; sillDropMm: number | null; belowSillDropMm: number | null };

export function curtainOptions(m: { pole: Option; heightMm: number | null }): CurtainOption[] {
  const poleMm = m.pole.cutToMm ?? m.pole.stockCm * 10;
  const up5 = (v: number) => Math.ceil(v / 50) * 50; // made to the next 5 cm
  return curtains.headings.map(([heading, fullness]) => {
    const each = up5((poleMm * fullness) / 2);
    return {
      heading, fullness, poleMm, eachCurtainMm: each,
      fabricWidthsEach: Math.ceil((each / curtains.fabricWidthMm) * 2) / 2,
      sillDropMm: m.heightMm ? Math.round((m.heightMm + curtains.poleAboveWindowMm - curtains.sillGapMm) / 10) * 10 : null,
      belowSillDropMm: m.heightMm ? Math.round((m.heightMm + curtains.poleAboveWindowMm + curtains.belowSillMm) / 10) * 10 : null,
    };
  });
}

export async function draftCurtainReply(api: OpenAI, input: { transcript: string; openingMm: number; recess: boolean; options: CurtainOption[] }) {
  const facts = {
    measured_width_cm: +(input.openingMm / 10).toFixed(1),
    measured_what: input.recess ? "the recess opening" : "the window, outside its frame",
    pole_length_cm: input.options[0].poleMm / 10,
    options: input.options.map((o) => ({ heading: o.heading, fullness: o.fullness, each_curtain_width_cm: o.eachCurtainMm / 10, fabric_widths_each: o.fabricWidthsEach, sill_drop_cm: o.sillDropMm ? o.sillDropMm / 10 : null, below_sill_drop_cm: o.belowSillDropMm ? o.belowSillDropMm / 10 : null })),
  };
  const cmFacts = [facts.measured_width_cm, facts.pole_length_cm, ...facts.options.flatMap((o) => [o.each_curtain_width_cm, o.sill_drop_cm, o.below_sill_drop_cm])].filter((v): v is number => typeof v === "number" && v > 0);
  const checkFacts = { measured_width_cm: facts.measured_width_cm, extra_cm: cmFacts, options: [], diameter_mm: 0, measurement_spread_mm: 0, listing: "" };
  const hasDrop = facts.options.some((o) => o.sill_drop_cm);
  const system = `You write as the maker at a small workshop that makes curtains to measure. Warm and practical, British English, first person, no em dashes. Use ONLY the numbers given; write every length in digits with its unit. Return JSON: {"reply": string, "questions": string[]}`;
  const user = `A buyer sent a short clip of their window with a sheet of A4 on the wall. My measuring tool computed these facts:
${JSON.stringify(facts, null, 1)}

What the buyer said in the clip: "${input.transcript || "(nothing)"}"

Draft my reply in two or three short paragraphs of plain, natural sentences, under 120 words, signed "Best wishes". Don't repeat the facts' wording; say it the way a maker would to a customer. Say the curtains are sized for a ${facts.pole_length_cm} cm pole, and give the width of each curtain in the pair for each heading. ${hasDrop ? "Give the sill and below-sill drops, and say floor length needs a tape from the pole to the floor." : "The drop couldn't be measured from the clip: ask them to measure from where the pole will go down to the sill, or to the floor for full length."}`;
  let last: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let text = "", ranOn = "";
      if (attempt < 2) { const o = await openJson(system, user).catch(() => null); if (o) { text = o.text; ranOn = `${OPEN_MODEL} on ${OPEN_WHERE}`; } }
      if (!text) {
        const res: any = await api.responses.create({ model: "muse-spark-1.3", max_output_tokens: 16000, reasoning: { effort: "low" }, instructions: system, input: [{ role: "user", content: [{ type: "input_text", text: user }] }] } as any);
        text = res.output_text ?? ""; ranOn = "muse-spark-1.3";
      }
      const d = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      d.questions = Array.isArray(d.questions) ? d.questions : [];
      checkNumbers(d.reply, checkFacts, d.questions);
      return { reply: d.reply as string, questions: d.questions as string[], ranOn };
    } catch (e) { last = e; }
  }
  throw last;
}

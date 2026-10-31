// The maker's catalogue and sizing rules. Every number a buyer sees comes from here and the geometry, never a model.
export const catalogue = {
  shop: "creationsfromrob",
  listing: "https://www.etsy.com/listing/890563497",
  lengthsCm: [150, 180, 200, 240, 300, 360],
  diametersMm: [28, 35, 50],
  twoPieceFromCm: 240, // ships in two pieces with a join and a centre bracket
  finialMm: { 28: 90, 35: 90, 50: 117 } as Record<number, number>, // added per end
  bracketProjectionMm: { 28: 90, 35: 90, 50: 103 } as Record<number, number>,
  overhangMm: { min: 150, max: 200, tightMin: 100 }, // past the frame, each side
  ringsSold: false,
  ringInternalMinMm: { 28: 38, 35: 45, 50: 60 } as Record<number, number>,
  holdbacks: "priced individually",
  cutting: "the buyer cuts with a fine-tooth saw; instructions included; take an equal amount off each outer end so the join stays central",
};

export type Option = {
  stockCm: number;
  cutToMm: number | null; // null = use as supplied
  cutPerEndMm: number;
  overhangEachSideMm: number;
  twoPiece: boolean;
  fit: "ideal" | "tight" | "too short";
  overallWithFinialsMm: number;
  note: string;
};

/**
 * Options for a measured frame width. The target pole runs 15 to 20 cm past the frame each side.
 * `wallEachSideMm` (optional) is the clear wall from the frame edge to an alcove or return, for the finial check.
 */
export function sizeOptions(frameWidthMm: number, diameterMm = 35, wallEachSideMm?: number): Option[] {
  const { min, max, tightMin } = catalogue.overhangMm;
  const fin = catalogue.finialMm[diameterMm] ?? 90;
  const targetMin = frameWidthMm + 2 * min, targetMax = frameWidthMm + 2 * max;
  const target = Math.round((targetMin + targetMax) / 2 / 10) * 10; // nearest cm in the middle of the band
  const out: Option[] = [];
  for (const L of catalogue.lengthsCm) {
    const Lmm = L * 10;
    let cutTo: number | null = null, len = Lmm;
    if (Lmm > targetMax) { cutTo = target; len = target; }
    const over = (len - frameWidthMm) / 2;
    const fit: Option["fit"] = over >= min ? "ideal" : over >= tightMin ? "tight" : "too short";
    if (fit === "too short") continue;
    const overall = len + 2 * fin;
    let note = cutTo ? `cut ${Math.round((Lmm - len) / 2 / 10 * 10) / 10} cm off each end` : "use as supplied";
    if (fit === "tight") note += "; a little tight for curtains to clear the glass";
    if (wallEachSideMm !== undefined && over + fin > wallEachSideMm) note += "; finials won't clear the wall each side";
    out.push({ stockCm: L, cutToMm: cutTo, cutPerEndMm: (Lmm - len) / 2, overhangEachSideMm: over, twoPiece: L >= catalogue.twoPieceFromCm, fit, overallWithFinialsMm: overall, note });
  }
  // Cutting a longer stock length down to the same target only wastes pole: keep the shortest one that works.
  const firstCut = out.find((o) => o.cutToMm !== null);
  const pruned = out.filter((o) => o.cutToMm === null || o === firstCut);
  // Best first: ideal with no cut, then ideal with the smallest cut, then tight.
  const rank = (o: Option) => (o.fit === "ideal" ? 0 : 10) + (o.cutToMm ? 1 + o.cutPerEndMm / 1000 : 0);
  return pruned.sort((a, b) => rank(a) - rank(b)).slice(0, 3);
}

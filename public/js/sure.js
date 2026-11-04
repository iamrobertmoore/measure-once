// How sure is a measurement, and does the recommendation survive that doubt?
// The likely range combines two things: how much the frames disagree with each other (random error, shrinking with
// more frames) and how far this kind of window has been from a steel tape (systematic error, set from the
// tape-checked windows in samples/accuracy.json: plain windows were within 2.3 cm, recesses within 5.5 cm).
// The range is two standard deviations each side. A recommendation "holds" when it still fits at both ends.

export const SYS_MM = { plain: 13, recess: 29 }; // one standard deviation, from the tape-checked windows
export const BAND = { min: 150, max: 200, tightMin: 100, tooLong: 250 }; // the pole's overhang past each side, mm

export function likely(run) {
  const n = Math.max(1, run.framesUsed || 1);
  const spread = Math.max(0, run.spreadMm || 0); // the frames' interquartile range
  const random = spread / 1.35 / Math.sqrt(n); // IQR to standard deviation, then the error of their median
  const sys = run.span?.adopted ? SYS_MM.recess : SYS_MM.plain;
  const half = 2 * Math.sqrt(random * random + sys * sys);
  return { lo: run.widthMm - half, hi: run.widthMm + half, half, recess: !!run.span?.adopted };
}

/** The pole's overhang past each side, across the likely range. Holds if it fits at both ends. */
export function poleHolds(run, o) {
  if (!o) return null;
  const { lo, hi } = likely(run);
  const len = o.cutToMm ?? o.stockCm * 10;
  const most = (len - lo) / 2, least = (len - hi) / 2;
  return { least, most, holds: least >= BAND.tightMin && most <= BAND.tooLong, inBand: least >= BAND.min && most <= BAND.max };
}

/** A blind fitted inside a recess has millimetres to spare, so it never "holds" on a video measurement alone. */
export function blindHolds(run, b) {
  if (!b) return null;
  if (/inside/.test(b.fit)) return { holds: false, why: "an inside blind has to be exact" };
  return { holds: true };
}

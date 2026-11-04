// How sure is a measurement, and does the recommended pole still fit across that doubt? (Same rules as public/js/sure.js.)
// Two standard deviations each side: the frames' own disagreement (shrinking with more frames) plus how far this kind of
// window has been from a steel tape (plain within 2.3 cm, recess within 5.5 cm on the tape-checked windows).
export const SYS_MM = { plain: 13, recess: 29 };
export function likelyMm(widthMm: number, spreadMm: number, frames: number, recess: boolean) {
  const random = Math.max(0, spreadMm) / 1.35 / Math.sqrt(Math.max(1, frames));
  const sys = recess ? SYS_MM.recess : SYS_MM.plain;
  const half = 2 * Math.sqrt(random * random + sys * sys);
  return { lo: widthMm - half, hi: widthMm + half, half };
}
export function poleAcross(lenMm: number, lo: number, hi: number) {
  const least = (lenMm - hi) / 2, most = (lenMm - lo) / 2;
  return { least, most, holds: least >= 100 && most <= 250 };
}

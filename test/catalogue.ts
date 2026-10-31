// Robert's own 20 Oct reply is the test: a 178 cm window -> 200 cm gives ~11 cm each side (tight), 240 cut to ~210-220.
import { sizeOptions } from "../src/catalogue.ts";
const o = sizeOptions(1780, 35);
console.log(o.map((x) => `${x.stockCm} cm ${x.cutToMm ? "-> " + x.cutToMm / 10 + " cm" : ""} | ${(x.overhangEachSideMm / 10).toFixed(1)} cm each side | ${x.fit} | ${x.note}`).join("\n"));
const t200 = o.find((x) => x.stockCm === 200)!, t240 = o.find((x) => x.stockCm === 240)!;
if (Math.round(t200.overhangEachSideMm / 10) !== 11 || t200.fit !== "tight") throw new Error("200 cm should give 11 cm each side, tight");
if (!(t240.cutToMm! >= 2080 && t240.cutToMm! <= 2180)) throw new Error("240 should be cut to about 210-220 cm");
console.log("matches Robert's 20 Oct answer");

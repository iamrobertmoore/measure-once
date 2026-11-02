// The reply checker: invented numbers are refused, computed ones pass, units are respected.
import { checkNumbers } from "../src/agent.ts";
const facts = { measured_width_cm: 219.4, measurement_spread_mm: 20, diameter_mm: 35, finial_adds_each_end_cm: 9, listing: 890563497,
  house_overhang_band_cm: [15, 20], options: [{ stock_length_cm: 300, cut_to_cm: 254, cut_each_end_cm: 23, past_frame_each_side_cm: 17.3, brackets: 3 }] };
const cases: [string, boolean][] = [
  ["The 300 cm pole cut to 254 cm, 23 cm off each end, leaves 17.3 cm past the frame. 3 brackets, 35 mm. Allow 9 cm for finials.", true],
  ["Your frame is 219.4 cm, so aim for 15 to 20 cm past it.", true],
  ["Cut 25 cm off each end.", false],          // invented length
  ["Cut 23 mm off each end.", false],          // right number, wrong unit
  ["The pole is 2.54 m long.", true],          // metres of a computed length
  ["Leave twenty centimetres each side.", false], // a length in words
  ["About 30 cm past the frame.", false],
];
let fails = 0;
for (const [r, ok] of cases) { let passed = true; try { checkNumbers(r, facts); } catch { passed = false; } if (passed !== ok) { fails++; console.log("WRONG:", r); } }
console.log(`reply checker: ${cases.length - fails}/${cases.length} cases right`); if (fails) process.exit(1);

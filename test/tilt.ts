// A crooked sheet (taped at 6 degrees) must not tilt or scale the answer.
import { jointFit, type Pt } from "../src/geometry.ts";
import { camera, rect, win, W, H, f } from "./scene.ts";
const proj = camera(W, H, f, 2600, 18, 6, [win.w / 2 - 250, win.h * 0.4, 0]);
const t = (6 * Math.PI) / 180, c = { x: -330, y: -150 };
const sheet: [number, number, number][] = [[0, 0], [210, 0], [210, 297], [0, 297]].map(([x, y]) => [c.x + Math.cos(t) * x - Math.sin(t) * y, c.y + Math.sin(t) * x + Math.cos(t) * y, 0]);
const r = jointFit(sheet.map(proj), rect(win).map(proj));
console.log(`width err ${(r.widthMm - win.w).toFixed(2)} mm, height err ${(r.heightMm - win.h).toFixed(2)} mm, sheet tilt ${r.sheetTiltDeg.toFixed(2)} deg (true 6)`);
if (Math.abs(r.widthMm - win.w) > 1) throw new Error("tilted sheet broke the width");

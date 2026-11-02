// jointFitEdges on exact synthetic edge samples, with and without the bottom side.
import { jointFitEdges, type Pt } from "../src/geometry.ts";
import { camera, rect, win, sheet, W, H, f } from "./scene.ts";
for (const [yaw, pitch] of [[0, 0], [15, 5], [25, -8]]) {
  const proj = camera(W, H, f, 2600, yaw, pitch, [win.w / 2 - 250, win.h * 0.4, 0]);
  const S = rect(sheet).map(proj), Wc = rect(win).map(proj);
  const side = (a: number[], b: number[]) => Array.from({ length: 40 }, (_, k) => { const t = 0.15 + 0.7 * k / 39; return proj([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0]); });
  const r4 = rect(win); const sides = [side(r4[0], r4[1]), side(r4[1], r4[2]), side(r4[2], r4[3]), side(r4[3], r4[0])];
  const rough = Wc.map((p) => ({ x: p.x + 3, y: p.y - 2 }));
  const full = jointFitEdges(S, sides, rough), noBottom = jointFitEdges(S, [sides[0], sides[1], [], sides[3]], rough);
  console.log(`yaw ${yaw} pitch ${pitch}: all sides err ${(full.widthMm - win.w).toFixed(2)} mm | no bottom err ${(noBottom.widthMm - win.w).toFixed(2)} mm`);
}

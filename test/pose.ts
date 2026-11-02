// Pose fit on exact synthetic data (scene camera f = 1450 at W = 1920; the default guess is 0.8 W = 1536).
import { jointFitPose, jointFitEdges } from "../src/geometry.ts";
import { camera, rect, win, sheet, W, H, f } from "./scene.ts";
for (const [yaw, pitch] of [[0, 0], [15, 5], [25, -8]]) {
  const proj = camera(W, H, f, 2600, yaw, pitch, [win.w / 2 - 250, win.h * 0.4, 0]);
  const S = rect(sheet).map(proj);
  const side = (a: number[], b: number[]) => Array.from({ length: 40 }, (_, k) => { const t = 0.15 + 0.7 * k / 39; return proj([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0]); });
  const r4 = rect(win); const sides = [side(r4[0], r4[1]), side(r4[1], r4[2]), side(r4[2], r4[3]), side(r4[3], r4[0])];
  const rough = rect(win).map(proj);
  // a 1.5% squat sheet (corners pulled in vertically by 1.5%) to mimic a real sheet that isn't perfectly measured
  const cy = (S[0].y + S[3].y) / 2; const Sq = S.map((p) => ({ x: p.x, y: cy + (p.y - cy) * 0.985 }));
  const pe = jointFitPose(S, sides, rough, W, H, f), pg = jointFitPose(S, sides, rough, W, H), he = jointFitEdges(Sq, sides, rough), ps = jointFitPose(Sq, sides, rough, W, H, f);
  console.log(`yaw ${yaw}: pose(true f) ${(pe.widthMm - win.w).toFixed(1)} | pose(guessed f) ${(pg.widthMm - win.w).toFixed(1)} | squat sheet: homography ${(he.widthMm - win.w).toFixed(1)} vs pose ${(ps.widthMm - win.w).toFixed(1)} mm`);
}

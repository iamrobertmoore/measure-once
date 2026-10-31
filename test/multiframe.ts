// Same scene, 30 frames of a hand-held clip (small pose jitter, independent mask noise), median of per-frame fits.
import { quadCorners, jointFit, summarise, type Pt } from "../src/geometry.ts";
import { camera, rasterQuad, rect, win, sheet, W, H, f, rng } from "./scene.ts";
for (const [dist, yaw, pitch, scale, noise] of [[2600, 15, 5, 0.5, 0.5], [3000, 25, 10, 0.5, 0.5], [2200, 10, 3, 0.5, 0.5], [2600, 20, -5, 1, 0.5]] as const) {
  const widths: number[] = [];
  for (let k = 0; k < 30; k++) {
    const proj = camera(W, H, f, dist + (rng() - 0.5) * 60, yaw + (rng() - 0.5) * 2, pitch + (rng() - 0.5) * 2, [win.w / 2 - 250, win.h * 0.4, 0]);
    const sImg = rect(sheet).map(proj), wImg = rect(win).map(proj);
    const w = Math.round(W * scale), h = Math.round(H * scale);
    const sQ = quadCorners(rasterQuad(sImg, W, H, scale, noise, rng), w, h).map((p: Pt) => ({ x: p.x / scale, y: p.y / scale }));
    const wQ = quadCorners(rasterQuad(wImg, W, H, scale, noise, rng), w, h).map((p: Pt) => ({ x: p.x / scale, y: p.y / scale }));
    widths.push(jointFit(sQ, wQ).widthMm - win.w);
  }
  const s = summarise(widths);
  console.log(`dist ${dist} yaw ${yaw} maskScale ${scale}: 30-frame median err ${s.median.toFixed(1)} mm, IQR ${s.iqr.toFixed(1)} mm, single-frame |err| p75 ${summarise(widths.map(Math.abs)).p75.toFixed(1)} mm`);
}

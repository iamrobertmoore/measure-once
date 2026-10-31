// Synthetic check of the wall-plane geometry: a pinhole camera looks at a wall with an A4 sheet and a
// window opening at known millimetre positions. Masks are rasterised (optionally at reduced resolution,
// with edge noise, like SAM's masks), then measured back. Prints the error in mm per scenario.
import { boundary, hull, quadFromHull, wallHomography, apply, orderCorners, quadCorners, jointFit, type Pt } from "../src/geometry.ts";
import { camera, rasterQuad, rect, win, sheet, W, H, f, rng, type V3 } from "./scene.ts";

function measure(mask: Uint8Array, w: number, h: number, scale: number, sub = false): Pt[] {
  const q = sub ? quadCorners(mask, w, h) : quadFromHull(hull(boundary(mask, w, h)));
  return orderCorners(q.map((p) => ({ x: p.x / scale, y: p.y / scale })));
}

const rows: string[] = [];
for (const [dist, yaw, pitch, scale, noise] of [
  [2600, 0, 0, 1, 0], [2600, 15, 5, 1, 0], [2600, 30, 8, 1, 0], [2600, 20, -5, 0.5, 0.3], [3000, 25, 10, 0.5, 0.5], [2600, 40, 10, 0.5, 0.5], [2200, 10, 3, 0.5, 0.5], [2800, 0, 0, 0.5, 0.5],
] as const) {
  const proj = camera(W, H, f, dist, yaw, pitch, [win.w / 2 - 250, win.h * 0.4, 0]);
  const sImg = rect(sheet).map(proj), wImg = rect(win).map(proj);
  const w = Math.round(W * scale), h = Math.round(H * scale);
  const off = [...sImg, ...wImg].some((p) => p.x < 2 || p.y < 2 || p.x > W - 2 || p.y > H - 2);
  if (off) { rows.push(`dist ${dist} yaw ${yaw} pitch ${pitch}: ABSTAIN (sheet or window leaves the frame)`); continue; }
  const sMask = rasterQuad(sImg, W, H, scale, noise, rng), wMask = rasterQuad(wImg, W, H, scale, noise, rng);
  const sQ = measure(sMask, w, h, scale), wQ = measure(wMask, w, h, scale);
  const { H: Hm } = wallHomography(sQ);
  const wall = wQ.map((p) => apply(Hm, p)); // tl, tr, br, bl in mm
  const width = ((wall[1].x - wall[0].x) + (wall[2].x - wall[3].x)) / 2;
  const height = ((wall[3].y - wall[0].y) + (wall[2].y - wall[1].y)) / 2;
  const sQ2 = measure(sMask, w, h, scale, true), wQ2 = measure(wMask, w, h, scale, true);
  const { H: H2 } = wallHomography(sQ2); const w2 = wQ2.map((p) => apply(H2, p));
  const width2 = ((w2[1].x - w2[0].x) + (w2[2].x - w2[3].x)) / 2;
  const jf = jointFit(sQ2, wQ2);
  rows.push(`   subpixel sheet-only: width err ${(width2 - win.w).toFixed(1)} mm | joint: width err ${(jf.widthMm - win.w).toFixed(1)} mm, height err ${(jf.heightMm - win.h).toFixed(1)} mm, rms ${jf.rmsPx.toFixed(2)} px`);
  rows.push(`dist ${dist} yaw ${yaw} pitch ${pitch} maskScale ${scale} noise ${noise}: width ${width.toFixed(1)} (err ${(width - win.w).toFixed(1)} mm), height ${height.toFixed(1)} (err ${(height - win.h).toFixed(1)} mm)`);
}
console.log(rows.join("\n"));

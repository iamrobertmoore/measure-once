// Rendered-image check: anti-aliased, blurred, noisy frames; deliberately biased low-res masks (as SAM's may be).
// Pipeline: mask -> rough corners -> snap sides to image edges -> joint fit. Errors in mm, per scenario.
import { quadCorners, snapToImageEdges, jointFit, summarise, type Pt } from "../src/geometry.ts";
import { camera, rect, win, sheet, W, H, f, rng } from "./scene.ts";

function inQuad(s: Pt[], x: number, y: number) {
  let sign = 0;
  for (let i = 0; i < 4; i++) { const a = s[i], b = s[(i + 1) % 4]; const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x); if (c !== 0) { const g = Math.sign(c); if (sign && g !== sign) return false; sign = g; } }
  return true;
}
function render(sImg: Pt[], wImg: Pt[]): Float32Array {
  const img = new Float32Array(W * H).fill(0.6);
  const paint = (q: Pt[], v: number) => {
    const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
    for (let y = Math.max(0, Math.floor(Math.min(...ys)) - 1); y < Math.min(H, Math.ceil(Math.max(...ys)) + 1); y++)
      for (let x = Math.max(0, Math.floor(Math.min(...xs)) - 1); x < Math.min(W, Math.ceil(Math.max(...xs)) + 1); x++) {
        let c = 0; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (inQuad(q, x + (i + 0.5) / 4, y + (j + 0.5) / 4)) c++;
        if (c) img[y * W + x] = img[y * W + x] * (1 - c / 16) + v * (c / 16);
      }
  };
  paint(wImg, 0.25); paint(sImg, 0.95);
  // separable box-ish blur (3 taps, twice ~ gaussian sigma ~0.8) + noise
  const tmp = new Float32Array(W * H);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) tmp[y * W + x] = (img[y * W + x - 1] + 2 * img[y * W + x] + img[y * W + x + 1]) / 4;
    for (let y = 1; y < H - 1; y++) for (let x = 0; x < W; x++) img[y * W + x] = (tmp[(y - 1) * W + x] + 2 * tmp[y * W + x] + tmp[(y + 1) * W + x]) / 4;
  }
  for (let i = 0; i < img.length; i++) img[i] += (rng() + rng() + rng() - 1.5) * 0.03;
  return img;
}
function biasedMask(q: Pt[], scale: number, dilatePx: number): Uint8Array {
  const w = Math.round(W * scale), h = Math.round(H * scale), m = new Uint8Array(w * h);
  const c = { x: q.reduce((s, p) => s + p.x, 0) / 4, y: q.reduce((s, p) => s + p.y, 0) / 4 };
  const grown = q.map((p) => { const dx = p.x - c.x, dy = p.y - c.y, L = Math.hypot(dx, dy); return { x: (p.x + (dx / L) * dilatePx) * scale, y: (p.y + (dy / L) * dilatePx) * scale }; });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inQuad(grown, x + 0.5 + (rng() - 0.5) * 0.8, y + 0.5 + (rng() - 0.5) * 0.8)) m[y * w + x] = 1;
  return m;
}

for (const [dist, yaw, pitch, dil] of [[2600, 15, 5, 2], [3000, 25, 10, -2], [2200, 10, 3, 3], [2600, 20, -5, 0]] as const) {
  const raw: number[] = [], snapped: number[] = [];
  for (let k = 0; k < 8; k++) {
    const proj = camera(W, H, f, dist + (rng() - 0.5) * 60, yaw + (rng() - 0.5) * 2, pitch + (rng() - 0.5) * 2, [win.w / 2 - 250, win.h * 0.4, 0]);
    const sImg = rect(sheet).map(proj), wImg = rect(win).map(proj);
    const img = render(sImg, wImg);
    const scale = 0.5, w = W * scale, h = H * scale;
    const up = (p: Pt) => ({ x: p.x / scale, y: p.y / scale });
    const sR = quadCorners(biasedMask(sImg, scale, dil), w, h).map(up), wR = quadCorners(biasedMask(wImg, scale, dil), w, h).map(up);
    raw.push(jointFit(sR, wR).widthMm - win.w);
    snapped.push(jointFit(snapToImageEdges(sR, img, W, H, 6), snapToImageEdges(wR, img, W, H, 6)).widthMm - win.w);
  }
  const r = summarise(raw), s = summarise(snapped);
  console.log(`dist ${dist} yaw ${yaw} mask bias ${dil}px: mask-only median err ${r.median.toFixed(1)} mm | snapped to image edges median err ${s.median.toFixed(1)} mm (IQR ${s.iqr.toFixed(1)})`);
}

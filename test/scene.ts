import { boundary, type Pt } from "../src/geometry.ts";
export type V3 = [number, number, number];
export const rot = (yawDeg: number, pitchDeg: number) => {
  const a = (yawDeg * Math.PI) / 180, b = (pitchDeg * Math.PI) / 180;
  const Ry = [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  const Rx = [[1, 0, 0], [0, Math.cos(b), -Math.sin(b)], [0, Math.sin(b), Math.cos(b)]];
  const m = (A: number[][], B: number[][]) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
  return m(Rx, Ry);
};

export function camera(W: number, H: number, f: number, dist: number, yaw: number, pitch: number, target: V3) {
  const R = rot(yaw, pitch);
  // Camera centre: back off from target along the rotated optical axis.
  const z: V3 = [R[2][0], R[2][1], R[2][2]];
  const C: V3 = [target[0] - z[0] * dist, target[1] - z[1] * dist, target[2] - z[2] * dist];
  return (P: V3): Pt => {
    const d = [P[0] - C[0], P[1] - C[1], P[2] - C[2]];
    const x = R[0][0] * d[0] + R[0][1] * d[1] + R[0][2] * d[2];
    const y = R[1][0] * d[0] + R[1][1] * d[1] + R[1][2] * d[2];
    const zz = R[2][0] * d[0] + R[2][1] * d[1] + R[2][2] * d[2];
    return { x: W / 2 + (f * x) / zz, y: H / 2 + (f * y) / zz };
  };
}

export function rasterQuad(q: Pt[], W: number, H: number, scale: number, noise: number, rng: () => number): Uint8Array {
  const w = Math.round(W * scale), h = Math.round(H * scale);
  const m = new Uint8Array(w * h);
  const s = q.map((p) => ({ x: p.x * scale, y: p.y * scale }));
  const inside = (x: number, y: number) => {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = s[i], b = s[(i + 1) % 4];
      const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      if (c !== 0) { const sg = Math.sign(c); if (sign && sg !== sign) return false; sign = sg; }
    }
    return true;
  };
  const xs = s.map((p) => p.x), ys = s.map((p) => p.y);
  for (let y = Math.max(0, Math.floor(Math.min(...ys)) - 2); y < Math.min(h, Math.ceil(Math.max(...ys)) + 2); y++)
    for (let x = Math.max(0, Math.floor(Math.min(...xs)) - 2); x < Math.min(w, Math.ceil(Math.max(...xs)) + 2); x++)
      if (inside(x + 0.5, y + 0.5)) m[y * w + x] = 1;
  if (noise > 0) { // flip boundary pixels at random: ragged mask edges
    const b = boundary(m, w, h);
    for (const p of b) if (rng() < noise) { const xi = Math.min(w - 1, p.x), yi = Math.min(h - 1, p.y); m[yi * w + xi] ^= 1; }
  }
  return m;
}

export let seed = 7;
export const rng = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

export const W = 1920, H = 1080, f = 1450; // ~26 mm-equivalent phone main camera, landscape 1080p
// Wall plane z = 0, x right, y down, mm. Window reveal 1780 x 1200; A4 portrait 120 mm left of the reveal.
export const win = { x0: 0, y0: 0, w: 1780, h: 1200 };
export const sheet = { x0: -120 - 210, y0: -150, w: 210, h: 297 };
export const rect = (r: { x0: number; y0: number; w: number; h: number }): V3[] =>
  [[r.x0, r.y0, 0], [r.x0 + r.w, r.y0, 0], [r.x0 + r.w, r.y0 + r.h, 0], [r.x0, r.y0 + r.h, 0]];


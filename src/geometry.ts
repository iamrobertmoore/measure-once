// Wall-plane geometry: every millimetre comes from here, never from a model.
// The A4 sheet (210 x 297 mm) taped flat on the wall sets the scale via a homography.

export type Pt = { x: number; y: number };
export type Mat3 = number[]; // row-major 3x3

export const A4 = { w: 210, h: 297 };

/** Solve an n x n linear system with partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error("singular system");
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Homography mapping src[i] -> dst[i] for four point pairs (h33 = 1). */
export function homography(src: Pt[], dst: Pt[]): Mat3 {
  if (src.length !== 4 || dst.length !== 4) throw new Error("need 4 point pairs");
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solve(A, b), 1];
}

export function apply(H: Mat3, p: Pt): Pt {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

export function invert(H: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) throw new Error("singular homography");
  const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d];
  return inv.map((v) => v / det);
}

/** Convex hull (monotone chain) of mask pixel boundary points. */
export function hull(pts: Pt[]): Pt[] {
  const s = [...pts].sort((p, q) => p.x - q.x || p.y - q.y);
  if (s.length < 3) return s;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const p of s) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of s.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

/** Pixel-boundary points of a binary mask (row-major, 1 = inside). Uses pixel corners so the hull is unbiased. */
export function boundary(mask: Uint8Array, W: number, H: number): Pt[] {
  const out: Pt[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y * W + x]) continue;
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 ||
      !mask[y * W + x - 1] || !mask[y * W + x + 1] || !mask[(y - 1) * W + x] || !mask[(y + 1) * W + x];
    if (edge) out.push({ x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 });
  }
  return out;
}

function area(q: Pt[]): number {
  let s = 0;
  for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}

/** Largest-area quadrilateral inscribed in the hull: the sheet's four corners. */
export function quadFromHull(h: Pt[]): Pt[] {
  const n = h.length;
  if (n < 4) throw new Error("hull too small for a quadrilateral");
  // Decimate long hulls for speed, keep extremes.
  const step = Math.max(1, Math.floor(n / 60));
  const c = h.filter((_, i) => i % step === 0);
  let best: Pt[] = [], bestA = -1;
  const m = c.length;
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) for (let k = j + 1; k < m; k++) for (let l = k + 1; l < m; l++) {
    const q = [c[i], c[j], c[k], c[l]];
    const a = area(q);
    if (a > bestA) { bestA = a; best = q; }
  }
  // Refine each corner against the full hull (local search).
  for (let it = 0; it < 3; it++) for (let v = 0; v < 4; v++) {
    for (const p of h) { const q = [...best]; q[v] = p; const a = area(q); if (a > bestA) { bestA = a; best = q; } }
  }
  return best;
}

type Line = { a: number; b: number; c: number }; // a x + b y + c = 0, (a,b) unit normal

function fitLine(pts: Pt[]): Line {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  // Normal = eigenvector of the smaller eigenvalue of the scatter matrix.
  const t = 0.5 * Math.atan2(2 * sxy, sxx - syy); // direction of the line
  const a = -Math.sin(t), b = Math.cos(t);
  return { a, b, c: -(a * mx + b * my) };
}

function intersect(l: Line, m: Line): Pt {
  const det = l.a * m.b - m.a * l.b;
  if (Math.abs(det) < 1e-12) throw new Error("parallel edges");
  return { x: (l.b * m.c - m.b * l.c) / det, y: (m.a * l.c - l.a * m.c) / det };
}

/**
 * Sub-pixel corners: assign boundary points to the nearest side of the rough quad (ignoring the 15% of each side
 * nearest a corner, where masks round off), fit a line per side by total least squares, intersect neighbours.
 * Boundary points are pixel centres offset half a pixel outward is not assumed; we use pixel-edge midpoints.
 */
export function refineCorners(rough: Pt[], edgePts: Pt[]): Pt[] {
  const q = orderCorners(rough);
  const sides: Pt[][] = [[], [], [], []];
  for (const p of edgePts) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4];
      const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy;
      const t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2;
      if (t < 0.15 || t > 0.85) continue;
      const d = Math.abs((p.x - a.x) * vy - (p.y - a.y) * vx) / Math.sqrt(L2);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0 && bd < 6) sides[best].push(p);
  }
  if (sides.some((s) => s.length < 4)) return q;
  const lines = sides.map(fitLine);
  return [0, 1, 2, 3].map((i) => intersect(lines[(i + 3) % 4], lines[i]));
}

/** Edge midpoints between inside and outside pixels: an unbiased sample of the true boundary. */
export function edgeMidpoints(mask: Uint8Array, W: number, H: number): Pt[] {
  const out: Pt[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = mask[y * W + x];
    if (x + 1 < W && mask[y * W + x + 1] !== v) out.push({ x: x + 1, y: y + 0.5 });
    if (y + 1 < H && mask[(y + 1) * W + x] !== v) out.push({ x: x + 0.5, y: y + 1 });
  }
  return out;
}

/** Corners of a quadrilateral mask (sheet or window), sub-pixel, ordered TL TR BR BL, in mask pixel coords. */
export function quadCorners(mask: Uint8Array, W: number, H: number): Pt[] {
  const rough = quadFromHull(hull(boundary(mask, W, H)));
  return refineCorners(rough, edgeMidpoints(mask, W, H));
}

/**
 * Snap a quad's sides to the strongest intensity edge in the actual image.
 * The mask finds the object; the pixels measure it. For each side, sample short profiles perpendicular to the
 * side, find the sub-pixel peak of the gradient magnitude (parabola through the max), refit the side line,
 * intersect neighbours. `gray` is row-major luminance, W x H, in the same pixel frame as `quad`.
 */
export function snapToImageEdges(quad: Pt[], gray: Float32Array, W: number, H: number, reach = 4, samples = 40): Pt[] {
  const q = orderCorners(quad);
  const at = (x: number, y: number) => { // bilinear
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) return NaN;
    const i = y0 * W + x0;
    return gray[i] * (1 - fx) * (1 - fy) + gray[i + 1] * fx * (1 - fy) + gray[i + W] * (1 - fx) * fy + gray[i + W + 1] * fx * fy;
  };
  const lines: Line[] = [];
  for (let s = 0; s < 4; s++) {
    const a = q[s], b = q[(s + 1) % 4];
    const L = Math.hypot(b.x - a.x, b.y - a.y), tx = (b.x - a.x) / L, ty = (b.y - a.y) / L, nx = -ty, ny = tx;
    const pts: Pt[] = [];
    for (let k = 0; k < samples; k++) {
      const t = 0.15 + (0.7 * k) / (samples - 1);
      const cx = a.x + (b.x - a.x) * t, cy = a.y + (b.y - a.y) * t;
      const step = 0.25, prof: number[] = [];
      for (let o = -reach; o <= reach + 1e-9; o += step) prof.push(at(cx + nx * o, cy + ny * o));
      if (prof.some(Number.isNaN)) continue;
      const g = prof.slice(1).map((v, i) => Math.abs(v - prof[i]));
      let m = 0; g.forEach((v, i) => { if (v > g[m]) m = i; });
      if (m === 0 || m === g.length - 1 || g[m] < 1e-3) continue;
      const den = g[m - 1] - 2 * g[m] + g[m + 1];
      const sub = den !== 0 ? (0.5 * (g[m - 1] - g[m + 1])) / den : 0;
      const o = -reach + (m + 0.5 + sub) * step;
      pts.push({ x: cx + nx * o, y: cy + ny * o });
    }
    if (pts.length < 6) return q;
    lines.push(fitLine(pts));
  }
  return [0, 1, 2, 3].map((i) => intersect(lines[(i + 3) % 4], lines[i]));
}

/** Order four corners as top-left, top-right, bottom-right, bottom-left (image coords). */
export function orderCorners(q: Pt[]): Pt[] {
  const cx = q.reduce((s, p) => s + p.x, 0) / 4, cy = q.reduce((s, p) => s + p.y, 0) / 4;
  const byAng = [...q].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // atan2 order from -pi: starts near top-left going clockwise in image coords (y down).
  let tl = 0, best = Infinity;
  byAng.forEach((p, i) => { const s = p.x + p.y; if (s < best) { best = s; tl = i; } });
  return [0, 1, 2, 3].map((k) => byAng[(tl + k) % 4]);
}

/**
 * Image -> wall-plane (mm) homography from the sheet's corners.
 * Portrait or landscape is decided by the sheet's image aspect.
 */
export function wallHomography(corners: Pt[]): { H: Mat3; portrait: boolean } {
  const [tl, tr, br, bl] = orderCorners(corners);
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const wImg = (d(tl, tr) + d(bl, br)) / 2, hImg = (d(tl, bl) + d(tr, br)) / 2;
  const portrait = hImg >= wImg;
  const W = portrait ? A4.w : A4.h, Hh = portrait ? A4.h : A4.w;
  const H = homography([tl, tr, br, bl], [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: Hh }, { x: 0, y: Hh }]);
  return { H, portrait };
}

/**
 * Joint fit: the sheet fixes scale, the (much larger) window rectangle pins perspective.
 * Unknowns: G = wall(mm) -> image homography (8) and the window rectangle on the wall (x0, y0, w, h).
 * Residuals in image pixels for the 4 sheet corners (known mm) and the 4 window corners (rectangle).
 * Levenberg-Marquardt with a numeric Jacobian. Returns the window size in mm and the final RMS in px.
 */
export function jointFit(sheetImg: Pt[], winImg: Pt[], portrait = true) {
  const sW = portrait ? A4.w : A4.h, sH = portrait ? A4.h : A4.w;
  const sheetWall: Pt[] = [{ x: 0, y: 0 }, { x: sW, y: 0 }, { x: sW, y: sH }, { x: 0, y: sH }];
  const S = orderCorners(sheetImg), Wn = orderCorners(winImg);
  const H0 = homography(S, sheetWall); // image -> wall
  const G0 = invert(H0).map((v, _i, a) => v / a[8]);
  const wc = Wn.map((p) => apply(H0, p));
  const r0 = [(wc[0].x + wc[3].x) / 2, (wc[0].y + wc[1].y) / 2, (wc[1].x + wc[2].x) / 2 - (wc[0].x + wc[3].x) / 2, (wc[2].y + wc[3].y) / 2 - (wc[0].y + wc[1].y) / 2];
  let p = [...G0.slice(0, 8), ...r0];
  const resid = (q: number[]) => {
    const G = [...q.slice(0, 8), 1];
    const [x0, y0, w, h] = q.slice(8);
    const rect: Pt[] = [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + h }, { x: x0, y: y0 + h }];
    const r: number[] = [];
    sheetWall.forEach((P, i) => { const u = apply(G, P); r.push(u.x - S[i].x, u.y - S[i].y); });
    rect.forEach((P, i) => { const u = apply(G, P); r.push(u.x - Wn[i].x, u.y - Wn[i].y); });
    return r;
  };
  const sq = (r: number[]) => r.reduce((s, v) => s + v * v, 0);
  let lambda = 1e-3, cur = resid(p), cost = sq(cur);
  for (let it = 0; it < 200; it++) {
    const n = p.length, m = cur.length;
    const J: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const h = Math.max(1e-8, Math.abs(p[j]) * 1e-6);
      const q = [...p]; q[j] += h;
      const rj = resid(q);
      for (let i = 0; i < m; i++) J[i][j] = (rj[i] - cur[i]) / h;
    }
    const JtJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0)));
    const Jtr = Array.from({ length: n }, (_, a) => J.reduce((s, row, i) => s + row[a] * cur[i], 0));
    let improved = false;
    for (let tries = 0; tries < 10 && !improved; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
      let d: number[];
      try { d = solve(A, Jtr.map((v) => -v)); } catch { lambda *= 10; continue; }
      const q = p.map((v, i) => v + d[i]);
      const rq = resid(q), cq = sq(rq);
      if (cq < cost) { p = q; cur = rq; const rel = (cost - cq) / Math.max(cost, 1e-12); cost = cq; lambda = Math.max(lambda / 10, 1e-12); improved = true; if (rel < 1e-12) it = 1e9; }
      else lambda *= 10;
    }
    if (!improved) break;
  }
  const [, , w, h] = p.slice(8);
  return { widthMm: Math.abs(w), heightMm: Math.abs(h), rmsPx: Math.sqrt(cost / cur.length), G: [...p.slice(0, 8), 1] as Mat3 };
}

/** Horizontal wall distance in mm between two image points. */
export function wallDistance(H: Mat3, a: Pt, b: Pt): number {
  const p = apply(H, a), q = apply(H, b);
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Robust summary for per-frame measurements: median and spread (IQR) in mm. */
export function summarise(v: number[]) {
  const s = [...v].sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  return { n: s.length, median: q(0.5), p25: q(0.25), p75: q(0.75), iqr: q(0.75) - q(0.25) };
}

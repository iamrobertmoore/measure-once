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

export function fitLine(pts: Pt[]): Line {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  // Normal = eigenvector of the smaller eigenvalue of the scatter matrix.
  const t = 0.5 * Math.atan2(2 * sxy, sxx - syy); // direction of the line
  const a = -Math.sin(t), b = Math.cos(t);
  return { a, b, c: -(a * mx + b * my) };
}

export function intersect(l: Line, m: Line): Pt {
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
export function edgeSamples(quad: Pt[], gray: Float32Array, W: number, H: number, reach = 4, samples = 40, minContrast = 0.25, polarity: 0 | 1 = 0, rule: "mid" | "outer" = "mid"): Pt[][] {
  // For each side, sample short profiles across it. The side's normal points INTO the quad (clockwise order, y down).
  // Edge position = where intensity crosses halfway between the outside level and the inside level (a step edge's
  // true position, unbiased by blur), searching outward from the mask's edge so a nearby second edge isn't taken.
  const q = orderCorners(quad);
  const at = (x: number, y: number) => { // bilinear
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) return NaN;
    const i = y0 * W + x0;
    return gray[i] * (1 - fx) * (1 - fy) + gray[i + 1] * fx * (1 - fy) + gray[i + W] * (1 - fx) * fy + gray[i + W + 1] * fx * fy;
  };
  const out: Pt[][] = [];
  const band = 4; // px of plain surface sampled for each level
  for (let s = 0; s < 4; s++) {
    const a = q[s], b = q[(s + 1) % 4];
    const L = Math.hypot(b.x - a.x, b.y - a.y), tx = (b.x - a.x) / L, ty = (b.y - a.y) / L, nx = -ty, ny = tx;
    const pts: Pt[] = [];
    for (let k = 0; k < samples; k++) {
      const t = 0.15 + (0.7 * k) / (samples - 1);
      const cx = a.x + (b.x - a.x) * t, cy = a.y + (b.y - a.y) * t;
      const step = 0.25, os: number[] = [], prof: number[] = [];
      for (let o = -reach - band; o <= reach + band + 1e-9; o += step) { os.push(o); prof.push(at(cx + nx * o, cy + ny * o)); }
      if (prof.some(Number.isNaN)) continue;
      const mean = (lo: number, hi: number) => { let s2 = 0, n = 0; os.forEach((o, i) => { if (o >= lo && o <= hi) { s2 += prof[i]; n++; } }); return s2 / n; };
      const outside = mean(-reach - band, -reach), inside = mean(reach, reach + band);
      const contrast = inside - outside;
      if (Math.abs(contrast) < minContrast) continue;
      // On a contrast map the object is the high side by construction. A profile where the outside is higher is
      // looking at something else nearby (a picture frame, its shadow), so its crossing isn't this object's edge.
      if (polarity === 1 && contrast < minContrast) continue;
      if (rule === "outer") {
        // Moulded trim: wall, then a shaded bevel, then the face. A tape goes to the outside of the bevel, so the edge
        // is where the profile first leaves the wall's level, scanning in from the wall (not the halfway point between
        // wall and face, which lands on the bevel's inner side).
        const wallVals = prof.filter((_, i) => os[i] <= -reach);
        const sd = Math.sqrt(wallVals.reduce((t, v) => t + (v - outside) ** 2, 0) / wallVals.length);
        const T = Math.max(4 * sd, 0.3 * Math.abs(contrast));
        let hit: number | null = null;
        for (let i = 1; i < os.length; i++) {
          if (os[i] <= -reach) continue;
          if (os[i] > reach) break;
          const d0 = Math.abs(prof[i - 1] - outside), d1 = Math.abs(prof[i] - outside);
          if (d1 >= T) { hit = d0 >= T ? os[i] : os[i - 1] + ((T - d0) / (d1 - d0)) * (os[i] - os[i - 1]); break; }
        }
        if (hit !== null) pts.push({ x: cx + nx * hit, y: cy + ny * hit });
        continue;
      }
      const mid = (inside + outside) / 2;
      // crossings of the mid level within [-reach, reach]; take the one nearest the mask edge (o = 0)
      let best: number | null = null;
      for (let i = 1; i < os.length; i++) {
        if (os[i] < -reach || os[i - 1] > reach) continue;
        const d0 = prof[i - 1] - mid, d1 = prof[i] - mid;
        if (d0 === 0 || d0 * d1 < 0) {
          const o = os[i - 1] + (d0 / (d0 - d1)) * (os[i] - os[i - 1]);
          if (best === null || Math.abs(o) < Math.abs(best)) best = o;
        }
      }
      if (best === null) continue;
      pts.push({ x: cx + nx * best, y: cy + ny * best });
    }
    out.push(trimToLine(pts));
  }
  return out;
}

/** Fit a line, drop points more than `tol` px off it (clutter, shadows), refit. */
export function trimToLine(pts: Pt[], tol = 1.5): Pt[] {
  if (pts.length < 6) return pts;
  // Consensus first: when samples split into two parallel runs (part of a side caught a neighbouring edge), a plain
  // fit lands between them. Take the line that the most samples agree with to within tol, then refine.
  let bestSet = pts, bestN = -1;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const a = pts[i], b = pts[j], L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 8) continue;
    const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
    const set = pts.filter((p) => Math.abs((p.x - a.x) * nx + (p.y - a.y) * ny) <= tol);
    if (set.length > bestN) { bestN = set.length; bestSet = set; }
  }
  let keep = bestSet.length >= 6 ? bestSet : pts;
  for (let it = 0; it < 2; it++) {
    const l = fitLine(keep);
    const d = keep.map((p) => Math.abs(l.a * p.x + l.b * p.y + l.c));
    const sorted = [...d].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
    const next = keep.filter((_, i) => d[i] <= Math.max(tol, 3 * med));
    if (next.length < 6 || next.length === keep.length) break;
    keep = next;
  }
  return keep;
}

export function snapToImageEdges(quad: Pt[], gray: Float32Array, W: number, H: number, reach = 4, samples = 40, polarity: 0 | 1 = 0): Pt[] {
  // Two passes: the second starts from the first pass's corners, so samples near a corner the mask got wrong are
  // within reach of the true edge.
  let q = orderCorners(quad);
  for (let pass = 0; pass < 2; pass++) {
    const sides = edgeSamples(q, gray, W, H, reach, samples, 0.25, polarity);
    if (sides.some((p) => p.length < 6)) return q;
    const lines = sides.map((pts, s) => {
      // A short run of samples pins a side's position but not its angle; then keep the current side's direction and
      // fit only the offset.
      const a = q[s], b = q[(s + 1) % 4], L = Math.hypot(b.x - a.x, b.y - a.y), tx = (b.x - a.x) / L, ty = (b.y - a.y) / L;
      const along = pts.map((p) => (p.x - a.x) * tx + (p.y - a.y) * ty);
      if (Math.max(...along) - Math.min(...along) >= 0.5 * L) return fitLine(pts);
      const nx = -ty, ny = tx, offs = pts.map((p) => (p.x - a.x) * nx + (p.y - a.y) * ny).sort((u, v) => u - v);
      const off = offs[Math.floor(offs.length / 2)];
      return { a: nx, b: ny, c: -(nx * (a.x + nx * off) + ny * (a.y + ny * off)) };
    });
    q = [0, 1, 2, 3].map((i) => intersect(lines[(i + 3) % 4], lines[i]));
  }
  return q;
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
  // Wall frame is aligned to the WINDOW (its top edge is horizontal), so a crooked sheet doesn't tilt the answer.
  // The sheet sits at the origin, rotated by theta; theta is solved along with everything else.
  const sW = portrait ? A4.w : A4.h, sH = portrait ? A4.h : A4.w;
  const sheetWall: Pt[] = [{ x: 0, y: 0 }, { x: sW, y: 0 }, { x: sW, y: sH }, { x: 0, y: sH }];
  const S = orderCorners(sheetImg), Wn = orderCorners(winImg);
  const H0 = homography(S, sheetWall); // image -> sheet frame
  const wc0 = Wn.map((p) => apply(H0, p));
  const alpha = Math.atan2(wc0[1].y - wc0[0].y, wc0[1].x - wc0[0].x); // window top edge angle in the sheet frame
  const th0 = -alpha;
  const rot = (t: number, P: Pt): Pt => ({ x: Math.cos(t) * P.x - Math.sin(t) * P.y, y: Math.sin(t) * P.x + Math.cos(t) * P.y });
  // G0: wall(window-aligned) -> image = (image <- sheet frame) o R(-th0)
  const Gs = invert(H0);
  const c = Math.cos(-th0), s_ = Math.sin(-th0);
  const R = [c, -s_, 0, s_, c, 0, 0, 0, 1];
  const mul = (A: number[], B: number[]) => [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]));
  const G0 = mul(Gs, R).map((v, _i, a) => v / a[8]);
  const wc = wc0.map((P) => rot(th0, P));
  const r0 = [(wc[0].x + wc[3].x) / 2, (wc[0].y + wc[1].y) / 2, (wc[1].x + wc[2].x) / 2 - (wc[0].x + wc[3].x) / 2, (wc[2].y + wc[3].y) / 2 - (wc[0].y + wc[1].y) / 2];
  let p = [...G0.slice(0, 8), ...r0, th0];
  const resid = (q: number[]) => {
    const G = [...q.slice(0, 8), 1];
    const [x0, y0, w, h, th] = q.slice(8);
    const rect: Pt[] = [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + h }, { x: x0, y: y0 + h }];
    const r: number[] = [];
    sheetWall.forEach((P, i) => { const u = apply(G, rot(th, P)); r.push(u.x - S[i].x, u.y - S[i].y); });
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
  const [x0, y0, w, h, th] = p.slice(8);
  return { widthMm: Math.abs(w), heightMm: Math.abs(h), rmsPx: Math.sqrt(cost / cur.length), G: [...p.slice(0, 8), 1] as Mat3, window: { x0, y0, w, h }, sheetTiltDeg: (th * 180) / Math.PI };
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

/**
 * Joint fit from edge samples. The sheet gives four corners (known A4 shape, any tilt); the window gives whichever
 * of its sides are visible as point samples [top, right, bottom, left] (an empty array = side not visible,
 * e.g. hidden by a sill or out of shot). Window-aligned wall frame, as in jointFit. Residuals in image pixels:
 * sheet corners, and each window sample's distance to its projected rectangle side.
 */
export function jointFitEdges(sheetImg: Pt[], winSides: Pt[][], winRough: Pt[], portrait = true, perspSigma = Infinity) {
  const seed = jointFit(sheetImg, winRough, portrait); // initial G, rect and tilt from rough corners
  const sW = portrait ? A4.w : A4.h, sH = portrait ? A4.h : A4.w;
  const sheetWall: Pt[] = [{ x: 0, y: 0 }, { x: sW, y: 0 }, { x: sW, y: sH }, { x: 0, y: sH }];
  const S = orderCorners(sheetImg);
  const rot = (t: number, P: Pt): Pt => ({ x: Math.cos(t) * P.x - Math.sin(t) * P.y, y: Math.sin(t) * P.x + Math.cos(t) * P.y });
  const hasBottom = winSides[2]?.length >= 6, hasTop = winSides[0]?.length >= 6;
  const wts = winSides.map((s) => (s.length ? Math.sqrt(4 / s.length) : 0)); // each side weighs like ~4 residuals
  let p = [...seed.G.slice(0, 8), seed.window.x0, seed.window.y0, seed.window.w, seed.window.h, (seed.sheetTiltDeg * Math.PI) / 180];
  const resid = (q: number[]) => {
    const G = [...q.slice(0, 8), 1];
    const [x0, y0, w, h, th] = q.slice(8);
    const r: number[] = [];
    sheetWall.forEach((P, i) => { const u = apply(G, rot(th, P)); r.push(u.x - S[i].x, u.y - S[i].y); });
    const rect: Pt[] = [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + h }, { x: x0, y: y0 + h }].map((P) => apply(G, P));
    for (let s = 0; s < 4; s++) {
      if (!winSides[s]?.length || (s === 2 && !hasBottom) || (s === 0 && !hasTop)) continue;
      const a = rect[s], b = rect[(s + 1) % 4];
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      for (const P of winSides[s]) r.push((((P.x - a.x) * (b.y - a.y) - (P.y - a.y) * (b.x - a.x)) / L) * wts[s]);
    }
    // Weak prior toward a square-on view: G[6], G[7] are how fast depth changes across the wall (per mm). A phone
    // held by someone facing a window is rarely far off square, and from a small sheet plus the window's sides the
    // fit can't tell a slight turn from a slightly mis-snapped edge. One "pixel" of penalty per perspSigma of depth
    // change per metre; real perspective in the window's sides still wins when it's there.
    if (Number.isFinite(perspSigma)) r.push((q[6] * 1000) / perspSigma, (q[7] * 1000) / perspSigma);
    return r;
  };
  const sq = (r: number[]) => r.reduce((t, v) => t + v * v, 0);
  // When the bottom isn't visible, height is unconstrained: hold it fixed at the seed value.
  const free = p.map((_, i) => !((i === 11 && !hasBottom) || (i === 9 && !hasTop)));
  let lambda = 1e-3, cur = resid(p), cost = sq(cur);
  for (let it = 0; it < 200; it++) {
    const idx = free.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
    const n = idx.length, m = cur.length;
    const J: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
    idx.forEach((j, c) => { const h = Math.max(1e-8, Math.abs(p[j]) * 1e-6); const q = [...p]; q[j] += h; const rj = resid(q); for (let i = 0; i < m; i++) J[i][c] = (rj[i] - cur[i]) / h; });
    const JtJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0)));
    const Jtr = Array.from({ length: n }, (_, a) => J.reduce((s, row, i) => s + row[a] * cur[i], 0));
    let improved = false;
    for (let tries = 0; tries < 10 && !improved; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
      let d: number[];
      try { d = solve(A, Jtr.map((v) => -v)); } catch { lambda *= 10; continue; }
      const q = [...p]; idx.forEach((j, c) => { q[j] += d[c]; });
      const rq = resid(q), cq = sq(rq);
      if (cq < cost) { p = q; cur = rq; const rel = (cost - cq) / Math.max(cost, 1e-12); cost = cq; lambda = Math.max(lambda / 10, 1e-12); improved = true; if (rel < 1e-12) it = 1e9; }
      else lambda *= 10;
    }
    if (!improved) break;
  }
  const [x0, y0, w, h, th] = p.slice(8);
  return { widthMm: Math.abs(w), heightMm: hasBottom ? Math.abs(h) : null, rmsPx: (() => { const d = cur.slice(0, Number.isFinite(perspSigma) ? cur.length - 2 : cur.length); return Math.sqrt(d.reduce((t, v) => t + v * v, 0) / d.length); })(), G: [...p.slice(0, 8), 1] as Mat3, window: { x0, y0, w, h }, sheetTiltDeg: (th * 180) / Math.PI, sidesUsed: winSides.map((s, i) => ((i === 2 && !hasBottom) || (i === 0 && !hasTop) ? 0 : s.length)) };
}

// ---------------------------------------------------------------------------------------------------------------
// Pose model: a pinhole camera with a known focal length looking at a flat wall. Six pose numbers instead of the
// eight of a free homography, so a small sheet can't invent perspective: the big window sets the wall's angle,
// the sheet sets the scale. (Phone cameras are close to distortion-free after their own correction.)

function rodrigues(r: number[]): number[] {
  const th = Math.hypot(r[0], r[1], r[2]);
  if (th < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const k = r.map((v) => v / th), c = Math.cos(th), s = Math.sin(th), v = 1 - c;
  const [x, y, z] = k;
  return [c + x * x * v, x * y * v - z * s, x * z * v + y * s, y * x * v + z * s, c + y * y * v, y * z * v - x * s, z * x * v - y * s, z * y * v + x * s, c + z * z * v];
}

/** Default focal length for a phone's main camera in landscape video (about a 64 degree horizontal view). */
export const phoneFocal = (W: number) => 0.8 * W;

export function jointFitPose(sheetImg: Pt[], winSides: Pt[][], winRough: Pt[], W: number, H: number, f = phoneFocal(W), portrait = true) {
  const seed = jointFitEdges(sheetImg, winSides, winRough, portrait);
  const sW = portrait ? A4.w : A4.h, sH = portrait ? A4.h : A4.w;
  const sheetWall: Pt[] = [{ x: 0, y: 0 }, { x: sW, y: 0 }, { x: sW, y: sH }, { x: 0, y: sH }];
  const S = orderCorners(sheetImg);
  const cx = W / 2, cy = H / 2;
  const rot2 = (t: number, P: Pt): Pt => ({ x: Math.cos(t) * P.x - Math.sin(t) * P.y, y: Math.sin(t) * P.x + Math.cos(t) * P.y });
  const hasBottom = winSides[2]?.length >= 6;
  const wts = winSides.map((s) => (s.length ? Math.sqrt(4 / s.length) : 0));
  const project = (q: number[], P: Pt): Pt => {
    const R = rodrigues(q.slice(0, 3));
    const X = R[0] * P.x + R[1] * P.y + q[3], Y = R[3] * P.x + R[4] * P.y + q[4], Z = R[6] * P.x + R[7] * P.y + q[5];
    return { x: cx + (f * X) / Z, y: cy + (f * Y) / Z };
  };
  // Initial pose: facing the wall, at the distance the seed's scale implies, centred on the seed's wall point.
  const Hs = invert(seed.G);
  const c0 = apply(Hs, { x: cx, y: cy });
  const pxPerMm = Math.hypot(apply(seed.G, { x: c0.x + 100, y: c0.y }).x - cx, apply(seed.G, { x: c0.x + 100, y: c0.y }).y - cy) / 100;
  const Z0 = f / pxPerMm;
  let p = [0, 0, 0, -c0.x, -c0.y, Z0, seed.window.x0, seed.window.y0, seed.window.w, seed.window.h, (seed.sheetTiltDeg * Math.PI) / 180];
  const resid = (q: number[]) => {
    const [x0, y0, w, h, th] = q.slice(6);
    const r: number[] = [];
    sheetWall.forEach((P, i) => { const u = project(q, rot2(th, P)); r.push(u.x - S[i].x, u.y - S[i].y); });
    const rect = [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + h }, { x: x0, y: y0 + h }].map((P) => project(q, P));
    for (let s = 0; s < 4; s++) {
      if (!winSides[s]?.length || (s === 2 && !hasBottom)) continue;
      const a = rect[s], b = rect[(s + 1) % 4], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      for (const P of winSides[s]) r.push((((P.x - a.x) * (b.y - a.y) - (P.y - a.y) * (b.x - a.x)) / L) * wts[s]);
    }
    // Weak prior toward a square-on view: G[6], G[7] are how fast depth changes across the wall (per mm). A phone
    // held by someone facing a window is rarely far off square, and from a small sheet plus the window's sides the
    // fit can't tell a slight turn from a slightly mis-snapped edge. One "pixel" of penalty per perspSigma of depth
    // change per metre; real perspective in the window's sides still wins when it's there.
    if (Number.isFinite(perspSigma)) r.push((q[6] * 1000) / perspSigma, (q[7] * 1000) / perspSigma);
    return r;
  };
  const sq = (r: number[]) => r.reduce((t2, v) => t2 + v * v, 0);
  const free = p.map((_, i) => !(i === 9 && !hasBottom));
  let lambda = 1e-3, cur = resid(p), cost = sq(cur);
  for (let it = 0; it < 300; it++) {
    const idx = free.map((fr, i) => (fr ? i : -1)).filter((i) => i >= 0);
    const n = idx.length, m = cur.length;
    const J: number[][] = Array.from({ length: m }, () => new Array(n).fill(0));
    idx.forEach((j, c) => { const h = Math.max(1e-7, Math.abs(p[j]) * 1e-6); const q = [...p]; q[j] += h; const rj = resid(q); for (let i = 0; i < m; i++) J[i][c] = (rj[i] - cur[i]) / h; });
    const JtJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J.reduce((s, row) => s + row[a] * row[b], 0)));
    const Jtr = Array.from({ length: n }, (_, a) => J.reduce((s, row, i) => s + row[a] * cur[i], 0));
    let improved = false;
    for (let tries = 0; tries < 10 && !improved; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-9 : v)));
      let d: number[];
      try { d = solve(A, Jtr.map((v) => -v)); } catch { lambda *= 10; continue; }
      const q = [...p]; idx.forEach((j, c) => { q[j] += d[c]; });
      const rq = resid(q), cq = sq(rq);
      if (cq < cost) { p = q; cur = rq; const rel = (cost - cq) / Math.max(cost, 1e-12); cost = cq; lambda = Math.max(lambda / 10, 1e-12); improved = true; if (rel < 1e-12) it = 1e9; }
      else lambda *= 10;
    }
    if (!improved) break;
  }
  const [x0, y0, w, h, th] = p.slice(6);
  // Express the result as a homography too (wall mm -> image px), for drawing and for the hands.
  const R = rodrigues(p.slice(0, 3));
  const G = [f * R[0] + cx * R[6], f * R[1] + cx * R[7], f * p[3] + cx * p[5], f * R[3] + cy * R[6], f * R[4] + cy * R[7], f * p[4] + cy * p[5], R[6], R[7], p[5]];
  const Gn = G.map((v) => v / G[8]);
  // Sheet residual alone: how well a flat A4 explains the sheet corners under this pose (a curl or a non-A4 sheet shows here).
  let sr = 0; sheetWall.forEach((P, i) => { const u = project(p, rot2(th, P)); sr += (u.x - S[i].x) ** 2 + (u.y - S[i].y) ** 2; });
  const tiltDeg = (Math.acos(Math.min(1, Math.abs(R[8]))) * 180) / Math.PI; // angle between camera axis and wall normal
  return { widthMm: Math.abs(w), heightMm: hasBottom ? Math.abs(h) : null, rmsPx: Math.sqrt(cost / cur.length), sheetRmsPx: Math.sqrt(sr / 4), G: Gn as Mat3, window: { x0, y0, w, h }, sheetTiltDeg: (th * 180) / Math.PI, viewAngleDeg: tiltDeg, distanceMm: p[5], focalPx: f, sidesUsed: winSides.map((s, i) => (i === 2 && !hasBottom ? 0 : s.length)) };
}

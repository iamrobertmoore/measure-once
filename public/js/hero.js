// The hero: the photo, the A4 sheet, a tape measure that snaps to the frame,
// then the photo flattens into a front-on elevation drawing with the pole on it.
import { applyH, invertH, seg, lerp, easeOut, easeInOut, backOut, clamp01 } from "./geom.js";

const DEEP = [12, 30, 56];
const C = {
  deep: "#0c1e38",
  tape: "#ffc93c",
  tapeEdge: "#cf9a14",
  cut: "#ff6a4d", // cut red, light enough to read on the night blue
  tapeInk: "#2b2108",
  line: "#eaf0f7",
  ink: "#0a1424",
};
const FINIAL_MM = 90;
const POLE_ABOVE_MM = 100;
const MARGIN_MM = 300;
const A4 = { w: 210, h: 297, name: "A4" };
const LETTER = { w: 216, h: 279, name: "US Letter" };

// Seconds. The whole sequence lasts about five and a half seconds.
export const TL = {
  sheet: [0.15, 0.9],
  sheetLabel: [0.55, 0.9],
  win: [0.75, 1.15],
  tape: [1.05, 2.35],
  morph: [2.7, 3.9],
  tint: [2.8, 3.95],
  grid: [3.8, 4.3],
  tapeOut: [3.85, 4.25],
  frameDim: [3.9, 4.3],
  stock: [4.0, 4.3],
  pole: [4.1, 4.65],
  poleDim: [4.45, 4.8],
  cut: [4.6, 4.95],
  finials: [4.75, 5.1],
  overhang: [4.9, 5.25],
  pointed: [5.0, 5.35],
  title: [4.9, 5.4],
  end: 5.5,
};

// When Muse Spark picked which edges the pole spans, the drawing makes room for those lines before the tape runs.
const SPAN_IN = [1.05, 1.55];
const SPAN_PICK = [1.5, 1.85];
const SPAN_SHIFT = 0.9;
function timeline(withSpan) {
  if (!withSpan) return TL;
  const out = { ...TL, spanIn: SPAN_IN, spanPick: SPAN_PICK };
  for (const [k, v] of Object.entries(TL)) {
    if (k === "end") out.end = v + SPAN_SHIFT;
    else if (v[0] >= TL.tape[0]) out[k] = [v[0] + SPAN_SHIFT, v[1] + SPAN_SHIFT];
  }
  return out;
}

// Which sheet was it? Map SAM's sheet corners back onto the wall and look at the shape (A4 1.41, Letter 1.29).
function paperOf(f) {
  const base = { ...A4 };
  if (!f || !Array.isArray(f.G) || !Array.isArray(f.sheet) || f.sheet.length !== 4) return base;
  const inv = invertH(f.G);
  if (!inv) return base;
  const pts = f.sheet.map((p) => applyH(inv, p.x, p.y));
  if (pts.some((p) => !isFinite(p[0]) || !isFinite(p[1]))) return base;
  const w = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
  const h = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
  if (!(w > 50 && h > 50)) return base;
  const paper = Math.max(w, h) / Math.min(w, h) < 1.35 ? { ...LETTER } : { ...A4 };
  if (w > h) [paper.w, paper.h] = [paper.h, paper.w];
  return paper;
}

export function pickFrame(run) {
  const frames = run.frames || [];
  return (
    frames.find((f) => f.index === run.heroIndex) ||
    frames.find((f) => f.index === run.heroFrame) ||
    frames.find((f) => f.ok && f.G && f.wall) ||
    frames.find((f) => f.sheet || f.window) ||
    frames[0] ||
    null
  );
}

const fmt1 = (cm) => (Math.round(cm * 10) / 10).toFixed(1);
const fmtCm = (mm) => {
  const cm = mm / 10;
  return Math.abs(cm - Math.round(cm)) < 0.05 ? String(Math.round(cm)) : fmt1(cm);
};

export class Hero {
  constructor(canvas, { onCount, onEnd } = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.onCount = onCount || (() => {});
    this.onEnd = onEnd || (() => {});
    this.tl = TL;
    this.paper = { ...A4 };
    this.samView = false;
    this.mode = "poles"; // whose rules the drawing shows: my poles, or the example roller blind
    this.t = this.tl.end;
    this.raf = 0;
    this.token = 0;
    this.img = null;
    this.reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.size = { W: 0, H: 0 };
    let timer = 0;
    this.ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => this._onResize(), 140);
    });
    this.ro.observe(canvas.parentElement);
  }

  get playing() {
    return this.raf !== 0;
  }

  async load(run, imageUrl) {
    this.stop();
    const token = ++this.token;
    const img = new Image();
    img.decoding = "async";
    img.src = imageUrl;
    await img.decode();
    try {
      await Promise.all([
        document.fonts.load('700 20px "Mona Sans"'),
        document.fonts.load('500 20px "Mona Sans"'),
      ]);
    } catch {
      /* fonts are a nicety */
    }
    if (token !== this.token) return false;
    this.run = run;
    this.img = img;
    this.src = null;
    this.frame = pickFrame(run);
    const f = this.frame;
    this.geo = !!(
      run.ok && f && Array.isArray(f.G) && f.G.length === 9 && f.wall &&
      ((run.options || []).length || (run.blinds?.options || []).length)
    );
    this.paper = paperOf(f);
    const sp = run.span;
    this.span = this.geo && sp && Array.isArray(sp.edges) && sp.edges.length >= 2 && f.index === run.heroIndex ? sp : null;
    this.tl = timeline(!!this.span);
    this.samView = false;
    this._layout();
    return true;
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  // The blind to draw, when the drawing is showing the roller blind and the run has one.
  get blindOpt() {
    return this.mode === "blinds" ? this.run?.blinds?.options?.[0] || null : null;
  }

  // Switch between my pole and the example blind: jump to the finished drawing rather than replaying it.
  setMode(mode) {
    const next = mode === "blinds" ? "blinds" : "poles";
    const same = next === this.mode;
    this.mode = next;
    if (same || !this.img) return;
    this.stop();
    this.samView = false;
    this.t = this.tl.end;
    this.draw();
  }

  play() {
    this.stop();
    this.samView = false;
    if (!this.img) return;
    if (this.reduce.matches || !this.geo) {
      this.seek(this.tl.end);
      this.onEnd();
      return;
    }
    const start = performance.now();
    const step = (now) => {
      this.t = (now - start) / 1000;
      if (this.t >= this.tl.end) {
        this.t = this.tl.end;
        this.raf = 0;
        this.draw();
        this.onEnd();
        return;
      }
      this.draw();
      this.raf = requestAnimationFrame(step);
    };
    this.t = 0;
    this.draw();
    this.raf = requestAnimationFrame(step);
  }

  seek(t) {
    this.stop();
    this.t = Math.max(0, Math.min(this.tl.end, t));
    this.draw();
  }

  // "What SAM saw": the untouched photo with the outlines SAM 3.1 returned for this frame.
  showSam(on) {
    this.stop();
    this.samView = !!on;
    if (!on) this.t = this.tl.end;
    this.draw();
  }

  _onResize() {
    if (!this.img) return;
    const r = this.cv.getBoundingClientRect();
    if (Math.round(r.width) === this.size.W && Math.round(r.height) === this.size.H) return;
    this._layout();
    if (!this.playing) this.draw();
  }

  // ---------- layout: photo placement, elevation viewport, rectified textures ----------
  _layout() {
    const rect = this.cv.getBoundingClientRect();
    // Hidden (another pane is showing): nothing to lay out yet. The resize observer lays it out once it's shown.
    if (rect.width < 8 || rect.height < 8) {
      this.size = { W: 0, H: 0, dpr: 1 };
      return;
    }
    const W = Math.max(1, Math.round(rect.width));
    const H = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.size = { W, H, dpr };
    this.cv.width = Math.round(W * dpr);
    this.cv.height = Math.round(H * dpr);

    const iw = this.img.naturalWidth, ih = this.img.naturalHeight;
    const r = Math.min(W / iw, H / ih);
    this.ph = { r, x: (W - iw * r) / 2, y: (H - ih * r) / 2, iw, ih };
    this.s = Math.max(0.62, Math.min(1.3, W / 1100));
    this.compact = W < 620;
    if (!this.geo) return;

    const run = this.run, f = this.frame, wall = f.wall;
    // A live blind run still carries my pole sizes; if one ever doesn't, frame the drawing on the widest blind.
    const opt = run.options?.[0] || null;
    const blindW = Math.max(0, ...(run.blinds?.options || []).map((b) => b.widthMm || 0));
    const stockMm = opt ? opt.stockCm * 10 : Math.max(blindW, wall.w);
    const cutMm = opt && opt.cutToMm != null ? opt.cutToMm : stockMm;
    const heightKnown = run.heightMm != null && wall.h > 0;
    const sideMm = heightKnown ? wall.h : Math.min(wall.h > 0 ? wall.h : 900, 900);
    const cx = wall.x0 + wall.w / 2;
    const poleY = wall.y0 - POLE_ABOVE_MM;
    const halfW = Math.max(stockMm, cutMm, wall.w) / 2 + FINIAL_MM + MARGIN_MM;

    const s = this.s;
    const rowGap = this.compact ? 15 : 27 * s;
    const poleThGuess = 10 * s;
    const needTopPx = poleThGuess / 2 + rowGap * (opt?.cutPerEndMm > 0 ? 2 : 1) + (this.compact ? 16 : 24 * s);
    const needBotPx = this.compact ? 34 : 64 * s;

    let vw = 2 * halfW, vh = (vw * H) / W, k = W / vw, top = 0, topMm = MARGIN_MM;
    for (let i = 0; i < 4; i++) {
      topMm = Math.max(MARGIN_MM, needTopPx / k + 40);
      const botMm = POLE_ABOVE_MM + sideMm + Math.max(120, needBotPx / k);
      const needMm = topMm + botMm;
      vw = 2 * halfW;
      vh = (vw * H) / W;
      if (needMm > vh) {
        vh = needMm;
        vw = (vh * W) / H;
      }
      k = W / vw;
      top = poleY - topMm - (vh - needMm) * 0.42;
    }
    const left = cx - vw / 2;
    this.el = { k, left, top, cx, poleY, stockMm, cutMm, heightKnown, sideMm, opt, rowGap };
    this._buildTextures();
    this._buildMesh();
  }

  _source() {
    if (this.src) return this.src;
    const { iw, ih } = this.ph;
    const c = document.createElement("canvas");
    c.width = iw;
    c.height = ih;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(this.img, 0, 0);
    this.src = g.getImageData(0, 0, iw, ih).data;
    return this.src;
  }

  // Inverse warp: for every pixel of the wall-plane canvas, find where it sits in the photo.
  _buildTextures() {
    const { W, H, dpr } = this.size;
    const ts = Math.min(dpr, 1600 / W, 900 / H);
    const tw = Math.max(1, Math.round(W * ts)), th = Math.max(1, Math.round(H * ts));
    const src = this._source();
    const { iw, ih } = this.ph;
    const G = this.frame.G;
    const { k, left, top } = this.el;
    const nat = new ImageData(tw, th);
    const cya = new ImageData(tw, th);
    const nd = nat.data, cd = cya.data;
    const dR = DEEP[0], dG = DEEP[1], dB = DEEP[2];
    for (let py = 0; py < th; py++) {
      const wy = ((py + 0.5) / ts) / k + top;
      for (let px = 0; px < tw; px++) {
        const wx = ((px + 0.5) / ts) / k + left;
        const den = G[6] * wx + G[7] * wy + G[8];
        if (den <= 0) continue;
        const u = (G[0] * wx + G[1] * wy + G[2]) / den;
        const v = (G[3] * wx + G[4] * wy + G[5]) / den;
        if (u < 0 || v < 0 || u > iw - 1.001 || v > ih - 1.001) continue;
        const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
        const i00 = (y0 * iw + x0) * 4, i10 = i00 + 4, i01 = i00 + iw * 4, i11 = i01 + 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const r = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
        const g = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
        const b = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
        const o = (py * tw + px) * 4;
        nd[o] = r; nd[o + 1] = g; nd[o + 2] = b; nd[o + 3] = 255;
        // cyanotype: deep blue shadows, paper-white highlights, kept low so white linework reads
        let l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        l = clamp01((l - 0.12) / 0.8);
        l = l * l * (3 - 2 * l);
        const m = 0.03 + 0.44 * l;
        cd[o] = dR + (255 - dR) * m;
        cd[o + 1] = dG + (255 - dG) * m;
        cd[o + 2] = dB + (255 - dB) * m;
        cd[o + 3] = 255;
      }
    }
    const mk = (data) => {
      const c = document.createElement("canvas");
      c.width = tw;
      c.height = th;
      c.getContext("2d").putImageData(data, 0, 0);
      return c;
    };
    this.tex = { nat: mk(nat), cya: mk(cya), ts, tw, th };
  }

  _buildMesh() {
    const { W, H } = this.size;
    const cols = 18, rows = 10;
    const verts = [];
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const ex = (W * i) / cols, ey = (H * j) / rows;
        const wx = ex / this.el.k + this.el.left, wy = ey / this.el.k + this.el.top;
        const p = this._photo(wx, wy);
        verts.push({ ex, ey, px: p[0], py: p[1], ok: p[2] > 0 });
      }
    }
    this.mesh = { cols, rows, verts };
  }

  // wall mm -> canvas css px, for the photo and for the elevation
  _photo(wx, wy) {
    const [u, v, w] = applyH(this.frame.G, wx, wy);
    return [this.ph.x + u * this.ph.r, this.ph.y + v * this.ph.r, w];
  }
  _elev(wx, wy) {
    return [(wx - this.el.left) * this.el.k, (wy - this.el.top) * this.el.k];
  }
  _at(wx, wy, m) {
    const a = this._photo(wx, wy);
    if (m <= 0) return a;
    const b = this._elev(wx, wy);
    if (m >= 1) return b;
    return [lerp(a[0], b[0], m), lerp(a[1], b[1], m)];
  }

  // ---------- drawing ----------
  draw() {
    if (!this.img || !this.size.W) return;
    const g = this.ctx, { W, H, dpr } = this.size, t = this.t;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.globalAlpha = 1;
    if (this.samView) {
      this._drawPhoto(1);
      this._drawSam();
      return;
    }
    if (!this.geo) {
      this._drawPhoto(1);
      this._drawRawOutlines();
      if (this.run && !this.run.ok) {
        const size = this.compact ? 12 : Math.round(15 * this.s);
        this._pill("No size from this clip yet", 14, H - 14 - size * 0.75, { size, bg: C.ink, fg: "#ffffff", align: "left", weight: 600 });
      }
      return;
    }
    const m = easeInOut(seg(t, ...this.tl.morph));
    const c = easeInOut(seg(t, ...this.tl.tint));

    if (m > 0) {
      g.fillStyle = C.deep;
      g.globalAlpha = m;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    if (m < 1) this._drawPhoto(m > 0 ? 1 - easeOut(seg(t, this.tl.morph[0], this.tl.morph[0] + 0.7)) : 1);
    if (m > 0) {
      if (c < 1) this._drawMesh(this.tex.nat, m, 1);
      if (c > 0) this._drawMesh(this.tex.cya, m, c);
    }
    const gridA = easeOut(seg(t, ...this.tl.grid));
    if (gridA > 0) this._drawGrid(gridA);

    this._drawWindow(t, m);
    if (this.span) this._drawSpan(t, m);
    this._drawSheet(t, m);
    this._drawTape(t, m);
    if (t >= this.tl.frameDim[0]) this._drawElevation(t);
    const cp = easeOut(seg(t, ...this.tl.tape));
    this.onCount(cp);
  }

  _drawPhoto(alpha) {
    const g = this.ctx, p = this.ph;
    g.globalAlpha = alpha;
    g.drawImage(this.img, p.x, p.y, p.iw * p.r, p.ih * p.r);
    g.globalAlpha = 1;
  }

  _drawRawOutlines() {
    const g = this.ctx, f = this.frame;
    if (!f) return;
    const P = (pt) => [this.ph.x + pt.x * this.ph.r, this.ph.y + pt.y * this.ph.r];
    const poly = (pts, col) => {
      g.beginPath();
      pts.map(P).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.lineWidth = 3;
      g.strokeStyle = "rgba(23,48,31,.4)";
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = col;
      g.stroke();
    };
    if (Array.isArray(f.window) && f.window.length === 4) poly(f.window, "#ffffff");
    if (Array.isArray(f.sheet) && f.sheet.length === 4) poly(f.sheet, C.tape);
  }

  _drawMesh(tex, m, alpha) {
    const g = this.ctx, { cols, verts } = this.mesh, ts = this.tex.ts;
    g.globalAlpha = alpha;
    const V = (i, j) => verts[j * (cols + 1) + i];
    for (let j = 0; j < this.mesh.rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = V(i, j), b = V(i + 1, j), c = V(i + 1, j + 1), d = V(i, j + 1);
        if (!(a.ok && b.ok && c.ok && d.ok)) continue;
        this._tri(tex, ts, a, b, c, m);
        this._tri(tex, ts, a, c, d, m);
      }
    }
    g.globalAlpha = 1;
  }

  _tri(tex, ts, v0, v1, v2, m) {
    const g = this.ctx;
    const s0x = v0.ex * ts, s0y = v0.ey * ts, s1x = v1.ex * ts, s1y = v1.ey * ts, s2x = v2.ex * ts, s2y = v2.ey * ts;
    const d0x = lerp(v0.px, v0.ex, m), d0y = lerp(v0.py, v0.ey, m);
    const d1x = lerp(v1.px, v1.ex, m), d1y = lerp(v1.py, v1.ey, m);
    const d2x = lerp(v2.px, v2.ex, m), d2y = lerp(v2.py, v2.ey, m);
    const den = (s1x - s0x) * (s2y - s0y) - (s2x - s0x) * (s1y - s0y);
    if (Math.abs(den) < 1e-6) return;
    const a = ((d1x - d0x) * (s2y - s0y) - (d2x - d0x) * (s1y - s0y)) / den;
    const b = ((d1y - d0y) * (s2y - s0y) - (d2y - d0y) * (s1y - s0y)) / den;
    const c = ((d2x - d0x) * (s1x - s0x) - (d1x - d0x) * (s2x - s0x)) / den;
    const d = ((d2y - d0y) * (s1x - s0x) - (d1y - d0y) * (s2x - s0x)) / den;
    const e = d0x - a * s0x - c * s0y;
    const f = d0y - b * s0x - d * s0y;
    // grow the clip a little to hide hairline seams between triangles
    const mx = (d0x + d1x + d2x) / 3, my = (d0y + d1y + d2y) / 3;
    const grow = (x, y) => {
      const dx = x - mx, dy = y - my, l = Math.hypot(dx, dy) || 1;
      return [x + (dx / l) * 0.7, y + (dy / l) * 0.7];
    };
    const p0 = grow(d0x, d0y), p1 = grow(d1x, d1y), p2 = grow(d2x, d2y);
    g.save();
    g.beginPath();
    g.moveTo(p0[0], p0[1]);
    g.lineTo(p1[0], p1[1]);
    g.lineTo(p2[0], p2[1]);
    g.closePath();
    g.clip();
    g.transform(a, b, c, d, e, f);
    const sx = Math.max(0, Math.floor(Math.min(s0x, s1x, s2x)) - 2);
    const sy = Math.max(0, Math.floor(Math.min(s0y, s1y, s2y)) - 2);
    const ex = Math.min(this.tex.tw, Math.ceil(Math.max(s0x, s1x, s2x)) + 2);
    const ey = Math.min(this.tex.th, Math.ceil(Math.max(s0y, s1y, s2y)) + 2);
    if (ex > sx && ey > sy) g.drawImage(tex, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
    g.restore();
  }

  _drawGrid(alpha) {
    const g = this.ctx, { W, H } = this.size, { k, left, top } = this.el;
    const right = left + W / k, bottom = top + H / k;
    g.lineWidth = 1;
    for (let x = Math.ceil(left / 100) * 100; x <= right; x += 100) {
      const X = Math.round((x - left) * k) + 0.5;
      g.strokeStyle = `rgba(238,243,251,${(x % 500 === 0 ? 0.13 : 0.055) * alpha})`;
      g.beginPath();
      g.moveTo(X, 0);
      g.lineTo(X, H);
      g.stroke();
    }
    for (let y = Math.ceil(top / 100) * 100; y <= bottom; y += 100) {
      const Y = Math.round((y - top) * k) + 0.5;
      g.strokeStyle = `rgba(238,243,251,${(y % 500 === 0 ? 0.13 : 0.055) * alpha})`;
      g.beginPath();
      g.moveTo(0, Y);
      g.lineTo(W, Y);
      g.stroke();
    }
  }

  _path(pts) {
    const g = this.ctx;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  }

  _edge(ax, ay, bx, by, m, n = 10) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(this._at(lerp(ax, bx, i / n), lerp(ay, by, i / n), m));
    return out;
  }

  _drawWindow(t, m) {
    const a = easeOut(seg(t, ...this.tl.win));
    if (a <= 0) return;
    const g = this.ctx, wall = this.frame.frameWall || this.frame.wall, { heightKnown, sideMm } = this.el;
    const x0 = wall.x0, x1 = wall.x0 + wall.w, y0 = wall.y0, y1 = wall.y0 + sideMm;
    const top = this._edge(x0, y0, x1, y0, m);
    const lw = 1.6 + 0.6 * m;
    const strokeAll = (path, alpha) => {
      if (m < 1) {
        this._path(path);
        g.lineWidth = lw + 2.2;
        g.strokeStyle = `rgba(23,48,31,${0.35 * (1 - m) * alpha})`;
        g.stroke();
      }
      this._path(path);
      g.lineWidth = lw;
      g.strokeStyle = `rgba(255,255,255,${0.95 * alpha})`;
      g.stroke();
    };
    g.lineCap = "round";
    g.lineJoin = "round";
    if (heightKnown) {
      const right = this._edge(x1, y0, x1, y1, m), bottom = this._edge(x1, y1, x0, y1, m), leftE = this._edge(x0, y1, x0, y0, m);
      strokeAll([...top, ...right.slice(1), ...bottom.slice(1), ...leftE.slice(1)], a);
    } else {
      strokeAll(top, a);
      // bottom never seen: let the sides fade out
      const n = 10;
      for (const x of [x0, x1]) {
        for (let i = 0; i < n; i++) {
          const p = this._at(x, lerp(y0, y1, i / n), m), q = this._at(x, lerp(y0, y1, (i + 1) / n), m);
          strokeAll([p, q], a * (1 - i / n));
        }
      }
    }
  }

  _drawSheet(t, m) {
    const p = easeOut(seg(t, ...this.tl.sheet));
    if (p <= 0) return;
    const g = this.ctx;
    const corners = [[0, 0], [this.paper.w, 0], [this.paper.w, this.paper.h], [0, this.paper.h], [0, 0]];
    const pts = [];
    for (let i = 0; i < 4; i++) {
      const e = this._edge(corners[i][0], corners[i][1], corners[i + 1][0], corners[i + 1][1], m, 6);
      pts.push(...(i ? e.slice(1) : e));
    }
    // fill once drawn
    if (p > 0.6) {
      this._path(pts);
      g.closePath();
      g.fillStyle = `rgba(242,194,48,${0.2 * seg(p, 0.6, 1) * (1 - 0.4 * m)})`;
      g.fill();
    }
    // draw-on stroke along the perimeter
    let total = 0;
    const lens = [];
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      lens.push(l);
      total += l;
    }
    let left = total * p;
    const drawn = [pts[0]];
    for (let i = 1; i < pts.length && left > 0; i++) {
      const l = lens[i - 1];
      if (left >= l) drawn.push(pts[i]);
      else {
        const f = left / l;
        drawn.push([lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]);
      }
      left -= l;
    }
    g.lineJoin = "round";
    g.lineCap = "round";
    if (m < 1) {
      this._path(drawn);
      g.lineWidth = 5;
      g.strokeStyle = `rgba(23,48,31,${0.3 * (1 - m)})`;
      g.stroke();
    }
    this._path(drawn);
    g.lineWidth = 2.6;
    g.strokeStyle = C.tape;
    g.stroke();

    // label under the sheet in the photo, small "A4" inside it on the drawing
    const la = easeOut(seg(t, ...this.tl.sheetLabel)) * (1 - seg(t, this.tl.morph[0] - 0.1, this.tl.morph[0] + 0.25));
    if (la > 0) {
      const [bx, by] = this._at(this.paper.w / 2, this.paper.h, m);
      const [lx] = this._at(0, this.paper.h, m);
      const size = this.compact ? 11 : Math.round(15 * this.s);
      const P = this.paper, name = P.name || "A4";
      const text = this.compact ? `${name} sheet` : `${name} sheet, ${Math.min(P.w, P.h)} by ${Math.max(P.w, P.h)} mm`;
      this._pill(text, Math.min(Math.max(lx, 8), this.size.W - 8), by + 10 + size * 0.7, {
        size, bg: C.tape, fg: C.ink, align: "left", alpha: la, weight: 650,
      });
      void bx;
    }
    const sa = easeOut(seg(t, this.tl.stock[0], this.tl.stock[0] + 0.4));
    if (sa > 0 && m >= 1) {
      const [cx, cy] = this._elev(this.paper.w / 2, this.paper.h / 2);
      this._text(this.paper.name === "US Letter" ? "Letter" : "A4", cx, cy, { size: this.compact ? 9 : Math.round(12 * this.s), color: C.tape, alpha: sa, weight: 700 });
    }
  }

  // Muse Spark's choice: the candidate edges the code found on the wall, lettered, with the two it picked lit up.
  _drawSpan(t, m) {
    const sp = this.span, tl = this.tl;
    if (t < tl.spanIn[0]) return;
    const g = this.ctx, { H } = this.size;
    const fw = this.frame.frameWall || this.frame.wall;
    const side = this.el.sideMm;
    const yA = fw.y0 + 0.1 * side, yB = fw.y0 + 0.8 * side;
    const measured = sp.edges.filter((e) => e.measured).map((e) => e.label);
    const pickedOutline = [sp.left, sp.right].every((l) => measured.includes(l));
    const hl = sp.adopted || pickedOutline || measured.length !== 2 ? [sp.left, sp.right] : measured;
    const pick = easeOut(seg(t, ...tl.spanPick));
    const outOthers = 1 - easeOut(seg(t, tl.tape[0] + 0.15, tl.tape[0] + 0.6));
    // An adopted opening stays on the drawing as two thin lines; otherwise the chosen pair is the outline itself.
    const outChosen = sp.adopted ? 1 : 1 - easeOut(seg(t, tl.morph[0] + 0.2, tl.morph[0] + 0.8));
    const letterOut = 1 - easeOut(seg(t, tl.morph[0], tl.morph[0] + 0.5));
    const size = this.compact ? 10 : Math.round(Math.max(11, 13 * this.s));
    let prevX = -1e9, stagger = 0;
    g.lineCap = "round";
    sp.edges.forEach((e, k) => {
      const chosen = hl.includes(e.label);
      const p = easeOut(seg(t, tl.spanIn[0] + k * 0.07, tl.spanIn[0] + k * 0.07 + 0.32));
      if (p <= 0) return;
      const fade = chosen ? outChosen : outOthers * (1 - 0.5 * pick);
      if (fade <= 0.01) return;
      const pts = this._edge(e.xMm, yA, e.xMm, lerp(yA, yB, p), m, 8);
      if (m < 1) {
        this._path(pts);
        g.lineWidth = 4;
        g.strokeStyle = `rgba(23,48,31,${0.45 * (1 - m) * fade})`;
        g.stroke();
      }
      const hp = chosen ? pick : 0;
      if (!chosen) g.setLineDash([5, 4]);
      if (hp < 1) {
        this._path(pts);
        g.lineWidth = 1.3;
        g.strokeStyle = `rgba(255,255,255,${0.9 * fade * (1 - hp)})`;
        g.stroke();
      }
      g.setLineDash([]);
      if (hp > 0) {
        this._path(pts);
        g.lineWidth = sp.adopted && m >= 1 ? 1.6 : 2.6;
        g.strokeStyle = `rgba(242,194,48,${fade * hp * (m >= 1 ? 0.85 : 1)})`;
        g.stroke();
      }
      const [bx, by] = this._at(e.xMm, yB, m);
      stagger = bx - prevX < size * 2.2 ? 1 - stagger : 0;
      prevX = bx;
      const la = fade * p * letterOut;
      if (la > 0.01) {
        const lit = chosen && pick > 0.5;
        this._pill(e.label, bx, by + 8 + size * 0.75 + stagger * size * 1.75, {
          size, bg: lit ? C.tape : "rgba(23,48,31,.9)", fg: lit ? C.ink : "#ffffff", alpha: la, weight: 720,
        });
      }
    });
    const ca = pick * (1 - easeOut(seg(t, tl.morph[0] - 0.25, tl.morph[0] + 0.15)));
    if (ca > 0) {
      const [L, R] = [...hl].sort();
      const text = sp.adopted
        ? `Muse Spark picked ${L} and ${R}${this.compact ? "" : this.blindOpt ? ": I size the blind from these" : ": the pole spans these"}`
        : pickedOutline
          ? `Muse Spark picked ${L} and ${R}${this.compact ? "" : ", the outline I measured"}`
          : "Muse Spark's picks didn't agree, so I kept the outline";
      const cs = this.compact ? 11 : Math.round(15 * this.s);
      this._pill(text, 14, H - 14 - cs * 0.75, { size: cs, bg: C.ink, fg: "#ffffff", align: "left", alpha: ca, weight: 600 });
    }
  }

  _drawSam() {
    const g = this.ctx, f = this.frame, run = this.run, { H } = this.size;
    if (!f) return;
    const sx = f.width ? this.ph.iw / f.width : 1, sy = f.height ? this.ph.ih / f.height : sx;
    const P = (pt) => [this.ph.x + pt.x * sx * this.ph.r, this.ph.y + pt.y * sy * this.ph.r];
    const size = this.compact ? 11 : Math.round(Math.max(12, 14 * this.s));
    const quad = (pts, col, fill) => {
      const q = pts.map(P);
      this._path(q);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      g.lineJoin = "round";
      g.lineWidth = 4.5;
      g.strokeStyle = "rgba(23,48,31,.45)";
      g.stroke();
      g.lineWidth = 2.4;
      g.strokeStyle = col;
      g.stroke();
      return {
        x0: Math.min(...q.map((p) => p[0])), y0: Math.min(...q.map((p) => p[1])),
        x1: Math.max(...q.map((p) => p[0])), y1: Math.max(...q.map((p) => p[1])),
      };
    };
    let any = false;
    if (Array.isArray(f.window) && f.window.length >= 3) {
      any = true;
      const b = quad(f.window, "#ffffff", "rgba(255,255,255,.08)");
      const y = b.y0 > size * 2.6 ? b.y0 - 10 - size * 0.75 : b.y0 + 10 + size * 0.75;
      this._pill("Window (SAM 3.1 + edge fit)", b.x0, y, { size, bg: C.ink, fg: "#ffffff", align: "left", weight: 650 });
    }
    if (Array.isArray(f.sheet) && f.sheet.length >= 3) {
      any = true;
      const b = quad(f.sheet, C.tape, "rgba(242,194,48,.22)");
      const name = this.paper.name || "A4";
      const below = b.y1 + 10 + size * 0.75;
      this._pill(`${name} sheet (SAM 3.1)`, b.x0, below < H - size ? below : b.y0 - 10 - size * 0.75, {
        size, bg: C.tape, fg: C.ink, align: "left", weight: 650,
      });
    }
    const hands = (run?.hands || []).filter((h) => h && h.img && h.frame === run.heroIndex);
    hands.forEach((h, i) => {
      any = true;
      const [x, y] = P(h.img);
      g.beginPath();
      g.arc(x, y, this.compact ? 5 : 7, 0, Math.PI * 2);
      g.fillStyle = C.cut;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "#ffffff";
      g.stroke();
      if (i === 0) this._pill("Fingertip (SAM 3.1)", x + 12, y, { size: size - 1, bg: "#ffffff", fg: C.ink, align: "left", weight: 650 });
    });
    if (!any) this._pill("SAM 3.1 found nothing it could use on this frame", 14, H - 14 - size * 0.75, { size, bg: C.ink, fg: "#ffffff", align: "left", weight: 600 });
  }

  _tapeStartX() {
    const w = this.frame.wall;
    if (w.x0 + w.w <= 0) return 0; // window left of the sheet
    if (w.x0 >= this.paper.w) return this.paper.w; // window right of the sheet
    return w.x0 + w.w / 2;
  }

  _drawTape(t, m) {
    if (t < this.tl.tape[0]) return;
    const out = 1 - easeOut(seg(t, ...this.tl.tapeOut));
    if (out <= 0) return;
    const g = this.ctx, wall = this.frame.wall, s = this.s;
    const tp = backOut(seg(t, ...this.tl.tape));
    const xs = this._tapeStartX();
    const aW = lerp(xs, wall.x0, tp), bW = lerp(xs, wall.x0 + wall.w, tp);
    const y0 = wall.y0;
    const A = this._at(aW, y0, m), B = this._at(bW, y0, m);
    let dx = B[0] - A[0], dy = B[1] - A[1];
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    dx /= len;
    dy /= len;
    let nx = dy, ny = -dx; // points up, away from the window
    const band = this.compact ? 9 : Math.max(11, Math.min(24, 19 * s));
    // if the frame's top edge is at the very top of the photo, hang the tape just inside it instead
    if (Math.min(A[1], B[1]) + ny * band < 3) {
      nx = -nx;
      ny = -ny;
    }
    g.globalAlpha = out;
    // body
    g.beginPath();
    g.moveTo(A[0], A[1]);
    g.lineTo(B[0], B[1]);
    g.lineTo(B[0] + nx * band, B[1] + ny * band);
    g.lineTo(A[0] + nx * band, A[1] + ny * band);
    g.closePath();
    g.fillStyle = C.tape;
    g.shadowColor = "rgba(0,0,0,.28)";
    g.shadowBlur = 6;
    g.shadowOffsetY = 2;
    g.fill();
    g.shadowColor = "transparent";
    g.shadowBlur = 0;
    g.shadowOffsetY = 0;
    // ticks, in real centimetres along the frame's top edge
    const c0 = this._at(wall.x0 + wall.w / 2, y0, m), c1 = this._at(wall.x0 + wall.w / 2 + 10, y0, m);
    const pxPerCm = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
    const minor = pxPerCm >= 3.5 ? 1 : pxPerCm * 5 >= 3.5 ? 5 : 10;
    const every = [10, 20, 50, 100].find((n) => n * pxPerCm >= (this.compact ? 22 : 30)) || 100;
    const fromCm = Math.max(0, Math.ceil((Math.min(aW, bW) - wall.x0) / 10));
    const toCm = Math.floor((Math.max(aW, bW) - wall.x0) / 10);
    g.strokeStyle = C.tapeInk;
    g.fillStyle = C.tapeInk;
    const fs = Math.max(8, Math.round(band * 0.46));
    this._font(fs, 700, "semi-condensed");
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    for (let cm = fromCm; cm <= toCm; cm++) {
      if (cm % minor) continue;
      const P = this._at(wall.x0 + cm * 10, y0, m);
      const L = cm % 10 === 0 ? 0.55 : cm % 5 === 0 ? 0.38 : 0.24;
      g.lineWidth = cm % 10 === 0 ? 1.3 : 0.9;
      g.beginPath();
      g.moveTo(P[0], P[1]);
      g.lineTo(P[0] + nx * band * L, P[1] + ny * band * L);
      g.stroke();
      if (cm > 0 && cm % every === 0) {
        g.fillText(String(cm), P[0] + dx * 2 + nx * band * 0.82, P[1] + dy * 2 + ny * band * 0.82 + fs * 0.35);
      }
    }
    // the hooks that snap onto each side of the frame
    g.lineWidth = 3;
    g.strokeStyle = C.tapeEdge;
    for (const P of [A, B]) {
      g.beginPath();
      g.moveTo(P[0] - nx * band * 0.3, P[1] - ny * band * 0.3);
      g.lineTo(P[0] + nx * band * 1.05, P[1] + ny * band * 1.05);
      g.stroke();
    }
    g.globalAlpha = 1;

    // the readout rides with the tape
    const ra = seg(t, this.tl.tape[0], this.tl.tape[0] + 0.15) * (1 - seg(t, this.tl.morph[0] - 0.1, this.tl.morph[0] + 0.3));
    if (ra > 0) {
      const cp = easeOut(seg(t, ...this.tl.tape));
      const val = fmt1((this.run.widthMm / 10) * cp) + " cm";
      const size = this.compact ? 17 : Math.round(Math.max(20, Math.min(46, 38 * s)));
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
      const below = Math.max(my, my + ny * band) + 14 + size * 0.75;
      this._pill(val, mx, below, {
        size, bg: C.ink, fg: C.tape, alpha: ra, weight: 720, stretch: "condensed", pad: size * 0.32, tabular: true,
      });
    }
  }

  _drawElevation(t) {
    const g = this.ctx, { W, H } = this.size, s = this.s, cpt = this.compact;
    const { k, cx, poleY, stockMm, cutMm, heightKnown, sideMm, opt, rowGap } = this.el;
    const wall = this.frame.wall;
    const E = (x, y) => this._elev(x, y);
    const [xL, yTop] = E(wall.x0, wall.y0);
    const [xR] = E(wall.x0 + wall.w, wall.y0);
    const yBot = E(0, wall.y0 + sideMm)[1];
    const [cxs, py] = E(cx, poleY);
    const poleTh = Math.max(cpt ? 3 : 4, 35 * k);
    const halfCut = (cutMm / 2) * k, halfStock = (stockMm / 2) * k, fin = FINIAL_MM * k;
    const fs = cpt ? 10 : Math.max(11, Math.round(13.5 * s));
    const blind = this.blindOpt;
    const showPole = !blind && !!opt;
    const hasCut = showPole && opt.cutPerEndMm > 0 && opt.cutToMm != null;

    // frame width
    const fa = easeOut(seg(t, ...this.tl.frameDim));
    if (fa > 0) {
      const yd = Math.min(heightKnown ? yBot + (cpt ? 14 : 24 * s) : yBot - 4, H - (cpt ? 22 : 34 * s));
      g.globalAlpha = fa;
      if (heightKnown) {
        this._ext(xL, yBot + 4, yd + 5, 0.6);
        this._ext(xR, yBot + 4, yd + 5, 0.6);
      }
      this._dim(xL, xR, yd, C.line, 1.2);
      this._text(`${fmt1(this.run.widthMm / 10)} cm ${this.run.span?.adopted ? "opening" : "frame"}`, (xL + xR) / 2, yd + fs * 0.95, {
        size: fs + (cpt ? 0 : 2), color: C.line, weight: 700, knock: true,
      });
      g.globalAlpha = 1;
    }

    // stock length, ghosted
    const sa = easeOut(seg(t, ...this.tl.stock));
    if (hasCut && sa > 0) {
      g.globalAlpha = sa * 0.85;
      g.setLineDash([3, 3]);
      g.lineWidth = 1;
      g.strokeStyle = C.line;
      g.strokeRect(cxs - halfStock, py - poleTh / 2, halfStock * 2, poleTh);
      g.setLineDash([]);
      g.globalAlpha = 1;
    }

    // the pole, grown from the centre out to its cut length
    const pg = easeOut(seg(t, ...this.tl.pole));
    if (showPole && pg > 0) {
      const hw = halfCut * pg;
      g.fillStyle = C.tape;
      g.shadowColor = "rgba(0,0,0,.35)";
      g.shadowBlur = 8;
      g.shadowOffsetY = 2;
      g.fillRect(cxs - hw, py - poleTh / 2, hw * 2, poleTh);
      g.shadowColor = "transparent";
      g.shadowBlur = 0;
      g.shadowOffsetY = 0;
      if (opt.twoPiece && pg >= 1) {
        g.strokeStyle = "rgba(43,33,8,.55)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(cxs + 0.5, py - poleTh / 2);
        g.lineTo(cxs + 0.5, py + poleTh / 2);
        g.stroke();
      }
    }

    const y1 = py - poleTh / 2 - rowGap;
    const y2 = y1 - rowGap;
    // pole dimension
    const pa = easeOut(seg(t, ...this.tl.poleDim));
    if (showPole && pa > 0) {
      g.globalAlpha = pa;
      this._ext(cxs - halfCut, py - poleTh / 2 - 3, y1 - 5, 0.5);
      this._ext(cxs + halfCut, py - poleTh / 2 - 3, y1 - 5, 0.5);
      this._dim(cxs - halfCut, cxs + halfCut, y1, C.tape, 1.3);
      const label = hasCut ? `${fmtCm(cutMm)} cm pole` : `${opt.stockCm} cm pole, used as supplied`;
      this._text(label, cxs, y1 - fs * 0.85, { size: fs + (cpt ? 0 : 1), color: C.tape, weight: 700, knock: true });
      g.globalAlpha = 1;
    }

    // what comes off: stock dimension with the cut ends in red
    const ca = easeOut(seg(t, ...this.tl.cut));
    if (hasCut && ca > 0) {
      g.globalAlpha = ca;
      this._ext(cxs - halfStock, py - poleTh / 2 - 3, y2 - 5, 0.4);
      this._ext(cxs + halfStock, py - poleTh / 2 - 3, y2 - 5, 0.4);
      this._dim(cxs - halfStock, cxs + halfStock, y2, "rgba(238,243,251,.8)", 1);
      g.strokeStyle = C.cut;
      g.lineWidth = 3;
      for (const [a, b] of [[cxs - halfStock, cxs - halfCut], [cxs + halfCut, cxs + halfStock]]) {
        g.beginPath();
        g.moveTo(a, y2);
        g.lineTo(b, y2);
        g.stroke();
      }
      // cut marks across the pole
      g.lineWidth = 2;
      for (const x of [cxs - halfCut, cxs + halfCut]) {
        g.beginPath();
        g.moveTo(x, py + poleTh / 2 + (cpt ? 4 : 7));
        g.lineTo(x, y2 - 4);
        g.stroke();
      }
      const label = cpt
        ? `${opt.stockCm} cm, cut ${fmt1(opt.cutPerEndMm / 10)} cm off each end`
        : `${opt.stockCm} cm as supplied, cut ${fmt1(opt.cutPerEndMm / 10)} cm off each end`;
      this._text(label, cxs, y2 - fs * 0.85, { size: fs, color: C.line, weight: 600, knock: true });
      g.globalAlpha = 1;
    }

    // finials, 9 cm each end
    const fna = easeOut(seg(t, ...this.tl.finials));
    if (showPole && fna > 0) {
      g.globalAlpha = fna;
      const rad = Math.max(cpt ? 2.2 : 3, Math.min(poleTh * 0.95, 30 * k));
      for (const dir of [-1, 1]) {
        const x0 = cxs + dir * halfCut;
        const neck = Math.max(1, fin - 2 * rad);
        g.fillStyle = C.tape;
        g.fillRect(dir < 0 ? x0 - neck : x0, py - poleTh * 0.28, neck, poleTh * 0.56);
        g.beginPath();
        g.arc(x0 + dir * (neck + rad), py, rad, 0, Math.PI * 2);
        g.lineWidth = 1.6;
        g.strokeStyle = C.tape;
        g.fillStyle = "rgba(242,194,48,.35)";
        g.fill();
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    // how far past the frame each side
    const oa = easeOut(seg(t, ...this.tl.overhang));
    const ohPx = halfCut - (xR - xL) / 2;
    if (showPole && !cpt && oa > 0 && ohPx > 34) {
      g.globalAlpha = oa;
      const yo = py + poleTh / 2 + 12 * s;
      const lab = `${fmt1(opt.overhangEachSideMm / 10)}`;
      this._dim(cxs - halfCut, xL, yo, "rgba(238,243,251,.85)", 1);
      this._dim(xR, cxs + halfCut, yo, "rgba(238,243,251,.85)", 1);
      const fsm = Math.max(10, fs - 2);
      this._text(lab, (cxs - halfCut + xL) / 2, yo + fsm * 0.95, { size: fsm, color: C.line, weight: 600, knock: true });
      this._text(lab, (xR + cxs + halfCut) / 2, yo + fsm * 0.95, { size: fsm, color: C.line, weight: 600, knock: true });
      g.globalAlpha = 1;
    }

    // the example roller blind, in place of the pole
    if (blind) this._drawBlind(t, blind);

    // where the buyer pointed
    const hs = this.run.handSpan;
    const ha = easeOut(seg(t, ...this.tl.pointed));
    if (!cpt && hs && ha > 0) {
      g.globalAlpha = ha * 0.95;
      const yh = yTop + 16 * s;
      const fsm = Math.max(10, fs - 2.5);
      const marks = [
        [wall.x0 - hs.leftPastFrameMm, "left"],
        [wall.x0 + wall.w + hs.rightPastFrameMm, "right"],
      ];
      for (const [wx] of marks) {
        const [x] = E(wx, 0);
        if (x < 6 || x > W - 6) continue;
        g.fillStyle = C.line;
        g.beginPath();
        g.moveTo(x, yh - 6);
        g.lineTo(x - 5, yh + 3);
        g.lineTo(x + 5, yh + 3);
        g.closePath();
        g.fill();
        this._text("you pointed", x, yh + 4 + fsm, { size: fsm, color: C.line, weight: 500, knock: true, italic: true });
      }
      g.globalAlpha = 1;
    }

    // title block and scale bar
    const ta = easeOut(seg(t, ...this.tl.title));
    if (ta > 0) {
      g.globalAlpha = ta;
      const pad = cpt ? 8 : 18 * s;
      let bar = 1000 * k, barLab = "1 m";
      if (bar > W * 0.22) {
        bar = 500 * k;
        barLab = "50 cm";
      }
      const by = H - pad - (cpt ? 4 : 26 * s);
      const segs = barLab === "1 m" ? 10 : 5;
      const bh = cpt ? 3 : 5;
      for (let i = 0; i < segs; i++) {
        g.fillStyle = i % 2 ? "rgba(238,243,251,.25)" : C.line;
        g.fillRect(pad + (bar / segs) * i, by, bar / segs, bh);
      }
      const fsm = cpt ? 9 : Math.max(10, Math.round(12 * s));
      this._text("0", pad, by - fsm * 0.75, { size: fsm, color: C.line, weight: 600, align: "left" });
      this._text(barLab, pad + bar, by - fsm * 0.75, { size: fsm, color: C.line, weight: 600, align: "center" });
      if (!cpt) {
        const whose = this.run.id === "yours" ? "your clip" : "the buyer's clip";
        const sheet = this.paper.name === "US Letter" ? "US Letter" : "A4";
        this._text(`Front elevation, drawn from ${whose}. Scale from one sheet of ${sheet}.`, pad, H - pad - 2, {
          size: Math.max(11, Math.round(13 * s)), color: C.line, weight: 500, align: "left", family: "Mona Sans", stretch: "normal",
        });
      }
      g.globalAlpha = 1;
    }
  }

  // The example roller blind: a headrail grown from the centre, then the fabric let down over the opening.
  // With no height in the clip, the fabric stops part way with a dashed hem, because I don't know the drop.
  _drawBlind(t, b) {
    const g = this.ctx, s = this.s, cpt = this.compact, { H } = this.size;
    const { k, cx, sideMm, rowGap } = this.el;
    const wall = this.frame.wall;
    const inside = /inside/i.test(b.fit || "");
    const dropKnown = b.dropMm != null && b.dropMm > 0;
    const topMm = wall.y0 - (inside ? 15 : 50);
    const botMm = dropKnown ? topMm + b.dropMm : wall.y0 + 0.6 * sideMm;
    const [xc, yTop] = this._elev(cx, topMm);
    const yBot = Math.min(this._elev(0, botMm)[1], H - 4);
    const half = (b.widthMm / 2) * k;
    const rail = Math.max(cpt ? 3 : 4, 32 * k);
    const fs = cpt ? 10 : Math.max(11, Math.round(13.5 * s));

    // headrail
    const rg = easeOut(seg(t, ...this.tl.pole));
    if (rg <= 0) return;
    // fabric, let down from the rail
    const dg = easeInOut(seg(t, this.tl.pole[0] + 0.3, this.tl.cut[1] + 0.1));
    if (dg > 0) {
      const y0 = yTop + rail / 2, y1 = lerp(y0, yBot, dg);
      const grad = g.createLinearGradient(0, y0, 0, yBot);
      grad.addColorStop(0, "rgba(242,194,48,.30)");
      grad.addColorStop(1, dropKnown ? "rgba(242,194,48,.20)" : "rgba(242,194,48,.04)");
      g.fillStyle = grad;
      g.fillRect(xc - half, y0, half * 2, y1 - y0);
      // the side edges, fading out when the drop isn't known
      const eg = g.createLinearGradient(0, y0, 0, yBot);
      eg.addColorStop(0, "rgba(242,194,48,.85)");
      eg.addColorStop(1, dropKnown ? "rgba(242,194,48,.85)" : "rgba(242,194,48,.2)");
      g.strokeStyle = eg;
      g.lineWidth = 1.3;
      g.beginPath();
      for (const x of [xc - half, xc + half]) {
        g.moveTo(Math.round(x) + 0.5, y0);
        g.lineTo(Math.round(x) + 0.5, y1);
      }
      g.stroke();
      // the hem: a bottom bar if I know the drop, a dashed line where it stops if I don't
      if (dropKnown) {
        const bar = Math.max(2, 18 * k);
        g.fillStyle = C.tape;
        g.fillRect(xc - half, y1 - bar, half * 2, bar);
      } else if (dg >= 1) {
        g.setLineDash([6, 5]);
        g.strokeStyle = "rgba(242,194,48,.75)";
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(xc - half, Math.round(y1) + 0.5);
        g.lineTo(xc + half, Math.round(y1) + 0.5);
        g.stroke();
        g.setLineDash([]);
      }
    }
    const hw = half * rg;
    g.fillStyle = C.tape;
    g.shadowColor = "rgba(0,0,0,.35)";
    g.shadowBlur = 8;
    g.shadowOffsetY = 2;
    g.fillRect(xc - hw, yTop - rail / 2, hw * 2, rail);
    g.shadowColor = "transparent";
    g.shadowBlur = 0;
    g.shadowOffsetY = 0;

    // width dimension above the rail
    const pa = easeOut(seg(t, ...this.tl.poleDim));
    if (pa > 0) {
      const y1 = yTop - rail / 2 - rowGap;
      g.globalAlpha = pa;
      this._ext(xc - half, yTop - rail / 2 - 3, y1 - 5, 0.5);
      this._ext(xc + half, yTop - rail / 2 - 3, y1 - 5, 0.5);
      this._dim(xc - half, xc + half, y1, C.tape, 1.3);
      this._text(`${fmt1(b.widthMm / 10)} cm blind, ${b.fit}`, xc, y1 - fs * 0.85, {
        size: fs + (cpt ? 0 : 1), color: C.tape, weight: 700, knock: true,
      });
      g.globalAlpha = 1;
    }

    // what the drop is, or that I still need it
    const da = easeOut(seg(t, ...this.tl.finials));
    if (da > 0) {
      const fsm = Math.max(cpt ? 9 : 10, fs - 2);
      const text = dropKnown ? `${fmtCm(b.dropMm)} cm drop` : cpt ? "drop: measure the height" : "drop: measure the height (not in the clip)";
      const y = dropKnown ? (yTop + yBot) / 2 : yBot + fsm * 1.1;
      this._text(text, xc, Math.min(y, H - fsm * 2.2), { size: fsm, color: C.line, weight: 600, knock: true, alpha: da, italic: !dropKnown });
    }
  }

  // ---------- primitives ----------
  _font(size, weight = 600, stretch = "semi-condensed", family = "Mona Sans", italic = false) {
    const g = this.ctx;
    g.font = `${italic ? "italic " : ""}${weight} ${stretch} ${size}px "${family}", sans-serif`;
    if ("fontStretch" in g) {
      try {
        g.fontStretch = stretch;
      } catch {
        /* older canvas */
      }
    }
  }

  _text(str, x, y, o = {}) {
    const g = this.ctx;
    const size = o.size || 13;
    this._font(size, o.weight || 600, o.stretch || "semi-condensed", o.family || "Mona Sans", o.italic);
    g.textAlign = o.align || "center";
    g.textBaseline = "middle";
    const prev = g.globalAlpha;
    if (o.alpha != null) g.globalAlpha = prev * o.alpha;
    if (o.knock) {
      const w = g.measureText(str).width;
      const x0 = g.textAlign === "center" ? x - w / 2 : g.textAlign === "right" ? x - w : x;
      g.fillStyle = "rgba(18,58,107,.88)";
      g.fillRect(x0 - 4, y - size * 0.62, w + 8, size * 1.24);
    }
    g.fillStyle = o.color || C.line;
    g.fillText(str, x, y + size * 0.04);
    g.globalAlpha = prev;
  }

  _pill(str, x, y, o = {}) {
    const g = this.ctx;
    const size = o.size || 14;
    this._font(size, o.weight || 650, o.stretch || "semi-condensed");
    const w = g.measureText(str).width;
    const pad = o.pad != null ? o.pad : size * 0.45;
    const h = size * 1.45;
    let x0 = o.align === "left" ? x : x - w / 2 - pad;
    x0 = Math.max(6, Math.min(this.size.W - w - pad * 2 - 6, x0));
    let y0 = y - h / 2;
    y0 = Math.max(6, Math.min(this.size.H - h - 6, y0));
    const prev = g.globalAlpha;
    g.globalAlpha = prev * (o.alpha != null ? o.alpha : 1);
    g.fillStyle = o.bg || C.tape;
    g.beginPath();
    if (g.roundRect) g.roundRect(x0, y0, w + pad * 2, h, Math.min(8, h / 2));
    else g.rect(x0, y0, w + pad * 2, h);
    g.fill();
    g.fillStyle = o.fg || C.ink;
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText(str, x0 + pad, y0 + h / 2 + size * 0.05);
    g.globalAlpha = prev;
  }

  // a dimension line with architect's 45 degree ticks
  _dim(x1, x2, y, color, width = 1.2) {
    const g = this.ctx;
    const a = Math.min(x1, x2), b = Math.max(x1, x2);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(a - 3, y);
    g.lineTo(b + 3, y);
    g.stroke();
    g.lineWidth = width + 0.6;
    for (const x of [a, b]) {
      g.beginPath();
      g.moveTo(x - 4, y + 4);
      g.lineTo(x + 4, y - 4);
      g.stroke();
    }
  }

  _ext(x, ya, yb, alpha) {
    const g = this.ctx;
    g.strokeStyle = `rgba(238,243,251,${alpha})`;
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(Math.round(x) + 0.5, ya);
    g.lineTo(Math.round(x) + 0.5, yb);
    g.stroke();
  }
}

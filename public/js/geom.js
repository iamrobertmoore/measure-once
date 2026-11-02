// Small geometry helpers. G is row-major 3x3 and maps wall millimetres to image pixels.

export function applyH(G, x, y) {
  const w = G[6] * x + G[7] * y + G[8];
  return [(G[0] * x + G[1] * y + G[2]) / w, (G[3] * x + G[4] * y + G[5]) / w, w];
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const seg = (t, a, b) => clamp01((t - a) / (b - a));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x) => {
  x = clamp01(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
// Overshoots a little past 1 and settles: the tape snapping to the frame.
export const backOut = (x) => {
  x = clamp01(x);
  const c1 = 1.25, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

// Inverse of a row-major 3x3 (image pixels back to wall millimetres when given G).
export function invertH(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), Cc = d * h - e * g;
  const det = a * A + b * B + c * Cc;
  if (!det) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, Cc / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

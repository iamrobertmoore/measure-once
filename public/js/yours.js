// "Your window": everything that happens to a visitor's clip before it leaves the browser.
// A video becomes the 8 sharpest frames (one from each eighth of the first 30 seconds) and a short 16 kHz mono WAV.
// Photos are turned upright and scaled. Nothing here talks to the server.

const MAX_W = 1600;
const FPS = 3;
const MAX_S = 30;
const PICK = 8;
const MAX_PHOTOS = 6;
// Keep the whole upload under 4 MB, with room for the multipart wrapping.
export const BUDGET = 4_000_000 - 60_000;

export class DecodeError extends Error {}

function canvasFor(w, h, max = MAX_W) {
  const k = Math.min(1, max / w);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  return c;
}

// Sharpness: variance of a Laplacian on a small grey copy. Blurry frames from a moving phone score low.
function sharpness(src, small) {
  const g = small.getContext("2d", { willReadFrequently: true });
  g.drawImage(src, 0, 0, small.width, small.height);
  const d = g.getImageData(0, 0, small.width, small.height).data;
  const W = small.width, H = small.height;
  const grey = new Float32Array(W * H);
  for (let i = 0, j = 0; i < grey.length; i++, j += 4) grey[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const l = 4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - W] - grey[i + W];
      s += l;
      s2 += l * l;
      n++;
    }
  }
  return n ? s2 / n - (s / n) ** 2 : 0;
}

function waitFor(el, ev, ms) {
  return new Promise((resolve, reject) => {
    const done = (fn) => () => {
      clearTimeout(timer);
      el.removeEventListener(ev, ok);
      el.removeEventListener("error", bad);
      fn();
    };
    const ok = done(resolve);
    const bad = done(() => reject(new Error("error")));
    const timer = setTimeout(done(() => reject(new Error("timeout"))), ms);
    el.addEventListener(ev, ok);
    el.addEventListener("error", bad);
  });
}

/** Seek through the clip at 3 frames a second (first 30 s) and keep the sharpest frame from each eighth. */
export async function videoFrames(file, onProgress) {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  v.src = url;
  try {
    try {
      await waitFor(v, "loadeddata", 15000);
    } catch {
      throw new DecodeError("can't decode");
    }
    if (!v.videoWidth || !v.videoHeight) throw new DecodeError("no picture");
    let dur = v.duration;
    if (!isFinite(dur)) {
      // some recorders don't write a duration; seeking far ahead makes the browser work it out
      v.currentTime = 1e7;
      await waitFor(v, "seeked", 8000).catch(() => {});
      dur = isFinite(v.duration) ? v.duration : v.currentTime || MAX_S;
    }
    const span = Math.min(dur, MAX_S);
    const times = [];
    for (let t = 0.05; t < span - 0.02; t += 1 / FPS) times.push(t);
    if (!times.length) times.push(Math.max(0, dur / 2));
    const small = document.createElement("canvas");
    small.width = 320;
    small.height = Math.max(1, Math.round((320 * v.videoHeight) / v.videoWidth));
    const best = new Array(PICK).fill(null);
    let scratch = canvasFor(v.videoWidth, v.videoHeight);
    let read = 0;
    for (let k = 0; k < times.length; k++) {
      v.currentTime = times[k];
      try {
        await waitFor(v, "seeked", 6000);
      } catch {
        if (!read && k >= 2) throw new DecodeError("can't seek");
        continue;
      }
      scratch.getContext("2d").drawImage(v, 0, 0, scratch.width, scratch.height);
      const score = sharpness(scratch, small);
      read++;
      const b = Math.min(PICK - 1, Math.floor((times[k] / span) * PICK));
      if (!best[b] || score > best[b].score) {
        const spare = best[b]?.canvas;
        best[b] = { canvas: scratch, score, t: times[k] };
        scratch = spare || canvasFor(v.videoWidth, v.videoHeight);
      }
      onProgress?.(k + 1, times.length);
    }
    const picked = best.filter(Boolean);
    // A browser that can't really decode the video often hands back black frames instead of an error.
    if (!picked.length || picked.every((p) => p.score < 0.5)) throw new DecodeError("blank frames");
    return { canvases: picked.map((p) => p.canvas), duration: dur };
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}

function wavBlob(pcm, rate) {
  const n = pcm.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** What they said: the first 30 s, mono, 16 kHz, 16-bit WAV. Returns null if the browser can't decode the sound. */
export async function audioWav(file) {
  try {
    if (file.size > 600e6) return null;
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) return null;
    const bytes = await file.arrayBuffer();
    const decoded = await new Promise((resolve, reject) => {
      const p = new AC(1, 1, 44100).decodeAudioData(bytes, resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
    const secs = Math.min(decoded.duration, MAX_S);
    if (!(secs > 0.3)) return null;
    const off = new AC(1, Math.ceil(secs * 16000), 16000);
    const src = off.createBufferSource();
    src.buffer = decoded; // a one-channel destination mixes stereo down to mono
    src.connect(off.destination);
    src.start(0);
    const out = await off.startRendering();
    return wavBlob(out.getChannelData(0), 16000);
  } catch {
    return null;
  }
}

async function bitmapOf(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    /* older browsers: an <img> applies the photo's orientation by itself */
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new DecodeError(file.name);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Up to 6 photos, upright, at most 1600 px wide. */
export async function photoFrames(files) {
  const out = [];
  for (const f of files.slice(0, MAX_PHOTOS)) {
    const bmp = await bitmapOf(f);
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
    const c = canvasFor(w, h);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    out.push(c);
  }
  return out;
}

const toBlob = (c, q) => new Promise((res) => c.toBlob(res, "image/jpeg", q));
function shrink(c, maxW) {
  if (c.width <= maxW) return c;
  const d = canvasFor(c.width, c.height, maxW);
  d.getContext("2d").drawImage(c, 0, 0, d.width, d.height);
  return d;
}

/** JPEG every frame at 0.85, stepping quality (then size) down until the upload fits the budget. */
export async function encodeFrames(canvases, extraBytes = 0) {
  const steps = [[0.85, MAX_W], [0.75, MAX_W], [0.65, MAX_W], [0.6, 1280], [0.5, 1024]];
  let last;
  for (const [q, w] of steps) {
    const src = canvases.map((c) => shrink(c, w));
    const blobs = await Promise.all(src.map((c) => toBlob(c, q)));
    const total = blobs.reduce((a, b) => a + b.size, 0) + extraBytes;
    last = { blobs, q, total };
    if (total <= BUDGET) return last;
  }
  return last;
}

export const MAX_PHOTO_COUNT = MAX_PHOTOS;

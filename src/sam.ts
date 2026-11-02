// SAM 3.1 via the Meta Model API: one noun phrase per call, masks returned in full-image pixel coordinates.
import OpenAI from "openai";
import { parseImageStream, parseVideoStream, recordsOfKind, decodeMaskToRaster } from "@meta-sam/parser";

export type SamObject = {
  objectId: string;
  frame: number;
  confidence: number;
  box: { left: number; top: number; right: number; bottom: number };
  /** Full-image binary mask (row-major, W x H) cropped to the box; use `at(x, y)` or `toFull()`. */
  crop: { x0: number; y0: number; w: number; h: number; data: Uint8Array };
};

// Keep concurrent SAM calls modest and retry rate limits with backoff (credits accounts have tighter limits).
let active = 0; const queue: (() => void)[] = [];
const MAX = Number(process.env.SAM_CONCURRENCY || 6);
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    for (let attempt = 0; ; attempt++) {
      try { return await fn(); }
      catch (e: any) {
        const rate = e?.status === 429 || /429|rate limit/i.test(String(e?.message));
        if (!rate || attempt >= 6) throw e;
        await new Promise((r) => setTimeout(r, 800 * 2 ** attempt + Math.random() * 400));
      }
    }
  } finally { active--; queue.shift()?.(); }
}

export function client(apiKey: string) {
  return new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey, maxRetries: 3, timeout: 120_000 });
}

function toObjects(records: readonly any[]): SamObject[] {
  const boxes = new Map<string, any>();
  for (const b of recordsOfKind(records as any, "box")) boxes.set(`${b.frame?.frameIndex ?? 0}:${b.objectId}`, b);
  const out: SamObject[] = [];
  for (const m of recordsOfKind(records as any, "mask")) {
    const raster = decodeMaskToRaster(m.mask);
    const { left, top, right, bottom } = m.bounds;
    const bw = right - left, bh = bottom - top;
    // The raster covers the bounds; resample to the bounds' pixel grid if sizes differ (nearest neighbour).
    let data = raster, w = m.mask.width, h = m.mask.height;
    if (w !== bw || h !== bh) {
      const r = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++)
        r[y * bw + x] = raster[Math.min(h - 1, Math.floor((y * h) / bh)) * w + Math.min(w - 1, Math.floor((x * w) / bw))];
      data = r; w = bw; h = bh;
    }
    const frame = m.frame?.frameIndex ?? 0;
    const b = boxes.get(`${frame}:${m.objectId}`);
    out.push({
      objectId: m.objectId, frame, confidence: m.confidence ?? b?.confidence ?? 0,
      box: { left, top, right, bottom }, crop: { x0: left, y0: top, w, h, data },
    });
  }
  return out;
}

export async function segmentImage(api: OpenAI, imageDataUrl: string, phrase: string): Promise<SamObject[]> {
  return limited(() => segmentImageOnce(api, imageDataUrl, phrase));
}
async function segmentImageOnce(api: OpenAI, imageDataUrl: string, phrase: string): Promise<SamObject[]> {
  const stream: any = await api.responses.create({
    model: "sam-3.1", stream: true,
    metadata: { mask_encoding: "lossless", include_confidence: "true" },
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text: phrase }, { type: "input_image", image_url: imageDataUrl } as any] }],
  } as any);
  const parsed = parseImageStream(stream);
  const result = await parsed.finalResult;
  return toObjects(result.records);
}

export async function segmentVideo(api: OpenAI, fileId: string, phrase: string): Promise<SamObject[]> {
  return limited(() => segmentVideoOnce(api, fileId, phrase));
}
async function segmentVideoOnce(api: OpenAI, fileId: string, phrase: string): Promise<SamObject[]> {
  const stream: any = await api.responses.create({
    model: "sam-3.1", stream: true,
    metadata: { mask_encoding: "lossless", include_confidence: "true" },
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text: phrase }, { type: "input_video", file_id: fileId } as any] }],
  } as any);
  const parsed = parseVideoStream(stream);
  const result = await parsed.finalResult;
  return toObjects(result.records);
}

/** Paste an object's crop into a full-size W x H mask. */
export function fullMask(o: SamObject, W: number, H: number): Uint8Array {
  const m = new Uint8Array(W * H);
  const { x0, y0, w, h, data } = o.crop;
  for (let y = 0; y < h; y++) {
    const Y = y0 + y; if (Y < 0 || Y >= H) continue;
    for (let x = 0; x < w; x++) { const X = x0 + x; if (X >= 0 && X < W && data[y * w + x]) m[Y * W + X] = 1; }
  }
  return m;
}

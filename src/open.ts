// Muse Spark Open, Meta's open-weights model, served by Baseten (an OpenAI-compatible endpoint).
// Used for the reply draft when a Baseten key is set; the hosted Muse Spark takes over if Baseten can't answer.
import OpenAI from "openai";
import { existsSync, readFileSync } from "node:fs";

export const OPEN_MODEL = process.env.OPEN_MODEL || "meta-models/muse-spark-open";
export const OPEN_WHERE = "Baseten";

export function openKey(): string {
  if (process.env.BASETEN_API_KEY) return process.env.BASETEN_API_KEY.trim();
  const f = process.env.BASETEN_API_KEY_FILE;
  return f && existsSync(f) ? readFileSync(f, "utf8").trim() : "";
}

let client: OpenAI | null = null;
function open(): OpenAI | null {
  const key = openKey();
  if (!key) return null;
  client ??= new OpenAI({ apiKey: key, baseURL: process.env.OPEN_BASE_URL || "https://inference.baseten.co/v1", timeout: 60_000, maxRetries: 1 });
  return client;
}

/** One JSON answer from Muse Spark Open. Returns null when no Baseten key is set. Throws if Baseten fails. */
export async function openJson(system: string, user: string): Promise<{ text: string; ms: number } | null> {
  const c = open();
  if (!c) return null;
  const t0 = Date.now();
  const res: any = await c.chat.completions.create({
    model: OPEN_MODEL,
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_object" },
    max_tokens: 12000,
    reasoning_effort: "low",
    temperature: 0.3,
  } as any);
  const text = res.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error(`Muse Spark Open sent an empty answer (finish: ${res.choices?.[0]?.finish_reason}, ${res.usage?.completion_tokens} tokens)`);
  console.log(`[open] ${OPEN_MODEL} on ${OPEN_WHERE}: id ${res.id}, ${Date.now() - t0} ms`);
  return { text, ms: Date.now() - t0 };
}

/** Muse Spark Open looking at a picture: one JSON answer. Null without a Baseten key; throws if Baseten fails. */
export async function openVisionJson(jpeg: Buffer, text: string): Promise<string | null> {
  const c = open();
  if (!c) return null;
  const t0 = Date.now();
  const res: any = await c.chat.completions.create({
    model: OPEN_MODEL,
    messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } }, { type: "text", text }] }],
    max_tokens: 8000, reasoning_effort: "low", temperature: 0.2,
  } as any);
  const out = res.choices?.[0]?.message?.content ?? "";
  if (!out.trim()) throw new Error(`Muse Spark Open sent an empty answer (finish: ${res.choices?.[0]?.finish_reason})`);
  console.log(`[open] ${OPEN_MODEL} looking: ${Date.now() - t0} ms`);
  return out;
}

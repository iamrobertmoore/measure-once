// Local server: npm start  -> http://localhost:3000  (static page + the same /api handlers the hosted site uses)
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import run from "./api/run.ts";
import render from "./api/render.ts";
import send from "./api/send.ts";
import status from "./api/status.ts";
import upload from "./api/upload.ts";
const routes: Record<string, any> = { "/api/run": run, "/api/render": render, "/api/send": send, "/api/status": status, "/api/upload": upload };
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".gif": "image/gif" };
const port = Number(process.env.PORT || 3000);
createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://x");
  const h = routes[url.pathname];
  if (h) {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(Buffer.from(c));
    const raw = Buffer.concat(chunks), ct = String(req.headers["content-type"] || "");
    // JSON for the small API calls; the upload route gets the raw multipart body, as on Vercel.
    const r: any = { method: req.method, headers: req.headers, body: ct.startsWith("application/json") || (!ct && raw.length) ? JSON.parse(raw.toString() || "{}") : raw.length ? raw : {} };
    const out: any = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json(o: any) { res.writeHead(this.statusCode, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); } };
    try { await h(r, out); } catch (e: any) { out.status(500).json({ error: e.message }); }
    return;
  }
  const p = normalize(join("public", url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
  if (!p.startsWith("public")) { res.writeHead(403); return res.end(); }
  try { await stat(p); res.writeHead(200, { "Content-Type": types[extname(p)] || "application/octet-stream" }); res.end(await readFile(p)); }
  catch { res.writeHead(404); res.end("not found"); }
}).listen(port, () => console.log(`Measure Once on http://localhost:${port}`));

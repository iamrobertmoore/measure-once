// Usage: node shoot.mjs page.html [stills|video] -> stills at checkpoints, or a 10 s mp4
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import { execFileSync } from "node:child_process";
import { renameSync, readdirSync, mkdirSync } from "node:fs";
const [, , page, mode = "stills", dur = "10.4"] = process.argv;
const name = page.replace(/\.html$/, "");
const b = await chromium.launch();
if (mode === "stills") {
  const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  await p.goto("http://localhost:8765/" + page);
  let last = 0;
  for (const t of [1.5, 3.0, 4.6, 6.6, 9.8]) { await p.waitForTimeout((t - last) * 1000); last = t; await p.screenshot({ path: `out/${name}-${t}.png` }); }
} else {
  mkdirSync("out/vid", { recursive: true });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: "out/vid", size: { width: 1920, height: 1080 } } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:8765/" + page);
  await p.waitForTimeout(+dur * 1000 + 600);
  const vp = p.video(); await ctx.close();
  const f = await vp.path();
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "0.35", "-i", f, "-t", dur, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `out/${name}.mp4`]);
  renameSync(f, `out/vid/${name}.webm`);
}
await b.close();

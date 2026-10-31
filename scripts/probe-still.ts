// Run the still-frame measurement on one image and write an overlay next to it.
import { readFileSync, writeFileSync } from "node:fs";
import { client } from "../src/sam.ts";
import { measureStill, overlay } from "../src/measure.ts";

const [, , file, out = file.replace(/\.(jpe?g|png)$/i, ".measured.jpg")] = process.argv;
const api = client(readFileSync(new URL("../.secrets/meta_api_key", import.meta.url), "utf8").trim());
const jpeg = readFileSync(file);
const t0 = Date.now();
const r = await measureStill(api, jpeg);
console.log(JSON.stringify({ ms: Date.now() - t0, ...r, sheet: undefined, window: undefined }, null, 1));
const quads = [r.sheet && { pts: r.sheet, color: "#3ddc84" }, r.window && { pts: r.window, color: "#ffb300" }].filter(Boolean) as any;
const label = r.ok ? `window ${Math.round(r.widthMm)} x ${Math.round(r.heightMm)} mm` : `abstain: ${r.reason}`;
writeFileSync(out, await overlay(jpeg, quads, label));
console.log("overlay", out);

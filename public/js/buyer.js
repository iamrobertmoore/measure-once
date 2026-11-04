// The buyer's side: a link a maker puts on their listing. The buyer films their window, sees their size at once,
// and sends it to the maker, who gets the measurement and a drafted reply to check before anything is made.
import { Hero } from "./hero.js";
import { likely, poleHolds } from "./sure.js";
import { videoFrames, audioWav, photoFrames, encodeFrames, DecodeError, MAX_PHOTO_COUNT } from "./yours.js";

const $ = (id) => document.getElementById(id);
const cm1 = (mm) => (Math.round(mm) / 10).toFixed(1);
const cmClean = (mm) => { const c = mm / 10; return Math.abs(c - Math.round(c)) < 0.05 ? String(Math.round(c)) : c.toFixed(1); };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Each maker: their name, who checks the size, and whose rules size it.
const SHOPS = {
  creationsfromrob: { name: "Creationsfromrob", maker: "Rob", seller: "poles", what: "a curtain pole", ask: "Rob makes wooden curtain poles to fit. Film your window and he'll get the width he needs to cut yours." },
  "example-curtains": { name: "Example curtain maker", maker: "the maker", seller: "curtains", what: "curtains", ask: "An example made-to-measure curtain maker, using the usual trade rules. Film your window to get the curtain size." },
  "example-blinds": { name: "Example blind maker", maker: "the maker", seller: "blinds", what: "a roller blind", ask: "An example made-to-measure roller blind maker, using the usual trade rules. Film your window to get the blind size." },
};
// Any maker can make their own link: ?name=Helen's Poles&maker=Helen&makes=poles|blinds|curtains (see "Make your link").
const qs = new URLSearchParams(location.search);
const clean = (v, n) => String(v || "").replace(/[<>]/g, "").trim().slice(0, n);
const custom = qs.get("name") ? (() => {
  const seller = ["poles", "blinds", "curtains"].includes(qs.get("makes")) ? qs.get("makes") : "poles";
  const name = clean(qs.get("name"), 60), maker = clean(qs.get("maker"), 30) || name;
  const what = { poles: "curtain poles", blinds: "roller blinds", curtains: "curtains" }[seller];
  return { name, maker, seller, what, ask: `${name} makes ${what} to measure. Film your window and ${maker} gets the size they need to make yours.` };
})() : null;
const shopId = custom ? clean(qs.get("name"), 40) : qs.get("shop") || "creationsfromrob";
const shop = custom || SHOPS[shopId] || SHOPS.creationsfromrob;
document.title = `${shop.name}: measure your window`;
$("shopName").textContent = shop.name;
$("askLede").textContent = shop.ask;
document.querySelectorAll(".maker").forEach((e) => (e.textContent = shop.maker));

const FIX = {
  "sheet not flat or cut off": "The sheet doesn't look flat, it's at too steep an angle, or part of it is out of shot. Tape all four corners flat, film from more square-on, and keep the whole sheet in view.",
  "no sheet found": "I couldn't see a sheet of A4. Tape one flat on the wall beside the window and film again.",
  "window's sides not in shot": "Step back so both sides of the window are in view, and film again.",
};

const hero = new Hero($("heroCanvas"), { onCount: (f) => { if (state.run?.ok) $("fw").textContent = cm1(state.run.widthMm * f); } });
const state = { files: [], kind: null, busy: false, run: null };

function choose(list) {
  const files = [...(list || [])];
  const vid = files.find((f) => f.type.startsWith("video/") || /\.(mov|mp4|m4v|webm)$/i.test(f.name));
  const imgs = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(f.name));
  if (vid) { state.files = [vid]; state.kind = "video"; $("chosen").textContent = vid.name; }
  else if (imgs.length) { state.files = imgs.slice(0, MAX_PHOTO_COUNT); state.kind = "photos"; $("chosen").textContent = `${state.files.length} photo${state.files.length > 1 ? "s" : ""}`; }
  else { state.files = []; $("chosen").textContent = "That doesn't look like a video or a photo."; }
  $("go").disabled = !state.files.length;
}
for (const id of ["file", "cam"]) $(id).addEventListener("change", (e) => { choose(e.target.files); e.target.value = ""; });
$("drop").addEventListener("dragover", (e) => { e.preventDefault(); $("drop").classList.add("drag"); });
$("drop").addEventListener("dragleave", () => $("drop").classList.remove("drag"));
$("drop").addEventListener("drop", (e) => { e.preventDefault(); $("drop").classList.remove("drag"); choose(e.dataTransfer?.files); });

function status(text, busy = false, err = false) {
  const el = $("status");
  el.className = "run-status" + (err ? " err" : "");
  el.innerHTML = text ? (busy ? `<span class="spin" aria-hidden="true"></span>` : "") + `<span>${esc(text)}</span>` : "";
}

$("go").addEventListener("click", async () => {
  if (state.busy || !state.files.length) return;
  state.busy = true; $("go").disabled = true;
  const t0 = performance.now();
  const tick = (what) => status(`${what}. ${Math.floor((performance.now() - t0) / 1000)} s`, true);
  let phase = state.kind === "video" ? "Picking the sharpest frames" : "Reading your photos";
  const timer = setInterval(() => tick(phase), 500);
  try {
    let canvases, wav = null;
    if (state.kind === "video") {
      const a = audioWav(state.files[0]);
      ({ canvases } = await videoFrames(state.files[0]));
      wav = await a;
    } else canvases = await photoFrames(state.files);
    phase = "Getting the frames ready";
    const { blobs } = await encodeFrames(canvases, wav ? wav.size : 0);
    const fd = new FormData();
    blobs.forEach((b, i) => fd.append("frame", b, `frame${i}.jpg`));
    if (wav) fd.append("audio", wav, "audio.wav");
    fd.append("paper", "auto"); fd.append("kind", state.kind); fd.append("seller", shop.seller);
    phase = "Measuring your window, usually about a minute";
    const res = await fetch("api/upload", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `The server said ${res.status}`);
    clearInterval(timer); status("");
    show(data.run || data);
  } catch (e) {
    clearInterval(timer);
    status(e instanceof DecodeError ? "Your browser couldn't open this clip. Try Safari, or 2 or 3 photos instead." : e.message, false, true);
  } finally { state.busy = false; $("go").disabled = !state.files.length; }
});

function suggestion(run) {
  if (shop.seller === "blinds" && run.blinds?.options?.length) {
    const b = run.blinds.options[0];
    return { title: `A ${cmClean(b.widthMm)} cm wide roller blind, ${b.fit.startsWith("outside") ? "fitted outside the frame" : "fitted inside the recess"}`, holds: null };
  }
  if (shop.seller === "curtains" && run.curtains?.options?.length) {
    const c = run.curtains.options[0];
    return { title: `A pair of ${c.heading} curtains, ${cmClean(c.eachCurtainMm)} cm each, for a ${cmClean(c.poleMm)} cm pole`, holds: null };
  }
  const o = run.options?.[0];
  if (!o) return { title: "", holds: null };
  const t = o.cutToMm ? `A ${o.stockCm} cm pole, cut to ${cmClean(o.cutToMm)} cm` : `A ${o.stockCm} cm pole, as it comes`;
  return { title: t, holds: poleHolds(run, o) };
}

async function show(run) {
  state.run = run;
  $("ask").hidden = true;
  if (!run.ok) {
    $("refused").hidden = false;
    $("fix").textContent = FIX[run.reason] || "I couldn't get a measurement I'd trust from this clip. Tape the sheet flat beside the window, keep both sides of the window in shot, and film again.";
    return;
  }
  $("result").hidden = false;
  const L = likely(run);
  $("resLabel").textContent = run.span?.adopted ? "The opening around your window" : "Your window, outside the frame";
  $("likely").textContent = `Likely ${cm1(L.lo)} to ${cm1(L.hi)} cm`;
  const s = suggestion(run);
  $("resTitle").textContent = s.title ? `${shop.maker === "Rob" ? "Rob's" : "The maker's"} suggestion: ${s.title}` : "";
  if (s.holds) {
    $("holds").hidden = false;
    $("holds").classList.toggle("no", !s.holds.holds);
    $("holds").querySelector("span").textContent = s.holds.holds
      ? `It fits anywhere in that range, ${cm1(s.holds.least)} to ${cm1(s.holds.most)} cm past each side.`
      : "It might not fit at the edge of that range, so a quick tape check first.";
  }
  $("resNote").textContent = `${shop.maker === "the maker" ? "The maker checks" : `${shop.maker} checks`} every size before anything is made, and replies to you directly.`;
  hero.mode = shop.seller === "blinds" ? "blinds" : "poles";
  await hero.load(run, run.heroImage || `samples/${demo}/hero.jpg`);
  hero.play();
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("send").addEventListener("click", async () => {
  const run = state.run; if (!run?.ok) return;
  const btn = $("send"); btn.disabled = true;
  const L = likely(run);
  const s = suggestion(run);
  const reply = (shop.seller === "blinds" ? run.blinds?.draft?.reply : shop.seller === "curtains" ? run.curtains?.draft?.reply : run.draft?.reply) || "";
  const who = $("who").value.trim().slice(0, 60);
  if (!who) { $("sendStatus").className = "send-status err"; $("sendStatus").textContent = `Add your name on Etsy first, so ${shop.maker === "the maker" ? "the maker" : shop.maker} knows who to reply to.`; btn.disabled = false; $("who").focus(); return; }
  const summary = [`New sizing request for ${shop.name}`, `From: ${who}`, `Measured: ${cm1(run.widthMm)} cm (likely ${cm1(L.lo)} to ${cm1(L.hi)} cm)`, s.title ? `Suggested: ${s.title}` : "", run.transcript ? `They said: "${run.transcript.trim()}"` : ""].filter(Boolean).join("\n");
  try {
    const res = await fetch("api/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "request", sample: shopId, summary, reply }) });
    const d = await res.json();
    if (!res.ok || d.error) throw new Error(d.error || res.status);
    $("sendStatus").className = "send-status ok";
    $("sendStatus").textContent = `Sent. ${shop.maker === "Rob" ? "Rob" : "The maker"} has your size and will reply to you directly.`;
    btn.textContent = "Sent";
  } catch (e) {
    $("sendStatus").className = "send-status err"; $("sendStatus").textContent = "That didn't send: " + e.message; btn.disabled = false;
  }
});

const restart = () => { state.run = null; $("result").hidden = true; $("refused").hidden = true; $("ask").hidden = false; $("send").disabled = false; $("send").innerHTML = `<span>Send this to <span class="maker">${esc(shop.maker)}</span></span>`; $("sendStatus").textContent = ""; window.scrollTo({ top: 0, behavior: "smooth" }); };
$("again").addEventListener("click", restart);
$("again2").addEventListener("click", restart);

// ?demo=<recorded clip> shows that clip's recorded result, so the page can be seen without filming a window.
const demo = new URLSearchParams(location.search).get("demo");
if (demo && /^[\w-]+$/.test(demo)) fetch(`samples/${demo}/run.json`).then((r) => r.json()).then(show).catch(() => {});

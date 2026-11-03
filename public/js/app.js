import { Hero } from "./hero.js";
import { videoFrames, audioWav, photoFrames, encodeFrames, DecodeError, MAX_PHOTO_COUNT } from "./yours.js";

const $ = (id) => document.getElementById(id);
const SERVER_NEEDED = "Live runs need the server: npm start";

const state = {
  samples: [],
  runs: new Map(), // id -> recorded run
  live: new Map(), // id -> live run result
  liveImg: new Map(), // id -> data URL of a live hero frame, if the server sent one
  current: null,
  shown: null, // id whose details are on screen
  running: null, // id with a live run in flight
  poles: new Map(), // id -> { src, cap }
  compareFor: null, // id whose before/after pole photos are loaded
  seller: "poles", // whose rules: "poles" (my shop) or "blinds" (the example roller blind catalogue); kept across clips
};
const YOURS = "yours";
// The visitor's own window: what they picked, and where the run is up to.
const mine = { files: [], kind: null, busy: false, formOpen: false, t0: 0, sentAt: 0, phase: "", previewUrl: null, count: 0, frameUrls: [] };

// ---------- small helpers ----------
function fitText(ta) {
  ta.style.height = "auto";
  ta.style.height = Math.min(Math.max(ta.scrollHeight + 2, 170), 560) + "px";
}
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const cm1 = (mm) => (Math.round(mm) / 10).toFixed(1);
const cmClean = (mm) => {
  const cm = mm / 10;
  return Math.abs(cm - Math.round(cm)) < 0.05 ? String(Math.round(cm)) : cm.toFixed(1);
};
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const dateGB = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const FIXES = {
  "sheet not flat or cut off": {
    short: "sheet not flat in view",
    fix: "The sheet doesn't look flat, it's at too steep an angle, or part of it is out of shot. Tape all four corners flat, film from more square-on, and keep the whole sheet in view.",
    problem: "the sheet of A4 doesn't look flat to the camera (curled, at a steep angle, or partly out of shot)",
    ask: "tape all four corners of the sheet flat to the wall beside the window, film from more square-on, keep the whole sheet in view,",
  },
  "no sheet found": {
    short: "no sheet in view",
    fix: "I couldn't see a sheet of A4. Tape one flat on the wall beside the window.",
    problem: "I couldn't see a sheet of A4 in it",
    ask: "tape a sheet of A4 flat on the wall beside the window",
  },
  "window's sides not in shot": {
    short: "window cut off",
    fix: "Step back so both sides of the window are in view.",
    problem: "both sides of the window weren't in shot",
    ask: "step back so both sides of the window are in view",
  },
};
const fixFor = (reason) =>
  FIXES[reason] || {
    short: reason || "unclear clip",
    fix: cap(reason || "Something went wrong with this clip."),
    problem: reason || "something in the clip got in the way",
    ask: "tape a sheet of A4 flat beside the window, keep the whole window in view,",
  };

function refilmDraft(reason, photos = false) {
  const f = fixFor(reason);
  const then = state.seller === "blinds" ? "exactly what size of blind to order" : "exactly which pole to order and where to cut it";
  return (
    `Thanks for the ${photos ? "photos" : "video"}. I couldn't get a measurement I'd trust from this one, as ${f.problem}.\n` +
    `Could you ${f.ask} and film it again for about 10 seconds? Then I can tell you ${then}.\n` +
    `Best wishes, Rob`
  );
}

const MODEL_NAMES = [
  [/^sam-3\.1$/, "SAM 3.1"],
  [/^sam-3\.1 \(video tracking\)$/, "SAM 3.1"],
  [/^muse-voice-transcribe/, "Muse Voice Transcribe"],
  [/^muse-spark/, "Muse Spark"],
  [/^muse-image/, "Muse Image"],
];
function modelList(models = []) {
  const out = [];
  for (const m of models) {
    const hit = MODEL_NAMES.find(([re]) => re.test(m));
    const name = hit ? hit[1] : m.startsWith("sam-3.1") ? "SAM 3.1" : m;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}
const listAnd = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);

function statusLine(run) {
  if (!run) return { text: "Couldn't load this clip", bad: true };
  if (run.ok && run.widthMm) return { text: `Measured: ${cm1(run.widthMm)} cm`, bad: false };
  return { text: `Couldn't measure: ${fixFor(run.reason).short}`, bad: true };
}

class ApiError extends Error {}
async function post(path, body) {
  let res;
  try {
    res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError(SERVER_NEEDED);
  }
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if ([404, 405, 501].includes(res.status) && !(data && (data.error || data.message))) throw new ApiError(SERVER_NEEDED);
  if (!res.ok) {
    let msg = (data && (data.error || data.message)) || "";
    if (typeof msg !== "string") msg = JSON.stringify(msg);
    if (!msg && res.status === 429) msg = "Too many live runs just now. Give it a minute and try again.";
    if (!msg) msg = text && text.length < 300 && !/<html/i.test(text) ? text : `The server said ${res.status} ${res.statusText}`.trim();
    throw new ApiError(msg);
  }
  if (data === null) throw new ApiError("The server sent something I couldn't read.");
  return data;
}

// ---------- hero ----------
const hero = new Hero($("heroCanvas"), {
  onCount: (f) => {
    const el = $("fw");
    const run = currentRun();
    if (el && run && run.ok) el.textContent = cm1(run.widthMm * f);
  },
  onEnd: () => revealCompare(),
});
window.__hero = hero; // handy for poking at the animation from the console

function currentRun() {
  const id = state.current;
  return id ? state.live.get(id) || state.runs.get(id) : null;
}

// ---------- whose rules: my pole, or the example roller blind ----------
const hasBlinds = (run) => !!(run?.ok && run.blinds?.options?.length);
// What this clip shows: the blind when it's picked and the run has blind sizes, otherwise my pole.
const modeFor = (run) => (state.seller === "blinds" && hasBlinds(run) ? "blinds" : "poles");

function renderSeller(run) {
  const group = $("seller");
  const measured = !!run?.ok;
  const blindsOk = hasBlinds(run);
  const mode = measured ? modeFor(run) : state.seller;
  let why = "";
  if (!measured) why = "Only for clips I could measure";
  else if (!blindsOk) why = "This run has no blind sizes. Pick Roller blind and run it live again.";
  group.classList.toggle("off", !measured);
  group.title = why;
  for (const b of group.querySelectorAll(".seg-btn")) {
    const isBlind = b.dataset.seller === "blinds";
    b.setAttribute("aria-pressed", String(b.dataset.seller === mode));
    b.disabled = !measured || (isBlind && !blindsOk);
    b.title = b.disabled ? why : "";
  }
  // the copy on the upload form: what the next run of your own window will be sized for
  for (const b of $("trySeller").querySelectorAll(".seg-btn")) {
    b.setAttribute("aria-pressed", String(b.dataset.seller === state.seller));
    b.disabled = mine.busy;
  }
}

function onSeller(e) {
  const b = e.target.closest(".seg-btn");
  if (!b || b.disabled) return;
  const next = b.dataset.seller === "blinds" ? "blinds" : "poles";
  if (next === state.seller && b.getAttribute("aria-pressed") === "true") return;
  state.seller = next;
  const id = state.current;
  const run = currentRun();
  if (!run || (id === YOURS && $("main").classList.contains("trying"))) {
    renderSeller(run);
    return;
  }
  setSam(false, true);
  renderSeller(run);
  renderFacts(run, id, true);
  renderReply(run, id, true);
  setupCompare(id, run);
  hero.setMode(modeFor(run));
  if (hero.img) $("heroCanvas").setAttribute("aria-label", heroLabel(run));
  revealCompare();
}
$("seller").addEventListener("click", onSeller);
$("trySeller").addEventListener("click", onSeller);

// ---------- inbox ----------
function renderList() {
  const ul = $("clipList");
  if (!state.samples.length) {
    ul.innerHTML = `<li class="clip-empty">No clips yet. When a buyer sends one, it lands here.</li>`;
    return;
  }
  ul.innerHTML = state.samples
    .map((s) => {
      const run = state.live.get(s.id) || state.runs.get(s.id);
      const st = state.runs.has(s.id) || state.live.has(s.id) ? statusLine(run) : { text: "Loading", bad: false };
      return `<li><button type="button" class="clip-item" data-id="${esc(s.id)}" aria-current="${s.id === state.current}">
        <img class="clip-thumb" src="samples/${esc(s.id)}/${esc(s.thumb || "hero.jpg")}" alt="" loading="lazy">
        <span class="clip-text"><span class="clip-name">${esc(run?.title || s.title)}</span>
        <span class="clip-status${st.bad ? " bad" : ""}">${esc(st.text)}</span></span>
      </button></li>`;
    })
    .join("");
}

const lists = document.querySelector(".lists");
lists.addEventListener("click", (e) => {
  const b = e.target.closest(".clip-item");
  if (b) select(b.dataset.id, { focusMain: false });
});
lists.addEventListener("keydown", (e) => {
  if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return;
  const items = [...document.querySelectorAll(".clip-item")];
  const i = items.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  const n = items[(i + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length];
  n.focus();
  select(n.dataset.id);
});

// ---------- selection ----------
async function select(id) {
  if (!id) return;
  const changed = state.shown !== id;
  state.current = id;
  state.shown = id;
  document.querySelectorAll(".clip-item").forEach((b) => b.setAttribute("aria-current", String(b.dataset.id === id)));
  // keep the picked clip in view in the strip, without moving the page
  const tab = document.querySelector(`.clip-item[data-id="${CSS.escape(id)}"]`);
  const strip = document.querySelector(".lists");
  if (tab && strip) {
    const t = tab.getBoundingClientRect(), r = strip.getBoundingClientRect();
    if (t.left < r.left || t.right > r.right) strip.scrollBy({ left: t.left - r.left - 14, behavior: "smooth" });
  }
  setSam(false, true);
  if (id === YOURS && (!state.runs.has(YOURS) || mine.formOpen || mine.busy)) {
    hidePaneError();
    showTry();
    return;
  }
  hideTry();
  const run = currentRun();
  if (!run) {
    showPaneError("I couldn't load this clip. Check that its run.json is in samples/" + id + ".");
    return;
  }
  hidePaneError();
  renderSeller(run);
  hero.mode = modeFor(run);
  renderAsk(run, id, changed);
  renderFacts(run, id);
  renderReply(run, id, changed);
  renderRunBar(id);
  setupCompare(id, run);
  await loadHero(run, id);
}

function showPaneError(msg) {
  const el = $("paneError");
  el.textContent = msg;
  el.hidden = false;
}
function hidePaneError() {
  $("paneError").hidden = true;
}

function renderAsk(run, id, changed) {
  const yours = id === YOURS;
  $("clipTitle").textContent = run.title || id;
  $("askLabel").textContent = yours ? "What you said, heard by Muse Voice Transcribe" : "What they said, heard by Muse Voice Transcribe";
  const full = cap((run.transcript || "").trim());
  const tEl = $("transcript"), more = $("moreBtn");
  tEl.classList.toggle("none", !full);
  if (!full) {
    tEl.textContent = yours
      ? mine.ranKind === "photos"
        ? "Photos don't carry sound, so I'm going on the pictures alone."
        : "I didn't catch anything said in your clip."
      : "They didn't say anything in the clip.";
    more.hidden = true;
  } else if (full.length > 220) {
    let cut = full.slice(0, 200);
    cut = cut.slice(0, cut.lastIndexOf(" ")) + "...";
    tEl.textContent = cut;
    tEl.dataset.full = full;
    tEl.dataset.short = cut;
    more.hidden = false;
    more.textContent = "more";
    more.setAttribute("aria-expanded", "false");
  } else {
    tEl.textContent = full;
    more.hidden = true;
  }
  if (changed) {
    const v = $("preview");
    v.pause();
    v.muted = true;
    v.controls = true;
    if (!yours) {
      v.poster = `samples/${id}/hero.jpg`;
      v.src = `samples/${id}/preview.mp4`;
      $("videoCap").textContent = "The buyer's clip";
    } else {
      v.poster = run.heroImage || "";
      if (mine.previewUrl) {
        v.src = mine.previewUrl;
        $("videoCap").textContent = "Your clip";
      } else {
        v.removeAttribute("src");
        v.load();
        v.controls = false;
        $("videoCap").textContent = mine.count > 1 ? `Your ${mine.count} photos` : "Your photo";
      }
    }
  }
}
$("moreBtn").addEventListener("click", () => {
  const tEl = $("transcript"), more = $("moreBtn");
  const open = more.getAttribute("aria-expanded") === "true";
  tEl.textContent = open ? tEl.dataset.short : tEl.dataset.full;
  more.textContent = open ? "more" : "less";
  more.setAttribute("aria-expanded", String(!open));
});
$("preview").addEventListener("loadedmetadata", (e) => {
  const d = e.target.duration;
  if (isFinite(d) && d > 0) $("videoCap").textContent = `${state.current === YOURS ? "Your clip" : "The buyer's clip"}, ${Math.round(d)} seconds`;
});
$("preview").addEventListener("error", () => {
  if (!$("preview").getAttribute("src")) return;
  $("videoCap").textContent = "The clip preview isn't available.";
});

function frameThumbs(run, id, isLive) {
  const frames = run.frames || [];
  const max = 5;
  const shown = frames.slice(0, max);
  const items = shown
    .map((f) => {
      let cls = "", lab;
      if (f.ok && f.widthMm && !f.outlier) lab = cm1(f.widthMm);
      else if (f.ok && f.outlier) {
        cls = "off";
        lab = "set aside";
      } else {
        cls = "off";
        lab = "no reading";
      }
      const src = id === YOURS ? run.thumbs?.[f.index] || "" : isLive ? "" : `samples/${id}/f${f.index}.jpg`;
      const img = src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : "";
      return `<li class="${cls}" title="Frame ${f.index}">${img}${esc(lab)}</li>`;
    })
    .join("");
  const extra = frames.length > max ? `<li class="more">+${frames.length - max} more</li>` : "";
  return frames.length ? `<ul class="frames" aria-label="Frames the code read">${items}${extra}</ul>` : "";
}

function handsLine(hs, edge = "frame") {
  const side = (mm, which) => {
    const c = Math.round(mm / 10);
    if (c === 0) return `right at the ${edge} edge on the ${which}`;
    if (c > 0) return `${c} cm past the ${edge} on the ${which}`;
    return `${-c} cm inside the ${edge} on the ${which}`;
  };
  return `You pointed about ${side(hs.leftPastFrameMm, "left")} and ${side(hs.rightPastFrameMm, "right")}.`;
}

function optionTitle(o) {
  return o.cutToMm != null && o.cutPerEndMm > 0
    ? `${o.stockCm} cm pole, cut to ${cmClean(o.cutToMm)} cm`
    : `${o.stockCm} cm pole, used as supplied`;
}

// One line on Muse Spark's call about which edges the pole spans (runs recorded before this have no span).
function spanLine(run) {
  const sp = run.span;
  if (!sp || !run.ok) return "";
  const spans = modeFor(run) === "blinds" ? "to size the blind from" : "the pole spans";
  const m = String(sp.votes || "").match(/(\d+) of (\d+)/);
  const votes = m ? `${m[1]} of ${m[2]} frame${m[2] === "1" ? "" : "s"}` : "";
  if (sp.adopted) {
    const why = String(sp.why || "");
    const what = /recess/i.test(why)
      ? "the recess opening"
      : /trim|surround|architrave|casing|mould/i.test(why)
        ? "the outside of the surround"
        : "the opening on the wall";
    const [L, R] = [sp.left, sp.right].sort();
    const w = sp.widthMm || run.widthMm;
    return `Opening on the wall: <b>${cm1(w)} cm</b>. Muse Spark picked lines ${esc(L)} and ${esc(R)} (${what}${votes ? ", " + votes : ""}); the window frame inside is ${cm1(sp.frameWidthMm)} cm.`;
  }
  if (/agreed with the outline/.test(sp.votes || "") && m)
    return `Muse Spark checked which edges ${spans} and agreed with the measured outline (${votes}).`;
  return `Muse Spark checked which edges ${spans}. ${esc(cap(sp.votes || "the frames didn't agree on a wider opening"))}, so I kept the measured outline.`;
}

// The blind sizes from the example catalogue, in place of my pole.
function blindFacts(run) {
  const opts = run.blinds.options;
  const items = opts
    .map((o, i) => {
      const drop =
        o.dropMm != null && o.dropMm > 0
          ? `<p class="blind-drop">${cmClean(o.dropMm)} cm drop</p>`
          : `<p class="blind-drop${i ? " muted" : " need"}">drop: measure the height (not in the clip)</p>`;
      return `<li>
        <p class="blind-fit"><i class="blindmark${i ? " plain" : ""}" aria-hidden="true"></i>${esc(cap(o.fit))}${i ? "" : `<span class="vh"> (on the drawing)</span>`}</p>
        <p class="blind-size">${cm1(o.widthMm)} cm wide</p>
        ${drop}
        ${o.note ? `<p class="blind-note">${esc(cap(o.note))}.</p>` : ""}
      </li>`;
    })
    .join("");
  return `<div class="fact-block">
    <p class="fact-label">The blind to order</p>
    <ul class="blind-opts">${items}</ul>
  </div>`;
}

function renderFacts(run, id, still = false) {
  const isLive = state.live.has(id);
  const el = $("facts");
  if (!run.ok) {
    const f = fixFor(run.reason);
    const n = (run.frames || []).length;
    el.innerHTML = `<div>
      <p class="fact-label">Couldn't measure this one</p>
      <p class="fact-fail">${esc(f.fix)}</p>
      <p class="fact-sub">${n ? `I checked ${n} frames from the clip and none gave a reading I'd trust, so I won't guess a size.` : "I won't guess a size from this clip."}</p>
      ${frameThumbs(run, id, isLive)}
    </div>`;
    return;
  }
  const o = run.options?.[0];
  const alt = run.options?.[1];
  const spread = run.spreadMm != null ? (run.spreadMm < 1 ? "under 1 mm" : `${Math.round(run.spreadMm)} mm`) : null;
  const used = run.framesUsed || (run.frames || []).filter((f) => f.ok && !f.outlier).length;
  const reduce = still || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const blinds = modeFor(run) === "blinds";
  const opening = !!run.span?.adopted;
  const edge = opening ? "opening" : "frame";
  const sl = spanLine(run);
  let html = `<div>
    <p class="fact-label">${opening ? "Opening width" : "Frame width"}</p>
    <p class="numeral"><span id="fw">${reduce ? cm1(run.widthMm) : "0.0"}</span><span class="unit">cm</span></p>
    <p class="fact-sub">${opening ? "Frame measured" : "Measured"} on ${used} frame${used === 1 ? "" : "s"}${spread ? `, within ${spread} of each other` : ""}</p>
  </div>`;
  if (blinds) html += blindFacts(run);
  if (o && !blinds) {
    const cut = o.cutToMm != null && o.cutPerEndMm > 0;
    html += `<div class="fact-block">
      <p class="fact-label">The pole to send</p>
      <p class="fact-main">${esc(optionTitle(o))}</p>
      ${cut ? `<p class="fact-line"><i class="cutmark" aria-hidden="true"></i>${cm1(o.cutPerEndMm)} cm off each end</p>` : `<p class="fact-line"><i class="polemark" aria-hidden="true"></i>No cutting needed</p>`}
      <p class="fact-line">${cm1(o.overhangEachSideMm)} cm past the ${edge} each side</p>
    </div>`;
  }
  // the working: for anyone who wants to check it, out of the way for everyone else
  const more = [];
  if (sl) more.push(`<p>${sl}</p>`);
  const thumbs = frameThumbs(run, id, isLive);
  if (thumbs) more.push(`<div><p>Each frame's reading</p>${thumbs}</div>`);
  if (o && !blinds && (o.twoPiece || o.brackets)) more.push(`<p>${o.twoPiece ? "The pole comes in two pieces with a centre joint. " : ""}${o.brackets ? `${o.brackets} brackets. ` : ""}Plus a 9 cm finial each end.</p>`);
  if (alt && !blinds) {
    const note = (alt.note || "").split(";").slice(1).join(";").trim();
    more.push(`<p>Also fits: <b>${esc(optionTitle(alt))}</b>${alt.cutToMm != null && alt.cutPerEndMm > 0 ? `, ${cm1(alt.cutPerEndMm)} cm off each end` : ""}, ${cm1(alt.overhangEachSideMm)} cm past the ${edge} each side.${note ? " " + esc(cap(note)) + "." : ""}</p>`);
  }
  if (run.handSpan) more.push(`<p>${esc(handsLine(run.handSpan, edge))}</p>`);
  if (more.length)
    html += `<details class="more-facts"><summary>How it got ${cm1(run.widthMm)} cm</summary><div class="more-in">${more.join("")}</div></details>`;
  el.innerHTML = html;
}

function renderReply(run, id, changed) {
  const ta = $("replyText");
  const sendBtn = $("sendBtn");
  const poleBtn = $("poleBtn");
  const blinds = modeFor(run) === "blinds";
  const draft = blinds ? run.blinds?.draft : run.draft;
  if (changed || state.live.has(id)) {
    if (run.ok) {
      $("replyLabel").textContent = "Draft reply, in your words";
      $("replySub").textContent = blinds
        ? "Muse Spark drafted this from the measuring code's numbers and the example blind catalogue. Change anything you like before it goes."
        : "Muse Spark drafted this from the measuring code's numbers. Change anything you like before it goes.";
      ta.value = draft?.reply || "";
      ta.placeholder = draft
        ? ""
        : !blinds && hasBlinds(run)
          ? "This run was sized for the roller blind, so there's no pole draft. Write your reply here, or run it live again with Curtain pole picked."
          : "No draft for this one yet. Write your reply here.";
    } else {
      $("replyLabel").textContent = "Ask for a re-film";
      $("replySub").textContent = "There's no size to send yet, so this asks them to film it again.";
      ta.value = refilmDraft(run.reason, id === YOURS && mine.ranKind === "photos");
    }
    $("sendStatus").textContent = "";
    $("sendStatus").className = "send-status";
    requestAnimationFrame(() => fitText(ta));
    sendBtn.disabled = false;
    sendBtn.textContent = "Approve and send";
    sendBtn.classList.remove("sent");
  }
  // follow-up questions the drafter suggests
  const qs = run.ok ? draft?.questions || [] : [];
  const box = $("replyQs");
  if (qs.length) {
    box.hidden = false;
    box.innerHTML =
      `<p>Muse Spark suggests asking:</p>` +
      qs
        .map(
          (q, i) =>
            `<div class="reply-q"><span>${esc(/[?.]$/.test(q) ? q : q + "?")}</span><button type="button" class="link-btn" data-q="${i}">Add to reply</button></div>`,
        )
        .join("");
    box.querySelectorAll("button[data-q]").forEach((b) =>
      b.addEventListener("click", () => {
        const q = qs[+b.dataset.q];
        const line = /[?.]$/.test(q) ? q : q + "?";
        const v = ta.value;
        const at = v.lastIndexOf("\nBest wishes");
        ta.value = at >= 0 ? v.slice(0, at) + "\n" + line + v.slice(at) : v + "\n" + line;
        b.disabled = true;
        b.textContent = "Added";
      }),
    );
  } else {
    box.hidden = true;
    box.innerHTML = "";
  }
  // The live painter works from a recorded clip's files, so it's there for the clips, not for a visitor's own window.
  const entry = state.samples.find((s) => s.id === id);
  poleBtn.hidden = !run.ok || id === YOURS || blinds;
  poleBtn.disabled = false;
  poleBtn.textContent = entry?.pole ? "Paint the pole again, live" : "Show the pole on this window";
  const pole = state.poles.get(id);
  if (pole && run.ok && !blinds) showPole(pole);
  else hidePole();
}

function renderRunBar(id) {
  const live = state.live.has(id);
  const run = currentRun();
  const lab = $("runLabel");
  lab.classList.toggle("live", live);
  const yours = id === YOURS;
  lab.classList.toggle("live", live || yours);
  $("runLabelText").textContent = yours
    ? "Your clip, measured just now"
    : live
      ? "Live run, just now"
      : `Recorded run, ${dateGB(run?.recordedAt) || "earlier"}`;
  $("liveBtn").hidden = yours;
  $("againBtn").hidden = !yours;
  const busy = state.running === id;
  $("liveBtn").disabled = !!state.running;
  $("liveBtn").textContent = busy ? "Running" : "Run it live";
  if (!busy && !$("runStatus").classList.contains("err")) setRunStatus("");
  if (state.running && state.running !== id) setRunStatus("");
  const ms = run?.timingsMs?.totalMs;
  const models = modelList(run?.models);
  $("heroCap").textContent =
    run && ms
      ? `${(ms / 1000).toFixed(1)} seconds end to end${models.length ? `, using ${listAnd(models)}` : ""}.`
      : "";
}

async function loadHero(run, id) {
  const loading = $("heroLoading");
  loading.hidden = false;
  loading.textContent = "Loading the clip";
  const url = state.liveImg.get(id) || `samples/${id}/hero.jpg`;
  try {
    const ok = await hero.load(run, url);
    if (!ok || state.current !== id) return;
    loading.hidden = true;
    $("heroCanvas").setAttribute("aria-label", heroLabel(run));
    hero.play();
  } catch {
    if (state.current !== id) return;
    loading.hidden = false;
    loading.textContent = "I couldn't load the photo for this clip.";
  }
}

function heroLabel(run) {
  if (!run.ok) return `Photo from the clip. ${fixFor(run.reason).fix}`;
  const o = run.options?.[0];
  const edge = run.span?.adopted ? "opening" : "frame";
  if (modeFor(run) === "blinds") {
    const b = run.blinds.options[0];
    return (
      `Front elevation drawn from the clip. The ${edge} is ${cm1(run.widthMm)} cm wide. ` +
      `A ${cm1(b.widthMm)} cm roller blind, ${b.fit}, centred on the ${edge}` +
      (b.dropMm ? `, with a ${cmClean(b.dropMm)} cm drop.` : `. The drop isn't in the clip, so I'd ask them to measure the height.`)
    );
  }
  return (
    `Front elevation drawn from the clip. The ${edge} is ${cm1(run.widthMm)} cm wide.` +
    (o ? ` ${optionTitle(o)}, centred 10 cm above the window, ${cm1(o.overhangEachSideMm)} cm past the ${edge} each side.` : "")
  );
}

$("replayBtn").addEventListener("click", () => {
  setSam(false, true);
  hero.play();
});

// ---------- what SAM saw ----------
function setSam(on, quiet = false) {
  const b = $("samBtn");
  b.setAttribute("aria-pressed", String(on));
  b.textContent = on ? "Back to the drawing" : "What SAM saw";
  if (quiet) return;
  hero.showSam(on);
  const run = currentRun();
  $("heroCanvas").setAttribute(
    "aria-label",
    on ? "The photo with the sheet and window outlines SAM 3.1 returned for this frame." : run ? heroLabel(run) : "",
  );
  if (!on) revealCompare();
}
$("samBtn").addEventListener("click", () => setSam($("samBtn").getAttribute("aria-pressed") !== "true"));

// ---------- before and after: the painted pole ----------
function setupCompare(id, run) {
  const el = $("compare");
  el.classList.remove("shown");
  el.hidden = true;
  const entry = state.samples.find((s) => s.id === id);
  if (!entry?.pole || !run?.ok || modeFor(run) === "blinds") {
    state.compareFor = null;
    return;
  }
  state.compareFor = id;
  $("cmpBefore").src = `samples/${id}/hero.jpg`;
  $("cmpPole").src = `samples/${id}/${entry.pole}`;
  setCmp(50);
}
function setCmp(v) {
  v = Math.max(0, Math.min(100, v));
  $("compareFrame").style.setProperty("--pos", v + "%");
  $("cmpRange").value = String(Math.round(v));
}
function revealCompare() {
  const el = $("compare");
  if (state.compareFor !== state.current || !el.hidden) return;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("shown"));
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // slide the divider in from the right once, so it's plain the photo can be dragged
  const t0 = performance.now();
  const id = state.current;
  const step = (now) => {
    if (state.current !== id || cmpDragging) return;
    const k = Math.min(1, (now - t0) / 1100);
    setCmp(94 - 44 * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  setCmp(94);
  setTimeout(() => requestAnimationFrame(step), 250);
}
let cmpDragging = false;
{
  const frame = $("compareFrame");
  const at = (e) => {
    const r = frame.getBoundingClientRect();
    setCmp(((e.clientX - r.left) / r.width) * 100);
  };
  frame.addEventListener("pointerdown", (e) => {
    cmpDragging = true;
    frame.setPointerCapture(e.pointerId);
    at(e);
    e.preventDefault();
  });
  frame.addEventListener("pointermove", (e) => {
    if (cmpDragging) at(e);
  });
  const stop = () => (cmpDragging = false);
  frame.addEventListener("pointerup", stop);
  frame.addEventListener("pointercancel", stop);
  $("cmpRange").addEventListener("input", (e) => setCmp(+e.target.value));
}

// ---------- run it live ----------
function setRunStatus(text, kind = "") {
  const el = $("runStatus");
  el.className = "run-status" + (kind === "err" ? " err" : "");
  if (!text) {
    el.textContent = "";
    return;
  }
  el.innerHTML = (kind === "busy" ? `<span class="spin" aria-hidden="true"></span>` : "") + `<span>${esc(text)}</span>`;
}

const STEPS = [
  [0, "Uploading the clip"],
  [3, "SAM 3.1 is finding the sheet, the window and your hands"],
  [16, "Working out millimetres"],
  [20, "Muse Spark is drafting the reply"],
];

$("liveBtn").addEventListener("click", async () => {
  const id = state.current;
  if (!id || state.running) return;
  state.running = id;
  renderRunBar(id);
  const t0 = performance.now();
  const tick = () => {
    if (state.current !== id) return;
    const s = (performance.now() - t0) / 1000;
    const step = [...STEPS].reverse().find(([at]) => s >= at)[1];
    setRunStatus(`${step}. ${Math.floor(s)} s`, "busy");
  };
  tick();
  const timer = setInterval(tick, 500);
  try {
    const data = await post("/api/run", { sample: id, seller: state.seller });
    const run = data.run || data;
    if (!run || typeof run !== "object" || !("ok" in run)) throw new ApiError("The live run came back without a result.");
    run.id = run.id || id;
    run.title = run.title || state.runs.get(id)?.title;
    const img = data.heroImage || data.hero || run.heroImage;
    if (typeof img === "string" && img.startsWith("data:")) state.liveImg.set(id, img);
    else {
      // keep the recorded photo, and use the matching frame's geometry if the live run has it
      const rec = state.runs.get(id);
      if (rec && (run.frames || []).some((f) => f.index === rec.heroIndex)) run.heroIndex = rec.heroIndex;
    }
    state.live.set(id, run);
    clearInterval(timer);
    state.running = null;
    renderList();
    if (state.current === id) {
      setRunStatus(`Done in ${Math.round((performance.now() - t0) / 1000)} seconds.`);
      await select(id);
    }
  } catch (err) {
    clearInterval(timer);
    state.running = null;
    renderRunBar(state.current);
    if (state.current === id) setRunStatus(err instanceof ApiError ? err.message : "The live run failed: " + err.message, "err");
  }
  renderRunBar(state.current);
});

// ---------- send ----------
$("sendBtn").addEventListener("click", async () => {
  const id = state.current;
  const reply = $("replyText").value.trim();
  const st = $("sendStatus");
  if (!reply) {
    st.className = "send-status err";
    st.textContent = "The reply is empty. Write something first.";
    $("replyText").focus();
    return;
  }
  const btn = $("sendBtn");
  btn.disabled = true;
  btn.textContent = "Sending";
  st.className = "send-status";
  st.textContent = "";
  try {
    const data = await post("/api/send", { sample: id, reply });
    btn.textContent = "Sent";
    btn.classList.add("sent");
    st.className = "send-status ok";
    const to = data.to ? `Sent to ${data.to}` : "Sent";
    st.textContent = data.channel ? `${to} by ${data.channel}.` : `${to}.`;
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Approve and send";
    st.className = "send-status err";
    st.textContent = err.message;
  }
});

// ---------- the pole on this window ----------
function hidePole() {
  $("poleView").hidden = true;
  document.querySelector(".reply").classList.remove("has-pole");
}
function showPole({ src, cap: caption, wait, err }) {
  const view = $("poleView");
  const frame = $("poleFrame");
  view.hidden = false;
  document.querySelector(".reply").classList.add("has-pole");
  if (wait || err) {
    frame.innerHTML = `<div class="pole-wait${err ? " err" : ""}" role="status">${wait ? `<span class="spin" aria-hidden="true" style="width:18px;height:18px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--moss);animation:spin .9s linear infinite"></span>` : ""}<span>${esc(wait || err)}</span></div>`;
    $("poleCap").textContent = "";
    return;
  }
  frame.innerHTML = `<img src="${esc(src)}" alt="The buyer's window with the recommended pole painted in.">`;
  $("poleCap").textContent = caption || "";
}

$("poleBtn").addEventListener("click", async () => {
  const id = state.current;
  const run = currentRun();
  if (!run?.ok) return;
  const btn = $("poleBtn");
  const o = run.options?.[0];
  const what = o ? optionTitle(o) : "The pole";
  // The recorded painting is already under the drawing; this button always asks Muse Image for a fresh one.
  btn.disabled = true;
  showPole({ wait: "Muse Image is painting the pole, about 20 seconds" });
  try {
    const data = await post("/api/render", { sample: id });
    if (!data.image) throw new ApiError("The painter came back without a picture.");
    const secs = data.ms ? ` in ${Math.round(data.ms / 1000)} seconds` : "";
    const p = {
      src: data.image,
      cap: data.usedEdit
        ? `${what}, painted live by Muse Image${secs}. SAM 3.1 cut the pole out so nothing else in the photo changed.`
        : `${what}, drawn onto the photo from the measurements${secs}.`,
    };
    state.poles.set(id, p);
    if (state.current === id) showPole(p);
  } catch (err) {
    if (state.current === id) showPole({ err: err.message });
  } finally {
    btn.disabled = false;
  }
});

// ---------- your window ----------
const mb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const isVideo = (f) => f.type.startsWith("video/") || /\.(mov|mp4|m4v|webm|3gp|mkv|avi)$/i.test(f.name);
const isImage = (f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|avif)$/i.test(f.name);

function showTry() {
  $("main").classList.add("trying");
  $("tryPanel").hidden = false;
  renderTry();
}
function hideTry() {
  $("main").classList.remove("trying");
  $("tryPanel").hidden = true;
}

function renderMine() {
  const st = $("mineStatus"), thumb = $("mineThumb");
  const run = state.runs.get(YOURS);
  st.className = "clip-status";
  if (mine.busy) {
    st.textContent = `Measuring, ${Math.floor((performance.now() - mine.t0) / 1000)} s`;
  } else if (run) {
    const l = statusLine(run);
    st.textContent = l.text;
    st.classList.add(l.bad ? "bad" : "ok");
  } else {
    st.textContent = "Try it on your own window";
  }
  const img = run && (run.thumbs?.[run.heroIndex] || run.heroImage);
  thumb.classList.toggle("has-img", !!img);
  thumb.style.backgroundImage = img ? `url("${img}")` : "";
}

function renderTry() {
  const busy = mine.busy;
  for (const id of ["tryFile", "tryCam", "tryPaper"]) $(id).disabled = busy;
  $("tryDrop").querySelectorAll(".btn").forEach((b) => b.classList.toggle("is-disabled", busy));
  $("tryGo").disabled = busy || !mine.files.length;
  renderSeller(state.current === YOURS ? state.runs.get(YOURS) : currentRun());
  $("tryGo").textContent = busy ? "Measuring" : "Measure my window";
  const ch = $("tryChosen");
  if (!ch.classList.contains("err")) {
    if (!mine.files.length) {
      ch.className = "try-chosen";
      ch.textContent = "No clip chosen yet. You can drop one here too.";
    } else {
      ch.className = "try-chosen picked";
      ch.textContent = mine.chosenText;
    }
  }
}

function choose(list) {
  const files = [...(list || [])];
  if (!files.length) return;
  const ch = $("tryChosen");
  ch.className = "try-chosen";
  const vid = files.find(isVideo);
  const imgs = files.filter(isImage);
  if (vid) {
    mine.files = [vid];
    mine.kind = "video";
    mine.chosenText = `${vid.name}, ${mb(vid.size)}` + (files.length > 1 ? ". I'll use this video and leave the rest." : "");
  } else if (imgs.length) {
    mine.files = imgs.slice(0, MAX_PHOTO_COUNT);
    mine.kind = "photos";
    const n = mine.files.length;
    mine.chosenText =
      `${n} photo${n === 1 ? "" : "s"}` +
      (imgs.length > MAX_PHOTO_COUNT ? `. I'll use the first ${MAX_PHOTO_COUNT}.` : n === 1 ? ". Two or three from slightly different spots work better." : "");
  } else {
    mine.files = [];
    mine.kind = null;
    ch.className = "try-chosen err";
    ch.textContent = "That doesn't look like a video or a photo. Pick a clip from your phone, or 2 or 3 photos.";
  }
  setTryStatus("");
  renderTry();
}

for (const id of ["tryFile", "tryCam"]) {
  $(id).addEventListener("change", (e) => {
    choose(e.target.files);
    e.target.value = "";
  });
}
{
  const drop = $("tryDrop");
  drop.addEventListener("dragover", (e) => {
    if (mine.busy) return;
    e.preventDefault();
    drop.classList.add("drag");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    if (!mine.busy) choose(e.dataTransfer?.files);
  });
}

function setTryStatus(text, kind = "") {
  const el = $("tryStatus");
  el.className = "run-status" + (kind === "err" ? " err" : "");
  if (!text) {
    el.textContent = "";
    return;
  }
  el.innerHTML = (kind === "busy" ? `<span class="spin" aria-hidden="true"></span>` : "") + `<span>${esc(text)}</span>`;
}

function uploadSteps(withSound) {
  return [
    [0, "Sending the frames"],
    [2, withSound ? "SAM 3.1 is finding the sheet and the window, and Muse Voice Transcribe is listening" : "SAM 3.1 is finding the sheet and the window"],
    [9, "Working out millimetres"],
    [12, state.seller === "blinds" ? "Muse Spark is picking which edges to size the blind from" : "Muse Spark is picking which edges the pole spans"],
    [27, "Muse Spark is drafting the reply"],
    [62, "Nearly there"],
  ];
}

function tickMine() {
  if (!mine.busy) return;
  const s = Math.floor((performance.now() - mine.t0) / 1000);
  let text = mine.phase;
  if (mine.sentAt) {
    const since = (performance.now() - mine.sentAt) / 1000;
    text = [...mine.steps].reverse().find(([at]) => since >= at)[1];
  }
  setTryStatus(`${text}. ${s} s`, "busy");
  renderMine();
}

async function postForm(path, fd) {
  let res;
  try {
    res = await fetch(path, { method: "POST", body: fd });
  } catch {
    throw new ApiError(SERVER_NEEDED);
  }
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  if (res.status === 413) throw new ApiError("The clip was too big to send. Try a shorter clip, or 2 or 3 photos.");
  if ([404, 405, 501].includes(res.status) && !(data && data.error)) throw new ApiError(SERVER_NEEDED);
  if (!res.ok || (data && data.error)) {
    let msg = (data && (data.error || data.message)) || "";
    if (typeof msg !== "string") msg = JSON.stringify(msg);
    if (!msg && res.status === 429) msg = "Too many live runs just now. Give it a minute and try again.";
    if (!msg) msg = `The server said ${res.status} ${res.statusText}`.trim();
    throw new ApiError(msg);
  }
  if (data === null) throw new ApiError("The server sent something I couldn't read.");
  return data;
}

function showSentFrames(blobs) {
  mine.frameUrls.forEach((u) => URL.revokeObjectURL(u));
  mine.frameUrls = blobs.map((b) => URL.createObjectURL(b));
  const ul = $("tryFrames");
  ul.innerHTML = mine.frameUrls.map((u) => `<li><img src="${u}" alt=""></li>`).join("");
  ul.hidden = false;
}

async function measureMine() {
  if (mine.busy || !mine.files.length) return;
  const kind = mine.kind;
  const files = mine.files;
  mine.busy = true;
  mine.t0 = performance.now();
  mine.sentAt = 0;
  mine.phase = kind === "video" ? "Picking the sharpest frames" : "Reading your photos";
  $("tryFrames").hidden = true;
  renderTry();
  tickMine();
  const timer = setInterval(tickMine, 500);
  try {
    let canvases;
    let audioP = Promise.resolve(null);
    if (kind === "video") {
      audioP = audioWav(files[0]);
      ({ canvases } = await videoFrames(files[0], (k, n) => {
        mine.phase = `Picking the sharpest frames, ${k} of ${n} looked at`;
      }));
    } else {
      canvases = await photoFrames(files);
    }
    mine.phase = "Getting the frames ready";
    const wav = await audioP;
    const { blobs, total } = await encodeFrames(canvases, wav ? wav.size : 0);
    showSentFrames(blobs);
    const fd = new FormData();
    blobs.forEach((b, i) => fd.append("frame", b, `frame${i}.jpg`));
    if (wav) fd.append("audio", wav, "audio.wav");
    fd.append("paper", $("tryPaper").value);
    fd.append("kind", kind);
    fd.append("seller", state.seller);
    mine.steps = uploadSteps(!!wav);
    mine.steps[0][1] = `Sending ${blobs.length} frame${blobs.length === 1 ? "" : "s"}${wav ? " and the sound" : ""}, ${mb(total)}`;
    mine.sentAt = performance.now();
    tickMine();
    const data = await postForm("/api/upload", fd);
    const run = data.run || data;
    if (!run || typeof run !== "object" || !("ok" in run)) throw new ApiError("The run came back without a result.");
    run.id = YOURS;
    run.title = run.title || "Your window";
    if (mine.previewUrl) URL.revokeObjectURL(mine.previewUrl);
    mine.previewUrl = kind === "video" ? URL.createObjectURL(files[0]) : null;
    mine.count = kind === "photos" ? files.length : 1;
    mine.ranKind = kind;
    state.runs.set(YOURS, run);
    if (typeof run.heroImage === "string" && run.heroImage.startsWith("data:")) state.liveImg.set(YOURS, run.heroImage);
    else state.liveImg.delete(YOURS);
    state.poles.delete(YOURS);
    const secs = Math.round((performance.now() - mine.t0) / 1000);
    clearInterval(timer);
    mine.busy = false;
    mine.formOpen = false;
    mine.sentAt = 0;
    setTryStatus(`Done in ${secs} seconds.`);
    renderMine();
    renderTry();
    if (state.current === YOURS) {
      state.shown = null;
      await select(YOURS);
      $("main").focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (err) {
    clearInterval(timer);
    mine.busy = false;
    mine.sentAt = 0;
    let msg;
    if (err instanceof DecodeError) {
      msg =
        kind === "video"
          ? "Your browser couldn't open this video. iPhone videos (HEVC) often won't open in Chrome on a computer. Try Safari, export the clip as Most Compatible (H.264), or take 2 or 3 photos instead."
          : "I couldn't open one of those photos. iPhone photos (HEIC) often won't open in Chrome on a computer. Try Safari, or save them as JPEG.";
    } else msg = err instanceof ApiError ? err.message : "Something went wrong: " + err.message;
    setTryStatus(msg, "err");
    renderTry();
    renderMine();
  }
}

$("tryForm").addEventListener("submit", (e) => {
  e.preventDefault();
  measureMine();
});
$("againBtn").addEventListener("click", () => {
  mine.formOpen = true;
  setTryStatus("");
  select(YOURS);
  $("tryTitle").scrollIntoView({ block: "nearest" });
});

// ---------- accuracy: tape against Measure Once ----------
async function loadAccuracy() {
  try {
    const res = await fetch("samples/accuracy.json");
    if (!res.ok) return;
    const data = await res.json();
    const rows = (data.rows || []).filter((r) => r && r.tape_mm != null);
    if (!rows.length) return;
    const top = Math.max(...rows.map((r) => Math.max(r.tape_mm, r.measured_mm || 0)));
    const pct = (mm) => `${((mm / top) * 100).toFixed(2)}%`;
    const name = (w) => {
      const m = String(w).match(/^(.*?)(?: \((.*)\))?$/);
      return `${esc(cap(m[1]))}${m[2] ? `<small>${esc(m[2])}</small>` : ""}`;
    };
    $("accTable").innerHTML = rows
      .map((r) => {
        if (r.measured_mm == null) {
          const why = cap(String(r.note || "").split(";")[0]);
          return `<li><p class="acc-name">${name(r.window)}<small>Tape: ${cm1(r.tape_mm)} cm</small></p>
            <p class="acc-refused">Refused: ${esc(why)}</p><p class="acc-err ok-r">Asked for a re-film</p></li>`;
        }
        const e = r.error_mm != null ? r.error_mm : r.measured_mm - r.tape_mm;
        return `<li><p class="acc-name">${name(r.window)}</p>
          <div class="acc-bars" role="img" aria-label="Tape ${cm1(r.tape_mm)} cm, Measure Once ${cm1(r.measured_mm)} cm">
            <span class="acc-bar t" style="width:${pct(r.tape_mm)}"></span><span class="acc-bar m" style="width:${pct(r.measured_mm)}"></span></div>
          <p class="acc-err">${e > 0 ? "+" : e < 0 ? "\u2212" : ""}${cm1(Math.abs(e))} cm<small>${cm1(r.tape_mm)} by tape${r.recess ? ", recess" : ""}</small></p></li>`;
      })
      .join("");
    $("accKey").hidden = false;
    const plain = rows.filter((r) => r.measured_mm != null && !r.recess);
    if (plain.length) $("statErr").textContent = `${cm1(Math.max(...plain.map((r) => Math.abs(r.measured_mm - r.tape_mm))))} cm`;
    const sm = data.summary;
    if (sm?.refusalsExpected) $("statRefuse").textContent = `${sm.refusedCorrectly} of ${sm.refusalsExpected}`;
  } catch {
    /* the section keeps its heading */
  }
}

// the intro's buttons: watch a recorded run, or try your own
$("watchBtn").addEventListener("click", (e) => {
  e.preventDefault();
  const first = state.samples[0]?.id;
  $("desk").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  if (!first) return;
  if (state.current === first) {
    setSam(false, true);
    hero.play();
  } else select(first);
});
document.querySelectorAll("[data-yours]").forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    $("desk").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    select(YOURS);
  }),
);

// ---------- boot ----------
async function boot() {
  try {
    const res = await fetch("samples/index.json");
    if (!res.ok) throw new Error(String(res.status));
    const idx = await res.json();
    state.samples = (idx.samples || idx || []).filter((s) => s && s.id);
  } catch {
    $("clipList").innerHTML = `<li class="clip-empty">I couldn't load the clips. Check samples/index.json.</li>`;
    showPaneError("I couldn't load the list of clips, so there's nothing to show yet.");
    $("heroLoading").textContent = "No clip selected";
    return;
  }
  renderList();
  renderMine();
  if (!state.samples.length) {
    $("heroLoading").textContent = "No clip selected";
    return;
  }
  await Promise.all(
    state.samples.map(async (s) => {
      try {
        const r = await fetch(`samples/${s.id}/run.json`);
        if (!r.ok) throw new Error(String(r.status));
        const run = await r.json();
        state.runs.set(s.id, run);
      } catch {
        /* shown as couldn't load */
      }
    }),
  );
  state.current = state.samples[0].id;
  renderList();
  select(state.samples[0].id);
  loadAccuracy();
}
boot();

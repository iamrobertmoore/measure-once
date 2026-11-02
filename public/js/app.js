import { Hero } from "./hero.js";

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
};

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
    short: "sheet curled",
    fix: "The sheet isn't flat or is partly out of shot. Tape all four corners flat and keep the whole sheet in view.",
    problem: "the sheet of A4 isn't lying flat or is partly out of shot",
    ask: "tape all four corners of the sheet flat to the wall beside the window, keep the whole sheet in view,",
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

function refilmDraft(reason) {
  const f = fixFor(reason);
  return (
    `Thanks for the video. I couldn't get a measurement I'd trust from this one, as ${f.problem}.\n` +
    `Could you ${f.ask} and film it again for about 10 seconds? Then I can tell you exactly which pole to order and where to cut it.\n` +
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
});
window.__hero = hero; // handy for poking at the animation from the console

function currentRun() {
  const id = state.current;
  return id ? state.live.get(id) || state.runs.get(id) : null;
}

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
        <span><span class="clip-name">${esc(run?.title || s.title)}</span>
        <span class="clip-status${st.bad ? " bad" : ""}">${esc(st.text)}</span></span>
      </button></li>`;
    })
    .join("");
}

$("clipList").addEventListener("click", (e) => {
  const b = e.target.closest(".clip-item");
  if (b) select(b.dataset.id, { focusMain: false });
});
$("clipList").addEventListener("keydown", (e) => {
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
  const run = currentRun();
  if (!run) {
    showPaneError("I couldn't load this clip. Check that its run.json is in samples/" + id + ".");
    return;
  }
  hidePaneError();
  renderAsk(run, id, changed);
  renderFacts(run, id);
  renderReply(run, id, changed);
  renderRunBar(id);
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
  $("clipTitle").textContent = run.title || id;
  const full = cap((run.transcript || "").trim());
  const tEl = $("transcript"), more = $("moreBtn");
  if (!full) {
    tEl.textContent = "They didn't say anything in the clip.";
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
    v.poster = `samples/${id}/hero.jpg`;
    v.src = `samples/${id}/preview.mp4`;
    $("videoCap").textContent = "The buyer's clip";
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
  if (isFinite(d) && d > 0) $("videoCap").textContent = `The buyer's clip, ${Math.round(d)} seconds`;
});
$("preview").addEventListener("error", () => {
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
      const src = isLive ? "" : `samples/${id}/f${f.index}.jpg`;
      const img = src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : "";
      return `<li class="${cls}" title="Frame ${f.index}">${img}${esc(lab)}</li>`;
    })
    .join("");
  const extra = frames.length > max ? `<li class="more">+${frames.length - max} more</li>` : "";
  return frames.length ? `<ul class="frames" aria-label="Frames the code read">${items}${extra}</ul>` : "";
}

function handsLine(hs) {
  const side = (mm, which) => {
    const c = Math.round(mm / 10);
    if (c === 0) return `right at the frame edge on the ${which}`;
    if (c > 0) return `${c} cm past the frame on the ${which}`;
    return `${-c} cm inside the frame on the ${which}`;
  };
  return `You pointed about ${side(hs.leftPastFrameMm, "left")} and ${side(hs.rightPastFrameMm, "right")}.`;
}

function optionTitle(o) {
  return o.cutToMm != null && o.cutPerEndMm > 0
    ? `${o.stockCm} cm pole, cut to ${cmClean(o.cutToMm)} cm`
    : `${o.stockCm} cm pole, used as supplied`;
}

function renderFacts(run, id) {
  const isLive = state.live.has(id);
  const el = $("facts");
  if (!run.ok) {
    const f = fixFor(run.reason);
    const n = (run.frames || []).length;
    el.innerHTML = `<div>
      <p class="fact-label">Couldn't measure this one</p>
      <p class="fail-title">${esc(f.fix)}</p>
      <p class="fact-sub">${n ? `I checked ${n} frames from the clip and none gave a reading I'd trust, so I won't guess a size.` : "I won't guess a size from this clip."}</p>
      ${frameThumbs(run, id, isLive)}
    </div>`;
    return;
  }
  const o = run.options?.[0];
  const alt = run.options?.[1];
  const spread = run.spreadMm != null ? (run.spreadMm < 1 ? "under 1 mm" : `${Math.round(run.spreadMm)} mm`) : null;
  const used = run.framesUsed || (run.frames || []).filter((f) => f.ok && !f.outlier).length;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let html = `<div>
    <p class="fact-label">Frame width</p>
    <p class="numeral"><span id="fw">${reduce ? cm1(run.widthMm) : "0.0"}</span><span class="unit">cm</span></p>
    <p class="fact-sub">Measured on ${used} frame${used === 1 ? "" : "s"}${spread ? `, spread ${spread}` : ""}</p>
    ${frameThumbs(run, id, isLive)}
  </div>`;
  if (o) {
    const cut = o.cutToMm != null && o.cutPerEndMm > 0;
    html += `<div class="fact-block">
      <p class="fact-label">The pole I'd send</p>
      <p class="fact-main">${esc(optionTitle(o))}</p>
      ${cut ? `<p class="fact-line"><i class="cutmark" aria-hidden="true"></i>${cm1(o.cutPerEndMm)} cm off each end</p>` : `<p class="fact-line"><i class="polemark" aria-hidden="true"></i>No cutting needed</p>`}
      <p class="fact-line">${cm1(o.overhangEachSideMm)} cm past the frame each side</p>
      <p class="fact-line muted">${o.twoPiece ? "Comes in two pieces with a centre joint. " : ""}Plus 9 cm finial each end.</p>
    </div>`;
  }
  if (alt) {
    const note = (alt.note || "").split(";").slice(1).join(";").trim();
    html += `<div class="fact-block">
      <p class="fact-label">Also fits</p>
      <p class="fact-alt"><b>${esc(optionTitle(alt))}</b>${alt.cutToMm != null && alt.cutPerEndMm > 0 ? `, ${cm1(alt.cutPerEndMm)} cm off each end` : ""}, ${cm1(alt.overhangEachSideMm)} cm past the frame each side.${note ? " " + esc(cap(note)) + "." : ""}</p>
    </div>`;
  }
  if (run.handSpan) {
    html += `<div class="fact-block">
      <p class="fact-label">Where they pointed</p>
      <p class="fact-hands">${esc(handsLine(run.handSpan))}</p>
    </div>`;
  }
  el.innerHTML = html;
}

function renderReply(run, id, changed) {
  const ta = $("replyText");
  const sendBtn = $("sendBtn");
  const poleBtn = $("poleBtn");
  if (changed || state.live.has(id)) {
    if (run.ok) {
      $("replyLabel").textContent = "Draft reply, in your words";
      $("replySub").textContent = "Muse Spark drafted this from the measuring code's numbers. Change anything you like before it goes.";
      ta.value = run.draft?.reply || "";
      ta.placeholder = run.draft ? "" : "No draft for this one yet. Write your reply here.";
    } else {
      $("replyLabel").textContent = "Ask for a re-film";
      $("replySub").textContent = "There's no size to send yet, so this asks them to film it again.";
      ta.value = refilmDraft(run.reason);
    }
    $("sendStatus").textContent = "";
    $("sendStatus").className = "send-status";
    requestAnimationFrame(() => fitText(ta));
    sendBtn.disabled = false;
    sendBtn.textContent = "Approve and send";
    sendBtn.classList.remove("sent");
  }
  // follow-up questions the drafter suggests
  const qs = run.ok ? run.draft?.questions || [] : [];
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
  poleBtn.hidden = !run.ok;
  poleBtn.disabled = false;
  const pole = state.poles.get(id);
  if (pole && run.ok) showPole(pole);
  else hidePole();
}

function renderRunBar(id) {
  const live = state.live.has(id);
  const run = currentRun();
  const lab = $("runLabel");
  lab.classList.toggle("live", live);
  $("runLabelText").textContent = live ? "Live run, just now" : `Recorded run, ${dateGB(run?.recordedAt) || "earlier"}`;
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
  return (
    `Front elevation drawn from the clip. The frame is ${cm1(run.widthMm)} cm wide.` +
    (o ? ` ${optionTitle(o)}, centred 10 cm above the window, ${cm1(o.overhangEachSideMm)} cm past the frame each side.` : "")
  );
}

$("replayBtn").addEventListener("click", () => hero.play());

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
    const data = await post("/api/run", { sample: id });
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
  if (!state.live.has(id)) {
    // index.json says which samples ship a pre-painted pole.jpg; probe only if it doesn't say
    const entry = state.samples.find((s) => s.id === id) || {};
    const src = `samples/${id}/${entry.pole || "pole.jpg"}`;
    const exists =
      "pole" in entry
        ? !!entry.pole
        : await fetch(src, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
    if (state.current !== id) return;
    if (exists) {
      const p = { src, cap: `${what}, painted by Muse Image. SAM cut the pole out so nothing else in the photo changed.` };
      state.poles.set(id, p);
      showPole(p);
      return;
    }
  }
  btn.disabled = true;
  showPole({ wait: "Muse Image is painting the pole, about 20 seconds" });
  try {
    const data = await post("/api/render", { sample: id });
    if (!data.image) throw new ApiError("The painter came back without a picture.");
    const secs = data.ms ? ` in ${Math.round(data.ms / 1000)} seconds` : "";
    const p = {
      src: data.image,
      cap: data.usedEdit
        ? `${what}, painted by Muse Image${secs}. SAM cut the pole out so nothing else in the photo changed.`
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

// ---------- accuracy table ----------
async function loadAccuracy() {
  try {
    const res = await fetch("samples/accuracy.json");
    if (!res.ok) return;
    const data = await res.json();
    const rows = (data.rows || []).filter((r) => r && r.tape_mm != null && r.measured_mm != null);
    if (!rows.length) return;
    const fmt = (n) => (n == null || isNaN(n) ? "" : Number(n).toFixed(0));
    const err = (r) => (r.error_mm != null ? r.error_mm : r.measured_mm - r.tape_mm);
    $("accTable").innerHTML =
      `<thead><tr><th scope="col">Window</th><th scope="col">Tape (mm)</th><th scope="col">Measured (mm)</th><th scope="col">Off by (mm)</th></tr></thead><tbody>` +
      rows
        .map((r) => {
          const e = err(r);
          return `<tr><td>${esc(cap(r.window))}</td><td>${fmt(r.tape_mm)}</td><td>${fmt(r.measured_mm)}</td><td>${e > 0 ? "+" : e < 0 ? "-" : ""}${fmt(Math.abs(e))}</td></tr>`;
        })
        .join("") +
      `</tbody>`;
    $("accBtn").hidden = false;
    $("accBtn").addEventListener("click", () => $("accDialog").showModal());
  } catch {
    /* no table, no link */
  }
}

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

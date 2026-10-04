// The play editor (editor.html): drag players step by step, set the ball, screens, bubbles and captions,
// check the play with the same rules as npm run build, and save it as a plays/<id>.json file.
// Nothing is kept in the browser: the play lives in this page until it's copied or downloaded.
import { SPOTS, askList, ballKind, checkPlay, dist, endHolder, formatPlay, lintPlay, normalize, resolvePlay } from "./playbook.js";
import { renderCourt } from "./court.js";
import { loadLibrary, saveForOffline } from "./library.js";

const $ = id => document.getElementById(id);
const IDS = ["d1", "d2", "d3", "d4", "d5", "o1", "o2", "o3", "o4", "o5"];  // defenders first, so offense draws on top
const SPOT_ORDER = ["TOP", "RW", "LW", "RC", "LC", "RE", "LE", "HP", "RB", "LB", "RS", "LS"];
const name = id => (id[0] === "d" ? "X" : "") + id.slice(1);
const kebab = s => normalize(s).replace(/ /g, "-");
const xy = v => typeof v === "string" ? SPOTS[v] : v;

let play, fileId = "", idTouched = false, sel = 0, dirty = false;
let R = null;          // the play resolved for drawing: a cleaned-up copy, so half-finished edits still draw
let handles = [];      // curve handles on the court: { id, at, curved }
let drag = null;       // what the pointer is dragging: { type: "move" | "curve", id, moved }
let lastTap = null;    // the last handle pressed, to spot a double tap: { id, t }
let previewP = null, previewing = false, lastT = 0;

const template = () => ({
  name: "My play", emoji: "🏀", level: 1, tags: [], idea: "", why: "", tryit: "",
  cast: ["d1", "d2", "o1", "o2"],
  frames: [
    { pos: { o1: "TOP", o2: "RW" }, ball: "o1", say: "{1} has the ball at the top." },
    { ball: { pass: ["o1", "o2"] }, say: "{1} passes to {2}." }
  ]
});

/* Small DOM builder: h("button", { class: "btn", onclick }, "Text") */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === undefined || v === false) return;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  });
  kids.flat().forEach(c => { if (c !== null && c !== undefined) el.append(c); });
  return el;
}
const options = (ids, cur, extra = []) => [...extra, ...ids.map(id => [id, name(id)])].map(([v, t]) => h("option", { value: v, selected: v === cur }, t));

/* ---------- The play as a file ---------- */

/* What gets saved: no empty pos, bub or scr, no empty tags, and no "side" for an offense play */
function cleaned() {
  const p = structuredClone(play);
  if (!p.tags || !p.tags.length) delete p.tags;
  if (p.side !== "defense") delete p.side;
  p.frames.forEach(fr => {
    ["pos", "bub"].forEach(k => { if (fr[k] && !Object.keys(fr[k]).length) delete fr[k]; });
    if (fr.scr && !fr.scr.length) delete fr.scr;
  });
  return p;
}

/* ---------- Drawing ---------- */

const okPoint = v => typeof v === "string" ? !!SPOTS[v] : Array.isArray(v) && (v.length === 2 || v.length === 4) && v.every(Number.isFinite);
/* A ball that can be drawn: anything broken or unfinished becomes a plain hold, so the court still shows */
function safeBall(b, d, j) {
  const inCast = id => d.cast.includes(id), off = id => inCast(id) && id[0] === "o";
  const fallback = d.cast.find(id => id[0] === "o") || d.cast[0];
  let kind = null;
  try { kind = b === undefined || b === null ? null : ballKind(b); } catch { /* not a ball */ }
  if (j === 0 && kind !== "hold" && kind !== "dribble") return fallback;
  if (kind === "hold") return off(b) ? b : fallback;
  if (kind === "dribble") return !off(b.dribble) ? fallback : j === 0 && b.cross ? { dribble: b.dribble } : b;
  if (kind === "fake") return off(b.fake) ? b : fallback;
  if (kind === "pass" || kind === "handoff") return Array.isArray(b[kind]) && b[kind].length === 2 && b[kind].every(off) && b[kind][0] !== b[kind][1] ? b : fallback;
  if (kind === "shot") {
    if (!off(b.shot)) return fallback;
    const nb = d.frames[j + 1] && d.frames[j + 1].ball, rebound = !!nb && typeof nb === "object" && inCast(nb.rebound);
    return b.miss && !rebound ? { shot: b.shot } : b;
  }
  if (kind === "rebound") {
    if (!inCast(b.rebound)) return fallback;
    const pb = d.frames[j - 1].ball;
    return typeof pb === "object" && pb.miss ? b : b.rebound;
  }
  return fallback;
}
function drawable() {
  const d = structuredClone(play);
  d.cast = IDS.filter(id => d.cast.includes(id));
  if (!d.cast.some(id => id[0] === "o")) d.cast.push("o1");
  const inCast = id => d.cast.includes(id);
  d.frames.forEach((fr, j) => {
    fr.pos = Object.fromEntries(Object.entries(fr.pos || {}).filter(([id, v]) => inCast(id) && okPoint(v)));
    if (j === 0) d.cast.forEach((id, i) => {
      if (fr.pos[id]) return;
      if (id[0] === "o") fr.pos[id] = SPOT_ORDER[i % SPOT_ORDER.length];
      else if (!inCast("o" + id[1])) fr.pos[id] = [250, 200];
    });
    fr.scr = (fr.scr || []).filter(s => Array.isArray(s) && s.length === 2 && s.every(inCast) && s[0] !== s[1]);
    fr.bub = Object.fromEntries(Object.entries(fr.bub || {}).filter(([id, t]) => inCast(id) && typeof t === "string" && t));
    fr.say = typeof fr.say === "string" ? fr.say : "";
    fr.ball = safeBall(fr.ball, d, j);
  });
  return resolvePlay(d, "draft");
}

function draw() {
  const box = $("edCourt");
  try { R = drawable(); } catch { R = null; }
  if (!R) { box.innerHTML = '<p class="ed-broken">This play can’t be drawn yet. Check the list of problems.</p>'; return; }
  handles = [];
  if (previewP === null && sel > 0) {
    const pos = play.frames[sel].pos || {};
    R.cast.forEach(id => {
      const a = R.res[sel - 1][id], b = R.res[sel][id];
      if (!pos[id] || dist(a, b) < 3) return;
      const c = R.ctrl[sel][id];
      handles.push({ id, at: c || [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], curved: !!c });
    });
  }
  const hs = handles.map(k => `<rect class="hdl${k.curved ? " on" : ""}" x="-6" y="-6" width="12" height="12" transform="translate(${k.at[0].toFixed(1)} ${k.at[1].toFixed(1)}) rotate(45)"/>`).join("");
  const p = previewP ?? sel;
  box.innerHTML = renderCourt(R, p, { label: p === sel ? (sel ? `Step ${sel}` : "Start") : "Preview" }).replace("</svg>", `<g class="hdls">${hs}</g></svg>`);
  $("scrub").max = String(play.frames.length - 1);
  if (!previewing) $("scrub").value = String(p);
}

/* ---------- Dragging players and curve handles ---------- */

function svgPoint(e) {
  const svg = $("edCourt").querySelector("svg"), m = svg && svg.getScreenCTM();
  if (!m) return null;
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return [pt.x, pt.y];
}
/* Round, keep on (or just off) the court, and snap to a named spot when close to one */
function placeAt(q) {
  const v = [Math.round(Math.max(-40, Math.min(540, q[0]))), Math.round(Math.max(-40, Math.min(470, q[1])))];
  const spot = Object.keys(SPOTS).find(s => dist(v, SPOTS[s]) < 9);
  return spot || v;
}
function moveTo(id, q) {
  const fr = play.frames[sel], old = (fr.pos || {})[id];
  fr.pos = fr.pos || {};
  let v = placeAt(q);
  if (sel > 0 && dist(xy(v), R.res[sel - 1][id]) < 4) { delete fr.pos[id]; return; }  // dragged back: no move this step
  if (Array.isArray(old) && old.length === 4) v = [...xy(v), old[2], old[3]];
  fr.pos[id] = v;
}
function bendTo(id, q) {
  const end = R.res[sel][id];
  play.frames[sel].pos[id] = [end[0], end[1], Math.round(q[0]), Math.round(q[1])];
}
function straighten(id) {
  const v = play.frames[sel].pos[id];
  if (Array.isArray(v) && v.length === 4) play.frames[sel].pos[id] = v.slice(0, 2);
}
function hitTest(q) {
  const k = handles.find(k => dist(q, k.at) < 14);
  if (k) return { type: "curve", id: k.id };
  let best = "", bd = 22;
  R.cast.forEach(id => { const d = dist(q, R.res[sel][id]); if (d < bd) { bd = d; best = id; } });
  return best ? { type: "move", id: best } : null;
}
const court = $("edCourt");
court.addEventListener("pointerdown", e => {
  if (!R) return;
  if (previewP !== null) { stopPreview(); previewP = null; draw(); return; }
  const q = svgPoint(e); if (!q) return;
  drag = hitTest(q);
  if (!drag) return;
  e.preventDefault();
  // Double-tapping a handle straightens the path. The court redraws between taps, so dblclick can't be used.
  if (drag.type === "curve") {
    const now = performance.now();
    if (lastTap && lastTap.id === drag.id && now - lastTap.t < 450) { straighten(drag.id); drag = null; lastTap = null; changed(true); return; }
    lastTap = { id: drag.id, t: now };
  }
  court.setPointerCapture(e.pointerId);
});
court.addEventListener("pointermove", e => {
  if (!drag) {
    const q = R && previewP === null && svgPoint(e), k = q && hitTest(q);
    court.style.cursor = k ? (k.type === "curve" ? "move" : "grab") : "";
    return;
  }
  const q = svgPoint(e); if (!q) return;
  if (drag.type === "move") moveTo(drag.id, q); else bendTo(drag.id, q);
  drag.moved = true; lastTap = null;
  changed(false);
});
const endDrag = () => { if (drag) { const moved = drag.moved; drag = null; if (moved) changed(true); } };
court.addEventListener("pointerup", endDrag);
court.addEventListener("pointercancel", endDrag);

/* ---------- Preview ---------- */

function startPreview() {
  const n = play.frames.length - 1;
  if (previewP === null || previewP >= n) previewP = 0;
  previewing = true; lastT = performance.now();
  $("previewTxt").textContent = "⏸ Pause";
  requestAnimationFrame(stepPreview);
}
function stopPreview() { previewing = false; $("previewTxt").textContent = "▶ Preview"; }
function stepPreview(now) {
  if (!previewing) return;
  const n = play.frames.length - 1;
  previewP = Math.min(n, previewP + (now - lastT) / 1500); lastT = now;
  $("scrub").value = String(previewP);
  draw();
  if (previewP >= n) stopPreview(); else requestAnimationFrame(stepPreview);
}
$("btnPreview").addEventListener("click", () => previewing ? stopPreview() : startPreview());
$("scrub").addEventListener("input", e => { stopPreview(); previewP = +e.target.value; draw(); });

/* ---------- Steps ---------- */

function renderSteps() {
  const n = play.frames.length - 1;
  $("steps").replaceChildren(
    ...play.frames.map((_, j) => h("button", { type: "button", role: "tab", class: "ed-tab", "aria-selected": String(j === sel), onclick: () => selectStep(j) }, j ? String(j) : "Start")),
    h("button", { type: "button", class: "ed-tab ed-add", title: "Add a step after this one", "aria-label": "Add a step after this one", onclick: addStep }, "+ Step")
  );
  $("hint").textContent = sel === 0
    ? "Start: drag each player to where they begin. Defenders you don’t move stand guarding their player."
    : `Step ${sel} of ${n}: drag a player to where they go in this step. Drag a ◆ to bend their path; tap it twice to make it straight again.`;
}
function selectStep(j) { sel = j; stopPreview(); previewP = null; renderSteps(); renderStepForm(); draw(); }
function addStep() {
  let holder = null;
  try { holder = endHolder(play.frames[sel].ball); } catch { /* broken ball */ }
  if (!holder || holder[0] !== "o") holder = play.cast.find(id => id[0] === "o");
  play.frames.splice(sel + 1, 0, { ball: holder, say: "" });
  sel++; changed(true);
}
function deleteStep() {
  if (sel === 0 || play.frames.length <= 2) return;
  play.frames.splice(sel, 1);
  sel = Math.min(sel, play.frames.length - 1); changed(true);
}

/* ---------- This step's form ---------- */

const KINDS = [["hold", "Holds it"], ["dribble", "Dribbles"], ["cross", "Crossover dribble"], ["fake", "Shot fake"], ["pass", "Passes"],
  ["bounce", "Bounce pass"], ["lob", "Lob pass"], ["handoff", "Hands it off"], ["shot", "Shoots and scores"], ["miss", "Shoots and misses"], ["rebound", "Grabs the rebound"]];
function kindOf(b) {
  let k = null;
  try { k = ballKind(b); } catch { return "hold"; }
  if (k === "pass" && b.bounce) return "bounce";
  if (k === "pass" && b.lob) return "lob";
  if (k === "dribble" && b.cross) return "cross";
  if (k === "shot" && b.miss) return "miss";
  return k || "hold";
}
const twoPlayers = k => k === "pass" || k === "bounce" || k === "lob" || k === "handoff";
function ballPlayers(b) {
  if (typeof b === "string") return [b];
  if (!b || typeof b !== "object") return [];
  return b.pass || b.handoff || [b.dribble || b.shot || b.rebound || b.fake];
}
function makeBall(kind, a, b) {
  return { hold: a, dribble: { dribble: a }, cross: { dribble: a, cross: true }, fake: { fake: a }, pass: { pass: [a, b] }, bounce: { pass: [a, b], bounce: true }, lob: { pass: [a, b], lob: true },
    handoff: { handoff: [a, b] }, shot: { shot: a }, miss: { shot: a, miss: true }, rebound: { rebound: a } }[kind];
}

function renderStepForm() {
  const fr = play.frames[sel], form = $("stepForm"), offense = play.cast.filter(id => id[0] === "o");
  const kind = kindOf(fr.ball), [a, b] = ballPlayers(fr.ball);
  const kinds = sel === 0 ? KINDS.slice(0, 2) : KINDS;
  const setBall = (k, x, y) => { fr.ball = makeBall(k, x, y); changed(true); };
  const who = kind === "rebound" ? play.cast : offense;

  const ballRow = h("div", { class: "ed-row" },
    h("label", { class: "ed-field ed-inline" }, h("span", {}, "Ball"),
      h("select", { onchange: e => {
        const k = e.target.value;
        let from = a;
        try { from = sel ? endHolder(play.frames[sel - 1].ball) || a : a; } catch { /* keep a */ }
        if (k === "rebound") from = play.cast.find(id => id[0] === "d") || from;
        else if (!offense.includes(from)) from = offense[0];
        setBall(k, from, offense.find(id => id !== from) || from);
      } }, kinds.map(([v, t]) => h("option", { value: v, selected: v === kind }, t)))),
    h("label", { class: "ed-field ed-inline" }, h("span", {}, twoPlayers(kind) ? "From" : "Player"),
      h("select", { onchange: e => setBall(kind, e.target.value, b) }, options(who, a))),
    twoPlayers(kind) ? h("label", { class: "ed-field ed-inline" }, h("span", {}, "To"),
      h("select", { onchange: e => setBall(kind, a, e.target.value) }, options(offense, b))) : null);

  // One question per step: "ask" (who's open for this pass) or "where" (where does a player on your team run this step)
  const mine = play.cast.filter(id => id[0] === (play.side === "defense" ? "d" : "o"));
  const question = fr.where ? "where:" + fr.where : askList(fr.ask).length ? "ask:" + askList(fr.ask)[0] : "";
  const askRow = sel === 0 ? null : h("label", { class: "ed-field ed-inline" }, h("span", {}, "Question"),
    h("select", { onchange: e => {
      const [kind, id] = e.target.value.split(":");
      delete fr.ask; delete fr.where;
      if (kind) fr[kind] = id;
      changed(false);
    } },
      h("option", { value: "", selected: !question }, "No question"),
      h("optgroup", { label: "Who’s open? (the player the pass goes to)" },
        offense.map(id => h("option", { value: "ask:" + id, selected: question === "ask:" + id }, `${name(id)} is open`))),
      h("optgroup", { label: "Where should … go? (a player who moves this step)" },
        mine.map(id => h("option", { value: "where:" + id, selected: question === "where:" + id }, `Where should ${name(id)} go?`)))));

  const scr = fr.scr || [];
  const scrRows = scr.map((s, i) => h("div", { class: "ed-row" },
    h("select", { "aria-label": "Screener", onchange: e => { s[0] = e.target.value; changed(false); } }, options(play.cast, s[0])),
    h("span", {}, "blocks"),
    h("select", { "aria-label": "Blocked player", onchange: e => { s[1] = e.target.value; changed(false); } }, options(play.cast, s[1])),
    h("button", { type: "button", class: "ed-x", "aria-label": "Remove this screen", onclick: () => { scr.splice(i, 1); changed(true); } }, "✕")));
  const addScr = h("button", { type: "button", class: "linkbtn", onclick: () => {
    const o = offense[0], d = play.cast.find(id => id[0] === "d");
    if (!o || !d) return;
    fr.scr = [...scr, play.side === "defense" ? [d, o] : [o, d]]; changed(true);
  } }, "+ Add a screen or box out");

  const bub = fr.bub || {};
  const bubRows = Object.entries(bub).map(([id, t]) => h("div", { class: "ed-row" },
    h("select", { "aria-label": "Who says it", onchange: e => { const v = e.target.value; if (v !== id && !(v in bub)) { delete bub[id]; bub[v] = t; } changed(true); } }, options(play.cast, id)),
    h("input", { value: t, maxlength: "24", "aria-label": "Bubble text", oninput: e => { bub[id] = e.target.value; changed(false); } }),
    h("button", { type: "button", class: "ed-x", "aria-label": "Remove this bubble", onclick: () => { delete bub[id]; changed(true); } }, "✕")));
  const addBub = h("button", { type: "button", class: "linkbtn", onclick: () => {
    const id = play.cast.find(x => !(x in bub)); if (!id) return;
    fr.bub = { ...bub, [id]: "Open!" }; changed(true);
  } }, "+ Add a speech bubble");

  const moved = Object.keys(fr.pos || {}).filter(id => play.cast.includes(id));
  const moves = sel === 0
    ? h("div", { class: "ed-row" }, h("button", { type: "button", class: "linkbtn", onclick: () => {
        play.cast.forEach(id => { if (id[0] === "d" && play.cast.includes("o" + id[1])) delete fr.pos[id]; }); changed(true);
      } }, "Put defenders back to guarding their player"))
    : h("div", { class: "ed-row ed-moves" }, h("span", {}, moved.length ? "Moving:" : "Nobody moves in this step yet."),
        moved.map(id => h("button", { type: "button", class: `ed-chip ${id[0]}`, title: `${name(id)} stays put instead`, "aria-label": `Stop ${name(id)} moving in this step`, onclick: () => { delete fr.pos[id]; changed(true); } }, name(id), " ✕")));

  const say = h("textarea", { rows: "3", value: fr.say || "", oninput: e => { fr.say = e.target.value; changed(false); } });
  form.replaceChildren(...[
    h("h3", {}, sel === 0 ? "Start" : `Step ${sel}`),
    ballRow, askRow,
    h("label", { class: "ed-field" }, h("span", {}, "Caption"), say,
      h("small", {}, "Type {1} for a blue player, {X1} for a red one, and *word* to highlight a word.")),
    h("h4", {}, "Screens and box outs"), ...scrRows, addScr,
    h("h4", {}, "Speech bubbles"), ...bubRows, addBub,
    h("h4", {}, "Who moves"), moves,
    h("div", { class: "ed-row ed-step-actions" },
      h("button", { type: "button", class: "btn", onclick: addStep }, "Add a step after this"),
      sel > 0 ? h("button", { type: "button", class: "btn", disabled: play.frames.length <= 2, onclick: deleteStep }, "Delete this step") : null)
  ].filter(Boolean));
}

/* ---------- About the play ---------- */

function fillPlayForm() {
  $("fName").value = play.name || ""; $("fId").value = fileId; $("fEmoji").value = play.emoji || "";
  $("fLevel").value = String(play.level || 1); $("fSide").value = play.side === "defense" ? "defense" : "offense";
  $("fTags").value = (play.tags || []).join(", ");
  $("fIdea").value = play.idea || ""; $("fWhy").value = play.why || ""; $("fTry").value = play.tryit || "";
  $("cast").replaceChildren(...IDS.map(id => h("label", { class: `ed-check ${id[0]}` },
    h("input", { type: "checkbox", checked: play.cast.includes(id), onchange: e => setCast(id, e.target) }), name(id))));
}
function setCast(id, box) {
  if (box.checked) {
    play.cast = IDS.filter(x => x === id || play.cast.includes(x));
    const f0 = play.frames[0]; f0.pos = f0.pos || {};
    if (id[0] === "o") f0.pos[id] = SPOT_ORDER.find(s => !Object.values(f0.pos).includes(s)) || [250, 200];
    else if (!play.cast.includes("o" + id[1])) f0.pos[id] = [250, 200];
  } else {
    if (!play.cast.some(x => x !== id && x[0] === "o")) { box.checked = true; return; }  // keep at least one offensive player
    play.cast = play.cast.filter(x => x !== id);
    play.frames.forEach(fr => {
      if (fr.pos) delete fr.pos[id];
      if (fr.bub) delete fr.bub[id];
      if (fr.scr) fr.scr = fr.scr.filter(s => !s.includes(id));
      const open = askList(fr.ask).filter(x => x !== id);
      if (open.length) fr.ask = open.length === 1 ? open[0] : open; else delete fr.ask;
      if (fr.where === id) delete fr.where;
    });
  }
  changed(true);
}
const bind = (id, fn) => $(id).addEventListener("input", e => { fn(e.target.value); changed(false); });
bind("fName", v => { play.name = v; if (!idTouched) { fileId = kebab(v); $("fId").value = fileId; } });
bind("fId", v => { fileId = v.trim(); idTouched = true; });
bind("fEmoji", v => { play.emoji = v; });
bind("fLevel", v => { play.level = +v; });
bind("fSide", v => { play.side = v; });
bind("fTags", v => { play.tags = v.split(",").map(t => t.trim()).filter(Boolean); });
bind("fIdea", v => { play.idea = v; });
bind("fWhy", v => { play.why = v; });
bind("fTry", v => { play.tryit = v; });

/* ---------- Checks and the file ---------- */

function check() {
  const p = cleaned(), list = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fileId)) list.push(["error", `file name must be lowercase words joined by dashes, like "pick-and-roll"`]);
  const errs = checkPlay(p);
  errs.forEach(m => list.push(["error", m]));
  if (!errs.length) {
    const lint = lintPlay(resolvePlay(p, fileId));
    lint.errors.forEach(m => list.push(["error", m]));
    lint.warnings.forEach(m => list.push(["warning", m]));
  }
  $("problems").replaceChildren(...(list.length ? list.map(([kind, msg]) => {
    const at = msg.match(/^(?:frame|step) (\d+)/), j = at ? +at[1] : -1;
    return h("li", { class: kind }, j >= 0 && j < play.frames.length
      ? h("button", { type: "button", class: "linkbtn", onclick: () => selectStep(j) }, msg) : msg);
  }) : [h("li", { class: "ok" }, "Looks good! This play passes every check.")]));
  $("hProblems").textContent = list.length ? `Checks: ${list.filter(x => x[0] === "error").length} to fix` : "Checks";
}
function output() { $("out").value = formatPlay(cleaned()); }

/* Something changed: redraw, recheck, and rewrite the file. rebuild also redraws this step's form (after a structural change). */
function changed(rebuild) {
  dirty = true;
  if (rebuild) { renderSteps(); renderStepForm(); }
  draw(); check(); output();
}

function load(p, id) {
  play = p; fileId = id; idTouched = !!id; sel = 0; previewP = null; stopPreview();
  play.tags = play.tags || [];
  if (!idTouched) fileId = kebab(play.name);
  fillPlayForm(); renderSteps(); renderStepForm(); draw(); check(); output();
  dirty = false;
}
const leaveOk = () => !dirty || confirm("Your changes to this play will be lost. Keep going?");

$("btnNew").addEventListener("click", () => { if (leaveOk()) { load(template(), ""); $("openPlay").value = ""; } });
$("openPlay").addEventListener("change", async e => {
  const id = e.target.value;
  if (!id) return;
  if (!leaveOk()) { e.target.value = ""; return; }
  try {
    const r = await fetch(`plays/${encodeURIComponent(id)}.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    load(await r.json(), id);
  } catch (err) { alert(`Couldn’t open ${id}: ${err.message}`); }
});
$("btnCopy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("out").value); $("saveTip").textContent = "Copied!"; }
  catch { $("out").select(); $("saveTip").textContent = "Press Ctrl+C (or ⌘C) to copy"; }
});
$("btnDownload").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([$("out").value], { type: "application/json" }));
  const a = h("a", { href: url, download: `${fileId || "my-play"}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $("saveTip").textContent = `Downloaded ${fileId || "my-play"}.json`; dirty = false;
});
window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

saveForOffline();

/* Start with a new play, and fill the "Open a play" list from the library */
load(template(), "");
try {
  const { ids, plays } = await loadLibrary(), name = id => { const p = plays.get(id); return p && typeof p.name === "string" ? p.name : id; };
  $("openPlay").replaceChildren(h("option", { value: "" }, "Choose a play…"), ...ids.map(id => h("option", { value: id }, name(id))));
} catch {
  $("openPlay").replaceChildren(h("option", { value: "" }, "No plays found"));
}

// Play logic with no DOM, shared by the page (js/app.js) and the play checker (tools/build.js).

/* Court units: 10 = 1 ft. Baseline at y=0 (top), basket at (250, 52.5), half-court line at y=470. */
export const BASKET = [250, 52.5];
export const LEVELS = ["", "Easy", "Medium", "Tricky"];

/* Named spots a play file can use instead of [x, y]. */
export const SPOTS = {
  TOP: [250, 335],
  LS: [150, 300], RS: [350, 300],   // slots, between the top and the wings
  LW: [85, 238], RW: [415, 238],    // wings
  LC: [28, 92], RC: [472, 92],      // corners
  LE: [170, 190], RE: [330, 190],   // elbows
  HP: [250, 190],                   // high post
  LB: [150, 105], RB: [350, 105]    // blocks
};

/* On the half court? Only an inbounder may stand off it (see the out-of-bounds check in tools/build.js). */
export const onCourt = q => q[0] >= 0 && q[0] <= 500 && q[1] >= 0 && q[1] <= 470;
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const isThree = q => q[1] < 142 ? Math.abs(q[0] - 250) > 220 : dist(q, BASKET) > 237.5;

/* Where a defender stands to guard q: d units from q toward the basket. */
export function guardSpot(q, d = 34) {
  const dx = BASKET[0] - q[0], dy = BASKET[1] - q[1], L = Math.hypot(dx, dy) || 1;
  return [q[0] + dx / L * d, q[1] + dy / L * d];
}

/* ---------- Checking a play file ---------- */

/* Files in plays/ that aren't plays, so no play can have these names */
export const DATA_FILES = ["index.json", "paths.json", "glossary.json", "bundle.json"];

const PLAY_KEYS = ["name", "emoji", "level", "side", "tags", "idea", "why", "tryit", "cast", "frames"];
const FRAME_KEYS = ["pos", "ball", "ask", "where", "scr", "bub", "say"];
const BALL_KEYS = { dribble: ["dribble", "cross"], pass: ["pass", "bounce", "lob"], handoff: ["handoff"], shot: ["shot", "miss"], rebound: ["rebound"], fake: ["fake"] };
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const isText = v => typeof v === "string" && v.trim() !== "";
const isNum = v => typeof v === "number" && Number.isFinite(v);

function pointError(v) {
  if (typeof v === "string") return SPOTS[v] ? "" : `uses unknown spot "${v}" (spots are ${Object.keys(SPOTS).join(", ")})`;
  if (!Array.isArray(v) || (v.length !== 2 && v.length !== 4) || !v.every(isNum)) return "must be a spot name, [x, y] or [x, y, curveX, curveY]";
  if (v[0] < -40 || v[0] > 540 || v[1] < -40 || v[1] > 470) return `[${v[0]}, ${v[1]}] is too far off the court (x -40 to 540, y -40 to 470; out of bounds is only for an inbounder)`;
  return "";
}

/* What a frame's ball does: "hold", "dribble", "pass", "handoff", "shot", "rebound" or "fake" (a shot fake: the ball
   goes up and comes back down, and the holder keeps it). A dribble with "cross" switches hands: a crossover. */
export const ballKind = b => typeof b === "string" ? "hold" : Object.keys(BALL_KEYS).find(k => k in b);
/* Who has the ball when a step starts, and when it ends. Nobody has it during a rebound's start or after a miss. */
export const startHolder = b => typeof b === "string" ? b : b.dribble || b.shot || b.fake || (b.pass || b.handoff || [null])[0];
export const endHolder = b => typeof b === "string" ? b : b.dribble || b.rebound || b.fake || (b.shot ? (b.miss ? null : b.shot) : (b.pass || b.handoff)[1]);

/* A frame's "ask" as a list: the open player (or players) to tap before the step plays. */
export const askList = ask => ask === undefined ? [] : Array.isArray(ask) ? ask : [ask];

/* Returns a list of problems; an empty list means the play is safe to resolve and animate. */
export function checkPlay(p) {
  const errs = [], need = (ok, msg) => { if (!ok) errs.push(msg); return ok; };
  if (!need(isObj(p), "a play must be a JSON object")) return errs;
  Object.keys(p).filter(k => !PLAY_KEYS.includes(k)).forEach(k => errs.push(`unknown field "${k}" (fields are ${PLAY_KEYS.join(", ")})`));
  ["name", "emoji", "idea", "why", "tryit"].forEach(k => need(isText(p[k]), `"${k}" must be some text`));
  need([1, 2, 3].includes(p.level), `"level" must be 1 (Easy), 2 (Medium) or 3 (Tricky)`);
  if (p.side !== undefined) need(p.side === "offense" || p.side === "defense", `"side" must be "offense" or "defense"`);
  if (p.tags !== undefined) need(Array.isArray(p.tags) && p.tags.every(isText), `"tags" must be a list of words, like ["passing", "layup"]`);
  if (!need(Array.isArray(p.cast) && p.cast.length > 0 && p.cast.every(id => /^[od][1-5]$/.test(id)), `"cast" must list players like "o1" (offense) and "d1" (defense)`)) return errs;
  need(new Set(p.cast).size === p.cast.length, `"cast" lists a player twice`);
  if (!need(Array.isArray(p.frames) && p.frames.length >= 2, `"frames" needs a setup frame plus at least one step`)) return errs;

  const inCast = id => p.cast.includes(id);
  const off = id => typeof id === "string" && id[0] === "o" && inCast(id);
  const def = id => typeof id === "string" && id[0] === "d" && inCast(id);
  const two = v => Array.isArray(v) && v.length === 2 && v.every(off) && v[0] !== v[1];
  const last = p.frames.length - 1;
  let prevBall = null;
  p.frames.forEach((fr, j) => {
    const at = j === 0 ? "frame 0 (setup)" : `frame ${j}`;
    if (!need(isObj(fr), `${at} must be an object`)) { prevBall = null; return; }
    Object.keys(fr).filter(k => !FRAME_KEYS.includes(k)).forEach(k => errs.push(`${at}: unknown field "${k}" (fields are ${FRAME_KEYS.join(", ")})`));
    need(isText(fr.say), `${at}: "say" caption is missing`);

    const pos = fr.pos === undefined ? {} : fr.pos;
    if (need(isObj(pos), `${at}: "pos" must be an object like { "o1": "TOP" }`)) {
      Object.entries(pos).forEach(([id, v]) => {
        if (!need(inCast(id), `${at}: "${id}" is in pos but not in the cast`)) return;
        const e = pointError(v);
        need(!e, `${at}: ${id} ${e}`);
      });
      if (j === 0) p.cast.forEach(id => {
        if (id[0] === "o") need(pos[id], `${at} must place every offensive player (${id} is missing)`);
        else if (!pos[id]) need(inCast("o" + id[1]), `${at}: ${id} needs a position because there is no o${id[1]} to guard`);
      });
    }

    const b = fr.ball, kind = b === undefined ? undefined : ballKind(b);
    let ok = false;
    if (kind === "hold") ok = need(off(b), `${at}: ball holder "${b}" must be an offensive player in the cast`);
    else if (kind === "dribble") ok = need(off(b.dribble), `${at}: dribbler "${b.dribble}" must be an offensive player in the cast`);
    else if (kind === "pass") ok = need(two(b.pass), `${at}: "pass" must be [from, to] with two different offensive players in the cast`) &&
      need(!(b.bounce && b.lob), `${at}: a pass can be a bounce pass or a lob, not both`);
    else if (kind === "handoff") ok = need(two(b.handoff), `${at}: "handoff" must be [from, to] with two different offensive players in the cast`);
    else if (kind === "shot") ok = need(off(b.shot), `${at}: shooter "${b.shot}" must be an offensive player in the cast`);
    else if (kind === "rebound") ok = need(inCast(b.rebound), `${at}: rebounder "${b.rebound}" must be a player in the cast`);
    else if (kind === "fake") ok = need(off(b.fake), `${at}: faker "${b.fake}" must be an offensive player in the cast`);
    else errs.push(`${at}: "ball" must be a player like "o1", or { "dribble": "o1" }, { "pass": ["o1", "o2"] }, { "handoff": ["o1", "o2"] }, { "shot": "o1" }, { "rebound": "d5" } or { "fake": "o1" }`);
    if (ok && kind !== "hold") {
      const extra = Object.keys(b).filter(k => !BALL_KEYS[kind].includes(k));
      ok = need(!extra.length, `${at}: "ball" has unknown field "${extra[0]}" (a ${kind} can have ${BALL_KEYS[kind].join(", ")})`);
    }
    if (ok && j === 0) ok = need(kind === "hold" || kind === "dribble", `${at}: the setup can't pass, shoot or fake; give the ball to a player`);
    if (ok && j === 0 && b.cross) ok = need(false, `${at}: the setup can't cross over; put "cross" on a step`);
    if (ok && kind === "shot" && !b.miss) need(j === last, `${at}: a shot must be the last step (add "miss": true for a shot that misses)`);
    if (ok && kind === "shot" && b.miss) need(j < last, `${at}: a missed shot needs a rebound step after it`);
    if (ok && kind === "rebound" && def(b.rebound)) need(j === last, `${at}: a defensive rebound ends the play, so it must be the last step`);
    if (ok && prevBall) {
      if (kind === "rebound") need(prevBall.miss, `${at}: a rebound must come right after a missed shot`);
      else if (prevBall.miss) need(false, `${at}: after a missed shot, the next step must be a rebound, like { "rebound": "d5" }`);
      else need(startHolder(b) === endHolder(prevBall), `${at}: ${startHolder(b)} starts with the ball, but ${endHolder(prevBall)} had it after the step before`);
    }
    prevBall = ok ? b : null;

    if (fr.scr !== undefined) need(Array.isArray(fr.scr) && fr.scr.every(s => Array.isArray(s) && s.length === 2 && ((off(s[0]) && def(s[1])) || (def(s[0]) && off(s[1])))),
      `${at}: "scr" must be a list of [screener, defender] pairs, like [["o3", "d2"]] (or [defender, player] for a box out)`);
    if (fr.bub !== undefined) need(isObj(fr.bub) && Object.entries(fr.bub).every(([id, t]) => inCast(id) && isText(t)),
      `${at}: "bub" must map players in the cast to short text, like { "o2": "Open!" }`);
    if (fr.ask !== undefined && need(j > 0, `${at}: the setup can't have "ask"; put it on the step that passes to the open player`)) {
      const open = askList(fr.ask);
      if (need(open.length > 0 && open.every(off) && new Set(open).size === open.length,
        `${at}: "ask" must name the open player, like "o2", or a list like ["o2", "o3"]`) && ok)
        need(!open.includes(startHolder(b)), `${at}: "ask" names ${startHolder(b)}, who has the ball; name the player who is open for a pass`);
    }
    if (fr.where !== undefined && need(j > 0, `${at}: the setup can't have "where"; put it on the step where the player moves`)) {
      const mine = p.side === "defense" ? def : off;
      need(mine(fr.where), `${at}: "where" must name a player on your team who moves in this step, like "${p.side === "defense" ? "d2" : "o2"}"`);
      need(fr.ask === undefined, `${at}: a step can have "ask" or "where", not both`);
    }
  });
  return errs;
}

/* ---------- Resolving a play for animation ---------- */

/* Fills in every player's spot for every frame (res) plus curve control points (ctrl), when each handoff
   happens (handoffT: the moment giver and taker are closest), where a missed shot bounces to (missAt), and which
   side of the holder the ball is on at the end of each frame (hand: 1 right, -1 left; a crossover switches it,
   and a new holder starts on the right). Call only on a play that passed checkPlay. */
export function resolvePlay(raw, id) {
  const play = { id, tags: [], side: "offense", ...raw, res: [], ctrl: [], handoffT: [], missAt: [], hand: [] };
  play.frames.forEach((fr, j) => {
    const r = {}, c = {}, pos = fr.pos || {};
    play.cast.forEach(pid => {
      const v = pos[pid];
      if (v) { const q = typeof v === "string" ? SPOTS[v] : v; r[pid] = [q[0], q[1]]; c[pid] = q.length >= 4 ? [q[2], q[3]] : null; }
      else if (j > 0) { r[pid] = play.res[j - 1][pid].slice(); c[pid] = null; }
    });
    if (j === 0) play.cast.forEach(pid => { if (!r[pid]) { r[pid] = guardSpot(r["o" + pid.slice(1)]); c[pid] = null; } });
    play.res.push(r); play.ctrl.push(c);
  });
  play.frames.forEach((fr, k) => {
    const b = fr.ball;
    if (k > 0 && b.handoff) {
      let best = 0, bd = Infinity;
      for (let i = 0; i <= 40; i++) { const d = dist(posAt(play, k, i / 40, b.handoff[0]), posAt(play, k, i / 40, b.handoff[1])); if (d < bd) { bd = d; best = i / 40; } }
      play.handoffT[k] = Math.min(.85, Math.max(.15, best));
    }
    if (b.miss) {
      const q = play.res[k + 1][play.frames[k + 1].ball.rebound], dx = q[0] - BASKET[0], dy = q[1] - BASKET[1], L = Math.hypot(dx, dy) || 1;
      play.missAt[k] = [BASKET[0] + dx / L * 40, BASKET[1] + dy / L * 40];
    }
    const kind = ballKind(b), keeps = kind === "hold" || kind === "dribble" || kind === "fake";
    play.hand[k] = k === 0 ? 1 : b.cross ? -play.hand[k - 1] : keeps ? play.hand[k - 1] : 1;
  });
  play.index = searchIndex(play);
  return play;
}

/* Position of player id at time t (0..1) through step k. */
export function posAt(play, k, t, id) {
  const a = play.res[k - 1][id], b = play.res[k][id], c = play.ctrl[k][id], e = ease(t);
  if (c) { const u = 1 - e; return [u * u * a[0] + 2 * u * e * c[0] + e * e * b[0], u * u * a[1] + 2 * u * e * c[1] + e * e * b[1]]; }
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
}

/* ---------- Lint: checks that need a resolved play ---------- */

export const MIN_GAP = 26;     // closest two player centers may get (circles have radius 17)
export const MAX_BUBBLE = 16;  // speech bubbles get too wide past this many characters
export const MAX_HANDOFF = 50; // giver and taker must get at least this close to hand the ball over
export const WHERE_RADIUS = 60; // a tap this close to where the player ends up answers a "where" question

/* Who is out of bounds, caption chips, bubble length, handoff distance, "Who's open?" answers, "where" moves,
   and players overlapping mid-move. Returns { errors, warnings } as lists of messages. */
export function lintPlay(play) {
  const errors = [], warnings = [];
  // Only the inbounder (holding the ball off the court in the setup) may be out of bounds, and only until they step on.
  const b0 = play.frames[0].ball, inbounder = typeof b0 === "string" ? b0 : null;
  let stepped = false;
  play.res.forEach((r, j) => play.cast.forEach(pid => {
    if (pid === inbounder && onCourt(r[pid])) stepped = true;
    if (onCourt(r[pid])) return;
    if (pid !== inbounder) errors.push(`frame ${j}: ${pid} is out of bounds; only the inbounder (the player holding the ball in the setup) can stand off the court`);
    else if (stepped) errors.push(`frame ${j}: ${pid} steps back out of bounds after coming onto the court`);
  }));
  if (b0.dribble && !onCourt(play.res[0][b0.dribble])) errors.push(`frame 0: ${b0.dribble} can't dribble out of bounds; give them the ball as "${b0.dribble}" to inbound it`);

  // A "Who's open?" answer should have more space (distance to the nearest defender) than every other
  // teammate without the ball at the moment the question pops up: the end of the step before.
  const defenders = play.cast.filter(pid => pid[0] === "d");
  const space = (r, pid) => Math.min(...defenders.map(d => dist(r[pid], r[d])));
  play.frames.forEach((fr, j) => {
    const open = askList(fr.ask);
    if (!open.length || !defenders.length) return;
    const r = play.res[j - 1], least = Math.min(...open.map(pid => space(r, pid)));
    const rival = play.cast.find(pid => pid[0] === "o" && pid !== startHolder(fr.ball) && !open.includes(pid) && space(r, pid) >= least);
    if (rival) warnings.push(`frame ${j}: "ask" says ${open.join(" or ")} is open, but ${rival} has as much space when the question pops up`);
  });
  // A "where" answer is a tap near the spot the player runs to, so the run has to be long enough that a tap on the
  // player (where they start) doesn't count too
  play.frames.forEach((fr, j) => {
    if (!fr.where || !j) return;
    const d = dist(play.res[j - 1][fr.where], play.res[j][fr.where]);
    if (d <= WHERE_RADIUS + 10) errors.push(`step ${j}: "where" asks about ${fr.where}, who only moves ${d.toFixed(0)}; ask about a move longer than ${WHERE_RADIUS + 10}`);
  });

  play.frames.forEach((fr, j) => {
    for (const [, x, n] of fr.say.matchAll(/\{(X?)(\d)\}/g)) {
      const pid = (x ? "d" : "o") + n;
      if (!play.cast.includes(pid)) errors.push(`frame ${j}: caption mentions {${x}${n}} but ${pid} is not in the cast`);
    }
    Object.entries(fr.bub || {}).forEach(([pid, text]) => {
      if (text.length > MAX_BUBBLE) warnings.push(`frame ${j}: ${pid}'s bubble "${text}" is long; keep bubbles to ${MAX_BUBBLE} characters`);
    });
    const h = fr.ball && fr.ball.handoff;
    if (h && j > 0) {
      const t = play.handoffT[j], d = dist(posAt(play, j, t, h[0]), posAt(play, j, t, h[1]));
      if (d > MAX_HANDOFF) warnings.push(`step ${j}: ${h[0]} and ${h[1]} are ${d.toFixed(0)} apart at their closest; bring them within ${MAX_HANDOFF} to hand the ball over`);
    }
  });
  for (let k = 1; k < play.frames.length; k++) {
    const close = {};
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, P = {};
      play.cast.forEach(pid => { P[pid] = posAt(play, k, t, pid); });
      play.cast.forEach((a, ai) => play.cast.slice(ai + 1).forEach(b => {
        const d = dist(P[a], P[b]), key = a + b;
        if (d < MIN_GAP && (!close[key] || d < close[key].d)) close[key] = { a, b, d, t };
      }));
    }
    Object.values(close).forEach(({ a, b, d, t }) => errors.push(
      `step ${k}: ${a} and ${b} overlap (${d.toFixed(0)} apart at t=${t.toFixed(2)}); keep players at least ${MIN_GAP} apart, ideally 34`));
  }
  return { errors, warnings };
}

/* ---------- Learning paths (plays/paths.json) ---------- */

const PATH_KEYS = ["id", "name", "emoji", "about", "plays"];

/* Checks the list of learning paths; ids are the plays that exist. Returns a list of problems. */
export function checkPaths(paths, ids) {
  if (!Array.isArray(paths)) return ["paths.json must be a list of paths, like [{ \"id\": \"start-here\", ... }]"];
  const errs = [], seen = new Set();
  paths.forEach((pa, i) => {
    const at = isObj(pa) && isText(pa.id) ? `path "${pa.id}"` : `path ${i + 1}`;
    if (!isObj(pa)) { errs.push(`${at} must be an object`); return; }
    Object.keys(pa).filter(k => !PATH_KEYS.includes(k)).forEach(k => errs.push(`${at}: unknown field "${k}" (fields are ${PATH_KEYS.join(", ")})`));
    if (!(typeof pa.id === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(pa.id))) errs.push(`${at}: "id" must be lowercase words joined by dashes, like "start-here"`);
    else if (seen.has(pa.id)) errs.push(`${at}: another path has the same id`);
    seen.add(pa.id);
    ["name", "emoji", "about"].forEach(k => { if (!isText(pa[k])) errs.push(`${at}: "${k}" must be some text`); });
    if (!Array.isArray(pa.plays) || pa.plays.length < 2) { errs.push(`${at}: "plays" must list at least two play ids, in the order to learn them`); return; }
    pa.plays.forEach(id => { if (!ids.includes(id)) errs.push(`${at}: "${id}" is not a play (there is no plays/${id}.json)`); });
    if (new Set(pa.plays).size !== pa.plays.length) errs.push(`${at}: lists a play twice`);
  });
  return errs;
}

/* ---------- Glossary (plays/glossary.json) ---------- */

const WORD_KEYS = ["word", "also", "means"];
/* Every way to say a glossary entry, normalized: its word plus the other names in "also" */
const namesOf = w => [w.word, ...(Array.isArray(w.also) ? w.also : [])].map(normalize);

/* Checks the glossary, a list of { word, also?, means }. Returns a list of problems. */
export function checkGlossary(words) {
  if (!Array.isArray(words)) return ["glossary.json must be a list of words, like [{ \"word\": \"Screen\", \"means\": \"...\" }]"];
  const errs = [], seen = new Map();
  words.forEach((w, i) => {
    const at = isObj(w) && isText(w.word) ? `"${w.word}"` : `word ${i + 1}`;
    if (!isObj(w)) { errs.push(`${at} must be an object`); return; }
    Object.keys(w).filter(k => !WORD_KEYS.includes(k)).forEach(k => errs.push(`${at}: unknown field "${k}" (fields are ${WORD_KEYS.join(", ")})`));
    if (!isText(w.word)) errs.push(`${at}: "word" must be some text`);
    if (!isText(w.means)) errs.push(`${at}: "means" must be some text`);
    if (w.also !== undefined && !(Array.isArray(w.also) && w.also.every(isText))) { errs.push(`${at}: "also" must be a list of other names, like ["pick"]`); return; }
    if (!isText(w.word)) return;
    namesOf(w).forEach(n => { if (seen.has(n)) errs.push(`${at}: "${n}" is already in the glossary, under ${seen.get(n)}`); else seen.set(n, at); });
  });
  return errs;
}

/* The glossary entries for some words (like a play's tags), in order and each entry once. Words with no entry are skipped. */
export function lookUp(words, terms) {
  const out = [];
  for (const t of terms) {
    const n = normalize(t), w = words.find(x => namesOf(x).includes(n));
    if (w && !out.includes(w)) out.push(w);
  }
  return out;
}

/* ---------- Writing a play file ---------- */

/* JSON on one line with a space inside braces and after commas: { "o1": "TOP", "o2": [160, 100] } */
const inline = v => Array.isArray(v) ? `[${v.map(inline).join(", ")}]`
  : isObj(v) ? (Object.keys(v).length ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }` : "{}")
  : JSON.stringify(v);
const ordered = (o, keys) => [...keys.filter(k => k in o), ...Object.keys(o).filter(k => !keys.includes(k))];

/* A play as the text of its file, in the layout every play in plays/ uses: one field per line, frames one level down. */
export function formatPlay(p) {
  const field = (k, v, pad) => `${pad}${JSON.stringify(k)}: ${inline(v)}`;
  const lines = ordered(p, PLAY_KEYS).map(k => k !== "frames" || !Array.isArray(p.frames) ? field(k, p[k], "  ")
    : `  "frames": [\n${p.frames.map(fr => `    {\n${ordered(fr, FRAME_KEYS).map(fk => field(fk, fr[fk], "      ")).join(",\n")}\n    }`).join(",\n")}\n  ]`);
  return `{\n${lines.join(",\n")}\n}\n`;
}

/* ---------- Search ---------- */

export const normalize = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/* Text to search, weighted: the name counts most, captions least. */
function searchIndex(play) {
  const say = play.frames.map(f => f.say.replace(/\{X?\d\}|\*/g, " ")).join(" ");
  return [[10, play.name], [6, play.tags.join(" ")], [3, LEVELS[play.level] + " " + play.idea], [2, play.why + " " + play.tryit], [1, say]]
    .map(([w, s]) => [w, " " + normalize(s)]);
}

/* Plays where every query word starts a word somewhere in the play, best match first.
   level 1-3 keeps only that level; 0 keeps all. */
export function searchPlays(plays, query, level = 0) {
  const words = normalize(query).split(" ").filter(Boolean)
    .map(w => w.length > 3 && w.endsWith("s") ? [w, w.slice(0, -1)] : [w]);
  return plays
    .map((play, i) => {
      if (level && play.level !== level) return null;
      let score = 0;
      for (const forms of words) {
        let best = 0;
        for (const [weight, text] of play.index) if (forms.some(w => text.includes(" " + w))) best = Math.max(best, weight);
        if (!best) return null;
        score += best;
      }
      return { play, i, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(r => r.play);
}

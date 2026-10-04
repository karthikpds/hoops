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

const PLAY_KEYS = ["name", "emoji", "level", "tags", "idea", "why", "tryit", "cast", "frames"];
const FRAME_KEYS = ["pos", "ball", "scr", "bub", "say"];
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const isText = v => typeof v === "string" && v.trim() !== "";
const isNum = v => typeof v === "number" && Number.isFinite(v);

function pointError(v) {
  if (typeof v === "string") return SPOTS[v] ? "" : `uses unknown spot "${v}" (spots are ${Object.keys(SPOTS).join(", ")})`;
  if (!Array.isArray(v) || (v.length !== 2 && v.length !== 4) || !v.every(isNum)) return "must be a spot name, [x, y] or [x, y, curveX, curveY]";
  if (v[0] < -40 || v[0] > 540 || v[1] < -40 || v[1] > 470) return `[${v[0]}, ${v[1]}] is too far off the court (x -40 to 540, y -40 to 470; out of bounds is only for an inbounder)`;
  return "";
}

/* Who has the ball when a step starts, and when it ends. */
const startHolder = b => typeof b === "string" ? b : b.dribble || b.shot || b.pass[0];
const endHolder = b => typeof b === "string" ? b : b.dribble || b.shot || b.pass[1];

/* Returns a list of problems; an empty list means the play is safe to resolve and animate. */
export function checkPlay(p) {
  const errs = [], need = (ok, msg) => { if (!ok) errs.push(msg); return ok; };
  if (!need(isObj(p), "a play must be a JSON object")) return errs;
  Object.keys(p).filter(k => !PLAY_KEYS.includes(k)).forEach(k => errs.push(`unknown field "${k}" (fields are ${PLAY_KEYS.join(", ")})`));
  ["name", "emoji", "idea", "why", "tryit"].forEach(k => need(isText(p[k]), `"${k}" must be some text`));
  need([1, 2, 3].includes(p.level), `"level" must be 1 (Easy), 2 (Medium) or 3 (Tricky)`);
  if (p.tags !== undefined) need(Array.isArray(p.tags) && p.tags.every(isText), `"tags" must be a list of words, like ["passing", "layup"]`);
  if (!need(Array.isArray(p.cast) && p.cast.length > 0 && p.cast.every(id => /^[od][1-5]$/.test(id)), `"cast" must list players like "o1" (offense) and "d1" (defense)`)) return errs;
  need(new Set(p.cast).size === p.cast.length, `"cast" lists a player twice`);
  if (!need(Array.isArray(p.frames) && p.frames.length >= 2, `"frames" needs a setup frame plus at least one step`)) return errs;

  const inCast = id => p.cast.includes(id);
  const off = id => typeof id === "string" && id[0] === "o" && inCast(id);
  const def = id => typeof id === "string" && id[0] === "d" && inCast(id);
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

    const b = fr.ball;
    let ok = false;
    if (typeof b === "string") ok = need(off(b), `${at}: ball holder "${b}" must be an offensive player in the cast`);
    else if (isObj(b) && "dribble" in b) ok = need(off(b.dribble), `${at}: dribbler "${b.dribble}" must be an offensive player in the cast`);
    else if (isObj(b) && "pass" in b) ok = need(Array.isArray(b.pass) && b.pass.length === 2 && b.pass.every(off) && b.pass[0] !== b.pass[1], `${at}: "pass" must be [from, to] with two different offensive players in the cast`);
    else if (isObj(b) && "shot" in b) ok = need(off(b.shot), `${at}: shooter "${b.shot}" must be an offensive player in the cast`);
    else errs.push(`${at}: "ball" must be a player like "o1", or { "dribble": "o1" }, { "pass": ["o1", "o2"] } or { "shot": "o1" }`);
    if (ok && j === 0) need(typeof b === "string" || b.dribble, `${at}: the setup can't pass or shoot; give the ball to a player`);
    if (ok && b.shot) need(j === p.frames.length - 1, `${at}: a shot must be the last step`);
    if (ok && prevBall) need(startHolder(b) === endHolder(prevBall), `${at}: ${startHolder(b)} starts with the ball, but ${endHolder(prevBall)} had it after the step before`);
    prevBall = ok ? b : null;

    if (fr.scr !== undefined) need(Array.isArray(fr.scr) && fr.scr.every(s => Array.isArray(s) && s.length === 2 && off(s[0]) && def(s[1])),
      `${at}: "scr" must be a list of [screener, defender] pairs, like [["o3", "d2"]]`);
    if (fr.bub !== undefined) need(isObj(fr.bub) && Object.entries(fr.bub).every(([id, t]) => inCast(id) && isText(t)),
      `${at}: "bub" must map players in the cast to short text, like { "o2": "Open!" }`);
  });
  return errs;
}

/* ---------- Resolving a play for animation ---------- */

/* Fills in every player's spot for every frame (res) plus curve control points (ctrl).
   Call only on a play that passed checkPlay. */
export function resolvePlay(raw, id) {
  const play = { id, tags: [], ...raw, res: [], ctrl: [] };
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
  play.index = searchIndex(play);
  return play;
}

/* Position of player id at time t (0..1) through step k. */
export function posAt(play, k, t, id) {
  const a = play.res[k - 1][id], b = play.res[k][id], c = play.ctrl[k][id], e = ease(t);
  if (c) { const u = 1 - e; return [u * u * a[0] + 2 * u * e * c[0] + e * e * b[0], u * u * a[1] + 2 * u * e * c[1] + e * e * b[1]]; }
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
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

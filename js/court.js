// Court drawing shared by the page (js/app.js), the play editor (js/editor.js) and the print sheet.
// Everything here builds SVG markup as strings and touches no DOM, so it also runs in Node for the tests.
import { BASKET as B, courtEnd, dist, ease, faceAt, posAt, teamWithBall } from "./playbook.js";

export const f1 = v => v.toFixed(1);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* ---------- The court ---------- */

const LINES = `<g class="lines">
  <rect x="0" y="0" width="500" height="470"/>
  <rect x="170" y="0" width="160" height="190"/>
  <path d="M190 190 A60 60 0 0 0 310 190"/>
  <path class="dash" d="M190 190 A60 60 0 0 1 310 190"/>
  <path d="M30 0 V142 A237.5 237.5 0 0 0 470 142 V0"/>
  <path d="M210 52.5 A40 40 0 0 0 290 52.5"/>
  <path d="M190 470 A60 60 0 0 1 310 470"/>
  <path d="M158 72 H170 M158 100 H170 M158 128 H170 M158 156 H170 M330 72 H342 M330 100 H342 M330 128 H342 M330 156 H342"/>
</g>`;

const hoop = id => `<line class="board" x1="220" y1="40" x2="280" y2="40"/><line class="board-arm" x1="250" y1="40" x2="250" y2="45"/>
<path class="net"${id} d="M243.5 56 L246.5 70 H253.5 L256.5 56 M246.5 70 L250 58 L253.5 70"/><circle class="rim" cx="250" cy="52.5" r="7.5"/>`;

/* Floor, paint, lines, backboard, rim and net. The page's court (main) gets the wood floor and the net's id
   for the swish; copies on the print sheet and in the editor get a plain floor. A full court adds the far half,
   the same lines flipped, with red's hoop at the bottom. */
export function courtBackground(main = false, full = false) {
  const H = full ? 940 : 470, apron = `<rect class="apron" x="-80" y="-80" width="660" height="${H + 130}"/>`;
  const floor = main
    ? `<defs><pattern id="wood" width="44" height="470" patternUnits="userSpaceOnUse"><rect class="floor" width="44" height="470"/><rect class="floor2" x="22" width="22" height="470"/><rect class="plank" x="0" width="1" height="470"/></pattern></defs>
${apron}<rect x="0" y="0" width="500" height="${H}" fill="url(#wood)"/>`
    : `${apron}<rect class="floor" x="0" y="0" width="500" height="${H}"/>`;
  const half = id => `<rect class="paint" x="170" y="0" width="160" height="190"/>${LINES}\n${hoop(id)}`;
  return `${floor}${half(main ? ' id="net"' : "")}<text class="hooplbl" x="292" y="30">Hoop</text>` +
    (full ? `<g transform="translate(0 940) scale(1 -1)">${half("")}</g><text class="hooplbl" x="208" y="921" text-anchor="end">Red’s hoop</text>` : "");
}

/* The whole court plus a thin apron, widened on any side where an inbounder stands out of bounds: [x0, y0, x1, y1] */
export function courtView(play) {
  const full = play.court === "full";
  let x0 = -14, y0 = -14, x1 = 514, y1 = courtEnd(play) + 14;
  play.res.forEach(r => Object.values(r).forEach(q => {
    x0 = Math.min(x0, q[0] - 26); y0 = Math.min(y0, q[1] - 26); x1 = Math.max(x1, q[0] + 26);
    if (full) y1 = Math.max(y1, q[1] + 26);
  }));
  return [x0, y0, x1, y1];
}
/* A full court is too tall to show at once, so the page shows a window as tall as the half court, centered on y
   (where the ball is) and kept on the court. A half court always shows all of it. */
export const WINDOW_H = 498;
export function cameraView(play, y) {
  const v = courtView(play);
  if (play.court !== "full") return v;
  const y0 = Math.max(v[1], Math.min(v[3] - WINDOW_H, y - WINDOW_H / 2));
  return [v[0], y0, v[2], y0 + WINDOW_H];
}

/* Timeline position p → step k and time t (0..1) within it. p = 0 is the setup. */
export function stepAt(p) {
  if (p <= 0) return { k: 1, t: 0 };
  const k = Math.max(1, Math.ceil(p - 1e-9));
  return { k, t: Math.min(1, p - (k - 1)) };
}
export const playersAt = (play, k, t) => Object.fromEntries(play.cast.map(id => [id, posAt(play, k, t, id)]));

/* ---------- Movement lines ---------- */

function sampleQ(a, c, b, N = 40) {
  const out = [];
  for (let i = 0; i <= N; i++) {
    const e = i / N;
    if (c) { const u = 1 - e; out.push([u * u * a[0] + 2 * u * e * c[0] + e * e * b[0], u * u * a[1] + 2 * u * e * c[1] + e * e * b[1]]); }
    else out.push([a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e]);
  }
  return out;
}
function cumLen(pts) { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + dist(pts[i - 1], pts[i])); return L; }
function pointAt(pts, L, s) {
  if (s <= 0) return pts[0].slice();
  const T = L[L.length - 1]; if (s >= T) return pts[pts.length - 1].slice();
  let i = 1; while (L[i] < s) i++;
  const r = (s - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * r, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * r];
}
function trimmed(pts, s0, s1) {
  const L = cumLen(pts), T = L[L.length - 1], a = s0, b = T - s1;
  if (b - a < 8) return null;
  const out = []; for (let s = a; s < b; s += 3) out.push(pointAt(pts, L, s)); out.push(pointAt(pts, L, b));
  return out;
}
function zig(tp) {
  const n = tp.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = tp[Math.max(0, i - 1)], b = tp[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const taper = Math.max(0, Math.min(1, (n - 1 - i) * 3 / 14, i * 3 / 6));
    const off = 5.5 * Math.sin(2 * Math.PI * (i * 3) / 14) * taper;
    out.push([tp[i][0] - dy * off, tp[i][1] + dx * off]);
  }
  return out;
}
const toD = pts => "M" + pts.map(q => f1(q[0]) + " " + f1(q[1])).join(" L");
function endDir(tp) {
  const n = tp.length, E = tp[n - 1], S = tp[Math.max(0, n - 4)];
  let dx = E[0] - S[0], dy = E[1] - S[1]; const L = Math.hypot(dx, dy) || 1; return [E, dx / L, dy / L];
}
function head(tp, cls) {
  const [E, dx, dy] = endDir(tp);
  const tip = [E[0] + dx * 4, E[1] + dy * 4], bx = E[0] - dx * 8, by = E[1] - dy * 8;
  return `<polygon class="ah ${cls}" points="${f1(tip[0])},${f1(tip[1])} ${f1(bx - dy * 6.5)},${f1(by + dx * 6.5)} ${f1(bx + dy * 6.5)},${f1(by - dx * 6.5)}"/>`;
}
/* One line: type is cut, dribble, screen, pass or shot. Red (team "d") is for defenders in a defense play. */
function drawMove(pts, type, { bounce = false, team = "o", s0, s1 } = {}) {
  const ball = type === "pass" || type === "shot";
  const tp = trimmed(pts, s0 ?? (type === "shot" ? 18 : 20), s1 ?? (type === "shot" ? 10 : 22));
  if (!tp) return "";
  const line = type === "dribble" ? zig(tp) : tp, d = toD(line), red = team === "d" ? " dteam" : "";
  let h = `<path class="mvh" d="${d}"/><path class="mv ${type}${red}" d="${d}"/>`;
  if (type === "screen") {
    const [E, dx, dy] = endDir(tp);
    h += `<line class="mv-t${red}" x1="${f1(E[0] - dy * 12)}" y1="${f1(E[1] + dx * 12)}" x2="${f1(E[0] + dy * 12)}" y2="${f1(E[1] - dx * 12)}"/>`;
  } else h += head(tp, ball ? "pa" : team === "d" ? "md" : "mo");
  if (bounce) {
    const L = cumLen(tp), m = pointAt(tp, L, L[L.length - 1] * 0.6);
    h += `<circle class="bnc" cx="${f1(m[0])}" cy="${f1(m[1])}" r="4.2"/>`;
  }
  return h;
}
/* A lob's line bows out to one side, so a still picture shows it going up and over */
function lobBend(a, b) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dx = b[0] - a[0], dy = b[1] - a[1];
  return [m[0] + dy * .22, m[1] - dx * .22];
}
/* Two short orange bars across the spot where the ball changes hands */
function handoffMark(a, b) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  return [-4, 4].map(o => {
    const c = [m[0] + dx * o, m[1] + dy * o];
    return `<line class="ho" x1="${f1(c[0] - dy * 11)}" y1="${f1(c[1] + dx * 11)}" x2="${f1(c[0] + dy * 11)}" y2="${f1(c[1] - dx * 11)}"/>`;
  }).join("");
}

/* Lines for step j. Offense moves always get lines; defenders' moves too in a defense play.
   With follow set, everything that isn't about that player fades. */
export function stepPaths(play, j, follow = "") {
  const fr = play.frames[j], a = play.res[j - 1], b = play.res[j], c = play.ctrl[j], bl = fr.ball;
  const screeners = (fr.scr || []).map(x => x[0]), dribbler = bl.dribble || (bl.handoff && bl.handoff[0]);
  const redBall = teamWithBall(play.frames, j) === "d";  // red's moves get lines too once red has the ball
  const wrap = (who, h) => h && follow && !who.includes(follow) ? `<g opacity=".18">${h}</g>` : h;
  let h = "";
  play.cast.forEach(id => {
    if ((id[0] === "d" && play.side !== "defense" && !redBall) || dist(a[id], b[id]) < 3) return;
    const type = screeners.includes(id) ? "screen" : dribbler === id ? "dribble" : "cut";
    h += wrap([id], drawMove(sampleQ(a[id], c[id], b[id]), type, { team: id[0] }));
  });
  if (bl.pass) {
    // A stolen pass ends where the stealer grabs it
    const [x] = bl.pass, y = bl.stolen || bl.pass[1];
    h += wrap([...bl.pass, y], drawMove(sampleQ(a[x], bl.lob ? lobBend(a[x], b[y]) : null, b[y], bl.lob ? 30 : 10), "pass", { bounce: bl.bounce }));
  }
  if (bl.handoff) {
    const [x, y] = bl.handoff, t = play.handoffT[j];
    h += wrap(bl.handoff, handoffMark(posAt(play, j, t, x), posAt(play, j, t, y)));
  }
  if (bl.shot) h += wrap([bl.shot], drawMove(sampleQ(b[bl.shot], null, B, 10), "shot"));
  if (bl.rebound) h += wrap([bl.rebound], drawMove(sampleQ(play.missAt[j - 1], null, b[bl.rebound], 10), "pass", { s0: 6 }));
  return h;
}
/* Every step's lines up to stepIdx, earlier steps faded */
export function pathsUpTo(play, stepIdx, follow = "") {
  let h = "";
  for (let j = 1; j <= stepIdx; j++) h += `<g opacity="${j === stepIdx ? 1 : 0.28}">${stepPaths(play, j, follow)}</g>`;
  return h;
}

/* ---------- The ball ---------- */

/* Where the ball sits next to player q: on their right (side 1) or left (side -1) */
export const handG = (q, side = 1) => [q[0] + 12 * side, q[1] + 6];
/* The same for player id during step k at time t, for a player who faces a way ("face"): held out in front of them,
   a little to the side of the hand it's in, so a player who turns their back to a defender keeps the ball away from
   them. It's held low and clear of the circle, because the ball is drawn lifted by its height. A dribble stays at
   their side. */
const faced = (play, k, t, id) => faceAt(play, k, t, id) !== null;
function handAt(play, k, t, P, id, side = 1, dribble = false) {
  const a = faceAt(play, k, t, id), q = P[id];
  if (a === null) return handG(q, side);
  const r = a + side * (dribble ? Math.PI / 2 : .5), d = dribble ? 13 : 21;
  return [q[0] + d * Math.cos(r), q[1] + d * Math.sin(r)];
}
/* Where the ball is during step k at time t: ground spot g, height h, scale s, and who holds it (if anyone).
   P holds everyone's position at that moment; now (ms) makes a dribble bounce. */
export function ballState(play, k, t, P, now = 0) {
  const b = play.frames[k].ball, e = ease(t), side = k > 0 && play.hand ? play.hand[k - 1] : 1;
  const hand = (id, sd = 1) => handAt(play, k, t, P, id, sd);
  let g, h, s = 1, holder = null;
  if (typeof b === "string" || b.dribble) {
    holder = typeof b === "string" ? b : b.dribble;
    g = handAt(play, k, t, P, holder, side, !!b.dribble);
    h = b.dribble ? 15 * Math.abs(Math.sin(now / 190)) : faced(play, k, t, holder) ? 3 : 13;
    if (b.cross) {
      // Crossover: early in the step the ball bounces low across the front of the body to the other hand
      const u = Math.max(0, Math.min(1, (t - .1) / .3)), q = P[holder];
      g = [q[0] + 12 * side * Math.cos(Math.PI * u), q[1] + 6 + 9 * Math.sin(Math.PI * u)];
      if (u > 0 && u < 1) h = 5 * Math.abs(Math.sin(Math.PI * u * 2));
    }
  } else if (b.fake) {
    // Shot fake: the ball goes up like a shot, then comes right back down, and the holder keeps it
    holder = b.fake;
    const u = Math.max(0, Math.min(1, t / .6)), up = Math.sin(Math.PI * u);
    g = hand(holder, side);
    h = 13 + 30 * up; s = 1 + .2 * up;
  } else if (b.pass) {
    // A stolen pass flies to the stealer instead of the teammate it was meant for
    const to = b.stolen || b.pass[1], ga = hand(b.pass[0], side), gc = hand(to);
    g = [ga[0] + (gc[0] - ga[0]) * e, ga[1] + (gc[1] - ga[1]) * e];
    h = b.bounce ? (e < .6 ? 13 * (1 - e / .6) : 13 * (e - .6) / .4) : 13 + (b.lob ? 60 : 6) * Math.sin(Math.PI * e);
    if (b.lob) s = 1 + .35 * Math.sin(Math.PI * e);
    holder = t < .03 ? b.pass[0] : (t > .97 ? to : null);
  } else if (b.handoff) {
    // The ball changes hands around the moment the two are closest
    const T = play.handoffT[k], u = Math.max(0, Math.min(1, (t - T + .06) / .12));
    const ga = hand(b.handoff[0], side), gc = hand(b.handoff[1]);
    g = [ga[0] + (gc[0] - ga[0]) * u, ga[1] + (gc[1] - ga[1]) * u];
    h = 13 + 3 * Math.sin(Math.PI * u);
    holder = u <= 0 ? b.handoff[0] : u >= 1 ? b.handoff[1] : null;
  } else if (b.shot) {
    // A miss flies to the rim like a shot, then pops up and off toward the rebounder
    const tt = b.miss ? Math.min(1, t / .75) : t;
    const gs = hand(b.shot, side), d = dist(gs, B), H = Math.min(95, 22 + d * .28);
    g = [gs[0] + (B[0] - gs[0]) * tt, gs[1] + (B[1] - gs[1]) * tt];
    h = 13 * (1 - tt) + H * Math.sin(Math.PI * tt);
    s = (1 + .45 * Math.sin(Math.PI * tt) * (H / 95)) * (1 - .12 * tt);
    if (b.miss && t > .75) {
      const u = (t - .75) / .25, m = play.missAt[k];
      g = [B[0] + (m[0] - B[0]) * u, B[1] + (m[1] - B[1]) * u];
      h = 34 * Math.sin(Math.PI / 2 * u); s = .88 + .12 * u;
    }
    holder = t < .03 ? b.shot : null;
  } else if (b.rebound) {
    const u = Math.min(1, t / .7), eu = ease(u), m = play.missAt[k - 1], gr = hand(b.rebound);
    g = [m[0] + (gr[0] - m[0]) * eu, m[1] + (gr[1] - m[1]) * eu];
    h = 34 * (1 - eu) + 13 * eu + 10 * Math.sin(Math.PI * eu);
    holder = u >= 1 ? b.rebound : null;
  }
  return { g, h, s, holder };
}

/* ---------- Screens and speech bubbles ---------- */

/* Screens to draw at timeline position p: a new screen shows up near the end of its step, an old one fades early in the next */
export function screensAt(play, p) {
  if (p <= 0) return play.frames[0].scr || [];
  const { k, t } = stepAt(p), fk = play.frames[k], fp = play.frames[k - 1];
  const key = s => s[0] + ">" + s[1], prev = (fp.scr || []).map(key), now = (fk.scr || []).map(key), list = [];
  (fk.scr || []).forEach(s => { if (t > .82 || prev.includes(key(s))) list.push(s); });
  (fp.scr || []).forEach(s => { if (!now.includes(key(s)) && t < .18) list.push(s); });
  return list;
}
/* The yellow wall a screener (or a defender boxing out) makes, between them and the player they block */
export function wallsSVG(list, P) {
  return list.map(([s, d]) => {
    const a = P[s], b = P[d]; let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const c = [a[0] + dx * 20, a[1] + dy * 20], x1 = c[0] - dy * 14, y1 = c[1] + dx * 14, x2 = c[0] + dy * 14, y2 = c[1] - dx * 14;
    const xy = `x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"`;
    return `<line class="wall-u" ${xy}/><line class="wall" ${xy}/>`;
  }).join("");
}
/* Bubbles showing at p, how faded in they are (they pop up 30% into their step), and where everyone stands at the
   end of that step (at, for bubbleBoxes) */
export function bubblesAt(play, p) {
  if (p <= 0) return { bub: play.frames[0].bub, op: 1, at: play.res[0] };
  const { k, t } = stepAt(p);
  return t > .3 ? { bub: play.frames[k].bub, op: Math.min(1, (t - .3) / .15), at: play.res[k] } : { bub: null, op: 1, at: play.res[k] };
}
function bubblePath(x, y, w, h, px, up) {
  const r = 11; px = Math.max(x + r + 7, Math.min(x + w - r - 7, px));
  if (!up) return `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${px + 6} L${px} ${y + h + 7} L${px - 6} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
  return `M${x + r} ${y} H${px - 6} L${px} ${y - 7} L${px + 6} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
}
/* Where each speech bubble goes, kept inside view vb: above its speaker if there's room, else below. When two
   players stand close, a bubble would cover the other player or their bubble, so it tries below, then a little to
   either side, and keeps the spot that covers the least. The spots are picked from where everyone stands at the
   end of the step (at), so a bubble doesn't jump around while its speaker runs, then placed at P. */
export function bubbleBoxes(bub, P, vb, at = P) {
  const h = 25, placed = [], picked = [];
  const box = (id, q, shift, up) => {
    const w = bub[id].length * 7.2 + 20, y = up ? q[1] + 29 : q[1] - 54;
    return { id, txt: bub[id], q, w, h, up, y: Math.max(vb[1] + 4, Math.min(vb[3] - 4 - h, y)), x: Math.max(vb[0] + 4, Math.min(vb[2] - 4 - w, q[0] - w / 2 + shift * w)) };
  };
  const cover = (a, x, y, w, hh) => Math.max(0, Math.min(a.x + a.w, x + w) - Math.max(a.x, x)) * Math.max(0, Math.min(a.y + a.h, y + hh) - Math.max(a.y, y));
  Object.keys(bub || {}).forEach(id => {
    const q = at[id] || P[id];
    let best = null;
    [0, -.35, .35].forEach((shift, si) => [false, true].forEach(up => {
      const room = up ? q[1] + 29 + h <= vb[3] - 4 : q[1] - 54 >= vb[1] + 4;
      if (!room && (up || q[1] + 29 + h <= vb[3] - 4)) return;  // no room above: use below, unless there's no room there either
      const b = box(id, q, shift, up);
      let score = si + (up ? .5 : 0);  // ties go to above, then to the middle
      Object.entries(at).forEach(([pid, p]) => { if (pid !== id) score += cover(b, p[0] - 19, p[1] - 19, 38, 38); });
      picked.forEach(o => { score += 2 * cover(b, o.x - 6, o.y - 6, o.w + 12, o.h + 12); });
      if (!best || score < best.score) best = { ...b, shift, score };
    }));
    picked.push(best);
    placed.push(box(id, P[id], best.shift, best.up));
  });
  return placed;
}
export function bubblesSVG(bub, P, vb, op = 1, at = P) {
  return bubbleBoxes(bub, P, vb, at).map(({ id, txt, q, x, y, w, h, up }) =>
    `<g class="bub ${id[0]}" opacity="${f1(op)}"><path d="${bubblePath(x, y, w, h, q[0], up)}"/><text x="${f1(x + w / 2)}" y="${f1(y + h / 2 + .5)}" text-anchor="middle" dominant-baseline="central">${esc(txt)}</text></g>`
  ).join("");
}

/* ---------- Players ---------- */

/* A player's circle, with a nose that points the way they face (hidden for a player with no "face"). The page moves
   and turns it with transforms; static pictures pass the spot as at and the facing angle as face. */
export function playerSVG(id, at, cls = "", face = null) {
  const off = id[0] === "o", num = id.slice(1);
  return `<g class="pl ${off ? "po" : "pd"}${cls ? " " + cls : ""}" data-id="${id}"${at ? ` transform="translate(${f1(at[0])} ${f1(at[1])})"` : ""}><g class="in">` +
    `<circle class="halo" r="25"/>${off ? '<circle class="ring" r="24"/>' : ""}<circle class="sh" cx="1.5" cy="3.5" r="17"/>` +
    `<path class="face" d="M12 -9.5 L29 0 L12 9.5 Z"${face === null ? ' display="none"' : ` transform="rotate(${f1(face * 180 / Math.PI)})"`}/><circle class="body" r="17"/>` +
    `<text class="lbl" y="1" text-anchor="middle" dominant-baseline="central">${off ? num : "X" + num}</text></g></g>`;
}
export function ballSVG(bs) {
  const sh = Math.max(.35, 1 - bs.h / 110);
  return `<ellipse class="bshadow" cx="${f1(bs.g[0])}" cy="${f1(bs.g[1] + 2)}" rx="${f1(7 * sh)}" ry="${f1(3.2 * sh)}"/>` +
    `<g transform="translate(${f1(bs.g[0])} ${f1(bs.g[1] - bs.h)}) scale(${bs.s.toFixed(3)})"><circle class="ballc" r="7.6"/>` +
    `<path class="seam" d="M-7.6 0 H7.6 M0 -7.6 V7.6 M-5.2 -5.4 Q-1.5 0 -5.2 5.4 M5.2 -5.4 Q1.5 0 5.2 5.4"/></g>`;
}

/* A still picture of the play at timeline position p, as a complete <svg>: used by the print sheet and the editor.
   lines: draw movement lines; bubbles: draw speech bubbles; follow: fade everyone else; view: the part of the
   court to show as [x0, y0, x1, y1] (all of it, if left out). */
export function renderCourt(play, p, { lines = true, bubbles = true, follow = "", label = "", view = null } = {}) {
  const { k, t } = stepAt(p), stepIdx = p <= 0 ? 0 : k, P = playersAt(play, k, t), vb = view || courtView(play);
  let bs = null;
  try { bs = ballState(play, k, t, P); } catch { /* an unfinished play in the editor can have a broken ball */ }
  const players = play.cast.map(id => playerSVG(id, P[id], [bs && bs.holder === id ? "has" : "", follow && follow !== id ? "dim" : ""].filter(Boolean).join(" "), faceAt(play, k, t, id))).join("");
  const b = bubbles ? bubblesAt(play, p) : { bub: null };
  return `<svg xmlns="http://www.w3.org/2000/svg" class="court" viewBox="${vb[0]} ${vb[1]} ${vb[2] - vb[0]} ${vb[3] - vb[1]}" role="img"${label ? ` aria-label="${esc(label)}"` : ""}>` +
    courtBackground(false, play.court === "full") + (lines ? pathsUpTo(play, stepIdx, follow) : "") + wallsSVG(screensAt(play, p), P) + players +
    (bs ? ballSVG(bs) : "") + (b.bub ? bubblesSVG(b.bub, P, vb, b.op, b.at) : "") + `</svg>`;
}

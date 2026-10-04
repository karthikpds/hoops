// Checks every play in plays/ and writes plays/index.json, the list of plays the page loads.
// Run after adding, renaming or removing a play:  npm run build
// Files starting with "_" (drafts) are skipped. Exits with code 1 if any play has an error.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { checkPlay, dist, onCourt, posAt, resolvePlay } from "../js/playbook.js";

const DIR = new URL("../plays/", import.meta.url);
const INDEX = new URL("index.json", DIR);
const MIN_GAP = 26;     // closest two player centers may get (circles have radius 17)
const MAX_BUBBLE = 16;  // speech bubbles get too wide past this many characters

const errors = [], warnings = [];
const report = (list, file, msg) => list.push({ file, msg });

/* Extra checks on a resolved play: who is out of bounds, caption chips, bubble length, and players overlapping mid-move. */
function lint(play, file) {
  // Only the inbounder (holding the ball off the court in the setup) may be out of bounds, and only until they step on.
  const b0 = play.frames[0].ball, inbounder = typeof b0 === "string" ? b0 : null;
  let stepped = false;
  play.res.forEach((r, j) => play.cast.forEach(pid => {
    if (pid === inbounder && onCourt(r[pid])) stepped = true;
    if (onCourt(r[pid])) return;
    if (pid !== inbounder) report(errors, file, `frame ${j}: ${pid} is out of bounds; only the inbounder (the player holding the ball in the setup) can stand off the court`);
    else if (stepped) report(errors, file, `frame ${j}: ${pid} steps back out of bounds after coming onto the court`);
  }));
  if (b0.dribble && !onCourt(play.res[0][b0.dribble])) report(errors, file, `frame 0: ${b0.dribble} can't dribble out of bounds; give them the ball as "${b0.dribble}" to inbound it`);

  play.frames.forEach((fr, j) => {
    for (const [, x, n] of fr.say.matchAll(/\{(X?)(\d)\}/g)) {
      const pid = (x ? "d" : "o") + n;
      if (!play.cast.includes(pid)) report(errors, file, `frame ${j}: caption mentions {${x}${n}} but ${pid} is not in the cast`);
    }
    Object.entries(fr.bub || {}).forEach(([pid, text]) => {
      if (text.length > MAX_BUBBLE) report(warnings, file, `frame ${j}: ${pid}'s bubble "${text}" is long; keep bubbles to ${MAX_BUBBLE} characters`);
    });
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
    Object.values(close).forEach(({ a, b, d, t }) => report(errors, file,
      `step ${k}: ${a} and ${b} overlap (${d.toFixed(0)} apart at t=${t.toFixed(2)}); keep players at least ${MIN_GAP} apart, ideally 34`));
  }
}

const files = readdirSync(DIR).filter(f => f.endsWith(".json") && f !== "index.json" && !f.startsWith("_")).sort();
const plays = [];
for (const file of files) {
  const id = file.slice(0, -5);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) report(errors, file, `file name must be lowercase words joined by dashes, like "pick-and-roll.json"`);
  let raw;
  try { raw = JSON.parse(readFileSync(new URL(file, DIR), "utf8")); }
  catch (e) { report(errors, file, `not valid JSON: ${e.message}`); continue; }
  const problems = checkPlay(raw);
  problems.forEach(msg => report(errors, file, msg));
  if (problems.length) continue;
  const play = resolvePlay(raw, id);
  lint(play, file);
  plays.push(play);
}
const names = new Map();
plays.forEach(pl => {
  if (names.has(pl.name)) report(warnings, `${pl.id}.json`, `has the same name as ${names.get(pl.name)}.json`);
  names.set(pl.name, pl.id);
});

const gha = !!process.env.GITHUB_ACTIONS;
const print = (kind, list) => list.forEach(({ file, msg }) =>
  console.log(gha ? `::${kind} file=plays/${file}::${msg}` : `${kind === "error" ? "✗" : "!"} plays/${file}: ${msg}`));
print("warning", warnings);
print("error", errors);
if (errors.length) {
  console.log(`\n${errors.length} error${errors.length === 1 ? "" : "s"}. Fix them and run again; plays/index.json was not changed.`);
  process.exit(1);
}

/* Keep the existing order, drop removed plays, and slot each new play in after the last play of its level or easier. */
let before = [];
try { before = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : []; }
catch { console.log("! plays/index.json was not valid JSON, so it is rebuilt from scratch"); }
const byId = new Map(plays.map(pl => [pl.id, pl]));
const order = (Array.isArray(before) ? before : []).filter(id => byId.has(id));
const added = plays.filter(pl => !order.includes(pl.id)).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
added.forEach(pl => {
  let at = order.length;
  while (at > 0 && byId.get(order[at - 1]).level > pl.level) at--;
  order.splice(at, 0, pl.id);
});
const removed = (Array.isArray(before) ? before : []).filter(id => !byId.has(id));

const text = JSON.stringify(order, null, 2) + "\n";
const changed = !existsSync(INDEX) || readFileSync(INDEX, "utf8") !== text;
if (changed) writeFileSync(INDEX, text);
console.log(`✓ ${plays.length} play${plays.length === 1 ? "" : "s"} OK${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : ""}`);
if (added.length) console.log(`  added to plays/index.json: ${added.map(pl => pl.id).join(", ")}`);
if (removed.length) console.log(`  removed from plays/index.json: ${removed.join(", ")}`);
if (changed && !added.length && !removed.length) console.log("  plays/index.json rewritten");

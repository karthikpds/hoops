// Tests for js/playbook.js. Run with:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  BASKET, DATA_FILES, SPOTS, askList, ballKind, checkGlossary, checkPaths, checkPlay, dist, lookUp, endHolder, formatPlay, guardSpot, isThree, lintPlay,
  posAt, resolvePlay, searchPlays, startHolder
} from "../js/playbook.js";

const DIR = new URL("../plays/", import.meta.url);
const files = readdirSync(DIR).filter(f => f.endsWith(".json") && !DATA_FILES.includes(f) && !f.startsWith("_"));
const read = f => readFileSync(new URL(f, DIR), "utf8");
const all = files.map(f => resolvePlay(JSON.parse(read(f)), f.slice(0, -5)));

/* A small valid play to break in different ways. */
const base = () => ({
  name: "Test", emoji: "🏀", level: 1, idea: "i", why: "w", tryit: "t",
  cast: ["d1", "d2", "o1", "o2"],
  frames: [
    { pos: { o1: "TOP", o2: "RW" }, ball: "o1", say: "Setup with {1} and {2}." },
    { pos: { o2: [450, 160] }, ball: "o1", say: "{2} cuts." },
    { ball: { pass: ["o1", "o2"] }, ask: "o2", say: "Pass." },
    { ball: { shot: "o2" }, say: "Shot." }
  ]
});
const errorsFor = edit => { const p = base(); edit(p); return checkPlay(p); };
const hasError = (errs, part) => assert.ok(errs.some(e => e.includes(part)), `expected an error containing "${part}", got:\n${errs.join("\n")}`);

test("every play in plays/ passes the checks and the lint", () => {
  for (const f of files) {
    assert.deepEqual(checkPlay(JSON.parse(read(f))), [], f);
    const play = all.find(p => p.id === f.slice(0, -5));
    assert.deepEqual(lintPlay(play).errors, [], f);
  }
});

test("plays/index.json lists every play exactly once", () => {
  const ids = JSON.parse(read("index.json"));
  assert.deepEqual([...ids].sort(), files.map(f => f.slice(0, -5)).sort());
});

test("plays/paths.json only lists plays that exist", () => {
  assert.deepEqual(checkPaths(JSON.parse(read("paths.json")), files.map(f => f.slice(0, -5))), []);
});

test("checkPaths catches broken paths", () => {
  const ids = ["give-and-go", "v-cut", "box-out"];
  const path = () => ({ id: "start-here", name: "Start here", emoji: "⭐", about: "First plays.", plays: ["give-and-go", "v-cut"] });
  const errs = edit => { const p = path(); edit(p); return checkPaths([p], ids); };
  assert.deepEqual(errs(() => {}), []);
  hasError(checkPaths({}, ids), "must be a list");
  hasError(errs(p => { p.id = "Start Here"; }), `"id" must be lowercase`);
  hasError(errs(p => { delete p.about; }), `"about" must be some text`);
  hasError(errs(p => { p.color = "red"; }), `unknown field "color"`);
  hasError(errs(p => { p.plays = ["v-cut"]; }), "at least two play ids");
  hasError(errs(p => { p.plays.push("horns"); }), `"horns" is not a play`);
  hasError(errs(p => { p.plays.push("v-cut"); }), "lists a play twice");
  hasError(checkPaths([path(), path()], ids), "same id");
});

test("plays/glossary.json passes the checks", () => {
  assert.deepEqual(checkGlossary(JSON.parse(read("glossary.json"))), []);
});

test("checkGlossary catches broken words", () => {
  const word = () => ({ word: "Screen", also: ["pick"], means: "Stand still like a wall." });
  const errs = edit => { const w = word(); edit(w); return checkGlossary([w]); };
  assert.deepEqual(errs(() => {}), []);
  hasError(checkGlossary({}), "must be a list");
  hasError(errs(w => { delete w.means; }), `"means" must be some text`);
  hasError(errs(w => { w.word = ""; }), `"word" must be some text`);
  hasError(errs(w => { w.also = "pick"; }), `"also" must be a list`);
  hasError(errs(w => { w.see = "Pick and roll"; }), `unknown field "see"`);
  hasError(checkGlossary([word(), { word: "Pick", means: "m" }]), `"pick" is already in the glossary`);
});

test("lookUp finds words by any name, once each, in order", () => {
  const words = [{ word: "Screen", also: ["pick"], means: "s" }, { word: "Baseline out of bounds", also: ["blob"], means: "b" }];
  assert.deepEqual(lookUp(words, ["blob", "Pick", "screen", "layup", "Baseline Out of Bounds"]).map(w => w.word), ["Baseline out of bounds", "Screen"]);
  assert.deepEqual(lookUp(words, []), []);
});

test("formatPlay writes every play file exactly as it is stored", () => {
  for (const f of files) assert.equal(formatPlay(JSON.parse(read(f))), read(f), f);
});

test("checkPlay and lintPlay check \"where\" questions", () => {
  hasError(errorsFor(p => { p.frames[1].where = "d2"; }), `"where" must name a player on your team`);
  hasError(errorsFor(p => { p.frames[0].where = "o2"; }), `the setup can't have "where"`);
  hasError(errorsFor(p => { p.frames[2].where = "o2"; }), `"ask" or "where", not both`);
  assert.deepEqual(errorsFor(p => { p.frames[1].where = "o2"; }), []);
  const lint = edit => { const p = base(); edit(p); return lintPlay(resolvePlay(p, "t")).errors; };
  assert.deepEqual(lint(p => { p.frames[1].where = "o2"; }), [], "o2 runs far enough to ask where");
  hasError(lint(p => { p.frames[1].pos.o2 = [400, 220]; p.frames[1].where = "o2"; }), `"where" asks about o2, who only moves`);
  assert.deepEqual(errorsFor(p => { p.side = "defense"; p.frames[1].pos.d2 = [440, 170]; p.frames[1].where = "d2"; }), [], "a defense play asks about defenders");
});

test("formatPlay puts fields in the standard order", () => {
  const p = base();
  const shuffled = { frames: p.frames.map(fr => ({ say: fr.say, ...fr })), cast: p.cast, ...p };
  assert.equal(formatPlay(shuffled), formatPlay(p));
  assert.match(formatPlay(p), /^\{\n  "name": "Test",\n/);
  assert.match(formatPlay(p), /"pos": \{ "o1": "TOP", "o2": "RW" \}/);
});

test("the base test play is valid", () => assert.deepEqual(checkPlay(base()), []));

test("checkPlay catches broken fields", () => {
  hasError(errorsFor(p => { p.color = "red"; }), `unknown field "color"`);
  hasError(errorsFor(p => { p.level = 4; }), `"level" must be 1`);
  hasError(errorsFor(p => { p.side = "both"; }), `"side" must be`);
  hasError(errorsFor(p => { p.cast.push("x9"); }), `"cast" must list players`);
  hasError(errorsFor(p => { p.cast.push("o1"); }), "lists a player twice");
  hasError(errorsFor(p => { delete p.frames[1].say; }), `frame 1: "say" caption is missing`);
  hasError(errorsFor(p => { p.frames[1].pos.o2 = "MIDDLE"; }), `unknown spot "MIDDLE"`);
  hasError(errorsFor(p => { p.frames[1].pos.o2 = [600, 100]; }), "too far off the court");
  hasError(errorsFor(p => { delete p.frames[0].pos.o2; }), "must place every offensive player (o2 is missing)");
  hasError(errorsFor(p => { p.frames[1].pos.o3 = "LW"; }), `"o3" is in pos but not in the cast`);
  hasError(errorsFor(p => { p.frames[1].hint = "x"; }), `frame 1: unknown field "hint"`);
});

test("checkPlay follows the ball", () => {
  hasError(errorsFor(p => { p.frames[0].ball = "d1"; }), "must be an offensive player");
  hasError(errorsFor(p => { p.frames[0].ball = { pass: ["o1", "o2"] }; }), "the setup can't pass, shoot or fake");
  hasError(errorsFor(p => { p.frames[2].ball = { pass: ["o2", "o1"] }; }), "o2 starts with the ball, but o1 had it");
  hasError(errorsFor(p => { p.frames[2].ball = { pass: ["o1", "o1"] }; }), `"pass" must be [from, to]`);
  hasError(errorsFor(p => { p.frames[2].ball = { pass: ["o1", "o2"], spin: true }; }), `unknown field "spin"`);
  hasError(errorsFor(p => { p.frames[1].ball = { shot: "o1" }; }), "a shot must be the last step");
  hasError(errorsFor(p => { p.frames[2].ball = { throw: "o1" }; }), `"ball" must be a player`);
  assert.deepEqual(errorsFor(p => { p.frames[2].ball = { pass: ["o1", "o2"], bounce: true }; }), []);
  assert.deepEqual(errorsFor(p => { p.frames[2].ball = { pass: ["o1", "o2"], lob: true }; }), []);
  hasError(errorsFor(p => { p.frames[2].ball = { pass: ["o1", "o2"], bounce: true, lob: true }; }), "a bounce pass or a lob, not both");
});

test("checkPlay handles shot fakes and crossovers", () => {
  assert.deepEqual(errorsFor(p => { p.frames[1].ball = { fake: "o1" }; }), []);
  assert.deepEqual(errorsFor(p => { p.frames[1].ball = { dribble: "o1", cross: true }; }), []);
  hasError(errorsFor(p => { p.frames[1].ball = { fake: "d1" }; }), `faker "d1" must be an offensive player`);
  hasError(errorsFor(p => { p.frames[0].ball = { fake: "o1" }; }), "the setup can't pass, shoot or fake");
  hasError(errorsFor(p => { p.frames[0].ball = { dribble: "o1", cross: true }; }), "the setup can't cross over");
  hasError(errorsFor(p => { p.frames[1].ball = { fake: "o2" }; }), "o2 starts with the ball, but o1 had it");
  assert.equal(startHolder({ fake: "o1" }), "o1");
  assert.equal(endHolder({ fake: "o1" }), "o1");
});

test("a crossover switches the ball to the other hand until someone else gets it", () => {
  const p = base();
  p.frames[1].ball = { dribble: "o1", cross: true };
  const pl = resolvePlay(p, "t");
  assert.deepEqual(pl.hand, [1, -1, 1, 1], "o1 crosses to the left, then the pass goes to o2's right hand");
  p.frames[1].ball = { fake: "o1" };
  assert.deepEqual(resolvePlay(p, "t").hand, [1, 1, 1, 1]);
});

test("checkPlay handles handoffs", () => {
  assert.deepEqual(errorsFor(p => { p.frames[2].ball = { handoff: ["o1", "o2"] }; }), []);
  hasError(errorsFor(p => { p.frames[2].ball = { handoff: ["o1", "d2"] }; }), `"handoff" must be [from, to]`);
  hasError(errorsFor(p => { p.frames[2].ball = { handoff: ["o2", "o1"] }; delete p.frames[2].ask; }), "o2 starts with the ball, but o1 had it");
});

test("checkPlay handles missed shots and rebounds", () => {
  const miss = (reb, more) => p => {
    p.frames[3] = { ball: { shot: "o2", miss: true }, say: "Miss." };
    p.frames[4] = { ball: { rebound: reb }, say: "Rebound." };
    if (more) more(p);
  };
  assert.deepEqual(errorsFor(miss("d2")), []);
  assert.deepEqual(errorsFor(miss("o1", p => { p.frames[5] = { ball: { shot: "o1" }, say: "Putback." }; })), []);
  hasError(errorsFor(miss("d2", p => { p.frames[5] = { ball: "o1", say: "More." }; })), "a defensive rebound ends the play");
  hasError(errorsFor(p => { p.frames[3].ball = { shot: "o2", miss: true }; }), "a missed shot needs a rebound step after it");
  hasError(errorsFor(miss("d2", p => { p.frames[4].ball = "o2"; })), "after a missed shot, the next step must be a rebound");
  hasError(errorsFor(p => { p.frames[3].ball = { rebound: "o2" }; }), "a rebound must come right after a missed shot");
  hasError(errorsFor(miss("o9")), `rebounder "o9" must be a player in the cast`);
});

test("checkPlay handles screens, box outs, bubbles and questions", () => {
  assert.deepEqual(errorsFor(p => { p.frames[1].scr = [["o1", "d2"]]; }), []);
  assert.deepEqual(errorsFor(p => { p.frames[1].scr = [["d2", "o2"]]; }), []);
  hasError(errorsFor(p => { p.frames[1].scr = [["o1", "o2"]]; }), `"scr" must be a list`);
  hasError(errorsFor(p => { p.frames[1].bub = { o3: "Hi" }; }), `"bub" must map players`);
  hasError(errorsFor(p => { p.frames[0].ask = "o2"; }), `the setup can't have "ask"`);
  hasError(errorsFor(p => { p.frames[2].ask = "o1"; }), `"ask" names o1, who has the ball`);
  hasError(errorsFor(p => { p.frames[2].ask = "d2"; }), `"ask" must name the open player`);
  assert.deepEqual(errorsFor(p => { p.cast.push("o3"); p.frames[0].pos.o3 = "LW"; p.frames[2].ask = ["o2", "o3"]; }), []);
});

test("ball helpers", () => {
  assert.equal(ballKind("o1"), "hold");
  assert.equal(ballKind({ pass: ["o1", "o2"], bounce: true }), "pass");
  assert.equal(startHolder({ handoff: ["o1", "o2"] }), "o1");
  assert.equal(endHolder({ handoff: ["o1", "o2"] }), "o2");
  assert.equal(endHolder({ shot: "o2", miss: true }), null);
  assert.equal(startHolder({ rebound: "d5" }), null);
  assert.equal(endHolder({ rebound: "d5" }), "d5");
  assert.deepEqual(askList(undefined), []);
  assert.deepEqual(askList("o2"), ["o2"]);
  assert.deepEqual(askList(["o2", "o3"]), ["o2", "o3"]);
});

test("resolvePlay fills in every position", () => {
  const play = resolvePlay(base(), "test");
  assert.deepEqual(play.res[0].o1, SPOTS.TOP);
  assert.deepEqual(play.res[0].d1, guardSpot(SPOTS.TOP));          // defenders start guarding their player
  assert.ok(Math.abs(dist(play.res[0].d1, SPOTS.TOP) - 34) < 1e-9);
  assert.deepEqual(play.res[2].o2, [450, 160]);                     // players stay put unless moved
  assert.equal(play.side, "offense");
  assert.deepEqual(play.tags, []);
});

test("posAt moves along straight lines and curves", () => {
  const p = base();
  p.frames[1].pos.o2 = [450, 160, 500, 150];
  const play = resolvePlay(p, "test");
  assert.deepEqual(posAt(play, 1, 0, "o2"), SPOTS.RW);
  assert.deepEqual(posAt(play, 1, 1, "o2"), [450, 160]);
  assert.ok(posAt(play, 1, .5, "o2")[0] > 415, "the curve bends toward its control point");
  const mid = posAt(play, 2, .5, "o1");
  assert.deepEqual(mid, SPOTS.TOP);                                 // o1 doesn't move in step 2
});

test("resolvePlay times handoffs and missed shots", () => {
  const p = base();
  p.frames[1].pos = { o2: [330, 300] };
  p.frames[2] = { pos: { o1: [380, 330], o2: [260, 330, 250, 360] }, ball: { handoff: ["o1", "o2"] }, say: "Handoff." };
  p.frames[3] = { ball: { shot: "o2", miss: true }, say: "Miss." };
  p.frames[4] = { pos: { d2: [300, 80] }, ball: { rebound: "d2" }, say: "Rebound." };
  assert.deepEqual(checkPlay(p), []);
  const play = resolvePlay(p, "test");
  assert.ok(play.handoffT[2] >= .15 && play.handoffT[2] <= .85);
  const m = play.missAt[3];
  assert.ok(Math.abs(dist(m, BASKET) - 40) < 1e-9, "the ball bounces 40 units off the rim");
  assert.ok(m[0] > BASKET[0], "toward the rebounder");
});

test("isThree knows the arc and the corners", () => {
  assert.equal(isThree(SPOTS.TOP), true);
  assert.equal(isThree(SPOTS.HP), false);
  assert.equal(isThree(SPOTS.LC), true);
  assert.equal(isThree([40, 100]), false);
  assert.equal(isThree([250, 52.5 + 238]), true);
  assert.equal(isThree([250, 52.5 + 237]), false);
});

test("lintPlay finds overlaps, stray players, chips, long bubbles and poor answers", () => {
  const lint = edit => { const p = base(); edit(p); assert.deepEqual(checkPlay(p), []); return lintPlay(resolvePlay(p, "t")); };
  hasError(lint(p => { p.frames[1].pos.o2 = [250, 320]; }).errors, "o1 and o2 overlap");
  hasError(lint(p => { p.frames[1].pos.o2 = [-20, 200]; }).errors, "o2 is out of bounds");
  hasError(lint(p => { p.frames[1].say = "{3} cuts."; }).errors, "caption mentions {3}");
  hasError(lint(p => { p.frames[1].bub = { o2: "This bubble is far too long" }; }).warnings, "is long");
  hasError(lint(p => { p.cast.push("o3"); p.frames[0].pos.o3 = "LC"; }).warnings, `"ask" says o2 is open, but o3`);
  assert.deepEqual(lint(() => {}), { errors: [], warnings: [] });
});

test("lintPlay lets an inbounder start off the court, once", () => {
  const p = base();
  p.frames[0].pos.o1 = [330, -26];
  p.frames[0].pos.d1 = [300, 40];
  p.frames[1].pos.o1 = [345, 35];
  assert.deepEqual(lintPlay(resolvePlay(p, "t")).errors, []);
  p.frames[2].pos = { o1: [330, -20] };
  hasError(lintPlay(resolvePlay(p, "t")).errors, "steps back out of bounds");
});

test("searchPlays ranks names first and filters by level", () => {
  const names = (q, lv) => searchPlays(all, q, lv).map(p => p.id);
  assert.equal(names("backdoor")[0], "backdoor-cut");               // a name match beats a tag match
  assert.ok(names("pick and roll").slice(0, 2).includes("pick-and-roll"));
  assert.equal(names("give & go")[0], "give-and-go");
  assert.ok(names("screens").includes("set-a-screen"), "plural words match too");
  assert.ok(names("").length === all.length);
  assert.ok(searchPlays(all, "", 1).every(p => p.level === 1));
  assert.deepEqual(names("zzzz"), []);
});

test("the bundle has every play in index.json order, exactly as in its file, plus the paths and glossary", async () => {
  const { makeBundle } = await import("../tools/bundle.js");
  const b = makeBundle(), ids = JSON.parse(read("index.json"));
  assert.deepEqual(b.index, ids);
  assert.deepEqual(Object.keys(b.plays), ids);
  assert.deepEqual(b.problems, {});
  for (const id of ids) assert.deepEqual(b.plays[id], JSON.parse(read(`${id}.json`)), id);
  assert.deepEqual(b.paths, JSON.parse(read("paths.json")));
  assert.deepEqual(b.glossary, JSON.parse(read("glossary.json")));
});

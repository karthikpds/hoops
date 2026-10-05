// Tests for js/court.js, the SVG drawing shared by the page, the print sheet and the editor. Run with:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkPlay, dist, resolvePlay } from "../js/playbook.js";
import { WINDOW_H, ballState, bubbleBoxes, cameraView, courtBackground, courtView, pathsUpTo, playersAt, renderCourt, screensAt, stepAt, stepPaths } from "../js/court.js";

const load = id => resolvePlay(JSON.parse(readFileSync(new URL(`../plays/${id}.json`, import.meta.url), "utf8")), id);
const count = (s, part) => s.split(part).length - 1;

/* Pass, handoff, missed shot and a defensive rebound in one small defense play */
const raw = {
  name: "Test", emoji: "🏀", level: 1, side: "defense", idea: "i", why: "w", tryit: "t",
  cast: ["d1", "d2", "o1", "o2"],
  frames: [
    { pos: { o1: "TOP", o2: "RW" }, ball: "o1", say: "Setup." },
    { pos: { d1: [300, 260] }, ball: { pass: ["o1", "o2"], bounce: true }, say: "Pass." },
    { pos: { o1: [380, 300], o2: [300, 280, 360, 330] }, ball: { handoff: ["o2", "o1"] }, say: "Handoff." },
    { pos: { d2: [330, 260] }, ball: { shot: "o1", miss: true }, scr: [["d2", "o2"]], say: "Miss." },
    { pos: { d1: [300, 130] }, ball: { rebound: "d1" }, say: "Rebound." }
  ]
};

test("the drawing test play is valid", () => assert.deepEqual(checkPlay(raw), []));
const play = resolvePlay(raw, "t");

test("stepAt splits the timeline into steps", () => {
  assert.deepEqual(stepAt(0), { k: 1, t: 0 });
  assert.deepEqual(stepAt(1), { k: 1, t: 1 });
  assert.deepEqual(stepAt(1.25), { k: 2, t: .25 });
  const near = stepAt(3 - 1e-12);
  assert.equal(near.k, 3);
  assert.ok(Math.abs(near.t - 1) < 1e-9);
});

test("stepPaths draws each kind of move", () => {
  assert.equal(count(stepPaths(play, 1), "mv pass"), 1);
  assert.equal(count(stepPaths(play, 1), 'class="bnc"'), 1, "a bounce pass gets a bounce dot");
  assert.equal(count(stepPaths(play, 1), "dteam"), 1, "defenders get red lines in a defense play");
  assert.equal(count(stepPaths(play, 2), 'class="ho"'), 2, "a handoff is two short bars");
  assert.equal(count(stepPaths(play, 2), "mv dribble"), 1, "the giver dribbles into the handoff");
  assert.equal(count(stepPaths(play, 3), "mv shot"), 1);
  assert.equal(count(stepPaths(play, 4), "mv pass"), 1, "the rebound flies off the rim");
  const offense = resolvePlay({ ...raw, side: "offense" }, "o");
  assert.equal(count(stepPaths(offense, 1), "dteam"), 0, "no defender lines in an offense play");
});

test("pathsUpTo fades earlier steps, and follow fades other players", () => {
  assert.equal(count(pathsUpTo(play, 3), 'opacity="0.28"'), 2);
  assert.equal(count(pathsUpTo(play, 3), 'opacity="1"'), 1);
  assert.ok(stepPaths(play, 2, "d1").includes('<g opacity=".18"><line class="ho"'), "the handoff isn't about d1, so it fades");
  assert.ok(!stepPaths(play, 2, "o1").includes('<g opacity=".18"><line class="ho"'), "the handoff is about o1, so it stays bright");
});

test("the ball changes hands at the handoff", () => {
  const at = t => ballState(play, 2, t, playersAt(play, 2, t));
  assert.equal(at(0).holder, "o2");
  assert.equal(at(1).holder, "o1");
  assert.equal(at(play.handoffT[2]).holder, null);
});

test("a shot fake goes up and comes back down, and a crossover switches hands", () => {
  const moves = { ...raw, side: "offense", frames: [
    raw.frames[0],
    { ball: { fake: "o1" }, say: "Fake." },
    { pos: { o1: [200, 300] }, ball: { dribble: "o1", cross: true }, say: "Cross." },
    { ball: { pass: ["o1", "o2"] }, say: "Pass." }
  ] };
  assert.deepEqual(checkPlay(moves), []);
  const p = resolvePlay(moves, "f");
  const at = (k, t) => ballState(p, k, t, playersAt(p, k, t));
  assert.ok(at(1, .3).h > at(1, 0).h + 20, "the ball goes up in a shot fake");
  assert.ok(Math.abs(at(1, 1).h - 13) < 1e-9, "and comes back to the hands");
  assert.equal(at(1, .3).holder, "o1", "the faker keeps the ball");
  const q = playersAt(p, 2, 1).o1;
  assert.ok(at(2, 0).g[0] > playersAt(p, 2, 0).o1[0], "the ball starts in the right hand");
  assert.ok(at(2, 1).g[0] < q[0], "and ends in the left");
  assert.ok(at(3, 0).g[0] < playersAt(p, 3, 0).o1[0], "the pass starts from the left hand");
});

test("a lob goes up high, with a curved line", () => {
  const lobbed = { ...raw, side: "offense", frames: [raw.frames[0], { ball: { pass: ["o1", "o2"], lob: true }, say: "Lob." }] };
  assert.deepEqual(checkPlay(lobbed), []);
  const p = resolvePlay(lobbed, "l"), flat = resolvePlay({ ...lobbed, frames: [raw.frames[0], { ball: { pass: ["o1", "o2"] }, say: "Pass." }] }, "f");
  const h = pl => ballState(pl, 1, .5, playersAt(pl, 1, .5)).h;
  assert.ok(h(p) > h(flat) + 40, "a lob flies much higher than a normal pass");
  assert.ok(count(stepPaths(p, 1), " Q") + count(stepPaths(p, 1), "L") > count(stepPaths(flat, 1), "L"), "and its line has more points, because it curves");
});

test("a missed shot ends where the rebound starts", () => {
  const end = ballState(play, 3, 1, playersAt(play, 3, 1)), start = ballState(play, 4, 0, playersAt(play, 4, 0));
  assert.ok(dist(end.g, start.g) < 1e-9);
  assert.ok(Math.abs(end.h - start.h) < 1e-9);
  assert.equal(ballState(play, 4, 1, playersAt(play, 4, 1)).holder, "d1");
});

test("screens and box outs show up at the end of their step", () => {
  assert.deepEqual(screensAt(play, 2.5), []);
  assert.deepEqual(screensAt(play, 3), [["d2", "o2"]]);
  assert.deepEqual(screensAt(play, 3.1), [["d2", "o2"]], "still there early in the next step");
  assert.deepEqual(screensAt(play, 3.5), []);
});

test("courtView widens only for an inbounder", () => {
  assert.deepEqual(courtView(load("give-and-go")), [-14, -14, 514, 484]);
  assert.ok(courtView(load("stack-inbound"))[1] < -14, "a baseline inbounder widens the top");
  assert.ok(courtView(load("sideline-stagger"))[2] > 514, "a sideline inbounder widens the side");
});

test("renderCourt draws a complete still picture", () => {
  const svg = renderCourt(load("give-and-go"), 2, { label: "Give & Go <step 2>" });
  assert.match(svg, /^<svg [^>]*viewBox="-14 -14 528 498"/);
  assert.equal(count(svg, 'class="pl '), 4);
  assert.equal(count(svg, 'class="ballc"'), 1);
  assert.ok(svg.includes('aria-label="Give &amp; Go &lt;step 2&gt;"'), "labels are escaped");
  assert.ok(!svg.includes('id="net"'), "copies don't repeat the page's ids");
  assert.equal(count(renderCourt(play, 3, { lines: false }), 'class="mv '), 0);
  assert.ok(renderCourt(play, 3).includes('class="wall"'));
});

test("a stolen pass flies to the stealer, and its line ends there", () => {
  const stolen = { ...raw, side: "offense", frames: [raw.frames[0], { pos: { d2: [370, 260] }, ball: { pass: ["o1", "o2"], stolen: "d2" }, say: "Steal." }] };
  assert.deepEqual(checkPlay(stolen), []);
  const p = resolvePlay(stolen, "s"), end = ballState(p, 1, 1, playersAt(p, 1, 1));
  assert.equal(end.holder, "d2");
  assert.ok(dist(end.g, [370, 260]) < 15, "the ball ends in the stealer's hands");
  const line = stepPaths(p, 1).match(/class="mv pass" d="([^"]+)"/)[1].split(" L").pop().split(" ").map(Number);
  assert.ok(dist(line, [370, 260]) < 30, "the pass line points at the stealer");
});

test("a full court draws both halves, and the page's view follows the ball", () => {
  const full = load("press-break");
  assert.equal(count(courtBackground(false, true), 'class="rim"'), 2, "two hoops");
  assert.equal(count(courtBackground(), 'class="rim"'), 1);
  assert.ok(courtBackground(true, true).includes('id="net"') && count(courtBackground(true, true), 'id="net"') === 1, "only the top net swishes");
  const v = courtView(full);
  assert.ok(v[3] >= 954, "the whole court, down to past the far baseline");
  const low = cameraView(full, 900), high = cameraView(full, 60);
  assert.equal(low[3] - low[1], WINDOW_H); assert.equal(high[3] - high[1], WINDOW_H);
  assert.equal(low[3], v[3], "near the far baseline the view stops at the bottom");
  assert.equal(high[1], v[1], "near the hoop it stops at the top");
  assert.deepEqual(cameraView(load("give-and-go"), 200), courtView(load("give-and-go")), "a half court always shows all of it");
  assert.match(renderCourt(full, 0), /viewBox="-14 -14 528 \d+"/);
});

test("a player who faces a way gets a nose, and holds the ball in front", () => {
  const p = load("pivot-and-protect");
  assert.ok(renderCourt(p, 0).includes('class="face" d="M12 -9.5 L29 0 L12 9.5 Z" transform="rotate(-90.0)"'), "facing the hoop at the start");
  assert.equal(count(renderCourt(p, 0), 'class="face" d="M12 -9.5 L29 0 L12 9.5 Z" display="none"'), 3, "the others have no nose");
  const at = (k, t) => { const P = playersAt(p, k, t); return [ballState(p, k, t, P).g, P.o1, P.d1]; };
  const [b0, o0, d0] = at(1, 1), [b2, o2, d2] = at(2, 1);
  assert.ok(dist(b0, d0) < dist(o0, d0), "facing the defender, the ball is closer to them than the player is");
  assert.ok(dist(b2, d2) > dist(o2, d2), "after the pivot, the player's body is between them and the ball");
});

test("speech bubbles don't cover each other or a nearby player", () => {
  const vb = [-14, -14, 514, 484], P = { o1: [250, 300], d1: [250, 266], o2: [100, 300] };
  const [a] = bubbleBoxes({ o2: "Open!" }, P, vb);
  assert.equal(a.up, false, "a bubble goes above its speaker when there's room");
  const [b, c] = bubbleBoxes({ o1: "This way!", d1: "Slide!" }, P, vb);
  const hit = (r, q) => r.x < q[0] + 17 && q[0] - 17 < r.x + r.w && r.y < q[1] + 17 && q[1] - 17 < r.y + r.h;
  assert.ok(!hit(b, P.d1), "o1's bubble moves off the defender standing right above");
  assert.ok(!(b.x < c.x + c.w && c.x < b.x + b.w && b.y < c.y + c.h && c.y < b.y + b.h), "and off d1's bubble");
  const near = { o1: [250, 300], d1: [250, 266] }, far = { o1: [250, 300], d1: [400, 266] };
  assert.equal(bubbleBoxes({ o1: "Hi" }, far, vb, near)[0].up, bubbleBoxes({ o1: "Hi" }, near, vb)[0].up, "the spot is picked from where players end the step");
});

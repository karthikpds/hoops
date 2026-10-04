# Pending work

What's left after the October 2026 work on the review's suggestions (learning paths, glossary, bundling, questions,
offline, red passing the ball, 29 new plays). Delete items as they're done.

## 1. Full court (the last engine change)

Plays waiting for it:

- **Press break**, against a 1-2-1-1 press (offense, tricky).
- **Diamond Press 1-2-1-1** (defense, tricky). Corner Trap stands in for it now.

Everything assumes one half court with the basket at the top:

- `pointError` in `playbook.js` allows y up to 470 (the half-court line), and `onCourt()` is the half court.
- `courtView` and `courtBackground` in `court.js` draw `-14 -14 528 498`, with one basket at (250, 52.5).
- `isThree`, shots and missed-shot bounces all use that one basket.

One way to do it: an optional play field `"court": "full"` that extends y to 940, draws the other half with the
second basket, and lets the view follow the ball. Half-court plays stay exactly as they are. Red still never shoots.

## 2. Engine ideas that came up

- **Steals.** Corner Trap ends with X3 "getting there in time" because there's no steal. Now that red can have the
  ball, something like `{ "pass": ["o1", "o3"], "stolen": "d3" }` could hand the ball to red mid-pass.
- **Pivot & Protect** (easy). Skipped because players are circles with no front or back. It would need a facing
  marker on the player circle, plus a way to keep the ball on the side away from the defender.
- **Overlapping speech bubbles** when two speakers stand close, as in Stance and Slide step 2 and the Transition
  Defense setup. `bubblesSVG` in `court.js` could nudge bubbles apart.

## 3. Tests and checks

- **The editor has no automated tests.** A runtime error that crashed it on load passed all the unit tests and was
  only caught by opening it in the browser. The page's question code (`app.js`) isn't covered either. Options: a
  small smoke test that loads both pages in headless Chrome (the same Chrome command that makes `img/share.png`)
  and fails on any console error, or keep checking them by hand after every change.
- **Check these on the live site** at https://karthikpds.github.io/hoops/:
  - Offline: open the site once, wait a few seconds, switch to airplane mode, then reload. It should still work,
    with the "No internet right now" note. Only tested on localhost so far.
  - A shared link's preview card, in a messaging app.
  - The new plays animating at normal speed. Most were checked step by step on the print sheet.

## 4. Smaller ideas

- **Questions for the last 7 plays.** Box Out, Jab Step, The Weave, Box Inbound, Switch!, Hesitation and Triangle
  Offense have none. Each was left out for a reason, like no pass to ask about or no clear answer, so check before
  adding one.
- **A link to a learning path**, like `#path=defense`. Right now a path can't be shared.
- **Questions on the print sheet**, so a coach can ask them at practice.
- **Reserved names in the editor.** It will happily name a play `Paths` or `Glossary` and download it as
  `paths.json` or `glossary.json`. Saved into `plays/`, that would overwrite the real file and break the build.
- **A link preview for each play.** Crawlers don't run the script, so every `#play` link shows the same card. The
  build could write a small HTML page per play with its own `og:` tags.

## Decided against

- **Saving progress** (watched ✓, quiz scores): not wanted. Nothing about the user is stored in the browser.
- **Curl Cut** as its own play: Down Screen already teaches the curl read.

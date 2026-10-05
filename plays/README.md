# Writing a play

The easiest way to make a play is the play editor (`editor.html`, linked at the bottom of the site, or
http://localhost:8000/editor.html with `npm start`): drag players around step by step, and it writes the file for you,
checked with the same rules as below. This page explains the file itself.

Each play is one JSON file in this folder. The file name becomes the play's link:
`pick-and-roll.json` → `https://<you>.github.io/<repo>/#pick-and-roll`. Use lowercase words joined by dashes.
Files that start with `_` (like `_my-draft.json`) are drafts: the site and the checker skip them.

After adding, renaming or deleting a play, run:

```bash
npm run build
```

It checks every play and updates `index.json`, the list the site loads. The order in `index.json` is the order on the
site; a new play is slotted in after the last play of the same level, and you can reorder the list by hand.
If you add a play on github.com instead, the deploy workflow runs the same check and updates the list for you.

## Learning paths

`paths.json` groups plays into paths, like "Start here" or "Defense", shown in the "Path" menu on the site. Each path
lists play ids in the order to learn them, easiest first. A play can be in several paths, or in none.

```json
{
  "id": "start-here",
  "name": "Start here",
  "emoji": "⭐",
  "about": "New to basketball? Start with these.",
  "plays": ["pass-it-around", "give-and-go", "v-cut"]
}
```

`npm run build` checks that every id in `plays` is a play file here. A path has its own link, like
`https://<you>.github.io/<repo>/#path=start-here`, which opens the path at its first play.

## Glossary

`glossary.json` explains basketball words for kids. The site shows the words for a play's tags under "Words to know",
explains a word when you search for it (or tap a tag), and lists every word under "See all the words".

```json
{ "word": "Screen", "also": ["pick"], "means": "Standing still like a wall so a teammate's defender bumps into you. Also called a pick." }
```

`word` is the name shown on the site, `also` (optional) lists other names for the same thing, like tags (`"blob"`)
or plurals, and `means` is one or two short sentences a young kid can follow. Every tag should match a `word` or an
`also` name (capitals and dashes don't matter); `npm run build` warns about any tag that doesn't.

## Reserved names

`index.json`, `paths.json`, `glossary.json` and `bundle.json` aren't plays, so no play can have those names (the
checker and the play editor both say so). `bundle.json` is every play in one file, so the site loads in one request.
The deploy writes it and `npm start` serves it fresh, so you never edit or commit it.

## A complete example

```json
{
  "name": "Give & Go",
  "emoji": "🏃",
  "level": 1,
  "tags": ["passing", "cutting", "layup"],
  "idea": "Pass the ball, then sprint to the basket for a pass right back.",
  "why": "Defenders love to watch the ball. The moment your defender turns to look at it, you can sneak right past them.",
  "tryit": "Pass to a partner, then run hard to the hoop with your hand up high as a target.",
  "cast": ["d1", "d2", "o1", "o2"],
  "frames": [
    {
      "pos": { "o1": "TOP", "o2": "RW" },
      "ball": "o1",
      "say": "{1} has the ball at the top. {2} is waiting on the wing."
    },
    {
      "pos": { "d1": [280, 284] },
      "ball": { "pass": ["o1", "o2"] },
      "bub": { "d1": "Ooh, the ball!" },
      "say": "*Give:* {1} passes to {2}. Look! {X1} turns to watch the ball instead of {1}."
    },
    {
      "pos": { "o1": [228, 128, 214, 252], "d1": [262, 212] },
      "ball": "o2",
      "bub": { "o1": "Go!", "d1": "Huh?!" },
      "say": "*Go:* Right after passing, {1} sprints to the basket. {X1} never saw it coming!"
    },
    {
      "pos": { "o1": [242, 86], "d1": [254, 158] },
      "ball": { "pass": ["o2", "o1"] },
      "say": "{2} passes it right back to {1}."
    },
    {
      "pos": { "d1": [254, 135] },
      "ball": { "shot": "o1" },
      "say": "Layup! Pass, then cut to the basket. That’s a Give & Go."
    }
  ]
}
```

## Play fields

| Field | What it is |
| --- | --- |
| `name` | Play name, shown on its button and as the heading. |
| `emoji` | One emoji for the play's button. |
| `level` | `1` Easy, `2` Medium or `3` Tricky. |
| `side` | Optional. `"defense"` makes it a defense play: red is "your team", the legend says so, and defenders' moves get red lines. Leave it out for an offense play. |
| `court` | Optional. `"full"` for a full-court play, like a press; see below. Leave it out for a half court. |
| `tags` | Optional. Words people might search for, like `"screen"` or `"layup"`. Shown as buttons that find similar plays. |
| `idea` | One-sentence summary, shown big under the name. |
| `why` | The "Why it works" paragraph. |
| `tryit` | The "Try it at practice" paragraph. |
| `cast` | The players in the play. `o1`–`o5` are offense (blue, labelled 1–5); `d1`–`d5` are defense (red, labelled X1–X5), and `dN` guards `oN`. List defenders first so offense draws on top. |
| `frames` | Frame 0 is the setup; every frame after it is one step of the animation. |

## The court

```
         x=0                       x=250                      x=500
  y=0    ┌──────────────────────── baseline ───────────────────────┐
         │ LC                     🏀 (250, 52.5)                RC │
         │              LB  ┌──── paint ────┐  RB                  │
         │                  │               │                      │
  y=190  │              LE  └───── HP ──────┘  RE                  │  free-throw line
         │     LW                                         RW       │
         │           LS                             RS             │
         │                          TOP                            │
  y=470  └──────────────────── half-court line ─────────────────────┘
```

10 units = 1 foot. Anywhere you'd write a position you can use a spot name instead of `[x, y]`:

| Spot | Where | `[x, y]` |
| --- | --- | --- |
| `TOP` | Top of the key | `[250, 335]` |
| `LS` / `RS` | Left / right slot | `[150, 300]` / `[350, 300]` |
| `LW` / `RW` | Left / right wing | `[85, 238]` / `[415, 238]` |
| `LC` / `RC` | Left / right corner | `[28, 92]` / `[472, 92]` |
| `LE` / `RE` | Left / right elbow | `[170, 190]` / `[330, 190]` |
| `HP` | High post | `[250, 190]` |
| `LB` / `RB` | Left / right block | `[150, 105]` / `[350, 105]` |

The 3-point line is 237.5 units from the basket, and straight along the sides in the corners (x < 30 or x > 470 while y < 142).
Shots score 2 or 3 automatically from where the shooter stands.

Every step takes about the same time (1.8 seconds when someone moves), so keep each player's move in a step under 250
units, 25 feet. A longer run looks like the player is zooming past everyone: split it into two steps, or start closer.

## Frame fields

| Field | What it is |
| --- | --- |
| `pos` | Where players move to during this step. A spot name, `[x, y]`, or `[x, y, curveX, curveY]` to bend the path through a control point. Players you leave out stay where they are. Frame 0 must place every offensive player; a defender left out of frame 0 starts guarding their matching player. |
| `face` | Optional. Which way players turn by the end of this step, like `{ "o1": "o2" }`: toward another player, `"HOOP"`, a spot name or `[x, y]`. See "Facing" below. |
| `ball` | What the ball does in this step; see the table below. The ball must start each step with whoever had it when the step before ended. |
| `scr` | Optional. Screens, as `[screener, defender]` pairs like `[["o3", "d2"]]`, or `[defender, player]` for a box out like `[["d5", "o5"]]`. Draws the yellow wall. Repeat it in every frame the screen is held. |
| `bub` | Optional. Speech bubbles like `{ "o2": "Open!" }`. They pop up 30% into the step. Keep them to about 16 characters. |
| `ask` | Optional. A "Who's open?" question: the open player, like `"o2"` (or a list like `["o2", "o3"]` if more than one is). The play stops before this step and waits for a tap on that player. See below. |
| `where` | Optional. A "Where should … go?" question about a player on your team who moves in this step, like `"o2"` (or `"d2"` in a defense play). The play stops before this step and waits for a tap on the spot where that player ends up. A step can have `ask` or `where`, not both. See below. |
| `say` | The caption. `{1}` shows a blue player chip, `{X1}` a red one, and `*word*` highlights a keyword. |

### The ball

| `ball` | What happens |
| --- | --- |
| `"o1"` | o1 holds it. |
| `{ "dribble": "o1" }` | o1 dribbles. Add `"cross": true` for a crossover: the ball bounces across to o1's other hand early in the step, and stays there until o1 passes or shoots. |
| `{ "fake": "o1" }` | o1 does a shot fake: lifts the ball like a shot, then brings it back down and keeps it. |
| `{ "pass": ["o1", "o2"] }` | o1 passes to o2. Add `"bounce": true` for a bounce pass, or `"lob": true` for a high lob pass over the defense. |
| `{ "pass": ["o1", "o3"], "stolen": "d3" }` | o1 throws to o3, but d3 steals it: the ball flies to d3, and now red has the ball. Move the stealer into the passing lane in the same step, like the end of `corner-trap.json`. A stolen pass can't have `ask`, and red can steal from blue or blue from red. |
| `{ "handoff": ["o1", "o2"] }` | o1 hands the ball to o2 as they run close by. The ball changes hands at the moment the two are closest, so move them past each other (within 50 units). |
| `{ "shot": "o1" }` | o1 shoots and scores. Only allowed in the last step. |
| `{ "shot": "o1", "miss": true }` | o1 shoots and misses. The next step must be a rebound. |
| `{ "rebound": "d5" }` | d5 (or any player) grabs the missed shot. After a red rebound (or a steal), red has the ball: red players can hold, dribble, pass and hand off (but not shoot, since red's basket is at the other end), like the outlet pass in `rebound-and-outlet.json`. |

The setup (frame 0) can only hold or dribble, and can't cross over.

The lines on the court are drawn for you: a moving screener gets a line with a T end, a moving dribbler gets a zigzag,
everyone else who moves gets a solid arrow, and passes and shots get dashed orange lines. A handoff gets two short
orange bars where the ball changes hands. In a defense play, defenders' moves get red lines too.

## Defense plays

Add `"side": "defense"` and tell the story from the defenders' point of view. A missed shot and a rebound make a
good ending: see `box-out.json`. For a box out, list the defender first in `scr`, like `[["d4", "o4"], ["d5", "o5"]]`.
Most defense plays ask `where` questions, like "Where should X2 go?" before a defender slides over to help (see
`help-side.json`). Once red has the ball after a rebound, an `ask` can be about red players too, like who's open for
the outlet pass.

## Full-court plays

Add `"court": "full"` and the court goes on past half court (y = 470) to the far baseline at y = 940, with red's hoop
at (250, 887.5). Blue still shoots at the top hoop, and red never shoots. Spot names are all on the top half. The site
shows a half-court-sized window that follows the ball, so keep the passes that matter within about 400 units of each
other; the editor and the print sheet show the whole court. After red scores, blue inbounds from past the far
baseline, like `"o4": [330, 966]` (y up to 980). See `press-break.json` and `diamond-press.json`.

## Facing

Players are circles with no front or back, so add `face` when it matters which way someone is turned, like a pivot.
`"face": { "o1": "o2" }` turns o1 toward o2 by the end of the step; the target can also be `"HOOP"`, a spot name or
`[x, y]`. A player with a `face` gets a little nose on their circle that shows which way they face, and keeps facing
that way until a later `face` turns them again. They turn the short way round. A ball holder who faces somewhere holds
the ball out in front, so turning your back to a defender puts the ball on the far side: see `pivot-and-protect.json`.

## Inbound plays

To start a play with the ball out of bounds, give the ball to the inbounder in the setup (`"ball": "o1"`) and put them
off the court: behind the baseline (y between -40 and 0) or past a sideline (x between -40 and 0, or 500 and 540).
For example, `"o1": [330, -26]` stands just behind the baseline, to the right of the backboard, and `"o3": [528, 300]`
stands out on the right sideline. The court view widens on that side by itself.

Only the inbounder can be off the court, and once they step on they can't go back out. Defenders always stay on the
court, so guard an inbounder from just inside the line. See `box-inbound.json`, `stack-inbound.json` and
`sideline-stagger.json`.

## Questions

There are two kinds. Viewers can switch them off with the "Questions" button. One question per play is plenty.

### "Who's open?"

Put `"ask"` on the step that passes to the open player. When the step before it ends, the play stops, the caption
asks "Who's open? Tap the player 1 should pass to.", and kids tap a blue player on the court (or press 1–5). A wrong
pick gets a hint ("X2 is right there"), the right one gets a "Yes!", and then the step plays. Speech bubbles are hidden
while the question is up, so an "I'm open!" bubble doesn't give the answer away.

```json
{
  "pos": { "d3": [125, 100] },
  "ball": { "pass": ["o1", "o3"] },
  "ask": "o3",
  "say": "*Kick:* {1} passes out to {3} in the corner."
}
```

Ask when the open player is easy to spot: the answer should be farther from every defender than any other teammate
without the ball (the checker warns if not).

### "Where should … go?"

Put `"where"` on a step where a player on your team runs somewhere important, like a cut to the basket or a defender
sliding over to help. When the step before it ends, the play stops, the caption asks "Where should 5 go? Tap the spot
on the court." (or "dribble", if that player is dribbling), and kids tap the court. A tap within 60 units (6 feet) of
where the player ends the step is right: a green ring marks the spot and the player runs there. A miss gets a hint,
like "X2 is standing there" or "Try closer to the hoop".

```json
{
  "pos": { "o5": [358, 112] },
  "ball": "o1",
  "where": "o5",
  "say": "*Post up:* {5} runs to the block, gets low and wide, and keeps {X5} on their back."
}
```

Ask about a move with one clear answer, and make sure the step before sets it up: in `close-out.json` the pass comes
first, then the question asks where X2 should run. The player has to move more than 70 units, or a tap on the
player would count as right (the checker fails it).

## What `npm run build` checks

- The file name is lowercase words joined by dashes, and isn't one of the reserved names above.
- Every field is there and has the right kind of value, spot names exist, and positions are on the court (or just off it for an inbounder).
- Only the inbounder is ever out of bounds, and they don't step back out once they're on the court.
- The ball moves sensibly from step to step: a made shot only in the last step, a missed shot followed by a rebound, and after a red rebound only red players have the ball, and red never shoots.
- Players in a handoff get within 50 units of each other (a warning).
- Nobody runs more than 250 units in one step (a warning).
- An `ask` names players on the team with the ball who don't have it, and isn't on the setup. If the answer isn't the most open player when the question pops up, that's a warning.
- A `where` names a player on your team who moves more than 70 units in that step, isn't on the setup, and isn't on the same step as an `ask`.
- Caption chips like `{3}` refer to players in the cast.
- No two players ever overlap: it sweeps every step and fails if two players get closer than 26 units (aim for 34, a full player width).
- Speech bubbles aren't too long (a warning, not an error).
- Every tag has a word in `glossary.json` (a warning).

## Tips

- 3 to 6 steps is plenty. One idea per step.
- Short, friendly sentences in sentence case.
- Move the defenders too. The play makes more sense when you see them react.
- If a player has to get around someone, give their move a curve instead of running straight through.
- Keep each move under 25 feet (250 units). Two short steps read better than one long sprint.

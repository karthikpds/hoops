# Writing a play

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

## Frame fields

| Field | What it is |
| --- | --- |
| `pos` | Where players move to during this step. A spot name, `[x, y]`, or `[x, y, curveX, curveY]` to bend the path through a control point. Players you leave out stay where they are. Frame 0 must place every offensive player; a defender left out of frame 0 starts guarding their matching player. |
| `ball` | `"o1"`: o1 holds it. `{ "dribble": "o1" }`: o1 dribbles. `{ "pass": ["o1", "o2"] }`: o1 passes to o2 (add `"bounce": true` for a bounce pass). `{ "shot": "o1" }`: o1 shoots; only allowed in the last step. The ball must start each step with whoever had it when the step before ended. |
| `scr` | Optional. Screens, as `[screener, defender]` pairs like `[["o3", "d2"]]`. Draws the yellow wall. Repeat it in every frame the screen is held. |
| `bub` | Optional. Speech bubbles like `{ "o2": "Open!" }`. They pop up 30% into the step. Keep them to about 16 characters. |
| `say` | The caption. `{1}` shows a blue player chip, `{X1}` a red one, and `*word*` highlights a keyword. |

The lines on the court are drawn for you: a moving screener gets a line with a T end, a moving dribbler gets a zigzag,
everyone else who moves gets a solid arrow, and passes and shots get dashed orange lines.

## Inbound plays

To start a play with the ball out of bounds, give the ball to the inbounder in the setup (`"ball": "o1"`) and put them
off the court: behind the baseline (y between -40 and 0) or past a sideline (x between -40 and 0, or 500 and 540).
For example, `"o1": [330, -26]` stands just behind the baseline, to the right of the backboard, and `"o3": [528, 300]`
stands out on the right sideline. The court view widens on that side by itself.

Only the inbounder can be off the court, and once they step on they can't go back out. Defenders always stay on the
court, so guard an inbounder from just inside the line. See `box-inbound.json`, `stack-inbound.json` and
`sideline-stagger.json`.

## What `npm run build` checks

- Every field is there and has the right kind of value, spot names exist, and positions are on the half court (or just off it for an inbounder).
- Only the inbounder is ever out of bounds, and they don't step back out once they're on the court.
- The ball moves sensibly from step to step, and a shot only happens in the last step.
- Caption chips like `{3}` refer to players in the cast.
- No two players ever overlap: it sweeps every step and fails if two players get closer than 26 units (aim for 34, a full player width).
- Speech bubbles aren't too long (a warning, not an error).

## Tips

- 3 to 6 steps is plenty. One idea per step.
- Short, friendly sentences in sentence case.
- Move the defenders too. The play makes more sense when you see them react.
- If a player has to get around someone, give their move a curve instead of running straight through.

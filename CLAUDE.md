# Hoops Playbook

Animated basketball playbook that teaches young kids basic plays, hosted on GitHub Pages. Static site, no build step
and no dependencies: `index.html` + `css/styles.css` + ES modules in `js/`, with each play as a JSON file in `plays/`.
The only external request is Google Fonts (Fredoka). Originally a single-file page built in a claude.ai chat.

## Commands

- `npm start`: serve the site at http://localhost:8000 (`tools/serve.js`). Needed because the page fetches plays, which browsers block on `file://`. The Browser pane preview config is `.claude/launch.json` (name `hoops`).
- `npm run build`: check every play and rewrite `plays/index.json` (`tools/build.js`). Run it after adding, renaming or removing a play. Exits 1 on any error and leaves `index.json` alone.
- Deploy: `.github/workflows/pages.yml` runs the same build on push to `main` and publishes the repo root to Pages. PRs only run the checks.

## Layout

- `js/playbook.js`: pure logic, no DOM. `SPOTS`, `checkPlay` (returns a list of problems), `resolvePlay` (fills in every player's position per frame as `res`/`ctrl`), `posAt`, `isThree`, search (`searchPlays`, weighted word-prefix matching over name > tags > idea > why/tryit > captions). Imported by both the page and `tools/build.js`, so keep it browser- and Node-safe.
- `js/app.js`: the page. Loads `plays/index.json` then each `plays/<id>.json`; a play that fails to load or fails `checkPlay` is skipped with a console warning. Library UI (search box, level filter, play list, tag buttons, copy-link), URL hash routing (`#<id>` selects a play; picking a play updates the hash with `replaceState`, but the first load never rewrites the URL, so the bare site URL stays bare; "Copy link" builds the link from the current play, not the address bar), and the court animation.
- Layout: `.wrap` is a two-column grid. The left `.library` panel (title, search, level filter, play list) is sticky and fills the window height, and its list scrolls vertically; the right `.content` column holds the court and play info (side by side above 1240px, stacked below). Under 880px the panel becomes a normal block on top and the list turns into a sideways-scrolling chip row. `revealChip()` scrolls the list (either direction) to the selected play without moving the page.
- Inbound plays: the player holding the ball in frame 0 may stand off the court (`pointError` in `playbook.js` allows x -40..540, y -40..470; `onCourt()` is the real court). `tools/build.js` enforces that only that inbounder is ever off the court and never steps back out. `frameCourt()` in `app.js` widens the SVG viewBox on any side where someone stands out of bounds (players are 26 units from the edge), so normal plays keep the original `-14 -14 528 498` view; speech bubbles clamp to the current view.
- `tools/build.js`: `checkPlay` plus lint that needs a resolved play: caption chips must refer to cast members, bubbles ≤ 16 chars (warning), and an overlap sweep of every step at t = 0, 0.05 … 1 that fails if two players get closer than 26 units. Keeps the existing order of `index.json`, drops removed plays, and slots new ones in after the last play of the same or easier level. Prints `::error file=…::` annotations under GitHub Actions.

## How the court and animation work

- SVG half court, `viewBox="-14 -14 528 498"`, 10 units = 1 ft. Baseline at y=0 (top), basket at (250, 52.5), half-court line at y=470. Three-point arc radius 237.5; corner threes are x<30 or x>470 when y<142.
- Players are circles of radius 17: blue offense `o1`..`o5`, red defense `d1`..`d5` (labelled X1..X5). The ball is drawn above the players.
- Timeline: `p` is a continuous position. 0 is the setup, integer k is the end of step k. `tick()` advances `p` (with a hold between steps while playing); `render()` draws everything from `p`. `tick()` snaps `p` to the step end when within 1e-9: without that, regular 60 Hz frame times can leave `p` at 3.9999999999999996, `k` overshoots the last frame, and the loop dies.
- Movement lines use playbook notation and are generated automatically: solid arrow = cut, zigzag = dribble, dashed orange = pass, line with a T end = screen. Earlier steps stay faded on the court.
- Controls: play/pause, step back/next, restart, clickable step dots, speed, show/hide defense and lines. Keyboard: `/` focuses search, Space plays/pauses, Left/Right step. Shortcuts are ignored while typing in an input. In search, Enter opens the top result and plays it; Escape clears.
- "Next play" moves through the current search results when there are several, otherwise through the whole library.

## Adding or editing a play

The file format, spot names and checks are documented for humans in `plays/README.md`; read it before writing a play.
In short: `{ name, emoji, level (1-3), tags?, idea, why, tryit, cast, frames }`, frame 0 is the setup, each frame has
`pos`, `ball`, optional `scr` and `bub`, and `say`. Then:

1. Write `plays/<kebab-case-id>.json`. Positions can be spot names (`TOP`, `LS`, `RS`, `LW`, `RW`, `LC`, `RC`, `LE`, `RE`, `HP`, `LB`, `RB`), `[x, y]`, or `[x, y, cx, cy]` for a curve.
2. Run `npm run build` and fix everything it reports. Overlaps are the usual problem: curve paths around players and keep everyone ~34 apart.
3. Preview it (`npm start` or the `hoops` launch config), open `#<id>`, and watch every step at normal speed.

## Conventions

- Kid-friendly copy: short sentences, sentence case, no all-caps labels. Bubbles are a word or two.
- Theme colors are CSS tokens on `:root` with dark-mode overrides; court colors are tokens too.
- No frameworks, no bundler, no npm dependencies, no browser storage. Keep `js/playbook.js` free of DOM code.
- Text from play files is escaped before it goes into `innerHTML` (`esc()` in `app.js`); keep it that way for any new field.

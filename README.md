# 🏀 Hoops Playbook

Animated basketball plays, made for young players and hosted on GitHub Pages. Search for a play, press Play, and watch
how teammates work together.

- An animated half court with playbook lines (cuts, dribbles, passes, handoffs, screens, steals), speech bubbles, step-by-step captions and a celebration when the shot goes in. Full-court plays, like breaking a press, follow the ball up the court.
- Offense plays, from a first triple threat and give and go to the triangle, the flex and the press break, one-on-one moves like the pivot, the crossover and the shot fake, and defense plays from a first stance and slide to traps, the diamond press and the triangle-and-two.
- Questions stop the play and let kids answer on the court: "Who's open?" before a big pass (tap the open player), and "Where should 2 go?" before a big move (tap the spot).
- Read aloud for kids who are still learning to read, Follow to watch one player's job, and a printable practice sheet.
- Learning paths, like "Start here", "Screens" and "Defense", that list plays in the order to learn them. Each path has its own link.
- A glossary of basketball words: each play explains its words, searching a word (or tapping a tag) explains it, and the whole list is one tap away.
- Search by name, skill or anything in a play's description, filter by level, or press "Surprise me" for a random play.
- Every play has its own link to share with a team. A shared link shows that play's name and picture in the preview.
- Works offline: after one visit, the site keeps working without internet, so you can use it in a gym with no Wi-Fi.
- Each play is a small JSON file. Draw one in the play editor (`editor.html`), or write it by hand.

## Preview it on your computer

Needs [Node.js](https://nodejs.org) 18 or newer. There's nothing to install.

```bash
npm start
```

Then open http://localhost:8000. (Opening `index.html` straight from disk won't work, because browsers block it from
loading the play files.) The offline copy is off on localhost; open http://localhost:8000/?offline to try it.

## Add a play

1. Create a file in [`plays/`](plays/), like `plays/horns.json`. The play editor (`npm start`, then open http://localhost:8000/editor.html) lets you drag players around and downloads the file for you; [plays/README.md](plays/README.md) explains the format, with a full example.
2. Check it and add it to the list the site loads:

   ```bash
   npm run build
   ```

3. Preview it with `npm start`, then commit and push. `npm test` runs the unit tests for the play engine, and
   `npm run smoke` opens the site and the play editor in Chrome and clicks through every play (it needs Chrome and
   Node 22 or newer).

You can also add a play right on github.com: open the `plays` folder, choose **Add file → Create new file**, and commit.
The deploy workflow checks the play and adds it to the list for you. If something's wrong, the run fails and the
**Actions** tab shows which file and what to fix.

## Publish on GitHub Pages

One-time setup:

1. Push this folder to a GitHub repository, on the `main` branch.
2. In the repository, open **Settings → Pages**, and under **Build and deployment** set **Source** to **GitHub Actions**.

After that, every push to `main` checks the plays and publishes the site to `https://<your-user>.github.io/<repo-name>/`,
with a share page and a picture for every play (in `p/`). If you publish your own copy, change the `og:url` and
`og:image` addresses near the top of `index.html` to your site, so shared links show the right preview cards.

## What's where

| Path | What it does |
| --- | --- |
| `index.html` | The page. |
| `editor.html` | The play editor. |
| `css/styles.css` | Styles, including light and dark themes and the print sheet. `css/editor.css` adds the editor's. |
| `js/app.js` | Runs the library (search, paths, glossary) and the controls, and animates the court. |
| `js/library.js` | Loads the plays, paths and glossary, in one request when the bundle is there, and saves the site for offline use. Shared by the page and the editor. |
| `sw.js` | The service worker that keeps a copy of the site for offline use. It only saves the site's own files. |
| `js/editor.js` | The play editor. |
| `js/court.js` | Draws the court, players, lines and ball as SVG. Shared by the page, the print sheet and the editor. |
| `js/playbook.js` | Play logic without any page code: court spots, checking, resolving and formatting plays, search. Shared by the page, the editor and the checker. |
| `tests/` | `npm test`: unit tests for `playbook.js`, `court.js`, the share pages and the offline copy, using Node's built-in test runner. |
| `plays/` | One JSON file per play, plus `index.json`, the list of plays the site loads, `paths.json`, the learning paths, and `glossary.json`, the basketball words. |
| `tools/build.js` | `npm run build`: checks every play, the learning paths and the glossary, and updates `plays/index.json`. With `--bundle` (the deploy), also writes `plays/bundle.json`. |
| `tools/bundle.js` | Puts every play, the paths and the glossary into one file, so the site loads in one request. |
| `tools/serve.js` | `npm start`: a small local web server. It builds the bundle and the share pages fresh on every reload. |
| `tools/smoke.js` | `npm run smoke`: opens the page and the play editor in headless Chrome and fails on any error. |
| `tools/chrome.js` | Drives Chrome for the smoke test and the share pictures, with no dependencies. |
| `tools/share.js` | Writes a page per play (`p/<id>/`) with its own link preview, and with `--images` its picture. The deploy runs it. |
| `tools/share-image.html` | The picture shown when someone shares a link: the site's (`img/share.png`), or with `?play=` one play's. |
| `.github/workflows/pages.yml` | Runs the tests, checks plays and deploys to GitHub Pages on every push to `main`. |

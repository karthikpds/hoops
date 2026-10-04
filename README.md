# 🏀 Hoops Playbook

Animated basketball plays, made for young players and hosted on GitHub Pages. Search for a play, press Play, and watch
how teammates work together.

- An animated half court with playbook lines (cuts, dribbles, passes, handoffs, screens), speech bubbles, step-by-step captions and a celebration when the shot goes in.
- Offense plays, from a first give and go to the triangle, plus defense plays like box outs and help side.
- "Who's open?" questions stop the play before a big pass and let kids tap the open player.
- Read aloud for kids who are still learning to read, Follow to watch one player's job, and a printable practice sheet.
- Search by name, skill or anything in a play's description, filter by level, or press "Surprise me" for a random play.
- Every play has its own link, like `…/#pick-and-roll`, to share with a team.
- Each play is a small JSON file. Draw one in the play editor (`editor.html`), or write it by hand.

## Preview it on your computer

Needs [Node.js](https://nodejs.org) 18 or newer. There's nothing to install.

```bash
npm start
```

Then open http://localhost:8000. (Opening `index.html` straight from disk won't work, because browsers block it from
loading the play files.)

## Add a play

1. Create a file in [`plays/`](plays/), like `plays/horns.json`. The play editor (`npm start`, then open http://localhost:8000/editor.html) lets you drag players around and downloads the file for you; [plays/README.md](plays/README.md) explains the format, with a full example.
2. Check it and add it to the list the site loads:

   ```bash
   npm run build
   ```

3. Preview it with `npm start`, then commit and push. `npm test` runs the unit tests for the play engine.

You can also add a play right on github.com: open the `plays` folder, choose **Add file → Create new file**, and commit.
The deploy workflow checks the play and adds it to the list for you. If something's wrong, the run fails and the
**Actions** tab shows which file and what to fix.

## Publish on GitHub Pages

One-time setup:

1. Push this folder to a GitHub repository, on the `main` branch.
2. In the repository, open **Settings → Pages**, and under **Build and deployment** set **Source** to **GitHub Actions**.

After that, every push to `main` checks the plays and publishes the site to `https://<your-user>.github.io/<repo-name>/`.
If you publish your own copy, change the `og:url` and `og:image` addresses near the top of `index.html` to your site, so
shared links show the preview card.

## What's where

| Path | What it does |
| --- | --- |
| `index.html` | The page. |
| `editor.html` | The play editor. |
| `css/styles.css` | Styles, including light and dark themes and the print sheet. `css/editor.css` adds the editor's. |
| `js/app.js` | Loads the plays, runs search and the controls, and animates the court. |
| `js/editor.js` | The play editor. |
| `js/court.js` | Draws the court, players, lines and ball as SVG. Shared by the page, the print sheet and the editor. |
| `js/playbook.js` | Play logic without any page code: court spots, checking, resolving and formatting plays, search. Shared by the page, the editor and the checker. |
| `tests/` | `npm test`: unit tests for `playbook.js` and `court.js`, using Node's built-in test runner. |
| `plays/` | One JSON file per play, plus `index.json`, the list of plays the site loads. |
| `tools/build.js` | `npm run build`: checks every play and updates `plays/index.json`. |
| `tools/serve.js` | `npm start`: a small local web server. |
| `tools/share-image.html` | The picture shown when someone shares a link to the site, saved as `img/share.png`. |
| `.github/workflows/pages.yml` | Runs the tests, checks plays and deploys to GitHub Pages on every push to `main`. |

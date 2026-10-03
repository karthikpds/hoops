# 🏀 Hoops Playbook

Animated basketball plays, made for young players and hosted on GitHub Pages. Search for a play, press Play, and watch
how teammates work together.

- An animated half court with playbook lines (cuts, dribbles, passes, screens), speech bubbles, step-by-step captions and a celebration when the shot goes in.
- Search by name, skill or anything in a play's description, and filter by level.
- Every play has its own link, like `…/#pick-and-roll`, to share with a team.
- Each play is a small JSON file. Add a file, push, and it's on the site.

## Preview it on your computer

Needs [Node.js](https://nodejs.org) 18 or newer. There's nothing to install.

```bash
npm start
```

Then open http://localhost:8000. (Opening `index.html` straight from disk won't work, because browsers block it from
loading the play files.)

## Add a play

1. Create a file in [`plays/`](plays/), like `plays/horns.json`. [plays/README.md](plays/README.md) explains the format, with a full example.
2. Check it and add it to the list the site loads:

   ```bash
   npm run build
   ```

3. Preview it with `npm start`, then commit and push.

You can also add a play right on github.com: open the `plays` folder, choose **Add file → Create new file**, and commit.
The deploy workflow checks the play and adds it to the list for you. If something's wrong, the run fails and the
**Actions** tab shows which file and what to fix.

## Publish on GitHub Pages

One-time setup:

1. Push this folder to a GitHub repository, on the `main` branch.
2. In the repository, open **Settings → Pages**, and under **Build and deployment** set **Source** to **GitHub Actions**.

After that, every push to `main` checks the plays and publishes the site to `https://<your-user>.github.io/<repo-name>/`.

## What's where

| Path | What it does |
| --- | --- |
| `index.html` | The page. |
| `css/styles.css` | Styles, including light and dark themes. |
| `js/app.js` | Loads the plays, runs search and the controls, and animates the court. |
| `js/playbook.js` | Play logic without any page code: court spots, checking and resolving plays, search. Shared by the page and the checker. |
| `plays/` | One JSON file per play, plus `index.json`, the list of plays the site loads. |
| `tools/build.js` | `npm run build`: checks every play and updates `plays/index.json`. |
| `tools/serve.js` | `npm start`: a small local web server. |
| `.github/workflows/pages.yml` | Checks plays and deploys to GitHub Pages on every push to `main`. |

// Link previews for each play. Crawlers that make preview cards don't run scripts, so every #play link would show
// the site's card. This writes p/<id>/index.html for every play: a tiny page with that play's own title, words and
// picture, which sends people straight on to the play (../../#<id>). "Copy link" on the site copies these.
// The deploy runs it after the build, and tools/serve.js makes the pages on the fly, so p/ is never committed.
//   node tools/share.js            the pages, all using the site's picture (img/share.png)
//   node tools/share.js --images   also a 1200×630 picture of each play, p/<id>/card.png (needs Chrome; see tools/chrome.js)
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LEVELS, checkPlay } from "../js/playbook.js";
import { esc } from "../js/court.js";

const ROOT = new URL("../", import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), "utf8");

/* The site's address, from index.html's og:url tag, so a copy of the site changes it in one place */
export function siteURL() {
  const m = read("index.html").match(/<meta property="og:url" content="([^"]+)"/);
  return m ? m[1].replace(/\/?$/, "/") : "";
}

/* The share page for one play. card: whether p/<id>/card.png exists. */
export function sharePage(id, play, { site = siteURL(), card = false } = {}) {
  const to = `../../#${id}`, url = `${site}p/${id}/`, about = `${LEVELS[play.level]}${play.side === "defense" ? " defense" : ""} play. ${play.idea}`;
  const img = card ? `${url}card.png` : `${site}img/share.png`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(play.name)} · Hoops Playbook</title>
<meta name="description" content="${esc(about)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Hoops Playbook">
<meta property="og:title" content="${esc(`${play.emoji} ${play.name}`)}">
<meta property="og:description" content="${esc(about)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(`${play.name}, drawn on a basketball court`)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${esc(site + "#" + id)}">
<meta http-equiv="refresh" content="0; url=${esc(to)}">
<script>location.replace(${JSON.stringify(to)})</script>
</head>
<body><p><a href="${esc(to)}">Open ${esc(play.name)} in Hoops Playbook</a></p></body>
</html>
`;
}

/* The plays to make pages for: every play in index.json that loads and passes checkPlay */
function playList() {
  return JSON.parse(read("plays/index.json")).flatMap(id => {
    try { const play = JSON.parse(read(`plays/${id}.json`)); return checkPlay(play).length ? [] : [[id, play]]; }
    catch { return []; }
  });
}

/* Takes p/<id>/card.png for every play with tools/share-image.html. Returns the ids it took. */
async function takePictures(list, dir) {
  const { launch, serve } = await import("./chrome.js");
  const server = await serve(), chrome = await launch(), done = [];
  try {
    const page = await chrome.newPage({ width: 1200, height: 630 });
    for (const [id] of list) {
      await page.go(`${server.url}tools/share-image.html?play=${encodeURIComponent(id)}`);
      await page.until(`document.body.dataset.ready==="1"`, `${id}'s picture`, 15000);
      writeFileSync(new URL(`${id}/card.png`, dir), await page.png());
      done.push(id);
    }
    if (page.problems.length) console.log(`! problems while taking pictures:\n  ${page.problems.join("\n  ")}`);
  } finally {
    await chrome.close();
    await server.stop();
  }
  return done;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL("p/", ROOT), list = playList(), site = siteURL();
  rmSync(dir, { recursive: true, force: true });  // drop pages for plays that are gone
  list.forEach(([id]) => mkdirSync(new URL(`${id}/`, dir), { recursive: true }));
  let cards = [];
  if (process.argv.includes("--images")) {
    try { cards = await takePictures(list, dir); }
    catch (e) {
      // A missing picture shouldn't stop the deploy: those pages use the site's picture instead
      console.log(`${process.env.GITHUB_ACTIONS ? "::warning::" : "! "}No play pictures, so the pages use img/share.png: ${e.message}`);
    }
  }
  list.forEach(([id, play]) => writeFileSync(new URL(`${id}/index.html`, dir), sharePage(id, play, { site, card: cards.includes(id) })));
  console.log(`✓ wrote ${list.length} share pages in p/${cards.length ? `, with ${cards.length} pictures` : ""}`);
}

// Tests for tools/share.js, the page per play that link previews read. Run with:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sharePage, siteURL } from "../tools/share.js";

const play = JSON.parse(readFileSync(new URL("../plays/pick-and-roll.json", import.meta.url), "utf8"));

test("the site's address comes from index.html", () => {
  assert.match(siteURL(), /^https:\/\/.+\/$/);
});

test("a share page has the play's own preview and sends people to the play", () => {
  const html = sharePage("pick-and-roll", play, { site: "https://example.com/hoops/", card: true });
  assert.ok(html.includes(`<meta property="og:title" content="${play.emoji} Pick &amp; Roll">`), "the title is escaped");
  assert.ok(html.includes(`<meta property="og:url" content="https://example.com/hoops/p/pick-and-roll/">`));
  assert.ok(html.includes(`<meta property="og:image" content="https://example.com/hoops/p/pick-and-roll/card.png">`));
  assert.ok(html.includes(`location.replace("../../#pick-and-roll")`) && html.includes(`content="0; url=../../#pick-and-roll"`));
  assert.ok(sharePage("pick-and-roll", play, { site: "https://example.com/" }).includes(`content="https://example.com/img/share.png"`), "no picture: the site's");
  const sneaky = sharePage("x", { ...play, name: `"><script>alert(1)</script>`, idea: "<b>hi</b>" }, { site: "https://example.com/" });
  assert.ok(!sneaky.includes("<script>alert") && !sneaky.includes("<b>hi"), "text from the play is escaped");
});

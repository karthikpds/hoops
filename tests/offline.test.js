// Tests for sw.js, the service worker that saves the site for offline use. Run with:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const sw = readFileSync(new URL("sw.js", ROOT), "utf8");
const shell = JSON.parse(sw.match(/const SHELL = (\[[^\]]*\])/)[1].replace(/\s+/g, " "));

test("the offline copy lists every page, script and stylesheet", () => {
  const files = [
    ...readdirSync(ROOT).filter(f => f.endsWith(".html")),
    ...readdirSync(new URL("js/", ROOT)).filter(f => f.endsWith(".js")).map(f => "js/" + f),
    ...readdirSync(new URL("css/", ROOT)).filter(f => f.endsWith(".css")).map(f => "css/" + f)
  ];
  for (const f of files) assert.ok(shell.includes(f), `sw.js SHELL is missing ${f}`);
  for (const f of shell) if (f !== "./") assert.ok(existsSync(new URL(f, ROOT)), `sw.js SHELL lists ${f}, which doesn't exist`);
  assert.ok(shell.includes("./"), "the home page itself is saved");
});

test("both pages ask to be saved for offline use", () => {
  for (const f of ["js/app.js", "js/editor.js"]) assert.match(readFileSync(new URL(f, ROOT), "utf8"), /\bsaveForOffline\(\);/, f);
});

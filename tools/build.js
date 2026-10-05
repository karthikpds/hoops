// Checks every play in plays/ and writes plays/index.json, the list of plays the page loads.
// Run after adding, renaming or removing a play:  npm run build
// Files starting with "_" (drafts) are skipped. Also checks the learning paths (plays/paths.json) and the glossary
// (plays/glossary.json), and warns about any tag the glossary doesn't explain.
// With --bundle (the deploy uses it), also writes plays/bundle.json, the whole library in one file (tools/bundle.js).
// Exits with code 1 if any play, path or glossary word has an error.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { DATA_FILES, checkGlossary, checkPaths, checkPlay, idError, lintPlay, lookUp, resolvePlay } from "../js/playbook.js";
import { makeBundle } from "./bundle.js";

const DIR = new URL("../plays/", import.meta.url);
const INDEX = new URL("index.json", DIR);

const errors = [], warnings = [];
const report = (list, file, msg) => list.push({ file, msg });

const files = readdirSync(DIR).filter(f => f.endsWith(".json") && !DATA_FILES.includes(f) && !f.startsWith("_")).sort();
const plays = [];
for (const file of files) {
  const id = file.slice(0, -5), bad = idError(id);
  if (bad) report(errors, file, bad);
  let raw;
  try { raw = JSON.parse(readFileSync(new URL(file, DIR), "utf8")); }
  catch (e) { report(errors, file, `not valid JSON: ${e.message}`); continue; }
  const problems = checkPlay(raw);
  problems.forEach(msg => report(errors, file, msg));
  if (problems.length) continue;
  const play = resolvePlay(raw, id), lint = lintPlay(play);
  lint.errors.forEach(msg => report(errors, file, msg));
  lint.warnings.forEach(msg => report(warnings, file, msg));
  plays.push(play);
}
const names = new Map();
plays.forEach(pl => {
  if (names.has(pl.name)) report(warnings, `${pl.id}.json`, `has the same name as ${names.get(pl.name)}.json`);
  names.set(pl.name, pl.id);
});

/* paths.json and glossary.json are optional. Returns the file's list, or [] when it's missing or broken. */
function readList(file, check) {
  if (!existsSync(new URL(file, DIR))) return [];
  let data;
  try { data = JSON.parse(readFileSync(new URL(file, DIR), "utf8")); }
  catch (e) { report(errors, file, `not valid JSON: ${e.message}`); return []; }
  const problems = check(data);
  problems.forEach(msg => report(errors, file, msg));
  return Array.isArray(data) && !problems.length ? data : [];
}
const paths = readList("paths.json", data => checkPaths(data, files.map(f => f.slice(0, -5))));
const glossary = readList("glossary.json", checkGlossary);
if (glossary.length) plays.forEach(pl => pl.tags.forEach(tag => {
  if (!lookUp(glossary, [tag]).length) report(warnings, `${pl.id}.json`, `tag "${tag}" isn't in glossary.json; add a word for it, or add it to a word's "also" list`);
}));

const gha = !!process.env.GITHUB_ACTIONS;
const print = (kind, list) => list.forEach(({ file, msg }) =>
  console.log(gha ? `::${kind} file=plays/${file}::${msg}` : `${kind === "error" ? "✗" : "!"} plays/${file}: ${msg}`));
print("warning", warnings);
print("error", errors);
if (errors.length) {
  console.log(`\n${errors.length} error${errors.length === 1 ? "" : "s"}. Fix them and run again; plays/index.json was not changed.`);
  process.exit(1);
}

/* Keep the existing order, drop removed plays, and slot each new play in after the last play of its level or easier. */
let before = [];
try { before = existsSync(INDEX) ? JSON.parse(readFileSync(INDEX, "utf8")) : []; }
catch { console.log("! plays/index.json was not valid JSON, so it is rebuilt from scratch"); }
const byId = new Map(plays.map(pl => [pl.id, pl]));
const order = (Array.isArray(before) ? before : []).filter(id => byId.has(id));
const added = plays.filter(pl => !order.includes(pl.id)).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
added.forEach(pl => {
  let at = order.length;
  while (at > 0 && byId.get(order[at - 1]).level > pl.level) at--;
  order.splice(at, 0, pl.id);
});
const removed = (Array.isArray(before) ? before : []).filter(id => !byId.has(id));

const text = JSON.stringify(order, null, 2) + "\n";
const changed = !existsSync(INDEX) || readFileSync(INDEX, "utf8") !== text;
if (changed) writeFileSync(INDEX, text);
console.log(`✓ ${plays.length} play${plays.length === 1 ? "" : "s"} OK${warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? "" : "s"})` : ""}`);
if (paths.length) console.log(`✓ ${paths.length} learning path${paths.length === 1 ? "" : "s"} OK`);
if (glossary.length) console.log(`✓ ${glossary.length} glossary word${glossary.length === 1 ? "" : "s"} OK`);
if (added.length) console.log(`  added to plays/index.json: ${added.map(pl => pl.id).join(", ")}`);
if (removed.length) console.log(`  removed from plays/index.json: ${removed.join(", ")}`);
if (changed && !added.length && !removed.length) console.log("  plays/index.json rewritten");

if (process.argv.includes("--bundle")) {
  writeFileSync(new URL("bundle.json", DIR), JSON.stringify(makeBundle()));
  console.log("✓ wrote plays/bundle.json");
}

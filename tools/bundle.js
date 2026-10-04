// Builds plays/bundle.json: every play in plays/index.json order plus the learning paths and the glossary, so the
// page loads the whole library in one request. `node tools/build.js --bundle` writes it (the deploy does this), and
// tools/serve.js builds it fresh for every request, so it's never committed (see .gitignore).
import { existsSync, readFileSync } from "node:fs";

const DIR = new URL("../plays/", import.meta.url);
const read = f => JSON.parse(readFileSync(new URL(f, DIR), "utf8"));
/* paths.json and glossary.json are optional; a broken one is left out here, and npm run build explains why */
const optional = f => { try { return existsSync(new URL(f, DIR)) ? read(f) : null; } catch { return null; } };

/* { index, plays: { id: play }, problems: { id: why it's missing }, paths, glossary }. Plays are exactly as in their
   files; the page checks them as it loads, the same as when it loads them one by one. */
export function makeBundle() {
  const index = read("index.json"), plays = {}, problems = {};
  for (const id of index) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) { problems[id] = "not a play id"; continue; }
    try { plays[id] = read(`${id}.json`); }
    catch (e) { problems[id] = e.code === "ENOENT" ? `there is no plays/${id}.json` : `not valid JSON: ${e.message}`; }
  }
  return { index, plays, problems, paths: optional("paths.json"), glossary: optional("glossary.json") };
}

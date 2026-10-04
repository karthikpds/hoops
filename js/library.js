// Loads the library for the page and the editor: the play ids in plays/index.json order, each play's file, the
// learning paths and the glossary. One request for plays/bundle.json when it's there (the deploy writes it, and
// npm start serves it fresh); otherwise plays/index.json, then every plays/<id>.json, paths.json and glossary.json.
// Nothing is checked here: callers run checkPlay, checkPaths and checkGlossary.

async function get(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

/* { ids, plays: Map of id → the play's JSON (or an Error saying why it didn't load), paths, glossary }.
   paths and glossary are null when there's no file. */
export async function loadLibrary() {
  let b = null;
  try { b = await get("plays/bundle.json"); } catch { /* no bundle, so load file by file */ }
  if (b && Array.isArray(b.index) && b.plays) {
    const why = id => new Error((b.problems && b.problems[id]) || "missing from plays/bundle.json");
    return { ids: b.index, plays: new Map(b.index.map(id => [id, b.plays[id] || why(id)])), paths: b.paths ?? null, glossary: b.glossary ?? null };
  }
  const ids = await get("plays/index.json"), optional = url => get(url).catch(() => null);
  const [list, paths, glossary] = await Promise.all([
    Promise.all(ids.map(id => get(`plays/${encodeURIComponent(id)}.json`).catch(e => e))),
    optional("plays/paths.json"), optional("plays/glossary.json")
  ]);
  return { ids, plays: new Map(ids.map((id, i) => [id, list[i]])), paths, glossary };
}

/* Saves the site for offline use (sw.js). Skipped on localhost, so the worker never sticks to other projects served
   there; add ?offline to the address (like http://localhost:8000/?offline) to try it with npm start. */
export function saveForOffline() {
  if (!("serviceWorker" in navigator)) return;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (local && !new URLSearchParams(location.search).has("offline")) return;
  navigator.serviceWorker.register("sw.js").catch(e => console.warn(`Couldn't save the site for offline use: ${e.message}`));
}

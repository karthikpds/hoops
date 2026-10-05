// Tiny static server for previewing the site locally:  npm start  →  http://localhost:8000
// (The page loads plays with fetch, which browsers block when index.html is opened as a file.)
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { makeBundle } from "./bundle.js";
import { sharePage } from "./share.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;  // PORT=0 picks any free port (tools/smoke.js does)
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon"
};

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (/^\/p\/[^/]+$/.test(path)) { res.writeHead(301, { location: path + "/" }).end(); return; }  // like GitHub Pages does for a folder
  if (path.endsWith("/")) path += "index.html";
  // The whole library in one file, built fresh for every request so edits to plays show up on the next reload
  if (path === "/plays/bundle.json") {
    try { res.writeHead(200, { "content-type": TYPES[".json"], "cache-control": "no-store" }).end(JSON.stringify(makeBundle())); }
    catch (e) { res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end(`Couldn't build the bundle: ${e.message}`); }
    return;
  }
  // A play's share page (tools/share.js), made on the fly like the bundle; its picture is served if one was taken
  const share = path.match(/^\/p\/([a-z0-9]+(?:-[a-z0-9]+)*)\/index\.html$/);
  if (share && existsSync(join(ROOT, "plays", share[1] + ".json"))) {
    try {
      const play = JSON.parse(await readFile(join(ROOT, "plays", share[1] + ".json"), "utf8"));
      res.writeHead(200, { "content-type": TYPES[".html"], "cache-control": "no-store" }).end(sharePage(share[1], play, { card: existsSync(join(ROOT, "p", share[1], "card.png")) }));
    } catch (e) { res.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end(`Couldn't make the share page: ${e.message}`); }
    return;
  }
  const file = join(ROOT, normalize(path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
  }
});
server.listen(PORT, "127.0.0.1", () => console.log(`Hoops Playbook running at http://localhost:${server.address().port}`));

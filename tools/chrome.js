// Drives headless Chrome over the DevTools protocol, with no dependencies (Node 22 or newer has WebSocket built in).
// Used by tools/smoke.js, which loads the pages and fails on any error, and tools/share.js, which takes a preview
// picture of every play. Set CHROME=/path/to/chrome if it isn't found.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PLACES = [
  process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
];
export const findChrome = () => PLACES.find(p => p && existsSync(p)) || null;
const sleep = ms => new Promise(ok => setTimeout(ok, ms));

/* Starts Chrome and returns { send, on, newPage, close } */
export async function launch() {
  const bin = findChrome();
  if (!bin) throw new Error("Chrome wasn't found. Install it, or set CHROME=/path/to/chrome");
  if (typeof WebSocket !== "function") throw new Error(`Node ${process.version} has no WebSocket; use Node 22 or newer`);
  const dir = mkdtempSync(join(tmpdir(), "hoops-chrome-"));
  const args = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "--no-first-run", "--no-default-browser-check",
    "--disable-gpu", "--hide-scrollbars", "--mute-audio", "--force-device-scale-factor=1", "--disable-background-timer-throttling",
    ...(process.env.CI ? ["--no-sandbox"] : []), "about:blank"];
  const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
  const url = await new Promise((ok, fail) => {
    let text = "";
    const timer = setTimeout(() => fail(new Error("Chrome didn't start within 20 s")), 20000);
    proc.stderr.on("data", d => { text += d; const m = text.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); ok(m[1]); } });
    proc.on("exit", code => { clearTimeout(timer); fail(new Error(`Chrome quit (code ${code}): ${text.slice(-400)}`)); });
  });
  const ws = new WebSocket(url);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error("Couldn't connect to Chrome")); });

  let id = 0;
  const waiting = new Map(), listeners = new Set();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) {
      const w = waiting.get(m.id); waiting.delete(m.id);
      if (m.error) w.fail(new Error(`${w.method}: ${m.error.message}`)); else w.ok(m.result);
    } else listeners.forEach(fn => fn(m));
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const n = ++id;
    waiting.set(n, { ok, fail, method });
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const on = fn => { listeners.add(fn); return () => listeners.delete(fn); };

  /* A new tab of the given size. page.problems collects uncaught errors, console errors and warnings, and failed
     requests (except Google Fonts, so the checks don't need the internet). */
  async function newPage({ width = 1280, height = 900 } = {}) {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const page = { problems: [], loaded: 0 };
    const call = (method, params) => send(method, params, sessionId);
    on(m => {
      if (m.sessionId !== sessionId) return;
      const p = m.params;
      if (m.method === "Page.loadEventFired") page.loaded++;
      else if (m.method === "Page.javascriptDialogOpening") call("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
      else if (m.method === "Runtime.exceptionThrown") page.problems.push(`uncaught ${(p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text}`);
      else if (m.method === "Runtime.consoleAPICalled" && (p.type === "error" || p.type === "warning"))
        page.problems.push(`console.${p.type === "warning" ? "warn" : "error"}: ${p.args.map(a => a.value ?? a.description ?? "").join(" ")}`);
      else if (m.method === "Log.entryAdded" && p.entry.level === "error" && !/fonts\.(googleapis|gstatic)\.com/.test(p.entry.url || ""))
        page.problems.push(`${p.entry.text}${p.entry.url ? ` (${p.entry.url})` : ""}`);
    });
    await call("Page.enable"); await call("Runtime.enable"); await call("Log.enable");
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    Object.assign(page, {
      send: call,
      /* Opens url and waits for it to load. It goes through a blank page first, because a url that only changes the
         part after # wouldn't load the page again. */
      async go(url) {
        for (const u of ["about:blank", url]) {
          const before = page.loaded, r = await call("Page.navigate", { url: u });
          if (r.errorText) throw new Error(`${u}: ${r.errorText}`);
          for (let t = 0; page.loaded === before; t += 50) { if (t > 15000) throw new Error(`${u} didn't load`); await sleep(50); }
        }
      },
      /* Runs an expression in the page (awaiting it if it's a promise) and returns its value */
      async eval(expression) {
        const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(`${expression.slice(0, 80)}…: ${(r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text}`);
        return r.result.value;
      },
      /* Waits until the expression is truthy and returns its value. On a timeout, the error shows the value of
         state, an expression that says what the page was doing. */
      async until(expression, what, ms = 8000, state = "") {
        for (let t = 0; ; t += 50) {
          const v = await page.eval(expression).catch(() => false);
          if (v) return v;
          if (t > ms) throw new Error(`Timed out waiting for ${what}${state ? ` (${await page.eval(state).catch(e => e.message)})` : ""}`);
          await sleep(50);
        }
      },
      /* A PNG of the page, as a Buffer */
      async png() { return Buffer.from((await call("Page.captureScreenshot", { format: "png" })).data, "base64"); },
      close: () => send("Target.closeTarget", { targetId })
    });
    return page;
  }

  async function close() {
    try { await send("Browser.close"); } catch { /* already gone */ }
    ws.close();
    await Promise.race([new Promise(ok => proc.once("exit", ok)), sleep(3000)]);
    if (proc.exitCode === null) proc.kill();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* Chrome may still hold a file */ }
  }
  return { send, on, newPage, close };
}

/* Starts tools/serve.js on a free port. Returns { url, stop }. */
export async function serve() {
  const proc = spawn(process.execPath, [fileURLToPath(new URL("serve.js", import.meta.url))], { env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "inherit"] });
  const url = await new Promise((ok, fail) => {
    let text = "";
    const timer = setTimeout(() => fail(new Error("tools/serve.js didn't start")), 10000);
    proc.stdout.on("data", d => { text += d; const m = text.match(/running at (http:\/\/\S+)/); if (m) { clearTimeout(timer); ok(m[1].replace(/\/?$/, "/")); } });
    proc.on("exit", code => { clearTimeout(timer); fail(new Error(`tools/serve.js quit (code ${code})`)); });
  });
  const done = new Promise(ok => proc.once("exit", ok));
  return { url, stop: () => { if (proc.exitCode === null && proc.signalCode === null) proc.kill(); return done; } };
}

// Smoke test: opens the page and the play editor in headless Chrome and fails on any error. The unit tests can't
// catch a page that crashes on load, so this clicks through every play, answers questions, opens every play in the
// editor, and checks that the site still works with the server gone.
// Run it with:  npm run smoke   (needs Chrome; set CHROME=/path/to/chrome if it isn't found)
import { readFileSync } from "node:fs";
import { launch, serve } from "./chrome.js";
import { askList, resolvePlay, teamWithBall } from "../js/playbook.js";

const ROOT = new URL("../", import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), "utf8");
const ids = JSON.parse(read("plays/index.json"));
const files = Object.fromEntries(ids.map(id => [id, read(`plays/${id}.json`)]));
const plays = Object.fromEntries(ids.map(id => [id, JSON.parse(files[id])]));
const paths = JSON.parse(read("plays/paths.json")), glossary = JSON.parse(read("plays/glossary.json"));
const CACHE = read("sw.js").match(/const CACHE = "([^"]+)"/)[1];
const S = JSON.stringify;

let failed = 0;
async function check(page, name, fn) {
  page.problems.length = 0;
  try {
    await fn();
    if (page.problems.length) throw new Error(page.problems.join("\n    "));
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n    ${e.message}`);
  }
}
const expect = (ok, msg) => { if (!ok) throw new Error(msg); };
/* Plays one play from the start at fast speed, answering its question; answer(page, frame) taps or presses the answer */
async function playThrough(page, id, answer) {
  await page.eval(`location.hash=${S(id)}`);
  await page.until(`document.getElementById("piName").textContent===${S(plays[id].name)}`, `${id} to open`);
  await page.eval(`document.querySelector('#speedSeg [data-speed="0.6"]').click();document.getElementById("btnPlay").click()`);
  await page.until(`!document.getElementById("quiz").hidden`, "the question", 20000);
  await answer();
  await page.until(`document.getElementById("caption").textContent.startsWith("Yes!")`, "the right answer to be accepted");
  await page.until(`document.getElementById("playTxt").textContent==="Again"`, `${id} to finish`, 30000);
}
const NO_NAN = `!/NaN/.test(document.getElementById("court").innerHTML+document.getElementById("court").getAttribute("viewBox"))`;

const server = await serve(), chrome = await launch();
console.log(`Smoke test on ${server.url}`);
try {
  const page = await chrome.newPage();

  await check(page, "the page loads every play", async () => {
    await page.go(server.url);
    await page.until(`document.querySelectorAll("#plays .pick").length===${ids.length}`, `${ids.length} plays in the list`);
  });

  await check(page, "every play draws every step", async () => {
    for (const id of ids) {
      await page.eval(`location.hash=${S(id)}`);
      await page.until(`document.getElementById("piName").textContent===${S(plays[id].name)}`, `${id} to open`);
      const bad = await page.eval(`(async()=>{
        const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),bad=[];
        for(const [i,d] of [...document.querySelectorAll("#dots .dot")].entries()){d.click();await frame();if(!(${NO_NAN}))bad.push(i+1);}
        return bad;})()`);
      expect(!bad.length, `${id}: step ${bad.join(", ")} drew NaN`);
    }
  });

  const firstWith = test => ids.find(id => plays[id].frames.some((fr, k) => test(fr, k, plays[id])));
  const blueAsk = firstWith((fr, k, p) => askList(fr.ask).length && teamWithBall(p.frames, k) === "o");
  const redAsk = firstWith((fr, k, p) => askList(fr.ask).length && teamWithBall(p.frames, k) === "d");
  const where = firstWith(fr => fr.where);
  const askAnswer = id => askList(plays[id].frames.find(fr => fr.ask).ask)[0];

  await check(page, `"Who's open?" in ${blueAsk}, answered with a key`, () => playThrough(page, blueAsk, () =>
    page.eval(`document.dispatchEvent(new KeyboardEvent("keydown",{key:${S(askAnswer(blueAsk)[1])},bubbles:true}))`)));

  await check(page, `"Who's open?" for red in ${redAsk}, answered with a tap`, () => playThrough(page, redAsk, () =>
    page.eval(`document.querySelector('#choices [data-id=${S(askAnswer(redAsk))}]').click()`)));

  await check(page, `"Where should … go?" in ${where}, answered with a tap on the court`, () => playThrough(page, where, async () => {
    const k = plays[where].frames.findIndex(fr => fr.where), spot = resolvePlay(plays[where], where).res[k][plays[where].frames[k].where];
    await page.eval(`(()=>{const c=document.getElementById("court"),p=new DOMPoint(${spot[0]},${spot[1]}).matrixTransform(c.getScreenCTM());
      c.dispatchEvent(new MouseEvent("click",{clientX:p.x,clientY:p.y,bubbles:true}));})()`);
  }));

  await check(page, "a full-court play follows the ball", async () => {
    const id = ids.find(i => plays[i].court === "full" && plays[i].side !== "defense");  // blue goes all the way up the court
    expect(id, "there's no full-court offense play");
    await page.eval(`location.hash=${S(id)}`);
    await page.until(`document.getElementById("piName").textContent===${S(plays[id].name)}`, `${id} to open`);
    const first = await page.eval(`document.getElementById("court").viewBox.baseVal.y`);
    await page.eval(`document.querySelectorAll("#dots .dot")[${plays[id].frames.length - 2}].click()`);
    await page.until(`Math.abs(document.getElementById("court").viewBox.baseVal.y-(${first}))>200`, "the view to move up the court", 5000,
      `"from y=${first} to "+document.getElementById("court").getAttribute("viewBox")+", "+document.getElementById("badge").textContent`);
    expect(await page.eval(NO_NAN), "the court drew NaN");
  });

  await check(page, "a path link opens the path at its first play", async () => {
    const pa = paths[paths.length - 1];
    await page.go(`${server.url}#path=${pa.id}`);
    await page.until(`document.getElementById("pathSel").value===${S(pa.id)}&&document.getElementById("piName").textContent===${S(plays[pa.plays[0]].name)}`, "the path and its first play");
    expect(await page.eval(`document.querySelectorAll("#plays .pick").length`) === pa.plays.length, "the list shows only the path's plays");
    await page.eval(`document.querySelectorAll("#plays .pick")[1].click()`);
    expect(await page.eval(`location.hash`) === `#path=${pa.id}&play=${pa.plays[1]}`, "picking a play in a path keeps the path in the address");
  });

  await check(page, "the print sheet has every step and the questions", async () => {
    const id = blueAsk;
    await page.eval(`location.hash=${S(id)}`);
    await page.until(`document.getElementById("piName").textContent===${S(plays[id].name)}`, `${id} to open`);
    const [figs, qs] = await page.eval(`(()=>{dispatchEvent(new Event("beforeprint"));const s=document.getElementById("printSheet");
      return [s.querySelectorAll("figure").length,s.querySelectorAll(".ps-q").length];})()`);
    expect(figs === plays[id].frames.length, `${figs} pictures for ${plays[id].frames.length} frames`);
    expect(qs === plays[id].frames.filter(fr => fr.ask || fr.where).length, `${qs} questions on the sheet`);
  });

  await check(page, "a play's share page has its own preview and opens the play", async () => {
    const id = ids[ids.length - 1], html = await page.eval(`fetch("p/${id}/").then(r=>r.text())`);
    expect(html.includes(`<meta property="og:title" content="${plays[id].emoji} ${plays[id].name.replace(/&/g, "&amp;")}">`), `no og:title for ${id}`);
    await page.go(`${server.url}p/${id}/`);
    await page.until(`document.getElementById("piName")&&document.getElementById("piName").textContent===${S(plays[id].name)}`, `${id} to open from its share page`);
    expect(await page.eval(`location.hash`) === `#${id}`, "the share page didn't send the address to the play");
    await page.until(`fetch("p/${id}/",{method:"HEAD"}).then(r=>r.ok)`, "share pages to be found");
  });

  await check(page, "the glossary lists every word", async () => {
    const n = await page.eval(`(()=>{document.getElementById("btnAllWords").click();const n=document.querySelectorAll("#glList dt").length;document.getElementById("glossary").close();return n;})()`);
    expect(n === glossary.length, `${n} of ${glossary.length} words`);
  });

  await check(page, "the editor opens every play and agrees with npm run build", async () => {
    await page.go(`${server.url}editor.html`);
    await page.until(`document.getElementById("openPlay").options.length>${ids.length}`, "the list of plays");
    for (const id of ids) {
      await page.eval(`(()=>{const s=document.getElementById("openPlay");s.value=${S(id)};s.dispatchEvent(new Event("change"));})()`);
      await page.until(`document.getElementById("fId").value===${S(id)}`, `${id} to open`);
      const [problems, out, nan] = await page.eval(`[document.getElementById("problems").textContent,document.getElementById("out").value,/NaN/.test(document.getElementById("edCourt").innerHTML)]`);
      expect(problems === "Looks good! This play passes every check.", `${id}: ${problems}`);
      expect(out === files[id], `${id}: the editor writes the file differently`);
      expect(!nan, `${id}: the court drew NaN`);
    }
  });

  await check(page, "the editor moves a player by dragging", async () => {
    await page.eval(`document.getElementById("btnNew").click()`);
    await page.until(`document.getElementById("fName").value==="My play"`, "a new play");
    await page.eval(`document.querySelectorAll(".ed-tab")[1].click()`);
    const [from, to] = await page.eval(`(()=>{const svg=document.querySelector("#edCourt svg"),m=svg.getScreenCTM(),g=svg.querySelector('.pl[data-id="o2"]').transform.baseVal.consolidate().matrix;
      const a=new DOMPoint(g.e,g.f).matrixTransform(m),b=new DOMPoint(330,140).matrixTransform(m);return [[a.x,a.y],[b.x,b.y]];})()`);
    const mouse = (type, [x, y], buttons) => page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: 1 });
    await mouse("mousePressed", from, 1);
    for (let i = 1; i <= 8; i++) await mouse("mouseMoved", [from[0] + (to[0] - from[0]) * i / 8, from[1] + (to[1] - from[1]) * i / 8], 1);
    await mouse("mouseReleased", to, 0);
    const out = await page.eval(`document.getElementById("out").value`);
    expect(/"o2": \[33\d, 1[34]\d\]/.test(out), `o2 didn't move to about [330, 140]:\n${out}`);
  });

  await check(page, "the editor won't save a play named like one of the site's files", async () => {
    const [problems, tip] = await page.eval(`(()=>{const f=document.getElementById("fName");f.value="Paths";f.dispatchEvent(new Event("input"));
      document.getElementById("btnDownload").click();return [document.getElementById("problems").textContent,document.getElementById("saveTip").textContent];})()`);
    expect(problems.includes(`"paths" is taken`), `no error about the name: ${problems}`);
    expect(tip.includes("Pick another file name"), `downloaded anyway: ${tip}`);
  });

  await check(page, "the site still works offline after one visit", async () => {
    await page.go(`${server.url}?offline`);
    await page.until(`navigator.serviceWorker.ready.then(()=>caches.open(${S(CACHE)})).then(c=>c.match("plays/bundle.json")).then(r=>!!r)`, "the offline copy to be saved", 15000);
    await page.until(`document.querySelectorAll("#plays .pick").length===${ids.length}`, "the plays");
    await server.stop();
    await page.send("Network.enable");
    await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    page.problems.length = 0;
    await page.go(`${server.url}?offline#${ids[0]}`);
    await page.until(`document.querySelectorAll("#plays .pick").length===${ids.length}`, "the plays, from the offline copy");
    expect(await page.eval(`!document.getElementById("offline").hidden`), `the "No internet" note isn't showing`);
    page.problems.splice(0, Infinity, ...page.problems.filter(p => !/ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED/.test(p)));
  });
} finally {
  await chrome.close();
  await server.stop();
}
console.log(failed ? `\n${failed} check${failed === 1 ? "" : "s"} failed.` : "\n✓ All smoke checks passed.");
process.exit(failed ? 1 : 0);

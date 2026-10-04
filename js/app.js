// The page: loads the plays listed in plays/index.json, runs the library (search, level filter, links)
// and animates the selected play on the court. The court drawing itself lives in court.js.
import { LEVELS as LV, askList, checkPlay, dist, isThree, resolvePlay, searchPlays, startHolder } from "./playbook.js";
import { ballState, bubblesAt, bubblesSVG, courtBackground, courtView, esc, f1, pathsUpTo, playerSVG, playersAt, renderCourt, screensAt, stepAt, wallsSVG } from "./court.js";

const NS="http://www.w3.org/2000/svg";

/* DOM */
const $=id=>document.getElementById(id);
$("lyPaths").insertAdjacentHTML("beforebegin",courtBackground(true));
const lyPaths=$("lyPaths"),lyWalls=$("lyWalls"),lyPlayers=$("lyPlayers"),lyBub=$("lyBub"),lyFx=$("lyFx");
const ballEl=$("ball"),shadowEl=$("bshadow"),netEl=$("net");
const capEl=$("caption"),badgeEl=$("badge"),dotsEl=$("dots"),playsEl=$("plays");
const btnPlay=$("btnPlay"),btnBack=$("btnBack"),btnNext=$("btnNext"),btnRestart=$("btnRestart"),nextPlayBtn=$("nextPlay");
const playIcon=$("playIcon"),playTxt=$("playTxt");
const qEl=$("q"),countEl=$("count"),shareBtn=$("btnShare"),printBtn=$("btnPrint"),courtEl=$("court");
const quizEl=$("quiz"),choicesEl=$("choices"),followEl=$("follow"),printEl=$("printSheet"),speakBtn=$("togS");
const ICON_PLAY='<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 4.8v14.4a1 1 0 0 0 1.52.85l11.3-7.2a1 1 0 0 0 0-1.7L8.52 3.95A1 1 0 0 0 7 4.8z"/></svg>';
const ICON_PAUSE='<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="5.5" y="4.5" width="4.6" height="15" rx="1.6"/><rect x="13.9" y="4.5" width="4.6" height="15" rx="1.6"/></svg>';
const ICON_AGAIN='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4v5h5"/></svg>';

/* State */
let plays=[],view=[],query="",level=0,listVer=0;
let cur=0,p=0,target=0,playing=false,holdUntil=0,speed=1,showD=true,showL=true;
let els={},lastPathKey="",lastCapKey="",lastUI="",lastT=performance.now(),shareTimer=0;
let vb=[-14,-14,514,484];  // court view as x0,y0,x1,y1
let quizOn=true,quiz=null,answered=new Set(),curP={};  // "Who's open?" mode; quiz is the question on screen, if any
let follow="";  // the one player being followed; everyone else fades
let speakOn=false,speakUntil=0,speakTok=0;  // read aloud; speakUntil is when the current caption should be done
const HOLD=1500;

/* Loading: plays/index.json lists the play ids; each play lives in plays/<id>.json */
async function loadPlays(){
  const res=await fetch("plays/index.json",{cache:"no-cache"});
  if(!res.ok)throw new Error("plays/index.json: HTTP "+res.status);
  const ids=await res.json();
  const loaded=await Promise.all(ids.map(async id=>{
    try{
      const r=await fetch(`plays/${encodeURIComponent(id)}.json`,{cache:"no-cache"});
      if(!r.ok)throw new Error("HTTP "+r.status);
      const raw=await r.json(),errs=checkPlay(raw);
      if(errs.length)throw new Error(errs.join("; "));
      return resolvePlay(raw,id);
    }catch(e){console.warn(`Skipped play "${id}": ${e.message}`);return null;}
  }));
  return loaded.filter(Boolean);
}

/* Library: search box, level filter, and the row of play chips */
function refreshList(){
  view=searchPlays(plays,query,level);listVer++;
  playsEl.innerHTML="";
  view.forEach((pl,i)=>{
    const b=document.createElement("button");
    b.className="pick"+(query.trim()&&i===0?" hit":"");b.type="button";b.dataset.id=pl.id;
    b.setAttribute("aria-pressed",String(pl===plays[cur]));
    b.innerHTML=`<span class="pe" aria-hidden="true">${esc(pl.emoji)}</span><span><span class="pn">${esc(pl.name)}</span><span class="pl2">${LV[pl.level]}${pl.side==="defense"?" · Defense":""}</span></span>`;
    b.addEventListener("click",()=>selectPlay(plays.indexOf(pl)));
    playsEl.appendChild(b);
  });
  if(!view.length){
    playsEl.innerHTML=`<p class="empty">No ${level?LV[level].toLowerCase()+" ":""}plays match${query.trim()?` “${esc(query.trim())}”`:""}. <button type="button" class="linkbtn" id="btnClear">Show all plays</button></p>`;
    $("btnClear").addEventListener("click",()=>{setLevel(0);setQuery("");});
  }
  const n=plays.length,word=k=>k+(k===1?" play":" plays");
  countEl.textContent=view.length===n?word(n):`${view.length} of ${word(n)}`;
}
function setQuery(s){qEl.value=s;query=s;refreshList();}
function setLevel(l){
  level=l;
  document.querySelectorAll("#lvSeg button").forEach(x=>x.setAttribute("aria-pressed",String(+x.dataset.level===l)));
  refreshList();
}
function chipFor(pl){return playsEl.querySelector(`.pick[data-id="${pl.id}"]`);}
/* Scroll the play list (only the list, never the page) so this play is in view.
   The list scrolls down in the side panel, and sideways on phones. */
function revealChip(pl,smooth){
  const c=chipFor(pl);if(!c)return;
  const r=c.getBoundingClientRect(),box=playsEl.getBoundingClientRect();
  const dx=r.left<box.left||r.right>box.right?r.left-box.left-8:0;
  const dy=r.top<box.top||r.bottom>box.bottom?r.top-box.top-8:0;
  if(dx||dy)playsEl.scrollBy({left:dx,top:dy,behavior:smooth?"smooth":"auto"});
}

function buildPlayers(){
  lyPlayers.innerHTML=plays[cur].cast.map(id=>playerSVG(id)).join("");
  els={};lyPlayers.querySelectorAll(".pl").forEach(g=>{els[g.dataset.id]=g;});
}

function buildDots(){
  dotsEl.innerHTML="";
  const n=plays[cur].frames.length-1;
  for(let j=1;j<=n;j++){
    const d=document.createElement("button");
    d.className="dot";d.type="button";d.setAttribute("aria-label","Go to step "+j);
    d.addEventListener("click",()=>{playing=false;holdUntil=0;p=j;target=j;quiz=null;});
    dotsEl.appendChild(d);
  }
}

/* "Follow" picks one player on your team (blue, or red in a defense play); everyone else fades */
const team=pl=>pl.side==="defense"?"d":"o";
function buildFollow(){
  const pl=plays[cur],tm=team(pl);
  followEl.innerHTML=`<span class="fl" aria-hidden="true">👀 Follow</span><div class="seg">`+
    [["","Everyone"],...pl.cast.filter(id=>id[0]===tm).sort().map(id=>[id,(tm==="d"?"X":"")+id.slice(1)])]
      .map(([id,t])=>`<button type="button" data-id="${id}" aria-pressed="${id===follow}"${id?` class="fp ${tm==="d"?"fd":"fo"}" aria-label="Follow ${tm==="d"?"defender X":"player "}${id.slice(1)}"`:""}>${t}</button>`).join("")+"</div>";
}
function setFollow(id){
  follow=id===follow?"":id;
  followEl.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.id===follow)));
}

function fillInfo(){
  const pl=plays[cur],dfn=pl.side==="defense";
  $("piEmoji").textContent=pl.emoji;
  $("piName").textContent=pl.name;
  $("piLvl").innerHTML=[1,2,3].map(i=>`<i class="${i<=pl.level?"on":""}"></i>`).join("")+`<span>${LV[pl.level]}</span>`;
  $("piTags").innerHTML=pl.tags.map(t=>`<button type="button" class="tag" title="Find more ${esc(t)} plays">${esc(t)}</button>`).join("");
  $("piSide").hidden=!dfn;
  $("piIdea").textContent=pl.idea;
  $("piWhy").textContent=pl.why;
  $("piTry").textContent=pl.tryit;
  $("lgBlue").textContent=dfn?"Blue is the other team this time. The number tells you which player.":"Blue is your team. The number tells you which player.";
  $("lgRed").textContent=dfn?"Red is your team! X1 guards player 1.":"Red is the defense. X1 guards player 1.";
}

/* updateUrl=false leaves the address bar alone (used on first load, so a bare URL stays bare) */
function selectPlay(i,updateUrl=true){
  cur=i;p=0;target=0;playing=false;holdUntil=0;quiz=null;answered.clear();follow="";
  frameCourt(plays[i]);buildPlayers();buildDots();buildFollow();fillInfo();
  lyFx.innerHTML="";lastPathKey="";lastCapKey="";lastUI="";
  playsEl.querySelectorAll(".pick").forEach(c=>c.setAttribute("aria-pressed",String(c.dataset.id===plays[i].id)));
  revealChip(plays[i],updateUrl);  // smooth when someone picks a play, instant on first load
  if(updateUrl)history.replaceState(null,"","#"+plays[i].id);
  document.title=`${plays[i].name} · Hoops Playbook`;
}
function frameCourt(play){
  vb=courtView(play);
  courtEl.setAttribute("viewBox",`${vb[0]} ${vb[1]} ${vb[2]-vb[0]} ${vb[3]-vb[1]}`);
}
function indexFromHash(){
  let id="";try{id=decodeURIComponent(location.hash.slice(1));}catch{}
  return plays.findIndex(pl=>pl.id===id);
}

/* Screens, box outs and speech bubbles. Bubbles stay hidden while a question is up, so "I'm open!" doesn't give the answer away. */
function drawOverlay(play,P){
  lyWalls.innerHTML=wallsSVG(screensAt(play,p),P);
  const {bub,op}=quiz?{bub:null,op:1}:bubblesAt(play,p);
  const shown=bub&&Object.fromEntries(Object.entries(bub).filter(([id])=>showD||id[0]!=="d"));
  lyBub.innerHTML=shown?bubblesSVG(shown,P,vb,op):"";
}

/* Score celebration */
function celebrate(points){
  const g=document.createElementNS(NS,"g");
  let h=`<g transform="translate(250 150)"><g class="pop"><text class="fx-pts" text-anchor="middle" y="0">+${points}</text><text class="fx-word" text-anchor="middle" y="30">${points===3?"Swish! Three!":"Bucket!"}</text></g></g>`;
  const cols=["#FFC93C","#2459E0","#FFFFFF","#F7811F"];
  for(let i=0;i<18;i++){
    const ang=(.12+.76*Math.random())*Math.PI,r=45+Math.random()*60;
    h+=`<circle class="conf" cx="250" cy="56" r="${f1(2.5+Math.random()*2.5)}" fill="${cols[i%4]}" style="--dx:${f1(Math.cos(ang)*r)}px;--dy:${f1(Math.sin(ang)*r)}px;animation-delay:${Math.round(Math.random()*90)}ms"/>`;
  }
  g.innerHTML=h;lyFx.appendChild(g);
  netEl.classList.remove("swish");void netEl.getBoundingClientRect();netEl.classList.add("swish");
  setTimeout(()=>g.remove(),1900);
}
/* A word that pops up over a player, like "Yes!" or "Rebound!" */
function cheer(q,word="Yes!"){
  const g=document.createElementNS(NS,"g"),y=q[1]-38<vb[1]+16?q[1]+50:q[1]-30;
  g.innerHTML=`<g transform="translate(${f1(q[0])} ${f1(y)})"><g class="pop"><text class="fx-word" text-anchor="middle">${esc(word)}</text></g></g>`;
  lyFx.appendChild(g);setTimeout(()=>g.remove(),1900);
}

/* Captions: {1} is a blue chip, {X1} a red chip, *word* a highlighted keyword */
function fmt(s){
  return esc(s).replace(/\*([^*]+)\*/g,'<span class="kw">$1</span>')
          .replace(/\{(X?)(\d)\}/g,(m,x,d)=>`<b class="chip ${x?"cd":"co"}">${x?"X":""}${d}</b>`);
}

/* Read aloud: each new caption is spoken, and while playing the next step waits for the voice to finish.
   speakUntil is a safety net in case a browser never reports the end of an utterance. */
const canSpeak="speechSynthesis" in window&&typeof SpeechSynthesisUtterance==="function";
function speak(s){
  if(!speakOn)return;
  const tok=++speakTok,u=new SpeechSynthesisUtterance(s.replace(/\{X(\d)\}/g,"X $1").replace(/\{(\d)\}/g,"$1").replace(/\*/g,""));
  u.rate=.95;u.onend=u.onerror=()=>{if(tok===speakTok)speakUntil=0;};
  speechSynthesis.cancel();speechSynthesis.speak(u);
  speakUntil=performance.now()+Math.min(15000,1500+s.length*85);
}
function setSpeak(on){
  speakOn=on;speakBtn.setAttribute("aria-pressed",String(on));
  speakTok++;speakUntil=0;speechSynthesis.cancel();
  if(on)speak(capText());
}

/* "Who's open?" mode: before a step with "ask", the play stops and waits for a tap on the open player */
const chipOf=id=>`{${id[0]==="d"?"X":""}${id.slice(1)}}`;
const asking=()=>!!quiz&&quiz.state!=="right";
function needsAsk(play,k){return quizOn&&k<play.frames.length&&askList(play.frames[k].ask).length>0&&!answered.has(k);}
function startAsk(k){
  const play=plays[cur],b=play.frames[k].ball,holder=startHolder(b);
  quiz={k,state:"ask",tries:0,hit:"",open:askList(play.frames[k].ask),holder,resumePlaying:playing,resumeTarget:target,
    msg:b.pass?`Who’s open? Tap the player ${chipOf(holder)} should pass to.`:"Who’s open? Tap the open player."};
  playing=false;target=p;holdUntil=0;
  choicesEl.innerHTML=play.cast.filter(id=>id[0]==="o").sort().map(id=>
    `<button type="button" class="choice" data-id="${id}" aria-label="Player ${id.slice(1)}">${id.slice(1)}</button>`).join("");
}
function answer(id){
  if(!asking())return;
  if(quiz.open.includes(id)){quiz.msg=`Yes! ${chipOf(id)} is open!`;reveal(id);cheer(curP[id]);return;}
  quiz.state="wrong";quiz.tries++;
  if(id===quiz.holder)quiz.msg=`${chipOf(id)} has the ball! Who should ${chipOf(id)} pass to?`;
  else{
    let near="",nd=80;
    if(showD)plays[cur].cast.forEach(d=>{if(d[0]==="d"&&dist(curP[id],curP[d])<nd){nd=dist(curP[id],curP[d]);near=d;}});
    quiz.msg=near?`Not ${chipOf(id)}. ${chipOf(near)} is right there. Try again!`:`Not ${chipOf(id)}. Look for the player with the most space. Try again!`;
  }
  const c=choicesEl.querySelector(`[data-id="${id}"]`);if(c){c.classList.add("no");shake(c);}
  shake(els[id].firstChild);
}
/* Right answer or "Show me": mark the open player, then carry on the way the play was going */
function reveal(id){
  quiz.state="right";quiz.hit=id;answered.add(quiz.k);
  playing=quiz.resumePlaying;target=quiz.resumeTarget;holdUntil=performance.now()+1200;
}
function showAnswer(){
  if(!asking())return;
  quiz.msg=`${chipOf(quiz.open[0])} is the open one. Watch!`;reveal(quiz.open[0]);
}
function shake(el){el.classList.remove("nope");void el.getBoundingClientRect();el.classList.add("nope");}
/* A tap on the court picks the nearest player: during a question it answers it, otherwise it follows a player on your team.
   Tapping near a player counts too, which is kinder to small fingers than hitting the circle exactly. */
function tapCourt(e){
  const m=courtEl.getScreenCTM();if(!m)return;
  const pt=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse()),ask=asking();
  const side=ask?"o":team(plays[cur]);
  let best="",bd=ask?48:30;
  plays[cur].cast.forEach(id=>{if(id[0]===side&&(showD||id[0]!=="d")&&dist([pt.x,pt.y],curP[id])<bd){bd=dist([pt.x,pt.y],curP[id]);best=id;}});
  if(best){if(ask)answer(best);else setFollow(best);}
}

/* Print sheet: every step of the play as a small court with its caption, built for the current play right before printing */
function buildPrintSheet(){
  if(!plays.length)return;
  const pl=plays[cur],link=location.href.split("#")[0]+"#"+pl.id;
  printEl.innerHTML=`<header><span class="ps-emoji">${esc(pl.emoji)}</span><div><h1>${esc(pl.name)}</h1><p>${LV[pl.level]}${pl.side==="defense"?" · Defense play":""}</p></div></header>`+
    `<p class="ps-idea">${esc(pl.idea)}</p><div class="ps-grid">`+
    pl.frames.map((fr,j)=>`<figure>${renderCourt(pl,j,{label:`${pl.name}, ${j?"step "+j:"start"}`})}<figcaption><b>${j?"Step "+j:"Start"}</b> ${fmt(fr.say)}</figcaption></figure>`).join("")+
    `</div><div class="ps-notes"><div><h2>💡 Why it works</h2><p>${esc(pl.why)}</p></div><div><h2>🏀 Try it at practice</h2><p>${esc(pl.tryit)}</p></div></div>`+
    `<p class="ps-foot">Hoops Playbook · ${esc(link)}</p>`;
}

/* Render */
const capText=()=>{const play=plays[cur];return quiz?quiz.msg:play.frames[p<=0?0:stepAt(p).k].say;};
function render(now){
  const play=plays[cur],n=play.frames.length-1,{k,t}=stepAt(p),P=playersAt(play,k,t);curP=P;
  play.cast.forEach(id=>{
    const q=P[id],g=els[id];g.setAttribute("transform",`translate(${f1(q[0])} ${f1(q[1])})`);
    if(id[0]==="d")g.style.display=showD?"":"none";
  });
  const bs=ballState(play,k,t,P,now);
  ballEl.setAttribute("transform",`translate(${f1(bs.g[0])} ${f1(bs.g[1]-bs.h)}) scale(${bs.s.toFixed(3)})`);
  shadowEl.setAttribute("cx",f1(bs.g[0]));shadowEl.setAttribute("cy",f1(bs.g[1]+2));
  const sh=Math.max(.35,1-bs.h/110);
  shadowEl.setAttribute("rx",f1(7*sh));shadowEl.setAttribute("ry",f1(3.2*sh));
  play.cast.forEach(id=>els[id].classList.toggle("has",bs.holder===id));
  drawOverlay(play,P);

  const stepIdx=p<=0?0:k,fl=asking()?"":follow;
  const pk=cur+"|"+stepIdx+"|"+showL+"|"+fl;
  if(pk!==lastPathKey){lyPaths.innerHTML=showL?pathsUpTo(play,stepIdx,fl):"";lastPathKey=pk;}

  const ck=cur+"|"+stepIdx+"|"+(quiz?quiz.state+quiz.tries+quiz.msg:"");
  if(ck!==lastCapKey){
    const text=quiz?quiz.msg:play.frames[stepIdx].say;
    capEl.innerHTML=fmt(text);
    capEl.classList.remove("fresh");void capEl.offsetWidth;capEl.classList.add("fresh");
    lastCapKey=ck;speak(text);
  }
  updateUI(play,n,stepIdx,fl);
}
/* The play after this one: within the search results when there are several, else the whole library */
function nextUp(){
  const pool=view.length>1?view:plays,i=pool.indexOf(plays[cur]);
  return {pl:pool[(i+1)%pool.length],wrapped:i===pool.length-1};
}
function updateUI(play,n,stepIdx,fl){
  const done=p>=n,ask=asking();
  const st=[cur,playing,done,stepIdx,p<=0,listVer,quiz?quiz.state+quiz.tries:"",fl].join("|");
  if(st===lastUI)return;lastUI=st;
  if(playing){playIcon.innerHTML=ICON_PAUSE;playTxt.textContent="Pause";}
  else if(done){playIcon.innerHTML=ICON_AGAIN;playTxt.textContent="Again";}
  else{playIcon.innerHTML=ICON_PLAY;playTxt.textContent="Play";}
  btnPlay.classList.toggle("nudge",p<=0&&!playing&&!ask);
  btnPlay.disabled=ask;btnBack.disabled=p<=0;btnNext.disabled=done||ask;
  badgeEl.textContent=ask?"Your turn":stepIdx===0?"Start":`Step ${stepIdx} of ${n}`;
  badgeEl.classList.toggle("turn",ask);
  quizEl.hidden=!quiz;dotsEl.hidden=!!quiz;courtEl.classList.toggle("asking",ask);
  [...choicesEl.children].forEach(c=>{c.disabled=!ask;c.classList.toggle("yes",!!quiz&&quiz.hit===c.dataset.id);});
  play.cast.forEach(id=>{
    els[id].classList.toggle("yes",!!quiz&&quiz.hit===id);
    els[id].classList.toggle("dim",!!fl&&fl!==id);
  });
  [...dotsEl.children].forEach((d,i)=>{
    const j=i+1;d.classList.toggle("done",stepIdx>0&&j<=stepIdx);d.classList.toggle("now",j===stepIdx);
  });
  if(done&&!playing&&plays.length>1){
    const {pl,wrapped}=nextUp();
    nextPlayBtn.textContent=wrapped?`🎉 You finished them all! Start again with ${pl.name}`:`🎉 Nice! Next play: ${pl.name}`;
    nextPlayBtn.hidden=false;
  } else nextPlayBtn.hidden=true;
}

/* Animation loop */
function stepDur(play,k){
  const b=play.frames[k].ball;
  if(b.shot)return b.miss?1500:1300;
  const moved=play.cast.some(id=>dist(play.res[k-1][id],play.res[k][id])>3);
  return moved||b.rebound?1800:1000;
}
/* End-of-step effects: points for a made shot, "Rebound!" for a rebound */
function stepEnded(play,k){
  const b=play.frames[k].ball;
  if(b.shot&&!b.miss)celebrate(isThree(play.res[k][b.shot])?3:2);
  if(b.rebound)cheer(play.res[k][b.rebound],"Rebound!");
}
function tick(now){
  const dt=Math.min(60,now-lastT);lastT=now;
  const play=plays[cur],atStart=Math.abs(p-Math.round(p))<1e-9;
  // A step with a question asks it as soon as the step before ends, without waiting out the hold
  if(p<target&&!quiz&&atStart&&needsAsk(play,Math.round(p)+1))startAsk(Math.round(p)+1);
  // While playing with read aloud on, the next step waits until the caption has been read
  const waitVoice=playing&&atStart&&p>0&&speakOn&&now<speakUntil;
  if(p<target&&now>=holdUntil&&!waitVoice){
    quiz=null;
    const k=Math.floor(p+1e-9)+1;
    let np=p+dt/(stepDur(play,k)*speed);
    // Snap when within rounding error of the step's end; otherwise p can stall at 1.9999999999999998 and k overshoots
    if(np>=k-1e-9){
      np=k;stepEnded(play,k);
      if(playing&&k<target)holdUntil=now+HOLD*speed;
    }
    p=Math.min(np,target);
    if(p>=target)playing=false;
  }
  render(now);
  requestAnimationFrame(tick);
}

/* Controls */
function togglePlay(){
  const n=plays[cur].frames.length-1;
  if(asking())return;
  if(playing){playing=false;target=p;holdUntil=0;return;}
  if(p>=n){p=0;lyFx.innerHTML="";answered.clear();quiz=null;}
  playing=true;target=n;holdUntil=0;
}
function stepNext(){
  const n=plays[cur].frames.length-1;
  if(asking())return;
  playing=false;holdUntil=0;
  target=Math.min(n,Math.floor(p+1e-9)+1);
}
function stepBack(){
  playing=false;holdUntil=0;quiz=null;
  const fl=Math.floor(p+1e-9);
  p=Math.abs(p-fl)<1e-6?Math.max(0,fl-1):fl;target=p;
}
btnPlay.addEventListener("click",togglePlay);
btnNext.addEventListener("click",stepNext);
btnBack.addEventListener("click",stepBack);
btnRestart.addEventListener("click",()=>{p=0;target=0;playing=false;holdUntil=0;lyFx.innerHTML="";quiz=null;answered.clear();});
nextPlayBtn.addEventListener("click",()=>{
  const {pl}=nextUp();selectPlay(plays.indexOf(pl));
});
document.querySelectorAll("#speedSeg button").forEach(b=>{
  b.addEventListener("click",()=>{
    speed=parseFloat(b.dataset.speed);
    document.querySelectorAll("#speedSeg button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
  });
});
$("togD").addEventListener("click",e=>{showD=!showD;e.currentTarget.setAttribute("aria-pressed",String(showD));});
$("togL").addEventListener("click",e=>{showL=!showL;e.currentTarget.setAttribute("aria-pressed",String(showL));});
$("togQ").addEventListener("click",e=>{
  quizOn=!quizOn;e.currentTarget.setAttribute("aria-pressed",String(quizOn));
  if(!quizOn&&quiz){if(asking()){playing=quiz.resumePlaying;target=quiz.resumeTarget;}quiz=null;}
});
if(canSpeak){speakBtn.hidden=false;speakBtn.addEventListener("click",()=>setSpeak(!speakOn));}
choicesEl.addEventListener("click",e=>{const c=e.target.closest(".choice");if(c)answer(c.dataset.id);});
$("btnShow").addEventListener("click",showAnswer);
followEl.addEventListener("click",e=>{const b=e.target.closest("button");if(b)setFollow(b.dataset.id||"");});
courtEl.addEventListener("click",tapCourt);
printBtn.addEventListener("click",()=>{buildPrintSheet();window.print();});
window.addEventListener("beforeprint",buildPrintSheet);

/* Library controls */
qEl.addEventListener("input",()=>{query=qEl.value;refreshList();});
qEl.addEventListener("keydown",e=>{
  if(e.key==="Enter"){
    e.preventDefault();
    if(!view.length)return;
    selectPlay(plays.indexOf(view[0]));togglePlay();qEl.blur();
    document.querySelector(".stage").scrollIntoView({block:"nearest",behavior:"smooth"});
  } else if(e.key==="Escape"){
    if(qEl.value){e.preventDefault();setQuery("");}else qEl.blur();
  }
});
document.querySelectorAll("#lvSeg button").forEach(b=>b.addEventListener("click",()=>setLevel(+b.dataset.level)));
$("piTags").addEventListener("click",e=>{
  const t=e.target.closest(".tag");if(!t)return;
  setLevel(0);setQuery(t.textContent);
  document.querySelector(".library").scrollIntoView({block:"nearest",behavior:"smooth"});
});
shareBtn.addEventListener("click",async()=>{
  const tip=$("shareTip");
  try{await navigator.clipboard.writeText(location.href.split("#")[0]+"#"+plays[cur].id);tip.textContent="Link copied!";}
  catch{history.replaceState(null,"","#"+plays[cur].id);tip.textContent="Copy it from the address bar";}
  shareBtn.classList.add("copied");
  clearTimeout(shareTimer);shareTimer=setTimeout(()=>shareBtn.classList.remove("copied"),1800);
});
window.addEventListener("hashchange",()=>{const i=indexFromHash();if(i>=0&&i!==cur)selectPlay(i);});

document.addEventListener("keydown",e=>{
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const el=e.target;
  if(el&&(el.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)))return;
  if(e.key==="/"){e.preventDefault();qEl.focus();qEl.select();return;}
  if(!plays.length)return;
  if(asking()&&/^[1-5]$/.test(e.key)){
    if(plays[cur].cast.includes("o"+e.key)){e.preventDefault();answer("o"+e.key);}
    return;
  }
  const onBtn=el&&el.closest&&el.closest("button");
  if(e.key===" "){if(onBtn)return;e.preventDefault();togglePlay();}
  else if(e.key==="ArrowRight"){e.preventDefault();stepNext();}
  else if(e.key==="ArrowLeft"){e.preventDefault();stepBack();}
});

/* Start */
try{plays=await loadPlays();}catch(e){console.error(e);}
if(!plays.length){
  if(location.protocol!=="file:")capEl.innerHTML="Couldn’t load any plays. Check <b>plays/index.json</b> and the browser console for details.";
  countEl.textContent="0 plays";
} else {
  refreshList();
  const i=indexFromHash();selectPlay(Math.max(i,0),false);
  btnPlay.disabled=false;btnRestart.disabled=false;shareBtn.hidden=false;printBtn.hidden=false;
  requestAnimationFrame(t=>{lastT=t;tick(t);});
}

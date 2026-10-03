// The page: loads the plays listed in plays/index.json, runs the library (search, level filter, links)
// and animates the selected play on the court.
import { BASKET as B, LEVELS as LV, checkPlay, dist, ease, isThree, posAt, resolvePlay, searchPlays } from "./playbook.js";

const NS="http://www.w3.org/2000/svg";
const f1=v=>v.toFixed(1);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);

/* DOM */
const $=id=>document.getElementById(id);
const lyPaths=$("lyPaths"),lyWalls=$("lyWalls"),lyPlayers=$("lyPlayers"),lyBub=$("lyBub"),lyFx=$("lyFx");
const ballEl=$("ball"),shadowEl=$("bshadow"),netEl=$("net");
const capEl=$("caption"),badgeEl=$("badge"),dotsEl=$("dots"),playsEl=$("plays");
const btnPlay=$("btnPlay"),btnBack=$("btnBack"),btnNext=$("btnNext"),btnRestart=$("btnRestart"),nextPlayBtn=$("nextPlay");
const playIcon=$("playIcon"),playTxt=$("playTxt");
const qEl=$("q"),countEl=$("count"),shareBtn=$("btnShare");
const ICON_PLAY='<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 4.8v14.4a1 1 0 0 0 1.52.85l11.3-7.2a1 1 0 0 0 0-1.7L8.52 3.95A1 1 0 0 0 7 4.8z"/></svg>';
const ICON_PAUSE='<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="5.5" y="4.5" width="4.6" height="15" rx="1.6"/><rect x="13.9" y="4.5" width="4.6" height="15" rx="1.6"/></svg>';
const ICON_AGAIN='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4v5h5"/></svg>';

/* State */
let plays=[],view=[],query="",level=0,listVer=0;
let cur=0,p=0,target=0,playing=false,holdUntil=0,speed=1,showD=true,showL=true;
let els={},lastPathKey="",lastCapKey="",lastUI="",lastT=performance.now(),shareTimer=0;
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
    b.innerHTML=`<span class="pe" aria-hidden="true">${esc(pl.emoji)}</span><span><span class="pn">${esc(pl.name)}</span><span class="pl2">${LV[pl.level]}</span></span>`;
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
/* Scroll the chip row (only the row, never the page) so this play's chip is in view */
function revealChip(pl,smooth){
  const c=chipFor(pl);if(!c)return;
  const r=c.getBoundingClientRect(),box=playsEl.getBoundingClientRect();
  if(r.left<box.left||r.right>box.right)playsEl.scrollTo({left:playsEl.scrollLeft+r.left-box.left-8,behavior:smooth?"smooth":"auto"});
}

function buildPlayers(){
  lyPlayers.innerHTML="";els={};
  plays[cur].cast.forEach(id=>{
    const off=id[0]==="o",num=id.slice(1);
    const g=document.createElementNS(NS,"g");
    g.setAttribute("class","pl "+(off?"po":"pd"));
    g.innerHTML=(off?'<circle class="halo" r="25"/>':"")+
      '<circle class="sh" cx="1.5" cy="3.5" r="17"/><circle class="body" r="17"/>'+
      `<text class="lbl" y="1" text-anchor="middle" dominant-baseline="central">${off?num:"X"+num}</text>`;
    lyPlayers.appendChild(g);els[id]=g;
  });
}

function buildDots(){
  dotsEl.innerHTML="";
  const n=plays[cur].frames.length-1;
  for(let j=1;j<=n;j++){
    const d=document.createElement("button");
    d.className="dot";d.type="button";d.setAttribute("aria-label","Go to step "+j);
    d.addEventListener("click",()=>{playing=false;holdUntil=0;p=j;target=j;});
    dotsEl.appendChild(d);
  }
}

function fillInfo(){
  const pl=plays[cur];
  $("piEmoji").textContent=pl.emoji;
  $("piName").textContent=pl.name;
  $("piLvl").innerHTML=[1,2,3].map(i=>`<i class="${i<=pl.level?"on":""}"></i>`).join("")+`<span>${LV[pl.level]}</span>`;
  $("piTags").innerHTML=pl.tags.map(t=>`<button type="button" class="tag" title="Find more ${esc(t)} plays">${esc(t)}</button>`).join("");
  $("piIdea").textContent=pl.idea;
  $("piWhy").textContent=pl.why;
  $("piTry").textContent=pl.tryit;
}

/* updateUrl=false leaves the address bar alone (used on first load, so a bare URL stays bare) */
function selectPlay(i,updateUrl=true){
  cur=i;p=0;target=0;playing=false;holdUntil=0;
  buildPlayers();buildDots();fillInfo();
  lyFx.innerHTML="";lastPathKey="";lastCapKey="";lastUI="";
  playsEl.querySelectorAll(".pick").forEach(c=>c.setAttribute("aria-pressed",String(c.dataset.id===plays[i].id)));
  revealChip(plays[i],true);
  if(updateUrl)history.replaceState(null,"","#"+plays[i].id);
  document.title=`${plays[i].name} · Hoops Playbook`;
}
function indexFromHash(){
  let id="";try{id=decodeURIComponent(location.hash.slice(1));}catch{}
  return plays.findIndex(pl=>pl.id===id);
}

/* Geometry */
function sampleQ(a,c,b,N){
  N=N||40;const out=[];
  for(let i=0;i<=N;i++){const e=i/N;
    if(c){const u=1-e;out.push([u*u*a[0]+2*u*e*c[0]+e*e*b[0],u*u*a[1]+2*u*e*c[1]+e*e*b[1]]);}
    else out.push([a[0]+(b[0]-a[0])*e,a[1]+(b[1]-a[1])*e]);}
  return out;
}
function cumLen(pts){const L=[0];for(let i=1;i<pts.length;i++)L.push(L[i-1]+dist(pts[i-1],pts[i]));return L;}
function pointAt(pts,L,s){
  if(s<=0)return pts[0].slice();
  const T=L[L.length-1];if(s>=T)return pts[pts.length-1].slice();
  let i=1;while(L[i]<s)i++;
  const r=(s-L[i-1])/((L[i]-L[i-1])||1);
  return [pts[i-1][0]+(pts[i][0]-pts[i-1][0])*r,pts[i-1][1]+(pts[i][1]-pts[i-1][1])*r];
}
function trimmed(pts,s0,s1){
  const L=cumLen(pts),T=L[L.length-1],a=s0,b=T-s1;
  if(b-a<8)return null;
  const out=[];for(let s=a;s<b;s+=3)out.push(pointAt(pts,L,s));out.push(pointAt(pts,L,b));
  return out;
}
function zig(tp){
  const n=tp.length,out=[];
  for(let i=0;i<n;i++){
    const a=tp[Math.max(0,i-1)],b=tp[Math.min(n-1,i+1)];
    let dx=b[0]-a[0],dy=b[1]-a[1];const L=Math.hypot(dx,dy)||1;dx/=L;dy/=L;
    const taper=Math.max(0,Math.min(1,(n-1-i)*3/14,i*3/6));
    const off=5.5*Math.sin(2*Math.PI*(i*3)/14)*taper;
    out.push([tp[i][0]-dy*off,tp[i][1]+dx*off]);
  }
  return out;
}
const toD=pts=>"M"+pts.map(q=>f1(q[0])+" "+f1(q[1])).join(" L");
function endDir(tp){
  const n=tp.length,E=tp[n-1],S=tp[Math.max(0,n-4)];
  let dx=E[0]-S[0],dy=E[1]-S[1];const L=Math.hypot(dx,dy)||1;return [E,dx/L,dy/L];
}
function head(tp,cls){
  const [E,dx,dy]=endDir(tp);
  const tip=[E[0]+dx*4,E[1]+dy*4],bx=E[0]-dx*8,by=E[1]-dy*8;
  return `<polygon class="ah ${cls}" points="${f1(tip[0])},${f1(tip[1])} ${f1(bx-dy*6.5)},${f1(by+dx*6.5)} ${f1(bx+dy*6.5)},${f1(by-dx*6.5)}"/>`;
}
function drawMove(pts,type,bounce){
  const ball=type==="pass"||type==="shot";
  const tp=trimmed(pts,type==="shot"?18:20,type==="shot"?10:22);
  if(!tp)return "";
  const line=type==="dribble"?zig(tp):tp;
  const d=toD(line);
  let h=`<path class="mvh" d="${d}"/><path class="mv ${type}" d="${d}"/>`;
  if(type==="screen"){
    const [E,dx,dy]=endDir(tp);
    h+=`<line class="mv-t" x1="${f1(E[0]-dy*12)}" y1="${f1(E[1]+dx*12)}" x2="${f1(E[0]+dy*12)}" y2="${f1(E[1]-dx*12)}"/>`;
  } else {
    h+=head(tp,ball?"pa":"mo");
  }
  if(bounce){
    const L=cumLen(tp),m=pointAt(tp,L,L[L.length-1]*0.6);
    h+=`<circle class="bnc" cx="${f1(m[0])}" cy="${f1(m[1])}" r="4.2"/>`;
  }
  return h;
}
function stepPaths(play,j){
  const fr=play.frames[j],a=play.res[j-1],b=play.res[j],c=play.ctrl[j];
  const bl=fr.ball,dribbler=bl&&bl.dribble,screeners=(fr.scr||[]).map(x=>x[0]);
  let h="";
  play.cast.forEach(id=>{
    if(id[0]!=="o")return;
    if(dist(a[id],b[id])<3)return;
    const type=screeners.includes(id)?"screen":(dribbler===id?"dribble":"cut");
    h+=drawMove(sampleQ(a[id],c[id],b[id]),type);
  });
  if(bl&&bl.pass){const [x,y]=bl.pass;h+=drawMove(sampleQ(a[x],null,b[y],10),"pass",bl.bounce);}
  if(bl&&bl.shot){h+=drawMove(sampleQ(b[bl.shot],null,B,10),"shot");}
  return h;
}
function drawPaths(play,stepIdx){
  let h="";
  if(showL){for(let j=1;j<=stepIdx;j++){h+=`<g opacity="${j===stepIdx?1:0.28}">${stepPaths(play,j)}</g>`;}}
  lyPaths.innerHTML=h;
}

/* Ball */
const handG=q=>[q[0]+12,q[1]+6];
function ballState(play,k,t,P,now){
  const b=play.frames[k].ball,e=ease(t);
  let g,h,s=1,holder=null;
  if(typeof b==="string"||b.dribble){
    holder=typeof b==="string"?b:b.dribble;
    g=handG(P[holder]);
    h=b.dribble?15*Math.abs(Math.sin(now/190)):13;
  } else if(b.pass){
    const ga=handG(P[b.pass[0]]),gc=handG(P[b.pass[1]]);
    g=[ga[0]+(gc[0]-ga[0])*e,ga[1]+(gc[1]-ga[1])*e];
    h=b.bounce?(e<.6?13*(1-e/.6):13*(e-.6)/.4):13+6*Math.sin(Math.PI*e);
    holder=t<.03?b.pass[0]:(t>.97?b.pass[1]:null);
  } else if(b.shot){
    const gs=handG(P[b.shot]),d=dist(gs,B),H=Math.min(95,22+d*.28);
    g=[gs[0]+(B[0]-gs[0])*t,gs[1]+(B[1]-gs[1])*t];
    h=13*(1-t)+H*Math.sin(Math.PI*t);
    s=(1+.45*Math.sin(Math.PI*t)*(H/95))*(1-.12*t);
    holder=t<.03?b.shot:null;
  }
  return {g,h,s,holder};
}

/* Screens and speech bubbles */
function bubblePath(x,y,w,h,px,up){
  const r=11;px=Math.max(x+r+7,Math.min(x+w-r-7,px));
  if(!up) return `M${x+r} ${y} H${x+w-r} Q${x+w} ${y} ${x+w} ${y+r} V${y+h-r} Q${x+w} ${y+h} ${x+w-r} ${y+h} H${px+6} L${px} ${y+h+7} L${px-6} ${y+h} H${x+r} Q${x} ${y+h} ${x} ${y+h-r} V${y+r} Q${x} ${y} ${x+r} ${y} Z`;
  return `M${x+r} ${y} H${px-6} L${px} ${y-7} L${px+6} ${y} H${x+w-r} Q${x+w} ${y} ${x+w} ${y+r} V${y+h-r} Q${x+w} ${y+h} ${x+w-r} ${y+h} H${x+r} Q${x} ${y+h} ${x} ${y+h-r} V${y+r} Q${x} ${y} ${x+r} ${y} Z`;
}
function drawOverlay(play,k,t,P){
  const fk=play.frames[k],fp=play.frames[k-1];
  const key=s=>s[0]+">"+s[1];
  let list=[];
  if(p<=0){list=play.frames[0].scr||[];}
  else{
    const prev=(fp.scr||[]).map(key),now=(fk.scr||[]).map(key);
    (fk.scr||[]).forEach(s=>{if(t>.82||prev.includes(key(s)))list.push(s);});
    (fp.scr||[]).forEach(s=>{if(!now.includes(key(s))&&t<.18)list.push(s);});
  }
  let w="";
  list.forEach(([s,d])=>{
    const a=P[s],b=P[d];let dx=b[0]-a[0],dy=b[1]-a[1];const L=Math.hypot(dx,dy)||1;dx/=L;dy/=L;
    const c=[a[0]+dx*20,a[1]+dy*20],x1=c[0]-dy*14,y1=c[1]+dx*14,x2=c[0]+dy*14,y2=c[1]-dx*14;
    w+=`<line class="wall-u" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/><line class="wall" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}"/>`;
  });
  lyWalls.innerHTML=w;

  let bub=null,op=1;
  if(p<=0)bub=play.frames[0].bub;
  else if(t>.3){bub=fk.bub;op=Math.min(1,(t-.3)/.15);}
  let h="";
  if(bub){
    Object.keys(bub).forEach(id=>{
      if(id[0]==="d"&&!showD)return;
      const q=P[id],txt=bub[id],bw=txt.length*7.2+20,bh=25;
      let x=Math.max(-10,Math.min(510-bw,q[0]-bw/2)),y=q[1]-54,up=false;
      if(y<-10){y=q[1]+29;up=true;}
      h+=`<g class="bub ${id[0]}" opacity="${f1(op)}"><path d="${bubblePath(x,y,bw,bh,q[0],up)}"/><text x="${f1(x+bw/2)}" y="${f1(y+bh/2+.5)}" text-anchor="middle" dominant-baseline="central">${esc(txt)}</text></g>`;
    });
  }
  lyBub.innerHTML=h;
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

/* Captions: {1} is a blue chip, {X1} a red chip, *word* a highlighted keyword */
function fmt(s){
  return esc(s).replace(/\*([^*]+)\*/g,'<span class="kw">$1</span>')
          .replace(/\{(X?)(\d)\}/g,(m,x,d)=>`<b class="chip ${x?"cd":"co"}">${x?"X":""}${d}</b>`);
}

/* Render */
function stepInfo(){
  if(p<=0)return {k:1,t:0};
  const k=Math.max(1,Math.ceil(p-1e-9));return {k,t:Math.min(1,p-(k-1))};
}
function render(now){
  const play=plays[cur],n=play.frames.length-1,{k,t}=stepInfo();
  const P={};
  play.cast.forEach(id=>{
    const q=posAt(play,k,t,id);P[id]=q;
    const g=els[id];g.setAttribute("transform",`translate(${f1(q[0])} ${f1(q[1])})`);
    if(id[0]==="d")g.style.display=showD?"":"none";
  });
  const bs=ballState(play,k,t,P,now);
  ballEl.setAttribute("transform",`translate(${f1(bs.g[0])} ${f1(bs.g[1]-bs.h)}) scale(${bs.s.toFixed(3)})`);
  shadowEl.setAttribute("cx",f1(bs.g[0]));shadowEl.setAttribute("cy",f1(bs.g[1]+2));
  const sh=Math.max(.35,1-bs.h/110);
  shadowEl.setAttribute("rx",f1(7*sh));shadowEl.setAttribute("ry",f1(3.2*sh));
  play.cast.forEach(id=>{if(id[0]==="o")els[id].classList.toggle("has",bs.holder===id);});
  drawOverlay(play,k,t,P);

  const stepIdx=p<=0?0:k;
  const pk=cur+"|"+stepIdx+"|"+showL;
  if(pk!==lastPathKey){drawPaths(play,stepIdx);lastPathKey=pk;}

  const ck=cur+"|"+stepIdx;
  if(ck!==lastCapKey){
    capEl.innerHTML=fmt(play.frames[stepIdx].say);
    capEl.classList.remove("fresh");void capEl.offsetWidth;capEl.classList.add("fresh");
    lastCapKey=ck;
  }
  updateUI(play,n,stepIdx);
}
/* The play after this one: within the search results when there are several, else the whole library */
function nextUp(){
  const pool=view.length>1?view:plays,i=pool.indexOf(plays[cur]);
  return {pl:pool[(i+1)%pool.length],wrapped:i===pool.length-1};
}
function updateUI(play,n,stepIdx){
  const done=p>=n;
  const st=[cur,playing,done,stepIdx,p<=0,listVer].join("|");
  if(st===lastUI)return;lastUI=st;
  if(playing){playIcon.innerHTML=ICON_PAUSE;playTxt.textContent="Pause";}
  else if(done){playIcon.innerHTML=ICON_AGAIN;playTxt.textContent="Again";}
  else{playIcon.innerHTML=ICON_PLAY;playTxt.textContent="Play";}
  btnPlay.classList.toggle("nudge",p<=0&&!playing);
  btnBack.disabled=p<=0;btnNext.disabled=done;
  badgeEl.textContent=stepIdx===0?"Start":`Step ${stepIdx} of ${n}`;
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
  const fr=play.frames[k];
  if(fr.ball&&fr.ball.shot)return 1300;
  const moved=play.cast.some(id=>dist(play.res[k-1][id],play.res[k][id])>3);
  return moved?1800:1000;
}
function tick(now){
  const dt=Math.min(60,now-lastT);lastT=now;
  const play=plays[cur];
  if(p<target&&now>=holdUntil){
    const k=Math.floor(p+1e-9)+1;
    let np=p+dt/(stepDur(play,k)*speed);
    // Snap when within rounding error of the step's end; otherwise p can stall at 1.9999999999999998 and k overshoots
    if(np>=k-1e-9){
      np=k;
      const fr=play.frames[k];
      if(fr.ball&&fr.ball.shot)celebrate(isThree(play.res[k][fr.ball.shot])?3:2);
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
  if(playing){playing=false;target=p;holdUntil=0;return;}
  if(p>=n){p=0;lyFx.innerHTML="";}
  playing=true;target=n;holdUntil=0;
}
function stepNext(){
  const n=plays[cur].frames.length-1;
  playing=false;holdUntil=0;
  target=Math.min(n,Math.floor(p+1e-9)+1);
}
function stepBack(){
  playing=false;holdUntil=0;
  const fl=Math.floor(p+1e-9);
  p=Math.abs(p-fl)<1e-6?Math.max(0,fl-1):fl;target=p;
}
btnPlay.addEventListener("click",togglePlay);
btnNext.addEventListener("click",stepNext);
btnBack.addEventListener("click",stepBack);
btnRestart.addEventListener("click",()=>{p=0;target=0;playing=false;holdUntil=0;lyFx.innerHTML="";});
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
  btnPlay.disabled=false;btnRestart.disabled=false;shareBtn.hidden=false;
  requestAnimationFrame(t=>{lastT=t;tick(t);});
}

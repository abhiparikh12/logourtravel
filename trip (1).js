/* =========================================================================
   Log Our Travel — trip page logic
   Renders itinerary from a trip JSON, builds Google Maps directions links,
   and reads live expense data from a published Google Sheet (CSV) with a
   freeze-to-snapshot fallback.
   ========================================================================= */

/* ---------- image sources -------------------------------------------------
   Each day can have a local photo (img/<slug>.jpg) and/or a Wikimedia fallback.
   The site tries the local file first; if it's missing, it tries Wikimedia;
   if that also fails, a styled gradient tile with the place name shows.
   Drop your own trip photos into an "img" folder as img/<slug>.jpg to use them.
--------------------------------------------------------------------------- */
const LOCAL_IMG_DIR = "img/";
function localImg(slug){ return slug ? (LOCAL_IMG_DIR + slug + ".jpg") : ""; }
function commonsImg(file, w){
  if(!file) return "";
  return "https://commons.wikimedia.org/wiki/Special:FilePath/" +
         encodeURIComponent(file) + (w ? ("?width="+w) : "");
}
/* legacy name kept for any callers */
function imgUrl(file, w){ return commonsImg(file, w); }

/* ---------- Google Maps directions deep-links ----------------------------- */
const MAPS_MODE = "directions"; // "directions" | "search"
function mapsUrl(q){
  const e = encodeURIComponent(q);
  return MAPS_MODE === "search"
    ? "https://www.google.com/maps/search/?api=1&query=" + e
    : "https://www.google.com/maps/dir/?api=1&destination=" + e;
}

const COUNTRY_GRAD = {
  albania:"radial-gradient(120% 130% at 15% 10%, rgba(255,214,170,.45), transparent 55%), radial-gradient(90% 90% at 90% 90%, rgba(120,40,20,.5), transparent 60%), linear-gradient(150deg,#c65f38,#8f3f22)",
  bosnia:"radial-gradient(120% 130% at 15% 10%, rgba(180,230,200,.4), transparent 55%), radial-gradient(90% 90% at 90% 90%, rgba(20,60,40,.5), transparent 60%), linear-gradient(150deg,#3a7d5d,#255540)",
  montenegro:"radial-gradient(120% 130% at 15% 10%, rgba(180,210,255,.4), transparent 55%), radial-gradient(90% 90% at 90% 90%, rgba(20,45,80,.55), transparent 60%), linear-gradient(150deg,#3d6ea5,#264a73)",
  transit:"radial-gradient(120% 130% at 15% 10%, rgba(230,235,245,.35), transparent 55%), radial-gradient(90% 90% at 90% 90%, rgba(50,55,65,.5), transparent 60%), linear-gradient(150deg,#7c828d,#565c66)"
};
const CAT_ICON = {Food:"🍽️",Entry:"🏛️",Transport:"⛽",Lodging:"🏨",Boat:"⛵",Shopping:"🛍️",Fuel:"⛽",Tours:"⛵",Other:"✨"};
/* Values are held in EUR. When the display toggle is USD we divide by the
   USD rate (EUR per 1 USD) to get dollars. */
function fromEur(n){
  if(DISPLAY_CUR === "USD"){
    const r = RATES.USD;
    if(typeof r === "number" && r > 0) return n / r;
  }
  return n;
}
const curSymbol = () => DISPLAY_CUR === "USD" ? "$" : "€";
const euro  = n => curSymbol()+Math.round(fromEur(n)).toLocaleString("en-US");
const euro2 = n => curSymbol()+(Math.round(fromEur(n)*100)/100).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function escapeReg(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}

let TRIP = null, PLACE_ALT = null, PLACE_BY_ESC = {};

function buildPlaceMatcher(places){
  const entries = Object.keys(places||{}).sort((a,b)=>b.length-a.length)
    .map(name=>({esc:escapeHtml(name), query:places[name]}));
  PLACE_BY_ESC = {}; entries.forEach(p=>PLACE_BY_ESC[p.esc]=p.query);
  PLACE_ALT = entries.length
    ? new RegExp("(?<![\\w>])(" + entries.map(p=>escapeReg(p.esc)).join("|") + ")(?![\\w<])","g")
    : null;
}
function linkPlaces(escText){
  if(!PLACE_ALT) return escText;
  return escText.replace(PLACE_ALT, m=>{
    const q = PLACE_BY_ESC[m]; if(!q) return m;
    return `<a class="maplink" href="${mapsUrl(q)}" target="_blank" rel="noopener">${m}<span class="pin">▸</span></a>`;
  });
}
const HEADLINE_Q = {
  "Gjirokastër":"Gjirokastër, Albania","Sarandë":"Sarandë, Albania","Ksamil":"Ksamil, Albania",
  "Dhërmi":"Dhërmi, Albania","Berat":"Berat, Albania","Shkodër":"Shkodër, Albania",
  "Theth (day trip)":"Theth, Albania","Mostar":"Mostar, Bosnia and Herzegovina",
  "Budva":"Budva, Montenegro","Kotor":"Kotor, Montenegro","Lovćen NP":"Lovćen National Park, Montenegro",
  "Bay of Kotor":"Bay of Kotor, Montenegro","Podgorica (TGD)":"Podgorica Airport, Montenegro",
  "Podgorica / Tirana":"", "Sarandë / Ksamil":""
};
function segLink(seg){
  seg=seg.trim(); const q=HEADLINE_Q[seg];
  if(q==="") return escapeHtml(seg);
  if(!q) return escapeHtml(seg);
  return `<a class="maplink" href="${mapsUrl(q)}" target="_blank" rel="noopener">${escapeHtml(seg)}</a>`;
}
function linkHeadlinePlace(place){
  return place.split(/\s*(→|\/)\s*/).map(t=>(t==="→"||t==="/")?` ${t} `:segLink(t)).join("");
}

/* ---------- render itinerary --------------------------------------------- */
function renderDays(){
  const host=document.getElementById("days"); if(!host) return;
  host.innerHTML = TRIP.days.map(d=>{
    const items=d.items.map(x=>`<li>${linkPlaces(escapeHtml(x))}</li>`).join("");
    const tips=(d.tips&&d.tips.length)?`<div class="tips">`+d.tips.map(t=>
      `<div class="tip"><span class="ico">◈</span><div><b>Pro tip</b>${linkPlaces(escapeHtml(t))}</div></div>`).join("")+`</div>`:"";
    const localT=localImg(d.slug), localBig=localImg(d.slug);
    const commonsT=commonsImg(d.img,400), commonsBig=commonsImg(d.img,1200);
    const grad=COUNTRY_GRAD[d.country]||COUNTRY_GRAD.transit;
    // primary src = local file; on error, swap to Wikimedia; on second error, hide (gradient shows).
    const firstT = localT || commonsT;
    const fbT = localT ? commonsT : "";
    const firstBig = localBig || commonsBig;
    const fbBig = localBig ? commonsBig : "";
    const onerr = fb => fb
      ? `onerror="if(this.dataset.fb){this.src=this.dataset.fb;this.dataset.fb='';}else{this.style.display='none';}"`
      : `onerror="this.style.display='none'"`;
    const thumbImg = firstT
      ? `<img class="thumb-img" src="${firstT}" ${fbT?`data-fb="${fbT}"`:""} alt="" loading="lazy" ${onerr(fbT)}>`
      : "";
    const photo = firstBig
      ? `<div class="day-photo" style="background:${grad}"><div class="ph-motif"><svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.4"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg></div><img src="${firstBig}" ${fbBig?`data-fb="${fbBig}"`:""} alt="${escapeHtml(d.place)}" loading="lazy" ${onerr(fbBig)}><div class="cap">${escapeHtml(d.place)}</div></div>`
      : "";
    return `<details class="day ${d.country}" id="day-${d.n}"${d.n===3?" open":""}>
      <summary class="day-head">
        <div class="daythumb" style="background:${grad}">${thumbImg}<div class="num"><div class="n">${d.n}</div><div class="l">Day</div></div></div>
        <div class="day-meta">
          <div class="day-place">${linkHeadlinePlace(d.place)}</div>
          <div class="day-title">${escapeHtml(d.title)}</div>
          <div class="day-date">${escapeHtml(d.date)}</div>
        </div>
        <div class="chev">›</div>
      </summary>
      <div class="day-body">
        ${photo}
        <div class="maphint"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>Tap any underlined place for Google Maps directions</div>
        <div class="drive"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#454b53" stroke-width="1.8"><path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11v6h-2v-2H7v2H5v-6Z"/><circle cx="7.5" cy="14.5" r="1"/><circle cx="16.5" cy="14.5" r="1"/></svg><span>${escapeHtml(d.drive)}</span></div>
        <ul class="plan">${items}</ul>
        ${tips}
      </div>
    </details>`;
  }).join("");
}

/* ---------- sidebar day sub-nav ------------------------------------------ */
function renderDayNav(){
  const host=document.getElementById("dayNav"); if(!host) return;
  host.innerHTML = TRIP.days.map(d=>
    `<li><a href="#day-${d.n}"><span class="num">${d.n}</span>${escapeHtml(d.place)}</a></li>`).join("");
}

/* ---------- overview ----------------------------------------------------- */
function renderOverview(){
  const m=TRIP.meta;
  const el=document.getElementById("ovStats"); if(!el) return;
  const cells=[
    ["Duration", m.days_count+" days", "on the road"],
    ["Countries", String(m.countries.length), m.countries.join(" · ")],
    ["When", m.dates, ""],
    ["Style", "Self-drive", "two rental cars"]
  ];
  el.innerHTML=cells.map(c=>`<div class="ov-cell"><div class="k">${c[0]}</div><div class="v">${c[1]}</div><div class="s">${c[2]}</div></div>`).join("");
}

/* =========================================================================
   COSTS — read live from a published Google Sheet (CSV), or a snapshot.
   Configure per trip via TRIP.costs = { sheetCsvUrl, snapshotUrl, live }.
   ========================================================================= */
let EXP=[], costFilter="all";

function parseCsv(text){
  // minimal RFC-4180-ish CSV parser (handles quoted fields, commas, newlines)
  const rows=[]; let row=[], val="", i=0, q=false;
  while(i<text.length){
    const c=text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){val+='"';i++;} else q=false; }
      else val+=c;
    } else {
      if(c==='"') q=true;
      else if(c===",") { row.push(val); val=""; }
      else if(c==="\n"){ row.push(val); rows.push(row); row=[]; val=""; }
      else if(c==="\r"){ /* skip */ }
      else val+=c;
    }
    i++;
  }
  if(val.length||row.length){ row.push(val); rows.push(row); }
  return rows;
}

/* Map a sheet row (by header name) into our expense shape. Header names are
   matched case-insensitively and loosely so small Form wording changes survive. */
function rowsToExpenses(rows){
  if(!rows.length) return [];
  const head=rows[0].map(h=>h.trim().toLowerCase());
  const find=(...keys)=>head.findIndex(h=>keys.some(k=>h.includes(k)));
  const iDay=find("day"), iDesc=find("description","item","what"),
        iCat=find("category","type"), iAmt=find("amount","cost","price","€","eur"),
        iPaid=find("paid","who");
  // "currency" must not collide with the amount column when it's titled "Amount (€)"
  const iCur=head.findIndex(h=>h.includes("currency"));
  const out=[];
  for(let r=1;r<rows.length;r++){
    const row=rows[r]; if(!row || !row.join("").trim()) continue;
    const amtRaw=(iAmt>=0?row[iAmt]:"")||"";
    const amt=parseFloat(String(amtRaw).replace(/[^0-9.]/g,""));
    if(!(amt>0)) continue;
    let cur=(iCur>=0?row[iCur]:"").toString().trim().toUpperCase();
    // Tolerate "EUR (€)" / "ALL (Albanian lek)" style values from the old form.
    const m=cur.match(/[A-Z]{3}/); cur = m ? m[0] : "EUR";
    out.push({
      day:(iDay>=0?row[iDay]:"").toString().replace(/[^0-9]/g,"")||"",
      desc:(iDesc>=0?row[iDesc]:"").toString().trim(),
      cat:normalizeCat((iCat>=0?row[iCat]:"").toString().trim()),
      raw:amt, cur, amt,   // amt is filled in by applyRates()
      paid:(iPaid>=0?row[iPaid]:"").toString().trim()
    });
  }
  return out;
}

/* ---------- currency conversion -------------------------------------------
   RATES maps a currency code to its value in EUR (e.g. ALL -> 0.0101).
   Every expense stores its raw amount + currency; we convert on read, so
   correcting a rate instantly re-values the whole history.
--------------------------------------------------------------------------- */
let RATES = {EUR:1};
let DISPLAY_CUR = "EUR";           // "EUR" | "USD"

function toEur(raw, cur){
  const r = RATES[(cur||"EUR").toUpperCase()];
  return (typeof r === "number" && r > 0) ? raw * r : raw;
}
function applyRates(){
  EXP.forEach(e => { e.amt = toEur(e.raw, e.cur); });
}
function parseRatesCsv(text){
  const rows = parseCsv(text);
  const out = {EUR:1};
  for(let r=1;r<rows.length;r++){
    const code=(rows[r][0]||"").toString().trim().toUpperCase();
    const val=parseFloat(String(rows[r][1]||"").replace(/[^0-9.]/g,""));
    if(/^[A-Z]{3}$/.test(code) && val>0) out[code]=val;
  }
  if(!out.EUR) out.EUR=1;
  return out;
}
function normalizeCat(c){
  const s=c.toLowerCase();
  if(/food|meal|lunch|dinner|break|drink|coffee|eat/.test(s)) return "Food";
  if(/entry|ticket|admis|museum|castle|park/.test(s)) return "Entry";
  if(/fuel|gas|petrol|transport|taxi|bus|car|toll|park/.test(s)) return "Transport";
  if(/lodg|hotel|stay|room|airbnb/.test(s)) return "Lodging";
  if(/boat|ferry|tour|cruise/.test(s)) return "Boat";
  if(/shop|souvenir|gift|market/.test(s)) return "Shopping";
  return c ? (c[0].toUpperCase()+c.slice(1)) : "Other";
}

async function loadCosts(){
  const cfg=TRIP.costs||{};
  const statusEl=document.getElementById("costStatus");
  let source=null, live=false;
  // Prefer live sheet if configured & flagged; else snapshot; else built-in.
  // Exchange rates first, so conversion is ready before anything renders.
  // Falls back to the built-in defaults if the Rates CSV isn't reachable.
  if(cfg.ratesCsvUrl){
    try{
      const rr=await fetch(cfg.ratesCsvUrl,{cache:"no-store"});
      if(rr.ok){ RATES=parseRatesCsv(await rr.text()); }
    }catch(e){ /* keep defaults */ }
  }
  if(cfg.rates && typeof cfg.rates==="object"){
    // JSON-configured rates fill any gap the sheet didn't cover.
    Object.keys(cfg.rates).forEach(k=>{
      const kk=k.toUpperCase();
      if(RATES[kk]===undefined && cfg.rates[k]>0) RATES[kk]=cfg.rates[k];
    });
  }

  const url = (cfg.live && cfg.sheetCsvUrl) ? cfg.sheetCsvUrl : (cfg.snapshotUrl||cfg.sheetCsvUrl);
  if(url){
    try{
      const res=await fetch(url,{cache:"no-store"});
      if(res.ok){ EXP=rowsToExpenses(parseCsv(await res.text())); live=!!(cfg.live && cfg.sheetCsvUrl); source="sheet"; }
    }catch(e){ /* fall through */ }
  }
  if(source!=="sheet" && Array.isArray(cfg.seed)){
    EXP=cfg.seed.map(e=>Object.assign({raw:e.amt, cur:"EUR"}, e));
    source="seed";
  }
  applyRates();
  if(statusEl){
    statusEl.classList.toggle("live",live);
    const txt = statusEl.querySelector("span:last-child") || statusEl.querySelector("span");
    txt.textContent = live
      ? "Live from our shared log — updates within a few minutes"
      : (source ? "Final costs from this trip" : "Cost log will appear here once we start the trip");
  }
  // Optional private "Log an expense" button (only if a form URL is configured).
  const logBtn=document.getElementById("logExpenseBtn");
  if(logBtn){
    if(cfg.formUrl){ logBtn.href=cfg.formUrl; logBtn.style.display="inline-flex"; }
    else { logBtn.style.display="none"; }
  }
  renderCosts();
}

function renderCosts(){
  const list=document.getElementById("expList"); if(!list) return;
  const total=EXP.reduce((s,e)=>s+e.amt,0);
  const byCountry={albania:0,bosnia:0,montenegro:0};
  const dayCountry={}; TRIP.days.forEach(d=>dayCountry[d.n]=d.country);
  EXP.forEach(e=>{ const c=dayCountry[e.day]; if(c&&byCountry[c]!=null) byCountry[c]+=e.amt; });

  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set("costTotal",euro(total));
  set("costAlb",euro(byCountry.albania));
  set("costBos",euro(byCountry.bosnia));
  set("costMon",euro(byCountry.montenegro));
  set("costPP", EXP.length?euro(total/8):curSymbol()+"0");
  set("costCount",EXP.length);

  // per-day table
  const tb=document.querySelector("#costTable tbody");
  if(tb){
    const byDay={};
    EXP.forEach(e=>{ const k=e.day||"?"; (byDay[k]=byDay[k]||{Food:0,Entry:0,Transport:0,Other:0,tot:0});
      const bucket=["Food","Entry","Transport"].includes(e.cat)?e.cat:"Other";
      byDay[k][bucket]+=e.amt; byDay[k].tot+=e.amt; });
    const keys=Object.keys(byDay).filter(k=>k!=="?").map(Number).sort((a,b)=>a-b);
    tb.innerHTML = keys.length ? keys.map(k=>{const b=byDay[k];
      return `<tr><td>Day ${k}</td><td>${euro(b.Food)}</td><td>${euro(b.Entry)}</td><td>${euro(b.Transport)}</td><td>${euro(b.Other)}</td><td class="tot">${euro(b.tot)}</td></tr>`;}).join("")
      : `<tr><td colspan="6" style="text-align:center;color:var(--faint)">No entries yet</td></tr>`;
  }

  // list
  const shown=EXP.filter(e=>costFilter==="all"||e.cat===costFilter);
  if(!EXP.length){
    const liveEmpty = (TRIP.costs && TRIP.costs.live);
    list.innerHTML = liveEmpty
      ? `<div class="cost-empty"><div class="big">No expenses logged yet</div>The log is connected and live. Amounts will appear here within a few minutes of the first entry.</div>`
      : `<div class="cost-empty"><div class="big">Cost log coming soon</div>We log expenses live as we travel — real prices for meals, entries, fuel and boats. Check back once the trip is underway.</div>`;
    return;
  }
  if(!shown.length){ list.innerHTML=`<div class="cost-empty"><div class="big">Nothing in this filter</div>Try another category.</div>`; return; }
  list.innerHTML=shown.map(e=>{
    const meta=[e.day?`Day ${e.day}`:"",e.paid,e.cat].filter(Boolean).join(" · ");
    return `<div class="exp"><div class="cat">${CAT_ICON[e.cat]||"✨"}</div>
      <div class="mid"><div class="t1">${escapeHtml(e.desc||e.cat)}</div><div class="t2">${escapeHtml(meta)}</div></div>
      <div class="amt">${euro2(e.amt)}</div></div>`;
  }).join("");
}

/* ---------- sidebar section switching (in-page anchors) ------------------ */
function initSidebar(){
  const links=[...document.querySelectorAll(".sb-nav > li > a[data-sec]")];
  const sections=[...document.querySelectorAll(".content .panel[id], .content > #itinerary")];
  // expand day sub-nav when Itinerary active
  const dayToggle=document.querySelector('a[data-sec="itinerary"]');
  const daySub=document.getElementById("daySub");
  function activate(id){
    links.forEach(a=>a.classList.toggle("active",a.dataset.sec===id));
    if(daySub) daySub.classList.toggle("open", id==="itinerary");
  }
  links.forEach(a=>a.addEventListener("click",()=>activate(a.dataset.sec)));
  // scroll spy
  const spy=()=>{
    const y=window.scrollY+120; let cur=null;
    document.querySelectorAll(".content [data-spy]").forEach(s=>{ if(s.offsetTop<=y) cur=s.getAttribute("data-spy"); });
    if(cur) activate(cur);
  };
  window.addEventListener("scroll",spy,{passive:true}); spy();
}

/* ---------- boot --------------------------------------------------------- */
async function initTrip(jsonUrl){
  try{
    const res=await fetch(jsonUrl,{cache:"no-store"});
    TRIP=await res.json();
  }catch(e){ console.error("Failed to load trip data",e); return; }
  buildPlaceMatcher(TRIP.places);
  // hero bg: try local img/hero.jpg first, then Wikimedia
  const bg=document.getElementById("heroBg");
  if(bg && TRIP.meta){
    const localHero = TRIP.meta.hero_slug ? localImg(TRIP.meta.hero_slug) : "";
    const commonsHero = TRIP.meta.hero ? commonsImg(TRIP.meta.hero,1600) : "";
    const tryLoad=(url,next)=>{ if(!url){ if(next)next(); return; }
      const im=new Image(); im.onload=()=>bg.style.backgroundImage=`url('${url}')`;
      im.onerror=()=>{ if(next) next(); }; im.src=url; };
    tryLoad(localHero, ()=>tryLoad(commonsHero, null));
  }
  renderOverview(); renderDays(); renderDayNav(); await loadCosts(); initSidebar();
  // cost filters
  const f=document.getElementById("costFilters");
  if(f) f.addEventListener("click",e=>{const c=e.target.closest(".chip");if(!c)return;
    costFilter=c.dataset.f; f.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-pressed",x===c)); renderCosts();});

  // EUR / USD display toggle. Values stay in EUR internally; this only
  // changes what's shown. Hidden if we have no USD rate to convert with.
  const cs=document.getElementById("curSwitch");
  if(cs){
    if(!(RATES.USD>0)){ cs.style.display="none"; }
    else{
      cs.addEventListener("click",e=>{
        const b=e.target.closest("button"); if(!b) return;
        DISPLAY_CUR=b.dataset.cur==="USD"?"USD":"EUR";
        cs.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed", x===b));
        renderCosts();
      });
    }
  }
}
window.LogOurTravel = { initTrip };

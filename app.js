"use strict";
/* ============================================================
   BNIW CRM – läuft komplett im Browser, Daten bleiben lokal
   (localStorage). Kein Server, keine Cloud.
   ============================================================ */

const K = {
  rec: "bniw_verw_crm_v1",        // gleicher Schlüssel wie die alte HTML-Datei
  contacts: "bniw_crm_contacts_v1",
  log: "bniw_crm_log_v1",
  meta: "bniw_crm_meta_v1",
};
const STATUS = [
  {k:"offen",c:"#94A3B8"},{k:"nicht erreicht",c:"#5E6E82"},{k:"kontaktiert",c:"#0C6E68"},{k:"Rückruf vereinbart",c:"#B87A22"},
  {k:"Infos zugesagt",c:"#2E7D32"},{k:"kein Interesse",c:"#9A3B2E"}];
const KANAL = ["—","Telefon","LinkedIn","XING","Post","E-Mail"];
const NEWS = ["—","Warteliste","erstmal nicht","angefragt","Opt-in bestätigt"];
const ACT_KINDS = ["Anruf","Notiz","E-Mail","Meeting"];
const REACHED = new Set(["kontaktiert","Rückruf vereinbart","Infos zugesagt","kein Interesse"]);
const RAIL_CAP = 300, LIST_STEP = 200, CHART_DAYS = 14;
const WEEKDAY = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];

/* ---------- Helfer ---------- */
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, "0");
const dayKey = t => { const d = t instanceof Date ? t : new Date(t); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); };
const today = () => dayKey(new Date());
const parseDay = k => { const [y,m,d] = k.split("-").map(Number); return new Date(y, m-1, d); };
const addDays = (k, n) => { const d = parseDay(k); d.setDate(d.getDate()+n); return dayKey(d); };
const fmt = d => d ? d.split("-").reverse().join(".") : "";
const longDate = k => WEEKDAY[parseDay(k).getDay()] + ", " + fmt(k);
const timeOf = t => { const d = new Date(t); return pad(d.getHours())+":"+pad(d.getMinutes()); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const isOpen = s => s === "offen" || s === "nicht erreicht";
const sc = k => (STATUS.find(s => s.k === k) || STATUS[0]).c;
const normP = s => { let d = (s||"").replace(/\D/g, ""); if (d.startsWith("49")) d = d.slice(2); if (d.startsWith("0")) d = d.slice(1); return d; };
const gfName = g => { if (!g) return ""; const p = g.split(",").map(s => s.trim()); return p.length === 2 ? p[1]+" "+p[0] : g; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
const norm = s => String(s || "").toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(/[̀-ͯ]/g, "");
const safeUrl = u => { u = (u||"").trim(); if (!u) return ""; if (!/^https?:\/\//i.test(u)) u = "https://" + u; return u; };
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

function fallbackCopy(t){try{const ta=document.createElement("textarea");ta.value=t;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.focus();ta.select();document.execCommand("copy");document.body.removeChild(ta);}catch(e){}}
function copyText(t){try{if(navigator.clipboard&&navigator.clipboard.writeText){return navigator.clipboard.writeText(t).catch(()=>fallbackCopy(t));}}catch(e){}fallbackCopy(t);return Promise.resolve();}
function download(name, text){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"application/json"}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
let toastT = null;
function toast(msg){let t=document.querySelector(".toast");if(!t){t=document.createElement("div");t.className="toast";document.body.appendChild(t);}
  t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true;},2600);}

/* ---------- Daten ---------- */
function load(k, fb){ try { const r = localStorage.getItem(k); return r ? (JSON.parse(r) ?? fb) : fb; } catch(e) { return fb; } }
let contacts, records, log, meta, byId;
function loadAll(){
  contacts = load(K.contacts, []); records = load(K.rec, {}); log = load(K.log, []); meta = load(K.meta, {});
  if (!Array.isArray(contacts)) contacts = [];
  if (!Array.isArray(log)) log = [];
  reindex();
}
function reindex(){ byId = new Map(contacts.map(c => [c.id, c])); logVersion++; }
let logVersion = 0;
loadAll();

const def = () => ({status:"offen",kanal:"—",broschuere:{sent:false,date:""},newsletter:"—",lastContact:"",notes:"",people:[],followUp:""});
const EMPTY = Object.freeze(def());
/** Schreibzugriff: legt Datensatz bei Bedarf an */
function rec(id){
  if (!records[id]) records[id] = def();
  const r = records[id];
  if (!r.broschuere) r.broschuere = {sent:false,date:""};
  if (!Array.isArray(r.people)) r.people = [];
  if (r.followUp == null) r.followUp = "";
  return r;
}
/** Lesezugriff ohne Anlegen */
const get = id => records[id] || EMPTY;

let saveT = null;
function save(){
  const s = $("save"); s.textContent = "speichert…"; s.style.color = "#B87A22";
  meta.changedAt = Date.now();
  clearTimeout(saveT);
  saveT = setTimeout(flush, 400);
}
function flush(){
  clearTimeout(saveT); saveT = null;
  const s = $("save");
  try {
    localStorage.setItem(K.rec, JSON.stringify(records));
    localStorage.setItem(K.contacts, JSON.stringify(contacts));
    localStorage.setItem(K.log, JSON.stringify(log));
    localStorage.setItem(K.meta, JSON.stringify(meta));
    s.textContent = "gespeichert"; s.style.color = "#78808B";
  } catch(e) {
    s.textContent = "⚠ Speichern fehlgeschlagen – bitte exportieren!"; s.style.color = "#9A3B2E";
  }
  updateBackupHint();
}
window.addEventListener("pagehide", () => { if (saveT) flush(); });

/* ---------- Aktivitäts-Protokoll ---------- */
function logEv(c, type, data = {}){
  const now = Date.now();
  const last = log[log.length - 1];
  // Schnelle Status-Korrekturen (Verklicker) zu einem Eintrag zusammenfassen
  if (type === "status" && last && last.c === c && last.type === "status" && now - last.t < 120000) {
    last.to = data.to; last.t = now;
    if (last.from === last.to && !last.retry) log.pop();
    logVersion++; return;
  }
  // Allgemeine Notizen: ein Eintrag pro Kontakt und Tag
  if (type === "notes") {
    const td = today();
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i]; if (dayKey(e.t) !== td) break;
      if (e.c === c && e.type === "notes") { e.t = now; e.text = data.text; logVersion++; return; }
    }
  }
  log.push({id: uid(), t: now, c, type, ...data});
  logVersion++;
}
let actIdxV = -1, actIdx = new Map();
/** Volltext der Aktivitäten pro Kontakt (für die Suche) */
function actText(id){
  if (actIdxV !== logVersion) {
    actIdx = new Map();
    for (const e of log) if (e.type === "act" && e.text) actIdx.set(e.c, (actIdx.get(e.c) || "") + " " + norm(e.text));
    actIdxV = logVersion;
  }
  return actIdx.get(id) || "";
}
function describe(e){
  switch (e.type) {
    case "status": if (e.retry && e.from === e.to) return `📞 Erneut <b style="color:${sc(e.to)}">${esc(e.to)}</b>`;
      return `Status → <b style="color:${sc(e.to)}">${esc(e.to)}</b>` + (e.from && e.from !== "offen" ? ` <span class="tiny">(vorher ${esc(e.from)})</span>` : "");
    case "bro": return e.on ? "📄 Broschüre gesendet" : "Broschüre zurückgenommen";
    case "news": return "Newsletter/Warteliste: <b>" + esc(e.to) + "</b>";
    case "kanal": return "Kanal: " + esc(e.to);
    case "notes": return "📝 Notizen bearbeitet";
    case "act": return "<b>" + esc(e.kind || "Notiz") + "</b>";
    case "person": return "👤 Ansprechpartner hinzugefügt: <b>" + esc(e.name) + "</b>";
    case "followup": return e.to ? "⏰ Wiedervorlage: " + fmt(e.to) : "⏰ Wiedervorlage erledigt";
    case "created": return "Firma angelegt";
    case "edited": return "Stammdaten bearbeitet";
    default: return esc(e.type);
  }
}
const evText = e => (e.type === "act" || e.type === "notes") ? (e.text || "") : "";
const evColor = e => e.type === "status" ? sc(e.to) : e.type === "act" ? "#17263F" : e.type === "bro" ? "#2E7D32" : e.type === "followup" ? "#B87A22" : "#94A3B8";

/** Alt-Daten (Export der alten HTML-Datei) haben kein Protokoll – aus Datumsfeldern rekonstruieren */
function synthLegacy(ids){
  const has = new Set(log.map(e => e.c));
  let n = 0;
  for (const id of ids) {
    if (has.has(id)) continue;
    const r = records[id]; if (!r) continue;
    if (r.lastContact && r.status && r.status !== "offen") {
      log.push({id: uid(), t: parseDay(r.lastContact).getTime() + 12*3600e3, c: id, type: "status", from: "offen", to: r.status, legacy: true}); n++;
    }
    if (r.broschuere && r.broschuere.sent && r.broschuere.date) {
      log.push({id: uid(), t: parseDay(r.broschuere.date).getTime() + 12*3600e3 + 1, c: id, type: "bro", on: true, legacy: true}); n++;
    }
  }
  log.sort((a, b) => a.t - b.t);
  logVersion++;
  return n;
}

/* ---------- Suche ---------- */
function parseQ(str){
  str = (str || "").trim();
  return { raw: str, terms: norm(str).split(/\s+/).filter(Boolean), digits: /[a-zäöüß]/i.test(str) ? "" : str.replace(/\D/g, "") };
}
/** Liefert null (kein Treffer) oder {in, p?} – wo gefunden wurde */
function match(c, q){
  if (!q.terms.length) return {in: "all"};
  const r = get(c.id);
  if (q.digits.length >= 3) {
    const d = normP(q.digits);
    if ((c.plz || "").startsWith(q.digits)) return {in: "firma"};
    if (d && normP(c.tel).includes(d)) return {in: "tel"};
    const p = (r.people || []).find(p => d && normP(p.tel).includes(d));
    if (p) return {in: "person", p};
  }
  const base = norm(c.name + " " + c.ort + " " + c.plz + " " + (c.website || "") + " " + (c.tel || ""));
  if (q.terms.every(t => base.includes(t))) return {in: "firma"};
  const gf = norm(gfName(c.gf) + " " + c.gf);
  if (q.terms.every(t => gf.includes(t) || base.includes(t))) return {in: "gf"};
  for (const p of (r.people || [])) {
    const s = norm(p.name + " " + (p.rolle || "") + " " + (p.mail || ""));
    if (q.terms.every(t => s.includes(t) || base.includes(t))) return {in: "person", p};
  }
  const all = base + " " + gf + " " + norm(r.notes) + actText(c.id);
  if (q.terms.every(t => all.includes(t))) return {in: "notiz"};
  return null;
}
function snippet(text, q){
  const t = String(text || ""); const n = norm(t);
  const term = q.terms.find(x => n.includes(x)); if (!term) return "";
  const i = n.indexOf(term); const a = Math.max(0, i - 30);
  return (a > 0 ? "…" : "") + t.slice(a, i + term.length + 50).replace(/\s+/g, " ") + "…";
}
function noteSnippet(c, q){
  const r = get(c.id);
  const fromNotes = snippet(r.notes, q); if (fromNotes) return fromNotes;
  for (let i = log.length - 1; i >= 0; i--) { const e = log[i]; if (e.c === c.id && e.type === "act") { const s = snippet(e.text, q); if (s) return s; } }
  return "";
}

/* ---------- UI-Zustand & Routing ---------- */
let view = "work", curId = null, filter = "todo", railQ = "";
let listQ = "", listStatus = "alle", listSort = {k: "name", dir: 1}, listLimit = LIST_STEP;
let dayK = today(), dayMode = "chrono", actKind = "Anruf", showPersonForm = false;

function parseHash(){
  const h = location.hash.replace(/^#\/?/, "").split("/");
  switch (h[0]) {
    case "liste": view = "liste"; break;
    case "tag": view = "tag"; dayK = /^\d{4}-\d{2}-\d{2}$/.test(h[1] || "") ? h[1] : today(); break;
    case "daten": view = "daten"; break;
    case "kontakt": { view = "work"; const id = decodeURIComponent(h[1] || ""); if (byId.has(id)) { curId = id; showPersonForm = false; } break; }
    default: view = "work";
  }
  closeGlobal();
  render();
  $("main").scrollTop = 0;
}
function openContact(id){
  const h = "#/kontakt/" + encodeURIComponent(id);
  if (location.hash === h) parseHash(); else location.hash = h;
}
window.addEventListener("hashchange", parseHash);

function render(){
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.v === view));
  const onboarding = !contacts.length && view !== "daten";
  document.body.dataset.view = onboarding ? "onboard" : view;
  progress();
  updateBackupHint();
  if (onboarding) return renderOnboarding();
  if (view === "work") { renderRail(); renderWork(); }
  else if (view === "liste") renderList();
  else if (view === "tag") renderDay();
  else if (view === "daten") renderData();
}

/* ---------- Kennzahlen ---------- */
/** Anrufversuch = jeder Status außer „offen" (auch „nicht erreicht") oder eine erfasste Aktivität „Anruf" */
const isAttempt = e => (e.type === "status" && e.to !== "offen") || (e.type === "act" && e.kind === "Anruf");
function dayStats(k){
  const evs = log.filter(e => dayKey(e.t) === k);
  const final = new Map();
  evs.forEach(e => { if (e.type === "status") final.set(e.c, e.to); });
  const attempts = [...new Set(evs.filter(isAttempt).map(e => e.c))];
  const reached = attempts.filter(c => REACHED.has(final.get(c) ?? get(c).status));
  const distinct = type => new Set(evs.filter(type).map(e => e.c)).size;
  return {
    evs,
    anrufe: attempts.length,
    erreicht: reached.length,
    nicht: attempts.length - reached.length,
    zusagen: [...final].filter(([, s]) => s === "Infos zugesagt").length,
    bro: distinct(e => e.type === "bro" && e.on),
    wl: distinct(e => e.type === "news" && e.to === "Warteliste"),
    notizen: evs.filter(e => e.type === "act" || e.type === "notes").length,
    firmen: new Set(evs.map(e => e.c)).size,
  };
}
function attemptsPerDay(){
  const m = new Map();
  const seen = new Set();
  for (const e of log) {
    if (!isAttempt(e)) continue;
    const k = dayKey(e.t), key = k + "|" + e.c;
    if (seen.has(key)) continue; seen.add(key);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}
let triesV = -1, tries = new Map();
/** Wie oft ein Kontakt als „nicht erreicht" protokolliert wurde */
function triesOf(id){
  if (triesV !== logVersion) {
    tries = new Map();
    for (const e of log) if (e.type === "status" && e.to === "nicht erreicht") tries.set(e.c, (tries.get(e.c) || 0) + 1);
    triesV = logVersion;
  }
  return tries.get(id) || 0;
}
function progress(){
  const n = contacts.length;
  let done = 0, reached = 0, wins = 0, wl = 0;
  for (const c of contacts) { const r = get(c.id); if (r.status !== "offen") done++; if (REACHED.has(r.status)) reached++; if (r.broschuere && r.broschuere.sent) wins++; if (r.newsletter === "Warteliste") wl++; }
  $("fill").style.width = (n ? done / n * 100 : 0) + "%";
  $("count").textContent = done + "/" + n;
  $("count").parentElement.title = `${done} angerufen (davon ${reached} erreicht, ${done - reached} nicht erreicht) von ${n}`;
  if (view !== "work") return;
  const st = dayStats(today());
  $("d-calls").textContent = st.anrufe;
  $("d-bro").textContent = wins; $("d-wl").textContent = wl;
  $("d-bro-t").textContent = st.bro ? "heute +" + st.bro : "";
  $("d-wl-t").textContent = st.wl ? "heute +" + st.wl : "";
}
function updateBackupHint(){
  const last = meta.lastExport || 0;
  const dirty = (meta.changedAt || 0) > last;
  const old = Date.now() - last > 7 * 864e5;
  $("backup").hidden = !(contacts.length && dirty && old);
}

/* ---------- Abarbeiten: Liste links ---------- */
const isDue = r => r.followUp && r.followUp <= today() && r.status !== "kein Interesse";
function filteredRail(){
  const q = parseQ(railQ), td = today();
  const res = contacts.filter(c => {
    const r = get(c.id);
    // Zu erledigen: noch nicht erreicht – plus fällige Wiedervorlagen (z. B. vereinbarter Rückruf)
    if (filter === "todo" && !isOpen(r.status) && !isDue(r)) return false;
    if (filter === "nicht" && r.status !== "nicht erreicht") return false;
    if (filter === "erreicht" && !REACHED.has(r.status)) return false;
    if (filter === "faellig" && !isDue(r)) return false;
    return !q.terms.length || !!match(c, q);
  });
  // Reihenfolge: fällige Wiedervorlagen, nochmal versuchen, neue – heute schon Angerufene ans Ende
  const prio = c => { const r = get(c.id); if (isDue(r)) return 0; if (r.status === "nicht erreicht") return r.lastContact && r.lastContact < td ? 1 : 3; return 2; };
  return res.map((c, i) => [prio(c), i, c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
}
function renderRail(){
  const td = today();
  const fl = filteredRail(); const list = $("list");
  const shown = fl.slice(0, RAIL_CAP);
  list.innerHTML = shown.map(c => {
    const r = get(c.id); const on = c.id === curId ? " on" : "";
    const n = r.status === "nicht erreicht" ? triesOf(c.id) : 0;
    const due = (isDue(r) ? ` <span class="badge due">⏰ ${fmt(r.followUp).slice(0, 5)}</span>` : "")
      + (n ? ` <span class="badge" title="${n}× nicht erreicht, zuletzt ${fmt(r.lastContact)}">📵 ${n}×${r.lastContact === td ? " · heute" : ""}</span>` : "");
    return `<button class="row${on}" data-id="${esc(c.id)}"><span class="dot" style="background:${sc(r.status)}"></span>` +
      `<span style="min-width:0"><span class="n">${esc(c.name)}</span><span class="s">${esc(c.ort)} · ${esc(gfName(c.gf)) || "—"}${due}</span></span></button>`;
  }).join("")
    + (fl.length > RAIL_CAP ? `<div class="more">… und ${fl.length - RAIL_CAP} weitere. Nutze die Suche oben, um sie zu finden.</div>` : "")
    + (fl.length === 0 ? `<div class="more">Keine Treffer. Filter oder Suche anpassen.</div>` : "");
  list.querySelectorAll(".row").forEach(b => b.onclick = () => { $("rail").classList.add("hidden"); openContact(b.dataset.id); });
  const on = list.querySelector(".row.on"); if (on && !isVisible(on, list)) on.scrollIntoView({block: "nearest"});
}
const isVisible = (el, box) => { const a = el.getBoundingClientRect(), b = box.getBoundingClientRect(); return a.top >= b.top && a.bottom <= b.bottom; };

function step(d, beforeChange){
  const f0 = filteredRail(); const p0 = f0.findIndex(x => x.id === curId);
  if (beforeChange) beforeChange();
  const f1 = filteredRail(); const p1 = f1.findIndex(x => x.id === curId);
  let next;
  if (p1 >= 0) next = f1[Math.min(Math.max(p1 + d, 0), f1.length - 1)];
  else next = f1[Math.min(Math.max(d > 0 ? p0 : p0 - 1, 0), f1.length - 1)]; // aktueller Kontakt ist aus dem Filter gefallen
  if (next) curId = next.id;
  history.replaceState(null, "", "#/kontakt/" + encodeURIComponent(curId));
  showPersonForm = false;
  render();
  $("main").scrollTop = 0;
}
function changeStatus(id, st){
  const r = rec(id); const from = r.status;
  if (from === st) {
    if (st !== "nicht erreicht") return;
    // Erneut nicht erreicht → zählt als neuer Anrufversuch
    const before = triesOf(id);
    r.lastContact = today();
    logEv(id, "status", {from, to: st, retry: true});
    save();
    toast(triesOf(id) > before ? "Neuer Anrufversuch gezählt (" + triesOf(id) + "× nicht erreicht)" : "Gerade eben schon gezählt");
    return;
  }
  r.status = st;
  if (st !== "offen") r.lastContact = today();
  logEv(id, "status", {from, to: st});
  save();
}

/* ---------- Abarbeiten: Kontaktkarte ---------- */
function renderWork(){
  const fl = filteredRail();
  if (!curId || !byId.has(curId)) curId = (fl[0] || contacts[0]).id;
  const pos = fl.findIndex(c => c.id === curId);
  const c = byId.get(curId), r = get(curId), td = today();
  const liKw = encodeURIComponent((gfName(c.gf) + " " + c.name.replace(/\b(GmbH|AG|mbH|eG|KG|Co\.?)\b/gi, "").trim()).trim());
  const li = "https://www.linkedin.com/search/results/people/?keywords=" + liKw;
  const web = safeUrl(c.website);
  const pills = STATUS.map(s => { const on = r.status === s.k; return `<button class="pill" data-st="${esc(s.k)}" ${on && s.k === "nicht erreicht" ? `title="Nochmal nicht erreicht? Klicken zählt einen neuen Versuch."` : ""} style="${on ? `background:${s.c};color:#fff;border-color:${s.c}` : ""}">${esc(s.k)}</button>`; }).join("");
  const opt = (arr, v) => arr.map(k => `<option ${k === v ? "selected" : ""}>${esc(k)}</option>`).join("");
  const people = (r.people || []).map((p, i) => `
     <div class="person"><span><span class="pn">${esc(p.name)}</span>${p.rolle ? ` <span class="pr">· ${esc(p.rolle)}</span>` : ""}</span>
       <span class="pc">${p.tel ? `<a href="#" data-copy="${esc(p.tel)}">📞 ${esc(p.tel)}</a>` : ""}${p.mail ? `<a href="mailto:${esc(p.mail)}">✉ ${esc(p.mail)}</a>` : ""}
       <button class="linkbtn" data-delp="${i}" title="Entfernen">✕</button></span></div>`).join("");
  const evs = log.filter(e => e.c === curId).slice().reverse();
  const timeline = evs.length ? evs.map(e => {
    const txt = evText(e);
    return `<div class="tl-item" style="--c:${evColor(e)}"><div class="tl-when">${longDate(dayKey(e.t))}${e.legacy ? "" : " · " + timeOf(e.t)}${e.legacy ? ' <span class="legacy">(aus Altdaten)</span>' : ""}</div>
      <div>${describe(e)}</div>${txt && e.type === "act" ? `<div class="tl-note">${esc(txt)}</div>` : ""}</div>`;
  }).join("") : `<div class="empty">Noch keine Aktivität.</div>`;
  const posLbl = pos >= 0 ? `KONTAKT ${pos + 1} / ${fl.length}` : (REACHED.has(r.status) && filter === "todo" ? `ERREICHT ✓ – NICHT MEHR IN DER LISTE` : `AUSSERHALB DES FILTERS`);

  $("main").innerHTML = `<div class="rec">
   <div class="navrow"><span class="pos mono">${posLbl}</span>
     <span><button class="iconbtn" id="prev" ${pos === 0 ? "disabled" : ""} title="Vorheriger (←)">‹</button> <button class="iconbtn" id="next" ${pos >= fl.length - 1 && pos >= 0 ? "disabled" : ""} title="Nächster (→)">›</button></span></div>
   <div class="card"><div style="display:flex;gap:10px;align-items:flex-start">
     <span class="dot" style="margin-top:9px;width:10px;height:10px;background:${sc(r.status)}"></span>
     <div style="min-width:0;flex:1"><h1 class="cname serif">${esc(c.name)}</h1>
     <p class="cmeta">${esc(gfName(c.gf)) || "—"} · Geschäftsführung &nbsp;|&nbsp; ${esc(c.plz)} ${esc(c.ort)}${c.ma !== "" && c.ma != null ? ` &nbsp;|&nbsp; ${esc(c.ma)} Mitarbeiter` : ""}</p></div>
     <button class="linkbtn" id="edit" title="Stammdaten bearbeiten">✎ Bearbeiten</button></div>
     <div class="actions">
       <a class="act call ${c.tel ? "" : "dis"}" id="callcopy" title="Nummer kopieren">📞 ${esc(c.tel) || "keine Nummer"}</a>
       <a class="act ${web ? "" : "dis"}" href="${esc(web)}" target="_blank" rel="noreferrer">🌐 Website</a>
       <a class="act" href="${li}" target="_blank" rel="noreferrer">Auf LinkedIn suchen ↗</a>
     </div></div>
   <div style="margin-top:20px"><span class="lbl mono">STATUS${triesOf(curId) ? ` · ${triesOf(curId)}× NICHT ERREICHT` : ""}</span><div class="pills" id="pills">${pills}</div></div>
   <div class="grid">
     <div class="fld"><label class="mono">KANAL</label><select id="kanal">${opt(KANAL, r.kanal)}</select></div>
     <div class="fld"><label class="mono">NEWSLETTER / WARTELISTE</label><select id="news">${opt(NEWS, r.newsletter)}</select></div>
     <div class="fld"><label class="mono">BROSCHÜRE GESENDET</label>
       <button class="toggle ${r.broschuere.sent ? "on" : ""}" id="bro"><span class="box ${r.broschuere.sent ? "on" : ""}">${r.broschuere.sent ? "✓" : ""}</span>${r.broschuere.sent ? ("gesendet am " + fmt(r.broschuere.date)) : "noch nicht gesendet"}</button></div>
     <div class="fld"><label class="mono">LETZTER KONTAKT</label><input type="date" id="last" value="${esc(r.lastContact)}"></div>
     <div class="fld ${isDue(r) ? "due" : ""}"><label class="mono">WIEDERVORLAGE ${isDue(r) ? "· FÄLLIG" : ""}</label><input type="date" id="fu" value="${esc(r.followUp)}"></div>
     <div class="fld"><label class="mono">&nbsp;</label>${r.followUp ? `<button class="btn small" id="fudone">✓ Wiedervorlage erledigt</button>` :
       `<span class="tiny">Schnell: <button class="linkbtn" data-fu="1">morgen</button> · <button class="linkbtn" data-fu="3">in 3 Tagen</button> · <button class="linkbtn" data-fu="7">in 1 Woche</button></span>`}</div>
   </div>

   <div class="section"><span class="lbl mono">👤 ANSPRECHPARTNER</span>
     <div class="people">${people || ""}</div>
     ${showPersonForm ? `<form class="pform" id="pform">
         <input name="name" placeholder="Name*" required><input name="rolle" placeholder="Rolle (z. B. Assistenz)">
         <input name="tel" placeholder="Telefon"><input name="mail" type="email" placeholder="E-Mail">
         <button class="btn small petrol">Speichern</button></form>`
       : `<button class="linkbtn" id="addp" style="margin-top:${people ? 8 : 0}px">＋ Ansprechpartner hinzufügen</button>`}
   </div>

   <div class="section"><span class="lbl mono">📝 NOTIZEN (ALLGEMEIN)</span>
     <textarea id="notes" rows="5" placeholder="Was wurde besprochen? Einwände, nächster Schritt, Stimmung…">${esc(r.notes)}</textarea></div>

   <div class="bottom">
     <button class="btn" id="bprev" ${pos === 0 ? "disabled" : ""}>‹ Zurück</button>
     <button class="btn prim ml" id="bnext">Als kontaktiert &amp; weiter ›</button>
   </div>

   <div class="section"><span class="lbl mono">AKTIVITÄT</span>
     <div class="actbox">
       <textarea id="acttext" placeholder="Aktivität erfassen – z. B. Gesprächsnotiz, was per Mail rausging… (Strg+Enter speichert)"></textarea>
       <div class="actbar">${ACT_KINDS.map(k => `<button class="kind ${k === actKind ? "on" : ""}" data-kind="${k}">${k}</button>`).join("")}
         <button class="btn small petrol ml" id="actsave">Erfassen</button></div>
     </div>
     <div class="tl-list">${timeline}</div>
   </div>
   <div style="height:40px"></div>
  </div>`;

  const r2 = () => rec(curId);
  $("prev").onclick = $("bprev").onclick = () => step(-1);
  $("next").onclick = () => step(1);
  $("bnext").onclick = () => step(1, () => { if (get(curId).status === "offen") changeStatus(curId, "kontaktiert"); });
  $("pills").querySelectorAll(".pill").forEach(b => b.onclick = () => { changeStatus(curId, b.dataset.st); render(); });
  $("kanal").onchange = e => { r2().kanal = e.target.value; logEv(curId, "kanal", {to: e.target.value}); save(); };
  $("news").onchange = e => { r2().newsletter = e.target.value; logEv(curId, "news", {to: e.target.value}); save(); progress(); };
  $("last").onchange = e => { r2().lastContact = e.target.value; save(); renderRail(); };
  const setFU = v => { r2().followUp = v; logEv(curId, "followup", {to: v}); save(); render(); };
  $("fu").onchange = e => setFU(e.target.value);
  if ($("fudone")) $("fudone").onclick = () => setFU("");
  document.querySelectorAll("[data-fu]").forEach(b => b.onclick = () => setFU(addDays(td, +b.dataset.fu)));
  $("bro").onclick = () => { const x = r2(); x.broschuere = x.broschuere.sent ? {sent:false,date:""} : {sent:true,date:today()}; logEv(curId, "bro", {on: x.broschuere.sent}); save(); render(); };
  const notes = $("notes"); let notesBefore = r.notes || "";
  notes.oninput = e => { r2().notes = e.target.value; save(); };
  notes.onchange = e => { const v = e.target.value; if (v !== notesBefore) { logEv(curId, "notes", {text: v.slice(0, 300)}); notesBefore = v; save(); } };
  const cc = $("callcopy");
  if (c.tel) cc.onclick = () => { copyText(c.tel); const o = cc.innerHTML; cc.innerHTML = "✓ kopiert"; setTimeout(() => { cc.innerHTML = o; }, 1200); };
  $("edit").onclick = () => editCompany(curId);
  document.querySelectorAll("[data-copy]").forEach(a => a.onclick = ev => { ev.preventDefault(); copyText(a.dataset.copy); toast("Nummer kopiert"); });
  document.querySelectorAll("[data-delp]").forEach(b => b.onclick = () => {
    const p = r2().people[+b.dataset.delp]; if (p && confirm(`Ansprechpartner „${p.name}" entfernen?`)) { r2().people.splice(+b.dataset.delp, 1); save(); render(); } });
  if ($("addp")) $("addp").onclick = () => { showPersonForm = true; renderWork(); $("pform").elements.name.focus(); };
  if ($("pform")) $("pform").onsubmit = ev => {
    ev.preventDefault(); const f = ev.target.elements;
    const p = {name: f.name.value.trim(), rolle: f.rolle.value.trim(), tel: f.tel.value.trim(), mail: f.mail.value.trim()};
    if (!p.name) return;
    r2().people.push(p); logEv(curId, "person", {name: p.name}); showPersonForm = false; save(); render();
  };
  document.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => { actKind = b.dataset.kind; document.querySelectorAll("[data-kind]").forEach(x => x.classList.toggle("on", x === b)); });
  const saveAct = () => {
    const t = $("acttext").value.trim(); if (!t) return;
    rec(curId); logEv(curId, "act", {kind: actKind, text: t});
    if (actKind === "Anruf" || actKind === "Meeting") r2().lastContact = today();
    save(); render(); toast(actKind + " erfasst");
  };
  $("actsave").onclick = saveAct;
  $("acttext").onkeydown = e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveAct(); } };
}

/* ---------- Firma anlegen / bearbeiten ---------- */
function editCompany(id){
  const c = id ? byId.get(id) : {name:"",gf:"",plz:"",ort:"",tel:"",website:"",ma:""};
  const m = $("modal");
  const f = (n, l, cls = "", type = "text") => `<div class="fld ${cls}"><label class="mono">${l}</label><input name="${n}" type="${type}" value="${esc(c[n])}"></div>`;
  m.innerHTML = `<form class="mbox" id="cform"><h2>${id ? "Firma bearbeiten" : "Neue Firma anlegen"}</h2>
    <div class="mgrid">${f("name", "FIRMA*", "full")}${f("gf", "GESCHÄFTSFÜHRUNG (Nachname, Vorname)", "full")}
      ${f("plz", "PLZ")}${f("ort", "ORT")}${f("tel", "TELEFON")}${f("ma", "MITARBEITER", "", "number")}${f("website", "WEBSITE", "full")}</div>
    <div class="bottom">${id ? `<button type="button" class="btn danger" id="cdel">Löschen</button>` : ""}
      <button type="button" class="btn ml" id="ccancel">Abbrechen</button><button class="btn prim">Speichern</button></div></form>`;
  m.hidden = false;
  m.querySelector("[name=name]").focus();
  const close = () => { m.hidden = true; m.innerHTML = ""; };
  $("ccancel").onclick = close;
  m.onclick = e => { if (e.target === m) close(); };
  if ($("cdel")) $("cdel").onclick = () => {
    if (!confirm(`„${c.name}" wirklich löschen? Status und Notizen gehen verloren.`)) return;
    contacts = contacts.filter(x => x.id !== id); delete records[id]; reindex(); curId = null; save(); close(); location.hash = "#/liste"; render();
  };
  $("cform").onsubmit = e => {
    e.preventDefault(); const v = e.target.elements;
    const data = {name: v.name.value.trim(), gf: v.gf.value.trim(), plz: v.plz.value.trim(), ort: v.ort.value.trim(), tel: v.tel.value.trim(), website: v.website.value.trim(), ma: v.ma.value === "" ? "" : Number(v.ma.value)};
    if (!data.name) return;
    let cid = id;
    if (id) { Object.assign(byId.get(id), data); logEv(id, "edited"); }
    else { cid = "n" + uid(); contacts.push({id: cid, ...data}); reindex(); logEv(cid, "created"); }
    save(); close(); openContact(cid);
  };
}

/* ---------- Kontaktliste (Tabelle) ---------- */
const COLS = [
  {k:"name", l:"FIRMA", v: c => c.name},
  {k:"gf", l:"ANSPRECHPARTNER", v: c => c.gf},
  {k:"ort", l:"ORT", v: c => c.ort},
  {k:"tel", l:"TELEFON", v: c => c.tel, cls:"hide-sm"},
  {k:"status", l:"STATUS", v: c => STATUS.findIndex(s => s.k === get(c.id).status)},
  {k:"last", l:"LETZTER KONTAKT", v: c => get(c.id).lastContact || "", cls:"hide-sm"},
  {k:"fu", l:"WIEDERVORLAGE", v: c => get(c.id).followUp || "", cls:"hide-sm"},
  {k:"ma", l:"MA", v: c => Number(c.ma) || 0, cls:"hide-sm"},
];
function listRows(){
  const q = parseQ(listQ);
  const out = [];
  for (const c of contacts) {
    const r = get(c.id);
    if (listStatus === "faellig") { if (!isDue(r)) continue; }
    else if (listStatus === "broschuere") { if (!r.broschuere.sent) continue; }
    else if (listStatus === "warteliste") { if (r.newsletter !== "Warteliste") continue; }
    else if (listStatus !== "alle" && r.status !== listStatus) continue;
    const m = match(c, q); if (!m) continue;
    out.push({c, m});
  }
  const col = COLS.find(x => x.k === listSort.k) || COLS[0];
  out.sort((a, b) => {
    const x = col.v(a.c), y = col.v(b.c);
    if (x === "" && y !== "") return 1; if (y === "" && x !== "") return -1; // Leere immer unten
    return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "de")) * listSort.dir;
  });
  return {rows: out, q};
}
function renderList(){
  const main = $("main");
  if (!main.querySelector("#lq")) {
    main.innerHTML = `<div class="page">
      <div class="ptitle"><h1 class="serif">Kontakte</h1><span class="tiny" id="lcount"></span>
        <button class="btn small ml" id="newc">＋ Firma anlegen</button></div>
      <div class="filters">
        <div class="search">⌕<input id="lq" placeholder="Firma, Person, Ort, PLZ, Telefon oder Notizen durchsuchen…"></div>
        <select id="ls"><option value="alle">Alle Status</option>${STATUS.map(s => `<option value="${esc(s.k)}">${esc(s.k)}</option>`).join("")}
          <option value="faellig">⏰ Wiedervorlage fällig</option><option value="broschuere">📄 Broschüre gesendet</option><option value="warteliste">★ Warteliste</option></select>
      </div>
      <div class="tablewrap"><table><thead><tr id="lhead"></tr></thead><tbody id="lbody"></tbody></table></div>
      <div id="lmore" style="margin-top:12px"></div></div>`;
    $("lq").oninput = e => { listQ = e.target.value; listLimit = LIST_STEP; renderListBody(); };
    $("ls").onchange = e => { listStatus = e.target.value; listLimit = LIST_STEP; renderListBody(); };
    $("newc").onclick = () => editCompany(null);
  }
  $("lq").value = listQ; $("ls").value = listStatus;
  renderListBody();
}
function renderListBody(){
  const {rows, q} = listRows();
  $("lcount").textContent = rows.length === contacts.length ? plural(contacts.length, "Firma", "Firmen") : `${rows.length} von ${contacts.length}`;
  $("lhead").innerHTML = COLS.map(c => `<th class="${c.cls || ""} ${listSort.k === c.k ? "sorted" : ""}" data-k="${c.k}">${c.l}${listSort.k === c.k ? (listSort.dir > 0 ? " ↑" : " ↓") : ""}</th>`).join("");
  $("lhead").querySelectorAll("th").forEach(th => th.onclick = () => {
    listSort = listSort.k === th.dataset.k ? {k: th.dataset.k, dir: -listSort.dir} : {k: th.dataset.k, dir: 1}; renderListBody(); });
  $("lbody").innerHTML = rows.slice(0, listLimit).map(({c, m}) => {
    const r = get(c.id);
    let hit = "";
    if (m.in === "person") hit = `👤 ${esc(m.p.name)}${m.p.rolle ? " · " + esc(m.p.rolle) : ""}`;
    else if (m.in === "notiz") hit = "📝 " + esc(noteSnippet(c, q));
    const people = (r.people || []).length;
    return `<tr class="r" data-id="${esc(c.id)}">
      <td><div class="n">${esc(c.name)}</div>${hit ? `<div class="hit">${hit}</div>` : ""}</td>
      <td>${esc(gfName(c.gf)) || "—"}${people ? ` <span class="tiny">+${people}</span>` : ""}</td>
      <td class="nowrap">${esc(c.plz)} ${esc(c.ort)}</td>
      <td class="nowrap hide-sm">${esc(c.tel)}</td>
      <td class="nowrap"><span class="dot" style="background:${sc(r.status)}"></span> ${esc(r.status)}</td>
      <td class="nowrap hide-sm">${fmt(r.lastContact)}</td>
      <td class="nowrap hide-sm">${r.followUp ? (isDue(r) ? `<span class="badge due">${fmt(r.followUp)}</span>` : fmt(r.followUp)) : ""}</td>
      <td class="hide-sm">${esc(c.ma)}</td></tr>`;
  }).join("") || `<tr><td colspan="${COLS.length}" class="empty" style="padding:20px">Keine Treffer.</td></tr>`;
  $("lbody").querySelectorAll("tr.r").forEach(tr => tr.onclick = () => openContact(tr.dataset.id));
  $("lmore").innerHTML = rows.length > listLimit ? `<button class="btn small" id="lmorebtn">Weitere ${Math.min(LIST_STEP, rows.length - listLimit)} anzeigen (${rows.length - listLimit} übrig)</button>` : "";
  if ($("lmorebtn")) $("lmorebtn").onclick = () => { listLimit += LIST_STEP; renderListBody(); };
}

/* ---------- Mein Tag ---------- */
function renderDay(){
  const k = dayK, td = today();
  const st = dayStats(k);
  const perDay = attemptsPerDay();
  // Diagramm: 14 Tage, endet heute – oder am gewählten Tag, wenn der weiter zurückliegt
  const end = k > addDays(td, -CHART_DAYS + 1) ? td : k;
  const days = []; for (let i = CHART_DAYS - 1; i >= 0; i--) days.push(addDays(end, -i));
  const max = Math.max(1, ...days.map(d => perDay.get(d) || 0));
  const name = id => { const c = byId.get(id); return c ? esc(c.name) : "<i>(gelöschte Firma)</i>"; };
  const link = id => byId.has(id) ? `<a class="cn" href="#/kontakt/${encodeURIComponent(id)}">${name(id)}</a>` : `<span class="cn">${name(id)}</span>`;

  const chrono = st.evs.slice().reverse().map(e => {
    const txt = evText(e);
    return `<div class="ev"><span class="tm">${e.legacy ? "—" : timeOf(e.t)}</span><span class="dot" style="background:${evColor(e)};margin-top:5px"></span>
      <div style="min-width:0;flex:1">${link(e.c)} <span class="ds">· ${describe(e)}</span>${txt ? `<div class="nt">${esc(txt.length > 220 ? txt.slice(0, 220) + "…" : txt)}</div>` : ""}</div></div>`;
  }).join("");
  const groups = new Map();
  st.evs.forEach(e => { if (!groups.has(e.c)) groups.set(e.c, []); groups.get(e.c).push(e); });
  const grouped = [...groups].map(([id, evs]) => {
    const r = get(id);
    return `<div class="grp"><div class="gh"><span class="dot" style="background:${sc(r.status)}"></span>${link(id)}<span class="tiny ml">${esc(r.status)}</span></div>
      <ul>${evs.map(e => `<li><span class="tm">${e.legacy ? "—" : timeOf(e.t)}</span><span>${describe(e)}${evText(e) ? `<div class="nt tiny" style="white-space:pre-wrap">${esc(evText(e))}</div>` : ""}</span></li>`).join("")}</ul></div>`;
  }).join("");

  // Wiedervorlagen
  const dueList = contacts.filter(c => { const r = get(c.id); if (!r.followUp || r.status === "kein Interesse") return false; return k === td ? r.followUp <= k : r.followUp === k; })
    .sort((a, b) => get(a.id).followUp.localeCompare(get(b.id).followUp));
  const retry = k === td ? contacts.filter(c => { const r = get(c.id); return r.status === "nicht erreicht" && r.lastContact && r.lastContact < td; }).length : 0;
  const callbacks = contacts.filter(c => get(c.id).status === "Rückruf vereinbart" && !get(c.id).followUp).length;

  const kpi = (v, l, sub = "") => `<div class="kpi"><div class="v">${v}</div><div class="k">${l}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
  $("main").innerHTML = `<div class="page">
    <div class="ptitle"><h1 class="serif">${k === td ? "Heute" : k === addDays(td, -1) ? "Gestern" : "Mein Tag"}</h1><span class="tiny">${longDate(k)}</span>
      <div class="daynav ml"><button class="iconbtn" id="dprev" title="Vorheriger Tag">‹</button>
        <input type="date" id="dpick" value="${k}" max="${td}"><button class="iconbtn" id="dnext" ${k >= td ? "disabled" : ""} title="Nächster Tag">›</button>
        ${k !== td ? `<button class="btn small" id="dtoday">Heute</button>` : ""}
        <button class="btn small" id="dcopy" title="Zusammenfassung in die Zwischenablage">⧉ Tagesbericht kopieren</button></div></div>
    <div class="kpis">
      ${kpi(st.anrufe, "Anrufversuche", `${st.erreicht} erreicht · ${st.nicht} nicht erreicht`)}
      ${kpi(st.zusagen, "Infos zugesagt")}
      ${kpi(st.bro, "Broschüren")}
      ${kpi(st.wl, "Warteliste")}
      ${kpi(st.notizen, "Notizen & Aktivitäten")}
      ${kpi(st.firmen, "Firmen bearbeitet")}
    </div>
    <div class="chart" role="img" aria-label="Anrufversuche pro Tag, letzte ${CHART_DAYS} Tage">
      <div class="tiny" style="display:flex"><span>Anrufversuche pro Tag (inkl. nicht erreicht)</span><span class="ml">${fmt(days[0]).slice(0, 5)} – ${fmt(days[days.length - 1]).slice(0, 5)}</span></div>
      <div class="bars">${days.map(d => { const v = perDay.get(d) || 0;
        return `<button class="bcol ${d === k ? "sel" : ""}" data-d="${d}" title="${WEEKDAY[parseDay(d).getDay()].slice(0, 2)} ${fmt(d)}: ${v} Anrufversuche"><span class="bv">${v}</span><span class="b" style="height:${v / max * 100}%"></span></button>`; }).join("")}</div>
      <div class="blabels">${days.map(d => { const wd = parseDay(d).getDay(); return `<span class="${wd === 0 || wd === 6 ? "we" : ""} ${d === k ? "sel" : ""}">${WEEKDAY[wd].slice(0, 2)}<br>${d.slice(8)}</span>`; }).join("")}</div>
    </div>
    <div class="cols">
      <div class="panel"><h2>Was ich gemacht habe <span class="tiny">${plural(st.evs.length, "Eintrag", "Einträge")}</span>
        <span class="seg"><button data-m="chrono" class="${dayMode === "chrono" ? "on" : ""}">Zeitlich</button><button data-m="group" class="${dayMode === "group" ? "on" : ""}">Nach Firma</button></span></h2>
        ${st.evs.length ? (dayMode === "chrono" ? chrono : grouped) : `<div class="empty">An diesem Tag wurde nichts erfasst.</div>`}
      </div>
      <div>
        <div class="panel"><h2>⏰ Wiedervorlagen ${k === td ? "fällig" : "für diesen Tag"} <span class="tiny">${dueList.length}</span></h2>
          ${dueList.length ? dueList.map(c => { const r = get(c.id); return `<div class="due-item"><span class="dot" style="background:${sc(r.status)}"></span>
            <a class="cn" href="#/kontakt/${encodeURIComponent(c.id)}">${esc(c.name)}</a>${r.followUp < k ? `<span class="badge due">${fmt(r.followUp)}</span>` : ""}
            <button class="linkbtn" data-done="${esc(c.id)}" title="Als erledigt markieren">✓</button></div>`; }).join("") : `<div class="empty">Nichts fällig.</div>`}
        </div>
        ${k === td ? `<div class="panel" style="margin-top:12px"><h2>Offene Punkte</h2>
          <div class="due-item"><span class="cn">Nicht erreicht – nochmal versuchen</span><b>${retry}</b></div>
          <div class="due-item"><span class="cn">Rückruf vereinbart, ohne Wiedervorlage</span><b>${callbacks}</b></div>
          <div style="margin-top:8px"><a class="linkbtn" href="#/" id="gowork">→ Zum Abarbeiten</a></div></div>` : ""}
      </div>
    </div></div>`;

  const go = d => { location.hash = "#/tag/" + d; };
  $("dprev").onclick = () => go(addDays(k, -1));
  $("dnext").onclick = () => go(addDays(k, 1));
  $("dpick").onchange = e => { if (e.target.value) go(e.target.value); };
  if ($("dtoday")) $("dtoday").onclick = () => go(td);
  document.querySelectorAll(".bcol").forEach(b => b.onclick = () => go(b.dataset.d));
  document.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { dayMode = b.dataset.m; renderDay(); });
  document.querySelectorAll("[data-done]").forEach(b => b.onclick = () => { const id = b.dataset.done; rec(id).followUp = ""; logEv(id, "followup", {to: ""}); save(); renderDay(); });
  if ($("gowork")) $("gowork").onclick = () => { filter = "todo"; document.querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x.dataset.f === "todo")); };
  $("dcopy").onclick = () => {
    const lines = [`Tagesbericht ${longDate(k)}`, "",
      `Anrufversuche: ${st.anrufe} (erreicht ${st.erreicht}, nicht erreicht ${st.nicht})`,
      `Infos zugesagt: ${st.zusagen} · Broschüren: ${st.bro} · Warteliste: ${st.wl}`, "", "Verlauf:"];
    st.evs.forEach(e => { const c = byId.get(e.c); const tmp = document.createElement("div"); tmp.innerHTML = describe(e);
      lines.push(`${e.legacy ? "  –  " : timeOf(e.t)}  ${c ? c.name : "(gelöscht)"} – ${tmp.textContent}${evText(e) && e.type === "act" ? ": " + evText(e).replace(/\s+/g, " ") : ""}`); });
    copyText(lines.join("\n")); toast("Tagesbericht kopiert");
  };
}

/* ---------- Import / Export ---------- */
function exportAll(){
  flush();
  const data = {app: "bniw-crm", v: 2, exported: new Date().toISOString(), contacts, records, log};
  download("bniw-crm-sicherung-" + today() + ".json", JSON.stringify(data));
  meta.lastExport = Date.now(); save();
  toast("Sicherung heruntergeladen");
}
function mergeContacts(list){
  let added = 0;
  for (const c of list) {
    if (!c || typeof c.name !== "string") continue;
    const id = String(c.id || ("n" + uid()));
    if (byId.has(id)) continue;
    const nc = {id, name: c.name, plz: String(c.plz || ""), ort: String(c.ort || ""), gf: String(c.gf || ""), ma: c.ma ?? "", website: String(c.website || ""), tel: String(c.tel || "")};
    contacts.push(nc); byId.set(id, nc); added++;
  }
  reindex();
  return added;
}
function importText(text, fileName){
  const msgs = [];
  if (/\.html?$/i.test(fileName) || /^\s*<!doctype|^\s*<html/i.test(text)) {
    const m = text.match(/const\s+DATA\s*=\s*(\[[\s\S]*?\])\s*;\s*\n/);
    if (!m) throw new Error("In der HTML-Datei wurde keine Kontaktliste gefunden.");
    const n = mergeContacts(JSON.parse(m[1]));
    msgs.push(plural(n, "Firma", "Firmen") + " übernommen");
  } else {
    const obj = JSON.parse(text);
    if (Array.isArray(obj)) {
      msgs.push(plural(mergeContacts(obj), "Firma", "Firmen") + " übernommen");
    } else if (obj && obj.app === "bniw-crm") {
      const n = mergeContacts(obj.contacts || []);
      Object.assign(records, obj.records || {});
      const ids = new Set(log.map(e => e.id)); let le = 0;
      for (const e of (obj.log || [])) if (e && e.id && !ids.has(e.id)) { log.push(e); le++; }
      log.sort((a, b) => a.t - b.t); logVersion++;
      msgs.push(plural(n, "Firma", "Firmen"), Object.keys(obj.records || {}).length + " Datensätze", plural(le, "Aktivität", "Aktivitäten") + " importiert");
    } else if (obj && typeof obj === "object") {
      // Export aus der alten HTML-Datei: {id: {status, notes, …}}
      const entries = Object.entries(obj).filter(([, v]) => v && typeof v === "object" && "status" in v);
      const touched = entries.filter(([, v]) => isTouched(v));
      if (!touched.length) throw new Error(entries.length || !Object.keys(obj).length
        ? "Die Datei enthält keine bearbeiteten Kontakte – alle stehen auf „offen“, ohne Notizen. Vermutlich stammt der Export aus einem anderen Browser oder Fenster als dem, in dem du gearbeitet hast."
        : "Unbekanntes Dateiformat.");
      for (const [id, v] of touched) records[id] = {...def(), ...v};
      const n = synthLegacy(touched.map(([id]) => id));
      const by = {}; touched.forEach(([, v]) => { by[v.status] = (by[v.status] || 0) + 1; });
      msgs.push(plural(touched.length, "bearbeiteter Kontakt", "bearbeitete Kontakte") + " übernommen",
        STATUS.filter(s => by[s.k]).map(s => `${by[s.k]}× ${s.k}`).join(", "),
        plural(touched.filter(([, v]) => v.notes).length, "mit Notiz", "mit Notizen"),
        plural(touched.filter(([, v]) => v.broschuere && v.broschuere.sent).length, "Broschüre", "Broschüren"),
        n ? plural(n, "Verlaufseintrag", "Verlaufseinträge") + " aus Datumsangaben rekonstruiert" : "");
      if (touched.some(([id]) => !byId.has(id))) msgs.push("⚠ Einige Kontakte fehlen noch in der Firmenliste – bitte auch die alte HTML-Datei importieren.");
    } else throw new Error("Unbekanntes Dateiformat.");
  }
  save(); flush(); askPersist();
  return msgs.filter(Boolean);
}
const isTouched = r => r && typeof r === "object" && ((r.status && r.status !== "offen") || r.notes || r.lastContact ||
  (r.broschuere && r.broschuere.sent) || (r.newsletter && r.newsletter !== "—") || (r.kanal && r.kanal !== "—"));
function showInfo(title, lines){
  const m = $("modal");
  m.innerHTML = `<div class="mbox"><h2>${esc(title)}</h2><ul style="margin-left:18px;font-size:14px;line-height:1.7">${lines.map(l => `<li>${esc(l)}</li>`).join("")}</ul>
    <div class="bottom"><button class="btn prim ml" id="infook">OK</button></div></div>`;
  m.hidden = false; $("infook").focus();
  $("infook").onclick = () => { m.hidden = true; m.innerHTML = ""; };
}
function pickFile(){ $("file").value = ""; $("file").click(); }
function handleFile(f){
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try { const msgs = importText(rd.result, f.name); render(); showInfo("✓ Import erfolgreich", msgs); }
    catch (err) { showInfo("Import nicht möglich", [err.message]); }
  };
  rd.readAsText(f);
}
$("file").onchange = e => handleFile(e.target.files[0]);
function bindDrop(el){
  el.ondragover = e => { e.preventDefault(); el.classList.add("over"); };
  el.ondragleave = () => el.classList.remove("over");
  el.ondrop = e => { e.preventDefault(); el.classList.remove("over"); handleFile(e.dataTransfer.files[0]); };
  el.onclick = pickFile;
}
let persisted = null;
async function askPersist(){ try { if (navigator.storage && navigator.storage.persist) persisted = await navigator.storage.persist(); } catch(e) {} }
(async () => { try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); if (!persisted && contacts.length) askPersist(); } catch(e) {} })();

function renderOnboarding(){
  $("main").innerHTML = `<div class="page" style="max-width:720px">
    <div class="dcard"><h2 class="serif" style="font-size:24px">Willkommen in deinem CRM 👋</h2>
      <p>Deine Kontakte und Notizen werden <b>nur hier auf diesem Rechner</b> gespeichert – nichts landet im Internet. Zum Start brauchst du deine bisherigen Daten:</p>
      <ol>
        <li><b>Kontaktliste:</b> Wähle deine bisherige Datei <span class="mono">BNIW_Verwaltungskontakte….html</span> – die Firmenliste wird daraus übernommen.</li>
        <li><b>Status &amp; Notizen:</b> Öffne die alte HTML-Datei wie gewohnt im Browser, klicke oben auf <b>⭳ Export</b> und lade die JSON-Datei hier ebenfalls hoch.</li>
      </ol>
      <div class="drop" id="drop">Datei hierher ziehen oder <b style="color:var(--petrol)">klicken zum Auswählen</b><br><span class="tiny">.html (alte App) · .json (Notizen-Export oder Sicherung)</span></div>
      <p class="tiny">Du kannst auch ohne Liste starten: <button class="linkbtn" id="obnew">＋ Erste Firma anlegen</button></p>
    </div></div>`;
  bindDrop($("drop"));
  $("obnew").onclick = () => editCompany(null);
}
function renderData(){
  const total = contacts.length, worked = contacts.filter(c => !isOpen(get(c.id).status)).length;
  const people = contacts.reduce((n, c) => n + (get(c.id).people || []).length, 0);
  const lastExp = meta.lastExport ? new Date(meta.lastExport).toLocaleString("de-DE", {dateStyle: "medium", timeStyle: "short"}) : "noch nie";
  $("main").innerHTML = `<div class="page" style="max-width:760px">
    <div class="ptitle"><h1 class="serif">Daten</h1></div>
    <div class="dcard"><h2>Überblick</h2>
      <div class="stats"><span><b>${total}</b> Firmen</span><span><b>${worked}</b> bearbeitet</span><span><b>${people}</b> Ansprechpartner</span><span><b>${log.length}</b> Aktivitäten</span></div>
      <p class="tiny">Speicherort: dieser Browser auf diesem Rechner. ${persisted ? "✓ Dauerhafter Speicher ist aktiv (der Browser löscht nichts automatisch)." : "Dauerhafter Speicher ist nicht bestätigt – regelmäßige Sicherungen sind deshalb besonders wichtig."}</p></div>
    <div class="dcard"><h2>Sichern</h2>
      <p>Lädt alles (Firmen, Status, Notizen, Ansprechpartner, Verlauf) als eine Datei herunter. Damit kannst du die Daten auf einem anderen Rechner wiederherstellen. Letzte Sicherung: <b>${lastExp}</b>.</p>
      <button class="btn petrol" id="exp">⭳ Sicherung herunterladen</button></div>
    <div class="dcard"><h2>Importieren</h2>
      <p>Akzeptiert: die alte HTML-Datei (Kontaktliste), den Notizen-Export der alten App, oder eine Sicherung aus dieser App. Bereits vorhandene Firmen werden nicht doppelt angelegt.</p>
      <div class="drop" id="drop">Datei hierher ziehen oder <b style="color:var(--petrol)">klicken zum Auswählen</b></div></div>
    <div class="dcard"><h2>Zurücksetzen</h2>
      <p>Vorher unbedingt sichern – das kann nicht rückgängig gemacht werden.</p>
      <button class="btn danger" id="rst1">Status, Notizen &amp; Verlauf löschen</button> <button class="btn danger" id="rst2">Alles löschen (inkl. Kontaktliste)</button></div>
  </div>`;
  $("exp").onclick = exportAll;
  bindDrop($("drop"));
  $("rst1").onclick = () => { if (confirm("Alle Status, Notizen, Ansprechpartner und den Verlauf löschen?")) { records = {}; log = []; logVersion++; save(); flush(); render(); toast("Zurückgesetzt"); } };
  $("rst2").onclick = () => { if (confirm("Wirklich ALLES löschen, auch die Kontaktliste?")) { records = {}; log = []; contacts = []; reindex(); curId = null; save(); flush(); location.hash = "#/"; render(); } };
}

/* ---------- Globale Suche ---------- */
let gSel = 0, gItems = [];
function globalResults(str){
  const q = parseQ(str); if (!q.terms.length) return [];
  const hits = [];
  for (const c of contacts) {
    const m = match(c, q); if (!m) continue;
    const nn = norm(c.name);
    const score = m.in === "firma" ? (nn.startsWith(q.terms[0]) ? 0 : 1) : m.in === "gf" || m.in === "person" ? 2 : m.in === "tel" ? 1 : 3;
    hits.push({c, m, score, q});
  }
  hits.sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name, "de"));
  return hits;
}
function renderGlobal(){
  const str = $("gq").value; const box = $("gres");
  if (!str.trim()) return closeGlobal();
  const hits = globalResults(str); gItems = hits.slice(0, 8);
  gSel = Math.min(gSel, Math.max(0, gItems.length - 1));
  box.innerHTML = (gItems.map((h, i) => {
    const {c, m, q} = h; const r = get(c.id);
    let main = esc(c.name), sub = `${esc(c.plz)} ${esc(c.ort)}`, badge = "";
    if (m.in === "gf") { main = esc(gfName(c.gf)); sub = esc(c.name) + " · Geschäftsführung"; badge = `<span class="badge person">Person</span>`; }
    else if (m.in === "person") { main = esc(m.p.name); sub = esc(c.name) + (m.p.rolle ? " · " + esc(m.p.rolle) : ""); badge = `<span class="badge person">Person</span>`; }
    else if (m.in === "tel") { sub = "📞 " + esc(c.tel); }
    else if (m.in === "notiz") { sub = "📝 " + esc(noteSnippet(c, q)); badge = `<span class="badge">Notiz</span>`; }
    return `<button class="gr ${i === gSel ? "sel" : ""}" data-id="${esc(c.id)}"><span class="dot" style="background:${sc(r.status)}"></span><span><span class="n">${main}</span><span class="s">${sub}</span></span>${badge}</button>`;
  }).join("") || `<div class="more">Keine Treffer.</div>`)
    + (hits.length > gItems.length ? `<button class="gfoot" id="gall">Alle ${hits.length} Treffer in der Kontaktliste anzeigen →</button>` : "");
  box.hidden = false;
  box.querySelectorAll(".gr").forEach(b => b.onmousedown = e => { e.preventDefault(); pickGlobal(b.dataset.id); });
  if ($("gall")) $("gall").onmousedown = e => { e.preventDefault(); listQ = str; listStatus = "alle"; $("gq").value = ""; closeGlobal(); $("gq").blur(); if (location.hash === "#/liste") render(); else location.hash = "#/liste"; };
}
function pickGlobal(id){ $("gq").value = ""; closeGlobal(); $("gq").blur(); openContact(id); }
function closeGlobal(){ $("gres").hidden = true; gSel = 0; }
$("gq").oninput = () => { gSel = 0; renderGlobal(); };
$("gq").onfocus = renderGlobal;
$("gq").onblur = () => setTimeout(closeGlobal, 120);
$("gq").onkeydown = e => {
  if (e.key === "ArrowDown") { e.preventDefault(); gSel = Math.min(gSel + 1, gItems.length - 1); renderGlobal(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); gSel = Math.max(gSel - 1, 0); renderGlobal(); }
  else if (e.key === "Enter") { e.preventDefault(); if (gItems[gSel]) pickGlobal(gItems[gSel].c.id); }
  else if (e.key === "Escape") { $("gq").value = ""; closeGlobal(); $("gq").blur(); }
};

/* ---------- Statische Bedienelemente ---------- */
$("q").oninput = e => { railQ = e.target.value; renderRail(); renderWork(); };
$("chips").querySelectorAll(".chip").forEach(b => b.onclick = () => {
  filter = b.dataset.f; document.querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === b)); render(); });
$("menu").onclick = () => $("rail").classList.toggle("hidden");
$("backup").onclick = exportAll;
window.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("gq").focus(); $("gq").select(); return; }
  if (e.key === "Escape" && !$("modal").hidden) { $("modal").hidden = true; return; }
  const t = e.target.tagName; if (t === "TEXTAREA" || t === "INPUT" || t === "SELECT") return;
  if (e.key === "/") { e.preventDefault(); $("gq").focus(); return; }
  if (view === "work" && contacts.length) {
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
  }
  if (view === "tag" && e.key === "ArrowLeft") location.hash = "#/tag/" + addDays(dayK, -1);
  if (view === "tag" && e.key === "ArrowRight" && dayK < today()) location.hash = "#/tag/" + addDays(dayK, 1);
});
// Gleiche Daten in mehreren Fenstern (z. B. Browser-Tab + installierte App) synchron halten
window.addEventListener("storage", e => {
  if (!Object.values(K).includes(e.key)) return;
  if (saveT) return; // eigene ungespeicherte Änderung hat Vorrang
  loadAll();
  const a = document.activeElement;
  if (!(a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && a.id !== "gq")))) render();
});

/* ---------- Installierbare App ---------- */
let installEvt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("install").hidden = false; });
$("install").onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("install").hidden = true; };
window.addEventListener("appinstalled", () => { $("install").hidden = true; toast("App installiert ✓"); });
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

parseHash();

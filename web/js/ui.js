/* UI shell: router, sheets, toasts, small components */

const SCREENS = {};
let stack = [];
const TABS = [["yard", "🏡", "Apiary"], ["plan", "📅", "Plan"], ["learn", "📖", "Learn"], ["biz", "🧾", "Business"], ["more", "⚙️", "More"]];

function screen(name, def) { SCREENS[name] = def; }
function titleOf(entry) { const d = SCREENS[entry.name]; return typeof d.title === "function" ? d.title(entry.params) : (d.title || "Back"); }
function nav(name, params = {}) { stack.push({ name, params }); render(); }
function replaceNav(name, params = {}) { stack[stack.length - 1] = { name, params }; render(); }
function back() { if (stack.length > 1) stack.pop(); render(); }
function tabTo(name) { stack = [{ name, params: {} }]; render(); }
function popTo(name) { while (stack.length > 1 && stack[stack.length - 1].name !== name) stack.pop(); render(); }

function render(keepScroll = false) {
  const v = document.getElementById("view");
  const st = v.scrollTop;
  if (!db.yards.length && stack[0]?.name !== "setup") stack = [{ name: "setup", params: {} }];
  const cur = stack[stack.length - 1], def = SCREENS[cur.name];
  const backBtn = stack.length > 1 ? `<button class="back" data-back>‹ ${esc(titleOf(stack[stack.length - 2]))}</button>` : "";
  v.innerHTML = backBtn + def.render(cur.params || {});
  v.classList.toggle("notabs", !!def.notabs);
  const tab = def.tab || (stack[0] && SCREENS[stack[0].name].tab) || "yard";
  document.getElementById("tabbar").style.display = def.notabs ? "none" : "flex";
  document.getElementById("tabbar").innerHTML = TABS.map(([k, ic, t]) => `<div data-tab="${k}" class="${k === tab ? "act" : ""}"><span class="ic">${ic}</span>${t}</div>`).join("");
  const fab = document.getElementById("fab");
  const fb = typeof def.fab === "function" ? def.fab(cur.params || {}) : def.fab;
  if (fb) { fab.style.display = "block"; fab.innerHTML = fb.label; fab.onclick = fb.onclick; } else fab.style.display = "none";
  const ph = document.getElementById("phone");
  ph.classList.toggle("new", !!db.settings.newMode);
  ph.classList.toggle("field", !!db.settings.fieldMode);
  ph.classList.toggle("dark", !!db.settings.batterySaver);
  document.getElementById("clock").textContent = nowTime();
  document.getElementById("sig").innerHTML = navigator.onLine ? "" : `<span class="off">Offline · saving on this phone</span>`;
  if (def.mount) def.mount(cur.params || {}, v);
  hydratePhotos(v);
  v.scrollTop = keepScroll ? st : 0;
}
const rerender = () => render(true);

/* ---------- global clicks ---------- */
document.addEventListener("click", e => {
  const t = e.target;
  const n = t.closest("[data-nav]");
  if (n) { nav(n.dataset.nav, n.dataset.p ? JSON.parse(n.dataset.p) : {}); return; }
  if (t.closest("[data-back]")) { back(); return; }
  const tb = t.closest("[data-tab]");
  if (tb) { tabTo(tb.dataset.tab); return; }
  const wb = t.closest(".whybtn");
  if (wb) { const w = wb.parentElement.querySelector(".why"); if (w) { w.classList.toggle("on"); wb.textContent = w.classList.contains("on") ? "Hide why" : "Why?"; } return; }
  const ch = t.closest(".chip");
  if (ch && ch.parentElement.classList.contains("chips") && !ch.dataset.static) {
    const g = ch.parentElement, multi = g.dataset.multi === "1";
    if (!multi) g.querySelectorAll(".chip").forEach(x => { if (x !== ch) x.classList.remove("on"); });
    if (multi && ch.dataset.v === "none") g.querySelectorAll(".chip").forEach(x => { if (x !== ch) x.classList.remove("on"); });
    if (multi && ch.dataset.v !== "none") g.querySelector('.chip[data-v="none"]')?.classList.remove("on");
    if (multi) ch.classList.toggle("on");
    else if (g.dataset.req === "1") ch.classList.add("on");
    else ch.classList.toggle("on");
    g.dispatchEvent(new CustomEvent("change", { bubbles: true }));
    return;
  }
  const tg = t.closest(".toggle[data-setting]");
  if (tg) { const k = tg.dataset.setting; db.settings[k] = !db.settings[k]; saveDb(); rerender(); return; }
});

/* ---------- components ---------- */
function chips(key, opts, value, multi = false, req = false) {
  const vals = Array.isArray(value) ? value : value != null ? [String(value)] : [];
  return `<div class="chips" data-key="${key}"${multi ? ' data-multi="1"' : ""}${req ? ' data-req="1"' : ""}>` +
    opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<span class="chip${vals.includes(String(v)) ? " on" : ""}" data-v="${esc(v)}">${l}</span>`; }).join("") + `</div>`;
}
const chipVal = (root, key) => root.querySelector(`.chips[data-key="${key}"] .chip.on`)?.dataset.v ?? null;
const chipVals = (root, key) => [...root.querySelectorAll(`.chips[data-key="${key}"] .chip.on`)].map(c => c.dataset.v);
const pill = (level, text) => text ? `<span class="pill ${level}">${esc(text)}</span>` : "";
const nb = text => text ? `<div class="newbie">${esc(text)}</div>` : "";
const toggle = (setting, label) => `<div class="toggle${db.settings[setting] ? " on" : ""}" data-setting="${setting}"><span class="sw"></span>${label}</div>`;

function needCard(n, withAction = false) {
  return `<div class="card expect ${n.level}">
    <div class="between"><b>${esc(n.title)}</b>${pill(n.level, { risk: "High", warn: "Watch", info: "Note", ok: "OK" }[n.level])}</div>
    ${n.detail ? `<div class="small" style="margin-top:4px">${esc(n.detail)}</div>` : ""}
    ${withAction && n.action ? `<div style="margin-top:6px;font-size:14px">→ ${esc(n.action)}${n.due && !/\b(before|by)\b/.test(n.action) ? ` <span class="small">by ${fmtShort(n.due)}</span>` : ""}</div>` : ""}
    ${n.conf ? `<div class="conf c${n.conf.level}">How sure: <b>${n.conf.level}</b></div>` : ""}
    ${n.why ? `<button class="whybtn">Why?</button><div class="why">${esc(n.why)}${n.conf ? `<br><b>How sure:</b> ${esc(n.conf.level)} — ${esc(n.conf.why)}` : ""}${n.conf?.confirm ? `<br><b>Confirm:</b> ${esc(n.conf.confirm)}` : ""}</div>` : ""}
    ${nb(n.newbie)}
  </div>`;
}

function forecastStrip(yardId) {
  const fc = forecastFor(yardId).slice(0, 7), y = yardOf(yardId), age = wxAge(yardId);
  if (!fc.length) return `<div class="note">${y?.lat == null ? `No forecast — this apiary has no location yet. <button class="link" data-yardloc="${yardId}">Set location</button>` : navigator.onLine ? "Loading the forecast…" : "No forecast yet — it loads the next time the phone has signal."}</div>`;
  return `${age != null && age >= 3 ? `<div class="small" style="margin-bottom:4px">Forecast from ${age >= 24 ? Math.round(age / 24) + " day(s)" : age + " h"} ago${navigator.onLine ? "" : " (offline)"}</div>` : ""}<div class="forecast">${fc.map(d => `<div class="day tap ${d.lo <= 32 ? "cold" : goodDay(d) ? "good" : ""}" data-day="${yardId}|${d.date}">${DOW[parseD(d.date).getDay()]}<b>${d.hi}°</b>${d.lo <= 32 ? `low ${d.lo}°` : d.sky}</div>`).join("")}</div>
    <div class="small" style="margin:0 0 6px">Tap a day: should I open it?</div>`;
}
function dayAdvice(yardId, date) {
  const d = forecastFor(yardId).find(x => x.date === date); if (!d) return;
  const a = openAdvice(d), fr = firstFreeze(forecastFor(yardId));
  const hrs = (d.hours || []).filter(h => h.h >= 8 && h.h <= 18);
  sheet(`<h3>Should I open it ${date === TODAY ? "today" : "on " + fmtD(date)}?</h3>
    <div class="small">${esc(yardOf(yardId).name)} · high ${d.hi}°F, low ${d.lo}°F · ${d.sky} ${esc(d.skyText || "")} · midday wind ${d.wind} mph${d.pop ? ` · rain chance ${d.pop}%` : ""}</div>
    <div class="note ${a.level}" style="margin-top:8px"><b>${esc(a.short)}.</b> ${esc(a.text)}</div>
    ${a.window ? `<div class="card small" style="color:var(--ink)">🕐 Best window: <b>${esc(a.window)}</b></div>` : ""}
    ${hrs.length ? `<div class="hours">${hrs.map(h => `<div class="${h.t >= 57 && h.wind < 15 && h.pop < 40 ? "good" : ""}"><span>${hourLabel(h.h).replace(" ", "")}</span><b>${h.t}°</b><span>${wxIcon(h.code)}</span><span>${h.wind}mph</span>${h.pop >= 20 ? `<span>${h.pop}%</span>` : ""}</div>`).join("")}</div><div class="small">Green hours: 57°F+, wind under 15 mph, rain chance under 40%.</div>` : ""}
    ${fr && date < fr ? `<div class="small">Hard freeze ${fmtD(fr)} — syrup has to go on before then.</div>` : ""}
    ${nb("Bees are calmest on warm, still, sunny middays when the foragers are out of the box.")}
    <button class="btn ghost" data-close>Close</button>`, s => s.querySelector("[data-close]").onclick = closeSheet);
}
document.addEventListener("click", e => { const d = e.target.closest("[data-day]"); if (d) { const [y, dt] = d.dataset.day.split("|"); dayAdvice(y, dt); } });

let sheetOpenedAt = 0;
function sheet(html, mount) {
  const sc = document.getElementById("scrim");
  sc.innerHTML = `<div class="sheet">${html}</div>`;
  sc.classList.add("on"); sheetOpenedAt = Date.now();
  if (mount) mount(sc.querySelector(".sheet"));
  setTimeout(() => sc.querySelector("input:not([type=date]):not([type=number])")?.focus(), 30);
}
function closeSheet() { const sc = document.getElementById("scrim"); sc.classList.remove("on"); sc.innerHTML = ""; }
document.getElementById("scrim").addEventListener("click", e => { if (e.target.id === "scrim" && Date.now() - sheetOpenedAt > 400) closeSheet(); });

let toastT;
function toast(msg) { const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2200); }

/* line chart: points [[date, value]], proj [[date, value]] */
function chart(points, { proj = [], target = null, tlabel = "", max = null, h = 140, color = "var(--honey)" } = {}) {
  const all = points.concat(proj);
  if (!all.length) return `<div class="small">No data yet.</div>`;
  const W = 320, pad = 26, mx = max || Math.max(...all.map(p => p[1]), target || 0) * 1.15 || 1;
  const x = i => pad + i * ((W - pad - 24) / Math.max(1, all.length - 1));
  const y = v => h - 22 - (v / mx) * (h - 36);
  let out = "";
  if (target != null) out += `<line x1="${pad}" x2="${W - 10}" y1="${y(target)}" y2="${y(target)}" stroke="var(--risk)" stroke-dasharray="4 4"/><text x="${W - 12}" y="${y(target) - 4}" font-size="10" text-anchor="end" fill="var(--risk)">${tlabel} ${target}</text>`;
  if (points.length) out += `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${points.map((p, i) => x(i) + "," + y(p[1])).join(" ")}"/>`;
  if (proj.length && points.length) { const seg = [points[points.length - 1]].concat(proj); out += `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="5 5" points="${seg.map((p, i) => x(points.length - 1 + i) + "," + y(p[1])).join(" ")}"/>`; }
  all.forEach((p, i) => { const pr = i >= points.length; out += `<circle cx="${x(i)}" cy="${y(p[1])}" r="${pr ? 2.5 : 3.5}" fill="${pr ? "#fff" : color}" stroke="${color}"/><text x="${x(i)}" y="${h - 6}" font-size="9.5" text-anchor="middle" fill="#8a7f6e">${fmtShort(p[0])}</text>`; });
  return `<svg viewBox="0 0 ${W} ${h}" style="width:100%;margin-top:6px">${out}</svg>`;
}

function queenBadge(q) {
  if (!q || !q.year) return `<span class="small">No queen record</span>`;
  const c = queenColor(q.year);
  return `${q.marked ? `<span class="qdot" style="background:${QUEEN_HEX[c]}"></span>` : ""}${q.year} queen · ${q.marked ? `marked ${c}` : "unmarked"} · ${q.laying ? "laying" : "not laying"}`;
}

function colonyCard(c) {
  const all = needsFor(c).filter(n => n.short);
  const urgent = all.filter(n => n.level === "risk" || n.level === "warn" || (n.level === "info" && (n.key === "mites" || n.key === "queen")));
  const ns = urgent.length ? urgent : all.filter(n => n.level === "ok").slice(0, 1);
  const lv = lastVisit(c.id);
  return `<div class="card tap row" data-nav="colony" data-p='{"id":"${c.id}"}'>
    <div class="grow">
      <div class="row"><b>${esc(c.name)}</b><span class="small">· ${esc(describeSetup(c))}</span></div>
      <div style="margin-top:5px">${ns.slice(0, 3).map(n => pill(n.level, n.short)).join("") || pill("grey", lv ? "Nothing urgent" : "New · no visits yet")}</div>
      <div class="small" style="margin-top:5px">${lv ? `Last visit ${daysBetween(lv.date, TODAY)} days ago` : "Its first visit starts its history"}</div>
    </div><span class="chev">›</span></div>`;
}

/* a generic colony picker sheet */
function pickColony(title, list, onPick, extraHtml = "") {
  sheet(`<h3>${esc(title)}</h3>${extraHtml}${list.map(c => `<div class="card tap row" data-pick="${c.id}"><div class="grow"><b>${esc(c.name)}</b> <span class="small">· ${esc(describeSetup(c))} · ${esc(yardOf(c.yardId)?.name || "")}</span></div><span class="chev">›</span></div>`).join("") || `<div class="small">Nothing to pick.</div>`}<button class="btn ghost" data-close>Cancel</button>`,
    s => { s.querySelectorAll("[data-pick]").forEach(el => el.onclick = () => { closeSheet(); onPick(col(el.dataset.pick)); }); s.querySelector("[data-close]").onclick = closeSheet; });
}

function csvDownload(name, rows) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  saveFile(name, new Blob([csv], { type: "text/csv" }));
}

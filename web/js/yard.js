/* Apiary: home screen, apiary switcher, add colony, swarm caught, trip packing list, past colonies */

function startVisitPicker() {
  const here = activeIn(db.settings.currentYard), other = db.colonies.filter(c => c.status === "active" && c.yardId !== db.settings.currentYard);
  if (!here.length && !other.length) { toast("Add a hive or nuc first"); addColonySheet(); return; }
  sheet(`<h3>Which colony?</h3>
    ${here.map(c => `<div class="card tap row" data-pick="${c.id}"><div class="grow"><b>${esc(c.name)}</b> <span class="small">· ${esc(describeSetup(c))}</span></div><span class="chev">›</span></div>`).join("")}
    ${other.length ? `<div class="small" style="margin:8px 0 4px">Other apiaries</div>` + other.map(c => `<div class="card tap row" data-pick="${c.id}"><div class="grow"><b>${esc(c.name)}</b> <span class="small">· ${esc(yardOf(c.yardId).name)}</span></div><span class="chev">›</span></div>`).join("") : ""}
    <button class="btn ghost" data-close>Cancel</button>`, s => {
    s.querySelectorAll("[data-pick]").forEach(el => el.onclick = () => { closeSheet(); nav("visitStart", { id: el.dataset.pick }); });
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}

/* ---------- apiary add / edit, with location for the forecast ---------- */
function yardSheet(y, after) {
  const loc = y?.lat != null ? { lat: y.lat, lon: y.lon, place: y.place || "" } : null;
  let pick = loc;
  sheet(`<h3>${y ? "Edit apiary" : "Add an apiary"}</h3>
    <div class="q"><div class="lbl">Name</div><input id="nm" value="${esc(y?.name || "")}" placeholder="e.g. Home apiary, Back field"/></div>
    <div class="q"><div class="lbl">Location (for the forecast)</div>
      <div class="small" id="locNow">${pick ? `📍 ${esc(pick.place || `${pick.lat.toFixed(2)}, ${pick.lon.toFixed(2)}`)}` : "Not set"}</div>
      <button class="btn sm dark" id="gps">📍 I'm standing in this apiary</button>
      <div class="row" style="margin-top:6px"><input id="town" placeholder="Or search a town or ZIP" style="margin:0"/><button class="btn sm ghost" id="find" style="margin:0">Find</button></div>
      <div id="hits"></div>
      <div class="small" style="margin-top:4px">Stored on this phone, rounded to about 1 km. Only that rounded point goes to the weather service (Open-Meteo).</div></div>
    <div class="q"><div class="lbl">Cell signal there</div>${chips("sig", [["good", "Good"], ["spotty", "Spotty"], ["none", "None"]], y?.signal || "good", false, true)}</div>
    <div class="q"><div class="lbl">Access notes</div><textarea id="acc" placeholder="Gate, parking, landowner rules">${esc(y?.access || "")}</textarea></div>
    <div class="q"><div class="lbl">Forage notes</div><input id="for" value="${esc(y?.forage || "")}" placeholder="What blooms nearby"/></div>
    <div class="q"><div class="lbl">Planned pesticide spray nearby (optional)</div><input id="sprd" type="date" value="${esc(y?.spray?.date || "")}"/><input id="sprt" value="${esc(y?.spray?.text || "")}" placeholder="What you heard, e.g. orchard fall spray"/></div>
    <button class="btn" id="save">Save</button>${y && db.yards.length > 1 && !activeIn(y.id).length ? `<button class="btn danger" id="del">Delete this apiary</button>` : ""}<button class="btn ghost" data-close>Cancel</button>`, s => {
    const show = () => { s.querySelector("#locNow").innerHTML = pick ? `📍 ${esc(pick.place || `${pick.lat.toFixed(2)}, ${pick.lon.toFixed(2)}`)}` : "Not set"; };
    s.querySelector("#gps").onclick = () => {
      if (!navigator.geolocation) { toast("This browser can't read location — search a town instead"); return; }
      s.querySelector("#locNow").textContent = "Finding you…";
      navigator.geolocation.getCurrentPosition(p => { pick = { lat: +p.coords.latitude.toFixed(2), lon: +p.coords.longitude.toFixed(2), place: "Set at the apiary" }; show(); },
        err => { s.querySelector("#locNow").textContent = err.code === 1 ? "Location permission was refused — search a town instead." : "Couldn't get a fix — search a town instead."; }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    };
    const find = async () => {
      const q = s.querySelector("#town").value.trim(); if (!q) return;
      s.querySelector("#hits").innerHTML = `<div class="small">Searching…</div>`;
      try {
        const hits = await geocode(q);
        s.querySelector("#hits").innerHTML = hits.map((h, i) => `<div class="card tap" data-hit="${i}" style="padding:9px 12px;margin:6px 0 0">${esc(h.name)}</div>`).join("") || `<div class="small">Nothing found. Try a nearby town or a ZIP.</div>`;
        s.querySelectorAll("[data-hit]").forEach(el => el.onclick = () => { const h = hits[+el.dataset.hit]; pick = { lat: +h.lat.toFixed(2), lon: +h.lon.toFixed(2), place: h.name }; s.querySelector("#hits").innerHTML = ""; show(); });
      } catch (e) { s.querySelector("#hits").innerHTML = `<div class="small">No connection — try again when you have signal, or use 📍.</div>`; }
    };
    s.querySelector("#find").onclick = find;
    s.querySelector("#town").onkeydown = e => { if (e.key === "Enter") find(); };
    s.querySelector("[data-close]").onclick = closeSheet;
    s.querySelector("#del")?.addEventListener("click", () => { if (!confirm(`Delete ${y.name}?`)) return; db.yards = db.yards.filter(x => x.id !== y.id); delete db.weather[y.id]; db.settings.currentYard = db.yards[0]?.id || null; saveDb(); closeSheet(); render(); });
    s.querySelector("#save").onclick = () => {
      const nm = s.querySelector("#nm").value.trim(); if (!nm) { toast("Give the apiary a name"); return; }
      const o = y || { id: uid("y") }, moved = pick && (!y || y.lat !== pick.lat || y.lon !== pick.lon);
      const sd = s.querySelector("#sprd").value;
      Object.assign(o, { name: nm, signal: chipVal(s, "sig"), access: s.querySelector("#acc").value, forage: s.querySelector("#for").value, spray: sd ? { date: sd, text: s.querySelector("#sprt").value.trim() } : null });
      if (pick) Object.assign(o, { lat: pick.lat, lon: pick.lon, place: pick.place });
      if (!y) { db.yards.push(o); db.settings.currentYard = o.id; }
      if (moved && db.yards.length === 1 && !db.settings.regionSet) db.settings.region = guessRegion(o.lat, o.lon);
      saveDb(); closeSheet();
      if (moved) fetchWeather(o.id, true).then(ok => { if (ok) rerender(); else toast("Forecast will load when you have signal"); });
      after ? after(o) : rerender();
    };
  });
}
document.addEventListener("click", e => { const b = e.target.closest("[data-yardloc]"); if (b) yardSheet(yardOf(b.dataset.yardloc)); });

/* ---------- first run ---------- */
screen("setup", {
  tab: "yard", notabs: true, title: "Welcome",
  render() {
    return `<div style="text-align:center;font-size:54px;margin-top:20px">🐝</div>
      <h1 style="text-align:center">Hive notes</h1>
      <p class="sub" style="text-align:center">Record each visit at the hive, and get what to expect and what to do next — from what you saw and the weather.</p>
      <div class="card small" style="color:var(--ink)">
        <b>How it works</b>
        <div style="margin-top:6px">1. Add an apiary and set its location (for the forecast).</div>
        <div>2. Add your hives and nucs.</div>
        <div>3. At the hive, start a visit: photos of frames + a few taps.</div>
        <div>4. It tells you what's coming and when to come back.</div>
      </div>
      <div class="note">🔒 Your records stay on this phone. Nothing is uploaded unless you use the AI helper, and then only that colony's record. Back up from More now and then.</div>
      <button class="btn" id="start">Add your first apiary</button>
      <label class="btn ghost" style="text-align:center">Restore from a backup file<input type="file" id="restore" accept="application/json,.json" style="display:none"/></label>`;
  },
  mount(p, v) {
    v.querySelector("#start").onclick = () => yardSheet(null, () => { db.settings.setupDone = true; saveDb(); stack = [{ name: "yard", params: {} }]; render(); setTimeout(() => addColonySheet(), 300); });
    v.querySelector("#restore").onchange = e => restoreFrom(e.target.files[0]);
  }
});

function boxesBuilder(type, init) {
  const depth = init?.depth || (type === "nuc" ? "medium" : "deep"), frames = String(init?.frames || (type === "nuc" ? 5 : 10)), n = String(init?.n || (type === "nuc" ? 1 : 2));
  return `<div class="q"><div class="lbl">Box depth</div>${chips("depth", [["deep", "Deep"], ["medium", "Medium"], ["shallow", "Shallow"]], depth, false, true)}</div>
    ${type === "nuc" ? "" : `<div class="q"><div class="lbl">Boxes</div>${chips("nboxes", ["1", "2", "3", "4"], n, false, true)}</div>`}
    <div class="q"><div class="lbl">Frames per box</div>${chips("frames", type === "nuc" ? ["4", "5", "6"] : ["8", "10"], frames, false, true)}</div>`;
}
function readBoxes(s, type) {
  const depth = chipVal(s, "depth") || "deep", frames = +(chipVal(s, "frames") || (type === "nuc" ? 5 : 10)), n = type === "nuc" ? 1 : +(chipVal(s, "nboxes") || 2);
  return Array.from({ length: n }, () => ({ depth, frames }));
}

function addColonySheet(preset = {}) {
  let type = preset.type || "hive";
  const draw = () => sheet(`<h3>${preset.swarm ? "🐝 Swarm caught" : "Add to your apiary"}</h3>
    <div class="seg" id="typeSeg"><span data-t="hive" class="${type === "hive" ? "on" : ""}">Hive</span><span data-t="nuc" class="${type === "nuc" ? "on" : ""}">Nuc</span></div>
    <div class="q"><div class="lbl">Name or number</div><input id="nm" maxlength="24" value="${esc(type === "nuc" ? `Nuc ${nextNum("nuc")}` : `Hive ${nextNum("hive")}`)}"/></div>
    <div class="q"><div class="lbl">Apiary</div>${chips("yard", db.yards.map(y => [y.id, y.name]), db.settings.currentYard, false, true)}</div>
    ${preset.swarm ? `<div class="q"><div class="lbl">Where you caught it</div><input id="where" placeholder="e.g. neighbor's maple, bait hive by the shed"/></div>`
      : `<div class="q"><div class="lbl">Where it came from</div>${chips("origin", [["package", "Package"], ["nuc", "Bought nuc"], ["split", "My split"], ["swarm", "Swarm"], ["other", "Other"]], "package", false, true)}</div>`}
    ${boxesBuilder(type)}
    <div class="q"><div class="lbl">Queen</div>${chips("qyear", [String(yearOf(TODAY)), String(yearOf(TODAY) - 1), "unknown"], preset.swarm ? "unknown" : String(yearOf(TODAY)), false, true)}
      ${chips("qmarked", [["1", "Marked"], ["0", "Unmarked"]], "0", false, true)}</div>
    <button class="btn" id="save">Add</button><button class="btn ghost" data-close>Cancel</button>`, s => {
    s.querySelectorAll("#typeSeg span").forEach(sp => sp.onclick = () => { type = sp.dataset.t; draw(); });
    s.querySelector("[data-close]").onclick = closeSheet;
    s.querySelector("#save").onclick = () => {
      const name = s.querySelector("#nm").value.trim().replace(/\s+/g, " ") || (type === "nuc" ? `Nuc ${nextNum("nuc")}` : `Hive ${nextNum("hive")}`);
      const qy = chipVal(s, "qyear"), origin = preset.swarm ? "swarm" : chipVal(s, "origin");
      const c = { id: uid("c"), name, yardId: chipVal(s, "yard"), type, status: "active",
        boxes: readBoxes(s, type), origin: { kind: origin, note: preset.swarm ? (s.querySelector("#where").value || "Swarm") : "" }, since: TODAY,
        queen: qy === "unknown" ? { year: null, source: origin, marked: false, laying: true, since: TODAY } : { year: +qy, source: origin, marked: chipVal(s, "qmarked") === "1", laying: true, since: TODAY } };
      db.colonies.push(c); addEvent(c.id, preset.swarm ? "swarm" : "added", preset.swarm ? `Swarm caught: ${c.origin.note}` : `Added (${origin})`);
      saveDb(); closeSheet(); toast(`${name} added`); rerender();
    };
  });
  draw();
}

screen("yard", {
  tab: "yard", title: () => yardOf(db.settings.currentYard)?.name || "Apiary",
  fab: { label: "📷 Start a visit", onclick: () => startVisitPicker() },
  render() {
    if (!yardOf(db.settings.currentYard)) { db.settings.currentYard = db.yards[0].id; saveDb(); }
    const y = yardOf(db.settings.currentYard), cs = activeIn(y.id), m = monthOf(TODAY);
    const ended = db.colonies.filter(c => c.status !== "active").length, nt = notifications().on, adv = openAdvice(todayWx(y.id));
    return `
      <div class="row" style="justify-content:flex-end;margin-bottom:4px"><span class="bell" data-nav="inbox">🔔${nt.length ? `<i>${nt.length}</i>` : ""}</span></div>
      ${db.yards.length > 1 ? `<div class="seg">${db.yards.map(x => `<span data-yard="${x.id}" class="${x.id === y.id ? "on" : ""}">${esc(x.name)}</span>`).join("")}</div>` : ""}
      <div class="row"><h1 class="grow">${esc(y.name)}</h1><button class="pen" data-yardedit="${y.id}">✎</button></div>
      <p class="sub">${cs.length} ${cs.length === 1 ? "colony" : "colonies"} · ${fmtD(TODAY)} · ${esc(seasonFor(m).name)}</p>
      ${y.signal === "none" ? `<div class="note warn">⚑ No cell signal at this apiary. Everything still saves on your phone; open the app at home first so the forecast is fresh.</div>` : ""}
      ${forecastStrip(y.id)}
      ${todayWx(y.id) ? `<div class="small" style="margin:-2px 0 8px">Today: <b>${esc(adv.short)}</b>${adv.window ? ` · best ${esc(adv.window)}` : ""}</div>` : ""}
      ${yardAlerts(y.id).map(a => `<div class="note ${a.icon === "⚠️" ? "warn" : ""}">${a.icon} ${esc(a.text)}</div>`).join("")}
      <div class="small" style="margin:4px 0 8px">🌼 ${esc(flowFor(m).text)}${y.forage ? ` · ${esc(y.forage)}` : ""}</div>
      <div class="row" style="gap:6px"><button class="btn sm dark" data-nav="yardrun">🧺 Packing list</button><button class="btn sm ghost" id="swarmBtn">🐝 Swarm caught</button></div>
      ${aiOn() && cs.length ? `<button class="btn ghost" id="yardTalk" style="margin-top:8px">🎙 Talk through the apiary (AI fills in the records)</button>` : ""}
      <h2>Colonies</h2>
      ${cs.map(colonyCard).join("") || `<div class="small">No colonies here yet.</div>`}
      <button class="btn ghost" id="addBtn">+ Add a hive or nuc</button>
      ${ended ? `<button class="link" data-nav="past" style="margin-top:10px">Past colonies (${ended}) — dead-outs, sold, combined ›</button>` : ""}
      <div style="height:60px"></div>`;
  },
  mount(p, v) {
    v.querySelectorAll("[data-yard]").forEach(el => el.onclick = () => { db.settings.currentYard = el.dataset.yard; saveDb(); render(); });
    v.querySelector("#addBtn").onclick = () => addColonySheet();
    v.querySelector("#swarmBtn").onclick = () => addColonySheet({ swarm: true, type: "hive" });
    v.querySelector("#yardTalk")?.addEventListener("click", () => yardTalkSheet());
    v.querySelector("[data-yardedit]").onclick = () => yardSheet(y);
  }
});

screen("past", {
  tab: "yard", title: "Past colonies",
  render() {
    const ended = db.colonies.filter(c => c.status !== "active");
    const winterIn = db.colonies.filter(c => c.since < "2025-11-01" && (c.status === "active" || (c.end && c.end.date >= "2025-11-01"))).length;
    const winterDead = db.colonies.filter(c => c.end && c.end.kind === "dead" && c.end.date >= "2025-11-01" && c.end.date <= "2026-04-30").length;
    return `<h1>Past colonies</h1>
      <div class="card"><b>Last winter</b><div class="small" style="margin-top:4px">${winterIn} went in · ${winterDead} lost · ${winterIn ? Math.round(winterDead / winterIn * 100) : 0}% loss</div>
      <div class="small">Causes: ${db.colonies.filter(c => c.end?.kind === "dead").flatMap(c => c.end.cause).join(", ") || "—"}</div></div>
      ${ended.map(c => `<div class="card tap" data-nav="colony" data-p='{"id":"${c.id}"}'><div class="between"><b>${esc(c.name)}</b>${pill(c.status === "dead" ? "risk" : "grey", { dead: "Dead-out", sold: "Sold", combined: "Combined" }[c.status])}</div>
        <div class="small" style="margin-top:4px">${fmtD(c.end.date)} · ${esc(c.end.kind === "dead" ? "Cause: " + c.end.cause.join(", ") : c.end.kind === "combined" ? "Into " + (col(c.end.into)?.name || "?") : "To " + (c.end.buyer || "buyer"))}</div>
        ${c.end.note ? `<div class="small">${esc(c.end.note)}</div>` : ""}</div>`).join("")}`;
  }
});

screen("yardrun", {
  tab: "yard", title: "Packing list",
  render() {
    const y = yardOf(db.settings.currentYard), cs = activeIn(y.id);
    const withNeeds = cs.map(c => ({ c, ns: needsFor(c).filter(n => n.action && n.level !== "ok") })).sort((a, b) => (a.ns[0]?.level === "risk" ? 0 : 1) - (b.ns[0]?.level === "risk" ? 0 : 1));
    const { list, why } = packingFor(cs), today = forecastFor(y.id)[0], adv = openAdvice(today);
    const packed = db.drafts.packed || {};
    return `<h1>Packing list · ${esc(y.name)}</h1>
      <div class="note ${adv.level}">${esc(adv.text)}</div>
      <h2>Order of stops</h2>
      ${withNeeds.map(({ c, ns }, i) => `<div class="card tap" data-nav="visitStart" data-p='{"id":"${c.id}"}'><div class="between"><b>${i + 1}. ${esc(c.name)}</b><span class="chev">›</span></div>
        ${ns.slice(0, 3).map(n => `<div class="small">→ ${esc(n.action)}</div>`).join("") || `<div class="small">Quick look</div>`}</div>`).join("")}
      <h2>Packing list</h2>
      <div class="card">${Object.entries(list).map(([k, v]) => `<div class="todo ${packed[k] ? "done" : ""}"><span class="box ${packed[k] ? "on" : ""}" data-pack="${esc(k)}"></span><div class="grow"><b>${esc(k)}</b>${v > 1 ? ` × ${v}` : ""}${why[k] ? `<div class="small">for ${esc(why[k].join(", "))}</div>` : ""}
        ${db.inventory[k] != null && db.inventory[k] < v ? `<div class="small low">Only ${db.inventory[k]} on hand</div>` : ""}</div></div>`).join("")}</div>
      <button class="btn ghost" id="cameHome">📦 What came home</button>
      <div class="small" style="margin-top:6px">Log gear you brought back — it goes into your inventory.</div>`;
  },
  mount(p, v) {
    v.querySelectorAll("[data-pack]").forEach(b => b.onclick = () => { db.drafts.packed = db.drafts.packed || {}; db.drafts.packed[b.dataset.pack] = !db.drafts.packed[b.dataset.pack]; saveDb(); rerender(); });
    v.querySelector("#cameHome").onclick = () => cameHomeSheet();
  }
});

function cameHomeSheet() {
  const items = ["Medium boxes", "Deep boxes", "Feeders", "Queen excluders", "Medium frames", "Deep frames", "Drawn comb (medium)", "Drawn comb (deep)", "Lids", "Mouse guards"];
  const counts = {};
  const draw = () => sheet(`<h3>What came home</h3><div class="small">Tap + for each piece you brought back from the apiary.</div>
    ${items.map(k => `<div class="between" style="padding:7px 0;border-bottom:1px solid var(--line)"><span>${k}</span><div class="qty"><button data-m="${k}">−</button><b>${counts[k] || 0}</b><button data-p2="${k}">+</button></div></div>`).join("")}
    <div class="q" style="margin-top:10px"><div class="lbl">Also brought home</div>${chips("also", ["Hive tool", "Smoker", "Bee brush", "Frame grip", "Mite boards", "Used strips (to dispose)", "Notebook"], [], true)}</div>
    <button class="btn" id="save">Add to inventory</button><button class="btn ghost" data-close>Cancel</button>`, s => {
    s.querySelectorAll("[data-p2]").forEach(b => b.onclick = () => { counts[b.dataset.p2] = (counts[b.dataset.p2] || 0) + 1; draw(); });
    s.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { counts[b.dataset.m] = Math.max(0, (counts[b.dataset.m] || 0) - 1); draw(); });
    s.querySelector("[data-close]").onclick = closeSheet;
    s.querySelector("#save").onclick = () => {
      Object.entries(counts).forEach(([k, n]) => { db.inventory[k] = (db.inventory[k] || 0) + n; });
      saveDb(); closeSheet(); toast(`${Object.values(counts).reduce((a, b) => a + b, 0)} pieces added to inventory`);
    };
  });
  draw();
}

/* ---------- notifications inbox ---------- */
screen("inbox", {
  tab: "yard", title: "Alerts",
  render() {
    const { on, muted } = notifications(), lv = { risk: 0, warn: 1, info: 2 };
    return `<h1>Alerts</h1><p class="sub">Only things that need you, each with its reason. ${muted ? `${muted} more muted in your settings.` : ""}</p>
      ${on.sort((a, b) => lv[a.level] - lv[b.level]).map(n => `<div class="card ${n.id || n.biz ? "tap" : ""}" ${n.id ? `data-nav="colony" data-p='{"id":"${n.id}"}'` : n.biz ? `data-biznote="${n.biz}"` : ""}>
        <div class="between"><b style="font-size:14.5px">${esc(n.title)}</b>${pill(n.level, { risk: "Now", warn: "Soon", info: "FYI" }[n.level])}</div>
        <div class="small" style="margin-top:3px">→ ${esc(n.text)}</div>${n.why ? `<div class="small" style="margin-top:3px">Why: ${esc(n.why)}</div>` : ""}</div>`).join("") || `<div class="small">Nothing needs you right now.</div>`}
      <button class="link" data-tab="more">Choose which alerts you get ›</button>`;
  },
  mount(p, v) { v.querySelectorAll("[data-biznote]").forEach(el => el.onclick = () => { bizTab = el.dataset.biznote; tabTo("biz"); }); }
});

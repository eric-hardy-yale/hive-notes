/* Visits: start (type + conditions), camera, taps, heft, harvest, summary, record */

const VISIT_TYPES = {
  full: { label: "Full inspection", ic: "📷", d: "Frame by frame: a photo and a few taps per frame" },
  quick: { label: "Quick look", ic: "👀", d: "Lid off, top bars, a frame or two" },
  heft: { label: "Heft only", ic: "🏋️", d: "Winter: don't open — lift the back, check the entrance" },
  feed: { label: "Feed", ic: "🍯", d: "Syrup, fondant or patties" },
  treat: { label: "Treat", ic: "💊", d: "Start or remove a mite treatment" },
  mites: { label: "Mite count", ic: "🔬", d: "Wash, roll or sticky board" },
  harvest: { label: "Harvest", ic: "🫙", d: "Pull supers" },
  move: { label: "Move", ic: "🚚", d: "To another apiary" }
};

function draft() { return db.drafts.visit; }
function conditionsNow(yardId) {
  const w = db.weather?.[yardId], fresh = w && Date.now() - w.at < 3 * 3600000, cur = fresh ? w.current : null, day = todayWx(yardId);
  if (cur) return { temp: cur.temp, sky: cur.sky, wind: cur.wind, src: "now" };
  if (day) return { temp: day.hi, sky: day.skyText, wind: day.wind, src: "forecast" };
  return { temp: null, sky: "", wind: null, src: "none" };
}
function newDraft(c, type) {
  const k = conditionsNow(c.yardId);
  db.drafts.visit = { id: uid("v"), colonyId: c.id, type, date: TODAY, time: nowTime(), temp: k.temp, sky: k.sky, wind: k.wind, wxSrc: k.src,
    by: "Me", frames: {}, hive: null, taps: {}, voice: "", offline: !navigator.onLine, at: Date.now() };
  saveDb();
}
// Drop a draft and any photos it took
function discardDraft() {
  const d = draft(); if (!d) return;
  Object.values(d.frames || {}).forEach(f => f.photo && photoDel(f.photo));
  if (d.hive?.photo) photoDel(d.hive.photo);
  if (d.pending) photoDel(d.pending);
  delete db.drafts.visit; saveDb();
}

/* ---------- start ---------- */
screen("visitStart", {
  tab: "yard", title: p => `${col(p.id)?.name} visit`,
  render(p) {
    const c = col(p.id), y = yardOf(c.yardId), fc = todayWx(c.yardId), adv = openAdvice(fc), lv = lastVisit(c.id), k = conditionsNow(c.yardId);
    const rec = adv.level === "risk" ? "heft" : adv.level === "warn" ? "quick" : "full";
    const ns = needsFor(c).filter(n => n.level !== "ok" && n.action);
    return `<div class="row"><h1 class="grow">${esc(c.name)} visit</h1></div>
      <p class="sub">Conditions are filled in for you.</p>
      <div class="card"><div class="kv"><span class="k">Date</span><span>${fmtD(TODAY)} · ${nowTime()} <span class="src">● auto</span></span>
        <span class="k">Weather</span><span>${k.temp != null ? `${k.temp}°F · ${esc(k.sky)} · wind ${k.wind} mph <span class="src">● ${k.src === "now" ? "now" : "today's forecast"}</span>` : `<span class="small">No weather — ${y.lat == null ? "set the apiary's location" : "no signal yet"}. You can still log the visit.</span>`}</span>
        <span class="k">Since last</span><span>${lv ? daysBetween(lv.date, TODAY) + " days" : "first visit"}</span></div></div>
      <div class="note ${adv.level}"><b>${esc(adv.short)}${adv.window && new Date().getHours() < 9 ? " today, but not yet" : ""}.</b> ${esc(adv.text)}${adv.window ? `<br>🕐 Best window today: <b>${esc(adv.window)}</b> · it's ${nowTime()} now` : ""}</div>
      ${lv ? `<div class="card small" style="color:var(--ink)"><b>Last time (${fmtShort(lv.date)}):</b> ${esc([lv.queen === "seen" ? "queen seen" : lv.eggs ? "eggs seen" : null, lv.broodFrames != null ? `brood ${lv.broodFrames} frames` : null, lv.storesLb != null ? `~${lv.storesLb} lb stores` : null, lv.note].filter(Boolean).join(" · "))}</div>` : ""}
      ${ns.length ? `<div class="card"><b>Do today</b>${ns.slice(0, 4).map(n => `<div class="small" style="margin-top:4px">→ ${esc(n.action)}</div>`).join("")}</div>` : ""}
      <h2>What kind of visit?</h2>
      ${chips("vtype", Object.entries(VISIT_TYPES).map(([k, t]) => [k, `${t.ic} ${t.label}`]), rec, false, true)}
      <div class="small" id="vdesc" style="margin-top:6px">${esc(VISIT_TYPES[rec].d)}</div>
      ${db.helpers.length ? `<div class="q" style="margin-top:12px"><div class="lbl">Who's logging</div>${chips("by", ["Me"].concat(db.helpers.map(h => h.name)), "Me", false, true)}</div>` : ""}
      <button class="btn" id="go">Start</button>`;
  },
  mount(p, v) {
    const c = col(p.id);
    if (navigator.onLine) fetchWeather(c.yardId).then(ok => ok && rerender());
    v.querySelector('[data-key="vtype"]').addEventListener("change", () => { v.querySelector("#vdesc").textContent = VISIT_TYPES[chipVal(v, "vtype")].d; });
    v.querySelector("#go").onclick = () => {
      const t = chipVal(v, "vtype"); if (draft() && !draft().saved) discardDraft(); newDraft(c, t); draft().by = chipVal(v, "by") || "Me"; saveDb();
      const toSummary = () => nav("visitSummary", { id: c.id });
      if (t === "full") nav("visitCam", { id: c.id });
      else if (t === "quick") nav("visitTaps", { id: c.id });
      else if (t === "heft") nav("visitHeft", { id: c.id });
      else if (t === "harvest") nav("visitHarvest", { id: c.id });
      else if (t === "feed") feedSheet(c, toSummary);
      else if (t === "treat") { const act = treatsOf(c.id).find(x => !x.done && x.removeBy); if (act) { sheet(`<h3>${esc(act.product)} is in</h3><div class="small">Since ${fmtD(act.start)} · remove by ${fmtD(act.removeBy)}</div><button class="btn" id="rm">Remove strips now</button><button class="btn ghost" id="new">Start a different treatment</button>`, s => { s.querySelector("#rm").onclick = () => { act.done = true; act.removed = TODAY; addEvent(c.id, "treat", `${act.product} removed`); saveDb(); closeSheet(); toSummary(); }; s.querySelector("#new").onclick = () => { closeSheet(); treatSheet(c, toSummary); }; }); } else treatSheet(c, toSummary); }
      else if (t === "mites") miteSheet(c, toSummary);
      else if (t === "move") { moveSheet(c); }
    };
  }
});

/* ---------- frame by frame: the phone's camera + a few taps per frame ---------- */
let camMode = "frame", camBox = 0, camFrame = 1, camFor = null;
// "Top box", "Bottom box", "Middle box": what a keeper calls them (Box 1 is the bottom one in the data)
const frameLabel = (c, bi, fi) => c.boxes.length === 1 ? `F${fi}` : c.boxes.length > 3 ? `B${bi + 1} F${fi}` : `${boxName(c, bi).split(" ")[0]} F${fi}`;
const boxName = (c, i) => c.boxes.length === 1 ? "The box" : i === c.boxes.length - 1 ? "Top box" : i === 0 ? "Bottom box" : c.boxes.length === 3 ? "Middle box" : `Box ${i + 1} from the bottom`;
const frameCap = b => (FULL_LB[b.depth] - EMPTY_LB[b.depth]) / 10;   // lb of honey in one full frame
const SEES = [["capped", "Capped brood"], ["larvae", "Open brood / larvae"], ["eggs", "Eggs"], ["honey", "Honey"], ["nectar", "Nectar"], ["pollen", "Pollen"], ["empty", "Empty comb"], ["foundation", "Undrawn"], ["drone", "Drone brood"]];
function frameFrom(sel) {
  const has = k => sel.sees.includes(k), brood = has("capped") || has("larvae") || has("eggs");
  const honey = (has("honey") || has("nectar")) ? (+sel.amount || 0.5) : 0;
  const parts = [];
  if (sel.queen) parts.push("Queen");
  SEES.forEach(([k, l]) => { if (has(k)) parts.push(l.toLowerCase().replace("capped brood", "capped brood")); });
  if (honey && sel.amount) parts.push({ "1": "full", "0.75": "¾ full", "0.5": "half full", "0.25": "¼ full" }[sel.amount] || "");
  if (brood && sel.pattern === "spotty") parts.push("spotty pattern");
  if (sel.cells && sel.cells !== "none") parts.push({ cups: "empty cups", swarm: "swarm cells", super: "supersedure cells", emerg: "emergency cells" }[sel.cells]);
  if (sel.mites) parts.push("mites on bees");
  if (sel.dwv) parts.push("deformed wings");
  const t = parts.filter(Boolean).join(" · ");
  return { kind: brood ? "brood" : honey ? "honey" : "empty", honey, brood: brood ? (sel.pattern === "spotty" ? 0.6 : 1) : 0, eggs: has("eggs"), queen: !!sel.queen,
    cells: sel.cells || "none", mites: sel.mites ? 1 : 0, dwv: !!sel.dwv, sees: sel.sees, amount: sel.amount, pattern: sel.pattern, text: t ? t[0].toUpperCase() + t.slice(1) : "Nothing noted" };
}
screen("visitCam", {
  tab: "yard", notabs: true, title: "Frames",
  render(p) {
    const c = col(p.id), d = draft();
    if (camFor !== d.id) { camFor = d.id; camBox = c.boxes.length - 1; camFrame = 1; camMode = "frame"; d.sel = null; }
    const b = c.boxes[camBox], key = `${camBox}-${camFrame}`, prev = d.frames[key];
    const sel = d.sel || (prev ? { sees: prev.sees || [], amount: prev.amount || null, pattern: prev.pattern || "solid", cells: prev.cells || "none", queen: prev.queen, mites: !!prev.mites, dwv: !!prev.dwv } : { sees: [], amount: null, pattern: "solid", cells: "none", queen: false, mites: false, dwv: false });
    d.sel = sel;
    const photo = d.pending || prev?.photo || null;
    const n = Object.keys(d.frames).length, total = c.boxes.reduce((s, x) => s + x.frames, 0);
    const shot = `<label class="camshot">${photo ? `<img data-photo="${photo}"/>` : `<span>📷<br>Take a photo</span>`}<input type="file" id="cam" accept="image/*" capture="environment" style="display:none"/></label>`;
    if (camMode === "hive") {
      const h = d.hive || {};
      return `<div class="seg" id="mode"><span data-m="frame">Frame by frame</span><span data-m="hive" class="on">Front of the hive</span></div>
        <h1 style="font-size:21px">Front of the hive</h1><p class="sub">Before you open up: watch the entrance for a minute.</p>
        ${shot}
        <div class="q"><div class="lbl">Traffic</div>${chips("traffic", [["busy", "Busy"], ["moderate", "Moderate"], ["quiet", "Quiet"], ["none", "None"]], h.traffic || null)}</div>
        <div class="q"><div class="lbl">Also</div>${chips("front", [["pollen", "Pollen coming in"], ["bearding", "Bearding"], ["orient", "Orientation flights"], ["robbing", "Robbing fights"], ["dead", "Dead bees out front"], ["crawl", "Crawling bees"], ["stain", "Poop stains"]], h.front || [], true)}</div>
        <button class="btn" id="saveFront">Save front → frames</button><button class="btn ghost" data-back>Back</button>`;
    }
    return `<div class="seg" id="mode"><span data-m="frame" class="on">Frame by frame</span><span data-m="hive">Front of the hive</span></div>
      ${n ? "" : `<div class="small" style="margin:2px 0 8px">Open the hive first. For each frame you lift out, tap what you see (a photo is optional). Only record the frames you pull; one box is fine.</div>`}
      ${c.boxes.length > 1 ? `<div class="tabs2">${c.boxes.map((x, i) => ({ x, i })).reverse().map(({ x, i }) => `<span data-bx="${i}" class="${i === camBox ? "on" : ""}">${boxName(c, i)} · ${x.depth}</span>`).join("")}</div>` : ""}
      <div class="between"><h1 style="font-size:21px;margin:4px 0">${boxName(c, camBox)} · Frame ${camFrame} <span class="small">of ${b.frames}</span></h1><span>${camFrame > 1 ? `<button class="btn sm ghost" id="prevF" aria-label="Previous frame">‹</button>` : ""}<button class="btn sm ghost" id="nextF" aria-label="Next frame (keeps what you tapped)">›</button></span></div>
      ${shot}
      ${photo && d.pending && aiOn() ? `<button class="btn sm dark" id="aiRead">🤖 Read this photo</button>` : ""}
      ${d.aiRead && d.aiRead.key === d.pending ? `<div class="note">🤖 AI suggested the taps below (${esc(d.aiRead.confidence || "?")} confidence)${d.aiRead.problem ? ` — ${esc(d.aiRead.problem)}` : ""}. Check them before saving.${usageLine(d.aiRead.usage)}</div>` : `<div class="small" style="margin:6px 0 12px">Photo optional. The taps below are what count; with a photo, the AI can suggest them.</div>`}
      <div class="q"><div class="lbl">On this frame</div>${chips("sees", SEES, sel.sees, true)}</div>
      ${sel.sees.some(x => x === "honey" || x === "nectar") ? `<div class="q"><div class="lbl">How full of honey/nectar</div>${chips("amount", [["1", "Full"], ["0.75", "¾"], ["0.5", "½"], ["0.25", "¼"]], sel.amount || "0.5", false, true)}</div>` : ""}
      ${sel.sees.some(x => x === "capped" || x === "larvae" || x === "eggs") ? `<div class="q"><div class="lbl">Brood pattern</div>${chips("pattern", [["solid", "Solid"], ["spotty", "Spotty"]], sel.pattern || "solid", false, true)}</div>` : ""}
      <div class="q"><div class="lbl">Also</div>${chips("also", [["queen", "👑 Saw the queen"], ["mites", "Mites on bees"], ["dwv", "Deformed wings"]], [sel.queen && "queen", sel.mites && "mites", sel.dwv && "dwv"].filter(Boolean), true)}</div>
      <div class="q"><div class="lbl">Queen cells</div>${chips("cells", [["none", "None"], ["cups", "Empty cups"], ["swarm", "Swarm (bottom edge)"], ["super", "Supersedure (face)"], ["emerg", "Emergency"]], sel.cells || "none", false, true)}</div>
      <button class="btn" id="saveF">Save frame ${camFrame} → next</button>
      <h2>Recorded this visit <span class="small">· ${n} ${n === 1 ? "frame" : "frames"}${d.hive ? " + front" : ""}</span></h2>
      <div class="card log">${d.hive ? `<div class="ln"><span class="thumb hive"></span><span class="fno">Front</span><span>${esc(d.hive.text)}</span></div>` : ""}
        ${Object.entries(d.frames).sort(byFrame).map(([k, x]) => { const [bi, fi] = k.split("-"); return `<div class="ln" data-goto="${k}"><span class="thumb ${x.kind}">${x.queen ? '<span class="q">👑</span>' : ""}</span><span class="fno">${frameLabel(c, +bi, fi)}</span><span class="grow">${esc(x.text)}</span>${x.photo ? "📷" : ""}</div>`; }).join("") || (d.hive ? "" : `<span class="small">Nothing yet.</span>`)}</div>
      ${camBox > 0 ? `<button class="btn ghost" id="skipBox">Done with the ${boxName(c, camBox).toLowerCase()} → next one down</button>` : ""}
      <button class="btn dark" id="doneFrames">Done with frames</button>
      <button class="btn danger" id="cancelV">Cancel visit</button>`;
  },
  mount(p, v) {
    const c = col(p.id), d = draft();
    const read = () => {
      const also = chipVals(v, "also");
      d.sel = { sees: chipVals(v, "sees"), amount: chipVal(v, "amount") || d.sel.amount, pattern: chipVal(v, "pattern") || d.sel.pattern, cells: chipVal(v, "cells") || "none", queen: also.includes("queen"), mites: also.includes("mites"), dwv: also.includes("dwv") };
    };
    v.querySelectorAll("#mode span").forEach(s => s.onclick = () => { if (camMode === "frame") read(); camMode = s.dataset.m; saveDb(); render(); });
    v.querySelector("#cam").onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      if (camMode === "frame") read();
      try {
        const blob = await shrinkPhoto(f), key = `${d.id}-${camMode === "hive" ? "front" : `${camBox}-${camFrame}`}-${Date.now().toString(36)}`;
        await photoPut(key, blob);
        if (d.pending) photoDel(d.pending);
        d.pending = key; saveDb(); rerender();
      } catch (x) { toast("Couldn't read that photo"); }
    };
    v.querySelector("#aiRead")?.addEventListener("click", () => frameReadInto(d, rerender));
    const goTo = (bi, fi) => { d.sel = null; if (d.pending) { photoDel(d.pending); d.pending = null; } camBox = bi; camFrame = fi; saveDb(); render(); };
    // Field test: two frames (photos + AI taps) were lost because › and "Done with frames" didn't save them.
    // Now anything tapped or photographed on this frame is kept whenever you leave it.
    const keepCurrent = () => {
      read();
      if (!d.sel.sees.length && !d.sel.queen && !d.pending) return false;
      const key = `${camBox}-${camFrame}`, old = d.frames[key]?.photo, fr = frameFrom(d.sel);
      fr.photo = d.pending || old || null; if (d.pending && old && old !== d.pending) photoDel(old);
      fr.lb = +(fr.honey * frameCap(c.boxes[camBox])).toFixed(1);
      if (d.aiRead && d.aiRead.key === d.pending) fr.ai = { confidence: d.aiRead.confidence, suggested: true };
      d.frames[key] = fr; d.pending = null; saveDb(); return true;
    };
    const leaveTo = (bi, fi) => { keepCurrent(); goTo(bi, fi); };
    if (camMode === "hive") {
      v.querySelector("#saveFront").onclick = () => {
        const traffic = chipVal(v, "traffic"), front = chipVals(v, "front");
        const L = { pollen: "pollen coming in", bearding: "bearding", orient: "orientation flights", robbing: "robbing fights", dead: "dead bees out front", crawl: "crawling bees", stain: "poop stains" };
        const old = d.hive?.photo;
        d.hive = { traffic, front, photo: d.pending || old || null, text: [traffic ? `Traffic ${traffic}` : null, ...front.map(x => L[x])].filter(Boolean).join(" · ") || "Looked at the front" };
        if (d.pending && old && old !== d.pending) photoDel(old);
        d.pending = null; camMode = "frame"; saveDb(); render();
      };
      return;
    }
    v.querySelectorAll(".chips").forEach(g => g.addEventListener("change", () => { read(); saveDb(); rerender(); }));
    v.querySelectorAll("[data-bx]").forEach(s => s.onclick = () => leaveTo(+s.dataset.bx, 1));
    v.querySelectorAll("[data-goto]").forEach(s => s.onclick = () => { const [bi, fi] = s.dataset.goto.split("-").map(Number); leaveTo(bi, fi); });
    v.querySelector("#prevF")?.addEventListener("click", () => leaveTo(camBox, camFrame - 1));
    const advance = () => {
      if (camFrame < c.boxes[camBox].frames) goTo(camBox, camFrame + 1);
      else if (camBox > 0) { toast(`${boxName(c, camBox)} done → ${boxName(c, camBox - 1).toLowerCase()}`); goTo(camBox - 1, 1); }
      else { toast("All frames done"); goTo(camBox, camFrame); }
    };
    v.querySelector("#nextF").onclick = () => { if (keepCurrent()) toast(`Frame ${camFrame} saved`); advance(); };
    v.querySelector("#saveF").onclick = () => {
      if (!keepCurrent()) { toast("Tap what's on the frame (or › to skip it)"); return; }
      advance();
    };
    v.querySelector("#skipBox")?.addEventListener("click", () => leaveTo(camBox - 1, 1));
    v.querySelector("#doneFrames").onclick = () => { keepCurrent(); d.sel = null; saveDb(); nav("visitTaps", { id: c.id }); };
    v.querySelector("#cancelV").onclick = () => { if (!confirm("Cancel this visit? Its photos and taps are deleted.")) return; discardDraft(); camFor = null; back(); };
  }
});

/* ---------- taps (full + quick) ---------- */
screen("visitTaps", {
  tab: "yard", notabs: true, title: "Camera",
  render(p) {
    const c = col(p.id), d = draft(), fr = Object.values(d.frames), t = d.taps;
    const camQueen = fr.some(x => x.queen) ? "seen" : fr.some(x => x.eggs) ? "eggs" : fr.length ? "neither" : null;
    const camCells = ["swarm", "super", "emerg", "cups"].find(k => fr.some(x => x.cells === k)) || null;
    return `<h1>A few taps</h1><p class="sub">${d.type === "full" ? "The whole hive, not one frame." : "Quick look — what did you see?"}</p>
      <div class="q"><div class="lbl">Queen ${camQueen ? `<span class="src">filled from your frames</span>` : ""}</div>${chips("queen", [["seen", "Saw her"], ["eggs", "Eggs, not her"], ["neither", "Neither"], ["skip", "Didn't check"]], t.queen || camQueen || "skip", false, true)}</div>
      <div class="q"><div class="lbl">Queen cells</div>${chips("cells", [["none", "None"], ["cups", "Empty cups"], ["swarm", "Swarm cells (bottom edge)"], ["super", "Supersedure (face)"], ["emerg", "Emergency"]], t.cells || camCells || "none", false, true)}</div>
      <div class="q"><div class="lbl">Heft the back of the box</div>${chips("heft", [["heavy", "Heavy"], ["medium", "Medium"], ["mlight", "Medium-light"], ["light", "Light"]], t.heft || null)}</div>
      <div class="q"><div class="lbl">Space</div>${chips("space", [["ok", "Room to grow"], ["add", "Needs a box"], ["crowded", "Crowded / bearding"]], t.space || "ok", false, true)}</div>
      <div class="q"><div class="lbl">Temperament</div>${chips("temper", [["calm", "Calm"], ["runny", "Runny"], ["defensive", "Defensive"]], t.temper || "calm", false, true)}</div>
      <div class="q"><div class="lbl">Smell & look</div>${chips("smell", [["normal", "Normal"], ["sour", "Sour / off"], ["spotty", "Spotty brood"], ["sunken", "Sunken / greasy cappings"], ["dwv", "Deformed wings"]], t.smell || (fr.some(x => x.dwv) ? ["dwv"] : fr.some(x => x.pattern === "spotty") ? ["spotty"] : ["normal"]), true)}</div>
      <div class="q"><div class="lbl">Pests seen</div>${chips("pests", [["none", "None"], ["shb", "Hive beetles"], ["moth", "Wax moth"], ["mice", "Mouse signs"], ["yj", "Yellowjackets"], ["ants", "Ants"], ["robbing", "Robbing"], ["bear", "Bear damage"]], t.pests || ["none"], true)}</div>
      <div class="q"><div class="lbl">Did today</div>${chips("did", [["reduced", "Reduced entrance"], ["mouse", "Mouse guard on"], ["addbox", "Added box"], ["rmbox", "Removed box"], ["supersoff", "Supers off"], ["fed", "Fed"], ["treated", "Treated"], ["wash", "Mite wash"]], t.did || [], true)}</div>
      <div class="q"><div class="lbl">Notes</div><textarea id="voice" rows="3" placeholder="Type, or tap the 🎤 on your keyboard to talk">${esc(d.voice)}</textarea>${speechOK() ? `<button class="btn sm ghost" id="mic">🎙 Talk</button>` : ""}${aiOn() ? `<button class="btn sm dark" id="aiFill">🤖 Fill the taps from my notes</button>` : ""}${d.aiFilled ? `<div class="small">🤖 Filled from your notes — check each tap.</div>` : ""}</div>
      <button class="btn" id="close">Close up</button>`;
  },
  mount(p, v) {
    const c = col(p.id), d = draft();
    const keep = () => { d.taps = { queen: chipVal(v, "queen"), cells: chipVal(v, "cells"), heft: chipVal(v, "heft"), space: chipVal(v, "space"), temper: chipVal(v, "temper"), smell: chipVals(v, "smell"), pests: chipVals(v, "pests"), did: chipVals(v, "did") }; d.voice = v.querySelector("#voice").value; saveDb(); };
    v.querySelectorAll(".chips").forEach(g => g.addEventListener("change", keep)); v.querySelector("#voice").oninput = keep;
    const mb = v.querySelector("#mic"); if (mb) mb.onclick = () => dictate(v.querySelector("#voice"), mb, keep);
    v.querySelector("#aiFill")?.addEventListener("click", () => { keep(); scribeForVisit(c, v, sv => {
      const t2 = scribeToTaps(sv);
      Object.entries(t2).forEach(([k, val]) => { if (Array.isArray(val) ? val.length : val) d.taps[k] = Array.isArray(val) ? [...new Set([...(d.taps[k] || []).filter(x => x !== "none" && x !== "normal"), ...val])] : val; });
      if (sv.brood_frames != null) d.scribeBrood = sv.brood_frames;
      if (sv.mite_count != null) d.scribeMites = { count: sv.mite_count, sample: sv.mite_sample || 300, method: sv.mite_method !== "none" ? sv.mite_method : "wash" };
      d.aiFilled = { evidence: sv.evidence }; saveDb(); rerender();
    }); });
    v.querySelector("#close").onclick = () => {
      keep();
      const did = d.taps.did || [];
      const follow = [];
      if (did.includes("fed") && !db.feeds.some(f => f.colonyId === c.id && f.date === TODAY)) follow.push(next => feedSheet(c, next));
      if (did.includes("treated") && !db.treatments.some(t => t.colonyId === c.id && t.start === TODAY)) follow.push(next => treatSheet(c, next));
      if (did.includes("wash") && !db.mites.some(m => m.colonyId === c.id && m.date === TODAY)) follow.push(next => miteSheet(c, next));
      const run = () => { const f = follow.shift(); if (f) f(run); else nav("visitSummary", { id: c.id }); };
      if ((d.taps.smell || []).includes("sunken")) { sheet(`<h3>⚠️ Sunken, greasy cappings</h3><div class="small">Could be American foulbrood — a legal, reportable disease. Do the rope test: push a matchstick into a sunken cell and pull slowly. A brown string that stretches 2 cm+ is a strong AFB sign.</div><div class="note risk">Don't move frames or equipment from this colony. Contact your state apiarist${db.settings.registration.inspector ? ": " + esc(db.settings.registration.inspector) : ""}.</div><button class="btn" id="ok">Got it — continue</button>`, s => s.querySelector("#ok").onclick = () => { closeSheet(); run(); }); return; }
      run();
    };
  }
});

/* ---------- heft-only ---------- */
screen("visitHeft", {
  tab: "yard", notabs: true, title: "Heft",
  render(p) {
    const c = col(p.id);
    return `<h1>Heft only</h1><p class="sub">Don't open. Tip the back of each box an inch and feel the weight.</p>
      ${c.boxes.map((b, i) => `<div class="q"><div class="lbl">Box ${i + 1} · ${b.depth} (full ≈ ${boxLb(b, 1)} lb)</div>${chips("h" + i, [["heavy", "Heavy"], ["medium", "Medium"], ["light", "Light"], ["empty", "Feels empty"]], null)}</div>`).join("")}
      <div class="card"><b>Or weigh it</b> <span class="small">(more accurate)</span>
        <div class="small" style="margin-top:4px">Luggage scale: weigh the back, then the front, add them.</div>
        <input id="wt" type="number" placeholder="Total hive weight, lb"/>
        <div class="small" id="wtMsg"></div></div>
      <div class="q"><div class="lbl">At the entrance</div>${chips("entr", [["flying", "Bees flying"], ["quiet", "Quiet"], ["dead", "Pile of dead bees"], ["blocked", "Blocked (snow/dead bees)"], ["stain", "Poop stains on front"], ["robbing", "Robbing fights"], ["mice", "Mouse signs"]], [], true)}</div>
      <div class="q"><div class="lbl">Listen (knock on the side)</div>${chips("hum", [["hum", "Steady hum"], ["roar", "Roar / hiss"], ["none", "Nothing"]], null)}</div>
      ${nb("A short, quick roar after a knock = healthy cluster. Silence in winter is worrying.")}
      <div class="q"><div class="lbl">Added</div>${chips("added", [["fondant", "Fondant / candy board"], ["patty", "Pollen patty"], ["none", "Nothing"]], ["none"], true)}</div>
      <button class="btn" id="close">Done</button>`;
  },
  mount(p, v) {
    const c = col(p.id), d = draft();
    const equip = c.boxes.reduce((s, b) => s + boxLb(b, 0), 0) + 15;   // boxes + comb, plus bottom board, lid and bees
    v.querySelector("#wt").oninput = e => { const w = +e.target.value; v.querySelector("#wtMsg").textContent = w ? `≈ ${Math.max(0, Math.round(w - equip))} lb of stores (total minus ~${equip} lb of boxes, comb, lid and bees)` : ""; };
    v.querySelector("#close").onclick = () => {
      const fills = c.boxes.map((b, i) => ({ heavy: 0.9, medium: 0.55, light: 0.25, empty: 0.05 })[chipVal(v, "h" + i)] ?? null);
      d.heftFill = fills; const w = +v.querySelector("#wt").value; d.weighed = w ? Math.max(0, Math.round(w - equip)) : null;
      d.taps = { entr: chipVals(v, "entr"), hum: chipVal(v, "hum"), added: chipVals(v, "added") };
      if (chipVals(v, "added").includes("fondant")) { db.feeds.push({ colonyId: c.id, date: TODAY, kind: "Fondant", amount: c.type === "nuc" ? "2 lb" : "4 lb" }); db.inventory["Fondant (lb)"] = Math.max(0, (db.inventory["Fondant (lb)"] || 0) - (c.type === "nuc" ? 2 : 4)); }
      saveDb(); nav("visitSummary", { id: c.id });
    };
  }
});

/* ---------- harvest ---------- */
screen("visitHarvest", {
  tab: "yard", notabs: true, title: "Harvest",
  render(p) {
    const c = col(p.id), supers = c.boxes.filter(b => b.role === "super").length;
    return `<h1>Harvest · ${esc(c.name)}</h1>
      ${monthOf(TODAY) >= 8 ? `<div class="note warn">It's ${MONTHS[monthOf(TODAY)]} — the colony needs ~${winterTarget(c)} lb for winter. Only take surplus above that.</div>` : ""}
      <div class="q"><div class="lbl">Supers pulled</div>${chips("n", ["1", "2", "3", "4"], String(Math.max(1, supers)), false, true)}</div>
      <div class="q"><div class="lbl">Estimated honey (lb)</div><input id="lb" type="number" value="${30 * Math.max(1, supers)}"/></div>
      <div class="q"><div class="lbl">Capped?</div>${chips("cap", [["90", "90%+ capped"], ["70", "Mostly"], ["low", "Lots uncapped"]], "90", false, true)}</div>
      <div class="note">Honey over ~18.6% moisture can ferment. Check with a refractometer at extraction — the batch page tracks it.</div>
      <div class="q"><div class="lbl">Batch</div>${chips("batch", db.batches.map(b => [b.id, b.id]).concat([["new", "New batch"]]), "new", false, true)}</div>
      <button class="btn" id="save">Save harvest</button>`;
  },
  mount(p, v) {
    const c = col(p.id);
    v.querySelector("#save").onclick = () => {
      let bid = chipVal(v, "batch");
      if (bid === "new") { bid = `B-${String(yearOf(TODAY)).slice(2)}${String(monthOf(TODAY) + 1).padStart(2, "0")}${String.fromCharCode(65 + db.batches.length)}`; db.batches.push({ id: bid, date: TODAY, moisture: null, lot: `${String(yearOf(TODAY)).slice(2)}-${String(monthOf(TODAY) + 1).padStart(2, "0")}-${String.fromCharCode(65 + db.batches.length)}`, jars: 0, note: "" }); }
      const n = +chipVal(v, "n");
      db.harvests.push({ colonyId: c.id, date: TODAY, supers: n, lb: +v.querySelector("#lb").value || 0, batch: bid });
      let removed = 0; for (let i = c.boxes.length - 1; i >= 0 && removed < n; i--) if (c.boxes[i].role === "super") { db.inventory[c.boxes[i].depth === "deep" ? "Deep boxes" : "Medium boxes"]++; c.boxes.splice(i, 1); removed++; }
      if (draft()) draft().taps = { did: ["supersoff"] };
      saveDb(); toast(`Harvest logged in ${bid}${removed ? ` · ${removed} supers back to inventory` : ""}`); nav("visitSummary", { id: c.id });
    };
  }
});

/* ---------- summary (saves the visit) ---------- */
function finalizeVisit(c) {
  const d = draft(); if (!d || d.colonyId !== c.id || d.saved) return d?.savedId;
  const fr = Object.values(d.frames || {}), t = d.taps || {};
  const v = { id: d.id || uid("v"), colonyId: c.id, date: d.date || TODAY, time: d.time, type: d.type, temp: d.temp, sky: d.sky, wind: d.wind, wxSrc: d.wxSrc, by: d.by, note: d.voice || "", taps: t, frames: d.frames, hive: d.hive, boxes: JSON.parse(JSON.stringify(c.boxes)) };
  if (fr.length) {
    v.broodFrames = fr.filter(x => x.kind === "brood").length;
    v.queen = t.queen || (fr.some(x => x.queen) ? "seen" : fr.some(x => x.eggs) ? "eggs" : "neither");
    v.eggs = fr.some(x => x.eggs || x.queen) || t.queen === "seen" || t.queen === "eggs";
    // frames you looked at are counted; frames you skipped are assumed to hold the same honey as the non-brood frames you did look at
    const total = c.boxes.reduce((a, b) => a + b.frames, 0), seen = fr.reduce((a, x) => a + (x.lb || 0), 0);
    const nb2 = fr.filter(x => x.kind !== "brood"), avg = nb2.length ? nb2.reduce((a, x) => a + (x.lb || 0), 0) / nb2.length : 0, skipped = total - fr.length;
    v.storesLb = Math.round(seen + avg * skipped);
    v.framesSeen = fr.length; v.framesTotal = total;
    if (fr.length < total / 2 && t.heft) v.storesLb = null;   // too few frames to trust — fall back to the heft below
  } else if (t.queen) { v.queen = t.queen; v.eggs = t.queen === "seen" || t.queen === "eggs"; }
  const heftMap = { heavy: 0.9, medium: 0.6, mlight: 0.45, light: 0.3 };
  if (d.weighed != null) { v.storesLb = d.weighed; v.weighed = true; }
  else if (d.heftFill && d.heftFill.some(x => x != null)) v.storesLb = Math.round(c.boxes.reduce((s, b, i) => s + (d.heftFill[i] ?? 0.4) * (FULL_LB[b.depth] - EMPTY_LB[b.depth]) * b.frames / 10, 0));
  if (v.storesLb == null && t.heft) v.storesLb = Math.round(winterTarget(c) * 1.1 * heftMap[t.heft]);
  if (v.broodFrames == null && d.scribeBrood != null) v.broodFrames = d.scribeBrood;
  if (d.scribeMites && !db.mites.some(m => m.colonyId === c.id && m.date === TODAY)) db.mites.push({ colonyId: c.id, date: TODAY, ...d.scribeMites });
  if (d.aiFilled) v.ai = { scribe: true, evidence: d.aiFilled.evidence };
  if (v.storesLb == null) delete v.storesLb;
  if (v.storesLb == null && (d.type === "feed" || d.type === "treat" || d.type === "mites")) delete v.storesLb;
  if ((t.did || []).includes("mouse")) addEvent(c.id, "prep", "Mouse guard on");
  if ((t.did || []).includes("reduced")) addEvent(c.id, "prep", "Entrance reduced");
  if (t.cells === "swarm") addEvent(c.id, "queen", "Swarm cells seen");
  if (t.cells === "super") addEvent(c.id, "queen", "Supersedure cells seen");
  if (v.queen === "seen" || v.eggs) { c.queen = Object.assign({}, c.queen, { laying: true }); }
  db.visits.push(v); d.saved = true; d.savedId = v.id;
  const before = db.predLog.filter(x => x.colonyId === c.id && x.outcome === "open").map(x => x.id);
  scorePreds(c.id);
  d.scored = db.predLog.filter(x => before.includes(x.id) && x.outcome !== "open").map(x => x.id);
  logPredictions(c);
  saveDb();
  return v.id;
}

screen("visitSummary", {
  tab: "yard", notabs: true, title: "Summary",
  render(p) {
    const c = col(p.id), vid = finalizeVisit(c), v = db.visits.find(x => x.id === vid) || lastVisit(c.id);
    const ns = needsFor(c), cb = comeBack(c), prev = visitsOf(c.id).filter(x => x.id !== v.id).slice(-1)[0];
    const fr = Object.entries(v.frames || {}), qf = fr.find(([, x]) => x.queen);
    const delta = (a, b, u) => a != null && b != null ? ` <span class="small">${a < b ? "↓" : a > b ? "↑" : "="} from ${b}${u}</span>` : "";
    return `<h1>${esc(c.name)} — after today</h1>
      ${toggle("newMode", "Explain it like I'm new")}
      <div class="small">${esc(VISIT_TYPES[v.type].label)} · ${fmtD(v.date)}${v.temp != null ? ` · ${v.temp}°F` : ""} · saved on this phone</div>
      <h2>How it looks now</h2>
      <div class="card">
        ${v.queen ? `<div class="between"><span>Queen ${qf ? `<span class="src">B${+qf[0].split("-")[0] + 1}·F${qf[0].split("-")[1]}</span>` : `<span class="src">✋</span>`}</span>${pill(v.queen === "seen" || v.queen === "eggs" ? "ok" : "risk", { seen: "Seen, laying", eggs: "Eggs seen", neither: "Not seen, no eggs", skip: "Not checked" }[v.queen])}</div>` : ""}
        ${v.broodFrames != null ? `<div class="between" style="margin-top:6px"><span>Brood <span class="src">frames</span></span><span><b>${v.broodFrames} ${v.broodFrames === 1 ? "frame" : "frames"}</b>${delta(v.broodFrames, prev?.broodFrames, "")}</span></div>` : ""}
        ${v.storesLb != null ? `<div class="between" style="margin-top:6px"><span>Stores (est.) <span class="src">${v.weighed ? "weighed" : fr.length ? `${v.framesSeen} of ${v.framesTotal} frames` : ""}${!v.weighed && !fr.length && (v.taps?.heft || v.type === "heft") ? " ✋ heft" : ""}</span></span><span><b>~${v.storesLb} lb</b>${delta(v.storesLb, prev?.storesLb, " lb")}</span></div>` : ""}
        ${fr.some(([, x]) => x.mites) ? `<div class="between" style="margin-top:6px"><span>Mites on bees</span><b>seen on ${fr.filter(([, x]) => x.mites).length} of ${fr.length} frames</b></div><div class="small">Mites you can see on bees are the tip of it — most hide under cappings. Do a wash.</div>` : ""}
        ${v.hive ? `<div class="small" style="margin-top:6px">Front: ${esc(v.hive.text || v.hive)}</div>` : ""}
        ${nb(monthOf(TODAY) >= 8 ? "Brood shrinking in fall is normal — the queen slows down for winter. Falling stores is the part to watch." : "")}
        ${!v.queen && v.broodFrames == null && v.storesLb == null ? `<div class="small">${esc(VISIT_TYPES[v.type].label)} logged.</div>` : ""}
      </div>
      ${(draft()?.scored || []).length ? `<h2>Earlier predictions, checked</h2>${draft().scored.map(id => db.predLog.find(x => x.id === id)).filter(Boolean).map(x => `<div class="card small" style="color:var(--ink)">${x.outcome === "true" ? "✅" : "❌"} ${esc(x.text)} <div class="small">${esc(x.note)}</div></div>`).join("")}` : ""}
      <h2>What to expect</h2>${ns.map(n => needCard(n)).join("") || `<div class="small">Nothing flagged.</div>`}
      <h2>What to do next</h2>
      <div class="card">${ns.filter(n => n.action && n.level !== "ok").map(n => `<div class="todo"><span class="box"></span><div><b>${esc(n.action)}</b>${n.due ? `<div class="small">by ${fmtD(n.due)}</div>` : ""}${nb(n.actionNewbie)}</div></div>`).join("") || `<div class="small">Nothing to do before next time.</div>`}</div>
      ${cb ? `<div class="comeback"><div class="small">Come back</div><div class="big">${fmtD(cb.date)}</div><div class="small">${esc(cb.why)}</div></div>` : ""}
      ${aiOn() ? `<div class="row" style="gap:6px"><button class="btn sm dark" id="aiPlan">🤖 Plan with AI</button><button class="btn sm ghost" id="aiAsk">💬 Ask about ${esc(c.name)}</button></div>` : ""}
      <button class="btn ghost" data-nav="visitRecord" data-p='{"vid":"${v.id}"}'>See the full visit record</button>
      <button class="btn" id="done">Done</button>`;
  },
  mount(p, v) {
    v.querySelectorAll(".todo .box").forEach(b => b.onclick = () => { b.classList.toggle("on"); b.parentElement.classList.toggle("done"); });
    v.querySelector("#aiPlan")?.addEventListener("click", () => adviseSheet(col(p.id)));
    v.querySelector("#aiAsk")?.addEventListener("click", () => askSheet(col(p.id)));
    v.querySelector("#done").onclick = () => { delete db.drafts.visit; camFor = null; saveDb(); colonyTab = "overview"; stack = [{ name: "yard", params: {} }, { name: "colony", params: { id: p.id } }]; render(); toast("Visit saved"); };
  }
});

/* ---------- record ---------- */
screen("visitRecord", {
  tab: "yard", title: "Visit record",
  render(p) {
    const v = db.visits.find(x => x.id === p.vid), c = col(v.colonyId), t = v.taps || {}, fr = Object.entries(v.frames || {}).sort(byFrame);
    const tapLines = Object.entries(t).filter(([, x]) => x && (!Array.isArray(x) || x.length)).map(([k, x]) => `${{ queen: "Queen", cells: "Cells", heft: "Heft", space: "Space", temper: "Temperament", smell: "Smell & look", pests: "Pests", did: "Did today", entr: "Entrance", hum: "Knock test", added: "Added" }[k] || k}: <b>${esc(Array.isArray(x) ? x.join(", ") : x)}</b>`);
    const photos = fr.filter(([, x]) => x.photo).length + (v.hive?.photo ? 1 : 0);
    return `<h1>Visit record</h1><p class="sub">${esc(c.name)} · ${fmtD(v.date)}</p>
      <h2>Conditions <span class="src">● auto</span></h2><div class="card small" style="color:var(--ink)">${esc(v.time || "")}${v.temp != null ? ` · ${v.temp}°F · ${esc(v.sky || "")}${v.wind != null ? ` · wind ${v.wind} mph` : ""}${v.wxSrc === "forecast" ? " (from the day's forecast)" : ""}` : " · no weather recorded"}</div>
      ${fr.length || v.hive ? `<h2>Frames <span class="src">${fr.length} frames · ${photos} photo${photos === 1 ? "" : "s"}</span></h2>
        <div class="card log">${v.hive ? `<div class="ln"><span class="thumb hive"></span><span class="fno">Front</span><span class="grow">${esc(v.hive.text || v.hive)}</span>${v.hive.photo ? `<img data-photo="${v.hive.photo}" class="mini" data-big="${v.hive.photo}"/>` : ""}</div>` : ""}${fr.map(([k, x]) => { const [bi, fi] = k.split("-"); return `<div class="ln"><span class="thumb ${x.kind}">${x.queen ? '<span class="q">👑</span>' : ""}</span><span class="fno">${frameLabel(c, +bi, fi)}</span><span class="grow">${esc(x.text)}</span>${x.photo ? `<img data-photo="${x.photo}" class="mini" data-big="${x.photo}"/>` : ""}</div>`; }).join("")}</div>
        <h2>Frame map</h2><div class="card">${frameMap(c, v)}</div>` : ""}
      ${tapLines.length ? `<h2>Your taps <span class="src">✋</span></h2><div class="card small" style="color:var(--ink)">${tapLines.join("<br>")}</div>` : ""}
      ${v.note ? `<h2>Notes</h2><div class="card small" style="color:var(--ink)">“${esc(v.note)}”</div>` : ""}
      ${v.storesLb != null ? `<div class="small">Stores ${v.weighed ? "weighed" : "estimate"} saved: ~${v.storesLb} lb${v.broodFrames != null ? ` · brood ${v.broodFrames} frames` : ""}</div>` : ""}
      <button class="btn danger" id="delV" style="margin-top:16px">Delete this visit</button>`;
  },
  mount(p, v) {
    v.querySelectorAll("[data-big]").forEach(im => im.onclick = () => sheet(`<img data-photo="${im.dataset.big}" style="width:100%;border-radius:12px"/><button class="btn ghost" data-close>Close</button>`, s => { hydratePhotos(s); s.querySelector("[data-close]").onclick = closeSheet; }));
    v.querySelector("#delV").onclick = () => {
      if (!confirm("Delete this visit and its photos? This can't be undone.")) return;
      const x = db.visits.find(y => y.id === p.vid);
      Object.values(x.frames || {}).forEach(f => f.photo && photoDel(f.photo)); if (x.hive?.photo) photoDel(x.hive.photo);
      db.visits = db.visits.filter(y => y.id !== p.vid); saveDb(); back(); toast("Visit deleted");
    };
  }
});

/* ---------- talking instead of typing ---------- */
const speechOK = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
// Field test: "Listening…" stayed on with no words and the keeper couldn't stop it with gloves on.
// Now: words show as they're heard, it stops by itself after 6 s of silence (or 60 s in all),
// the whole button stops it, and if nothing was heard it says so and opens the keyboard (its 🎤 works everywhere).
function dictate(box, btn, after) {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition; if (!R) { box.focus(); return; }
  const r = new R(); r.lang = navigator.language || "en-US"; r.interimResults = true; r.continuous = true;
  const base = box.value ? box.value.replace(/\s*$/, " ") : "";
  let heard = false, quiet, ended = false;
  const stop = () => { clearTimeout(quiet); try { r.stop(); } catch (e) { } setTimeout(() => !ended && r.onend(), 1500); };
  const wait = ms => { clearTimeout(quiet); quiet = setTimeout(stop, ms); };
  const hardStop = setTimeout(stop, 60000);
  btn.textContent = "■ Stop listening"; btn.classList.add("listening"); btn.onclick = stop;
  r.onresult = e => {
    heard = true; wait(6000);
    box.value = base + [...e.results].map(x => x[0].transcript).join(" ");
    after && after();
  };
  r.onerror = e => { if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Microphone is blocked for this app. Use the 🎤 on the keyboard instead."); };
  r.onend = () => {
    if (ended) return; ended = true; clearTimeout(quiet); clearTimeout(hardStop);
    btn.textContent = "🎙 Talk"; btn.classList.remove("listening"); btn.onclick = () => dictate(box, btn, after);
    if (!heard) { toast("Didn't hear anything. Use the 🎤 on the keyboard instead."); box.focus(); }
    else toast("Got it. Check the words before you save.");
  };
  wait(8000);   // nothing heard in 8 s: give up and hand over to the keyboard
  try { r.start(); } catch (e) { ended = true; clearTimeout(quiet); clearTimeout(hardStop); btn.textContent = "🎙 Talk"; btn.classList.remove("listening"); btn.onclick = () => dictate(box, btn, after); toast("Voice isn't available here. Use the 🎤 on the keyboard."); box.focus(); }
}

// box, then frame number (so frame 10 comes after 9, not after 1)
const byFrame = ([a], [b]) => { const [ab, af] = a.split("-").map(Number), [bb, bf] = b.split("-").map(Number); return ab - bb || af - bf; };
const FRAME_COLOR = { brood: "#a77840", honey: "#d4951c", empty: "#d8c9a8" };
// one compact row per visit: each box is a column of frames, bottom box on the left
function frameStrip(v, c) {
  const boxes = v.boxes || c.boxes, fr = v.frames || {};
  return `<div class="fstrip"><span class="small" style="width:46px">${fmtShort(v.date)}</span>${boxes.map((b, bi) => `<div class="boxcol"><div class="fr">${Array.from({ length: b.frames }, (_, i) => { const x = fr[`${bi}-${i + 1}`]; return `<span title="${x ? esc(x.text) : ""}" style="background:${x ? FRAME_COLOR[x.kind] : "#eee"}">${x?.queen ? "" : ""}</span>`; }).join("")}</div></div>`).join("")}</div>`;
}
function frameMap(c, v) {
  const fr = v.frames || {}, color = FRAME_COLOR;
  return (v.boxes || c.boxes).map((b, bi) => ({ b, bi })).reverse().map(({ b, bi }) => `<div class="row" style="gap:2px;margin:3px 0"><span class="small" style="width:44px">Box ${bi + 1}</span>${Array.from({ length: b.frames }, (_, i) => { const x = fr[`${bi}-${i + 1}`]; return `<span title="${x ? esc(x.text) : "not photographed"}" style="flex:1;height:${b.depth === "deep" ? 30 : 22}px;border-radius:3px;background:${x ? color[x.kind] : "repeating-linear-gradient(45deg,#eee,#eee 3px,#ddd 3px,#ddd 6px)"};position:relative">${x?.queen ? '<span style="position:absolute;top:-8px;left:0;font-size:11px">👑</span>' : ""}</span>`; }).join("")}</div>`).join("") +
    `<div class="legend"><span><i style="background:#a77840;height:8px"></i>brood</span><span><i style="background:#d4951c;height:8px"></i>honey</span><span><i style="background:#d8c9a8;height:8px"></i>empty</span><span>striped = not photographed</span></div>`;
}

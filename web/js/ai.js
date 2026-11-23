/* AI helper: talks to the Hive notes server (agents in /agents). Everything here is optional —
   with no server or no signal, the app works on its own rules. Every AI result shows its token use and cost. */

const AI_DEFAULT_TIMEOUT = 70000;
let aiStatus = null;   // last /api/health answer, or {ok:false, error}

// On the GitHub Pages copy there's no server behind the site, so it talks to the public AI server.
const DEFAULT_AI_SERVER = "https://hive-notes-bzhj.onrender.com";
function aiBase() { return (db.settings.aiUrl || (location.hostname.endsWith("github.io") ? DEFAULT_AI_SERVER : "")).replace(/\/+$/, ""); }
async function aiHealth(force = false, waitMs = 8000) {
  if (aiStatus && !force && Date.now() - aiStatus.at < 60000) return aiStatus;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), waitMs);
    const headers = db.settings.aiCode ? { "X-Access-Code": db.settings.aiCode } : {};
    const r = await fetch(aiBase() + "/api/health", { signal: ctl.signal, cache: "no-store", headers }); clearTimeout(t);
    const j = await r.json(); aiStatus = { ...j, at: Date.now() };
  } catch (e) { aiStatus = { ok: false, ai: false, error: navigator.onLine ? "AI server not reachable" : "No signal", at: Date.now() }; }
  return aiStatus;
}
const aiOn = () => db.settings.aiEnabled !== false;

async function aiPost(path, body) {
  if (!aiOn()) throw new Error("AI helper is turned off in More.");
  if (!navigator.onLine) throw new Error("No signal — the AI helper needs a connection. Everything else still works.");
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), AI_DEFAULT_TIMEOUT);
  let r, j;
  try {
    r = await fetch(aiBase() + path, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "X-Access-Code": db.settings.aiCode || "" }, body: JSON.stringify(body) });
    j = await r.json().catch(() => ({ error: `Server answered ${r.status}` }));
  } catch (e) { throw new Error(e.name === "AbortError" ? "The AI took too long — try again." : "Couldn't reach the AI server."); }
  finally { clearTimeout(t); }
  const agent = path.replace("/api/", "");
  if (!r.ok) {
    db.aiLog = (db.aiLog || []).concat([{ t: Date.now(), agent, ok: false, error: j.error, guard: j.guard || null }]).slice(-300); saveDb();
    throw new Error(j.error || `AI error ${r.status}`);
  }
  const u = j.usage || {};
  db.aiLog = (db.aiLog || []).concat([{ t: Date.now(), agent, ok: true, input: u.input, cached: u.cached, output: u.output, cost: u.cost_usd, rounds: (j.trace || []).length,
    checks: j.checks ? (j.checks.withheld ? "withheld" : j.checks.retried ? "fixed on retry" : "passed") : null, flags: (j.injection_flags || []).length }]).slice(-300);
  saveDb();
  return j;
}

const fmtTok = n => (n || 0).toLocaleString();
function usageLine(u, extra = "") {
  if (!u) return "";
  return `<div class="ailine">🤖 gpt-6-luna · ${fmtTok(u.input)} tokens in${u.cached ? ` (${fmtTok(u.cached)} cached)` : ""} · ${fmtTok(u.output)} out · $${(u.cost_usd || 0).toFixed(5)}${extra}</div>`;
}
const aiThinking = msg => `<div class="aithink"><span class="spin"></span>${esc(msg)}</div>`;

/* ---------- what the phone sends: a compact record, no location beyond the rounded apiary point ---------- */
function colonyRecord(c) {
  const vs = visitsOf(c.id), last = vs.slice(-3);
  const brief = v => ({ date: v.date, type: v.type, temp_f: v.temp, queen: v.queen || null, eggs: v.eggs ?? null, brood_frames: v.broodFrames ?? null, stores_lb: v.storesLb ?? null,
    cells: v.taps?.cells || null, space: v.taps?.space || null, temperament: v.taps?.temper || null, smell_look: v.taps?.smell || [], pests: v.taps?.pests || [], did: v.taps?.did || [], note: v.note || "" });
  return {
    name: c.name, type: c.type, setup: describeSetup(c), status: c.status, since: c.since, origin: c.origin?.kind || null,
    queen: { year: c.queen?.year || null, marked: !!c.queen?.marked, laying: c.queen?.laying !== false },
    winter_target_lb: winterTarget(c), region: db.settings.region, season: seasonFor(monthOf(TODAY))?.name,
    stores_now: (s => s ? { lb: s.lb, as_of: s.date, lb_per_day: +s.rate.toFixed(2) } : null)(storesNow(c)),
    recent_visits: last.map(brief),
    recent_notes: last.map(v => v.note).filter(Boolean).join(" | "),
    last_mites: mitesOf(c.id).slice(-2).map(m => ({ date: m.date, count: m.count, sample: m.sample, method: m.method })),
    last_feeds: feedsOf(c.id).slice(-2), treatments: treatsOf(c.id).slice(-2).map(t => ({ product: t.product, start: t.start, remove_by: t.removeBy, done: t.done }))
  };
}
function colonyPayload(c) {
  const y = yardOf(c.yardId) || {};
  const findings = needsFor(c).map(n => ({ key: n.key, level: n.level, title: n.title, detail: n.detail || "", action: n.action || "", due: n.due || null, why: n.why || "", sure: n.conf?.level || null }));
  const vs = visitsOf(c.id);
  return { today: TODAY, colony: colonyRecord(c), findings, yard: { lat: y.lat ?? null, lon: y.lon ?? null },
    history: { visits: vs.slice(0, -3).map(v => ({ date: v.date, type: v.type, brood_frames: v.broodFrames ?? null, stores_lb: v.storesLb ?? null, queen: v.queen || null, note: v.note || "" })),
      mites: mitesOf(c.id).map(m => ({ date: m.date, count: m.count, sample: m.sample, method: m.method })), feeds: feedsOf(c.id), treatments: treatsOf(c.id) } };
}

/* ---------- Advisor: plan with AI ---------- */
function renderAdvice(j) {
  const a = j.advice || {}, ch = j.checks || {};
  const badge = ch.withheld ? `<div class="note warn">🛡 The AI's answer failed the safety checks twice (${esc((ch.final_problems || []).join("; "))}). Showing the app's own rules instead.</div>`
    : ch.retried ? `<div class="note ok">🛡 Checked: the first answer was rejected (${esc((ch.first_try_problems || []).join("; "))}) and fixed on retry.</div>`
    : `<div class="note ok">🛡 Checked: numbers match your records and the forecast; no doses; nothing serious left out.</div>`;
  return `${(j.injection_flags || []).length ? `<div class="note warn">⚠️ Your text contained instructions aimed at the AI (“${esc(j.injection_flags[0])}”). They were treated as plain text, not orders.</div>` : ""}
    ${a.headline ? `<div class="card"><b>${esc(a.headline)}</b>${a.answer && a.answer.trim() !== (a.headline || "").trim() ? `<div style="margin-top:6px;font-size:14.5px">${esc(a.answer)}</div>` : ""}</div>` : ""}
    ${(a.expect || []).length ? `<h2>What to expect</h2>${a.expect.map(e => `<div class="card expect ${e.sure === "high" ? "risk" : e.sure === "medium" ? "warn" : "info"}"><b>${esc(e.title)}</b><div class="small" style="margin-top:4px">${esc(e.why)}</div><div class="conf">How sure: <b>${esc(e.sure)}</b></div></div>`).join("")}` : ""}
    ${(a.do_next || []).length ? `<h2>What to do next</h2><div class="card">${a.do_next.map(d => `<div class="todo"><span class="box"></span><div><b>${esc(d.action)}</b>${d.by ? `<div class="small">by ${esc(d.by)}</div>` : ""}<div class="small">${esc(d.why)}</div></div></div>`).join("")}</div>` : ""}
    ${a.come_back?.date ? `<div class="comeback"><div class="small">Come back</div><div class="big">${esc(a.come_back.date)}</div><div class="small">${esc(a.come_back.why)}</div></div>` : ""}
    ${a.for_new_keepers && db.settings.newMode ? nb(a.for_new_keepers) : ""}
    ${badge}
    <div class="small">Used: ${esc((a.sources_used || []).join(", ") || "—")} · ${(j.trace || []).length} model round${(j.trace || []).length === 1 ? "" : "s"}${(j.trace || []).some(t => t.tool_calls?.length) ? ` · tools: ${esc([...new Set((j.trace || []).flatMap(t => (t.tool_calls || []).map(x => x.name)))].join(", "))}` : ""}</div>
    ${usageLine(j.usage)}`;
}
async function adviseSheet(c) {
  sheet(`<h3>🤖 Plan for ${esc(c.name)}</h3><div id="aiBody">${aiThinking("Reading the records, checking the forecast…")}</div><button class="btn ghost" data-close>Close</button>`, s => s.querySelector("[data-close]").onclick = closeSheet);
  try { const j = await aiPost("/api/advise", colonyPayload(c)); const b = document.querySelector("#aiBody"); if (b) b.innerHTML = renderAdvice(j); }
  catch (e) { const b = document.querySelector("#aiBody"); if (b) b.innerHTML = `<div class="note warn">${esc(e.message)}</div><div class="small">The plan on the colony screen comes from the app's own rules and works without AI.</div>`; }
}
function askSheet(c) {
  sheet(`<h3>💬 Ask about ${esc(c.name)}</h3><div class="small">Answers use this colony's records, the app's findings and the live forecast — and are checked before you see them.</div>
    <div class="chips">${["What should I do this week?", "Will it make it through winter?", "Why is the brood shrinking?"].map(x => `<span class="chip" data-static="1" data-q="${x}">${x}</span>`).join("")}</div>
    <textarea id="q" rows="2" placeholder="Type, or tap 🎤 on the keyboard"></textarea><button class="btn" id="ask">Ask</button><div id="aiBody"></div><button class="btn ghost" data-close>Close</button>`, s => {
    const go = async q => {
      if (!q) return; const b = s.querySelector("#aiBody"); b.innerHTML = aiThinking("Thinking it through…");
      try { const j = await aiPost("/api/ask", { ...colonyPayload(c), question: q }); b.innerHTML = renderAdvice(j); } catch (e) { b.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; }
    };
    s.querySelectorAll("[data-q]").forEach(ch => ch.onclick = () => { s.querySelector("#q").value = ch.dataset.q; go(ch.dataset.q); });
    s.querySelector("#ask").onclick = () => go(s.querySelector("#q").value.trim());
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}

/* ---------- Scribe: notes → records ---------- */
const SCRIBE_MAP = {
  queen: { seen: "seen", eggs: "eggs", neither: "neither", not_checked: null },
  queen_cells: { none: "none", cups: "cups", swarm: "swarm", supersedure: "super", emergency: "emerg", not_mentioned: null },
  temperament: { calm: "calm", runny: "runny", defensive: "defensive", not_mentioned: null },
  space: { ok: "ok", needs_box: "add", crowded: "crowded", not_mentioned: null },
  stores: { heavy: "heavy", medium: "medium", light: "light", unknown: null },
  pests: { hive_beetles: "shb", wax_moth: "moth", mice: "mice", yellowjackets: "yj", ants: "ants", robbing: "robbing" },
  smell: { deformed_wings: "dwv", sunken_cappings: "sunken" },
  did: { fed: "fed", treated: "treated", mite_wash: "wash", added_box: "addbox", removed_box: "rmbox", reduced_entrance: "reduced", mouse_guard: "mouse", supers_off: "supersoff" }
};
const LABEL = { queen: "Queen", brood_frames: "Brood frames", stores: "Stores", queen_cells: "Queen cells", temperament: "Temperament", space: "Space", pests: "Pests", did: "Did", mite_count: "Mites", mite_sample: "Bees in sample", mite_method: "Mite method" };
function scribeToTaps(v) {
  const m = SCRIBE_MAP;
  return { queen: m.queen[v.queen] || null, cells: m.queen_cells[v.queen_cells] || null, temper: m.temperament[v.temperament] || null, space: m.space[v.space] || null, heft: m.stores[v.stores] || null,
    pests: (v.pests || []).map(p => m.pests[p]).filter(Boolean), smell: (v.pests || []).map(p => m.smell[p]).filter(Boolean), did: (v.did || []).map(d => m.did[d]).filter(Boolean) };
}
function scribeCard(v) {
  const c = col(v.colony_id), rows = Object.entries(v.evidence || {});
  return `<div class="card"><b>${esc(c?.name || v.heard_as)}</b>${v.heard_as && c && v.heard_as.toLowerCase() !== c.name.toLowerCase() ? ` <span class="small">(you said “${esc(v.heard_as)}”)</span>` : ""}
    ${rows.map(([f, q]) => `<div class="small" style="color:var(--ink);margin-top:4px">${esc(LABEL[f] || f)}: <b>${esc(Array.isArray(v[f]) ? v[f].join(", ").replace(/_/g, " ") : String(v[f]).replace(/_/g, " "))}</b> <span class="quote">“${esc(q)}”</span></div>`).join("") || `<div class="small">Nothing to fill in.</div>`}
    ${v.note ? `<div class="small" style="margin-top:4px">Note: ${esc(v.note)}</div>` : ""}</div>`;
}
function scribeExtras(j) {
  return `${(j.injection_flags || []).length || (j.flags || []).length ? `<div class="note warn">⚠️ Your note contained instructions aimed at the AI. They were ignored; only beekeeping facts were taken.</div>` : ""}
    ${(j.dropped || []).length ? `<div class="card small"><b>Left out by the checker</b> (no matching words in your note)${j.dropped.map(d => `<div>· ${esc(d)}</div>`).join("")}</div>` : ""}
    ${(j.unclear || []).length ? `<div class="card small"><b>Not sure about</b>${j.unclear.map(d => `<div>· ${esc(d)}</div>`).join("")}</div>` : ""}
    ${usageLine(j.usage)}`;
}

// On the taps screen: fill this visit from the notes box
async function scribeForVisit(c, v, onApply) {
  const note = v.querySelector("#voice").value.trim();
  if (note.length < 4) { toast("Say or type what you saw first"); return; }
  sheet(`<h3>🤖 Fill from your notes</h3><div id="aiBody">${aiThinking("Reading your notes…")}</div><button class="btn ghost" data-close>Cancel</button>`, s => s.querySelector("[data-close]").onclick = closeSheet);
  try {
    const j = await aiPost("/api/scribe", { note, today: TODAY, colonies: [{ id: c.id, name: c.name, type: c.type, setup: describeSetup(c) }], last_visits: { [c.id]: lastVisit(c.id) ? colonyRecord(c).recent_visits.slice(-1)[0] : null } });
    const mine = (j.visits || []).find(x => x.colony_id === c.id);
    const b = document.querySelector("#aiBody"); if (!b) return;
    b.innerHTML = `<div class="small">Each item shows the words it came from. Apply, then check the taps.</div>${mine ? scribeCard(mine) : `<div class="note">Nothing in the note matched ${esc(c.name)}.</div>`}${scribeExtras(j)}${mine ? `<button class="btn" id="apply">Apply to this visit</button>` : ""}`;
    b.querySelector("#apply")?.addEventListener("click", () => { onApply(mine); closeSheet(); toast("Filled from your notes — check the taps"); });
  } catch (e) { const b = document.querySelector("#aiBody"); if (b) b.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; }
}

// From the apiary screen: talk through the whole apiary, get one quick visit per colony
function yardTalkSheet() {
  const y = yardOf(db.settings.currentYard), cs = activeIn(y.id);
  if (!cs.length) { toast("Add a colony first"); return; }
  sheet(`<h3>🎙 Talk through the apiary</h3>
    <div class="small">Walk the apiary and say what you see, hive by hive — like you'd tell a friend. The Scribe splits it into one record per colony and shows the words behind every item before anything is saved.</div>
    <textarea id="yt" rows="6" placeholder="e.g. Hive 1 calm, saw the queen, eggs on four frames, heavy. Nuc 1 light, fed half a gallon…">${esc(db.drafts.yardTalk || "")}</textarea>
    ${speechOK() ? `<button class="btn sm ghost" id="mic">🎙 Talk</button>` : `<div class="small">Tip: tap 🎤 on the keyboard to talk.</div>`}
    <button class="btn" id="go">Turn into records</button><div id="aiBody"></div><button class="btn ghost" data-close>Close</button>`, s => {
    const ta = s.querySelector("#yt"); ta.oninput = () => { db.drafts.yardTalk = ta.value; saveDb(); };
    const mb = s.querySelector("#mic"); if (mb) mb.onclick = () => dictate(ta, mb, () => { db.drafts.yardTalk = ta.value; saveDb(); });
    s.querySelector("[data-close]").onclick = closeSheet;
    s.querySelector("#go").onclick = async () => {
      const note = ta.value.trim(); if (note.length < 4) { toast("Say or type something first"); return; }
      const b = s.querySelector("#aiBody"); b.innerHTML = aiThinking("Splitting your notes by colony…");
      try {
        const lv = {}; cs.forEach(c => { const r = colonyRecord(c).recent_visits.slice(-1)[0]; if (r) lv[c.id] = r; });
        const j = await aiPost("/api/scribe", { note, today: TODAY, colonies: cs.map(c => ({ id: c.id, name: c.name, type: c.type, yard: y.name, setup: describeSetup(c) })), last_visits: lv });
        const vs = (j.visits || []).filter(v => col(v.colony_id));
        b.innerHTML = `${vs.map(scribeCard).join("") || `<div class="note">No colonies recognized. Use their names (e.g. “Hive 1”, “Nuc 2”).</div>`}${scribeExtras(j)}
          ${vs.length ? `<button class="btn" id="save">Save ${vs.length} quick visit${vs.length > 1 ? "s" : ""}</button>` : ""}`;
        b.querySelector("#save")?.addEventListener("click", () => { vs.forEach(v => saveScribedVisit(v, note)); delete db.drafts.yardTalk; saveDb(); closeSheet(); toast(`${vs.length} visit${vs.length > 1 ? "s" : ""} saved from your notes`); rerender(); });
      } catch (e) { b.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; }
    };
  });
}
function saveScribedVisit(sv, fullNote) {
  const c = col(sv.colony_id); if (!c) return;
  const k = conditionsNow(c.yardId), taps = scribeToTaps(sv);
  const v = { id: uid("v"), colonyId: c.id, date: TODAY, time: nowTime(), type: "quick", temp: k.temp, sky: k.sky, wind: k.wind, wxSrc: k.src, by: "Me",
    note: sv.note || "", taps, frames: {}, boxes: JSON.parse(JSON.stringify(c.boxes)), ai: { scribe: true, evidence: sv.evidence, source: fullNote.slice(0, 1500) } };
  if (taps.queen) { v.queen = taps.queen; v.eggs = taps.queen === "seen" || taps.queen === "eggs"; }
  if (sv.brood_frames != null) v.broodFrames = sv.brood_frames;
  if (taps.heft) v.storesLb = Math.round(winterTarget(c) * 1.1 * ({ heavy: 0.9, medium: 0.6, light: 0.3 })[taps.heft]);
  if (v.queen === "seen" || v.eggs) c.queen = Object.assign({}, c.queen, { laying: true });
  db.visits.push(v);
  if (sv.mite_count != null) db.mites.push({ colonyId: c.id, date: TODAY, method: sv.mite_method !== "none" ? sv.mite_method : "wash", count: sv.mite_count, sample: sv.mite_sample || 300 });
  if (taps.cells === "swarm") addEvent(c.id, "queen", "Swarm cells seen");
  scorePreds(c.id); logPredictions(c); saveDb();
}

/* ---------- Frame Reader: photo → suggested taps ---------- */
function photoForAi(key) {
  return photoGet(key).then(b => new Promise((res, rej) => {
    if (!b) return rej(new Error("Photo not found"));
    const img = new Image(), url = URL.createObjectURL(b);
    img.onload = () => { const k = Math.min(1, 768 / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement("canvas"); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); res(cv.toDataURL("image/jpeg", 0.7).split(",")[1]); };
    img.onerror = () => rej(new Error("Couldn't read the photo")); img.src = url;
  }));
}
async function frameReadInto(d, rerenderFn) {
  const key = d.pending; if (!key) { toast("Take a photo first"); return; }
  const btn = document.querySelector("#aiRead"); if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Reading the photo…`; }
  try {
    const j = await aiPost("/api/frame", { image: await photoForAi(key), detail: "low" });
    const r = j.read || {};
    if (r.problem && !(r.sees || []).length) { toast(r.problem.slice(0, 90)); }
    const amount = { full: "1", three_quarters: "0.75", half: "0.5", quarter: "0.25", none: null }[r.honey_fill];
    d.sel = { sees: r.sees || [], amount: amount || d.sel?.amount || null, pattern: r.brood_pattern === "spotty" ? "spotty" : "solid", cells: r.queen_cells || "none",
      queen: !!r.queen_seen, mites: !!r.mites_visible, dwv: !!r.deformed_wings };
    d.aiRead = { key, confidence: r.confidence, notes: r.notes, problem: r.problem, usage: j.usage };
    saveDb(); rerenderFn();
  } catch (e) { toast(e.message); if (btn) { btn.disabled = false; btn.textContent = "🤖 Read this photo"; } }
}

/* ---------- More: settings + usage ---------- */
// One plain-language verdict for a /api/health answer, used by the card and by Save & test.
function aiVerdict(st) {
  if (!aiOn()) return { ok: false, icon: "⏸", text: "Turned off. The app works on its own rules." };
  if (!st) return { ok: false, icon: "…", text: "Checking…" };
  if (!st.ok) return { ok: false, icon: "❌", text: navigator.onLine ? "Couldn't reach the AI server. If it has been idle, it may still be waking up: tap Save & test again in a minute." : "No signal. The AI helper needs a connection; everything else still works." };
  if (!st.ai) return { ok: false, icon: "⚠️", text: "The server is up but has no AI key set." };
  if (st.access_code_required && !db.settings.aiCode) return { ok: false, icon: "🔑", text: "This server needs an access code. Paste it above, then tap Save & test." };
  if (st.code_ok === false) return { ok: false, icon: "❌", text: "That access code isn't right. Copy it again and paste it in, with nothing before or after it." };
  return { ok: true, icon: "✅", text: `Connected · ${esc(st.model)} · today $${(st.budget?.spent_today_usd || 0).toFixed(4)} of $${(st.budget?.daily_cap_usd || 0).toFixed(2)} cap` };
}
function aiSettingsHtml() {
  const s = db.settings, vd = aiVerdict(aiStatus);
  return `<h2>AI helper</h2>
    <div class="card">
      <div class="toggle${aiOn() ? " on" : ""}" id="aiToggle"><span class="sw"></span>Use the AI helper (Scribe, Frame Reader, Advisor)</div>
      <div class="q"><div class="lbl">Access code</div><input id="aiCode" value="${esc(s.aiCode || "")}" placeholder="Paste the code you were given" autocomplete="off" autocapitalize="off" spellcheck="false"/></div>
      <details class="adv"${s.aiUrl ? " open" : ""}><summary>Advanced: AI server address</summary>
        <div class="q"><input id="aiUrl" value="${esc(s.aiUrl || "")}" placeholder="Leave blank to use the usual server" autocapitalize="off" spellcheck="false"/></div></details>
      <button class="btn sm" id="aiSave">Save & test</button>
      <div class="aitest ${vd.ok ? "good" : aiStatus ? "bad" : ""}" id="aiTest" role="status" aria-live="polite">${vd.icon} ${vd.text}${s.aiTestedAt && aiStatus ? `<div class="small">Last tested ${new Date(s.aiTestedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>` : ""}</div>
      <div class="small" style="margin-top:8px">When you use it, the app sends that colony's records (no names of people, location rounded to about 1 km), or your note or photo, to the AI service. Nothing is sent otherwise.</div></div>
    <button class="btn ghost" data-nav="aiUsage">📊 AI usage & cost (${(db.aiLog || []).filter(x => x.ok).length} calls)</button>`;
}
function aiSettingsMount(v) {
  v.querySelector("#aiToggle").onclick = () => { db.settings.aiEnabled = !aiOn(); saveDb(); rerender(); };
  v.querySelector("#aiSave").onclick = async e => {
    const btn = e.currentTarget, out = v.querySelector("#aiTest");
    const clean = x => x.trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
    db.settings.aiUrl = clean(v.querySelector("#aiUrl").value); db.settings.aiCode = clean(v.querySelector("#aiCode").value); db.settings.aiEnabled = true; saveDb();
    btn.disabled = true; btn.textContent = "Testing…";
    out.className = "aitest"; out.innerHTML = aiThinking("Contacting the AI server…");
    const slow = setTimeout(() => { out.innerHTML = aiThinking("The free server is waking up. This can take up to a minute…"); }, 5000);
    const st = await aiHealth(true, 75000);
    clearTimeout(slow);
    db.settings.aiTestedAt = Date.now(); saveDb();
    const vd = aiVerdict(st);
    toast(vd.ok ? "✅ AI helper connected" : vd.icon + " Not connected yet");
    rerender();
    const el = document.getElementById("aiTest"); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  if (!aiStatus) aiHealth().then(() => { if (document.getElementById("aiTest")) rerender(); });
}
screen("aiUsage", {
  tab: "more", title: "AI usage",
  render() {
    const log = (db.aiLog || []).slice().reverse(), ok = log.filter(x => x.ok);
    const sum = k => ok.reduce((a, x) => a + (x[k] || 0), 0);
    const by = {}; ok.forEach(x => { const b = by[x.agent] = by[x.agent] || { n: 0, input: 0, cached: 0, output: 0, cost: 0 }; b.n++; ["input", "cached", "output", "cost"].forEach(k => b[k] += x[k] || 0); });
    const name = { scribe: "Scribe (notes → records)", frame: "Frame Reader (photo)", advise: "Advisor (plan)", ask: "Advisor (question)" };
    return `<h1>AI usage</h1><p class="sub">Measured from the AI service's own token counts, on this phone.</p>
      <div class="card row"><div class="stat"><span class="small">Calls</span><b>${ok.length}</b></div><div class="stat"><span class="small">Tokens in</span><b>${fmtTok(sum("input"))}</b></div><div class="stat"><span class="small">Cost</span><b>$${sum("cost").toFixed(4)}</b></div></div>
      <div class="small">${fmtTok(sum("cached"))} of the input tokens were cached (10× cheaper) · ${fmtTok(sum("output"))} output tokens.</div>
      <h2>By agent</h2>${Object.entries(by).map(([k, b]) => `<div class="card"><b>${esc(name[k] || k)}</b><div class="small">${b.n} calls · avg ${fmtTok(Math.round(b.input / b.n))} in (${fmtTok(Math.round(b.cached / b.n))} cached) · ${fmtTok(Math.round(b.output / b.n))} out · avg $${(b.cost / b.n).toFixed(5)}</div></div>`).join("") || `<div class="small">No AI calls yet.</div>`}
      <h2>Every call</h2><div class="card log">${log.slice(0, 60).map(x => `<div class="ln"><span class="fno" style="min-width:74px">${new Date(x.t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span><span class="grow">${esc(name[x.agent] || x.agent)}${x.ok ? ` · ${fmtTok(x.input)} in (${fmtTok(x.cached)} c) · ${fmtTok(x.output)} out${x.checks ? ` · 🛡 ${esc(x.checks)}` : ""}${x.flags ? " · ⚠️ injection flagged" : ""}` : ` · <span style="color:var(--risk)">blocked: ${esc(x.error || "")}</span>`}</span><b>${x.ok ? "$" + (x.cost || 0).toFixed(5) : ""}</b></div>`).join("") || `<span class="small">None yet.</span>`}</div>
      <button class="btn danger" id="clearLog">Clear this log</button>`;
  },
  mount(p, v) { v.querySelector("#clearLog").onclick = () => { if (confirm("Clear the AI usage log on this phone?")) { db.aiLog = []; saveDb(); rerender(); } }; }
});

/* More: apiaries, alerts, display, region, backup/restore, limits */

// Save a file: the phone's share sheet when it can take files (→ Save to Files, AirDrop), else a download
async function saveFile(name, blob) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e.name === "AbortError") return false; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); return true;
}
const blobToData = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
async function photoKeys() {
  const keys = [];
  db.visits.forEach(v => { Object.values(v.frames || {}).forEach(f => f.photo && keys.push(f.photo)); if (v.hive?.photo) keys.push(v.hive.photo); });
  db.mites.forEach(m => m.photo && keys.push(m.photo));
  return keys;
}
async function backup(withPhotos) {
  const out = { ...db, drafts: {}, weather: {} };
  if (withPhotos) {
    out.photos = {};
    for (const k of await photoKeys()) { const b = await photoGet(k); if (b) out.photos[k] = await blobToData(b); }
  }
  const ok = await saveFile(`hive-backup-${TODAY}${withPhotos ? "-photos" : ""}.json`, new Blob([JSON.stringify(out)], { type: "application/json" }));
  if (ok) { db.settings.lastBackup = TODAY; saveDb(); rerender(); }
}
async function restoreFrom(f) {
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || !Array.isArray(d.colonies) || !d.settings) throw new Error("not a backup");
    if (db.colonies.length && !confirm("Replace everything on this phone with this backup?")) return;
    const photos = d.photos || {}; delete d.photos;
    for (const [k, url] of Object.entries(photos)) { const b = await (await fetch(url)).blob(); await photoPut(k, b); }
    d.v = DB_VERSION; d.drafts = {}; d.weather = {};
    db = d; saveDb(); stack = [{ name: "yard", params: {} }]; render(); refreshAllWeather(true);
    toast(`Restored${Object.keys(photos).length ? ` with ${Object.keys(photos).length} photos` : ""}`);
  } catch (e) { toast("That file isn't a backup from this app"); }
}

screen("more", {
  tab: "more", title: "More",
  render() {
    const s = db.settings, nt = s.notify;
    const NOTES = [["freeze", "Cold snaps & feeding windows"], ["strips", "Treatment strip removal"], ["feed", "Feeding"], ["swarm", "Swarm season checks"], ["mites", "Mite counts due"], ["queen", "Queen problems"], ["spray", "Pesticide spray nearby"], ["registration", "Registration & paperwork"], ["other", "Everything else (pests, brood pace, visits)"]];
    const daysSince = s.lastBackup ? daysBetween(s.lastBackup, TODAY) : null;
    return `<h1>More</h1>
      <h2>Apiaries</h2>${db.yards.map(y => `<div class="card tap" data-yardedit="${y.id}"><div class="between"><b>${esc(y.name)}</b><span class="small">${activeIn(y.id).length} ${activeIn(y.id).length === 1 ? "colony" : "colonies"} ›</span></div>
        <div class="small">${y.lat != null ? `📍 ${esc(y.place || "location set")}` : "⚠️ No location — no forecast"}${y.signal === "none" ? " · no signal there" : ""}</div></div>`).join("")}
      <button class="btn ghost" id="addYard">+ Add an apiary</button>
      ${aiSettingsHtml()}
      <h2>Alerts in the app</h2><div class="small">Shown under the 🔔 on the apiary screen. Each says why.</div>
      <div class="card">${NOTES.map(([k, l]) => `<div class="toggle${nt[k] ? " on" : ""}" data-note="${k}"><span class="sw"></span>${l}</div>`).join("")}</div>
      <h2>In the field</h2>
      ${toggle("fieldMode", "Field mode — bigger text and buttons, higher contrast (gloves, sun)")}
      ${toggle("newMode", "Explain it like I'm new")}
      ${toggle("batterySaver", "Dark screen (saves battery on most phones)")}
      <h2>Region</h2>${chips("region", ["Northeast US · zone 6", "Mid-Atlantic · zone 7", "Southeast · zone 8", "Upper Midwest · zone 4", "Pacific NW · zone 8"], s.region, false, true)}
      <div class="small" style="margin-top:4px">${esc(region().note)} Shifts the season calendar and winter-stores targets (a two-deep hive needs ~${winterTarget({ type: "hive", boxes: [{ depth: "deep", frames: 10 }, { depth: "deep", frames: 10 }] })} lb here).</div>
      <h2>Country (for treatment rules)</h2>${chips("country", Object.entries(COUNTRIES), s.country || "US", false, true)}
      <div class="small" style="margin-top:4px">The treatment screen flags products that may not be registered here. It's a starting list — confirm with your state or national list.</div>
      <h2>Your data</h2>
      <div class="note ${daysSince == null || daysSince > 30 ? "warn" : "ok"}">🔒 Everything is stored only on this phone. ${daysSince == null ? "<b>No backup yet.</b> If the phone is lost or the app is deleted, so are your records." : `Last backup ${daysSince === 0 ? "today" : daysSince + " days ago"}.`}</div>
      <button class="btn" id="backup">Back up records (small file)</button>
      <button class="btn ghost" id="backupP">Back up records + photos <span class="small" id="pc"></span></button>
      <label class="btn ghost" style="text-align:center">Restore from a backup<input type="file" id="restore" accept="application/json,.json" style="display:none"/></label>
      <div class="small" style="margin-top:4px">Save the file to iCloud Drive / Google Drive or email it to yourself.</div>
      <button class="btn ghost" id="exp">Export colonies (CSV, for a spreadsheet)</button>
      <button class="btn ghost" data-nav="report">🖨 Report for inspectors (print / PDF)</button>
      <h2>Limits</h2>
      <div class="card small" style="color:var(--ink)">This is decision support from rules of thumb, not a vet or inspector. Every prediction shows its reasons and how sure it is. The app doesn't look at your photos — it works from your taps. Confirm mites with a wash, and anything like foulbrood with the rope test and your state apiarist. Follow treatment labels and your state's rules.</div>
      <div class="small" style="margin-top:8px">Weather: Open-Meteo (only each apiary's rounded location is sent). Prototype, ${APP_VERSION}.</div>
      <button class="btn danger" id="wipe">Delete everything on this phone</button><div style="height:20px"></div>`;
  },
  mount(p, v) {
    aiSettingsMount(v);
    photoCount().then(n => { const el = v.querySelector("#pc"); if (el) el.textContent = n ? `(${n} photos)` : "(no photos yet)"; });
    v.querySelectorAll("[data-note]").forEach(el => el.onclick = () => { db.settings.notify[el.dataset.note] = !db.settings.notify[el.dataset.note]; saveDb(); rerender(); });
    v.querySelector('[data-key="region"]').addEventListener("change", () => { db.settings.region = chipVal(v, "region"); db.settings.regionSet = true; saveDb(); toast("Region updated — calendar and targets shifted"); rerender(); });
    v.querySelector('[data-key="country"]').addEventListener("change", () => { db.settings.country = chipVal(v, "country"); saveDb(); toast(`Treatment rules: ${COUNTRIES[db.settings.country]}`); });
    v.querySelector("#addYard").onclick = () => yardSheet(null);
    v.querySelectorAll("[data-yardedit]").forEach(el => el.onclick = () => yardSheet(yardOf(el.dataset.yardedit)));
    v.querySelector("#exp").onclick = () => exportAll();
    v.querySelector("#backup").onclick = () => backup(false);
    v.querySelector("#backupP").onclick = () => { toast("Packing photos…"); backup(true); };
    v.querySelector("#restore").onchange = e => restoreFrom(e.target.files[0]);
    v.querySelector("#wipe").onclick = async () => {
      if (!confirm("Delete every apiary, colony, visit and photo on this phone? This can't be undone. Back up first if you might want them.")) return;
      for (const k of await photoKeys()) await photoDel(k);
      resetDb(); stack = [{ name: "setup", params: {} }]; render(); toast("Everything deleted");
    };
  }
});

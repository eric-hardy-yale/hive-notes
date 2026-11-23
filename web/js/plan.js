/* Plan: upcoming actions, season checklist, flows, queen rearing, prediction track record */

let planMonth = null, qGraft = null;
function upcoming() {
  const items = [];
  db.colonies.filter(c => c.status === "active").forEach(c => needsFor(c).filter(n => n.action && n.level !== "ok" && n.due).forEach(n => items.push({ due: n.due, level: n.level, text: n.action, who: c.name, id: c.id })));
  const r = db.settings.registration;
  if (r.renewBy && daysBetween(TODAY, r.renewBy) <= 120) items.push({ due: r.renewBy, level: "info", text: `Renew apiary registration (${r.state})`, who: "Paperwork", biz: "paper" });
  db.orders.filter(o => o.status !== "done").forEach(o => items.push({ due: o.pickup, level: "info", text: `${o.nucs} ${o.depth} nuc${o.nucs > 1 ? "s" : ""} for ${o.buyer}`, who: "Nuc order", biz: "orders" }));
  return items.sort((a, b) => a.due.localeCompare(b.due));
}

screen("plan", {
  tab: "plan", title: "Plan",
  render() {
    const m = planMonth ?? monthOf(TODAY), se = seasonFor(m), up = upcoming();
    const week = up.filter(i => daysBetween(TODAY, i.due) <= 7), later = up.filter(i => daysBetween(TODAY, i.due) > 7);
    const row = i => `<div class="card tap" ${i.id ? `data-nav="colony" data-p='{"id":"${i.id}"}'` : `data-biz="${i.biz}"`}><div class="between"><b style="font-size:14.5px">${esc(i.text)}</b>${pill(i.level, fmtShort(i.due))}</div><div class="small">${esc(i.who)}${daysBetween(TODAY, i.due) < 0 ? " · overdue" : ""}</div></div>`;
    const done = db.settings.checklist, scored = db.predLog.filter(p => p.outcome !== "open"), open = db.predLog.filter(p => p.outcome === "open"), hits = scored.filter(p => p.outcome === "true").length;
    return `<h1>Plan</h1><p class="sub">${fmtD(TODAY)} · ${esc(db.settings.region)}</p>
      <h2>This week</h2>${week.map(row).join("") || `<div class="small">Nothing due.</div>`}
      <h2>Coming up</h2>${later.slice(0, 8).map(row).join("") || `<div class="small">Nothing scheduled.</div>`}
      <h2>Season checklist</h2>
      <div class="tabs2">${MONTHS.map((x, i) => `<span data-month="${i}" class="${i === m ? "on" : ""}">${x}</span>`).join("")}</div>
      <div class="card"><b>${esc(se.name)}</b>${se.tasks.map((t, i) => { const k = `${se.name}-${i}`; return `<div class="todo ${done[k] ? "done" : ""}"><span class="box ${done[k] ? "on" : ""}" data-ck="${esc(k)}"></span><b style="font-weight:500">${esc(t)}</b></div>`; }).join("")}
        <div class="small" style="margin-top:6px">🌼 ${esc(flowFor(m).text)}</div></div>
      <div class="small" style="margin-top:4px">${esc(db.settings.region)}: ${esc(region().note)}</div>${nb("Seasons shift by region and by year. The app adjusts dates using your apiaries' forecasts — e.g. first inspection waits for a 55–60°F still day.")}
      <h2>Forage through the year</h2>
      <div class="card">${FLOWS.map(f => `<div class="between" style="padding:4px 0"><span class="small" style="width:110px">${f.m.length > 3 ? "Oct–Mar" : f.m.map(i => MONTHS[i]).join("–")}</span><span class="grow" style="font-size:14px;${f.m.includes(monthOf(TODAY)) ? "font-weight:700" : ""}">${esc(f.text)}</span></div>`).join("")}
        ${db.yards.map(y => y.forage ? `<div class="small" style="margin-top:6px">${esc(y.name)}: ${esc(y.forage)}</div>` : "").join("")}</div>
      <h2>Queen rearing calendar</h2>
      <div class="card"><div class="lbl">Graft / start date</div><input type="date" id="graft" value="${qGraft || `${yearOf(TODAY) + 1}-05-10`}"/>
        ${queenCalendar(qGraft || `${yearOf(TODAY) + 1}-05-10`).map(x => `<div class="between" style="padding:4px 0;border-bottom:1px solid var(--line)"><span class="small">${fmtD(x.d)}</span><span style="font-size:14px;text-align:right">${esc(x.t)}</span></div>`).join("")}</div>
      <h2>How the predictions have done</h2>
      <div class="card"><div class="small" style="margin-bottom:6px">${hits} of ${scored.length} checked so far came true${scored.length ? ` (${Math.round(hits / scored.length * 100)}%)` : ""}. Later weigh-ins and mite counts check them automatically; you can also mark them.</div>
        ${open.length ? `<div class="lbl" style="margin-top:4px">Waiting to be checked</div>` : ""}
        ${open.map(p => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><div style="font-size:14px">⏳ ${esc(p.text)}</div><div class="small">${fmtShort(p.date)} · ${esc(col(p.colonyId)?.name || "")}</div>
          <div class="row" style="gap:6px;margin-top:4px"><button class="btn sm ghost" data-pout="${p.id}|true">It happened</button><button class="btn sm ghost" data-pout="${p.id}|false">It didn't</button></div></div>`).join("")}
        ${scored.length ? `<div class="lbl" style="margin-top:8px">Checked</div>` : ""}
        ${scored.slice().reverse().map(p => `<div class="ln" style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)"><span>${p.outcome === "true" ? "✅" : "❌"}</span><div class="grow"><div style="font-size:14px">${esc(p.text)}</div><div class="small">${fmtShort(p.date)} · ${esc(col(p.colonyId)?.name || "")} · ${esc(p.note)}</div></div></div>`).join("")}</div>
      <button class="link" data-tab="more">Notification settings ›</button>`;
  },
  mount(p, v) {
    v.querySelectorAll("[data-month]").forEach(el => el.onclick = () => { planMonth = +el.dataset.month; rerender(); });
    v.querySelectorAll("[data-ck]").forEach(el => el.onclick = () => { const k = el.dataset.ck; db.settings.checklist[k] = !db.settings.checklist[k]; saveDb(); rerender(); });
    v.querySelectorAll("[data-biz]").forEach(el => el.onclick = () => { bizTab = el.dataset.biz; tabTo("biz"); });
    v.querySelectorAll("[data-pout]").forEach(b => b.onclick = () => { const [id, o] = b.dataset.pout.split("|"), pr = db.predLog.find(x => x.id === id); pr.outcome = o; pr.note = "Marked by you " + fmtShort(TODAY); saveDb(); rerender(); });
    v.querySelector("#graft").onchange = e => { qGraft = e.target.value; rerender(); };
  }
});

/* Business: inventory, nuc orders, honey & batches, money, paperwork, pollination */

let bizTab = "inv";
screen("biz", {
  tab: "biz", title: "Business",
  render() {
    const tabs = [["inv", "Inventory"], ["orders", "Nuc orders"], ["honey", "Products"], ["money", "Money"], ["paper", "Paperwork"], ["poll", "Pollination"]];
    let body = "";
    if (bizTab === "inv") {
      const pk = packingFor(activeIn(db.settings.currentYard)).list;
      body = `<div class="small">Updates itself when you add/remove boxes, feed, treat, harvest, or log what came home.</div>
        <div class="card">${Object.entries(db.inventory).map(([k, n]) => { const min = db.invMin[k], low = min != null && n < min, need = pk[k] && pk[k] > n; return `<div class="between" style="padding:7px 0;border-bottom:1px solid var(--line)"><div><span>${esc(k)}</span>${low ? `<div class="small low">Low — keep ${min}+</div>` : ""}${need ? `<div class="small low">Next run needs ${pk[k]}</div>` : ""}</div><div class="qty"><button data-inv="${esc(k)}" data-d="-1">−</button><b>${n}</b><button data-inv="${esc(k)}" data-d="1">+</button></div></div>`; }).join("")}</div>
        <button class="btn ghost" id="addItem">+ Add an item</button>`;
    } else if (bizTab === "orders") {
      const nucs = activeIn().filter(c => c.type === "nuc");
      body = db.orders.map(o => `<div class="card"><div class="between"><b>${esc(o.buyer)}</b>${pill(o.status === "done" ? "ok" : o.status === "deposit" ? "info" : "grey", { asked: "Asked", deposit: "Deposit paid", done: "Picked up" }[o.status])}</div>
          <div class="small" style="margin-top:4px">${o.nucs} × ${esc(o.depth)} nuc · $${o.price} each · pickup ${fmtD(o.pickup)}${o.deposit ? ` · $${o.deposit} deposit` : ""}${o.filled ? ` · ${o.filled} filled` : ""}</div>
          <div class="small">Buyer runs <b>${esc(o.depth)}s</b> — ${nucs.filter(n => n.boxes[0].depth === o.depth).length ? `you have ${nucs.filter(n => n.boxes[0].depth === o.depth).map(n => n.name).join(", ")} in ${esc(o.depth)}` : `no ${esc(o.depth)} nucs right now`}.</div>
          ${o.status !== "done" ? `<button class="btn sm ghost" data-ostat="${o.id}">${o.status === "asked" ? "Deposit paid" : "Mark picked up"}</button>` : ""}</div>`).join("") +
        `<button class="btn ghost" id="addOrder">+ New order</button>
        <h2>Ready to sell?</h2>${nucs.map(n => { const r = nucReady(n); return `<div class="card"><div class="between"><b>${esc(n.name)}</b>${pill(r.ready ? "ok" : "warn", r.ready ? "Ready" : "Not yet")}</div>${r.checks.map(x => `<div class="small">${x.ok ? "✅" : "⬜"} ${esc(x.t)}</div>`).join("")}<div class="small">${esc(describeSetup(n))}</div></div>`; }).join("") || `<div class="small">No nucs right now.</div>`}
        ${nb("Buyers' boxes must match: deep frames don't fit medium boxes. Ask before you build their nuc.")}`;
    } else if (bizTab === "honey") {
      const by = {}; db.harvests.forEach(h => { by[h.colonyId] = (by[h.colonyId] || 0) + h.lb; });
      const honey = db.batches.filter(b => (b.product || "Honey") === "Honey"), other = db.batches.filter(b => (b.product || "Honey") !== "Honey");
      body = `<h2 style="margin-top:4px">Honey batches</h2>${honey.map(b => `<div class="card"><div class="between"><b>${esc(b.id)}</b><span class="small">lot ${esc(b.lot)}</span></div>
          <div class="small">${fmtD(b.date, false)} · ${b.jars} jars · ${db.harvests.filter(h => h.batch === b.id).reduce((s, h) => s + h.lb, 0)} lb from ${[...new Set(db.harvests.filter(h => h.batch === b.id).map(h => col(h.colonyId)?.name))].join(", ")}</div>
          <div class="row" style="margin-top:6px"><span class="small" style="width:90px">Moisture %</span><input type="number" step="0.1" data-moist="${b.id}" value="${b.moisture ?? ""}" style="margin:0;width:90px"/>${b.moisture != null ? (b.moisture > 18.6 ? pill("risk", "May ferment") : pill("ok", "OK to bottle")) : pill("grey", "Not measured")}</div></div>`).join("")}
        <h2>Who produced</h2><div class="card">${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([id, lb]) => `<div class="between" style="padding:4px 0"><span>${esc(col(id)?.name)}</span><b>${lb} lb</b></div>`).join("")}</div>
        <h2>Label checklist</h2><div class="card small" style="color:var(--ink)">✅ The word “honey” · ✅ Net weight (oz and g) · ✅ Lot number (from the batch) · ⬜ Producer name & address (you add it — not stored here) · ⬜ Your state's cottage-food wording</div>
        <h2>Wax, comb honey, pollen</h2>${other.map(b => `<div class="card"><div class="between"><b>${esc(b.product)}</b><span class="small">lot ${esc(b.lot)}</span></div><div class="small">${fmtD(b.date, false)} · ${b.amount} ${esc(b.unit)}${b.colonyId ? ` · from ${esc(col(b.colonyId)?.name)}` : ""}${b.note ? ` · ${esc(b.note)}` : ""}</div></div>`).join("") || `<div class="small">None yet.</div>`}
        <button class="btn ghost" id="addBatch">+ New batch (honey, comb, wax, pollen)</button>`;
    } else if (bizTab === "money") {
      const y = yearOf(TODAY), rows = db.money.filter(x => yearOf(x.date) === y).sort((a, b) => b.date.localeCompare(a.date));
      const cost = rows.filter(r => r.kind === "cost").reduce((s, r) => s + r.amount, 0), inc = rows.filter(r => r.kind === "income").reduce((s, r) => s + r.amount, 0), n = activeIn().length;
      body = `<div class="card row"><div class="stat"><span class="small">Costs ${y}</span><b>$${cost}</b></div><div class="stat"><span class="small">Income</span><b>$${inc}</b></div><div class="stat"><span class="small">Net</span><b style="color:${inc - cost >= 0 ? "var(--ok)" : "var(--risk)"}">$${inc - cost}</b></div></div>
        <div class="small">About $${n ? Math.round(cost / n) : 0} in costs per colony this year.</div>
        <div class="card log" style="margin-top:8px">${rows.map(r => `<div class="ln"><span class="fno" style="width:48px">${fmtShort(r.date)}</span><span class="grow">${esc(r.note)}${r.colonyId ? ` <span class="small">· ${esc(col(r.colonyId)?.name)}</span>` : ""}</span><b style="color:${r.kind === "income" ? "var(--ok)" : "var(--ink)"}">${r.kind === "income" ? "+" : "−"}$${r.amount}</b></div>`).join("")}</div>
        <button class="btn ghost" id="addMoney">+ Add cost or income</button>`;
    } else if (bizTab === "paper") {
      const r = db.settings.registration;
      body = `<div class="card tap" id="editReg"><div class="between"><b>Apiary registration</b><span class="small">edit ›</span></div>${r.renewBy ? `<div class="small">${esc(r.state || "")} · renew by ${fmtD(r.renewBy)} (${daysBetween(TODAY, r.renewBy)} days)</div>${pill(daysBetween(TODAY, r.renewBy) < 60 ? "warn" : "ok", daysBetween(TODAY, r.renewBy) < 60 ? "Renew soon" : "Current")}` : `<div class="small">Not set. Most US states require yearly registration — add your renewal date for a reminder.</div>`}</div>
        <div class="card tap" id="editReg2"><div class="between"><b>Inspections</b><span class="small">edit ›</span></div><div class="small">Last: ${r.lastInspection ? fmtD(r.lastInspection) : "—"}${r.inspector ? " · " + esc(r.inspector) : ""}</div></div>
        <div class="card"><b>Treatment records</b><div class="small">${db.treatments.length} treatments on file. Inspectors and some states ask for these.</div><button class="btn sm ghost" id="expTreat">Export treatments (CSV)</button></div>
        <div class="card"><b>Inspection-ready report</b><div class="small">Every colony: setup, queen, last visit, mites, treatments.</div><div class="row" style="gap:6px"><button class="btn sm ghost" data-nav="report">🖨 Print / PDF</button><button class="btn sm ghost" id="expAll">Export (CSV)</button></div></div>
        <div class="card"><b>Selling nucs across state lines</b><div class="small">Many states require a health certificate from an inspection. Check before you promise delivery.</div></div>`;
    } else {
      const grade = c => { const lv = lastVisit(c.id); return lv?.broodFrames != null ? lv.broodFrames * 2 : null; };
      body = `<div class="note">Skip this tab if you don't rent colonies. Strength ≈ frames of bees (brood frames × 2, rough).</div>
        ${(db.contracts || []).map(k => { const cs = k.colonies.map(col).filter(Boolean), weak = cs.filter(c => (grade(c) ?? 0) < k.minFob);
          return `<div class="card"><div class="between"><b>${esc(k.crop)} · ${esc(k.grower)}</b>${pill(k.status === "done" ? "ok" : k.status === "in" ? "info" : "grey", { signed: "Signed", in: "Colonies in", out: "Moved out", done: "Paid" }[k.status])}</div>
            <div class="small">${fmtD(k.start, false)} → ${fmtD(k.end, false)} · ${k.need} colonies · min ${k.minFob} frames of bees · $${k.fee} each</div>
            <div style="margin-top:6px">${cs.map(c => `<div class="between small" style="padding:2px 0"><span>${esc(c.name)} <span class="small">· ${esc(yardOf(c.yardId)?.name)}</span></span><span>${grade(c) ?? "?"} frames ${pill((grade(c) ?? 0) >= k.minFob ? "ok" : "warn", (grade(c) ?? 0) >= k.minFob ? "OK" : "Below min")}</span></div>`).join("") || `<div class="small">No colonies assigned.</div>`}</div>
            ${cs.length < k.need ? `<div class="small low">${k.need - cs.length} more needed</div>` : ""}${weak.length ? `<div class="small low">Grade again closer to the date — fall numbers aren't spring numbers.</div>` : ""}
            <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px">
              ${k.status === "signed" ? `<button class="btn sm ghost" data-kassign="${k.id}">Assign colonies</button><button class="btn sm ghost" data-kin="${k.id}">Move in</button>` : ""}
              ${k.status === "in" ? `<button class="btn sm ghost" data-kout="${k.id}">Move out</button>` : ""}
              ${k.status === "out" ? `<button class="btn sm ghost" data-kpaid="${k.id}">Paid $${k.fee * cs.length}</button>` : ""}</div></div>`; }).join("")}
        <button class="btn ghost" id="addContract">+ New contract</button>
        <h2>Strength right now</h2>
        <div class="card">${activeIn().map(c => { const fob = grade(c); return `<div class="between" style="padding:5px 0;border-bottom:1px solid var(--line)"><span>${esc(c.name)}</span><span>${fob != null ? `<b>${fob}</b> frames of bees ${pill(fob >= 8 ? "ok" : "warn", fob >= 8 ? "Contract grade" : "Too weak")}` : `<span class="small">no data</span>`}</span></div>`; }).join("")}</div>`;
    }
    return `<h1>Business</h1><div class="tabs2">${tabs.map(([k, l]) => `<span data-bt="${k}" class="${k === bizTab ? "on" : ""}">${l}</span>`).join("")}</div>${body}`;
  },
  mount(p, v) {
    v.querySelectorAll("[data-bt]").forEach(el => el.onclick = () => { bizTab = el.dataset.bt; rerender(); });
    v.querySelectorAll("[data-inv]").forEach(b => b.onclick = () => { const k = b.dataset.inv; db.inventory[k] = Math.max(0, (db.inventory[k] || 0) + +b.dataset.d); saveDb(); rerender(); });
    v.querySelector("#addItem")?.addEventListener("click", () => sheet(`<h3>Add an item</h3><input id="nm" placeholder="e.g. Shallow boxes, Bee brushes"/><div class="row"><div class="grow"><div class="lbl">On hand</div><input id="n" type="number" value="1"/></div><div class="grow"><div class="lbl">Warn below</div><input id="min" type="number" value=""/></div></div><button class="btn" id="save">Add</button><button class="btn ghost" data-close>Cancel</button>`, s => {
      s.querySelector("#save").onclick = () => { const k = s.querySelector("#nm").value.trim(); if (k) { db.inventory[k] = +s.querySelector("#n").value || 0; if (s.querySelector("#min").value) db.invMin[k] = +s.querySelector("#min").value; saveDb(); } closeSheet(); rerender(); };
      s.querySelector("[data-close]").onclick = closeSheet; }));
    v.querySelectorAll("[data-ostat]").forEach(b => b.onclick = () => { const o = db.orders.find(x => x.id === b.dataset.ostat); if (o.status === "asked") { o.status = "deposit"; o.deposit = o.deposit || 50; db.money.push({ date: TODAY, kind: "income", amount: o.deposit, note: `Deposit · ${o.buyer}`, colonyId: null }); } else o.status = "done"; saveDb(); rerender(); });
    v.querySelector("#addOrder")?.addEventListener("click", () => sheet(`<h3>New nuc order</h3>
      <div class="q"><div class="lbl">Buyer</div><input id="buyer" placeholder="First name or 'club member' — no phone/email here"/></div>
      <div class="q"><div class="lbl">How many</div>${chips("n", ["1", "2", "3", "4", "5"], "1", false, true)}</div>
      <div class="q"><div class="lbl">Buyer runs</div>${chips("depth", [["deep", "Deeps"], ["medium", "Mediums"]], "medium", false, true)}</div>
      <div class="row"><div class="grow"><div class="lbl">Price each $</div><input id="price" type="number" value="185"/></div><div class="grow"><div class="lbl">Pickup</div><input id="pick" type="date" value="${yearOf(TODAY) + 1}-05-01"/></div></div>
      <button class="btn" id="save">Add order</button><button class="btn ghost" data-close>Cancel</button>`, s => {
      s.querySelector("#save").onclick = () => { db.orders.push({ id: uid("o"), buyer: s.querySelector("#buyer").value.trim() || "Buyer", nucs: +chipVal(s, "n"), depth: chipVal(s, "depth"), deposit: 0, price: +s.querySelector("#price").value || 0, pickup: s.querySelector("#pick").value, status: "asked" }); saveDb(); closeSheet(); rerender(); };
      s.querySelector("[data-close]").onclick = closeSheet; }));
    v.querySelectorAll("[data-moist]").forEach(inp => inp.onchange = () => { const b = db.batches.find(x => x.id === inp.dataset.moist); b.moisture = inp.value === "" ? null : +inp.value; saveDb(); rerender(); });
    v.querySelector("#addMoney")?.addEventListener("click", () => sheet(`<h3>Add cost or income</h3>${chips("kind", [["cost", "Cost"], ["income", "Income"]], "cost", false, true)}
      <div class="row"><div class="grow"><div class="lbl">Amount $</div><input id="amt" type="number"/></div><div class="grow"><div class="lbl">For</div><select id="cid"><option value="">Whole operation</option>${activeIn().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div></div>
      <div class="q"><div class="lbl">Note</div><input id="note" placeholder="e.g. Sugar, jars, queen"/></div>
      <button class="btn" id="save">Add</button><button class="btn ghost" data-close>Cancel</button>`, s => {
      s.querySelector("#save").onclick = () => { const a = +s.querySelector("#amt").value; if (a) { db.money.push({ date: TODAY, kind: chipVal(s, "kind"), amount: a, note: s.querySelector("#note").value || chipVal(s, "kind"), colonyId: s.querySelector("#cid").value || null }); saveDb(); } closeSheet(); rerender(); };
      s.querySelector("[data-close]").onclick = closeSheet; }));
    v.querySelector("#expTreat")?.addEventListener("click", () => csvDownload("treatments.csv", [["colony", "product", "start", "remove_by", "removed"], ...db.treatments.map(t => [col(t.colonyId)?.name, t.product, t.start, t.removeBy || "", t.done ? (t.removed || "yes") : "in"])]));
    v.querySelector("#expAll")?.addEventListener("click", () => exportAll());
    v.querySelector("#addBatch")?.addEventListener("click", () => sheet(`<h3>New batch</h3>
      <div class="q"><div class="lbl">Product</div>${chips("prod", ["Honey", "Comb honey", "Wax", "Pollen"], "Wax", false, true)}</div>
      <div class="row"><div class="grow"><div class="lbl">Amount</div><input id="amt" type="number" value="1"/></div><div class="grow"><div class="lbl">Unit</div>${chips("unit", ["lb", "jars", "frames", "blocks"], "lb", false, true)}</div></div>
      <div class="q"><div class="lbl">From</div><select id="cid"><option value="">Several colonies</option>${activeIn().map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></div>
      <div class="q"><div class="lbl">Note</div><input id="note" placeholder="e.g. rendered cappings, trapped pollen"/></div>
      <button class="btn" id="save">Add batch</button><button class="btn ghost" data-close>Cancel</button>`, s => {
      s.querySelector("#save").onclick = () => { const prod = chipVal(s, "prod"), L = { Honey: "H", "Comb honey": "C", Wax: "W", Pollen: "P" }[prod], n = db.batches.filter(b => (b.product || "Honey") === prod).length + 1;
        const ym = `${String(yearOf(TODAY)).slice(2)}${String(monthOf(TODAY) + 1).padStart(2, "0")}`;
        db.batches.push({ id: `${L}-${ym}${n > 1 ? "-" + n : ""}`, product: prod, date: TODAY, amount: +s.querySelector("#amt").value || 0, unit: chipVal(s, "unit"), jars: chipVal(s, "unit") === "jars" ? +s.querySelector("#amt").value || 0 : 0, moisture: null, lot: `${ym.slice(0, 2)}-${ym.slice(2)}-${L}${n}`, colonyId: s.querySelector("#cid").value || null, note: s.querySelector("#note").value });
        saveDb(); closeSheet(); toast(`${prod} batch added`); rerender(); };
      s.querySelector("[data-close]").onclick = closeSheet; }));
    const K = id => db.contracts.find(k => k.id === id);
    v.querySelectorAll("[data-kassign]").forEach(b => b.onclick = () => { const k = K(b.dataset.kassign);
      sheet(`<h3>Assign colonies · ${esc(k.crop)}</h3><div class="small">Needs ${k.need}, at least ${k.minFob} frames of bees each.</div>${chips("cs", activeIn().filter(c => c.type === "hive").map(c => { const lv = lastVisit(c.id), f = lv?.broodFrames != null ? lv.broodFrames * 2 : "?"; return [c.id, `${c.name} · ${f}f`]; }), k.colonies, true)}
        <button class="btn" id="save">Save</button><button class="btn ghost" data-close>Cancel</button>`, s => {
        s.querySelector("#save").onclick = () => { k.colonies = chipVals(s, "cs"); saveDb(); closeSheet(); rerender(); }; s.querySelector("[data-close]").onclick = closeSheet; }); });
    v.querySelectorAll("[data-kin]").forEach(b => b.onclick = () => { const k = K(b.dataset.kin);
      k.colonies.map(col).forEach(c => { c.homeYard = c.yardId; c.yardId = k.yardId; addEvent(c.id, "move", `Moved to ${yardOf(k.yardId)?.name} for ${k.crop} pollination`); });
      k.status = "in"; saveDb(); toast(`${k.colonies.length} colonies moved in · move at night, entrances closed`); rerender(); });
    v.querySelectorAll("[data-kout]").forEach(b => b.onclick = () => { const k = K(b.dataset.kout);
      k.colonies.map(col).forEach(c => { if (c.homeYard) { c.yardId = c.homeYard; delete c.homeYard; } addEvent(c.id, "move", `Back from ${k.crop} pollination`); });
      k.status = "out"; saveDb(); toast("Moved back home"); rerender(); });
    v.querySelectorAll("[data-kpaid]").forEach(b => b.onclick = () => { const k = K(b.dataset.kpaid); k.status = "done"; db.money.push({ date: TODAY, kind: "income", amount: k.fee * k.colonies.length, note: `${k.crop} pollination`, colonyId: null }); saveDb(); toast("Income added"); rerender(); });
    v.querySelector("#addContract")?.addEventListener("click", () => sheet(`<h3>New pollination contract</h3>
      <div class="q"><div class="lbl">Grower</div><input id="gr" placeholder="Farm or first name — no contact details here"/></div>
      <div class="q"><div class="lbl">Crop</div>${chips("crop", ["Apples", "Blueberries", "Pumpkins", "Cucumbers", "Other"], "Apples", false, true)}</div>
      <div class="row"><div class="grow"><div class="lbl">Colonies</div><input id="need" type="number" value="2"/></div><div class="grow"><div class="lbl">$ each</div><input id="fee" type="number" value="90"/></div><div class="grow"><div class="lbl">Min frames</div><input id="min" type="number" value="8"/></div></div>
      <div class="row"><div class="grow"><div class="lbl">In</div><input id="st" type="date" value="${yearOf(TODAY) + 1}-05-01"/></div><div class="grow"><div class="lbl">Out</div><input id="en" type="date" value="${yearOf(TODAY) + 1}-05-15"/></div></div>
      <div class="q"><div class="lbl">Colonies go to</div>${chips("yd", db.yards.map(y => [y.id, y.name]), db.yards[db.yards.length - 1].id, false, true)}</div>
      <button class="btn" id="save">Add contract</button><button class="btn ghost" data-close>Cancel</button>`, s => {
      s.querySelector("#save").onclick = () => { db.contracts.push({ id: uid("k"), grower: s.querySelector("#gr").value.trim() || "Grower", crop: chipVal(s, "crop"), start: s.querySelector("#st").value, end: s.querySelector("#en").value, need: +s.querySelector("#need").value || 1, minFob: +s.querySelector("#min").value || 8, fee: +s.querySelector("#fee").value || 0, colonies: [], status: "signed", yardId: chipVal(s, "yd"), paid: false }); saveDb(); closeSheet(); rerender(); };
      s.querySelector("[data-close]").onclick = closeSheet; }));
  }
});

function exportAll() {
  csvDownload("colonies.csv", [["colony", "yard", "status", "setup", "queen_year", "queen_marked", "last_visit", "stores_lb", "last_mites", "active_treatment"],
    ...db.colonies.map(c => { const lv = lastVisit(c.id), m = mitesOf(c.id).slice(-1)[0], t = treatsOf(c.id).find(x => !x.done); return [c.name, yardOf(c.yardId)?.name, c.status, describeSetup(c), c.queen?.year || "", c.queen?.marked ? "yes" : "no", lv?.date || "", lv?.storesLb ?? "", m ? `${m.count}/${m.sample} ${m.date}` : "", t ? `${t.product} until ${t.removeBy}` : ""]; })]);
}

/* ---------- printable report (Print → Save as PDF) ---------- */
screen("report", {
  tab: "more", notabs: true, title: "Report",
  render(p) {
    const cs = p.id ? [col(p.id)] : db.colonies.filter(c => c.status === "active"), r = db.settings.registration;
    const tr = db.treatments.filter(t => cs.some(c => c.id === t.colonyId)).sort((a, b) => b.start.localeCompare(a.start));
    return `<div class="noprint row" style="gap:6px"><button class="btn" id="print">🖨 Print / Save as PDF</button></div>
      <div class="report"><h1 style="font-size:20px">${p.id ? `Colony report · ${esc(cs[0].name)}` : "Apiary report"}</h1>
      <div class="small">Prepared ${fmtD(TODAY)}${r.state ? ` · registration ${esc(r.state)}` : ""}${r.renewBy ? `, renew by ${fmtD(r.renewBy, false)}` : ""}${r.lastInspection ? ` · last inspection ${fmtD(r.lastInspection, false)}` : ""}. Yard locations left out.</div>
      <table><tr><th>Colony</th><th>Yard</th><th>Setup</th><th>Queen</th><th>Last visit</th><th>Stores</th><th>Mites</th></tr>
      ${cs.map(c => { const lv = lastVisit(c.id), m = mitesOf(c.id).slice(-1)[0], st = storesNow(c); return `<tr><td>${esc(c.name)}</td><td>${esc(yardOf(c.yardId)?.name)}</td><td>${esc(describeSetup(c))}</td><td>${c.queen?.year || "?"}${c.queen?.marked ? ` (${queenColor(c.queen.year)})` : ""}</td><td>${lv ? fmtShort(lv.date) : "—"}</td><td>${st ? `~${st.lb} lb` : "—"}</td><td>${m ? `${m.count}/${m.sample} ${fmtShort(m.date)}` : "—"}</td></tr>`; }).join("")}</table>
      <h2>Treatments</h2><table><tr><th>Colony</th><th>Product</th><th>Start</th><th>Removed</th></tr>
      ${tr.map(t => `<tr><td>${esc(col(t.colonyId)?.name)}</td><td>${esc(t.product)}</td><td>${fmtShort(t.start)}</td><td>${t.removeBy ? (t.done ? fmtShort(t.removed || t.removeBy) : `in — by ${fmtShort(t.removeBy)}`) : "single dose"}</td></tr>`).join("") || `<tr><td colspan="4">None</td></tr>`}</table>
      ${p.id ? `<h2>Visits</h2><table><tr><th>Date</th><th>Type</th><th>Brood</th><th>Stores</th><th>Notes</th></tr>${visitsOf(p.id).slice().reverse().map(v => `<tr><td>${fmtShort(v.date)}</td><td>${esc(VISIT_TYPES[v.type]?.label || v.type)}</td><td>${v.broodFrames ?? ""}</td><td>${v.storesLb ?? ""}</td><td>${esc(v.note || "")}</td></tr>`).join("")}</table>` : ""}
      <div class="small">Decision support only. Disease findings need confirming by a test or your state apiarist.</div></div>`;
  },
  mount(p, v) { v.querySelector("#print").onclick = () => window.print(); }
});

function regSheet() {
  const r = db.settings.registration;
  sheet(`<h3>Registration & inspections</h3>
    <div class="q"><div class="lbl">State or region you're registered in</div><input id="st" value="${esc(r.state || "")}" placeholder="e.g. Connecticut"/></div>
    <div class="q"><div class="lbl">Renew by</div><input id="rb" type="date" value="${esc(r.renewBy || "")}"/></div>
    <div class="q"><div class="lbl">Last inspection</div><input id="li" type="date" value="${esc(r.lastInspection || "")}"/></div>
    <div class="q"><div class="lbl">State apiarist / inspector</div><input id="ins" value="${esc(r.inspector || "")}" placeholder="Name or office, for your own reference"/></div>
    <button class="btn" id="save">Save</button><button class="btn ghost" data-close>Cancel</button>`, s => {
    s.querySelector("#save").onclick = () => { Object.assign(r, { state: s.querySelector("#st").value.trim(), renewBy: s.querySelector("#rb").value || null, lastInspection: s.querySelector("#li").value || null, inspector: s.querySelector("#ins").value.trim() }); saveDb(); closeSheet(); rerender(); };
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}
document.addEventListener("click", e => { if (e.target.closest("#editReg, #editReg2")) regSheet(); });

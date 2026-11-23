/* Colony: overview, setup, queen, logs, trends, family; lifecycle actions */

function renameSheet(c) {
  const isNuc = c.type === "nuc", n = nextNum("nuc");
  const sugg = isNuc ? [`Nuc ${n}`, `Nuc ${n + 1}`, `#${n}`] : [`Hive ${nextNum("hive")}`, "Queen Bea", "Back fence", "Big Blue"];
  sheet(`<h3>Rename ${esc(c.name)}</h3><input id="nm" maxlength="24" value="${esc(c.name)}"/>
    <div class="small" style="margin-top:6px">Shows everywhere. History stays with the colony.</div>
    <div class="chips">${sugg.map(x => `<span class="chip" data-static="1" data-s="${esc(x)}">${esc(x)}</span>`).join("")}</div>
    <button class="btn" id="save">Save name</button><button class="btn ghost" data-close>Cancel</button>`, s => {
    const inp = s.querySelector("#nm"); inp.select();
    s.querySelectorAll("[data-s]").forEach(ch => ch.onclick = () => { inp.value = ch.dataset.s; });
    const save = () => { const v = inp.value.trim().replace(/\s+/g, " "); if (v) { addEvent(c.id, "rename", `Renamed ${c.name} → ${v}`); c.name = v; saveDb(); } closeSheet(); rerender(); };
    s.querySelector("#save").onclick = save; inp.onkeydown = e => { if (e.key === "Enter") save(); if (e.key === "Escape") closeSheet(); };
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}

function boxSheet(c, i) {
  const b = c.boxes[i];
  sheet(`<h3>Box ${i + 1} (from the bottom)</h3>
    <div class="q"><div class="lbl">Depth</div>${chips("depth", [["deep", "Deep"], ["medium", "Medium"], ["shallow", "Shallow"]], b.depth, false, true)}</div>
    <div class="q"><div class="lbl">Frames</div>${chips("frames", c.type === "nuc" ? ["4", "5", "6"] : ["8", "10"], String(b.frames), false, true)}</div>
    <div class="small">Full of honey this box weighs about <b>${boxLb(b, 1)} lb</b>.</div>
    <button class="btn" id="save">Save</button>
    ${c.boxes.length > 1 ? `<button class="btn danger" id="rm">Remove this box</button>` : ""}
    <button class="btn ghost" data-close>Cancel</button>`, s => {
    s.querySelector("#save").onclick = () => { c.boxes[i] = { depth: chipVal(s, "depth"), frames: +chipVal(s, "frames") }; addEvent(c.id, "setup", `Box ${i + 1} → ${c.boxes[i].depth}, ${c.boxes[i].frames}-frame`); saveDb(); closeSheet(); rerender(); };
    const rm = s.querySelector("#rm");
    if (rm) rm.onclick = () => { const k = c.boxes[i].depth === "deep" ? "Deep boxes" : c.boxes[i].depth === "medium" ? "Medium boxes" : "Shallow boxes"; c.boxes.splice(i, 1); db.inventory[k] = (db.inventory[k] || 0) + 1; addEvent(c.id, "setup", "Removed a box (back to inventory)"); saveDb(); closeSheet(); rerender(); toast(`Box back in inventory (${k})`); };
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}
function addBox(c) {
  const top = c.boxes[c.boxes.length - 1];
  sheet(`<h3>Add a box</h3><div class="q"><div class="lbl">Depth</div>${chips("depth", [["deep", "Deep"], ["medium", "Medium"], ["shallow", "Shallow"]], top.depth === "deep" && c.boxes.length >= 2 ? "medium" : top.depth, false, true)}</div>
    <div class="q"><div class="lbl">Used as</div>${chips("role", [["brood", "Brood"], ["super", "Honey super"]], c.boxes.length >= 2 ? "super" : "brood", false, true)}</div>
    <div class="small">Takes one from inventory if you have it.</div>
    <button class="btn" id="save">Add box</button><button class="btn ghost" data-close>Cancel</button>`, s => {
    s.querySelector("#save").onclick = () => {
      const d = chipVal(s, "depth"), k = d === "deep" ? "Deep boxes" : d === "medium" ? "Medium boxes" : "Shallow boxes";
      c.boxes.push({ depth: d, frames: top.frames, role: chipVal(s, "role") });
      if ((db.inventory[k] || 0) > 0) db.inventory[k]--; else toast(`No ${k.toLowerCase()} in inventory — logged anyway`);
      addEvent(c.id, "setup", `Added a ${d} ${chipVal(s, "role") === "super" ? "super" : "box"}`); saveDb(); closeSheet(); rerender();
    };
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}

function queenSheet(c) {
  const q = c.queen || {}, years = [yearOf(TODAY), yearOf(TODAY) - 1, yearOf(TODAY) - 2, yearOf(TODAY) - 3].map(String);
  sheet(`<h3>Queen · ${esc(c.name)}</h3>
    <div class="q"><div class="lbl">Year</div>${chips("year", years.map(y => [y, `${y} <span class="qdot" style="background:${QUEEN_HEX[queenColor(y)]}"></span>`]).concat([["", "Unknown"]]), q.year ? String(q.year) : "", false, true)}
      <div class="small" style="margin-top:4px">Marking colors by year: white (1/6), yellow (2/7), red (3/8), green (4/9), blue (5/0). This year: <b>${queenColor(yearOf(TODAY))}</b>.</div></div>
    <div class="q"><div class="lbl">Marked?</div>${chips("marked", [["1", "Marked"], ["0", "Unmarked"]], q.marked ? "1" : "0", false, true)}</div>
    <div class="q"><div class="lbl">Where she came from</div>${chips("source", [["raised", "Raised (cell/walk-away)"], ["bought", "Bought / mated"], ["swarm", "Came with a swarm"], ["supersedure", "Supersedure"], ["unknown", "Unknown"]], q.source || "unknown", false, true)}</div>
    <div class="q"><div class="lbl">Laying?</div>${chips("laying", [["1", "Laying"], ["0", "Not yet / not seen"]], q.laying === false ? "0" : "1", false, true)}</div>
    <button class="btn" id="save">Save</button>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:8px"><button class="btn sm ghost" id="requeen">Requeened today</button><button class="btn sm ghost" id="super">Supersedure seen</button><button class="btn sm ghost" id="qless">Queenless check</button></div>
    <button class="btn ghost" data-close>Close</button>`, s => {
    const save = (ev) => {
      const y = chipVal(s, "year");
      c.queen = { year: y ? +y : null, marked: chipVal(s, "marked") === "1", source: chipVal(s, "source"), laying: chipVal(s, "laying") === "1", since: ev ? TODAY : (q.since || TODAY) };
      if (ev) addEvent(c.id, "queen", ev); saveDb(); closeSheet(); rerender();
    };
    s.querySelector("#save").onclick = () => save(null);
    s.querySelector("#requeen").onclick = () => { s.querySelector('[data-key="year"] .chip[data-v="' + yearOf(TODAY) + '"]').click(); s.querySelector('[data-key="source"] .chip[data-v="bought"]').click(); save("Requeened with a mated queen"); };
    s.querySelector("#super").onclick = () => { addEvent(c.id, "queen", "Supersedure cells seen — leave them"); saveDb(); toast("Logged. Leave supersedure cells; check for eggs in ~3 weeks."); };
    s.querySelector("#qless").onclick = () => { closeSheet(); sheet(`<h3>Is ${esc(c.name)} queenless?</h3>
      <div class="todo"><span class="box"></span><div><b>Eggs?</b><div class="small">Any eggs = a queen laid within 3 days.</div></div></div>
      <div class="todo"><span class="box"></span><div><b>Emergency cells</b> on the face of comb?<div class="small">They're raising a new queen — let them, or add one.</div></div></div>
      <div class="todo"><span class="box"></span><div><b>Roaring / agitated</b>, spotty capped brood only?<div class="small">Classic queenless signs.</div></div></div>
      <div class="todo"><span class="box"></span><div><b>Laying workers?</b> Multiple eggs per cell, on walls, drone brood in worker cells.<div class="small">Harder to fix — combine or shake out.</div></div></div>
      <div class="note">Test: give them a frame of eggs from another colony. Queen cells on it within a few days = queenless.</div>
      <button class="btn ghost" data-close>Close</button>`, s2 => { s2.querySelectorAll(".box").forEach(b => b.onclick = () => b.classList.toggle("on")); s2.querySelector("[data-close]").onclick = closeSheet; }); };
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}

function splitSheet(c) {
  let type = "nuc";
  const draw = () => sheet(`<h3>Split ${esc(c.name)}</h3>
    <div class="seg" id="typeSeg"><span data-t="nuc" class="${type === "nuc" ? "on" : ""}">Into a nuc</span><span data-t="hive" class="${type === "hive" ? "on" : ""}">Into a full hive</span></div>
    <div class="q"><div class="lbl">New colony name</div><input id="nm" value="${esc(type === "nuc" ? `Nuc ${nextNum("nuc")}` : `Hive ${nextNum("hive")}`)}"/></div>
    <div class="q"><div class="lbl">Frames moved</div>${chips("moved", ["2", "3", "4", "5"], "3", false, true)}</div>
    <div class="q"><div class="lbl">Queen plan</div>${chips("qplan", [["walkaway", "Walk-away (they raise one)"], ["cell", "Give a queen cell"], ["mated", "Mated queen"], ["oldq", "Old queen goes with the split"]], "walkaway", false, true)}</div>
    ${boxesBuilder(type, { depth: c.boxes[0].depth, frames: type === "nuc" ? 5 : c.boxes[0].frames })}
    ${monthOf(TODAY) >= 8 || monthOf(TODAY) <= 1 ? `<div class="note warn">It's ${MONTHS[monthOf(TODAY)]} — splits this late rarely build up enough to winter. Logging it anyway.</div>` : ""}
    <button class="btn" id="save">Make the split</button><button class="btn ghost" data-close>Cancel</button>`, s => {
    s.querySelectorAll("#typeSeg span").forEach(sp => sp.onclick = () => { type = sp.dataset.t; draw(); });
    s.querySelector("#save").onclick = () => {
      const plan = chipVal(s, "qplan"), name = s.querySelector("#nm").value.trim() || `Nuc ${nextNum("nuc")}`;
      const nq = plan === "mated" ? { year: yearOf(TODAY), source: "bought", marked: true, laying: true, since: TODAY }
        : plan === "oldq" ? Object.assign({}, c.queen) : { year: yearOf(TODAY), source: "raised", marked: false, laying: false, since: TODAY };
      if (plan === "oldq") c.queen = { year: yearOf(TODAY), source: "raised", marked: false, laying: false, since: TODAY };
      const nc = { id: uid("c"), name, yardId: c.yardId, type, status: "active", boxes: readBoxes(s, type),
        origin: { kind: "split", from: c.id, note: { walkaway: "Walk-away split", cell: "Split with a queen cell", mated: "Split with a mated queen", oldq: "Split took the old queen" }[plan] }, since: TODAY, queen: nq };
      db.colonies.push(nc);
      addEvent(nc.id, "split", `Split from ${c.name} (${chipVal(s, "moved")} frames, ${nc.origin.note.toLowerCase()})`);
      addEvent(c.id, "split", `Made ${name} from ${chipVal(s, "moved")} frames`);
      saveDb(); closeSheet(); toast(`${name} created`); nav("colony", { id: nc.id });
    };
    s.querySelector("[data-close]").onclick = closeSheet;
  });
  draw();
}

function combineSheet(c) {
  const targets = activeIn(c.yardId).filter(o => o.id !== c.id);
  const hint = needsFor(c).find(n => n.combineInto);
  pickColony(`Combine ${c.name} into…`, hint ? [col(hint.combineInto)].concat(targets.filter(t => t.id !== hint.combineInto)) : targets, t => {
    sheet(`<h3>${esc(c.name)} → ${esc(t.name)}</h3>
      <div class="q"><div class="lbl">Which queen stays?</div>${chips("keep", [["target", `${t.name}'s (${t.queen?.year || "?"})`], ["source", `${c.name}'s (${c.queen?.year || "?"})`], ["bees", "Let the bees decide"]], "target", false, true)}</div>
      <div class="note">Newspaper method: put ${esc(c.name)}'s box on top of ${esc(t.name)} with one sheet of newspaper between, a few slits cut in it. They chew through over 2–3 days and merge calmly.</div>
      ${nb("Remove the queen you don't want first, or both colonies may fight.")}
      <button class="btn" id="save">Combine</button><button class="btn ghost" data-close>Cancel</button>`, s => {
      s.querySelector("#save").onclick = () => {
        const keep = chipVal(s, "keep");
        if (keep === "source") t.queen = Object.assign({}, c.queen);
        c.status = "combined"; c.end = { date: TODAY, kind: "combined", into: t.id, note: `Queen kept: ${keep === "source" ? c.name + "'s" : keep === "target" ? t.name + "'s" : "bees' choice"}` };
        addEvent(c.id, "combine", `Combined into ${t.name}`); addEvent(t.id, "combine", `${c.name} combined in`);
        saveDb(); closeSheet(); toast(`${c.name} combined into ${t.name}`); replaceNav("colony", { id: t.id });
      };
      s.querySelector("[data-close]").onclick = closeSheet;
    });
  });
}

function promoteSheet(c) {
  sheet(`<h3>Move ${esc(c.name)} into a full hive</h3>
    <div class="q"><div class="lbl">New name (optional)</div><input id="nm" value="${esc(c.name)}"/></div>
    ${boxesBuilder("hive", { depth: c.boxes[0].depth, frames: 10, n: 1 })}
    <div class="small">History, queen and lineage carry over.</div>
    <button class="btn" id="save">Move into hive</button><button class="btn ghost" data-close>Cancel</button>`, s => {
    s.querySelector("#save").onclick = () => {
      const old = c.boxes[0]; c.type = "hive"; c.boxes = readBoxes(s, "hive"); const nm = s.querySelector("#nm").value.trim(); if (nm) c.name = nm;
      db.inventory["Nuc boxes"] = (db.inventory["Nuc boxes"] || 0) + 1;
      addEvent(c.id, "promote", `Moved from ${old.depth} nuc into ${describeSetup(c)}`); saveDb(); closeSheet(); rerender(); toast("Nuc box back in inventory");
    };
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}

function moveSheet(c) {
  sheet(`<h3>Move ${esc(c.name)}</h3><div class="q"><div class="lbl">To apiary</div>${chips("yard", db.yards.map(y => [y.id, y.name]), c.yardId, false, true)}</div>
    <div class="q"><div class="lbl">Why</div>${chips("why", ["Forage", "Pollination", "Too many in one apiary", "Sold / delivering", "Other"], "Forage", false, true)}</div>
    <div class="note">Move more than 3 miles or less than 3 feet, or foragers fly back to the old spot. Close the entrance the night before.</div>
    <button class="btn" id="save">Move</button><button class="btn ghost" data-close>Cancel</button>`, s => {
    s.querySelector("#save").onclick = () => { const to = chipVal(s, "yard"); if (to !== c.yardId) { addEvent(c.id, "move", `Moved ${yardOf(c.yardId).name} → ${yardOf(to).name} (${chipVal(s, "why")})`); c.yardId = to; saveDb(); } closeSheet(); rerender(); };
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}

function deadSheet(c) {
  sheet(`<h3>Dead-out · ${esc(c.name)}</h3>
    <div class="q"><div class="lbl">What you think happened (tap all)</div>${chips("cause", [["mites/virus", "Mites / viruses"], ["starvation", "Starvation"], ["queen failure", "Queen failure"], ["cold/moisture", "Cold / moisture"], ["robbing", "Robbed out"], ["absconded", "Absconded"], ["pesticide", "Pesticide"], ["animals", "Bears / skunks / mice"], ["unknown", "Don't know"]], [], true)}</div>
    <div class="note">Clues: dead bees head-first in cells with honey nearby = starvation. Spotty brood, bees with deformed wings, white mite poop in cells = mites. ${nb("Freeze the frames for 48 hours before reusing them, to kill wax moth eggs.")}</div>
    <div class="q"><div class="lbl">Note</div><textarea id="note"></textarea></div>
    <div class="toggle on" id="inv"><span class="sw"></span>Put the boxes back into inventory</div>
    <button class="btn danger" id="save">Mark as dead-out</button><button class="btn ghost" data-close>Cancel</button>`, s => {
    const inv = s.querySelector("#inv"); inv.onclick = () => inv.classList.toggle("on");
    s.querySelector("#save").onclick = () => {
      const cause = chipVals(s, "cause"); c.status = "dead"; c.end = { date: TODAY, kind: "dead", cause: cause.length ? cause : ["unknown"], note: s.querySelector("#note").value };
      if (inv.classList.contains("on")) c.boxes.forEach(b => { const k = b.depth === "deep" ? "Deep boxes" : b.depth === "medium" ? "Medium boxes" : "Shallow boxes"; db.inventory[k] = (db.inventory[k] || 0) + 1; });
      addEvent(c.id, "dead", `Dead-out: ${c.end.cause.join(", ")}`); saveDb(); closeSheet(); toast(`${c.name} marked as a dead-out`); rerender();
    };
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}

function soldSheet(c) {
  const orders = db.orders.filter(o => o.status !== "done");
  sheet(`<h3>Sold / given away · ${esc(c.name)}</h3>
    <div class="q"><div class="lbl">To</div><input id="buyer" placeholder="First name or 'club member' — no contact info"/></div>
    ${orders.length ? `<div class="q"><div class="lbl">Fills an order?</div>${chips("order", orders.map(o => [o.id, `${o.buyer} · ${o.depth}`]).concat([["", "No"]]), "", false, true)}</div>` : ""}
    <div class="q"><div class="lbl">Price ($)</div><input id="price" type="number" value="${c.type === "nuc" ? 185 : 300}"/></div>
    <button class="btn" id="save">Mark as sold</button><button class="btn ghost" data-close>Cancel</button>`, s => {
    s.querySelector("#save").onclick = () => {
      const oid = orders.length ? chipVal(s, "order") : "", o = db.orders.find(x => x.id === oid);
      const buyer = s.querySelector("#buyer").value.trim() || o?.buyer || "buyer", price = +s.querySelector("#price").value || 0;
      c.status = "sold"; c.end = { date: TODAY, kind: "sold", buyer, price };
      if (o) { o.filled = (o.filled || 0) + 1; if (o.filled >= o.nucs) o.status = "done"; }
      if (price) db.money.push({ date: TODAY, kind: "income", amount: price, note: `${c.name} sold`, colonyId: c.id });
      addEvent(c.id, "sold", `Sold to ${buyer}${price ? ` for $${price}` : ""}`); saveDb(); closeSheet(); toast(`${c.name} sold`); rerender();
    };
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}

function miteSheet(c, after) {
  sheet(`<h3>Mite count · ${esc(c.name)}</h3>
    <div class="q"><div class="lbl">Method</div>${chips("method", [["wash", "Alcohol wash"], ["roll", "Sugar roll"], ["board", "Sticky board (24–72 h)"]], "wash", false, true)}</div>
    <div class="row"><div class="grow"><div class="lbl">Mites counted</div><input id="cnt" type="number" min="0" value=""/></div><div class="grow"><div class="lbl">Bees (≈ ½ cup = 300)</div><input id="smp" type="number" value="300"/></div></div>
    <label class="btn ghost" style="text-align:center">📷 Photo of the jar or board (to count from)<input type="file" id="photo" accept="image/*" capture="environment" style="display:none"/></label>
    <div id="photoPrev"></div><div class="small">Zoom in on the photo to count. The app doesn't count mites for you.</div>
    ${nb("Threshold in fall is about 3 mites per 300 bees (1%). Above that, treat.")}
    <button class="btn" id="save">Save count</button><button class="btn ghost" data-close>Cancel</button>`, s => {
    let photoBlob = null;
    s.querySelector("#photo").onchange = async e => { const f = e.target.files[0]; if (!f) return; photoBlob = await shrinkPhoto(f, 2000, 0.8); s.querySelector("#photoPrev").innerHTML = `<img class="shot" src="${URL.createObjectURL(photoBlob)}"/>`; };
    s.querySelector("#save").onclick = () => {
      const n = +s.querySelector("#cnt").value, smp = +s.querySelector("#smp").value || 300;
      if (s.querySelector("#cnt").value === "") { toast("Enter a count"); return; }
      const rec = { colonyId: c.id, date: TODAY, method: chipVal(s, "method"), count: n, sample: smp };
      if (photoBlob) { rec.photo = `m-${uid("")}`; photoPut(rec.photo, photoBlob); }
      db.mites.push(rec);
      const open = db.predLog.filter(p => p.colonyId === c.id && p.kind === "mites" && p.outcome === "open").map(p => p.id); scorePreds(c.id);
      const hit = db.predLog.find(p => open.includes(p.id) && p.outcome !== "open"); saveDb(); closeSheet();
      if (hit) setTimeout(() => toast(`Prediction checked: ${hit.outcome === "true" ? "✅ came true" : "❌ didn't happen"}`), 2300);
      toast(n / smp >= 0.01 ? `${n} in ${smp} — over threshold. See what to do.` : `${n} in ${smp} — under threshold`); after ? after() : rerender();
    };
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}

function feedSheet(c, after) {
  const hiNow = todayWx(c.yardId)?.hi ?? 60;
  sheet(`<h3>Feeding · ${esc(c.name)}</h3>
    <div class="q"><div class="lbl">What</div>${chips("kind", ["2:1 syrup", "1:1 syrup", "Fondant", "Candy board", "Dry sugar", "Pollen patty"], hiNow < 50 ? "Fondant" : "2:1 syrup", false, true)}</div>
    <div class="q"><div class="lbl">How much</div>${chips("amt", ["½ gal", "1 gal", "2 gal", "2 lb", "4 lb", "1 patty"], c.type === "nuc" ? "½ gal" : "1 gal", false, true)}</div>
    ${hiNow < 50 ? `<div class="note warn">${hiNow}°F — bees take syrup poorly below ~50°F. Solid feed works better now.</div>` : ""}
    ${nb("1:1 (spring) stimulates brood; 2:1 (fall) is stored for winter.")}
    <button class="btn" id="save">Save</button><button class="btn ghost" data-close>Cancel</button>`, s => {
    s.querySelector("#save").onclick = () => {
      const kind = chipVal(s, "kind"), amount = chipVal(s, "amt");
      db.feeds.push({ colonyId: c.id, date: TODAY, kind, amount });
      const gal = { "½ gal": 0.5, "1 gal": 1, "2 gal": 2 }[amount], lb = { "2 lb": 2, "4 lb": 4 }[amount];
      if (kind.includes("syrup") && gal) db.inventory["Sugar (lb)"] = Math.max(0, (db.inventory["Sugar (lb)"] || 0) - Math.round(gal * (kind === "2:1 syrup" ? 10.7 : 6.7)));
      if ((kind === "Fondant" || kind === "Candy board") && lb) db.inventory["Fondant (lb)"] = Math.max(0, (db.inventory["Fondant (lb)"] || 0) - lb);
      saveDb(); closeSheet(); toast("Feeding logged · inventory updated"); after ? after() : rerender();
    };
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}

function treatSheet(c, after) {
  const fc = forecastFor(c.yardId).slice(0, 7), last = treatsOf(c.id).slice(-1)[0], brood = lastVisit(c.id)?.broodFrames;
  const draw = prod => {
    const t = TREATMENTS[prod];
    let wx = "";
    if (t.temp && !fc.length) wx = `<div class="note">No forecast yet — check that highs stay ${t.temp[0]}–${t.temp[1]}°F for the next week.</div>`;
    else if (t.temp) { const bad = fc.filter(d => d.hi < t.temp[0] || d.hi > t.temp[1]); wx = bad.length ? `<div class="note warn">Next 7 days: ${bad.length} day(s) outside ${t.temp[0]}–${t.temp[1]}°F (${bad.map(d => DOW[parseD(d.date).getDay()] + " " + d.hi + "°").join(", ")}). It may not work well.</div>` : `<div class="note ok">Forecast stays within ${t.temp[0]}–${t.temp[1]}°F. 👍</div>`; }
    if (prod.startsWith("Oxalic")) wx = (brood ?? 4) <= 2 ? `<div class="note ok">Brood is low (${brood ?? "?"} frames) — good time for oxalic.</div>` : `<div class="note warn">Brood on ${brood ?? "?"} frames — oxalic misses mites under cappings. Best when broodless.</div>`;
    const ctry = db.settings.country || "US", reg = TREAT_REG[prod]?.[ctry] || "check";
    const regLine = { yes: `<div class="note ok">✓ Registered for use in ${COUNTRIES[ctry]}.${ctry === "US" ? " A few states keep their own list — check yours." : ""}</div>`,
      some: `<div class="note warn">Registered in some ${COUNTRIES[ctry]} countries, not all. Check your national list.</div>`,
      check: `<div class="note warn">Not sure it's registered in ${COUNTRIES[ctry]} — check the official list before using.</div>`,
      no: `<div class="note risk">Not on the registered list for ${COUNTRIES[ctry]} in this app's data. Don't use it unless your authority says it's allowed.</div>` }[reg];
    sheet(`<h3>Treatment · ${esc(c.name)}</h3>
      <div class="q"><div class="lbl">Product <span class="small">· ${COUNTRIES[ctry]}</span></div>${chips("prod", Object.keys(TREATMENTS).map(k => [k, `${k}${{ yes: "", some: " ·?", check: " ·?", no: " ✕" }[TREAT_REG[k]?.[ctry] || "check"]}`]), prod, false, true)}</div>
      <div class="small">${esc(t.note)}</div>${regLine}${wx}
      ${last && last.product === prod ? `<div class="note warn">Last treatment was also ${esc(prod)} (${fmtShort(last.start)}). Rotating products slows resistance.</div>` : ""}
      ${t.days ? `<div class="card small" style="color:var(--ink)">Starts ${fmtD(TODAY)} → <b>remove by ${fmtD(addDays(TODAY, t.days))}</b>. You'll get a reminder.</div>` : ""}
      <div class="small">${esc(LABEL_NOTE)} The registration list here is a starting point, not official — confirm with your state or national list. Country is set in More.</div>
      <button class="btn" id="save">Start treatment</button><button class="btn ghost" data-close>Cancel</button>`, s => {
      s.querySelectorAll('[data-key="prod"] .chip').forEach(ch => ch.addEventListener("click", () => setTimeout(() => draw(ch.dataset.v), 0)));
      s.querySelector("#save").onclick = () => {
        db.treatments.push({ id: uid("t"), colonyId: c.id, product: prod, start: TODAY, removeBy: t.days ? addDays(TODAY, t.days) : null, done: !t.days });
        const invK = prod.startsWith("Oxalic") ? "Oxalic acid (doses)" : prod === "Apivar" ? "Apivar strips" : null;
        if (invK) db.inventory[invK] = Math.max(0, (db.inventory[invK] || 0) - (prod === "Apivar" ? 2 : 1));
        saveDb(); closeSheet(); toast(t.days ? `Reminder set: remove by ${fmtShort(addDays(TODAY, t.days))}` : "Treatment logged"); after ? after() : rerender();
      };
      s.querySelector("[data-close]").onclick = closeSheet;
    });
  };
  draw((brood ?? 4) <= 3 ? "Oxalic vapor" : "Formic Pro");
}

/* A plain-text summary you send yourself (text, email, AirDrop) — through the phone's own share sheet */
function colonySummary(c) {
  const lv = lastVisit(c.id), m = mitesOf(c.id).slice(-1)[0], st = storesNow(c), ns = needsFor(c).filter(n => n.level !== "ok");
  const lines = [`${c.name} — ${describeSetup(c)}`, `Queen: ${c.queen?.year || "year unknown"}${c.queen?.marked ? ", marked" : ""}${c.queen?.laying === false ? ", not laying" : ""}`];
  if (lv) lines.push(`Last visit ${fmtD(lv.date)}: ${[lv.queen === "seen" ? "queen seen" : lv.eggs ? "eggs seen" : null, lv.broodFrames != null ? `brood ${lv.broodFrames} frames` : null, lv.storesLb != null ? `~${lv.storesLb} lb stores` : null, lv.note].filter(Boolean).join(", ")}`);
  if (m) lines.push(`Mites: ${m.count} in ${m.sample} (${m.method}) on ${fmtD(m.date)}`);
  if (st) lines.push(`Stores ~${st.lb} lb; winter target ~${winterTarget(c)} lb`);
  treatsOf(c.id).slice(-2).forEach(t => lines.push(`Treatment: ${t.product} ${fmtShort(t.start)}${t.removeBy ? `, remove by ${fmtShort(t.removeBy)}` : ""}`));
  if (ns.length) { lines.push("", "The app flags:"); ns.slice(0, 5).forEach(n => lines.push(`- ${n.title}${n.action ? ` → ${n.action}` : ""}`)); }
  return lines.join("\n");
}
function shareSheet(c) {
  const text = colonySummary(c);
  sheet(`<h3>Send a summary of ${esc(c.name)}</h3>
    <div class="small">For a mentor or club friend. No apiary location is included. Edit it first if you like.</div>
    <textarea id="txt" rows="10">${esc(text)}</textarea>
    <button class="btn" id="go">${navigator.share ? "Share…" : "Copy text"}</button><button class="btn ghost" data-close>Close</button>`, s => {
    s.querySelector("#go").onclick = async () => {
      const t = s.querySelector("#txt").value;
      try {
        if (navigator.share) { await navigator.share({ title: c.name, text: t }); }
        else { await navigator.clipboard.writeText(t); toast("Copied — paste it into a message"); }
        closeSheet();
      } catch (e) { /* user cancelled the share sheet */ }
    };
    s.querySelector("[data-close]").onclick = closeSheet;
  });
}

/* ---------- screen ---------- */
let colonyTab = "overview", lastColonyId = null;
screen("colony", {
  tab: "yard", title: p => col(p.id)?.name || "Colony",
  fab: p => col(p.id)?.status === "active" ? { label: "📷 Start a visit", onclick: () => nav("visitStart", { id: p.id }) } : null,
  render(p) {
    const c = col(p.id); if (!c) return `<p>Not found.</p>`;
    if (lastColonyId !== c.id) { colonyTab = "overview"; lastColonyId = c.id; }
    const active = c.status === "active";
    const tabs = [["overview", "Overview"], ["logs", "Logs"], ["trends", "Trends"], ["family", "Family"]];
    let body = "";
    if (colonyTab === "overview") {
      const ns = needsFor(c), cb = active ? comeBack(c) : null, st = storesNow(c);
      const tile = ([k, ic, l]) => `<button class="atile" data-act="${k}"><span class="aic" aria-hidden="true">${ic}</span>${l}</button>`;
      const group = (title, items) => `<div class="actgroup"><div class="lbl">${title}</div><div class="actgrid">${items.map(tile).join("")}</div></div>`;
      const actions = active ? `<h2>Do something</h2>
          ${group("Record", [["mite", "🔬", "Mite count"], ["feed", "🍯", "Feed"], ["treat", "💊", "Treat"]])}
          ${aiOn() ? group("Ask the AI", [["aiplan", "🤖", "Plan next steps"], ["ask", "💬", "Ask a question"]]) : ""}
          ${group("Change the colony", [["split", "✂️", "Split"], ["combine", "🔗", "Combine"], ["move", "🚚", "Move"]])}
          ${group("Share", [["share", "📤", "Send a summary"], ["report", "🖨", "Report"]])}
          ${group("End", [["sold", "🤝", "Sold"], ["dead", "🕯", "Dead-out"]])}` : "";
      const expect = active ? `<h2>What to expect</h2>${ns.map(n => needCard(n, true)).join("") || `<div class="small">Nothing flagged.</div>`}
          ${cb ? `<div class="comeback"><div class="small">Come back</div><div class="big">${fmtD(cb.date)}</div><div class="small">${esc(cb.why)}</div></div>` : ""}` : `<div class="note ${c.status === "dead" ? "risk" : ""}">${esc({ dead: "Dead-out", sold: "Sold", combined: "Combined" }[c.status])} on ${fmtD(c.end.date)}. ${esc(c.end.cause ? "Cause: " + c.end.cause.join(", ") : c.end.into ? "Into " + (col(c.end.into)?.name || "") : c.end.buyer ? "To " + c.end.buyer : "")}</div>`;
      body = `${expect}
        ${actions}
        <h2>The colony</h2>
        <div class="card"><div class="between"><b>Setup</b><span class="small">tap a box to change it</span></div>
          <div class="stack"><div class="stand"></div>${c.boxes.map((b, i) => `<div class="boxv ${b.depth}" data-box="${i}">${b.depth} · ${b.frames}f ${b.role === "super" ? "· super" : ""} · ~${boxLb(b, 0.9)} lb</div>`).join("")}<div class="lid"></div></div>
          ${active ? `<div class="row" style="gap:6px"><button class="btn sm ghost" id="addBox">+ Box</button>${c.type === "nuc" ? `<button class="btn sm ghost" id="promote">Move into a full hive</button>` : ""}</div>` : ""}
          ${Math.max(...c.boxes.map(b => boxLb(b, 0.9))) > 50 ? `<div class="small" style="margin-top:6px">⚠️ Heaviest box ~${Math.max(...c.boxes.map(b => boxLb(b, 0.9)))} lb when full — get help or lift frames out first.</div>` : ""}
          ${st ? `<div class="small" style="margin-top:4px">Stores now ~${st.lb} lb (${fmtShort(st.date)}) · winter target ~${winterTarget(c)} lb</div>` : ""}</div>
        <div class="card tap" id="queenCard"><div class="between"><b>Queen</b><span class="chev">›</span></div><div style="margin-top:4px;font-size:14px">${queenBadge(c.queen)}</div>
          <div class="small">${c.queen?.source ? "From: " + esc(c.queen.source) : ""}${c.queen?.since ? ` · since ${fmtShort(c.queen.since)}` : ""}</div></div>

        <div class="small" style="margin-top:12px">${esc(yardOf(c.yardId)?.name)} · since ${fmtD(c.since, false)} · from: ${esc(c.origin?.kind)}${c.origin?.from ? ` (${esc(col(c.origin.from)?.name)})` : ""}</div>`;
    } else if (colonyTab === "logs") {
      const items = [
        ...visitsOf(c.id).map(v => ({ d: v.date, ic: "📋", t: `${VISIT_TYPES[v.type]?.label || "Visit"}${v.storesLb != null ? ` · ~${v.storesLb} lb` : ""}${v.broodFrames != null ? ` · brood ${v.broodFrames}f` : ""}${v.note ? " · " + v.note : ""}`, vid: v.id })),
        ...mitesOf(c.id).map(m => ({ d: m.date, ic: "🔬", t: `${m.count} mites / ${m.sample} (${m.method})`, photo: m.photo })),
        ...feedsOf(c.id).map(f => ({ d: f.date, ic: "🍯", t: `${f.kind} · ${f.amount}` })),
        ...treatsOf(c.id).map(t => ({ d: t.start, ic: "💊", t: `${t.product}${t.removeBy ? ` · remove by ${fmtShort(t.removeBy)}` : ""}${t.done ? (t.removeBy ? " · removed" : "") : " · in"}`, tid: !t.done && t.removeBy ? t.id : null })),
        ...db.harvests.filter(h => h.colonyId === c.id).map(h => ({ d: h.date, ic: "🫙", t: `Harvest ${h.lb} lb (${h.supers} supers) · batch ${h.batch}` })),
        ...eventsOf(c.id).map(e => ({ d: e.date, ic: "•", t: e.text }))
      ].sort((a, b) => b.d.localeCompare(a.d));
      body = `<div class="card log">${items.map(i => `<div class="ln"><span style="width:20px">${i.ic}</span><span class="fno" style="width:48px">${fmtShort(i.d)}</span><span class="grow">${esc(i.t)}</span>${i.photo ? `<img data-photo="${i.photo}" class="mini"/>` : ""}${i.tid ? `<button class="btn sm" data-remove="${i.tid}">Removed</button>` : ""}${i.vid ? `<button class="link" data-nav="visitRecord" data-p='{"vid":"${i.vid}"}'>›</button>` : ""}</div>`).join("") || `<span class="small">Nothing logged yet.</span>`}</div>
        <button class="btn ghost" id="exportOne">Export this colony (CSV)</button>`;
    } else if (colonyTab === "trends") {
      const st = storesNow(c), ss = storesSeries(c.id), fr = firstFreeze(forecastFor(c.yardId));
      const proj = st && st.rate ? [[fr || addDays(TODAY, 14), st.at(fr || addDays(TODAY, 14))], [addDays(TODAY, 28), st.at(addDays(TODAY, 28))]] : [];
      const ms = mitesOf(c.id).map(m => [m.date, +(m.count / m.sample * 300).toFixed(1)]);
      body = `<div class="card"><b>Stores (est. lb)</b>${chart(ss.slice(-6), { proj, target: winterTarget(c), tlabel: "winter target" })}<div class="legend"><span>dashed = where it's heading</span></div></div>
        <div class="card"><b>Brood (frames)</b>${chart(broodSeries(c.id).slice(-6), { max: 10 })}<div class="small">${monthOf(TODAY) >= 8 ? "Tapering for winter is normal." : "Spring build-up: more frames each visit is good."}</div></div>
        <div class="card"><b>Mites (per 300 bees)</b>${chart(ms.slice(-6), { target: 3, tlabel: "treat at", max: Math.max(8, ...ms.map(m => m[1])) })}</div>
        <div class="card"><b>Frames over time</b> <span class="small">each box is a block, bottom box on the left</span>
          ${visitsOf(c.id).filter(x => x.frames && Object.keys(x.frames).length).slice(-6).reverse().map(x => frameStrip(x, c)).join("") || `<div class="small">Full inspections build this up.</div>`}
          <div class="legend"><span><i style="background:#a77840;height:8px"></i>brood</span><span><i style="background:#d4951c;height:8px"></i>honey</span><span><i style="background:#d8c9a8;height:8px"></i>empty</span></div>
          ${nb("Brood should move up and out in spring and shrink to the middle of the bottom box by late fall, with honey above and around it.")}</div>`;
    } else {
      const root = (x => { while (x.origin?.from && col(x.origin.from)) x = col(x.origin.from); return x; })(c);
      const kids = id => db.colonies.filter(k => k.origin?.from === id);
      const node = (x, d) => `<div class="node" style="--d:${d}">${x.id === c.id ? "<b>" : ""}${d ? "└ " : ""}${esc(x.name)}${x.id === c.id ? "</b>" : ""} <span class="small">${esc(x.origin?.kind || "")} · ${x.status === "active" ? "active" : x.status}</span></div>` + kids(x.id).map(k => node(k, d + 1)).join("");
      body = `<div class="card tree">${node(root, 0)}</div><div class="small">Splits record their parent, so you can see which lines do well and raise queens from your best stock.</div>`;
    }
    return `<div class="row"><h1 class="grow">${esc(c.name)}</h1>${active ? `<button class="pen" id="rename" aria-label="Rename ${esc(c.name)}">✎</button>` : ""}</div>
      <p class="sub">${esc(describeSetup(c))} · ${esc(yardOf(c.yardId)?.name)}</p>
      <div class="tabs2" role="tablist">${tabs.map(([k, l]) => `<span data-ct="${k}" class="${k === colonyTab ? "on" : ""}" role="tab" tabindex="0" aria-selected="${k === colonyTab}">${l}</span>`).join("")}</div>${body}`;
  },
  mount(p, v) {
    const c = col(p.id); if (!c) return;
    v.querySelectorAll("[data-ct]").forEach(el => el.onclick = () => { colonyTab = el.dataset.ct; rerender(); });
    v.querySelector("#rename")?.addEventListener("click", () => renameSheet(c));
    v.querySelectorAll("[data-box]").forEach(el => el.onclick = () => c.status === "active" && boxSheet(c, +el.dataset.box));
    v.querySelector("#addBox")?.addEventListener("click", () => addBox(c));
    v.querySelector("#promote")?.addEventListener("click", () => promoteSheet(c));
    v.querySelector("#queenCard")?.addEventListener("click", () => queenSheet(c));
    v.querySelector("#exportOne")?.addEventListener("click", () => csvDownload(`${c.name}.csv`, [["date", "kind", "detail"], ...visitsOf(c.id).map(x => [x.date, "visit", `${x.type} stores ${x.storesLb ?? ""} brood ${x.broodFrames ?? ""} ${x.note || ""}`]), ...mitesOf(c.id).map(m => [m.date, "mites", `${m.count}/${m.sample} ${m.method}`]), ...treatsOf(c.id).map(t => [t.start, "treatment", `${t.product} remove by ${t.removeBy || ""}`]), ...feedsOf(c.id).map(f => [f.date, "feed", `${f.kind} ${f.amount}`])]));
    v.querySelectorAll("[data-remove]").forEach(b => b.onclick = () => { const t = db.treatments.find(x => x.id === b.dataset.remove); t.done = true; t.removed = TODAY; addEvent(c.id, "treat", `${t.product} removed`); saveDb(); toast("Strips removed · reminder cleared"); rerender(); });
    const acts = { mite: miteSheet, feed: feedSheet, treat: treatSheet, split: splitSheet, combine: combineSheet, move: moveSheet, share: shareSheet, aiplan: adviseSheet, ask: askSheet, report: x => nav("report", { id: x.id }), sold: soldSheet, dead: deadSheet };
    v.querySelectorAll("[data-act]").forEach(el => el.onclick = () => acts[el.dataset.act](c));
  }
});

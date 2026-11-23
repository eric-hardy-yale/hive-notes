/* Learn: explain mode, what-am-I-looking-at, glossary, first-year path, diseases & pests, help */

const LOOKS = [
  { k: "cbrood", t: "Capped brood", c: ["#a77840", "#b98b52"], d: "Tan/brown, slightly domed cappings in the middle of the frame. Baby bees pupating.", vs: "Capped honey is whiter and flatter, usually at the top corners." },
  { k: "choney", t: "Capped honey", c: ["#f1e3bd", "#d4951c"], d: "White or pale wax cappings, flat, usually along the top of frames.", vs: "Capped brood is darker and domed." },
  { k: "drone", t: "Drone brood", c: ["#a77840", "#8a5f2c"], d: "Bullet-shaped, raised cappings, often on frame edges. Male bees.", vs: "Lots of drone brood in the middle + scattered = possible drone-laying queen or laying workers." },
  { k: "swarm", t: "Swarm cells", c: ["#e9c77d", "#b98b52"], d: "Peanut-shaped cells hanging from the BOTTOM edge of frames. Colony plans to swarm.", vs: "Supersedure cells are on the face of the comb (replacing the queen)." },
  { k: "super", t: "Supersedure cells", c: ["#e9c77d", "#a77840"], d: "1–3 queen cells on the FACE of the comb. Colony is replacing its queen. Usually leave them.", vs: "Emergency cells: many, on the face, after sudden queen loss." },
  { k: "pollen", t: "Pollen", c: ["#f59e0b", "#84cc16"], d: "Packed cells of yellow, orange, grey or green near the brood. Protein for brood.", vs: "Not disease — bright mixed colors are normal." },
  { k: "chalk", t: "Chalkbrood", c: ["#f5f5f4", "#9ca3af"], d: "Hard white/grey 'mummies' in cells or at the entrance. A fungus; stress-related.", vs: "Not AFB. Often clears with a strong colony and good ventilation." },
  { k: "varroa", t: "Varroa on a bee", c: ["#7c2d12", "#e9c77d"], d: "Reddish-brown oval, sesame-seed size, on a bee's back or in brood cells.", vs: "Bee lice (rare) are rounder with legs visible from above." }
];
const GLOSSARY = [
  ["Nuc", "Nucleus colony — a small colony, usually 4–6 frames, used to start or sell colonies."],
  ["Deep / medium", "Box heights. Deeps hold more (and weigh ~85 lb full); mediums ~58 lb full. Frames don't swap between them."],
  ["Brood", "Eggs, larvae and pupae. 'Brood nest' = where they're raised."],
  ["Super", "A box added on top for honey storage."],
  ["Heft", "Lifting the back of a box an inch to judge how much honey is inside."],
  ["Walk-away split", "Splitting a colony and letting the queenless half raise its own queen from eggs."],
  ["Supersedure", "Bees replacing an old or failing queen without swarming."],
  ["Dearth", "A period with little nectar. Bees rob each other."],
  ["Flow", "When plants are producing lots of nectar."],
  ["Mite wash", "Shaking ~300 bees in alcohol to count varroa mites."],
  ["Fondant", "Solid sugar fed in cold weather when bees can't take syrup."],
  ["Queen excluder", "A grid that keeps the queen out of honey supers."],
  ["Laying workers", "Workers that lay unfertilized (drone) eggs after a long queenless spell."],
  ["Bearding", "Bees clustering on the front of the hive on hot evenings."],
  ["Dead-out", "A colony that died, usually found in late winter."]
];
const FIRST_YEAR = [
  ["Apr", "Install package or nuc. Feed 1:1. Check the queen is laying after a week."],
  ["May", "Inspect every 7–10 days. Learn brood vs honey vs pollen. Add the second box when 7 of 10 frames are drawn."],
  ["Jun", "First mite count. Watch for swarm cells. Don't expect much honey year one."],
  ["Jul", "Second mite count. Add a super only if the brood boxes are full."],
  ["Aug", "Treat for mites if over threshold — August matters most for winter."],
  ["Sep", "Feed 2:1 if light. Reduce entrance (robbing)."],
  ["Oct", "Mouse guard. Heft. Feed before the first freeze."],
  ["Nov–Feb", "Leave them alone. Heft monthly, fondant if light. Oxalic when broodless."],
  ["Mar", "First quick look on a warm day. Emergency fondant if light. Plan for splits."]
];
const DISEASES = [
  { t: "American foulbrood (AFB)", s: "Sunken, greasy, perforated cappings; spotty brood; foul smell; brown ropy larvae.", look: "EFB, PMS", confirm: "Rope test: matchstick into a sunken cell, pull slowly — ropes 2 cm+. Lab test or field kit.", act: "Reportable. Don't move frames or equipment. Call your state apiarist.", lvl: "risk" },
  { t: "European foulbrood (EFB)", s: "Twisted, melted-looking yellow/brown larvae, before capping; sour smell.", look: "AFB, PMS", confirm: "Doesn't rope like AFB. Field test kit; send a sample.", act: "Requeen / brood break helps. Some states regulate it — check.", lvl: "warn" },
  { t: "Parasitic mite syndrome (PMS)", s: "Spotty brood, chewed cappings, sick larvae, lots of mites, deformed wings.", look: "AFB, EFB", confirm: "Mite wash will be high. No ropiness.", act: "Treat mites now; may need to combine.", lvl: "warn" },
  { t: "Deformed wing virus", s: "Young bees with crumpled, stubby wings.", look: "—", confirm: "Comes with high mites.", act: "Treat mites; the virus fades as mites drop.", lvl: "warn" },
  { t: "Sacbrood", s: "Larvae like a fluid-filled sac, head raised ('Chinese slipper').", look: "EFB", confirm: "Sac lifts out whole with tweezers.", act: "Usually clears on its own; requeen if persistent.", lvl: "info" },
  { t: "Chalkbrood", s: "White/grey chalky mummies.", look: "—", confirm: "Mummies are hard and rattle in cells.", act: "Improve ventilation; strong colony; requeen if heavy.", lvl: "info" },
  { t: "Small hive beetle", s: "Fast dark beetles running from light; slimed, fermenting comb.", look: "—", confirm: "Count beetles under the lid / in traps.", act: "Traps, strong colonies, no extra space they can't guard.", lvl: "warn" },
  { t: "Wax moth", s: "Webbing, tunnels, cocoons in stored or weak-colony comb.", look: "—", confirm: "Silk webbing is unmistakable.", act: "Freeze comb 48 h; store in light & airflow; keep colonies strong.", lvl: "info" }
];

let learnTab = "look", lookSel = null;
screen("learn", {
  tab: "learn", title: "Learn",
  render() {
    const tabs = [["look", "What is this?"], ["first", "First year"], ["disease", "Diseases & pests"], ["words", "Words"], ["help", "Get help"]];
    let body = "";
    if (learnTab === "look") {
      const L = LOOKS.find(x => x.k === lookSel);
      body = `<div class="small">Tap the one that looks like what you're seeing.</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">${LOOKS.map(x => `<div class="card tap" data-look="${x.k}" style="padding:6px;margin:0;${x.k === lookSel ? "border-color:var(--honey)" : ""}"><div class="photo" style="height:70px;background:radial-gradient(circle at 30% 40%, ${x.c[0]} 0 30%, transparent 31%), radial-gradient(circle at 70% 60%, ${x.c[0]} 0 25%, transparent 26%), ${x.c[1]}"></div><div style="font-size:13px;font-weight:600">${x.t}</div></div>`).join("")}</div>
        ${L ? `<div class="card" style="margin-top:10px"><b>${L.t}</b><div style="font-size:14px;margin-top:4px">${esc(L.d)}</div><div class="small" style="margin-top:6px">Don't confuse with: ${esc(L.vs)}</div></div>` : ""}`;
    } else if (learnTab === "first") {
      body = FIRST_YEAR.map(([m, t]) => `<div class="card"><div class="row"><b style="width:64px">${m}</b><span style="font-size:14px">${esc(t)}</span></div></div>`).join("");
    } else if (learnTab === "disease") {
      body = `<div class="note risk">The app flags possibilities — it never diagnoses. Anything that looks like AFB: stop, don't move equipment, call your state apiarist${db.settings.registration.inspector ? ` (${esc(db.settings.registration.inspector)})` : ""}.</div>` +
        DISEASES.map(d => `<div class="card expect ${d.lvl}"><b>${esc(d.t)}</b><div class="small" style="margin-top:4px">${esc(d.s)}</div><button class="whybtn">Confirm & what to do</button><div class="why"><b>Looks like:</b> ${esc(d.look)}<br><b>Confirm:</b> ${esc(d.confirm)}<br><b>Do:</b> ${esc(d.act)}</div></div>`).join("");
    } else if (learnTab === "words") {
      body = `<input id="gq" placeholder="Search words"/><div id="gl">${GLOSSARY.map(([w, d]) => `<div class="card" data-w="${esc(w.toLowerCase())}"><b>${esc(w)}</b><div class="small">${esc(d)}</div></div>`).join("")}</div>`;
    } else {
      body = `<div class="card"><b>Your mentor or club</b><div class="small">Send a colony summary from its page (📤 Send a summary) for a second opinion.</div></div>
        <div class="card"><b>State apiarist / inspector</b><div class="small">${esc(db.settings.registration.inspector || "Add yours under Business → Paperwork")}${db.settings.registration.lastInspection ? ` · last inspection ${fmtD(db.settings.registration.lastInspection, false)}` : ""}</div></div>
        <div class="card"><b>Extension office</b><div class="small">Free ID help and local classes. Add yours in More.</div></div>`;
    }
    return `<h1>Learn</h1>${toggle("newMode", "Explain it like I'm new (across the app)")}
      <div class="tabs2">${tabs.map(([k, l]) => `<span data-lt="${k}" class="${k === learnTab ? "on" : ""}">${l}</span>`).join("")}</div>${body}`;
  },
  mount(p, v) {
    v.querySelectorAll("[data-lt]").forEach(el => el.onclick = () => { learnTab = el.dataset.lt; rerender(); });
    v.querySelectorAll("[data-look]").forEach(el => el.onclick = () => { lookSel = el.dataset.look; rerender(); });
    const gq = v.querySelector("#gq"); if (gq) gq.oninput = () => v.querySelectorAll("[data-w]").forEach(c => c.style.display = c.dataset.w.includes(gq.value.toLowerCase()) || c.textContent.toLowerCase().includes(gq.value.toLowerCase()) ? "" : "none");
  }
});

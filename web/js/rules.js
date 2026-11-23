/* Prediction rules: turn records + forecast into "what to expect" and "what to do next".
   Simple, readable rules of thumb — every result carries its reasons. */

const TREATMENTS = {
  "Apivar":          { days: 56, min: 42, temp: null, note: "Strips stay 42–56 days, then come out. Supers off." },
  "Formic Pro":      { days: 14, temp: [50, 85], note: "Daytime highs 50–85°F during treatment. Can stay on with supers." },
  "Apiguard":        { days: 42, temp: [60, 105], note: "Needs highs of 60°F+ to work. Two trays over 4–6 weeks." },
  "Oxalic vapor":    { days: 0, note: "Works best when there's little or no capped brood (late fall, winter)." },
  "Oxalic dribble":  { days: 0, note: "Once, when broodless. Hard on bees if repeated." },
  "HopGuard 3":      { days: 30, note: "Strips per label; works on phoretic mites." }
};
const LABEL_NOTE = "Always follow the product label and your state's rules.";

function firstFreeze(fc) { const d = fc.find(x => x.lo <= 32); return d ? d.date : null; }
function goodDay(d) { return d.hi >= 50 && !d.rain && d.wind < 15; }

function openAdvice(day) {
  if (!day) return { level: "info", text: "No forecast yet — it loads once this apiary has a location and the phone has signal.", short: "No forecast yet", window: null };
  const win = fb => day.hours?.length ? day.window : fb;   // with hourly data, no window means no good hours left
  if (day.past) return { level: "info", text: `Too late to open today — it's getting dark${day.sunset ? ` (sunset ${day.sunset})` : ""}. Check the coming days.`, short: "Done for today", window: null };
  if (day.rain) return { level: "risk", text: "Rain — don't open. Bees are home and defensive; brood chills.", short: "Don't open", window: null };
  if (day.wind >= 15) return { level: "warn", text: `Wind ${day.wind} mph — bees get defensive and frames chill. Quick look at most.`, short: "Windy", window: win("Calmest part of the day") };
  if (day.hi >= 57) return { level: "ok", text: `${day.hi}°F, wind ${day.wind} mph. Foragers are out, so the box is calmer.`, short: "Good to open", window: win(day.hi >= 70 ? "10 AM–4 PM (best 11–2, while foragers are out)" : "11 AM–3 PM (warmest hours)") };
  if (day.hi >= 50) return { level: "warn", text: `Quick look only at ${day.hi}°F — keep frames out briefly, don't break the cluster.`, short: "Quick look only", window: win("About 1–3 PM, the warmest part of the day") };
  return { level: "risk", text: `${day.hi}°F is too cold to pull frames. Heft, check the entrance, feed fondant if light.`, short: "Heft only", window: null };
}

function storesNow(c) {
  const s = storesSeries(c.id);
  if (!s.length) return null;
  const [lastD, lastLb] = s[s.length - 1];
  let rate = 0;
  const recent = s.filter(p => daysBetween(p[0], lastD) <= 14);
  if (recent.length >= 3) rate = (lastLb - recent[0][1]) / Math.max(1, daysBetween(recent[0][0], lastD));   // daily scale readings: use the 2-week slope
  else if (s.length >= 2) { const [pD, pLb] = s[s.length - 2]; rate = (lastLb - pLb) / Math.max(1, daysBetween(pD, lastD)); }
  return { date: lastD, lb: lastLb, rate, at: d => Math.round(lastLb + rate * daysBetween(lastD, d)) };
}

/* All needs for one colony. level: risk | warn | ok | info */
function needsFor(c) {
  if (c.status !== "active") return [];
  const out = [], fc = forecastFor(c.yardId), freeze = firstFreeze(fc), m = seasonMonth();
  const lv = lastVisit(c.id), st = storesNow(c), target = winterTarget(c);
  const isFall = m >= 8 && m <= 10, isWinter = m === 11 || m <= 1, isSpring = m >= 2 && m <= 4;

  // --- stores / feeding ---
  if (st && (isFall || isWinter || c.type === "nuc")) {
    const checkDate = freeze || addDays(TODAY, 14);
    // feed given since the last stores reading adds to stores (2:1 ≈ 8 lb stored per gal, 1:1 ≈ 4, solid ≈ 1:1 by weight)
    const fedLb = feedsOf(c.id).filter(f => f.date >= st.date).reduce((s, f) => {
      const gal = { "½ gal": 0.5, "1 gal": 1, "2 gal": 2 }[f.amount] || 0, lb = { "2 lb": 2, "4 lb": 4 }[f.amount] || 0;
      return s + (f.kind === "2:1 syrup" ? gal * 8 : f.kind === "1:1 syrup" ? gal * 4 : lb);
    }, 0);
    const proj = st.at(checkDate) + Math.round(fedLb), deficit = target - proj;
    if (deficit > 0) {
      const warmBefore = fc.filter(d => d.date >= TODAY && (!freeze || d.date < freeze) && goodDay(d)).map(d => d.date);
      const by = freeze ? addDays(freeze, -1) : addDays(TODAY, 7);
      const gal = Math.max(1, Math.ceil(deficit / 8)) * (c.type === "nuc" ? 0.5 : 1);
      const level = proj < target * 0.75 ? "risk" : "warn";
      const strong = activeIn(c.yardId).filter(o => o.id !== c.id && o.type === "hive" && (storesNow(o)?.lb || 0) >= winterTarget(o));
      const needItem = {
        key: "feed", level, short: freeze ? `Feed before ${DOW[parseD(freeze).getDay()]}` : "Feed",
        title: c.type === "nuc" && deficit > 8 ? "Too light for winter" : "Short on food for winter",
        detail: `About ${proj} lb by ${freeze ? "the freeze" : fmtShort(checkDate)}; this ${c.type} needs ~${target} lb.`,
        why: `Stores ${st.rate < 0 ? `fell ${Math.abs(Math.round(st.rate * 14))} lb per 2 weeks` : "are flat"} (last: ${st.lb} lb on ${fmtShort(st.date)}). ` +
             (fedLb ? `Counts ~${Math.round(fedLb)} lb from feeding since then. ` : "") +
             (freeze ? `First freeze ${fmtD(freeze)} (low ${fc.find(d => d.date === freeze).lo}°F) — after that, bees can't take down syrup well. ` : "") +
             `Target is for a ${db.settings.region} winter.`,
        newbie: "Bees eat stored honey all winter to keep warm. Below a certain weight a healthy colony can still starve before spring.",
        action: warmBefore.length
          ? `Feed ${gal} gal 2:1 syrup before ${fmtD(by)}`
          : "Too cold for syrup — add fondant or a candy board",
        actionNewbie: "2:1 = two parts sugar to one part water by weight. Thick syrup they can store quickly.",
        due: by, supplies: warmBefore.length ? { "Sugar (lb)": Math.round(gal * 11.5) } : { "Fondant (lb)": c.type === "nuc" ? 2 : 4 }
      };
      out.push(needItem);
      if (c.type === "nuc" && deficit > 8 && strong.length) {
        out.push({ key: "combine", level: "warn", short: "Combine?", title: `Or combine into ${strong[0].name}`,
          detail: `${strong[0].name} is on track. Combining saves the bees; you lose the nuc's queen (or keep the better one).`,
          why: `Feeding a nuc from ${proj} lb to ${target} lb this close to a freeze often fails. ${strong[0].name} has ~${storesNow(strong[0]).lb} lb.`,
          newbie: "Combining = putting one colony on top of another with a sheet of newspaper between so they merge slowly.",
          action: `Decide: feed hard or combine into ${strong[0].name}`, due: by, combineInto: strong[0].id });
      }
    } else if (isFall) {
      out.push({ key: "feed", level: "ok", short: "On track for winter", title: "Stores on track", detail: `About ${proj} lb at the freeze; needs ~${target} lb.`,
        why: `Last heft/visit ${st.lb} lb on ${fmtShort(st.date)}.` });
    }
  }

  // --- mites ---
  const ms = mitesOf(c.id), lastM = ms.slice(-1)[0], prevM = ms.slice(-2, -1)[0];
  const active = treatsOf(c.id).find(t => !t.done && t.removeBy);
  if (lastM) {
    const pct = lastM.count / lastM.sample * 100, age = daysBetween(lastM.date, TODAY);
    const brood = lv?.broodFrames ?? 4;
    if (pct >= 1 && !active) {
      const lowBrood = brood <= 3 || isWinter;
      out.push({ key: "mites", level: "risk", short: "Treat for mites", title: "Mites over threshold",
        detail: `${lastM.count} in ${lastM.sample} on ${fmtShort(lastM.date)} (${pct.toFixed(1)}%). Threshold is about 1% (3 in 300) in fall.`,
        why: `Fall mites damage the winter bees. Brood is ${brood} frames${lowBrood ? " — low, so oxalic will reach most mites." : "."}`,
        newbie: "A wash: shake about ½ cup of bees (≈300) in alcohol and count the mites that fall off.",
        action: lowBrood ? "Treat with oxalic acid (vapor or dribble)" : "Treat — formic if highs stay 50–85°F", due: addDays(TODAY, 7),
        supplies: lowBrood ? { "Oxalic acid (doses)": 1 } : {} });
    } else if (prevM && lastM.count > prevM.count && !active) {
      out.push({ key: "mites", level: "warn", short: "Mites rising", title: "Mites rising into winter bees",
        detail: `${prevM.count} → ${lastM.count} in 300. Under threshold, but climbing.`,
        why: "Brood shrinks in fall, so mites crowd into fewer cells. The bees raised now must last until spring.",
        newbie: "Mite numbers often jump in fall when other colonies nearby collapse and bees rob them.",
        action: "Do a mite wash next visit", due: addDays(lastM.date, 21), wash: true });
    } else if (age > 28 && !isWinter && !active) {
      out.push({ key: "mites", level: "info", short: "Mite wash due", title: "Mite count due", detail: `Last count ${age} days ago.`,
        why: "Monthly counts in season catch climbs before they hurt.", action: "Do a mite wash", due: TODAY, wash: true });
    }
  } else if (!isWinter) {
    out.push({ key: "mites", level: "info", short: "No mite count yet", title: "No mite count on record", detail: "Counts drive treatment timing.",
      why: "Without a count, treatment is a guess.", action: "Do a mite wash", due: TODAY, wash: true });
  }

  // --- treatments in progress ---
  treatsOf(c.id).filter(t => !t.done && t.removeBy).forEach(t => {
    const left = daysBetween(TODAY, t.removeBy);
    if (left <= 10) out.push({ key: "strips", level: left < 0 ? "risk" : "warn", short: left < 0 ? "Strips overdue" : `Pull strips by ${fmtShort(t.removeBy)}`,
      title: left < 0 ? `${t.product} is overdue to come out` : `${t.product} comes out soon`,
      detail: `In since ${fmtShort(t.start)}; remove by ${fmtD(t.removeBy)}.`,
      why: "Strips left in too long keep exposing mites to a low dose, which breeds resistant mites. " + LABEL_NOTE,
      newbie: "Treatment strips hang between frames in the brood nest. Wear gloves to remove them.",
      action: `Remove ${t.product} strips`, due: t.removeBy, treatId: t.id });
  });

  // --- queen ---
  const q = c.queen || {};
  if (q.laying === false) {
    const expect = addDays(q.since || TODAY, 28);
    out.push({ key: "queen", level: daysBetween(expect, TODAY) > 7 ? "risk" : "info", short: daysBetween(expect, TODAY) > 7 ? "No laying queen" : "Queen not laying yet",
      title: daysBetween(expect, TODAY) > 7 ? "Still no laying queen" : "Waiting on a new queen",
      detail: `New queen expected laying by about ${fmtD(expect)}.`,
      why: "A walk-away split raises a queen from an egg: ~16 days to emerge, ~1–2 weeks to mate, then she starts laying.",
      newbie: "Don't disturb a colony much while a new queen is out on mating flights.",
      action: daysBetween(expect, TODAY) > 7 ? "Add a frame of eggs or a mated queen" : "Look for eggs after that date", due: expect < TODAY ? TODAY : expect });
  } else if (lv && lv.type === "full" && lv.eggs === false && lv.queen !== "seen") {
    out.push({ key: "queen", level: "risk", short: "Queenless?", title: "Possibly queenless",
      detail: `No eggs and no queen seen on ${fmtShort(lv.date)}.`,
      why: "Eggs hatch in 3 days, so no eggs means no laying queen for at least 3 days — unless she's a new queen not laying yet.",
      newbie: "Test: add a frame of eggs from another colony. If they build queen cells on it, they're queenless.",
      action: "Look for eggs again, or add a test frame", due: addDays(TODAY, 5) });
  } else if (q.year && yearOf(TODAY) - q.year >= 2) {
    out.push({ key: "queen", level: "info", short: `Queen ${q.year}`, title: `Queen is from ${q.year}`,
      detail: "Older queens are more likely to fail or be superseded.",
      why: `${yearOf(TODAY) - q.year} seasons old. Watch brood pattern in spring.`, action: "Plan to requeen in spring", due: `${yearOf(TODAY) + 1}-05-01` });
  }

  // --- swarm / split (season) ---
  const brood = lv?.broodFrames;
  if (isSpring) {
    out.push({ key: "swarm", level: brood >= 6 ? "warn" : "ok", short: brood >= 6 ? "Swarm watch" : "Building up",
      title: brood >= 6 ? "Swarm season: watch this one" : "Building up", detail: `Brood on ${brood ?? "?"} frames.`,
      why: "Crowded brood nests in spring raise swarm cells. Check for cups with eggs every 7–9 days.",
      action: brood >= 6 ? "Add space or split" : "Check build-up next visit", due: addDays(TODAY, 7) });
  } else if (isFall || isWinter) {
    out.push({ key: "swarm", level: "ok", short: "No swarm risk now", title: "Swarm or split: not this season",
      detail: "Brood shrinking for winter. Next split window: early spring.", why: "Colonies don't swarm going into winter." });
  }

  // --- brood pace ---
  const bs = broodSeries(c.id);
  if (bs.length >= 2) {
    const [d1, b1] = bs[bs.length - 2], [d2, b2] = bs[bs.length - 1], per2w = (b2 - b1) / Math.max(1, daysBetween(d1, d2)) * 14;
    const pace = `${b1} → ${b2} frames between ${fmtShort(d1)} and ${fmtShort(d2)} (${per2w >= 0 ? "+" : ""}${per2w.toFixed(1)} per 2 weeks)`;
    if (isSpring) out.push(per2w >= 1
      ? { key: "brood", level: "ok", short: null, title: "Brood building fast", detail: pace, why: "Fast build-up is good — and it means a crowded brood nest soon. Expect swarm preparations in 2–3 weeks.", newbie: "Each frame of capped brood becomes about 2 frames of new bees in 12 days." }
      : { key: "brood", level: "warn", short: "Slow build-up", title: "Building up slowly", detail: pace, why: "Common causes: a failing queen, not enough pollen or food, cold snaps, or disease. Check eggs and pattern.", action: "Check queen and pattern; pollen patty if pollen is short", due: addDays(TODAY, 7) });
    else if (isFall || isWinter) out.push(per2w <= 0
      ? { key: "brood", level: "ok", short: null, title: "Brood tapering, as expected", detail: pace, why: "The queen slows down in fall. The bees raised now are the long-lived winter bees." }
      : { key: "brood", level: "info", short: null, title: "Still raising a lot of brood", detail: pace, why: "A fall flow keeps brood going, but brood eats stores. Watch the weight." });
    else out.push({ key: "brood", level: "ok", short: null, title: "Brood steady", detail: pace, why: "Summer brood holds steady through the main flow." });
  }

  // --- winter cluster size ---
  if ((isFall || isWinter) && c.type === "hive" && lv?.broodFrames != null && lv.broodFrames <= 2)
    out.push({ key: "cluster", level: "warn", short: "Small for winter", title: "Small cluster for winter", detail: `Brood on ${lv.broodFrames} frames on ${fmtShort(lv.date)} in a full-size hive.`,
      why: "A small cluster can't keep a big box warm and can lose contact with its stores in a cold snap.", newbie: "A cluster is the ball the bees form to stay warm. Too few bees = a small ball.",
      action: "Combine with another colony, or take it down to one box", due: freeze ? addDays(freeze, -1) : addDays(TODAY, 10) });

  // --- pests from the last visit ---
  if (lv && daysBetween(lv.date, TODAY) <= 30) {
    const seen = [...(lv.taps?.pests || []), ...(lv.taps?.entr || [])];
    const guardOn = eventsOf(c.id).some(e => /mouse guard/i.test(e.text) && e.date >= lv.date);
    const P = {
      shb: { level: "warn", title: "Small hive beetles seen", action: "Add beetle traps; take away empty space the bees can't guard", why: "Beetle larvae ruin comb and honey when a colony is weak or has too much room." },
      moth: { level: "info", title: "Wax moth seen", action: "Pull frames the bees can't cover; freeze stored comb 48 h", why: "Wax moths take over comb the bees aren't patrolling." },
      mice: { level: "warn", title: "Mouse signs", action: "Put on a mouse guard", why: "Mice move into hives when nights turn cold and chew comb all winter." },
      yj: { level: "warn", title: "Yellowjackets at the hive", action: "Reduce the entrance; trap them away from the apiary", why: "Yellowjackets kill bees and rob weak colonies in late summer and fall." },
      ants: { level: "info", title: "Ants", action: "Put stand legs in oil or grease", why: "Ants steal syrup and stress the colony." },
      robbing: { level: "risk", title: "Being robbed", action: "Reduce the entrance to a bee-width or add a robbing screen; no open syrup", why: "Robbing fights at the entrance can empty a colony in days, and robbers spread mites." },
      bear: { level: "risk", title: "Bear damage", action: "Electric fence (bait the wire); strap the boxes", why: "A bear that finds an apiary comes back." }
    };
    seen.forEach(k => { const x = P[k]; if (!x || (k === "mice" && guardOn)) return;
      out.push({ key: "pest", level: x.level, short: x.title.split(" ")[0] === "Being" ? "Robbing" : x.title, title: x.title, detail: `Logged on ${fmtShort(lv.date)}.`, why: x.why, action: x.action, due: addDays(TODAY, x.level === "risk" ? 1 : 7) }); });
  }

  // --- visits & lifts ---
  if (lv) {
    const since = daysBetween(lv.date, TODAY);
    if (since > 21 && !isWinter) out.push({ key: "visit", level: "info", short: `${since} days since visit`, title: "Visit overdue", detail: `Last visit ${fmtD(lv.date)}.`, why: "Every 2–3 weeks in season catches problems early.", action: "Visit", due: TODAY });
  }
  const heaviest = Math.max(...c.boxes.map(b => boxLb(b, 0.9)));
  if (false && heaviest > 50) out.push({ key: "lift", level: "info", short: null, title: `Heaviest box ~${heaviest} lb`, detail: "Get help, or lift frames out first.", why: `${c.boxes[0].depth} boxes full of honey. Weight estimate from box depth and frame count.` });

  // --- apiary events ---
  const y = yardOf(c.yardId);
  if (y?.spray?.date && daysBetween(TODAY, y.spray.date) >= 0 && daysBetween(TODAY, y.spray.date) <= 7)
    out.push({ key: "spray", level: "warn", short: "Spray nearby", title: "Pesticide spray nearby", detail: y.spray.text || `Spray planned ${fmtD(y.spray.date)}.`, why: "You noted a planned spray near this apiary.", action: "Close or screen the entrance the night before", due: addDays(y.spray.date, -1) });

  out.forEach(n => { n.conf = n.conf || confFor(n, c, isSpring); });
  const rank = { risk: 0, warn: 1, info: 2, ok: 3 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/* How sure each prediction is, and how to confirm it */
function confFor(n, c, isSpring) {
  const ss = storesSeries(c.id), last = ss.slice(-1)[0], age = last ? daysBetween(last[0], TODAY) : 99;
  switch (n.key) {
    case "feed": case "combine": {
      const lvl = ss.length >= 3 && age <= 14 ? "High" : ss.length >= 2 && age <= 28 ? "Medium" : "Low";
      return { level: lvl, why: `${ss.length} weight reading${ss.length === 1 ? "" : "s"}, the last ${age} days ago.`, confirm: lvl === "High" ? null : "Heft the back of the hive (or weigh it) before you buy sugar." };
    }
    case "mites": {
      const m = mitesOf(c.id).slice(-1)[0];
      if (!m) return { level: "Low", why: "No count on record.", confirm: "An alcohol wash of ~300 bees." };
      const base = { wash: "High", roll: "Medium", board: "Low" }[m.method] || "Medium", old = daysBetween(m.date, TODAY) > 21;
      return { level: old && base === "High" ? "Medium" : old ? "Low" : base, why: `Last count: ${{ wash: "alcohol wash", roll: "sugar roll", board: "sticky board" }[m.method]}, ${daysBetween(m.date, TODAY)} days ago.`, confirm: "An alcohol wash of ~300 bees from the brood nest is the most reliable count." };
    }
    case "strips": return { level: "High", why: "From the start date and the label's treatment days." };
    case "queen": return { level: "Medium", why: "Based on what one visit saw; queens are easy to miss.", confirm: "Eggs standing in the bottom of cells mean a laying queen in the last 3 days." };
    case "swarm": return isSpring ? { level: "Low", why: "Swarm timing is hard to call, even for hive-sensor systems.", confirm: "Look for queen cells on the bottom bars every 7–9 days." } : { level: "High", why: "Colonies almost never swarm going into winter." };
    case "brood": return { level: broodSeries(c.id).length >= 3 ? "Medium" : "Low", why: `${broodSeries(c.id).length} brood counts on record. Counts can be off by a frame.` };
    case "cluster": return { level: "Medium", why: "Estimated from frames of brood, not a count of bees.", confirm: "Count the seams of bees between frames on a cool morning." };
    case "pest": return { level: "Medium", why: "From your taps on the last visit." };
    case "spray": return { level: "Medium", why: "From your note; spray dates move with the weather." };
    case "visit": return { level: "High", why: "From your visit dates." };
    case "lift": return { level: "Medium", why: "From box size; real weight depends on how full it is." };
    default: return { level: "Medium", why: "Rule of thumb from your records." };
  }
}

/* ---------- prediction track record ----------
   Predictions are logged when a visit is saved and scored by later readings. */
function scorePreds(colonyId) {
  db.predLog.filter(p => p.colonyId === colonyId && p.outcome === "open").forEach(p => {
    if (p.kind === "stores") {
      const r = storesSeries(colonyId).find(([d]) => daysBetween(p.date, d) >= 7);
      if (!r) return;
      const exp = Math.round(p.base.lb + p.base.rate * daysBetween(p.base.date, r[0])), ok = Math.abs(r[1] - exp) <= Math.max(5, exp * 0.15);
      p.outcome = ok ? "true" : "false"; p.note = `Measured ~${r[1]} lb on ${fmtShort(r[0])} (expected ~${exp})${ok ? "" : r[1] < exp ? " — dropped faster: robbing, brood, or a bad reading?" : " — held up better: late flow or feeding?"}`;
    } else if (p.kind === "mites") {
      const m = mitesOf(colonyId).find(x => x.date > p.date);
      if (!m) return;
      const over = m.count / m.sample >= 0.01; p.outcome = over ? "true" : "false"; p.note = `${m.count} in ${m.sample} on ${fmtShort(m.date)}`;
    } else if (p.kind === "queen") {
      const v = visitsOf(colonyId).find(x => x.date > p.date && x.eggs);
      if (v) { p.outcome = v.date <= addDays(p.target.date, 7) ? "true" : "false"; p.note = `Eggs seen ${fmtShort(v.date)}`; }
      else if (daysBetween(p.target.date, TODAY) > 14) { p.outcome = "false"; p.note = "Still no eggs two weeks after the expected date"; }
    }
  });
}
function logPredictions(c) {
  const add = (kind, text, extra) => {
    db.predLog = db.predLog.filter(p => !(p.colonyId === c.id && p.kind === kind && p.outcome === "open"));
    db.predLog.push(Object.assign({ id: uid("pr"), date: TODAY, colonyId: c.id, kind, text, outcome: "open", note: "" }, extra));
  };
  const st = storesNow(c);
  if (st && st.date === TODAY && st.rate) { const d = addDays(TODAY, 14); add("stores", `About ${st.at(d)} lb by ${fmtShort(d)}, at the current rate`, { base: { date: st.date, lb: st.lb, rate: +st.rate.toFixed(3) }, target: { date: d, lb: st.at(d) } }); }
  const n = needsFor(c);
  if (n.some(x => x.key === "mites" && x.level === "warn")) add("mites", "Mites will be over 1% at the next count without treatment", {});
  const q = n.find(x => x.key === "queen" && x.title === "Waiting on a new queen");
  if (q) add("queen", `New queen laying by ${fmtShort(q.due)}`, { target: { date: q.due } });
}

/* ---------- notifications: only the ones that need you ---------- */
const NOTE_KEY = { feed: "feed", combine: "feed", strips: "strips", mites: "mites", swarm: "swarm", queen: "queen", spray: "spray" };
function notifications() {
  const out = [];
  db.colonies.filter(c => c.status === "active").forEach(c => needsFor(c).filter(n => n.level === "risk" || n.level === "warn").forEach(n =>
    out.push({ kind: NOTE_KEY[n.key] || "other", level: n.level, title: `${c.name}: ${n.title}`, text: n.action ? `${n.action}${n.due ? ` by ${fmtShort(n.due)}` : ""}` : n.detail, why: n.why, id: c.id })));
  db.yards.forEach(y => { const fr = firstFreeze(forecastFor(y.id)); if (fr) out.push({ kind: "freeze", level: "warn", title: `${y.name}: hard freeze ${fmtD(fr)}`, text: "Last chance for syrup is the day before; fondant after.", why: "Bees can't take down cold syrup and can't break cluster to reach it." }); });
  const r = db.settings.registration;
  if (r.renewBy && daysBetween(TODAY, r.renewBy) <= 120) out.push({ kind: "registration", level: "info", title: "Apiary registration", text: `Renew by ${fmtD(r.renewBy)}`, why: "Most states require yearly registration.", biz: "paper" });
  const on = out.filter(x => db.settings.notify[x.kind] !== false && (x.kind !== "other" || db.settings.notify.other));
  return { on, muted: out.length - on.length };
}

/* When to come back: the last good-weather day before the earliest due action. */
function comeBack(c) {
  const due = needsFor(c).filter(n => n.due && n.level !== "ok").map(n => n.due).sort()[0];
  const fc = forecastFor(c.yardId);
  if (!due) { const d = fc.find(x => x.date > TODAY && goodDay(x)); return d ? { date: d.date, why: "Routine check on a good day." } : null; }
  const cands = fc.filter(d => d.date > TODAY && d.date <= due && goodDay(d));
  const pick = cands.slice(-1)[0] || fc.find(d => d.date > TODAY && goodDay(d));
  if (!pick) return null;
  const fr = firstFreeze(fc);
  return { date: pick.date, hi: pick.hi, why: fr && pick.date < fr ? `Last warm day (${pick.hi}°) before the freeze.` : due <= TODAY ? `Next good day (${pick.hi}°). It's already due, so today works too if the weather allows.` : `Good weather (${pick.hi}°), before ${fmtShort(due)}.` };
}

/* Packing list for a trip to the apiary */
function packingFor(colonies) {
  const list = { "Hive tool": 1, "Smoker + fuel": 1, "Veil / gloves": 1 }, why = {};
  colonies.forEach(c => needsFor(c).forEach(n => {
    Object.entries(n.supplies || {}).forEach(([k, v]) => { list[k] = (list[k] || 0) + v; (why[k] = why[k] || []).push(c.name); });
    if (n.wash) { list["Mite wash kit (jar + alcohol)"] = 1; (why["Mite wash kit (jar + alcohol)"] = why["Mite wash kit (jar + alcohol)"] || []).push(c.name); }
    if (n.key === "strips") { list["Bag for used strips"] = 1; (why["Bag for used strips"] = why["Bag for used strips"] || []).push(c.name); }
    if (n.key === "feed" && n.level !== "ok") { list["Feeder"] = (list["Feeder"] || 0) + 0; }
  }));
  if (seasonMonth() >= 9) { list["Mouse guards"] = colonies.length; why["Mouse guards"] = ["fall prep"]; }
  return { list, why };
}

/* Apiary-wide alerts for the home screen */
function yardAlerts(yardId) {
  const fc = forecastFor(yardId), fr = firstFreeze(fc), cs = activeIn(yardId);
  const urgent = cs.filter(c => needsFor(c).some(n => (n.level === "risk" || n.level === "warn") && n.due && (!fr || n.due <= addDays(fr, 0))));
  const out = [];
  if (fr) out.push({ icon: "❄️", text: `First hard freeze ${fmtD(fr)}. ${urgent.length ? `${urgent.length} ${urgent.length === 1 ? "colony needs" : "colonies need"} something done before then.` : "Everyone's ready."}` });
  const y = yardOf(yardId);
  if (y?.spray?.date && y.spray.date >= TODAY) out.push({ icon: "⚠️", text: `Spray planned ${fmtD(y.spray.date)}${y.spray.text ? ": " + y.spray.text : ""}` });
  return out;
}

/* Season calendar (Northeast-type region) */
const SEASON = [
  { m: [0, 1], name: "Deep winter", tasks: ["Heft monthly; add fondant if light", "Keep entrances clear of snow and dead bees", "Oxalic vapor if broodless and mites were high", "Order packages / nucs / queens", "Build and paint equipment"] },
  { m: [2], name: "Late winter", tasks: ["First quick look on a 55°F+ still day", "Check stores — emergency feed fondant", "Pollen patties if pollen is short", "Clean dead-outs; find the cause"] },
  { m: [3], name: "Spring build-up", tasks: ["First full inspection at 60°F+", "Reverse brood boxes if the cluster is up top", "Mite count", "Equipment ready for splits"] },
  { m: [4, 5], name: "Swarm season & main flow", tasks: ["Inspect every 7–9 days for swarm cells", "Split strong colonies", "Supers on before the flow", "Catch swarms / set bait hives", "Sell nucs"] },
  { m: [6], name: "Main flow → harvest", tasks: ["Add supers as needed", "Harvest capped honey", "Mite count after harvest"] },
  { m: [7], name: "Dearth", tasks: ["Reduce entrances — robbing season", "Treat for mites (Aug is critical)", "Don't leave honey or syrup exposed"] },
  { m: [8], name: "Fall flow & prep", tasks: ["Goldenrod/aster flow", "Feed 2:1 if light", "Combine weak colonies", "Mite count after treatment"] },
  { m: [9, 10], name: "Into winter", tasks: ["Feed before the first freeze; fondant after", "Mouse guards on", "Entrance reducers", "Remove treatment strips on time", "Final heft and mite check", "Windbreak / tilt forward for moisture"] },
  { m: [11], name: "Early winter", tasks: ["Oxalic when broodless (often Dec)", "Heft; fondant if light", "Leave them alone otherwise"] }
];
function seasonFor(month) { return SEASON.find(s => s.m.includes(seasonMonthOf(month))); }

const FLOWS = [
  { m: [3], text: "Dandelion, maple, fruit bloom — build-up" },
  { m: [4, 5], text: "Black locust, clover, basswood — main flow" },
  { m: [6, 7], text: "Summer dearth — robbing risk" },
  { m: [8], text: "Goldenrod and aster — fall flow" },
  { m: [9, 10, 11, 0, 1, 2], text: "No forage — bees live on stores" }
];
const flowFor = month => FLOWS.find(f => f.m.includes(seasonMonthOf(month)));

/* Queen rearing schedule from a graft date */
function queenCalendar(graft) {
  return [
    { d: graft, t: "Graft 1-day-old larvae (or start cell-builder)" },
    { d: addDays(graft, 5), t: "Cells capped — don't disturb" },
    { d: addDays(graft, 10), t: "Move ripe cells to nucs (by day 10)" },
    { d: addDays(graft, 11), t: "Queens emerge" },
    { d: addDays(graft, 18), t: "Mating flights (weather permitting)" },
    { d: addDays(graft, 25), t: "Check for eggs — mated and laying" }
  ];
}

/* Nuc ready-to-sell check */
function nucReady(c) {
  const lv = lastVisit(c.id), q = c.queen || {};
  const checks = [
    { ok: (lv?.broodFrames || 0) >= 3, t: `Brood on 3+ frames (now ${lv?.broodFrames ?? "?"})` },
    { ok: q.laying && (lv?.eggs ?? false), t: "Laying queen, eggs seen" },
    { ok: (storesNow(c)?.lb || 0) >= 8, t: `Some stores (now ~${storesNow(c)?.lb ?? "?"} lb)` },
    { ok: !needsFor(c).some(n => n.key === "mites" && n.level === "risk"), t: "Mites under threshold" }
  ];
  return { ready: checks.every(x => x.ok), checks };
}

/* Data layer: storage, weather, photos, small helpers.
   Records live on this phone (localStorage); photos in IndexedDB.
   The only thing sent out is a yard's rounded location, to Open-Meteo, for the forecast. */

const TODAY = isoD(new Date());
function nowTime() { return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
const DB_KEY = "hive_app_real";
const DB_VERSION = 4;

/* ---------- dates ---------- */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function parseD(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function isoD(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function addDays(s, n) { const d = parseD(s); d.setDate(d.getDate() + n); return isoD(d); }
function daysBetween(a, b) { return Math.round((parseD(b) - parseD(a)) / 86400000); }
function fmtD(s, withDow = true) { const d = parseD(s); return (withDow ? DOW[d.getDay()] + ", " : "") + MONTHS[d.getMonth()] + " " + d.getDate(); }
function fmtShort(s) { const d = parseD(s); return MONTHS[d.getMonth()] + " " + d.getDate(); }
function monthOf(s) { return parseD(s).getMonth(); }
function yearOf(s) { return parseD(s).getFullYear(); }

/* ---------- queens ---------- */
// International marking colors by last digit of the year
const QUEEN_COLORS = { 1: "white", 6: "white", 2: "yellow", 7: "yellow", 3: "red", 8: "red", 4: "green", 9: "green", 5: "blue", 0: "blue" };
const QUEEN_HEX = { white: "#f5f5f4", yellow: "#facc15", red: "#ef4444", green: "#22c55e", blue: "#3b82f6" };
function queenColor(year) { return QUEEN_COLORS[Number(year) % 10]; }

/* ---------- equipment & weight ---------- */
// Rough full weights (lb) for a 10-frame box; 8-frame ~80%; nuc box scaled by frames.
const FULL_LB = { deep: 85, medium: 58, shallow: 45 };
const EMPTY_LB = { deep: 22, medium: 16, shallow: 13 };   // box + drawn comb, no honey
function boxLb(box, fill = 1) {
  const scale = box.frames / 10;
  return Math.round((EMPTY_LB[box.depth] + (FULL_LB[box.depth] - EMPTY_LB[box.depth]) * fill) * scale);
}
function describeSetup(c) {
  if (c.type === "nuc") { const b = c.boxes[0]; return `${b.depth} nuc, ${b.frames}-frame`; }
  const counts = {};
  c.boxes.forEach(b => { counts[b.depth] = (counts[b.depth] || 0) + 1; });
  const parts = Object.entries(counts).map(([d, n]) => n === 1 ? `1 ${d}` : `${n} ${d}s`);
  const fr = [...new Set(c.boxes.map(b => b.frames))].join("/");
  return `${parts.join(" + ")}, ${fr}-frame`;
}
/* ---------- regions ----------
   spring/fall: how many months earlier (+) or later (−) the season runs than a Northeast zone-6 year.
   temp: forecast shift (°F). winter: multiplier on winter-stores targets. Rough rules of thumb. */
const REGIONS = {
  "Northeast US · zone 6": { spring: 0, fall: 0, temp: 0, winter: 1, note: "Cold winters; about 5 months with no forage." },
  "Mid-Atlantic · zone 7": { spring: 0, fall: 0, temp: 5, winter: 0.85, note: "Shorter winters; bees fly on warm winter days." },
  "Southeast · zone 8": { spring: 1, fall: -1, temp: 12, winter: 0.6, note: "Short, mild winters; spring comes a month early and fall a month late." },
  "Upper Midwest · zone 4": { spring: -1, fall: 1, temp: -8, winter: 1.4, note: "Long, hard winters; many keepers wrap hives." },
  "Pacific NW · zone 8": { spring: 0, fall: 0, temp: 4, winter: 0.85, note: "Mild but wet; long rainy spells and moisture are the risk." }
};
const region = () => REGIONS[db?.settings?.region] || REGIONS["Northeast US · zone 6"];
// The month the bees are "living in" for this region (spring/fall shift only)
function seasonMonthOf(m) {
  const r = region();
  if (m >= 1 && m <= 4) return Math.min(5, Math.max(0, m + r.spring));
  if (m >= 8 && m <= 10) return Math.min(11, Math.max(7, m + r.fall));
  return m;
}
const seasonMonth = () => seasonMonthOf(monthOf(TODAY));

// Treatment registration by country (a starting list — confirm on your national and state lists)
const COUNTRIES = { US: "United States", CA: "Canada", UK: "United Kingdom", EU: "EU" };
const TREAT_REG = {
  "Apivar": { US: "yes", CA: "yes", UK: "yes", EU: "yes" },
  "Formic Pro": { US: "yes", CA: "yes", UK: "yes", EU: "some" },
  "Apiguard": { US: "yes", CA: "yes", UK: "yes", EU: "yes" },
  "Oxalic vapor": { US: "yes", CA: "yes", UK: "yes", EU: "some" },
  "Oxalic dribble": { US: "yes", CA: "yes", UK: "yes", EU: "yes" },
  "HopGuard 3": { US: "yes", CA: "check", UK: "no", EU: "no" }
};

// Honey the colony should go into winter with, scaled for the region
function winterTarget(c) {
  const base = c.type === "nuc" ? 25 : (c.boxes.reduce((s, b) => s + b.frames * (b.depth === "deep" ? 1 : b.depth === "medium" ? 0.67 : 0.5), 0) >= 18 ? 60 : 50);
  return Math.round(base * region().winter / 5) * 5;
}

/* ---------- weather (Open-Meteo: free, no account, no key) ---------- */
const WX = { 0: ["☀️", "Clear"], 1: ["🌤", "Mostly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Cloudy"], 45: ["🌫", "Fog"], 48: ["🌫", "Fog"],
  51: ["🌦", "Drizzle"], 53: ["🌦", "Drizzle"], 55: ["🌧", "Drizzle"], 56: ["🌧", "Freezing drizzle"], 57: ["🌧", "Freezing drizzle"],
  61: ["🌧", "Light rain"], 63: ["🌧", "Rain"], 65: ["🌧", "Heavy rain"], 66: ["🌧", "Freezing rain"], 67: ["🌧", "Freezing rain"],
  71: ["🌨", "Light snow"], 73: ["🌨", "Snow"], 75: ["❄️", "Heavy snow"], 77: ["🌨", "Snow grains"], 80: ["🌦", "Showers"], 81: ["🌧", "Showers"], 82: ["🌧", "Heavy showers"],
  85: ["🌨", "Snow showers"], 86: ["🌨", "Snow showers"], 95: ["⛈", "Thunderstorm"], 96: ["⛈", "Thunderstorm, hail"], 99: ["⛈", "Thunderstorm, hail"] };
const wxIcon = code => (WX[code] || ["·", "—"])[0];
const wxText = code => (WX[code] || ["·", "Unknown"])[1];
const hourLabel = h => `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;

// Forecast days from today on. Empty until the yard has a location and the phone has had signal once.
// Today's best window only counts the hours still ahead.
function forecastFor(yardId) {
  const w = db.weather?.[yardId]; if (!w) return [];
  const nowH = new Date().getHours();
  return w.days.filter(d => d.date >= TODAY).map(d => Object.assign(d, { window: bestWindow(d.hours, d.date === TODAY ? nowH + 1 : 0, d.sunsetH ?? 18), past: d.date === TODAY && nowH + 1 > Math.min(17, (d.sunsetH ?? 18) - 1) }));
}
const todayWx = yardId => forecastFor(yardId)[0] || null;
const wxAge = yardId => db.weather?.[yardId] ? Math.round((Date.now() - db.weather[yardId].at) / 3600000) : null;

// Best hours to open on a day: warm, calm, dry, in daylight while foragers are out (9 AM until an hour before sunset)
function bestWindow(hours, fromH = 0, sunsetH = 18) {
  if (!hours || !hours.length) return null;
  const day = hours.filter(h => h.h >= Math.max(9, fromH) && h.h <= Math.min(17, sunsetH - 1));
  const runOf = ok => { let best = [], cur = []; day.forEach(h => { if (ok(h)) { cur.push(h); if (cur.length > best.length) best = cur.slice(); } else cur = []; }); return best; };
  let run = runOf(h => h.t >= 57 && h.wind < 15 && h.pop < 40);
  if (!run.length) run = runOf(h => h.t >= 50 && h.wind < 15 && h.pop < 40);
  if (!run.length) return null;
  return run.length === 1 ? `around ${hourLabel(run[0].h)}` : `${hourLabel(run[0].h)}–${hourLabel(run[run.length - 1].h + 1)}`;
}

async function fetchWeather(yardId, force = false) {
  const y = yardOf(yardId);
  if (!y || y.lat == null) return false;
  const w = db.weather?.[yardId];
  if (!force && w && Date.now() - w.at < 45 * 60000) return false;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${y.lat.toFixed(2)}&longitude=${y.lon.toFixed(2)}` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max,precipitation_probability_max,precipitation_sum,sunset` +
    `&hourly=temperature_2m,wind_speed_10m,precipitation_probability,weather_code&current=temperature_2m,weather_code,wind_speed_10m,cloud_cover` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=10`;
  try {
    const r = await fetch(url); if (!r.ok) throw new Error(r.status);
    const j = await r.json(), D = j.daily, H = j.hourly;
    const hoursFor = date => H.time.map((t, i) => ({ t: t, i })).filter(x => x.t.startsWith(date))
      .map(({ t, i }) => ({ h: +t.slice(11, 13), t: Math.round(H.temperature_2m[i]), wind: Math.round(H.wind_speed_10m[i]), pop: H.precipitation_probability[i] ?? 0, code: H.weather_code[i] }));
    const days = D.time.map((date, i) => {
      const sunsetH = D.sunset?.[i] ? +D.sunset[i].slice(11, 13) : 18, hours = hoursFor(date), pop = D.precipitation_probability_max[i] ?? 0, sum = D.precipitation_sum[i] ?? 0;
      const mid = hours.filter(h => h.h >= 10 && h.h <= 16);   // wind while you'd have the hive open, not the day's peak gust
      const windMid = mid.length ? Math.round(mid.reduce((a, h) => a + h.wind, 0) / mid.length) : Math.round(D.wind_speed_10m_max[i] * 0.75);
      return { date, hi: Math.round(D.temperature_2m_max[i]), lo: Math.round(D.temperature_2m_min[i]), code: D.weather_code[i], sky: wxIcon(D.weather_code[i]), skyText: wxText(D.weather_code[i]),
        wind: windMid, windMax: Math.round(D.wind_speed_10m_max[i]), pop, rain: pop >= 60 && sum >= 0.1, hours, sunsetH, sunset: D.sunset?.[i]?.slice(11, 16) || null };
    });
    const C = j.current;
    db.weather = db.weather || {};
    db.weather[yardId] = { at: Date.now(), days, current: { temp: Math.round(C.temperature_2m), code: C.weather_code, sky: wxText(C.weather_code), icon: wxIcon(C.weather_code), wind: Math.round(C.wind_speed_10m), cloud: C.cloud_cover, time: C.time } };
    saveDb(); return true;
  } catch (e) { return false; }
}
async function refreshAllWeather(force = false) {
  const got = await Promise.all(db.yards.map(y => fetchWeather(y.id, force)));
  if (got.some(Boolean) && typeof rerender === "function" && !document.querySelector("#scrim.on")) rerender();
}
// Town or ZIP → coordinates (Open-Meteo geocoding). Only the search text is sent.
async function geocode(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
  const j = await r.json();
  return (j.results || []).map(x => ({ name: [x.name, x.admin1, x.country_code].filter(Boolean).join(", "), lat: x.latitude, lon: x.longitude }));
}
// Rough region from latitude/longitude (US-centric; the user can change it in More)
function guessRegion(lat, lon) {
  if (lon < -116 && lat > 42) return "Pacific NW · zone 8";
  if (lat >= 43.5 && lon < -84) return "Upper Midwest · zone 4";
  if (lat < 35) return "Southeast · zone 8";
  if (lat < 39.5) return "Mid-Atlantic · zone 7";
  return "Northeast US · zone 6";
}

/* ---------- photos (IndexedDB, on this phone only) ---------- */
let _pdb;
function photoDb() {
  if (_pdb) return _pdb;
  _pdb = new Promise((res, rej) => { const r = indexedDB.open("hive_photos", 1); r.onupgradeneeded = () => r.result.createObjectStore("photos"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return _pdb;
}
async function photoPut(key, blob) { const d = await photoDb(); return new Promise((res, rej) => { const t = d.transaction("photos", "readwrite"); t.objectStore("photos").put(blob, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function photoGet(key) { const d = await photoDb(); return new Promise(res => { const r = d.transaction("photos").objectStore("photos").get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); }
async function photoDel(key) { const d = await photoDb(); return new Promise(res => { const t = d.transaction("photos", "readwrite"); t.objectStore("photos").delete(key); t.oncomplete = res; t.onerror = res; }); }
async function photoCount() { const d = await photoDb(); return new Promise(res => { const r = d.transaction("photos").objectStore("photos").count(); r.onsuccess = () => res(r.result); r.onerror = () => res(0); }); }
// Shrink a camera photo to ~1280 px JPEG so hundreds fit on the phone
function shrinkPhoto(file, max = 1280, q = 0.72) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement("canvas");
      cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      cv.toBlob(b => b ? res(b) : rej(new Error("photo")), "image/jpeg", q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("photo")); };
    img.src = url;
  });
}
// Fill <img data-photo="key"> tags after a render
const _purls = {};
function hydratePhotos(root) {
  root.querySelectorAll("img[data-photo]").forEach(async im => {
    const k = im.dataset.photo;
    if (!_purls[k]) { const b = await photoGet(k); if (!b) { im.replaceWith(Object.assign(document.createElement("span"), { className: "small", textContent: "(photo missing)" })); return; } _purls[k] = URL.createObjectURL(b); }
    im.src = _purls[k];
  });
}

/* ---------- empty start ---------- */
function EMPTY() {
  return {
    v: DB_VERSION,
    settings: {
      newMode: false, fieldMode: false, batterySaver: false, region: "Northeast US · zone 6", country: "US", setupDone: false,
      notify: { freeze: true, strips: true, feed: true, swarm: true, mites: true, queen: true, spray: true, registration: true, other: false },
      currentYard: null, lastBackup: null,
      registration: { state: "", renewBy: null, lastInspection: null, inspector: "" },
      checklist: {}
    },
    yards: [], helpers: [], colonies: [], visits: [], mites: [], treatments: [], feeds: [], events: [], harvests: [], batches: [], contracts: [],
    inventory: { "Deep boxes": 0, "Medium boxes": 0, "Deep frames": 0, "Medium frames": 0, "Drawn comb (deep)": 0, "Drawn comb (medium)": 0,
      "Feeders": 0, "Lids": 0, "Queen excluders": 0, "Nuc boxes": 0, "Mouse guards": 0, "Sugar (lb)": 0, "Fondant (lb)": 0, "Apivar strips": 0, "Oxalic acid (doses)": 0 },
    invMin: {}, orders: [], money: [], predLog: [], drafts: {}, weather: {}
  };
}

/* ---------- storage ---------- */
let db;
function loadDb() {
  try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { db = null; }
  if (!db || db.v !== DB_VERSION) { db = EMPTY(); saveDb(); }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}
function saveDb() {
  try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
  catch (e) { if (typeof toast === "function") toast("Phone storage is full — back up and delete old photos"); }
}
function resetDb() { db = EMPTY(); saveDb(); }
function uid(p) { return p + Math.random().toString(36).slice(2, 8); }

/* ---------- lookups ---------- */
const col = id => db.colonies.find(c => c.id === id);
const yardOf = id => db.yards.find(y => y.id === id);
const activeIn = yardId => db.colonies.filter(c => c.status === "active" && (!yardId || c.yardId === yardId));
const visitsOf = id => db.visits.filter(v => v.colonyId === id).sort((a, b) => a.date.localeCompare(b.date));
const lastVisit = id => visitsOf(id).slice(-1)[0];
const mitesOf = id => db.mites.filter(m => m.colonyId === id).sort((a, b) => a.date.localeCompare(b.date));
const feedsOf = id => db.feeds.filter(f => f.colonyId === id).sort((a, b) => a.date.localeCompare(b.date));
const treatsOf = id => db.treatments.filter(t => t.colonyId === id).sort((a, b) => a.start.localeCompare(b.start));
const eventsOf = id => db.events.filter(e => e.colonyId === id).sort((a, b) => a.date.localeCompare(b.date));

function storesSeries(id) {
  const pts = visitsOf(id).filter(v => v.storesLb != null).map(v => [v.date, v.storesLb]);
  const by = {}; pts.forEach(p => { by[p[0]] = p[1]; });   // one point per day (the later reading wins)
  return Object.entries(by).sort((a, b) => a[0].localeCompare(b[0]));
}
function broodSeries(id) { return visitsOf(id).filter(v => v.broodFrames != null).map(v => [v.date, v.broodFrames]); }

function nextNum(type) {
  const re = type === "nuc" ? /^(?:nuc\s*|#)(\d+)$/i : /^hive\s*(\d+)$/i;
  let max = 0;
  db.colonies.forEach(c => { const m = String(c.name).trim().match(re); if (m) max = Math.max(max, +m[1]); });
  return max + 1;
}
function addEvent(colonyId, kind, text, date = TODAY) { db.events.push({ colonyId, date, kind, text }); }

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

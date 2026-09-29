/* ==========================================================
   StockPulse Pro — Adobe Stock Market Intelligence Engine
   Live cloud scraping via Apify + offline Demo Mode
   ========================================================== */

const APIFY_BASE = "https://api.apify.com/v2";
const ACTOR_ID = "kawsar~adobe-stock-scraper"; // Anti-bot Adobe Stock scraper actor

// ---------------- Tiny helpers ----------------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
};
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 + a); t = (t + Math.imul(t ^ (t >>> 7), 61 + t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function copyText(text, msg) {
  const done = () => showToast(msg || "Copied to clipboard!", "success");
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); done(); } catch (e) { showToast("Copy failed", "error"); }
  ta.remove();
}
function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function showToast(msg, type = "info") {
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  $("toasts").appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .4s"; setTimeout(() => t.remove(), 400); }, 4200);
}

// ---------------- Field normalizers (tolerant of actor output shapes) ----------------
const first = (o, keys) => { for (const k of keys) { if (o?.[k] !== undefined && o?.[k] !== null && o?.[k] !== "") return o[k]; } return null; };
const num = (v) => { const n = parseInt(String(v).replace(/[^\d]/g, ""), 10); return isNaN(n) ? null : n; };
function getId(o) { return first(o, ["id", "assetId", "asset_id"]) ?? 0; }
function getTitle(o) { return first(o, ["title", "name", "assetTitle"]) || "Untitled Asset"; }
function getThumb(o) { return first(o, ["thumb500Url", "thumbUrl", "thumb1000Url", "compUrl", "thumbnail_url", "preview_url", "thumbnail"]) || ""; }
function getCreator(o) { return first(o, ["creatorName", "creator_name", "creator", "author", "contributor"]) || "Contributor"; }
function getDownloads(o) { return num(first(o, ["downloadCount", "nb_downloads", "downloads", "sales"])); }
function getViews(o) { return num(first(o, ["viewCount", "nb_views", "views", "impressions"])); }
function isAiItem(o) { const v = first(o, ["isGenerativeAi", "is_gentech", "generativeAi", "ai", "isAI"]); return v === true || v === "true" || v === 1 || v === "1" || v === "yes"; }
function getCreated(o) { return first(o, ["createdAt", "created_at", "date", "uploadDate"]) || ""; }
function getType(o) {
  const v = String(first(o, ["assetType", "asset_type", "media_type", "mediaType", "type"]) || "other").toLowerCase();
  if (v.includes("photo")) return "photo";
  if (v.includes("illustr")) return "illustration";
  if (v.includes("vector")) return "vector";
  if (v.includes("video")) return "video";
  if (v.includes("template")) return "template";
  if (v.includes("3d")) return "3d";
  if (v.includes("audio")) return "audio";
  return v === "all" || v === "other" || !v ? "other" : v;
}
function getKeywords(o) {
  const v = first(o, ["keywords", "tags", "searchTerms", "search_terms", "tag_list", "keyword_list", "asset_keywords"]);
  if (Array.isArray(v)) return v.map((k) => (typeof k === "string" ? k : k?.name || k?.keyword || "")).filter(Boolean);
  if (typeof v === "string") return v.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  return [];
}
function getUrl(o) {
  const u = first(o, ["url", "detailsUrl", "details_url", "pageUrl", "page_url"]);
  if (u) return u;
  const id = getId(o);
  return id ? `https://stock.adobe.com/id/${id}` : "https://stock.adobe.com/";
}

// ---------------- Application state ----------------
const state = {
  rawItems: [],
  scored: [],
  tokens: [],
  activeToken: "",
  activeRunId: null,
  pollTimer: null,
  elapsedTimer: null,
  running: false,
  mode: "idle", // idle | live | demo
  view: "grid",
  library: [],
};

// ---------------- Persistence ----------------
function loadPersisted() {
  try { state.tokens = JSON.parse(localStorage.getItem("spp_tokens") || "[]"); } catch { state.tokens = []; }
  try { state.library = JSON.parse(localStorage.getItem("spp_library") || "[]"); } catch { state.library = []; }
  state.activeToken = state.tokens[0] || "";
  refreshConnDot();
  renderLibraryBadge();
}
function refreshConnDot() { $("connDot").classList.toggle("on", !!state.activeToken); }
function renderLibraryBadge() { $("libraryCount").textContent = state.library.length; }

// ---------------- Engine pill ----------------
function setEngine(mode, label, modeText) {
  state.mode = mode;
  const pill = $("enginePill");
  pill.classList.toggle("demo", mode === "demo");
  const dot = $("engineDot");
  dot.className = "dot " + (mode === "live-run" ? "dot-run" : mode === "idle" ? "dot-idle" : "dot-live");
  $("engineLabel").textContent = label;
  $("engineMode").textContent = modeText;
}

// ---------------- Live Apify scraper ----------------
// Public-data competition recipes for non-Adobe markets (Apify web-scraper)
const GENERIC_PF = `async () => {
  await new Promise(r => setTimeout(r, 3500));
  const out = [];
  document.querySelectorAll('img[alt]').forEach(img => {
    const alt = (img.alt || '').trim();
    if (alt.length > 8 && out.length < 100) out.push({
      title: alt, assetType: 'other',
      keywords: alt.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2).slice(0, 12)
    });
  });
  return out;
}`;
const SEARCH_URLS = {
  shutterstock: (q) => `https://www.shutterstock.com/search?searchterm=${encodeURIComponent(q)}`,
  freepik: (q) => `https://www.freepik.com/search?format=search&query=${encodeURIComponent(q)}`,
  vecteezy: (q) => `https://www.vecteezy.com/free-vector/${encodeURIComponent(q).replace(/%20/g, "-")}`,
  istock: (q) => `https://www.istockphoto.com/search/2?phrase=${encodeURIComponent(q)}`,
  dreamstime: (q) => `https://www.dreamstime.com/photos-vectors/${encodeURIComponent(q).replace(/%20/g, "-")}`,
  vectorstock: (q) => `https://www.vectorstock.com/royalty-free-vectors/${encodeURIComponent(q).replace(/%20/g, "-")}-vectors`,
  "123rf": (q) => `https://www.123rf.com/stock-photo/${encodeURIComponent(q).replace(/%20/g, "_")}.html`,
  depositphotos: (q) => `https://depositphotos.com/photos/${encodeURIComponent(q).replace(/%20/g, "-")}.html`,
  graphicriver: (q) => `https://graphicriver.net/search?term=${encodeURIComponent(q)}`,
};

async function runLiveScraper(params) {
  const market = params.market || "adobe";
  const actorCustom = MARKETS.actorFor(market);
  let payload;
  let actor = actorCustom;
  if (!actor) {
    // No custom actor → generic public-data competition scan via Apify web-scraper
    actor = "apify/web-scraper";
    const urlFn = SEARCH_URLS[market] || SEARCH_URLS.shutterstock;
    payload = {
      startUrls: [{ url: urlFn(params.query || "vector") }],
      pageFunction: GENERIC_PF,
      proxyConfiguration: { useApifyProxy: true },
      maxRequestsPerCrawl: 1,
    };
    showToast(`${MARKETS.name(market)}: live competition scan via Apify web-scraper (public data)`, "info");
  } else {
    payload = {
      assetType: params.assetType,
      order: params.order,
      aiFilter: params.aiFilter,
      maxItems: params.maxItems,
      proxyConfiguration: { useApifyProxy: true },
    };
    if (params.query) payload.query = params.query;
  }
  setRunning(true);
  setEngine("live-run", "Cloud Scraper Engine", "Apify Proxy Active");
  $("runModeTag").textContent = "LIVE MODE — APIFY PROXY";
  $("runModeTag").classList.remove("demo");
  updateRunStatus("Starting Cloud Scraper...", "Connecting to Apify Proxy Engine...", 8);

  try {
    const runRes = await fetch(`${APIFY_BASE}/actors/${actor}/runs?token=${encodeURIComponent(state.activeToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!runRes.ok) {
      const errData = await runRes.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `HTTP ${runRes.status}: Failed to start scraper. Check your Apify token.`);
    }
    const runData = await runRes.json();
    state.activeRunId = runData?.data?.id;
    const datasetId = runData?.data?.defaultDatasetId;
    if (!state.activeRunId || !datasetId) throw new Error("Invalid response from Apify: missing run/dataset ID.");

    updateRunStatus("Scraping Live Adobe Stock...", "Bypassing bot mitigation via Apify Proxy & extracting records...", 20);
    const startTime = Date.now();
    state.elapsedTimer = setInterval(() => {
      const s = Math.floor((Date.now() - startTime) / 1000);
      $("runTimeElapsed").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    }, 1000);

    state.pollTimer = setInterval(async () => {
      try {
        const checkRes = await fetch(`${APIFY_BASE}/actor-runs/${state.activeRunId}?token=${encodeURIComponent(state.activeToken)}`);
        const checkData = await checkRes.json();
        const status = checkData?.data?.status;

        const itemsRes = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${encodeURIComponent(state.activeToken)}&format=json&clean=true`);
        if (itemsRes.ok) {
          const items = await itemsRes.json();
          if (Array.isArray(items) && items.length) {
            mergeItems(items);
            updateRunStatus(`Extracted ${state.rawItems.length} Real Assets`, "Streaming verified market data...", Math.min(95, Math.round((state.rawItems.length / params.maxItems) * 80) + 15));
          }
        }

        if (status === "SUCCEEDED") {
          finishRun(`Collected ${state.rawItems.length} real assets from Adobe Stock.`);
          showToast(`Successfully extracted ${state.rawItems.length} live assets!`, "success");
          setEngine("live", "Cloud Scraper Engine", "Apify Proxy Active");
        } else if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
          stopTimers();
          setRunning(false);
          setEngine("idle", "Cloud Scraper Engine", "Apify Proxy Ready");
          showToast(checkData?.data?.statusMessage || `Actor run ended: ${status}`, "error");
        }
      } catch (e) { console.warn("poll retry:", e); }
    }, 2500);
  } catch (err) {
    setRunning(false);
    setEngine("idle", "Cloud Scraper Engine", "Apify Proxy Ready");
    showToast(err.message, "error");
  }
}
function mergeItems(items) {
  const seen = new Set(state.rawItems.map((i) => getId(i)));
  for (const it of items) {
    const id = getId(it);
    if (!seen.has(id)) { state.rawItems.push(it); seen.add(id); }
  }
  applyFiltersAndSort();
}
function finishRun(msg) {
  stopTimers();
  updateRunStatus("Extraction Complete!", msg, 100);
  setTimeout(() => setRunning(false), 900);
}
function stopTimers() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  if (state.elapsedTimer) clearInterval(state.elapsedTimer);
  state.pollTimer = state.elapsedTimer = null;
}
function stopCurrentRun() {
  stopTimers();
  if (state.activeRunId && state.activeToken) {
    fetch(`${APIFY_BASE}/actor-runs/${state.activeRunId}/abort?token=${encodeURIComponent(state.activeToken)}`, { method: "POST" }).catch(() => {});
  }
  setRunning(false);
  setEngine("idle", "Cloud Scraper Engine", "Apify Proxy Ready");
  showToast("Extraction cancelled", "info");
}
function setRunning(on) {
  state.running = on;
  $("analyzeBtn").disabled = on;
  $("stopBtn").style.display = on ? "block" : "none";
  $("runCard").style.display = on ? "block" : "none";
}
function updateRunStatus(title, sub, pct) {
  $("runStepTitle").textContent = title;
  $("runSubtext").textContent = sub;
  $("runPct").textContent = pct + "%";
  $("progressBarFill").style.width = pct + "%";
}

// ---------------- Demo dataset generator ----------------
function demoThumb(hue, type, rnd) {
  const h2 = (hue + 45) % 360;
  let motif = "";
  if (type === "photo") motif = `<circle cx='${120 + rnd() * 60}' cy='70' r='26' fill='hsla(${h2},80%,70%,.85)'/><path d='M0 190 L90 90 L150 160 L210 100 L300 190 Z' fill='hsla(${h2},60%,40%,.9)'/>`;
  else if (type === "vector") motif = `<path d='M60 160 C 90 60, 200 60, 240 150' stroke='hsla(${h2},85%,70%,.95)' stroke-width='10' fill='none' stroke-linecap='round'/><circle cx='60' cy='160' r='10' fill='#fff'/><circle cx='240' cy='150' r='10' fill='#fff'/>`;
  else if (type === "illustration") motif = `<circle cx='110' cy='110' r='42' fill='hsla(${h2},80%,65%,.85)'/><circle cx='185' cy='135' r='28' fill='hsla(${(hue + 90) % 360},80%,60%,.8)'/><circle cx='150' cy='80' r='16' fill='hsla(${(hue + 180) % 360},80%,70%,.8)'/>`;
  else motif = `<rect x='80' y='60' width='140' height='90' rx='14' fill='hsla(${h2},75%,60%,.85)'/><path d='M95 130 l35 -35 l30 30 l25 -25 l40 40' stroke='#fff' stroke-width='7' fill='none'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='225'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue},55%,16%)'/><stop offset='1' stop-color='hsl(${h2},60%,30%)'/></linearGradient></defs><rect width='300' height='225' fill='url(#g)'/>${motif}</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
function generateDemo(params) {
  const q = (params.query || "abstract background").trim();
  const mkt = (typeof MARKETS !== "undefined") ? MARKETS.get(params.market || "adobe") : { mult: 1 };
  const rnd = mulberry32(hashStr(q + "|" + params.assetType + "|" + (params.market || "adobe")));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  let types;
  if (["photo", "illustration", "vector", "video", "template", "3d", "audio"].includes(params.assetType)) types = [params.assetType];
  else if (params.assetType === "images") types = ["vector", "illustration", "photo"];
  else types = ["vector", "photo", "illustration", "video"];

  const creators = ["Kawsar Vector Lab", "NightOwl Graphics", "PixelCraft Studio", "Nadia Creates", "InkLine Studio", "MegaVectors", "CreativeBD Art", "Studio Rhino", "Moonlight Graphics", "Artisan Hue", "VectorVault", "SilhouetteWorks"];
  const styles = ["silhouette", "vector illustration", "logo design", "icon set", "watercolor clipart", "line art", "flat design", "minimalist graphic", "vintage poster", "cartoon style", "background pattern", "sticker design", "tattoo design", "emblem badge", "hand drawn", "modern template"];
  const extras = ["isolated on white", "dark style", "premium quality", "for print and web", "editable layers", "trending style", "high detail", "clean shapes"];
  const kwPool = [...q.toLowerCase().split(/\s+/).filter(Boolean), "vector", "illustration", "design", "graphic", "silhouette", "shape", "symbol", "icon", "art", "style", "modern", "creative", "element", "logo", "clipart", "isolated", "background", "decoration", "template", "black", "white", "animal", "cute", "artwork"];

  const items = [];
  const count = params.maxItems;
  for (let i = 0; i < count; i++) {
    const type = pick(types);
    const title = `${q.replace(/\b\w/g, (c) => c.toUpperCase())} ${pick(styles)}${rnd() < 0.5 ? ", " + pick(extras) : ""}`;
    let downloads = Math.floor(Math.pow(10, 1 + rnd() * 3.2) * (0.3 + rnd()));
    if (rnd() < 0.07) downloads *= 4; // viral outliers
    downloads = Math.max(1, Math.round(downloads * (mkt.mult || 1)));
    const views = downloads * (14 + Math.floor(rnd() * 30));
    const ai = rnd() < 0.38;
    const daysAgo = Math.floor(rnd() * 1000);
    const created = new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
    const kws = [...new Set([...q.toLowerCase().split(/\s+/).filter(Boolean), ...Array.from({ length: 10 + Math.floor(rnd() * 8) }, () => pick(kwPool))])];
    items.push({
      id: 250000000 + Math.floor(rnd() * 90000000),
      title,
      assetType: type,
      downloadCount: downloads,
      viewCount: views,
      isGenerativeAi: ai,
      creatorName: pick(creators),
      createdAt: created,
      keywords: kws,
      thumb500Url: demoThumb(Math.floor(rnd() * 360), type, rnd),
      _demo: true,
    });
  }
  let filtered = items;
  if (params.aiFilter === "exclude") filtered = items.filter((i) => !i.isGenerativeAi);
  if (params.aiFilter === "only") filtered = items.filter((i) => i.isGenerativeAi);
  if (params.order === "downloads") filtered.sort((a, b) => b.downloadCount - a.downloadCount);
  if (params.order === "newest") filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return filtered;
}
function runDemo(params) {
  setRunning(true);
  setEngine("demo", "Simulation Engine", "Demo Data (Offline)");
  $("runModeTag").textContent = "DEMO MODE — SIMULATED DATA";
  $("runModeTag").classList.add("demo");
  state.rawItems = [];
  applyFiltersAndSort();
  const all = generateDemo(params);
  updateRunStatus("Generating Demo Niche...", "Simulating Adobe Stock extraction pipeline...", 12);

  let idx = 0;
  const chunk = Math.max(4, Math.round(all.length / 8));
  const t0 = Date.now();
  state.elapsedTimer = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    $("runTimeElapsed").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }, 1000);

  state.pollTimer = setInterval(() => {
    idx = Math.min(all.length, idx + chunk);
    mergeItems(all.slice(0, idx));
    updateRunStatus(`Extracted ${idx} Assets`, "Streaming simulated market records...", Math.min(96, Math.round((idx / all.length) * 90) + 8));
    if (idx >= all.length) {
      finishRun(`Demo complete — ${all.length} simulated assets for "${params.query}".`);
      showToast(`Demo dataset ready: ${all.length} assets. Connect a token for live data.`, "success");
    }
  }, 350);
}

// ---------------- Analytics ----------------
function computeScores(items) {
  const maxDl = Math.max(1, ...items.map((i) => getDownloads(i) || 0));
  const maxVw = Math.max(1, ...items.map((i) => getViews(i) || 0));
  state.scored = new Map(items.map((i) => {
    const dl = getDownloads(i) || 0, vw = getViews(i) || 0;
    const s = Math.round(100 * (0.7 * (Math.log10(dl + 1) / Math.log10(maxDl + 1)) + 0.3 * (Math.log10(vw + 1) / Math.log10(maxVw + 1))));
    return [getId(i), s];
  }));
}
const getScore = (i) => state.scored.get(getId(i)) ?? 0;

function statsFor(items) {
  const dls = items.map(getDownloads).filter((d) => d !== null);
  const vws = items.map(getViews).filter((v) => v !== null);
  const totalDl = dls.reduce((a, b) => a + b, 0);
  const totalVw = vws.reduce((a, b) => a + b, 0);
  const med = median(dls);
  const aiPct = items.length ? Math.round((items.filter(isAiItem).length / items.length) * 100) : 0;
  let opp = 50;
  if (totalDl > 0 && items.length) {
    const high = dls.filter((d) => d > med).length;
    opp = Math.min(99, Math.max(15, Math.min(50, Math.round(Math.log10(totalDl + 1) * 12)) + Math.round((high / items.length) * 50)));
  }
  return { assets: items.length, totalDl, totalVw, med, aiPct, opp };
}

function updateAnalytics(items) {
  const has = items.length > 0;
  ["exportCsvBtn", "exportJsonBtn", "saveLibraryBtn"].forEach((id) => ($(id).disabled = !has));
  if (!has) {
    ["kpiAssets", "kpiDownloads", "kpiViews", "kpiMedian"].forEach((id) => ($(id).textContent = "—"));
    $("kpiOpportunity").textContent = "—";
    $("scoreCircleFill").setAttribute("stroke-dasharray", "0, 100");
    $("scoreRatingText").textContent = "Awaiting Data";
    $("scoreRatingText").style.color = "var(--accent-emerald)";
    $("insightsBar").style.display = "none";
    return;
  }

  const dls = items.map(getDownloads).filter((d) => d !== null);
  const vws = items.map(getViews).filter((v) => v !== null);
  const totalDl = dls.reduce((a, b) => a + b, 0);
  const totalVw = vws.reduce((a, b) => a + b, 0);
  const med = median(dls);

  let opp = 50;
  if (totalDl > 0) {
    const high = dls.filter((d) => d > med).length;
    const velocity = Math.min(50, Math.round(Math.log10(totalDl + 1) * 12));
    const consistency = Math.round((high / items.length) * 50);
    opp = Math.min(99, Math.max(15, velocity + consistency));
  }

  $("kpiAssets").textContent = fmt(items.length);
  $("kpiDownloads").textContent = fmt(totalDl);
  $("kpiViews").textContent = fmt(totalVw);
  $("kpiMedian").textContent = fmt(med);
  $("kpiOpportunity").textContent = opp;
  $("scoreCircleFill").setAttribute("stroke-dasharray", `${opp}, 100`);

  const rating = $("scoreRatingText");
  if (opp >= 75) { rating.textContent = "High Opportunity 🔥"; rating.style.color = "var(--accent-emerald)"; $("scoreCircleFill").style.stroke = "var(--accent-emerald)"; }
  else if (opp >= 50) { rating.textContent = "Moderate Potential ⭐"; rating.style.color = "var(--accent-cyan)"; $("scoreCircleFill").style.stroke = "var(--accent-cyan)"; }
  else { rating.textContent = "Saturated Niche ⚠️"; rating.style.color = "var(--accent-amber)"; $("scoreCircleFill").style.stroke = "var(--accent-amber)"; }

  const aiCount = items.filter(isAiItem).length;
  const aiPct = Math.round((aiCount / items.length) * 100);
  $("aiSaturationBar").style.width = aiPct + "%";
  $("aiSaturationText").textContent = `${aiPct}% (${aiCount}/${items.length})`;

  const cmap = {};
  items.forEach((it) => {
    const n = getCreator(it);
    cmap[n] = cmap[n] || { count: 0, downloads: 0 };
    cmap[n].count++;
    cmap[n].downloads += getDownloads(it) || 0;
  });
  const sorted = Object.entries(cmap).sort((a, b) => b[1].downloads - a[1].downloads);
  $("topCreatorTag").textContent = sorted[0] ? `${sorted[0][0]} (${fmt(sorted[0][1].downloads)} dl)` : "—";

  const highCount = dls.filter((d) => d > med).length;
  $("highPerformerRatio").textContent = `${Math.round((highCount / items.length) * 100)}% beats median`;
  $("insightsBar").style.display = "flex";

  renderDistChart(dls);
  renderAiChart(aiCount, items.length - aiCount);
  renderMediaChart(items);
  renderKeywordCloud(items);
  renderCreatorsTable(sorted);
}

// ---------------- Charts ----------------
function renderDistChart(list) {
  const brackets = [
    { label: "0 - 100", count: 0, color: "#64748b" },
    { label: "101 - 500", count: 0, color: "#06b6d4" },
    { label: "501 - 1K", count: 0, color: "#6366f1" },
    { label: "1K - 5K", count: 0, color: "#a855f7" },
    { label: "5K+", count: 0, color: "#ec4899" },
  ];
  list.forEach((v) => {
    if (v <= 100) brackets[0].count++;
    else if (v <= 500) brackets[1].count++;
    else if (v <= 1000) brackets[2].count++;
    else if (v <= 5000) brackets[3].count++;
    else brackets[4].count++;
  });
  const max = Math.max(1, ...brackets.map((b) => b.count));
  $("downloadDistChart").innerHTML = brackets.map((b) => `
    <div class="chart-bar-row">
      <span class="chart-bar-label">${b.label}</span>
      <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${Math.round((b.count / max) * 100)}%;background:${b.color}"></div></div>
      <span class="chart-bar-val">${b.count}</span>
    </div>`).join("");
}
function renderAiChart(ai, human) {
  const total = Math.max(1, ai + human);
  const aiPct = Math.round((ai / total) * 100);
  $("aiCompositionChart").innerHTML = `
    <div class="donut-wrap">
      <svg viewBox="0 0 42 42" width="130" height="130" style="transform:rotate(-90deg)">
        <circle cx="21" cy="21" r="15" fill="none" stroke="#34d399" stroke-width="7" pathLength="100" stroke-dasharray="${100 - aiPct}, 100" stroke-dashoffset="${-aiPct}"></circle>
        <circle cx="21" cy="21" r="15" fill="none" stroke="#a855f7" stroke-width="7" pathLength="100" stroke-dasharray="${aiPct}, 100"></circle>
        <text x="21" y="21" text-anchor="middle" dominant-baseline="central" fill="#e6e9f0" font-size="9" font-weight="800" transform="rotate(90 21 21)">${aiPct}%</text>
      </svg>
      <div class="donut-legend">
        <div class="legend-row"><span class="legend-swatch" style="background:#a855f7"></span> Generative AI <strong>${ai}</strong></div>
        <div class="legend-row"><span class="legend-swatch" style="background:#34d399"></span> Human / Traditional <strong>${human}</strong></div>
      </div>
    </div>`;
}
function renderMediaChart(items) {
  const counts = {};
  items.forEach((i) => { const t = getType(i); counts[t] = (counts[t] || 0) + 1; });
  const colors = { vector: "#a855f7", photo: "#3b82f6", illustration: "#ec4899", video: "#34d399", template: "#f59e0b", "3d": "#22d3ee", audio: "#f43f5e", other: "#64748b" };
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  $("mediaTypeChart").innerHTML = entries.map(([t, c]) => `
    <div class="chart-bar-row">
      <span class="chart-bar-label">${esc(t)}</span>
      <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${Math.round((c / max) * 100)}%;background:${colors[t] || "#64748b"}"></div></div>
      <span class="chart-bar-val">${c}</span>
    </div>`).join("") || `<p class="chart-sub">No data</p>`;
}
function renderKeywordCloud(items) {
  const freq = {};
  items.forEach((i) => getKeywords(i).forEach((k) => { const key = k.toLowerCase(); freq[key] = (freq[key] || 0) + 1; }));
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 28);
  $("keywordCloud").innerHTML = top.map(([k, n]) =>
    `<span class="kw-chip" style="font-size:${11 + Math.min(7, n)}px">${esc(k)}<span class="n">×${n}</span></span>`).join("") || `<p class="chart-sub">No keywords extracted</p>`;
}
function renderCreatorsTable(sorted) {
  $("creatorsTableBody").innerHTML = sorted.slice(0, 10).map(([name, m], i) => `
    <tr>
      <td><span class="rank-badge rank-${i + 1}">${i + 1}</span></td>
      <td><strong style="color:var(--text)">${esc(name)}</strong></td>
      <td>${m.count}</td>
      <td><span class="stat-highlight">${fmt(m.downloads)}</span></td>
      <td>${fmt(Math.round(m.downloads / m.count))}</td>
      <td><a href="https://stock.adobe.com/search?creator=${encodeURIComponent(name)}" target="_blank" rel="noopener">Profile ↗</a></td>
    </tr>`).join("");
}

// ---------------- Grid rendering ----------------
function getFiltered() {
  let items = [...state.rawItems];
  const t = $("fType").value, a = $("fAi").value, s = $("fSort").value;
  if (t !== "all") items = items.filter((i) => getType(i) === t);
  if (a === "ai") items = items.filter(isAiItem);
  if (a === "human") items = items.filter((i) => !isAiItem(i));
  const cmp = {
    downloads: (x, y) => (getDownloads(y) || 0) - (getDownloads(x) || 0),
    views: (x, y) => (getViews(y) || 0) - (getViews(x) || 0),
    score: (x, y) => getScore(y) - getScore(x),
    newest: (x, y) => String(getCreated(y)).localeCompare(String(getCreated(x))),
    oldest: (x, y) => String(getCreated(x)).localeCompare(String(getCreated(y))),
  }[s];
  return items.sort(cmp);
}
function applyFiltersAndSort() {
  computeScores(state.rawItems);
  const items = getFiltered();
  $("gridCount").textContent = items.length;
  $("emptyState").style.display = state.rawItems.length ? "none" : "block";
  $("assetsGrid").style.display = state.rawItems.length ? "grid" : "none";
  $("assetsGrid").classList.toggle("list-view", state.view === "list");
  $("gridFooter").textContent = state.rawItems.length ? `Showing 1-${items.length} of ${items.length} filtered items (${state.rawItems.length} extracted total)` : "";

  const med = median(state.rawItems.map(getDownloads).filter((d) => d !== null));
  $("assetsGrid").innerHTML = items.map((it) => {
    const dl = getDownloads(it) || 0;
    const type = getType(it), ai = isAiItem(it);
    const hot = dl > med * 1.5 && med > 0;
    const thumb = getThumb(it) || demoThumb(hashStr(getTitle(it)) % 360, type, mulberry32(getId(it) || 1));
    return `
    <div class="asset-card" data-id="${esc(getId(it))}">
      <div class="asset-thumb">
        <img loading="lazy" src="${esc(thumb)}" alt="${esc(getTitle(it))}">
        <div class="thumb-badges">
          <span class="badge-pill badge-${type}">${type}</span>
          <span class="badge-pill ${ai ? "badge-ai" : "badge-human"}">${ai ? "AI" : "Human"}</span>
        </div>
      </div>
      <div class="asset-body">
        <div class="asset-title">${esc(getTitle(it))}</div>
        <span class="card-creator">👤 ${esc(getCreator(it))}</span>
        <div class="card-stats">
          <span class="${hot ? "hot" : ""}">${hot ? "🔥" : "⬇"} ${fmt(dl)} dl</span>
          <span>👁 ${fmt(getViews(it) || 0)}</span>
          <span>⚡${getScore(it)}</span>
        </div>
      </div>
    </div>`;
  }).join("");
  updateAnalytics(items);
}

// ---------------- Asset detail modal ----------------
let currentAsset = null;
function openAsset(id) {
  const it = state.rawItems.find((i) => String(getId(i)) === String(id));
  if (!it) return;
  currentAsset = it;
  const type = getType(it), ai = isAiItem(it);
  $("mImg").src = getThumb(it) || demoThumb(hashStr(getTitle(it)) % 360, type, mulberry32(getId(it) || 1));
  $("mTypeBadge").textContent = type;
  $("mTypeBadge").className = `badge-pill badge-${type}`;
  $("mAiBadge").textContent = ai ? "Generative AI" : "Human Made";
  $("mAiBadge").className = `badge-pill ${ai ? "badge-ai" : "badge-human"}`;
  $("mId").textContent = getId(it);
  $("mTitle").textContent = getTitle(it);
  $("mCreatorName").textContent = getCreator(it);
  $("mDate").textContent = "Uploaded: " + (getCreated(it) || "—");
  $("mProfileLink").href = `https://stock.adobe.com/search?creator=${encodeURIComponent(getCreator(it))}`;
  $("mDownloads").textContent = fmt(getDownloads(it) || 0);
  $("mViews").textContent = fmt(getViews(it) || 0);
  $("mScore").textContent = getScore(it);
  const kws = getKeywords(it);
  $("mKwCount").textContent = kws.length;
  $("mKeywords").innerHTML = kws.map((k) => `<span class="kw-badge" data-kw="${esc(k)}">${esc(k)}</span>`).join("") || `<span class="chart-sub">No keywords available</span>`;
  $("mOpenAdobe").href = getUrl(it);
  $("assetModal").hidden = false;
}

// ---------------- Exports & library ----------------
function exportCSV() {
  const rows = [["id", "title", "type", "generative_ai", "downloads", "views", "score", "creator", "created_at", "url", "keywords"]];
  state.rawItems.forEach((i) => rows.push([
    getId(i), getTitle(i), getType(i), isAiItem(i) ? "yes" : "no", getDownloads(i) ?? 0, getViews(i) ?? 0,
    getScore(i), getCreator(i), getCreated(i), getUrl(i), getKeywords(i).join("; "),
  ]));
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadFile(`stockpulse_${Date.now()}.csv`, csv, "text/csv");
  showToast("CSV exported", "success");
}
function exportJSON() {
  downloadFile(`stockpulse_${Date.now()}.json`, JSON.stringify(state.rawItems, null, 2), "application/json");
  showToast("JSON exported", "success");
}
function saveBookmark(title) {
  const p = currentParams();
  const snap = { at: Date.now(), stats: statsFor(state.rawItems) };
  const keyQ = (p.query || "") + "|" + (p.market || "adobe");
  let entry = state.library.find((e) => ((e.params?.query || "") + "|" + (e.params?.market || "adobe")) === keyQ);
  let alerts = [];
  if (entry) {
    // watchlist refresh: append history snapshot + detect threshold alerts
    entry.history = entry.history || [];
    const prev = entry.history[entry.history.length - 1];
    entry.history.push(snap);
    if (entry.history.length > 12) entry.history = entry.history.slice(-12);
    entry.savedAt = new Date().toISOString();
    entry.items = state.rawItems;
    if (title) entry.title = title;
    alerts = alertsFor(prev?.stats, snap.stats);
  } else {
    entry = {
      id: Date.now(),
      title: title || p.query || "Untitled search",
      savedAt: new Date().toISOString(),
      params: p,
      items: state.rawItems,
      history: [snap],
    };
    state.library.unshift(entry);
  }
  try {
    localStorage.setItem("spp_library", JSON.stringify(state.library));
  } catch {
    state.library = state.library.slice(0, 5);
    localStorage.setItem("spp_library", JSON.stringify(state.library));
    showToast("Storage full — kept only newest entries", "error");
  }
  renderLibraryBadge();
  alerts.forEach((a) => showToast("🔔 Watchlist alert: " + a, "error"));
  showToast(alerts.length ? `Watchlist updated — ${alerts.length} alert(s)!` : `"${entry.title}" saved to watchlist`, "success");
}
function renderLibrary() {
  const list = $("libraryList");
  if (!state.library.length) { list.innerHTML = `<div class="lib-empty">No saved searches yet. Run an analysis and hit ⭐ Bookmark Search.</div>`; return; }
  list.innerHTML = state.library.map((e) => {
    const h = e.history || [];
    let delta = "";
    if (h.length >= 2) {
      const a = h[h - 2].stats, b = h[h - 1].stats;
      const d = b.opp - a.opp, da = b.assets - a.assets;
      delta = ` • Δscore ${d >= 0 ? "+" : ""}${d} • Δassets ${da >= 0 ? "+" : ""}${da}${alertsFor(a, b).length ? " 🔔" : ""}`;
    }
    return `
    <div class="lib-item">
      <div class="li-body">
        <div class="li-title">⭐ ${esc(e.title)} <span class="li-meta">(${(h.length || 1)} scan${(h.length || 1) > 1 ? "s" : ""})</span></div>
        <div class="li-meta">${e.items.length} assets • ${new Date(e.savedAt).toLocaleDateString()} • "${esc(e.params?.query || "")}" @ ${esc(MARKETS.name(e.params?.market || "adobe"))}${delta}</div>
      </div>
      <button class="ghost-btn small" data-load="${e.id}">Load</button>
      <button class="ghost-btn small" data-del="${e.id}">🗑</button>
    </div>`;
  }).join("");
}
function loadLibraryEntry(id) {
  const e = state.library.find((x) => x.id === Number(id));
  if (!e) return;
  $("queryInput").value = e.params.query || "";
  $("assetTypeSelect").value = e.params.assetType || "all";
  $("orderSelect").value = e.params.order || "downloads";
  $("aiFilterSelect").value = e.params.aiFilter || "all";
  $("limitRange").value = e.params.maxItems || 50;
  $("limitBadge").textContent = `${$("limitRange").value} items`;
  state.rawItems = e.items || [];
  setEngine(e.items?.[0]?._demo ? "demo" : "live", e.items?.[0]?._demo ? "Simulation Engine" : "Cloud Scraper Engine", e.items?.[0]?._demo ? "Demo Data (Offline)" : "Loaded from Library");
  $("activeQuerySubtitle").textContent = `Loaded from library: ${e.title}`;
  applyFiltersAndSort();
  $("libraryModal").hidden = true;
  showToast(`Loaded "${e.title}"`, "info");
}

// ---------------- Tokens ----------------
function renderTokens() {
  $("tokensList").innerHTML = state.tokens.map((t, i) => `
    <div class="token-row">
      <input type="password" data-tokidx="${i}" value="${esc(t)}" autocomplete="off">
      <span class="token-status" data-status="${i}">—</span>
      <button class="token-del" data-deltok="${i}" title="Remove">✕</button>
    </div>`).join("") || `<p class="chart-sub">No tokens yet — paste one below.</p>`;
}
async function testTokens() {
  const rows = [...document.querySelectorAll("[data-status]")];
  for (const row of rows) {
    const i = Number(row.dataset.status);
    const val = state.tokens[i];
    row.textContent = "...";
    row.className = "token-status";
    try {
      const res = await fetch(`${APIFY_BASE}/users/me?token=${encodeURIComponent(val)}`);
      if (res.ok) {
        const d = await res.json();
        row.textContent = "✓ Valid";
        row.className = "token-status ok";
        showToast(`Token ${i + 1} valid — plan: ${d?.data?.plan || "FREE"}`, "success");
      } else { row.textContent = "✗ Invalid"; row.className = "token-status bad"; }
    } catch { row.textContent = "✗ Net err"; row.className = "token-status bad"; }
  }
}

// ---------------- Params & analyze ----------------
function currentParams() {
  return {
    query: $("queryInput").value.trim(),
    market: $("marketSelect")?.value || "adobe",
    assetType: $("assetTypeSelect").value,
    order: $("orderSelect").value,
    aiFilter: $("aiFilterSelect").value,
    maxItems: Number($("limitRange").value),
  };
}
function analyze(forceDemo = false) {
  if (state.running) return;
  const p = currentParams();
  $("activeQuerySubtitle").textContent = `Market: ${MARKETS.name(p.market)} • Query: "${p.query || "(browse all)"}" • Category: ${p.assetType.toUpperCase()} • Sort: ${p.order} • AI: ${p.aiFilter} • ${forceDemo || !state.activeToken ? "Demo Simulation" : "Via Apify Proxy"}`;
  state.rawItems = [];
  applyFiltersAndSort();
  if (!forceDemo && state.activeToken) runLiveScraper(p);
  else {
    if (!state.activeToken) showToast("No Apify token connected — running Demo Mode instead.", "info");
    runDemo(p);
  }
}

// ---------------- Wiring ----------------
function init() {
  loadPersisted();

  $("clearQuery").onclick = () => { $("queryInput").value = ""; $("queryInput").focus(); };
  $("limitRange").oninput = () => ($("limitBadge").textContent = `${$("limitRange").value} items`);
  $("analyzeBtn").onclick = () => analyze(false);
  $("demoBtn").onclick = () => analyze(true);
  $("emptyDemoBtn").onclick = () => analyze(true);
  $("stopBtn").onclick = stopCurrentRun;
  $("emptyTokenBtn").onclick = () => { renderTokens(); $("tokensModal").hidden = false; };
  $("tokenBtn").onclick = () => { renderTokens(); $("tokensModal").hidden = false; };
  $("guideBtn").onclick = () => ($("guideModal").hidden = false);
  $("libraryBtn").onclick = () => { renderLibrary(); $("libraryModal").hidden = false; };

  ["fType", "fAi", "fSort"].forEach((id) => ($(id).onchange = () => { if (state.rawItems.length) applyFiltersAndSort(); }));
  $("viewGridBtn").onclick = () => { state.view = "grid"; $("viewGridBtn").classList.add("active"); $("viewListBtn").classList.remove("active"); applyFiltersAndSort(); };
  $("viewListBtn").onclick = () => { state.view = "list"; $("viewListBtn").classList.add("active"); $("viewGridBtn").classList.remove("active"); applyFiltersAndSort(); };

  $("assetsGrid").onclick = (e) => { const card = e.target.closest(".asset-card"); if (card) openAsset(card.dataset.id); };

  // Asset modal actions
  $("mCopyTitle").onclick = () => currentAsset && copyText(getTitle(currentAsset), "Title copied!");
  $("mCopyJson").onclick = () => currentAsset && copyText(JSON.stringify(currentAsset, null, 2), "Full JSON copied!");
  $("mCopyAllKw").onclick = () => currentAsset && copyText(getKeywords(currentAsset).join(", "), "Keywords copied (comma-separated)!");
  $("mCopySpaced").onclick = () => currentAsset && copyText(getKeywords(currentAsset).join(" "), "Keywords copied (space-separated)!");
  $("mKeywords").onclick = (e) => { const b = e.target.closest(".kw-badge"); if (b) copyText(b.dataset.kw, `Copied "${b.dataset.kw}"`); };

  // Exports & bookmarks
  $("exportCsvBtn").onclick = exportCSV;
  $("exportJsonBtn").onclick = exportJSON;
  $("saveLibraryBtn").onclick = () => { $("bmTitle").value = $("queryInput").value || "Market analysis"; $("bookmarkModal").hidden = false; };
  $("bmSaveBtn").onclick = () => { saveBookmark($("bmTitle").value.trim()); $("bookmarkModal").hidden = true; };

  // Library actions
  $("libraryList").onclick = (e) => {
    const lb = e.target.closest("[data-load]");
    const db = e.target.closest("[data-del]");
    if (lb) loadLibraryEntry(lb.dataset.load);
    if (db) {
      state.library = state.library.filter((x) => x.id !== Number(db.dataset.del));
      localStorage.setItem("spp_library", JSON.stringify(state.library));
      renderLibrary(); renderLibraryBadge();
      showToast("Removed from library", "info");
    }
  };

  // Tokens modal
  $("addTokenBtn").onclick = () => {
    const v = $("newTokenInput").value.trim();
    if (!v) return showToast("Paste a token first", "error");
    state.tokens.push(v);
    $("newTokenInput").value = "";
    renderTokens();
  };
  $("tokensList").onclick = async (e) => {
    const del = e.target.closest("[data-deltok]");
    if (del) { state.tokens.splice(Number(del.dataset.deltok), 1); renderTokens(); }
  };
  $("tokensList").oninput = (e) => {
    const inp = e.target.closest("[data-tokidx]");
    if (inp) state.tokens[Number(inp.dataset.tokidx)] = inp.value;
  };
  $("testTokensBtn").onclick = testTokens;
  $("saveTokensBtn").onclick = () => {
    state.tokens = state.tokens.map((t) => t.trim()).filter(Boolean);
    localStorage.setItem("spp_tokens", JSON.stringify(state.tokens));
    state.activeToken = state.tokens[0] || "";
    refreshConnDot();
    $("tokensModal").hidden = true;
    showToast(state.activeToken ? "Token saved — live scraping enabled!" : "Tokens cleared", state.activeToken ? "success" : "info");
  };

  // Modal close (backdrop click + X buttons)
  document.querySelectorAll(".modal-backdrop").forEach((bd) => {
    bd.addEventListener("click", (e) => { if (e.target === bd) bd.hidden = true; });
  });
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.onclick = () => { document.getElementById(btn.dataset.close).hidden = true; };
  });

  // Tabs (6)
  window.setTab = (tab) => {
    const map = {
      grid: ["tabGridBtn", "tabGridContent"], charts: ["tabChartsBtn", "tabChartsContent"],
      creators: ["tabCreatorsBtn", "tabCreatorsContent"], compare: ["tabCompareBtn", "tabCompareContent"],
      tools: ["tabToolsBtn", "tabToolsContent"], portfolio: ["tabPortfolioBtn", "tabPortfolioContent"],
      earn: ["tabEarnBtn", "tabEarnContent"],
    };
    Object.entries(map).forEach(([k, [b, c]]) => { $(b).classList.toggle("active", k === tab); $(c).hidden = k !== tab; });
  };
  Object.keys({ grid: 1, charts: 1, creators: 1, compare: 1, tools: 1, portfolio: 1, earn: 1 }).forEach((k) => {
    $("tab" + k[0].toUpperCase() + k.slice(1) + "Btn").onclick = () => setTab(k);
  });

  $("queryInput").addEventListener("keydown", (e) => { if (e.key === "Enter") analyze(false); });
}
document.addEventListener("DOMContentLoaded", async () => {
  await LP.init();        // license verification (remote config + stored license + tamper/expiry)
  GateUI.apply();         // show lock screen or app
  GateUI.wire();          // activation form, logo 5-click, license chip
  AdminUI.init();         // hidden admin panel wiring
  init();                 // main app wiring
  CompareUI.init();       // cross-marketplace scan
  ToolsUI.init();         // keyword & title generator
  PortfolioUI.init();     // CSV portfolio analyzer
  EarningsUI.init();      // earnings & upload-time dashboard
  AIUI.init();            // AI analyst (Gemini/Mistral/Grok)
});

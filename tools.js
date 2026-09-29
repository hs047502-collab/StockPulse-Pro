/* ==========================================================
   StockPulse Pro — Creator Tools, Cross-Market Compare,
   Portfolio Analyzer (pure logic + UI)
   ========================================================== */

// ---------------- pure logic ----------------
const KW_STYLES = ["watercolor", "line art", "flat", "vintage", "minimalist", "hand drawn", "geometric", "abstract", "realistic", "cartoon", "3d render", "outline", "boho", "retro"];
const KW_USES = ["logo", "t-shirt print", "sticker", "wall art", "poster", "background", "seamless pattern", "icon", "tattoo", "clipart", "branding", "social media banner", "invitation", "coloring page"];
const KW_EVENTS = ["wedding", "halloween", "christmas", "ramadan", "eid", "new year", "summer sale", "autumn", "valentine", "mothers day", "black friday", "durga puja"];

function genKeywordIdeas(seed, freq) {
  const s = String(seed || "").trim().toLowerCase();
  if (!s) return [];
  const demand = (w) => Math.min(5, (freq?.[w] || 0));
  const ideas = [];
  const push = (phrase, kind) => {
    const words = phrase.split(/\s+/);
    const d = words.reduce((a, w) => a + demand(w), 0) / words.length;
    const longtail = words.length >= 3 ? 18 : words.length === 2 ? 10 : 0;
    const score = Math.min(99, Math.round(38 + d * 7 + longtail + (hashStr(phrase) % 12)));
    if (!ideas.some((i) => i.phrase === phrase)) ideas.push({ phrase, kind, score });
  };
  KW_STYLES.forEach((m) => push(`${m} ${s}`, "style"));
  KW_USES.forEach((m) => push(`${s} ${m}`, "use-case"));
  KW_EVENTS.forEach((m) => push(`${s} ${m}`, "seasonal"));
  KW_STYLES.slice(0, 6).forEach((m, i) => push(`${m} ${s} ${KW_USES[i]}`, "long-tail"));
  return ideas.sort((a, b) => b.score - a.score).slice(0, 30);
}

function buildTitles(desc) {
  const d = String(desc || "").trim();
  if (!d) return [];
  const tc = d.replace(/\b\w/g, (c) => c.toUpperCase());
  const patterns = [
    `${tc} Vector Illustration`,
    `${tc}, Isolated on White Background`,
    `${tc} — Premium Design for Print & Web`,
    `${tc} Editable Template, Modern Style`,
    `${tc} Graphic Element for Branding & Social Media`,
  ];
  const kws = [...new Set([...d.toLowerCase().split(/\s+/).filter((w) => w.length > 2), "vector", "illustration", "design", "graphic", "modern", "creative", "element", "art"])];
  return patterns.map((t) => ({ title: t, kws }));
}

function parseCSV(text) {
  const rows = [];
  let cur = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); field = "";
      if (cur.some((x) => x.trim() !== "")) rows.push(cur);
      cur = [];
    } else field += c;
  }
  cur.push(field);
  if (cur.some((x) => x.trim() !== "")) rows.push(cur);
  return rows;
}

function analyzePortfolio(rows) {
  if (rows.length < 2) return null;
  const head = rows[0].map((h) => String(h).toLowerCase());
  const col = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
  const iT = col("title"), iD = col("download", "sales", "license"), iE = col("earn", "revenue", "income", "usd"), iK = col("keyword", "tag"), iDate = col("date", "upload"), iType = col("type", "format");
  if (iT < 0) return null;
  const items = rows.slice(1).map((r) => ({
    title: r[iT] || "",
    downloads: iD >= 0 ? (parseInt(String(r[iD]).replace(/[^\d]/g, ""), 10) || 0) : 0,
    earnings: iE >= 0 ? (parseFloat(String(r[iE]).replace(/[^\d.]/g, ""), 10) || 0) : 0,
    keywords: iK >= 0 ? String(r[iK] || "") : "",
    date: iDate >= 0 ? String(r[iDate] || "") : "",
    type: iType >= 0 ? String(r[iType] || "") : "",
  }));
  const total = items.length;
  const withSales = items.filter((i) => i.downloads > 0);
  const totalDl = items.reduce((a, i) => a + i.downloads, 0);
  const totalEarn = items.reduce((a, i) => a + i.earnings, 0);
  const hitRate = Math.round((withSales.length / total) * 100);
  const top = [...items].sort((a, b) => b.downloads - a.downloads).slice(0, 10);
  const now = Date.now();
  const dead = items.filter((i) => i.downloads === 0 && i.date && (now - new Date(i.date).getTime()) > 90 * 864e5)
    .sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 10);

  // time intelligence: monthly earnings + upload weekday/month performance
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthlyEarn = {}, wdAcc = {}, moAcc = {};
  items.forEach((i) => {
    if (!i.date) return;
    const d = new Date(i.date);
    if (isNaN(d)) return;
    const key = d.toISOString().slice(0, 7);
    monthlyEarn[key] = (monthlyEarn[key] || 0) + i.earnings;
    (wdAcc[WD[d.getDay()]] ||= []).push(i.downloads);
    (moAcc[key] ||= []).push(i.downloads);
  });
  const avgOf = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b, 0) / v.length)]));
  const weekday = avgOf(wdAcc);
  const monthPerf = avgOf(moAcc);

  const recs = [];
  if (Object.keys(weekday).length) {
    const best = Object.entries(weekday).sort((a, b) => b[1] - a[1])[0];
    recs.push(`Upload timing: assets uploaded on ${best[0]} average ${best[1]} downloads — schedule your queue for ${best[0]}/Mon.`);
  }
  if (hitRate < 30) recs.push(`Hit rate ${hitRate}% is low — rewrite titles & keywords on zero-sale assets (stock SEO matters more than volume).`);
  else recs.push(`Healthy hit rate: ${hitRate}% of your portfolio has sales. Keep the quality bar.`);
  if (dead.length) recs.push(`${dead.length}+ assets are dead (>90 days, 0 sales) — re-key them or replace with fresh niches; dead stock drags portfolio ranking.`);
  const topShare = totalDl ? Math.round((top.reduce((a, i) => a + i.downloads, 0) / totalDl) * 100) : 0;
  if (topShare >= 40) recs.push(`Your top 10 assets drive ${topShare}% of downloads — produce variations/series around "${top[0]?.title}" style to multiply winners.`);
  if (totalEarn > 0) recs.push(`Blended RPM: $${(totalEarn / Math.max(1, totalDl) * 100).toFixed(2)} per 100 downloads — compare across marketplaces and prioritize the higher-RPM one.`);
  recs.push("Run the same keyword in Market Compare tab to see which marketplace rewards your niche most.");
  return { total, withSales: withSales.length, hitRate, totalDl, totalEarn, top, dead, recs, monthlyEarn, weekday, monthPerf };
}

// ---------------- Earnings aggregation & watchlist alerts (pure) ----------------
function mergeEarnings(recs, market) {
  const sel = market === "all" ? recs : recs.filter((r) => r.market === market);
  const monthly = {};
  sel.forEach((r) => Object.entries(r.monthly || {}).forEach(([k, v]) => (monthly[k] = (monthly[k] || 0) + v)));
  const wdSum = {}, wdN = {};
  sel.forEach((r) => Object.entries(r.weekday || {}).forEach(([k, v]) => { wdSum[k] = (wdSum[k] || 0) + v; wdN[k] = (wdN[k] || 0) + 1; }));
  const weekday = Object.fromEntries(Object.entries(wdSum).map(([k, v]) => [k, Math.round(v / wdN[k])]));
  const perMarket = {};
  recs.forEach((r) => (perMarket[r.market] = (perMarket[r.market] || 0) + (r.totalEarn || 0)));
  return {
    monthly, weekday, perMarket,
    totalEarn: sel.reduce((a, r) => a + (r.totalEarn || 0), 0),
    totalDl: sel.reduce((a, r) => a + (r.totalDl || 0), 0),
    count: sel.length,
  };
}

function alertsFor(prev, cur) {
  const out = [];
  if (!prev || !cur) return out;
  if (Math.abs(cur.opp - prev.opp) >= 10) out.push(`Opportunity score moved ${prev.opp} → ${cur.opp}`);
  if (cur.aiPct - prev.aiPct >= 15) out.push(`AI saturation surge ${prev.aiPct}% → ${cur.aiPct}%`);
  if (prev.assets && (cur.assets - prev.assets) / prev.assets >= 0.2) out.push(`Competition grew: +${cur.assets - prev.assets} assets in this niche`);
  if (cur.med >= prev.med * 1.4 && prev.med > 0) out.push(`Median downloads up ${prev.med} → ${cur.med} (demand rising!)`);
  return out;
}

// ---------------- Cross-Market Compare UI ----------------
const CompareUI = (() => {
  function run() {
    const p = currentParams();
    const rowsHtml = MARKETS.DEFAULTS.map((m) => {
      const items = generateDemo({ ...p, market: m.id, maxItems: Math.min(100, p.maxItems) });
      const s = statsFor(items);
      return { m, s };
    }).sort((a, b) => b.s.opp - a.s.opp);
    const best = rowsHtml[0];
    $("compareResult").innerHTML = `
      <div class="cmp-best">🎯 Best marketplace for "<strong>${esc(p.query || p.assetType)}</strong>": <strong>${esc(best.m.name)}</strong> (opportunity ${best.s.opp}/100)</div>
      <div class="table-wrap"><table class="creators-table">
        <thead><tr><th>Marketplace</th><th>Assets (top scan)</th><th>Total Downloads</th><th>Median</th><th>AI Saturation</th><th>Opportunity</th></tr></thead>
        <tbody>${rowsHtml.map(({ m, s }, i) => `
          <tr class="${i === 0 ? "best-row" : ""}">
            <td><strong style="color:var(--text)">${i === 0 ? "🏆 " : ""}${esc(m.name)}</strong>${MARKETS.actorFor(m.id) ? ` <span class="live-tag">live</span>` : ""}</td>
            <td>${s.assets}</td><td>${fmt(s.totalDl)}</td><td>${fmt(s.med)}</td><td>${s.aiPct}%</td>
            <td><span class="stat-highlight">${s.opp}</span></td>
          </tr>`).join("")}</tbody>
      </table></div>
      <p class="chart-sub">Simulation based on each marketplace's relative market size. Plug a live scraper per marketplace in <strong>Admin → Settings → Scraper Actors</strong> for real data.</p>`;
    showToast("Cross-market scan complete", "success");
  }
  function init() { $("compareRunBtn").onclick = run; }
  return { init, run };
})();

// ---------------- Creator Tools UI ----------------
const ToolsUI = (() => {
  function freqMap() {
    const f = {};
    state.rawItems.forEach((i) => getKeywords(i).forEach((k) => { const w = k.toLowerCase(); f[w] = (f[w] || 0) + 1; }));
    return f;
  }
  function genKw() {
    const ideas = genKeywordIdeas($("kwSeed").value || $("queryInput").value, freqMap());
    $("kwIdeas").innerHTML = ideas.map((i) =>
      `<span class="kw-chip kw-idea" data-phrase="${esc(i.phrase)}" title="${i.kind} • score ${i.score} — click to copy" style="border-color:${i.score > 70 ? "rgba(52,211,153,.5)" : i.score > 55 ? "rgba(245,158,11,.4)" : "var(--border)"}">${esc(i.phrase)}<span class="n">${i.score}</span></span>`).join("") +
      `<button class="ghost-btn small" id="kwCopyAll">📋 Copy Top 15</button>`;
    $("kwIdeas").onclick = (e) => {
      if (e.target.id === "kwCopyAll") { copyText(ideas.slice(0, 15).map((x) => x.phrase).join(", "), "Top 15 keyword ideas copied!"); return; }
      const chip = e.target.closest(".kw-idea");
      if (chip) copyText(chip.dataset.phrase, "Copied: " + chip.dataset.phrase);
    };
  }
  function genTitles() {
    const list = buildTitles($("titleSeed").value);
    $("titleIdeas").innerHTML = list.map((t, i) => `
      <div class="title-row">
        <span class="title-text">${esc(t.title)}</span>
        <button class="ghost-btn small" data-tcopy="${i}">📋</button>
      </div>`).join("") +
      (list[0] ? `<button class="ghost-btn small" data-tkws="1">🏷️ Copy Suggested Keywords (${list[0].kws.length})</button>` : "");
    $("titleIdeas").onclick = (e) => {
      const tc = e.target.closest("[data-tcopy]");
      const tk = e.target.closest("[data-tkws]");
      if (tc) copyText(list[Number(tc.dataset.tcopy)].title, "Title copied!");
      if (tk) copyText(list[0].kws.join(", "), "Keywords copied!");
    };
  }
  function init() { $("kwGenBtn").onclick = genKw; $("titleGenBtn").onclick = genTitles; }
  return { init };
})();

// ---------------- Portfolio Analyzer UI ----------------
const PortfolioUI = (() => {
  const SAMPLE = `Title,Type,Downloads,Earnings,Date,Keywords
Cat Silhouette Vector,Vector,1240,412.50,2025-11-02,"cat, silhouette, vector, black"
Watercolor Flower Set,Illustration,860,289.10,2025-12-15,"watercolor, flower, botanical"
Abstract Logo Template,Vector,455,150.00,2026-01-20,"logo, abstract, template"
Dog Line Art,Vector,210,70.25,2026-02-11,"dog, line art, outline"
Vintage Poster Background,Vector,95,31.00,2026-03-05,"vintage, poster, background"
Minimal Icon Pack,Vector,40,13.50,2026-04-18,"icon, minimal, pack"
Random Shape 1,Vector,0,0,2026-01-05,"shape, abstract"
Random Shape 2,Vector,0,0,2025-12-01,"shape, design"
Old Unused Clipart,Illustration,0,0,2025-10-10,"clipart, old"
Lucky Banner,Vector,12,4.00,2026-05-22,"banner, design"`;

  function onFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCSV(String(reader.result));
      const res = analyzePortfolio(rows);
      if (!res) { showToast("Could not detect a Title column in that CSV. Check the sample format.", "error"); return; }
      render(res);
      EarningsUI.push({ market: $("pfMarket").value, at: Date.now(), totalEarn: res.totalEarn, totalDl: res.totalDl, monthly: res.monthlyEarn, weekday: res.weekday });
      EarningsUI.render();
      showToast(`Portfolio analyzed: ${res.total} assets (snapshot saved to 💰 Earnings)`, "success");
    };
    reader.readAsText(file);
  }

  function render(r) {
    $("pfResult").innerHTML = `
      <div class="kpi-grid" style="margin:16px 0 6px">
        <div class="kpi-card"><div class="kpi-body"><span class="kpi-label">Assets</span><strong class="kpi-val">${r.total}</strong></div></div>
        <div class="kpi-card"><div class="kpi-body"><span class="kpi-label">With Sales</span><strong class="kpi-val">${r.withSales}</strong><span class="kpi-sub">${r.hitRate}% hit rate</span></div></div>
        <div class="kpi-card"><div class="kpi-body"><span class="kpi-label">Downloads</span><strong class="kpi-val">${fmt(r.totalDl)}</strong></div></div>
        <div class="kpi-card"><div class="kpi-body"><span class="kpi-label">Earnings</span><strong class="kpi-val">$${fmt(Math.round(r.totalEarn))}</strong></div></div>
      </div>
      <div class="charts-grid">
        <div class="chart-card"><h3> Top Performers</h3><p class="chart-sub">Your money-makers</p>
          <div class="table-wrap"><table class="creators-table"><thead><tr><th>Title</th><th>Downloads</th><th>Earnings</th></tr></thead>
          <tbody>${r.top.map((t) => `<tr><td>${esc(t.title)}</td><td><span class="stat-highlight">${fmt(t.downloads)}</span></td><td>$${t.earnings.toFixed(2)}</td></tr>`).join("")}</tbody></table></div>
        </div>
        <div class="chart-card"><h3>💀 Dead Stock (>90d, 0 sales)</h3><p class="chart-sub">Re-key or replace these</p>
          ${r.dead.length ? `<ul class="dead-list">${r.dead.map((d) => `<li>${esc(d.title)} <span class="n">(${esc(d.date)})</span></li>`).join("")}</ul>` : `<p class="chart-sub">None detected 🎉</p>`}
          <h3 style="margin-top:14px">🧠 Recommendations</h3>
          <ul class="rec-list">${r.recs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        </div>
      </div>`;
  }

  function init() {
    $("pfFile").onchange = (e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ""; };
    $("pfSampleBtn").onclick = () => downloadFile("stockpulse_sample_portfolio.csv", SAMPLE, "text/csv");
  }
  return { init };
})();

// ---------------- Earnings Dashboard UI ----------------
const EarningsUI = (() => {
  const LS = "spp_earn";
  const recs = () => { try { return JSON.parse(localStorage.getItem(LS)) || []; } catch { return []; } };
  const save = (r) => localStorage.setItem(LS, JSON.stringify(r.slice(0, 30)));
  function push(rec) { const r = recs(); r.unshift(rec); save(r); }
  function clear() { localStorage.removeItem(LS); render(); }

  function barRows(obj, fmtFn) {
    const entries = Object.entries(obj).sort((a, b) => a[0].localeCompare(b[0]));
    const max = Math.max(1, ...entries.map((e) => e[1]));
    return entries.map(([k, v]) => `
      <div class="chart-bar-row">
        <span class="chart-bar-label">${esc(k)}</span>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${Math.round((v / max) * 100)}%;background:var(--grad)"></div></div>
        <span class="chart-bar-val">${fmtFn ? fmtFn(v) : v}</span>
      </div>`).join("") || `<p class="chart-sub">No data</p>`;
  }

  function render() {
    const market = $("earnMarket")?.value || "all";
    const m = mergeEarnings(recs(), market);
    if (!m.count) { $("earnResult").innerHTML = `<p class="chart-sub">No earnings data yet — upload a portfolio CSV in the 📁 Portfolio tab (a tagged snapshot auto-saves here).</p>`; return; }
    const rpm = m.totalDl ? (m.totalEarn / m.totalDl * 100).toFixed(2) : "0";
    const bestDay = Object.entries(m.weekday).sort((a, b) => b[1] - a[1])[0];
    const mk = Object.entries(m.perMarket).sort((a, b) => b[1] - a[1]);
    $("earnResult").innerHTML = `
      <div class="kpi-grid" style="margin:14px 0">
        <div class="kpi-card"><div class="kpi-body"><span class="kpi-label">Earnings</span><strong class="kpi-val">$${fmt(Math.round(m.totalEarn))}</strong><span class="kpi-sub">${m.count} snapshot(s)</span></div></div>
        <div class="kpi-card"><div class="kpi-body"><span class="kpi-label">Downloads</span><strong class="kpi-val">${fmt(m.totalDl)}</strong></div></div>
        <div class="kpi-card"><div class="kpi-body"><span class="kpi-label">RPM</span><strong class="kpi-val">$${rpm}</strong><span class="kpi-sub">per 100 downloads</span></div></div>
        <div class="kpi-card"><div class="kpi-body"><span class="kpi-label">Best Upload Day</span><strong class="kpi-val">${bestDay ? bestDay[0] : "—"}</strong><span class="kpi-sub">${bestDay ? "avg " + bestDay[1] + " dl/asset" : ""}</span></div></div>
      </div>
      <div class="charts-grid">
        <div class="chart-card"><h3>📆 Monthly Earnings</h3><p class="chart-sub">From uploaded CSV snapshots</p>${barRows(m.monthly, (v) => "$" + fmt(Math.round(v)))}</div>
        <div class="chart-card"><h3>🗓 Upload Weekday Performance</h3><p class="chart-sub">Avg downloads by upload day</p>${barRows(m.weekday)}</div>
        <div class="chart-card"><h3> Earnings by Marketplace</h3><p class="chart-sub">Where your art makes money</p>${barRows(Object.fromEntries(mk), (v) => "$" + fmt(Math.round(v)))}</div>
      </div>`;
  }

  function init() {
    $("earnMarket").innerHTML = `<option value="all">All marketplaces</option>` + MARKETS.DEFAULTS.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("");
    $("earnMarket").onchange = render;
    $("earnClearBtn").onclick = () => { clear(); showToast("Earnings history cleared", "info"); };
    render();
  }
  return { init, render, push, clear };
})();

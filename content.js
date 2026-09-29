/* StockPulse Companion — niche HUD on Adobe Stock search pages */
(function () {
  "use strict";
  if (document.getElementById("sp-hud")) return;

  function parseCounts() {
    // Adobe cards expose "<n> Downloads" style text; tolerant regex over whole page
    const txt = document.body ? document.body.innerText : "";
    const re = /([\d][\d,.]*)\s*(?:Downloads?|Dl)/gi;
    const out = [];
    let m;
    while ((m = re.exec(txt)) && out.length < 300) {
      const n = parseInt(m[1].replace(/[^\d]/g, ""), 10);
      if (!isNaN(n)) out.push(n);
    }
    return out;
  }
  const median = (a) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  };
  const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n));

  function hud() {
    let el = document.getElementById("sp-hud");
    if (!el) {
      el = document.createElement("div");
      el.id = "sp-hud";
      el.style.cssText =
        "position:fixed;left:14px;bottom:14px;z-index:99999;background:#12141c;color:#e6e9f0;border:1px solid #8b5cf6;border-radius:12px;padding:10px 14px;font:12px/1.6 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5);max-width:270px";
      document.body.appendChild(el);
    }
    return el;
  }

  function update() {
    const counts = parseCounts();
    const el = hud();
    if (!counts.length) {
      el.innerHTML = "⚡ <b>StockPulse</b> — waiting for results to render…";
      return;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    const med = median(counts);
    const high = counts.filter((d) => d > med).length;
    let opp = 50;
    if (total > 0) {
      opp = Math.min(99, Math.max(15, Math.min(50, Math.round(Math.log10(total + 1) * 12)) + Math.round((high / counts.length) * 50)));
    }
    const verdict = opp >= 75 ? "🔥 High opportunity" : opp >= 50 ? "⭐ Moderate" : "⚠️ Saturated";
    el.innerHTML =
      `⚡ <b>StockPulse Niche HUD</b><br>` +
      `Visible assets: <b>${counts.length}</b> • Downloads: <b>${fmt(total)}</b><br>` +
      `Median: <b>${fmt(med)}</b> • Score: <b style="color:${opp >= 75 ? "#34d399" : opp >= 50 ? "#22d3ee" : "#f59e0b"}">${opp}/100</b> ${verdict}`;
  }

  // SPA-friendly: re-scan on mutations + interval
  update();
  let t = setInterval(update, 2500);
  setTimeout(() => clearInterval(t), 120000);
  new MutationObserver(() => setTimeout(update, 600)).observe(document.body, { childList: true, subtree: true });
})();

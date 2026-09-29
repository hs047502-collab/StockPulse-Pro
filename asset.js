/* StockPulse Companion — one-click keyword copy on Adobe Stock asset pages */
(function () {
  "use strict";
  if (document.getElementById("sp-kwcopy")) return;

  function collectKeywords() {
    const kws = new Set();
    // keyword chips are links to search?k=... on asset pages
    document.querySelectorAll('a[href*="search?k="], a[href*="search%3Fk%3D"]').forEach((a) => {
      const t = (a.textContent || "").trim();
      if (t && t.length < 40) kws.add(t.toLowerCase());
    });
    if (!kws.size) {
      document.querySelectorAll('[class*="keyword" i] a, [data-testid*="keyword" i] a').forEach((a) => {
        const t = (a.textContent || "").trim();
        if (t && t.length < 40) kws.add(t.toLowerCase());
      });
    }
    return [...kws];
  }

  function inject() {
    const kws = collectKeywords();
    if (!kws.length) return setTimeout(inject, 2000);
    const btn = document.createElement("button");
    btn.id = "sp-kwcopy";
    btn.textContent = `⚡ StockPulse: Copy ${kws.length} Keywords`;
    btn.style.cssText =
      "margin:10px 0;background:linear-gradient(90deg,#7c3aed,#ec4899);color:#fff;border:none;border-radius:9px;padding:9px 14px;font:600 12.5px system-ui;cursor:pointer";
    btn.onclick = () => {
      const text = kws.join(", ");
      const done = () => (btn.textContent = "✅ Copied!");
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, done);
      else {
        const ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand("copy"); ta.remove(); done();
      }
    };
    const host = document.querySelector('[class*="keyword" i], [data-testid*="keyword" i]');
    (host ? host.parentElement : document.body).insertBefore(btn, host || document.body.firstChild);
  }
  inject();
})();

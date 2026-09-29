/* ==========================================================
   StockPulse Pro — AI Analyst (Gemini / Mistral / Grok)
   Per-user keys, hybrid keyword scoring, Bangla reports
   ========================================================== */

const AIUI = (() => {
  const LS = "spp_ai";
  const cfg = () => { try { return Object.assign({ provider: "gemini", keys: { gemini: "", mistral: "", grok: "" }, lang: "en" }, JSON.parse(localStorage.getItem(LS))); } catch { return { provider: "gemini", keys: { gemini: "", mistral: "", grok: "" }, lang: "en" }; } };
  const save = (c) => localStorage.setItem(LS, JSON.stringify(c));
  const hasKey = () => !!cfg().keys[cfg().provider];

  // ---- provider adapters (pure request builders = testable) ----
  function buildRequest(provider, key, prompt, system) {
    const sys = system || "You are a senior microstock market analyst and SEO expert for stock illustration/photo marketplaces.";
    if (provider === "gemini") {
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
        headers: { "Content-Type": "application/json" },
        body: { contents: [{ parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: sys }] } },
        parse: (d) => d?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "",
      };
    }
    const openaiStyle = (url, model) => ({
      url,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: { model, messages: [{ role: "system", content: sys }, { role: "user", content: prompt }] },
      parse: (d) => d?.choices?.[0]?.message?.content || "",
    });
    if (provider === "mistral") return openaiStyle("https://api.mistral.ai/v1/chat/completions", "mistral-small-latest");
    if (provider === "grok") return openaiStyle("https://api.x.ai/v1/chat/completions", "grok-3-mini");
    throw new Error("Unknown provider");
  }

  async function ask(prompt, system) {
    const c = cfg();
    const key = c.keys[c.provider];
    if (!key) throw new Error(`No ${c.provider} API key set — click 🤖 in the top bar. (Gemini is free: aistudio.google.com/apikey)`);
    const req = buildRequest(c.provider, key, prompt, system);
    const res = await fetch(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(req.body) });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`${c.provider} API error ${res.status}: ${t.slice(0, 160)}`);
    }
    const out = req.parse(await res.json());
    if (!out) throw new Error(`${c.provider} returned empty output`);
    return out;
  }

  // ---- hybrid scoring: LLM proposes, scraped data scores ----
  function scoreAiKeywords(kws, freq) {
    return kws
      .map((k) => {
        const words = String(k).toLowerCase().trim().split(/\s+/).filter(Boolean);
        if (!words.length) return null;
        const d = words.reduce((a, w) => a + Math.min(6, freq?.[w] || 0), 0) / words.length;
        const lt = words.length >= 3 ? 15 : words.length === 2 ? 8 : 0;
        return { phrase: words.join(" "), score: Math.min(99, Math.round(30 + d * 8 + lt)) };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
  }
  const freqMap = () => {
    const f = {};
    (state?.rawItems || []).forEach((i) => getKeywords(i).forEach((k) => { const w = k.toLowerCase(); f[w] = (f[w] || 0) + 1; }));
    return f;
  };

  function renderChips(containerId, scored, copyAllLabel) {
    const el = $(containerId);
    el.innerHTML = scored.map((i) =>
      `<span class="kw-chip kw-idea" data-phrase="${esc(i.phrase)}" title="hybrid score ${i.score} — click to copy" style="border-color:${i.score > 70 ? "rgba(52,211,153,.5)" : i.score > 55 ? "rgba(245,158,11,.4)" : "var(--border)"}">🤖 ${esc(i.phrase)}<span class="n">${i.score}</span></span>`).join("") +
      `<button class="ghost-btn small" data-copyall="1">📋 ${copyAllLabel}</button>`;
    el.onclick = (e) => {
      if (e.target.dataset.copyall) { copyText(scored.slice(0, 20).map((x) => x.phrase).join(", "), "Top AI keywords copied!"); return; }
      const chip = e.target.closest(".kw-idea");
      if (chip) copyText(chip.dataset.phrase, "Copied: " + chip.dataset.phrase);
    };
  }

  // ---- features ----
  async function smartKeywords() {
    const seed = ($("kwSeed").value || $("queryInput").value || "").trim();
    if (!seed) return showToast("Enter a seed keyword first", "error");
    const btn = $("aiKwBtn"); btn.disabled = true; btn.textContent = "🤖 Thinking...";
    try {
      const top = Object.entries(freqMap()).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([w, n]) => `${w}(${n})`).join(", ");
      const raw = await ask(
        `Niche: "${seed}" on stock marketplaces. Current top keywords in this niche: ${top || "(none loaded)"}.
Generate 30 buyer-intent keyword phrases: mix of semantic synonyms, long-tail use-cases, styles and seasonal angles.
Reply ONLY with a comma-separated list, no numbering, no explanation.`);
      const list = raw.split(",").map((s) => s.trim()).filter((s) => s && s.length < 50);
      renderChips("kwIdeas", scoreAiKeywords(list, freqMap()), "Copy Top 20 (AI)");
      showToast(`AI proposed ${list.length} keywords, scored against live demand data`, "success");
    } catch (e) { showToast(e.message, "error"); }
    btn.disabled = false; btn.textContent = "🤖 AI Keywords";
  }

  async function aiTitles() {
    const desc = ($("titleSeed").value || $("queryInput").value || "").trim();
    if (!desc) return showToast("Describe the asset first", "error");
    const btn = $("aiTitleBtn"); btn.disabled = true; btn.textContent = "🤖 Thinking...";
    try {
      const raw = await ask(
        `Asset description: "${desc}". Write 5 professional microstock titles like top sellers do: descriptive subject first, then style/use, then "isolated/background" clause where fitting.
Reply as a JSON array of 5 strings only.`);
      let arr;
      try { arr = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || "[]"); } catch { arr = raw.split("\n").filter((l) => l.trim()).slice(0, 5); }
      $("titleIdeas").innerHTML = arr.map((t, i) => `
        <div class="title-row"><span class="title-text"> ${esc(String(t).replace(/^["']|["']$/g, ""))}</span><button class="ghost-btn small" data-tcopy="${i}">📋</button></div>`).join("") +
        `<button class="ghost-btn small" data-tkws="1">🏷️ Copy base keywords</button>`;
      const kws = buildTitles(desc)[0]?.kws || [];
      $("titleIdeas").onclick = (e) => {
        const tc = e.target.closest("[data-tcopy]");
        if (tc) copyText(String(arr[Number(tc.dataset.tcopy)]).replace(/^["']|["']$/g, ""), "AI title copied!");
        if (e.target.closest("[data-tkws]")) copyText(kws.join(", "), "Keywords copied!");
      };
      showToast("AI titles ready", "success");
    } catch (e) { showToast(e.message, "error"); }
    btn.disabled = false; btn.textContent = "🤖 AI Titles";
  }

  function reportDataSummary() {
    const items = state?.rawItems || [];
    if (!items.length) return null;
    const s = statsFor(items);
    const kw = Object.entries(freqMap()).sort((a, b) => b[1] - a[1]).slice(0, 30);
    const titles = [...items].sort((a, b) => (getDownloads(b) || 0) - (getDownloads(a) || 0)).slice(0, 15).map((i) => `${getTitle(i)} [${getDownloads(i) || 0} dl]`);
    const p = currentParams();
    return { market: MARKETS.name(p.market), query: p.query, ...s, topKeywords: kw, topTitles: titles };
  }

  async function nicheReport() {
    const data = reportDataSummary();
    if (!data) return showToast("Run a market analysis first (Analyze Market), then generate the AI report", "error");
    const lang = $("aiLang").value;
    const btn = $("aiReportBtn"); btn.disabled = true; btn.textContent = "🤖 Writing report...";
    try {
      const raw = await ask(
        `Marketplace scan data:
${JSON.stringify(data)}
Write a ${lang === "bn" ? "report in Bangla (Bengali script)" : "short professional report in English"} with these sections:
1) Market verdict (saturated/moderate/high-opportunity and why, using ONLY numbers above)
2) Content gaps & sub-niches to target (infer from keyword/title patterns)
3) Style & format recommendations
4) Keyword strategy (which tag clusters to lead with)
5) 7-day upload plan (concrete bullet list)
Use headings and bullet points. Do not invent external statistics.`,
        "You are a senior microstock market analyst. Use ONLY the provided data for facts; inference must be labeled as inference.");
      $("aiReport").innerHTML = `<div class="ai-report-body">${esc(raw)}</div><button class="ghost-btn small" id="aiReportCopy">📋 Copy Report</button>`;
      $("aiReportCopy").onclick = () => copyText(raw, "Report copied!");
      showToast("AI niche report ready", "success");
    } catch (e) { showToast(e.message, "error"); }
    btn.disabled = false; btn.textContent = "🤖 Generate Report";
  }

  // ---- settings modal ----
  function openModal() {
    const c = cfg();
    $("aiProvider").value = c.provider;
    $("keyGemini").value = c.keys.gemini || "";
    $("keyMistral").value = c.keys.mistral || "";
    $("keyGrok").value = c.keys.grok || "";
    $("aiModal").hidden = false;
  }
  function saveCfg() {
    save({
      provider: $("aiProvider").value,
      lang: cfg().lang,
      keys: { gemini: $("keyGemini").value.trim(), mistral: $("keyMistral").value.trim(), grok: $("keyGrok").value.trim() },
    });
    $("aiModal").hidden = true;
    refreshDot();
    showToast("AI settings saved — " + cfg().provider + " active", "success");
  }
  async function test() {
    const btn = $("aiTestBtn"); btn.disabled = true; btn.textContent = "⏳...";
    try { const r = await ask("Reply with exactly: OK"); showToast("AI connected: " + r.trim().slice(0, 20), "success"); }
    catch (e) { showToast(e.message, "error"); }
    btn.disabled = false; btn.textContent = "⚡ Test";
  }
  function refreshDot() { $("aiBtn").classList.toggle("ai-on", hasKey()); }

  function init() {
    $("aiBtn").onclick = openModal;
    $("aiSaveBtn").onclick = saveCfg;
    $("aiTestBtn").onclick = test;
    $("aiKwBtn").onclick = smartKeywords;
    $("aiTitleBtn").onclick = aiTitles;
    $("aiReportBtn").onclick = nicheReport;
    refreshDot();
  }

  return { init, ask, buildRequest, scoreAiKeywords, hasKey };
})();
var AITEST = { buildRequest: AIUI.buildRequest, scoreAiKeywords: AIUI.scoreAiKeywords };

/* ==========================================================
   StockPulse Pro — Gate UI (lock screen) + Hidden Admin Panel
   ========================================================== */

const GateUI = (() => {
  const REASONS = {
    "no-license": "This copy is not activated. Enter your email + license key below, or contact your seller to purchase a plan.",
    expired: "⏳ Your license has EXPIRED. Contact your seller to renew — your data stays saved.",
    revoked: "🚫 This license was revoked by the seller.",
    device: "⚠️ This license is bound to a different device. Contact your seller if you changed computers.",
    tamper: "🛑 System clock tampering detected. License locked.",
  };

  function apply() {
    const locked = !LP.state.unlocked;
    document.body.classList.toggle("locked", locked);
    $("lockScreen").hidden = !locked;
    if (locked) {
      renderPricing();
      const msg = REASONS[LP.state.reason] || REASONS["no-license"];
      $("lockMsg").textContent = msg;
      if (LP.state.license?.e) $("actEmail").value = LP.state.license.e;
      if (LP.state.announcement) {
        $("lockAnnounce").textContent = LP.state.announcement;
        $("lockAnnounce").style.display = "block";
      }
    } else {
      updateChip();
    }
  }

  function renderPricing() {
    $("pricingCards").innerHTML = LP.state.plans.map((p, i) => `
      <div class="price-card ${p.days === 0 ? "best" : ""}">
        <div class="price-label">${esc(p.label)}</div>
        <div class="price-val">$${esc(p.price)}</div>
        <div class="price-days">${p.days === 0 ? "Forever" : p.days + " days"}</div>
        <ul>
          <li>Full market intelligence</li>
          <li>Live Apify scraping</li>
          <li>Keyword &amp; creator analytics</li>
          <li>Email-bound license</li>
        </ul>
        ${p.days === 0 ? `<span class="price-tag">BEST VALUE</span>` : ""}
      </div>`).join("");
  }

  function updateChip() {
    const chip = $("licChip");
    chip.hidden = false;
    if (LP.state.mode === "owner") { $("licChipText").textContent = "Owner Mode"; chip.className = "lic-chip owner"; return; }
    const d = LP.daysLeft();
    const txt = d === Infinity ? `${LP.state.license?.pl || "License"} • Lifetime` : `${LP.state.license?.pl || "License"} • ${d}d left`;
    $("licChipText").textContent = txt;
    chip.className = "lic-chip" + (d !== Infinity && d <= 7 ? " warn" : "");
  }

  async function tryActivate() {
    const btn = $("activateBtn");
    btn.disabled = true; btn.textContent = "Verifying...";
    const res = await LP.activate($("actEmail").value, $("actKey").value);
    btn.disabled = false; btn.innerHTML = "🚀 Activate Now";
    if (!res.ok) { $("lockMsg").textContent = "❌ " + res.error; return; }
    showToast(`License activated for ${res.payload.e} — welcome!`, "success");
    apply();
    setInterval(guardTick, 60000);
  }

  function guardTick() {
    if (!LP.recheck()) { apply(); showToast("License expired or locked.", "error"); }
    else updateChip();
  }

  // 5 clicks on the logo → admin
  function clickTracker(el) {
    let count = 0, t = null;
    el.addEventListener("click", () => {
      count++;
      clearTimeout(t);
      t = setTimeout(() => (count = 0), 3500);
      if (count >= 5) { count = 0; AdminUI.openFlow(); }
    });
  }

  function wire() {
    $("activateBtn").onclick = tryActivate;
    clickTracker($("lockLogo"));
    clickTracker($("brandLogo"));
    $("licChip").onclick = () => { LicenseInfoUI.show(); };
    setInterval(guardTick, 60000);
  }

  return { apply, wire, updateChip };
})();

/* ---------------- License info modal (buyer view) ---------------- */
const LicenseInfoUI = (() => {
  function show() {
    const p = LP.state.license;
    const d = LP.daysLeft();
    $("liMode").textContent = LP.state.mode === "owner" ? "👑 Owner Mode (this browser)" : " Licensed";
    $("liName").textContent = p?.n || (LP.state.mode === "owner" ? "Owner" : "—");
    $("liEmail").textContent = p?.e || "—";
    $("liPlan").textContent = p?.pl || "—";
    $("liExpiry").textContent = p ? (p.x === 0 ? "Lifetime" : new Date(p.x).toLocaleDateString() + ` (${d} days left)`) : "—";
    $("liDevice").textContent = LP.fingerprint();
    $("licenseInfoModal").hidden = false;
  }
  return { show };
})();

/* ---------------- Hidden Admin Panel ---------------- */
const AdminUI = (() => {
  function openFlow() {
    if (!LP.hasPassword()) { $("pwSetupModal").hidden = false; }
    else { $("pwPromptInput").value = ""; $("pwPromptModal").hidden = false; }
  }

  async function submitSetup() {
    const a = $("pwSetup1").value, b = $("pwSetup2").value;
    if (a.length < 6) return showToast("Password must be at least 6 characters", "error");
    if (a !== b) return showToast("Passwords do not match", "error");
    await LP.setPassword(a);
    $("pwSetupModal").hidden = true;
    $("pwSetup1").value = $("pwSetup2").value = "";
    showToast("Owner password set — welcome, Admin!", "success");
    openPanel();
  }

  async function submitPrompt() {
    const ok = await LP.checkPassword($("pwPromptInput").value);
    if (!ok) return showToast("Wrong password", "error");
    $("pwPromptModal").hidden = true;
    openPanel();
  }

  function openPanel() {
    $("genPlan").innerHTML = LP.state.plans.map((p) =>
      `<option value="${esc(p.id)}">${esc(p.label)}${p.days === 0 ? " (Lifetime)" : ` (${p.days} days)`} — $${esc(p.price)}</option>`).join("") +
      `<option value="custom">Custom days…</option>`;
    renderReg(); renderPlansEditor(); renderSettings();
    switchAdminTab("gen");
    $("adminModal").hidden = false;
  }

  function switchAdminTab(tab) {
    ["gen", "reg", "plans", "set"].forEach((t) => {
      $("admTab_" + t).classList.toggle("active", t === tab);
      $("admContent_" + t).hidden = t !== tab;
    });
  }

  // ---- generate ----
  async function generate() {
    const name = $("genName").value.trim();
    const email = $("genEmail").value.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showToast("Enter buyer's valid email", "error");
    const planId = $("genPlan").value;
    let days, label;
    if (planId === "custom") { days = Number($("genDays").value) || 30; label = `${days} Days`; }
    else {
      const p = LP.state.plans.find((x) => x.id === planId) || LP.DEFAULT_PLANS[0];
      days = p.days; label = p.label;
    }
    const { key, payload } = await LP.generateKey({ name, email, planLabel: label, days });
    const box =
`═══════ STOCKPULSE PRO LICENSE ═══════
  Name   : ${name || "-"}
  Email  : ${email}
  Plan   : ${label}${days === 0 ? " (Lifetime)" : ` (${days} days)`}
  Valid  : ${days === 0 ? "Forever" : "until " + new Date(payload.x).toLocaleDateString()}
  Device : locks to buyer's device on first activation
──────────────────────────────────────
  LICENSE KEY (paste in activation box):
  ${key}
══════════════════════════════════════
  How to activate: open the app → enter
  your email + paste this key → Activate`;
    $("licBox").textContent = box;
    $("licBoxWrap").style.display = "block";
    showToast("License generated & saved to registry", "success");
  }

  // ---- registry ----
  function renderReg() {
    const rows = LP.registry();
    $("adminRegList").innerHTML = rows.length ? rows.map((r, i) => `
      <div class="reg-row ${r.revoked ? "revoked" : ""}">
        <div class="reg-body">
          <div class="reg-title">${esc(r.n || "(no name)")} — ${esc(r.e)}</div>
          <div class="reg-meta">${esc(r.pl)} • issued ${new Date(r.i).toLocaleDateString()} • ${r.x === 0 ? "Lifetime" : "exp " + new Date(r.x).toLocaleDateString()} • ${r.revoked ? "🚫 REVOKED" : "✅ active"}</div>
        </div>
        <button class="ghost-btn small" data-regcopy="${i}">Copy Key</button>
        ${r.revoked ? "" : `<button class="ghost-btn small" data-regrev="${i}">Revoke</button>`}
      </div>`).join("") : `<p class="chart-sub">No licenses issued yet.</p>`;
  }

  // ---- plans editor ----
  function renderPlansEditor() {
    $("plansEditor").innerHTML = LP.state.plans.map((p, i) => `
      <div class="plan-edit-row">
        <input type="text" data-plan-i="${i}" data-f="label" value="${esc(p.label)}">
        <input type="number" data-plan-i="${i}" data-f="price" value="${esc(p.price)}" min="0">
        <input type="number" data-plan-i="${i}" data-f="days" value="${p.days}" min="0" title="0 = lifetime">
      </div>`).join("");
  }
  function savePlans() {
    const plans = LP.state.plans.map((p) => ({ ...p }));
    document.querySelectorAll("[data-plan-i]").forEach((inp) => {
      const i = Number(inp.dataset.planI), f = inp.dataset.f;
      plans[i][f] = f === "label" ? inp.value : Number(inp.value) || 0;
    });
    LP.savePlans(plans);
    GateUI.apply();
    showToast("Pricing updated", "success");
  }

  // ---- settings ----
  function renderSettings() {
    $("ownerModeState").textContent = LP.isOwner() ? "ON (this browser)" : "OFF";
    const acts = MARKETS.actors();
    $("actorsEditor").innerHTML = MARKETS.DEFAULTS.map((m) => `
      <div class="plan-edit-row">
        <input type="text" value="${esc(m.name)}" disabled style="opacity:.6">
        <input type="text" data-actor="${m.id}" value="${esc(acts[m.id] || (m.id === "adobe" ? "kawsar~adobe-stock-scraper" : ""))}" placeholder="username~actor-name (blank = simulation)">
      </div>`).join("");
  }

  function exportJson() {
    downloadFile("license.json", LP.exportLicenseJson(), "application/json");
    showToast("license.json exported — upload it to your hosting root to push revocations/pricing to all buyers", "success");
  }

  async function changePw() {
    const cur = $("setPwCur").value, nw = $("setPwNew").value;
    if (!(await LP.checkPassword(cur))) return showToast("Current password wrong", "error");
    if (nw.length < 6) return showToast("New password min 6 chars", "error");
    await LP.setPassword(nw);
    $("setPwCur").value = $("setPwNew").value = "";
    showToast("Password changed", "success");
  }

  function init() {
    $("pwSetupBtn").onclick = submitSetup;
    $("pwPromptBtn").onclick = submitPrompt;
    ["admTab_gen", "admTab_reg", "admTab_plans", "admTab_set"].forEach((id) => {
      $(id).onclick = () => switchAdminTab(id.split("_")[1]);
    });
    $("genBtn").onclick = generate;
    $("genCopyBtn").onclick = () => copyText($("licBox").textContent, "License box copied — paste it to your buyer!");
    $("adminRegList").onclick = (e) => {
      const c = e.target.closest("[data-regcopy]");
      const r = e.target.closest("[data-regrev]");
      if (c) copyText(LP.registry()[Number(c.dataset.regcopy)].key, "Key copied");
      if (r) {
        const rec = LP.registry()[Number(r.dataset.regrev)];
        LP.revokeNonce(rec.r, rec.key);
        renderReg();
        showToast("License revoked. Export license.json & re-upload to push to buyers.", "info");
      }
    };
    $("plansSaveBtn").onclick = savePlans;
    $("ownerOnBtn").onclick = () => { LP.enableOwner(true); renderSettings(); GateUI.apply(); showToast("Owner Mode ON", "success"); };
    $("ownerOffBtn").onclick = () => { LP.enableOwner(false); renderSettings(); GateUI.apply(); showToast("Owner Mode OFF", "info"); };
    $("exportJsonBtn").onclick = exportJson;
    $("changePwBtn").onclick = changePw;
    $("actorsSaveBtn").onclick = () => {
      const a = {};
      document.querySelectorAll("[data-actor]").forEach((inp) => { if (inp.value.trim()) a[inp.dataset.actor] = inp.value.trim(); });
      MARKETS.saveActors(a);
      showToast("Scraper actors saved — live mode updated", "success");
    };
  }

  return { openFlow, init };
})();

/* ==========================================================
   StockPulse Pro — License & Admin Engine (serverless)
   Signed license keys • email-bound • device-locked • expiry
   ========================================================== */

var LP = (() => {
  // Owner signing secret (hex-obfuscated; same across deployments)
  const SECRET = "53746f636b50756c736550726f5365637265745631"
    .match(/../g).map((h) => String.fromCharCode(parseInt(h, 16))).join("");

  const LS = {
    lic: "spp_license", hwm: "spp_hwm", owner: "spp_owner",
    pw: "spp_admin_pw", reg: "spp_registry", rev: "spp_revoked", plans: "spp_plans",
  };

  const DEFAULT_PLANS = [
    { id: "monthly", label: "Monthly", price: 9, days: 30 },
    { id: "q90", label: "3 Months", price: 19, days: 90 },
    { id: "yearly", label: "Yearly", price: 49, days: 365 },
    { id: "life", label: "Lifetime", price: 99, days: 0 },
  ];

  const state = { unlocked: false, mode: null, license: null, reason: "", plans: [...DEFAULT_PLANS], revoked: new Set(), announcement: "" };

  // ---------- storage helpers ----------
  const get = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch { return d; } };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  // ---------- encoding ----------
  const b64e = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64d = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
  const bytesB64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const b64Bytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

  async function hmac12(data) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
    return sig.slice(0, 12);
  }
  const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  async function sha256hex(s) {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  // ---------- device fingerprint ----------
  function fingerprint() {
    const src = [
      navigator.userAgent, navigator.language,
      typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : "",
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join("|");
    let h = 5381;
    for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) | 0;
    return "dev-" + (h >>> 0).toString(36);
  }

  // ---------- high-water-mark clock (anti rollback) ----------
  function nowSafe() {
    const now = Date.now();
    const hwm = get(LS.hwm, 0);
    if (hwm && now < hwm - 864e5) return { now, tampered: true, hwm };
    if (now > hwm) set(LS.hwm, now);
    return { now, tampered: false, hwm };
  }

  // ---------- key generation (owner side) ----------
  async function generateKey({ name, email, planLabel, days }) {
    const iat = Date.now();
    const payload = {
      v: 1,
      e: String(email).trim().toLowerCase(),
      n: String(name || "").trim(),
      pl: planLabel || (days === 0 ? "Lifetime" : `${days} Days`),
      d: days,
      x: days === 0 ? 0 : iat + days * 864e5,
      i: iat,
      r: Math.random().toString(36).slice(2, 10),
    };
    const data = b64e(JSON.stringify(payload));
    const sig = bytesB64(await hmac12(data));
    const key = `SPKEY-${data}.${sig}`;
    // registry (owner's browser)
    const reg = get(LS.reg, []);
    reg.unshift({ key, ...payload, createdAt: iat, revoked: false });
    set(LS.reg, reg);
    return { key, payload };
  }

  function parseKey(text) {
    const m = String(text || "").match(/SPKEY-[A-Za-z0-9_\-.]+/);
    return m ? m[0] : null;
  }

  async function verifyKey(key) {
    if (!key || !key.startsWith("SPKEY-")) return { ok: false, error: "Invalid key format" };
    const body = key.slice(6);
    const dot = body.lastIndexOf(".");
    if (dot < 0) return { ok: false, error: "Malformed key" };
    const data = body.slice(0, dot), sig = body.slice(dot + 1);
    let payload;
    try { payload = JSON.parse(b64d(data)); } catch { return { ok: false, error: "Corrupted key payload" }; }
    const expect = await hmac12(data);
    if (!sameBytes(expect, b64Bytes(sig))) return { ok: false, error: "Signature mismatch — key not issued by owner" };
    return { ok: true, payload };
  }

  // ---------- activation (buyer side) ----------
  async function activate(email, keyText) {
    const key = parseKey(keyText);
    const v = await verifyKey(key);
    if (!v.ok) return { ok: false, error: v.error };
    const p = v.payload;
    const mail = String(email || "").trim().toLowerCase();
    if (!mail || p.e !== mail) return { ok: false, error: `This key is bound to a different email (${p.e}). Enter the exact email the key was issued for.` };
    if (state.revoked.has(p.r)) return { ok: false, error: "This license has been revoked by the seller." };
    const { now, tampered } = nowSafe();
    if (tampered) return { ok: false, error: "System clock tampering detected. Activation blocked." };
    if (p.x !== 0 && now > p.x) return { ok: false, error: "This license has expired. Contact seller to renew." };
    set(LS.lic, { data: key.slice(6), device: fingerprint(), activatedAt: now });
    state.license = p;
    state.unlocked = true;
    state.mode = "license";
    state.reason = "";
    return { ok: true, payload: p };
  }

  // ---------- startup verification ----------
  async function init() {
    // remote config (owner can upload license.json to the host for revocation/pricing/announcement)
    try {
      const res = await fetch("license.json", { cache: "no-store" });
      if (res.ok) {
        const cfg = await res.json();
        if (Array.isArray(cfg.revoked)) cfg.revoked.forEach((r) => state.revoked.add(r));
        if (Array.isArray(cfg.plans) && cfg.plans.length) state.plans = cfg.plans;
        if (cfg.announcement) state.announcement = cfg.announcement;
      }
    } catch { /* offline / file:// — ignore */ }
    (get(LS.rev, [])).forEach((r) => state.revoked.add(r));
    const customPlans = get(LS.plans, null);
    if (customPlans?.length) state.plans = customPlans;

    if (get(LS.owner, false)) { state.unlocked = true; state.mode = "owner"; return state; }

    const stored = get(LS.lic, null);
    if (!stored) { state.reason = "no-license"; return state; }

    const dot = String(stored.data).lastIndexOf(".");
    const payload = JSON.parse(b64d(stored.data.slice(0, dot)));
    const { now, tampered } = nowSafe();

    if (tampered) { state.reason = "tamper"; return state; }
    if (stored.device && stored.device !== fingerprint()) { state.reason = "device"; state.license = payload; return state; }
    if (state.revoked.has(payload.r)) { state.reason = "revoked"; state.license = payload; return state; }
    if (payload.x !== 0 && now > payload.x) { state.reason = "expired"; state.license = payload; return state; }

    state.license = payload;
    state.unlocked = true;
    state.mode = "license";
    return state;
  }

  function recheck() {
    if (state.mode !== "license" || !state.license) return true;
    const { now, tampered } = nowSafe();
    if (tampered || (state.license.x !== 0 && now > state.license.x)) {
      state.unlocked = false;
      state.reason = tampered ? "tamper" : "expired";
      return false;
    }
    return true;
  }

  function daysLeft() {
    if (!state.license) return null;
    if (state.license.x === 0) return Infinity;
    return Math.max(0, Math.ceil((state.license.x - Date.now()) / 864e5));
  }

  // ---------- admin ----------
  async function setPassword(pw) { set(LS.pw, await sha256hex("spp-salt::" + pw)); }
  const hasPassword = () => !!get(LS.pw, null);
  async function checkPassword(pw) { return (await sha256hex("spp-salt::" + pw)) === get(LS.pw, null); }

  const registry = () => get(LS.reg, []);
  function revokeNonce(nonce, key) {
    const rev = get(LS.rev, []);
    if (!rev.includes(nonce)) rev.push(nonce);
    set(LS.rev, rev);
    state.revoked.add(nonce);
    const reg = get(LS.reg, []).map((r) => (r.key === key ? { ...r, revoked: true } : r));
    set(LS.reg, reg);
  }
  function enableOwner(on) { set(LS.owner, !!on); if (on) { state.unlocked = true; state.mode = "owner"; } }
  const isOwner = () => get(LS.owner, false);

  function savePlans(plans) { set(LS.plans, plans); state.plans = plans; }

  function exportLicenseJson() {
    return JSON.stringify({
      revoked: [...state.revoked],
      plans: state.plans,
      announcement: state.announcement,
      updated: new Date().toISOString(),
    }, null, 2);
  }

  return {
    state, init, activate, verifyKey, generateKey, parseKey, recheck, daysLeft,
    fingerprint, hasPassword, setPassword, checkPassword, registry, revokeNonce,
    enableOwner, isOwner, savePlans, exportLicenseJson, DEFAULT_PLANS,
  };
})();

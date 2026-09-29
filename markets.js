/* ==========================================================
   StockPulse Pro — Marketplace registry & scraper adapters
   Adobe is live-wired; others run on simulation until the
   owner plugs an Apify actor ID per market (Admin → Settings).
   ========================================================== */
var MARKETS = (() => {
  const DEFAULTS = [
    { id: "adobe", name: "Adobe Stock", mult: 1.0, hue: 265 },
    { id: "shutterstock", name: "Shutterstock", mult: 1.7, hue: 210 },
    { id: "freepik", name: "Freepik", mult: 1.3, hue: 25 },
    { id: "vecteezy", name: "Vecteezy", mult: 0.6, hue: 285 },
    { id: "istock", name: "iStock / Getty", mult: 0.8, hue: 340 },
    { id: "dreamstime", name: "Dreamstime", mult: 0.5, hue: 140 },
    { id: "vectorstock", name: "VectorStock", mult: 0.7, hue: 200 },
    { id: "123rf", name: "123RF", mult: 0.6, hue: 60 },
    { id: "depositphotos", name: "Depositphotos", mult: 0.9, hue: 100 },
    { id: "graphicriver", name: "GraphicRiver (Envato)", mult: 0.5, hue: 320 },
  ];
  const LS = "spp_actors";
  const actors = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
  const saveActors = (a) => localStorage.setItem(LS, JSON.stringify(a));
  const actorFor = (id) => actors()[id] || (id === "adobe" ? "kawsar~adobe-stock-scraper" : "");
  const get = (id) => DEFAULTS.find((m) => m.id === id) || DEFAULTS[0];
  const name = (id) => get(id).name;
  return { DEFAULTS, actors, saveActors, actorFor, get, name };
})();

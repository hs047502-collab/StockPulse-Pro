# StockPulse Pro — Adobe Stock Market Intelligence (Sellable Edition)

License-protected product: buyer-ra subscribe/activate korle-i use korte parbe.
Owner (apni) admin panel theke license key generate kore sell korben.

## Chalano-r upay
1. **Shohoj:** `public/index.html` browser e double-click (server lagbe na)
2. **Othoba:** `node server.js` → http://localhost:3000

## Owner Setup (prothom bar)
1. **Logo te 5 bar click** korun → admin password setup khulbe
2. Password din → **Owner Admin Panel** khulbe
3. **Settings → Enable Owner Mode** → apnar browser e app free te unlock (nijer kajer jonno)

## Buyer ke sell korar flow
1. Admin panel → **Generate License** tab
2. Buyer er **name + email** din, **plan/duration** bachun (Monthly/3M/Yearly/Lifetime ba custom days)
3. **Generate** chapun → ekta box e full details + license key ashbe
4. **Copy Full Box** → buyer ke paste kore din (WhatsApp/email)
5. Buyer app e **email + key** paste kore **Activate** korbei premium unlock
   - Key shudhu oi email er sathe milbe (email-bound)
   - Prothom activation er device e lock hoye jabe (device-bound)
   - Meyad sesh hole app abar lock — renew korte apnar kase ashte hobe
   - Buyer nijer key generate korte parbe na (signed key, owner secret)

## Revocation / remote control
- Admin → **Issued Licenses** → **Revoke** (instant, ei browser e)
- Shob buyer er browser e push korte: **Settings → Export license.json** →
  file ta apnar hosting e `index.html` er pashe upload korun
  (revoked keys + pricing + announcement shob buyer pabe)

## Pricing edit
Admin → **Pricing** tab e label/price/days change korun → lock screen e dekhaben.

## Files
- `public/index.html`, `styles.css` — UI/theme
- `public/app.js` — market intelligence engine
- `public/license.js` — signed license crypto, expiry, device-lock, admin auth
- `public/admin.js` — lock screen + hidden admin panel UI
- `public/license.json` — remote config (revocation/pricing/announcement)
- `server.js` — optional zero-dependency static server

## Note ( honesty )
Eta fully serverless (kono backend/database chara). Protection gulo
(signed key + email + device + expiry + clock-tamper check) non-technical buyer-der
jonno fully effective; kintu expert developer code crack korte pare —
100% bulletproof korte hole future e ekta choto backend activation server lagbe.

## Notun: Multi-Marketplace + Creator Tools
- **Marketplace selector** (sidebar): Adobe Stock (live), Shutterstock, Freepik, Vecteezy, iStock, Dreamstime
- **🌐 Market Compare tab:** ek keyword e 6 marketplace er demand/competition tulona — kothay age upload korben
- **🧰 Creator Tools tab:** keyword idea generator (long-tail + score) & title/SEO builder
- **📁 Portfolio tab:** jekono marketplace er contributor CSV upload korun — best sellers, dead stock, hit rate, recommendations
- **Admin → Settings → Scraper Actors:** marketplace-prati Apify actor ID plug korun → sei marketplace live scrape korbe (Adobe pre-wired)

## V2 Features
- **10 marketplaces** (EPS10-vector friendly): + VectorStock, 123RF, Depositphotos, GraphicRiver
- **Live competition scan** non-Adobe markets: Apify web-scraper recipe (public data) auto-used; custom actor plug kora jay Admin e
- **💰 Earnings tab:** portfolio CSV gulo theke monthly income, RPM, best upload day, marketplace-wise earnings compare
- **Upload-time intelligence:** kon bar upload e gori average beshi download
- **🔔 Niche Watchlist alerts:** bookmark kora niche e re-scan korle delta track — score/AI-saturation/competition threshold porle alert
- **🧩 Browser Extension** (`extension/` folder): Chrome te "Load unpacked extension" — Adobe Stock search e live Niche HUD score, asset page e 1-click keyword copy

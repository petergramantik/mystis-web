# MySTIS – webová verze

Statistiky stolního tenisu ze STIS jako webová aplikace (PWA, jde přidat na plochu telefonu). Vznikla jako kopie Android aplikace MySTIS, dnes se vyvíjí jen web.



## Vývoj
- `./build.sh` – sestaví `dist` (bun + React)
- `bun tests/core.test.ts <fixtures> <json>` – testy jádra (stejné jako CoreTest.kt)
- `bun tools/mock.ts` + `node tools/shots.cjs` – zkušební STIS, skutečná proxy a snímky obrazovek
## Nasazení
- `main` = produkce (`/`), `dev` = vývojová verze (`/dev/`, štítek DEV, oddělená data).
- Push na `main` spustí `deploy.yml`: testy a sestavení obou větví a nasazení na GitHub Pages. Push na `dev` spustí `dev.yml` (testy), který nasazení pustí.
Proxy pro čtení STIS je `proxy/worker.js` (Cloudflare Worker), její adresa je v `public/config.js`.

# MySTIS – webová verze

Věrná kopie Android aplikace MySTIS jako webová aplikace (PWA, jde přidat na plochu telefonu).



## Vývoj
- `./build.sh` – sestaví `dist` (bun + React)
- `bun tests/core.test.ts <fixtures> <json>` – testy jádra (stejné jako CoreTest.kt)
- `bun tools/mock.ts` + `node tools/shots.cjs` – zkušební STIS, skutečná proxy a snímky obrazovek
## Nasazení
Každý push na `main` spustí workflow, které nainstaluje závislosti, spustí testy jádra, sestaví web a nasadí ho na GitHub Pages.
Proxy pro čtení STIS je `proxy/worker.js` (Cloudflare Worker), její adresa je v `public/config.js`.

# MySTIS web – pravidla projektu

- S uživatelem komunikuj česky.
- Nové požadavky zapisuj jen do číslovaného TODO listu a zeptej se „Další úpravy, nebo implementovat?“. Implementuj až po potvrzení.
- Po implementaci: `bun tests/core.test.ts` musí projít, pak `./build.sh` (dev: `CHANNEL=dev ./build.sh`), commit a push do `dev` (nové funkce) nebo `main` (hotfix) – GitHub Actions otestují a nasadí obě verze na GitHub Pages.
- Logika (`src/core`) je přepis jádra Android aplikace; parsery STIS a model STR měň opatrně a doplň test.
- STIS se čte přes Cloudflare Worker (`proxy/worker.js`), adresa je v `public/config.js`. Změnu Workeru musí uživatel vložit do Cloudflare ručně.

## Verze aplikace
- Při každé implementaci zvýšit `DEV_VERSION` (dev) nebo `PROD_VERSION` (hotfix) v `src/app/version.ts` a přidat nahoru novou položku do `RELEASES` (stručné body „Co je nového“).
- Drobné úpravy a opravy zvyšují jen setinu (2.7 → 2.7.1 → 2.7.2), desetina (2.7 → 2.8) jen u významných změn (nová funkce, větší přepracování).

## Dev a produkce
- Větev `dev` = vývojová verze na `…/mystis-web/dev/` (oranžový štítek DEV, vlastní úložiště `mystis-dev.*`, vlastní service worker). Větev `main` = produkce.
- Nové funkce jdou nejdřív do `dev`: zvyšuje se `DEV_VERSION` (2.15-dev.1 → 2.15-dev.2) a položka „Co je nového“ s verzí `2.15-dev.N`.
- Vydání („Vydej“): sloučit `dev` do `main`, nastavit `PROD_VERSION` (např. 2.15), dev položky RELEASES sloučit do jedné produkční; `DEV_VERSION` posunout na další (2.16-dev.1).
- Produkční „Co je nového“ obsahuje jen změny relevantní pro uživatele – nikdy zmínky o dev verzi, jejím zavedení, štítku DEV, přepínání verzí ani interní audit/úklid kódu (ten jen jako „rychlejší a úspornější aplikace“, pokud je znát).
- Opravy produkce (hotfix) přímo do `main` (zvýšit `PROD_VERSION`), pak `main` sloučit do `dev`.
- Nasazení: `deploy.yml` (push do `main`) sestaví obě větve – produkce do `/`, dev do `/dev/`. Push do `dev` spustí `dev.yml` (testy) a ten pustí `deploy.yml` na `main` (Pages smí nasazovat jen `main`).

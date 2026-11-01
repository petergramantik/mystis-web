# MySTIS web – pravidla projektu

- S uživatelem komunikuj česky.
- Nové požadavky zapisuj jen do číslovaného TODO listu a zeptej se „Další úpravy, nebo implementovat?“. Implementuj až po potvrzení.
- Po implementaci: `bun tests/core.test.ts` musí projít, pak `./build.sh`, commit a push na `main` – GitHub Actions web otestuje a nasadí na GitHub Pages.
- Logika (`src/core`) je přepis jádra Android aplikace; parsery STIS a model STR měň opatrně a doplň test.
- STIS se čte přes Cloudflare Worker (`proxy/worker.js`), adresa je v `public/config.js`. Změnu Workeru musí uživatel vložit do Cloudflare ručně.

## Verze aplikace
- Při každé implementaci zvýšit `APP_VERSION` v `src/app/version.ts` a přidat nahoru novou položku do `RELEASES` (stručné body „Co je nového“).
- Drobné úpravy a opravy zvyšují jen setinu (2.7 → 2.7.1 → 2.7.2), desetina (2.7 → 2.8) jen u významných změn (nová funkce, větší přepracování).

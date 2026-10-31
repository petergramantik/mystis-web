# MySTIS web – pravidla projektu

- S uživatelem komunikuj česky.
- Nové požadavky zapisuj jen do číslovaného TODO listu a zeptej se „Další úpravy, nebo implementovat?“. Implementuj až po potvrzení.
- Po implementaci: `bun tests/core.test.ts` musí projít, pak `./build.sh`, commit a push na `main` – GitHub Actions web otestuje a nasadí na GitHub Pages.
- Logika (`src/core`) je přepis jádra Android aplikace; parsery STIS a model STR měň opatrně a doplň test.
- STIS se čte přes Cloudflare Worker (`proxy/worker.js`), adresa je v `public/config.js`. Změnu Workeru musí uživatel vložit do Cloudflare ručně.

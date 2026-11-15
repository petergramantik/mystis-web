// MySTIS proxy – Cloudflare Worker
// Prohlížeč nesmí číst stránky STIS napřímo (CORS), proto je stahuje tenhle Worker.
// Vrací původní bajty (kvůli smíšenému kódování), cookies posílá v hlavičce X-Stis-Cookie
// a konečnou adresu po přesměrování v hlavičce X-Final-Url.
//
// Verze 2 (MySTIS 2.15.8):
//  - sdílená mezipaměť (Cache API): aplikace v hlavičce X-Max-Age řekne, jak stará kopie jí stačí (s);
//    stejné stránky pro víc uživatelů se ze STIS stahují jen jednou (bez hlavičky = vždy čerstvě)
//  - stejná stránka stahovaná souběžně se stahuje jen jednou, nejvýš 6 souběžných dotazů na STIS
//  - čas stažení ze STIS v X-Fetched-At, hlavičky mezipaměti STIS v X-Stis-Cache (diagnostika)
//  - odpověď jako text -> Cloudflare ji komprimuje (bajty se nemění, smíšené kódování zůstává)
//  - počítadlo zařízení odolné proti limitu zápisů KV (volitelné vzorkování proměnnou SAMPLE)
// 2.1: bez hlaviček Cache-Control/Pragma v dotazu na STIS (podezření na odmítání 403)
// 2.2: dotaz na STIS přesně jako ve verzi 1 (bez volby cache: "no-store") – hledání vracelo 403
const VERSION = "2.2";

const BASE = "https://stis.ping-pong.cz";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Stis-Cookie, X-Stis-Referer, X-Max-Age",
  "Access-Control-Expose-Headers": "X-Final-Url, X-Stis-Cookie, X-Stis-Status, X-Fetched-At, X-Stis-Cache, X-Cache, X-Proxy-Version",
};

function parseCookies(str) {
  const m = new Map();
  for (const part of (str || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) m.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return m;
}

function setCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  if (typeof headers.getAll === "function") return headers.getAll("Set-Cookie");
  const one = headers.get("Set-Cookie");
  return one ? [one] : [];
}

// ---------- anonymní počítadlo zařízení (KV binding MYSTIS_KV, tajný klíč STATS_KEY)
// Aplikace jednou denně pošle /__hit?id=<náhodné ID instalace>. Ukládá se jen ID, den prvního a posledního
// spuštění a verze aplikace (v metadatech klíče) – žádné jméno, IP ani hráč STIS.
const DAY = 86400000;
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

/** vzorkování: při SAMPLE = N se zapisuje jen každé N-té zařízení (podle ID) a statistika se násobí N */
const sampleOf = (env) => Math.max(1, parseInt(env.SAMPLE || "1", 10) || 1);
function inSample(id, n) {
  if (n <= 1) return true;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % n === 0;
}

async function hit(url, env) {
  const id = (url.searchParams.get("id") || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
  if (!env.MYSTIS_KV || id.length < 8 || !inSample(id, sampleOf(env))) return new Response("ok", { headers: CORS });
  try {
    const key = "u:" + id;
    const now = Date.now();
    const old = await env.MYSTIS_KV.getWithMetadata(key);
    const first = old?.metadata?.f ?? now;
    // zápis nejvýš jednou denně (limit zápisů KV); po vyčerpání limitu zápis selže – nevadí
    if (!old?.metadata || dayOf(old.metadata.l) !== dayOf(now)) {
      await env.MYSTIS_KV.put(key, "1", { metadata: { f: first, l: now, v: (url.searchParams.get("v") || "").slice(0, 12) } });
    }
  } catch { /* limit KV – počítadlo nesmí nic rozbít */ }
  return new Response("ok", { headers: CORS });
}

async function stats(url, env) {
  if (!env.STATS_KEY || url.searchParams.get("key") !== env.STATS_KEY) return new Response("Forbidden", { status: 403 });
  if (!env.MYSTIS_KV) return new Response("Chybí KV binding MYSTIS_KV", { status: 500 });
  const users = [];
  let cursor;
  do {
    const r = await env.MYSTIS_KV.list({ prefix: "u:", cursor });
    for (const k of r.keys) if (k.metadata) users.push(k.metadata);
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  const now = Date.now();
  const N = sampleOf(env);
  const active = (d) => users.filter((u) => now - u.l < d * DAY).length * N;
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = dayOf(now - i * DAY);
    days.push([d, users.filter((u) => dayOf(u.f) === d).length * N, users.filter((u) => dayOf(u.l) === d).length * N]);
  }
  const vers = {};
  for (const u of users) if (now - u.l < 30 * DAY) vers[u.v || "?"] = (vers[u.v || "?"] || 0) + N;
  if (url.searchParams.get("format") === "json") {
    return new Response(JSON.stringify({ sample: N, total: users.length * N, today: active(1), d7: active(7), d30: active(30), days, versions: vers }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }
  const row = (a, b) => `<tr><td>${a}</td><td style="text-align:right"><b>${b}</b></td></tr>`;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MySTIS – uživatelé</title>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:20px auto;padding:0 16px;color:#0E1A33">
<h2>MySTIS – anonymní zařízení</h2><table style="width:100%;border-collapse:collapse">
${row("Celkem zařízení", users.length * N)}${row("Aktivní dnes (24 h)", active(1))}${row("Aktivní za 7 dní", active(7))}${row("Aktivní za 30 dní", active(30))}</table>
<h3>Posledních 14 dní</h3><table style="width:100%"><tr><th align="left">Den</th><th align="right">Nová</th><th align="right">Naposledy aktivní</th></tr>
${days.map(([d, n, a]) => `<tr><td>${d}</td><td align="right">${n}</td><td align="right">${a}</td></tr>`).join("")}</table>
<h3>Verze aplikace (30 dní)</h3><table style="width:100%">${Object.entries(vers).sort().reverse().map(([v, n]) => row(v, n)).join("")}</table>
${N > 1 ? `<p style="color:#667;font-size:13px">Odhad ze vzorku: počítá se každé ${N}. zařízení, čísla jsou vynásobená ${N}.</p>` : ""}<p style="color:#667;font-size:13px">Jedno zařízení = jedna instalace / prohlížeč. „Naposledy aktivní“ = zařízení, jehož poslední spuštění připadá na daný den.</p></body>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// ---------- stahování ze STIS
const inflight = new Map();
let active = 0;
const waiters = [];
/** nejvýš 6 souběžných dotazů na STIS z jedné instance Workeru */
async function withSlot(fn) {
  if (active >= 6) await new Promise((res) => waiters.push(res));
  active++;
  try { return await fn(); } finally { active--; const w = waiters.shift(); if (w) w(); }
}

async function fromStis(path, method0, bodyP, jar, referer) {
  let method = method0 === "POST" ? "POST" : "GET";
  let body = bodyP ? await bodyP : undefined;
  let target = BASE + path;
  let resp;
  for (let hop = 0; hop < 6; hop++) {
    const h = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 MySTIS/1.0",
      "Accept-Language": "cs-CZ,cs;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
    if (jar.size) h["Cookie"] = [...jar].map(([k, v]) => k + "=" + v).join("; ");
    if (referer) { h["Referer"] = referer; h["Origin"] = BASE; }
    if (method === "POST") h["Content-Type"] = "application/x-www-form-urlencoded";
    // dotaz stejný jako ve verzi 1 (STIS stránky Cloudflare neukládá: cf-cache-status=DYNAMIC);
    // volby cache / hlavičky no-cache vedly u STIS k odmítnutí 403
    resp = await fetch(target, { method, headers: h, body, redirect: "manual" });
    for (const c of setCookies(resp.headers)) {
      const kv = c.split(";")[0];
      const i = kv.indexOf("=");
      if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
    }
    const loc = resp.headers.get("Location");
    if (resp.status >= 300 && resp.status < 400 && loc) {
      target = new URL(loc, target).toString();
      if (!target.startsWith(BASE)) break;
      if (resp.status !== 307 && resp.status !== 308) { method = "GET"; body = undefined; }
      continue;
    }
    break;
  }
  const bytes = await resp.arrayBuffer();
  const t = new URL(target);
  // diagnostika: jak STIS stránku označuje pro mezipaměti
  const stisCache = ["cache-control", "expires", "age", "last-modified", "cf-cache-status"]
    .map((k) => resp.headers.get(k) ? `${k}=${resp.headers.get(k)}` : null).filter(Boolean).join("; ").slice(0, 300);
  return { bytes, status: resp.status, finalPath: t.pathname + t.search, jar, at: Date.now(), stisCache };
}

/** Odpověď aplikaci: text -> Cloudflare ji komprimuje; aplikace čte bajty, takže se nic nemění. */
function out(body, headers, cacheState) {
  const h = new Headers(headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  h.set("Content-Type", "text/plain; charset=x-user-defined");
  h.set("Cache-Control", "no-store");
  h.set("X-Cache", cacheState);
  h.set("X-Proxy-Version", VERSION);
  h.delete("Content-Length");
  return new Response(body, { status: 200, headers: h });
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const path = url.pathname + url.search;
    if (path === "/" || path === "/ping") {
      return new Response("MySTIS proxy OK", { headers: { ...CORS, "Content-Type": "text/plain" } });
    }
    if (url.pathname === "/__hit") return hit(url, env || {});
    if (url.pathname === "/__stats") return stats(url, env || {});

    const jar = parseCookies(req.headers.get("X-Stis-Cookie"));
    const referer = req.headers.get("X-Stis-Referer");
    const isGet = req.method !== "POST";
    // sdílená mezipaměť jen pro běžné GET bez cookies (hledání a formuláře nikdy)
    const maxAge = parseInt(req.headers.get("X-Max-Age") || "0", 10) || 0;
    const shareable = isGet && !jar.size && !referer && !url.pathname.startsWith("/hledat") && !url.search.includes("nuser");
    const cacheKey = new Request("https://cache.mystis.invalid" + path);
    const cache = typeof caches !== "undefined" ? caches.default : null;
    if (shareable && cache && maxAge > 0) {
      try {
        const hitResp = await cache.match(cacheKey);
        const at = Number(hitResp?.headers.get("X-Fetched-At") || 0);
        if (hitResp && Date.now() - at <= maxAge * 1000) return out(hitResp.body, hitResp.headers, "HIT");
      } catch { /* mezipaměť nedostupná */ }
    }
    // stejná stránka stahovaná souběžně -> jedno stažení ze STIS
    const flightKey = shareable ? path : null;
    let task = flightKey ? inflight.get(flightKey) : null;
    if (!task) {
      task = withSlot(() => fromStis(path, req.method, isGet ? undefined : req.text(), jar, referer));
      if (flightKey) { inflight.set(flightKey, task); task.finally(() => inflight.delete(flightKey)); }
    }
    const r = await task;
    const headers = new Headers({
      "X-Final-Url": r.finalPath,
      "X-Stis-Status": String(r.status),
      "X-Stis-Cookie": [...r.jar].map(([k, v]) => k + "=" + v).join("; "),
      "X-Fetched-At": String(r.at),
      "X-Stis-Cache": r.stisCache,
    });
    if (shareable && cache && r.status === 200 && r.bytes.byteLength > 2000) {
      const ttl = path.startsWith("/zapis/") ? 90 * 86400 : 2 * 86400;
      const h = new Headers(headers); h.set("Cache-Control", "public, max-age=" + ttl); h.set("Content-Type", "application/octet-stream");
      try { await cache.put(cacheKey, new Response(r.bytes.slice(0), { headers: h })); } catch { /* */ }
    }
    return out(r.bytes, headers, "MISS");
  },
};

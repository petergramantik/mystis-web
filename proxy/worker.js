// MySTIS proxy – Cloudflare Worker
// Prohlížeč nesmí číst stránky STIS napřímo (CORS), proto je stahuje tenhle Worker.
// Vrací původní bajty (kvůli smíšenému kódování), cookies posílá v hlavičce X-Stis-Cookie
// a konečnou adresu po přesměrování v hlavičce X-Final-Url.

const BASE = "https://stis.ping-pong.cz";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Stis-Cookie, X-Stis-Referer",
  "Access-Control-Expose-Headers": "X-Final-Url, X-Stis-Cookie, X-Stis-Status",
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

async function hit(url, env) {
  const id = (url.searchParams.get("id") || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64);
  if (!env.MYSTIS_KV || id.length < 8) return new Response("ok", { headers: CORS });
  const key = "u:" + id;
  const now = Date.now();
  const old = await env.MYSTIS_KV.getWithMetadata(key);
  const first = old?.metadata?.f ?? now;
  // zápis nejvýš jednou denně (limit zápisů KV)
  if (!old?.metadata || dayOf(old.metadata.l) !== dayOf(now)) {
    await env.MYSTIS_KV.put(key, "1", { metadata: { f: first, l: now, v: (url.searchParams.get("v") || "").slice(0, 12) } });
  }
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
  const active = (d) => users.filter((u) => now - u.l < d * DAY).length;
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = dayOf(now - i * DAY);
    days.push([d, users.filter((u) => dayOf(u.f) === d).length, users.filter((u) => dayOf(u.l) === d).length]);
  }
  const vers = {};
  for (const u of users) if (now - u.l < 30 * DAY) vers[u.v || "?"] = (vers[u.v || "?"] || 0) + 1;
  if (url.searchParams.get("format") === "json") {
    return new Response(JSON.stringify({ total: users.length, today: active(1), d7: active(7), d30: active(30), days, versions: vers }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }
  const row = (a, b) => `<tr><td>${a}</td><td style="text-align:right"><b>${b}</b></td></tr>`;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MySTIS – uživatelé</title>
<body style="font-family:system-ui,sans-serif;max-width:480px;margin:20px auto;padding:0 16px;color:#0E1A33">
<h2>MySTIS – anonymní zařízení</h2><table style="width:100%;border-collapse:collapse">
${row("Celkem zařízení", users.length)}${row("Aktivní dnes (24 h)", active(1))}${row("Aktivní za 7 dní", active(7))}${row("Aktivní za 30 dní", active(30))}</table>
<h3>Posledních 14 dní</h3><table style="width:100%"><tr><th align="left">Den</th><th align="right">Nová</th><th align="right">Naposledy aktivní</th></tr>
${days.map(([d, n, a]) => `<tr><td>${d}</td><td align="right">${n}</td><td align="right">${a}</td></tr>`).join("")}</table>
<h3>Verze aplikace (30 dní)</h3><table style="width:100%">${Object.entries(vers).sort().reverse().map(([v, n]) => row(v, n)).join("")}</table>
<p style="color:#667;font-size:13px">Jedno zařízení = jedna instalace / prohlížeč. „Naposledy aktivní“ = zařízení, jehož poslední spuštění připadá na daný den.</p></body>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
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
    let method = req.method === "POST" ? "POST" : "GET";
    let body = method === "POST" ? await req.text() : undefined;
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
    const finalPath = new URL(target).pathname + new URL(target).search;
    return new Response(bytes, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Final-Url": finalPath,
        "X-Stis-Status": String(resp.status),
        "X-Stis-Cookie": [...jar].map(([k, v]) => k + "=" + v).join("; "),
      },
    });
  },
};

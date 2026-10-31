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

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    const path = url.pathname + url.search;
    if (path === "/" || path === "/ping") {
      return new Response("MySTIS proxy OK", { headers: { ...CORS, "Content-Type": "text/plain" } });
    }

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

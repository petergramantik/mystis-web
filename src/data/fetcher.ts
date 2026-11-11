import { IDB, SP } from "../app/channel";
// Stahování stránek STIS přes proxy (přepis HttpFetcher.kt) a mezipaměť v IndexedDB (offline režim).
//  - STIS bez ověřené session vrací krátkou "bránu" – pak dotaz zopakujeme s ?nuser=1.
//  - Kódování je smíšené (cp1250 + UTF-8), proxy vrací původní bajty a dekódujeme je po bajtech.
//  - Bez připojení vrátíme poslední uloženou kopii, i když je starší.
import { Html } from "../core/html";
import { Parsers } from "../core/parsers";
import { Stis } from "../core/models";
import type { Fetcher } from "../core/repository";
import { prefs } from "./prefs";

export class FetchError extends Error {
  constructor(message: string, readonly kind: "offline" | "proxy" | "http" | "gate" | "noproxy") { super(message); }
}

interface Entry { html: string; at: number }

// ---------------------------------------------------------------- IndexedDB
const DB = IDB;
const STORE = "pages";
let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
  return dbp;
}
async function idbGet(k: string): Promise<Entry | undefined> {
  const d = await db();
  if (!d) return undefined;
  return new Promise((res) => {
    try {
      const q = d.transaction(STORE).objectStore(STORE).get(k);
      q.onsuccess = () => res(q.result as Entry | undefined);
      q.onerror = () => res(undefined);
    } catch { res(undefined); }
  });
}
async function idbPut(k: string, v: Entry) {
  const d = await db();
  if (!d) return;
  try { d.transaction(STORE, "readwrite").objectStore(STORE).put(v, k); } catch { /* plná paměť */ }
}
async function idbClear() {
  const d = await db();
  if (!d) return;
  await new Promise<void>((res) => {
    try { const t = d.transaction(STORE, "readwrite"); t.objectStore(STORE).clear(); t.oncomplete = () => res(); t.onerror = () => res(); } catch { res(); }
  });
}
async function idbSize(): Promise<number> {
  const d = await db();
  if (!d) return 0;
  return new Promise((res) => {
    let total = 0;
    try {
      const q = d.transaction(STORE).objectStore(STORE).openCursor();
      q.onsuccess = () => {
        const c = q.result;
        if (c) { total += ((c.value as Entry).html?.length ?? 0) * 2; c.continue(); } else res(total);
      };
      q.onerror = () => res(total);
    } catch { res(total); }
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class WebFetcher implements Fetcher {
  private mem = new Map<string, Entry>();
  private cookie = "";
  private nextSlot = 0;
  /** Diagnostika posledního hledání (zobrazí se, když hledání nic nenajde). */
  lastSearchInfo = "";
  private lastGoodSearch: string | null = null;
  private sessionReady = false;

  constructor() {
    try { this.cookie = sessionStorage.getItem(SP + "cookie") ?? ""; } catch { /* */ }
  }

  async cachedAt(path: string): Promise<number | null> {
    const e = this.mem.get(path) ?? (await idbGet(path));
    return e?.at ?? null;
  }
  async clear() { this.mem.clear(); await idbClear(); }
  async cacheSizeBytes(): Promise<number> { return idbSize(); }

  async get(path: string, maxAgeMs: number): Promise<string> {
    // hledání se neukládá do mezipaměti (při přesměrování by se uložila hlavní stránka)
    if (path.startsWith("/hledat")) return this.search(path);
    const e = this.mem.get(path) ?? (await idbGet(path));
    if (e) this.mem.set(path, e);
    if (e && maxAgeMs > 0 && Date.now() - e.at < maxAgeMs) return e.html;
    try {
      const html = await this.download(path);
      const ne = { html, at: Date.now() };
      this.mem.set(path, ne);
      void idbPut(path, ne);
      return html;
    } catch (err) {
      if (e) return e.html;
      throw err;
    }
  }

  private async download(path: string): Promise<string> {
    let html = (await this.call(path, null, null))[0];
    if (Parsers.isGate(html)) {
      const sep = path.includes("?") ? "&" : "?";
      html = (await this.call(path + sep + "nuser=1", null, null))[0];
    }
    if (Parsers.isGate(html)) throw new FetchError("STIS vrátil prázdnou stránku", "gate");
    return html;
  }

  /** Šetrně k serveru STIS: nejvýš ~3 požadavky za sekundu. */
  private async throttle() {
    const now = Date.now();
    const at = Math.max(now, this.nextSlot);
    this.nextSlot = at + 300;
    if (at > now) await sleep(at - now);
  }

  /** Jeden požadavek přes proxy. Vrací HTML a cestu, na které požadavek skončil (kvůli přesměrování). */
  private async call(path: string, referer: string | null, form: Record<string, string> | null): Promise<[string, string]> {
    const proxy = prefs.proxyUrl;
    if (!proxy) throw new FetchError("Není nastavená adresa proxy pro čtení STIS (Nastavení → Připojení ke STIS).", "noproxy");
    await this.throttle();
    const p = path.startsWith("http") ? path.replace(/^https?:\/\/[^/]+/, "") : path;
    const headers: Record<string, string> = {};
    if (this.cookie) headers["X-Stis-Cookie"] = this.cookie;
    if (referer) headers["X-Stis-Referer"] = referer;
    let body: string | undefined;
    if (form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = Object.entries(form).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
    }
    let resp: Response;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 40_000);
      resp = await fetch(proxy + p, { method: form ? "POST" : "GET", headers, body, signal: ctl.signal, cache: "no-store" });
      clearTimeout(timer);
    } catch (e) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new FetchError("Nejste připojeni k internetu.", "offline");
      if ((e as Error)?.name === "AbortError") throw new FetchError("STIS neodpovídá, zkuste to za chvíli.", "offline");
      throw new FetchError("Nepodařilo se spojit se STIS přes proxy. Zkontrolujte připojení a adresu proxy v Nastavení.", "proxy");
    }
    if (!resp.ok) throw new FetchError(`Proxy odpověděla ${resp.status}`, "proxy");
    const ck = resp.headers.get("X-Stis-Cookie");
    if (ck != null && ck !== "") {
      this.cookie = ck;
      try { sessionStorage.setItem(SP + "cookie", ck); } catch { /* */ }
    }
    const status = Number(resp.headers.get("X-Stis-Status") ?? "200");
    if (status >= 400) throw new FetchError(`STIS odpověděl ${status}`, "http");
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const final = (resp.headers.get("X-Final-Url") ?? p).split("?")[0];
    return [Html.decodeMixed(bytes), final];
  }

  /**
   * Hledání na STIS: přímý odkaz web přesměruje na hlavní stránku, proto napodobíme formulář z lupy:
   * nejdřív session (hlavní stránka s ?nuser=1), pak GET s Refererem, a když i tak přesměruje, POST.
   */
  private async search(path: string): Promise<string> {
    if (!this.sessionReady) {
      try { await this.call("/?nuser=1", null, null); this.sessionReady = true; } catch (e) {
        if (e instanceof FetchError && e.kind === "noproxy") throw e;
      }
    }
    const query = path.includes("?") ? path.substring(path.indexOf("?") + 1) : "";
    const form: Record<string, string> = {};
    for (const part of query.split("&")) {
      if (!part) continue;
      const i = part.indexOf("=");
      const k = i >= 0 ? part.substring(0, i) : part;
      const v = i >= 0 ? decodeURIComponent(part.substring(i + 1).replace(/\+/g, " ")) : "";
      form[k] = v;
    }
    const ok = (r: [string, string]) => !Parsers.isGate(r[0]) && (r[1].startsWith("/hledat") || r[0].toLowerCase().includes("výsledky hledání"));
    const size = (r: [string, string]) => (r[0].length >= 2048 ? `${Math.floor(r[0].length / 1024)} kB` : `${r[0].length} B`);
    const tried: string[] = [];
    const nuserPath = path + (path.includes("?") ? "&" : "?") + "nuser=1";
    const nuserForm = { ...form, nuser: "1" };
    const base = Stis.BASE + "/";
    const attempts: [string, () => Promise<[string, string]>][] = [
      ["GET", () => this.call(path, base, null)],
      ["GET+nuser", () => this.call(nuserPath, base, null)],
      ["POST", () => this.call("/hledat", base, form)],
      ["POST+nuser", () => this.call("/hledat?nuser=1", base, nuserForm)],
    ];
    attempts.sort((a, b) => (a[0] === this.lastGoodSearch ? 0 : 1) - (b[0] === this.lastGoodSearch ? 0 : 1));
    let last: [string, string] | null = null;
    for (const [label, attempt] of attempts) {
      let r: [string, string];
      try { r = await attempt(); } catch (e) {
        if (e instanceof FetchError && e.kind === "noproxy") throw e;
        tried.push(`${label}: ${(e as Error).message}`); continue;
      }
      last = r;
      tried.push(`${label}→${r[1]} (${size(r)})`);
      if (ok(r)) {
        this.lastGoodSearch = label;
        const links = (r[0].match(/\/hrac-\d+/g) ?? []).length;
        this.lastSearchInfo = `${tried.join(", ")}; odkazů na hráče: ${links}`;
        return r[0];
      }
    }
    this.lastSearchInfo = `STIS nevrátil výsledky: ${tried.join(", ")}`;
    return last?.[0] ?? "";
  }

  /** Ověření proxy (Nastavení): odpoví "MySTIS proxy OK"? */
  static async ping(url: string): Promise<string | null> {
    try {
      const r = await fetch(url.trim().replace(/\/+$/, "") + "/ping", { cache: "no-store" });
      const t = await r.text();
      return t.includes("MySTIS proxy OK") ? null : `Proxy odpověděla neočekávaně (${r.status}).`;
    } catch {
      return "Proxy na této adrese neodpovídá.";
    }
  }
}

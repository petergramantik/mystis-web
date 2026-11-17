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
import { DebugLog } from "./debuglog";

export class FetchError extends Error {
  constructor(message: string, readonly kind: "offline" | "proxy" | "http" | "gate" | "noproxy") { super(message); }
}

interface Entry { html: string; at: number }
/** Zpracovaná (neměnná) data uložená vedle stránek – klíč začíná „~“, nemažou se. */
interface DataEntry { data: unknown; at: number; html?: undefined }
/** Diagnostika posledního stažení stránky (čas stažení ze STIS, hlavičky STIS, sdílená mezipaměť Workeru). */
export interface FetchMeta { at: number; stisAt: number; stisCache: string; cache: string; stale?: boolean }

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

/** Smaže stránky starší než maxAge (IndexedDB jinak jen roste); spouští se nejvýš jednou denně. */
async function idbPrune(maxAge: number) {
  const d = await db();
  if (!d) return;
  const limit = Date.now() - maxAge;
  try {
    const q = d.transaction(STORE, "readwrite").objectStore(STORE).openCursor();
    q.onsuccess = () => {
      const c = q.result; if (!c) return;
      // „~“ = zpracovaná neměnná data (dohrané zápisy), ta se nemažou; zpracované profily ano
      const k = String(c.key);
      if ((!k.startsWith("~z:")) && ((c.value as Entry).at ?? 0) < limit) c.delete();
      c.continue();
    };
  } catch { /* */ }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Stránek v paměti nejvýš tolik (zbytek je v IndexedDB). */
const MEM_MAX = 150;

/** Cíl přesměrování v krátké stránce STIS (meta refresh nebo skript), jen v rámci STIS. */
export function gateTarget(html: string): string | null {
  const m = /http-equiv=["']?refresh["']?[^>]*content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)/i.exec(html)
    ?? /content=["']?\s*\d+\s*;\s*url=([^"'>\s]+)["']?[^>]*http-equiv=["']?refresh/i.exec(html)
    ?? /location(?:\.href)?\s*=\s*["']([^"']+)["']/i.exec(html)
    ?? /location\.(?:replace|assign)\(\s*["']([^"']+)["']/i.exec(html);
  if (!m) return null;
  let u = m[1].replace(/&amp;/g, "&");
  if (/^https?:\/\//i.test(u)) { if (!u.includes("stis.ping-pong.cz")) return null; u = u.replace(/^https?:\/\/[^/]+/i, ""); }
  return u.startsWith("/") ? u : "/" + u;
}
/** Čitelné shrnutí krátké stránky pro hlášku: přesměrování, skript, text. */
export function gateSummary(html: string): string {
  const to = gateTarget(html);
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  const script = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim();
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const parts = [to ? `přesměrování na ${to}` : "", title ? `titulek „${title}“` : "", script ? `skript: ${script.slice(0, 160)}` : "", body ? `text: ${body.slice(0, 120)}` : ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : html.replace(/\s+/g, " ").slice(-200);
}

export class WebFetcher implements Fetcher {
  /** Worker verze 2+ (sdílená mezipaměť, X-Max-Age) – zjistí se z první odpovědi */
  private proxyV = Number((() => { try { return localStorage.getItem(SP + "proxy_v") ?? "0"; } catch { return "0"; } })()) || 0;
  private metas = new Map<string, FetchMeta>();
  /** poslední úspěšné stažení ze STIS a poslední chyba (kvůli informaci o stavu dat) */
  lastOk = 0;
  lastErr: { at: number; msg: string } | null = null;
  /** STIS odmítá komunikovat: poslední odpověď byla stará kopie (Worker nedosáhl na STIS) nebo výzva/403.
   *  Vynuluje se, jakmile přijde čerstvá odpověď. null = STIS odpovídá normálně. */
  blockedSince: number | null = null;
  /** poslední chyba konkrétní stránky (smaže ji úspěšné stažení té stránky) */
  errs = new Map<string, { at: number; msg: string }>();
  meta(path: string): FetchMeta | undefined { return this.metas.get(path); }
  /** aktuální relace STIS (cookie) – pro test spojení v konzoli */
  get session(): string { return this.cookie; }
  /** Zpracovaná data (neměnné zápisy, rozparsované profily) – rychlejší než znovu zpracovat HTML. */
  async getData<T>(key: string): Promise<{ data: T; at: number } | null> {
    const e = (await idbGet("~" + key)) as unknown as DataEntry | undefined;
    return e && e.data != null ? { data: e.data as T, at: e.at } : null;
  }
  putData(key: string, data: unknown, at = Date.now()) {
    // jen čistá data (bez getterů a mezipamětí tříd)
    try { void idbPut("~" + key, { data: JSON.parse(JSON.stringify(data, (k, v) => (k.startsWith("_") ? undefined : v))), at } as unknown as Entry); } catch { /* */ }
  }
  private mem = new Map<string, Entry>();
  private inflight = new Map<string, Promise<string>>();
  private cookie = "";
  private nextSlot = 0;
  /** Diagnostika posledního hledání (zobrazí se, když hledání nic nenajde). */
  lastSearchInfo = "";
  private lastGoodSearch: string | null = null;
  private sessionReady = false;

  constructor() {
    try { this.cookie = sessionStorage.getItem(SP + "cookie") ?? ""; } catch { /* */ }
    try {
      const day = new Date().toISOString().slice(0, 10);
      if (typeof indexedDB !== "undefined" && localStorage.getItem(SP + "prune_day") !== day) {
        localStorage.setItem(SP + "prune_day", day);
        setTimeout(() => void idbPrune(60 * 86_400_000), 20_000);
      }
    } catch { /* soukromý režim */ }
  }
  /** Uloží do paměti s omezením velikosti (nejdéle nepoužité se zahodí). */
  private remember(path: string, e: Entry) {
    this.mem.delete(path); this.mem.set(path, e);
    while (this.mem.size > MEM_MAX) this.mem.delete(this.mem.keys().next().value!);
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
    if (e) this.remember(path, e);
    if (e && maxAgeMs > 0 && Date.now() - e.at < maxAgeMs) return e.html;
    try {
      // stejná stránka požadovaná víckrát najednou se stahuje jen jednou
      let pend = this.inflight.get(path);
      if (!pend) { pend = this.download(path, maxAgeMs).finally(() => this.inflight.delete(path)); this.inflight.set(path, pend); }
      const html = await pend;
      this.lastOk = Date.now();
      this.errs.delete(path);
      // stáří = kdy data stáhl ze STIS Worker (ze sdílené mezipaměti mohou být o chvíli starší)
      const ne = { html, at: Math.min(Date.now(), this.metas.get(path)?.stisAt ?? Date.now()) };
      this.remember(path, ne);
      void idbPut(path, ne);
      return html;
    } catch (err) {
      // běžná data: při chybě poslední uložená kopie (offline režim);
      // živá a ručně obnovovaná data (krátká platnost) nesmí potichu vrátit starou kopii – volající ukáže chybu
      // jen živá data (zápis / rozpis s platností do 1 min) chybu přiznají; ostatní (i ruční Obnovit) vezmou uloženou kopii
      const live = maxAgeMs > 0 && maxAgeMs <= 60_000 || (maxAgeMs === 0 && path.startsWith("/zapis/"));
      this.lastErr = { at: Date.now(), msg: err instanceof Error ? err.message : String(err) };
      this.errs.set(path, this.lastErr);
      // výzva STIS / 403 bez uložené kopie u Workeru = STIS odmítá komunikovat
      if (err instanceof FetchError && (err.kind === "http" || err.kind === "gate") && this.blockedSince == null) this.blockedSince = Date.now();
      if (e && !live) { DebugLog.log("info", `Použita uložená kopie ${path} z ${new Date(e.at).toLocaleString("cs-CZ")}`, this.lastErr.msg); return e.html; }
      throw err;
    }
  }

  private lastRenew = 0;
  /** STIS odpovídá 403 bez platné relace (cookie) – založit novou (nejvýš jednou za 20 s) a zkusit znovu. */
  private renewing: Promise<boolean> | null = null;
  private async renewSession(wait = false): Promise<boolean> {
    // souběžné požadavky počkají na jednu obnovu relace
    if (this.renewing) return wait ? this.renewing : false;
    if (Date.now() - this.lastRenew < 20_000) return wait;
    this.renewing = this.doRenew().finally(() => { this.renewing = null; });
    return this.renewing;
  }
  private async doRenew(): Promise<boolean> {
    DebugLog.log("info", "Zakládám novou relaci STIS (/?nuser=1)");
    this.lastRenew = Date.now();
    this.cookie = "";
    try { sessionStorage.removeItem(SP + "cookie"); } catch { /* */ }
    try { await this.call("/?nuser=1", null, null); this.sessionReady = true; return true; } catch { return false; }
  }

  private async download(path: string, maxAgeMs = 0): Promise<string> {
    let html: string;
    try { html = (await this.call(path, null, null, maxAgeMs))[0]; }
    catch (e) {
      if (!(e instanceof FetchError && e.kind === "http" && /chyba 403/.test(e.message)) || !(await this.renewSession())) throw e;
      html = (await this.call(path, null, null, maxAgeMs))[0];
    }
    // krátká stránka s přesměrováním (meta refresh / skript) -> následovat (nejvýš 2×)
    for (let hop = 0; hop < 2 && Parsers.isGate(html); hop++) {
      const to = gateTarget(html);
      if (!to) break;
      DebugLog.log("info", `Krátká stránka s přesměrováním → následuji ${to}`);
      html = (await this.call(to, path, null))[0];
    }
    if (Parsers.isGate(html)) {
      const sep = path.includes("?") ? "&" : "?";
      html = (await this.call(path + sep + "nuser=1", null, null))[0];
      const m = this.metas.get(path + sep + "nuser=1"); if (m) this.metas.set(path, m);
    }
    // pořád uvítací stránka STIS: založit novou relaci (cookie) a zkusit stránku znovu
    if (Parsers.isGate(html) && await this.renewSession(true)) html = (await this.call(path, null, null))[0];
    if (Parsers.isGate(html)) throw new FetchError(`STIS místo stránky poslal krátkou odpověď (${html.length} znaků): ${gateSummary(html)}`, "gate");
    return html;
  }

  /** Šetrně k serveru STIS: nejvýš ~3 požadavky za sekundu. */
  private async throttle() {
    const now = Date.now();
    const at = Math.max(now, this.nextSlot);
    // Worker 2+ hlídá zátěž STIS sám (sdílená mezipaměť, nejvýš 6 souběžných dotazů) -> rychlejší načítání
    // šetrně k STIS: nejvýš ~3 dotazy za sekundu (při hustším dotazování STIS odmítal 403)
    this.nextSlot = at + 300;
    if (at > now) await sleep(at - now);
  }

  /** Jeden požadavek přes proxy. Vrací HTML a cestu, na které požadavek skončil (kvůli přesměrování). */
  private async call(path: string, referer: string | null, form: Record<string, string> | null, maxAgeMs = 0): Promise<[string, string]> {
    const proxy = prefs.proxyUrl;
    if (!proxy) throw new FetchError("Není nastavená adresa proxy pro čtení STIS (Nastavení → Připojení ke STIS).", "noproxy");
    await this.throttle();
    const p = path.startsWith("http") ? path.replace(/^https?:\/\/[^/]+/, "") : path;
    const headers: Record<string, string> = {};
    if (this.cookie) headers["X-Stis-Cookie"] = this.cookie;
    if (referer) headers["X-Stis-Referer"] = referer;
    // sdílená mezipaměť Workeru: jak stará kopie stačí (jen nový Worker – starý by hlavičku v CORS odmítl)
    // ruční Obnovit (0) u běžných stránek: stačí kopie mladší 1 min (sdílená) – šetří limit STIS; zápisy vždy čerstvě
    const ma = maxAgeMs > 0 ? maxAgeMs : path.startsWith("/zapis/") ? 0 : 60_000;
    if (this.proxyV >= 2 && !form && ma > 0) headers["X-Max-Age"] = String(Math.floor(ma / 1000));
    let body: string | undefined;
    if (form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = Object.entries(form).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
    }
    let resp: Response;
    const t0 = Date.now();
    const what = `${form ? "POST" : "GET"} ${p}${this.cookie ? " [relace]" : " [bez relace]"}${headers["X-Max-Age"] ? ` [max ${headers["X-Max-Age"]} s]` : ""}`;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 40_000);
      resp = await fetch(proxy + p, { method: form ? "POST" : "GET", headers, body, signal: ctl.signal, cache: "no-store" });
      clearTimeout(timer);
    } catch (e) {
      DebugLog.log("err", `${what} → spojení selhalo (${Date.now() - t0} ms)`, (e as Error)?.name + ": " + (e as Error)?.message);
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new FetchError("Nejste připojeni k internetu.", "offline");
      // sem se dostaneme, jen když selže spojení k Workeru (proxy) – to je úsek telefon → Cloudflare, ne STIS
      if ((e as Error)?.name === "AbortError") throw new FetchError("Server pro čtení dat (proxy) neodpovídá, zkuste to prosím za chvíli.", "offline");
      throw new FetchError("Nepodařilo se spojit se serverem pro čtení dat (proxy). Zkontrolujte připojení k internetu.", "proxy");
    }
    const hdr = (k: string) => resp.headers.get(k);
    const info = () => [`Worker ${hdr("X-Proxy-Version") ?? "?"}`, hdr("X-Cache") ? `mezipaměť ${hdr("X-Cache")}` : "", hdr("X-Stale") === "1" ? "STARÁ KOPIE" : "",
      hdr("X-Final-Url") && hdr("X-Final-Url") !== p ? `přesměrováno na ${hdr("X-Final-Url")}` : "", hdr("X-Stis-Cookie") ? "STIS poslal cookie" : "",
      hdr("X-Stis-Cache") ? `hlavičky STIS: ${hdr("X-Stis-Cache")}` : "", hdr("X-Fetched-At") ? `staženo ${new Date(Number(hdr("X-Fetched-At"))).toLocaleTimeString("cs-CZ")}` : ""].filter(Boolean).join(" · ");
    if (!resp.ok) {
      DebugLog.log("err", `${what} → proxy ${resp.status} (${Date.now() - t0} ms)`, info());
      throw new FetchError(`Proxy odpověděla ${resp.status}`, "proxy");
    }
    const ck = resp.headers.get("X-Stis-Cookie");
    if (ck != null && ck !== "") {
      this.cookie = ck;
      try { sessionStorage.setItem(SP + "cookie", ck); } catch { /* */ }
    }
    const pv = Number(resp.headers.get("X-Proxy-Version") ?? "0") || 0;
    if (pv !== this.proxyV) { this.proxyV = pv; try { localStorage.setItem(SP + "proxy_v", String(pv)); } catch { /* */ } }
    const status = Number(resp.headers.get("X-Stis-Status") ?? "200");
    if (status >= 400) {
      // diagnostika: co STIS (resp. jeho ochrana Cloudflare) vrátil – titulek stránky / kód chyby (1015 = limit, 1020 = pravidlo…)
      let why = "";
      try {
        const t = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(await resp.arrayBuffer()).slice(0, 6000));
        const title = /<title[^>]*>([^<]{1,120})<\/title>/i.exec(t)?.[1]?.replace(/\s+/g, " ").trim();
        const code = /error code:?\s*(\d{3,4})/i.exec(t)?.[1] ?? /Error\s+(10\d\d)/.exec(t)?.[1];
        why = [title, code ? `kód ${code}` : "", !title && !code ? t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : ""].filter(Boolean).join(", ");
      } catch { /* */ }
      DebugLog.log("err", `${what} → STIS ${status} (${Date.now() - t0} ms)${why ? ` · ${why}` : ""}`, info());
      // 403/429/5xx = STIS odmítá komunikovat (ne chybějící stránka) → upozornit uživatele
      if ((status === 403 || status === 429 || status >= 500) && this.blockedSince == null) this.blockedSince = Date.now();
      throw new FetchError(`STIS odmítl přístup – chyba ${status}${why ? ` (${why})` : ""}`, "http");
    }
    // čas dat jen u úspěšné odpovědi (jinak by stará data vypadala jako čerstvá)
    const stisAt = Number(resp.headers.get("X-Fetched-At") ?? "0") || Date.now();
    const stale = resp.headers.get("X-Stale") === "1";
    this.metas.set(p.split("#")[0], { at: Date.now(), stisAt, stisCache: resp.headers.get("X-Stis-Cache") ?? "", cache: resp.headers.get("X-Cache") ?? "", stale });
    // stará kopie = Worker nedosáhl na STIS (STIS odmítá); čerstvá odpověď = STIS komunikuje, blokace pominula
    if (stale) { if (this.blockedSince == null) this.blockedSince = Date.now(); }
    else this.blockedSince = null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const final = (resp.headers.get("X-Final-Url") ?? p).split("?")[0];
    const html = Html.decodeMixed(bytes);
    const short = Parsers.isGate(html);
    DebugLog.log(short ? "err" : "ok", `${what} → STIS ${status}, ${bytes.length} B${short ? " (KRÁTKÁ ODPOVĚĎ)" : ""} (${Date.now() - t0} ms)`,
      info() + (short ? ` · obsah: ${gateSummary(html)}` : ""));
    return [html, final];
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

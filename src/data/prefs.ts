// Nastavení a malé stavové hodnoty (přepis Prefs.kt) – uložené v localStorage prohlížeče.
const P = "mystis.";

function get(k: string): string | null {
  try { return localStorage.getItem(P + k); } catch { return null; }
}
function set(k: string, v: string | null) {
  try { if (v == null) localStorage.removeItem(P + k); else localStorage.setItem(P + k, v); } catch { /* soukromý režim */ }
}
const num = (k: string, d: number) => { const v = get(k); const n = v == null ? NaN : Number(v); return Number.isFinite(n) ? n : d; };

declare global { interface Window { MYSTIS_PROXY?: string } }

export const prefs = {
  get playerPath() { return get("player_path"); },
  set playerPath(v: string | null) { set("player_path", v); },
  get playerName() { return get("player_name"); },
  set playerName(v: string | null) { set("player_name", v); },
  /** Ručně zadaný odkaz na oddíl. */
  get clubPath() { return get("club_path"); },
  set clubPath(v: string | null) { set("club_path", v); },
  get notifications() { return get("notifications") !== "false"; },
  set notifications(v: boolean) { set("notifications", String(v)); },
  /** Notifikace o hrách probíhajícího utkání (jen při otevřené aplikaci). */
  /** Rozsah upozornění na živé utkání: vypnuto / hry (výchozí) / hry i sety. */
  get liveMode(): "off" | "games" | "sets" {
    const v = get("live_mode");
    if (v === "off" || v === "games" || v === "sets") return v;
    return get("live_notify") === "false" ? "off" : "games";
  },
  set liveMode(v: "off" | "games" | "sets") { set("live_mode", v); },
  get liveNotify() { return this.liveMode !== "off"; },
  set liveSounds(v: boolean) { set("live_sounds", String(v)); },
  /** Zvuk davu při dohrané hře (výhra / prohra) a na konci utkání. */
  get liveSounds() { return get("live_sounds") !== "false"; },
  set liveNotify(v: boolean) { this.liveMode = v ? (this.liveMode === "off" ? "games" : this.liveMode) : "off"; },
  get lastMatchCount() { return num("last_match_count", -1); },
  set lastMatchCount(v: number) { set("last_match_count", String(v)); },
  get lastStr() { return num("last_str", -1); },
  set lastStr(v: number) { set("last_str", String(v)); },
  get seasonDelta() { return num("season_delta", 0); },
  set seasonDelta(v: number) { set("season_delta", String(v)); },
  get nextMatchText() { return get("next_match_text"); },
  set nextMatchText(v: string | null) { set("next_match_text", v); },
  get remindedMatch() { return get("reminded_match"); },
  set remindedMatch(v: string | null) { set("reminded_match", v); },
  /** Naposledy použité profily: [cesta, jméno], nejnovější první. */
  get recentProfiles(): [string, string][] {
    return (get("recent_profiles") ?? "").split("\n").filter((x) => x.includes("|"))
      .map((x) => [x.substring(0, x.indexOf("|")), x.substring(x.indexOf("|") + 1)] as [string, string]);
  },
  set recentProfiles(v: [string, string][]) { set("recent_profiles", v.map((x) => `${x[0]}|${x[1]}`).join("\n")); },
  addRecent(path: string, name: string) {
    prefs.recentProfiles = [[path, name] as [string, string], ...prefs.recentProfiles.filter((x) => x[0] !== path)].slice(0, 8);
  },
  get matchFormat() { return get("match_format"); },
  set matchFormat(v: string | null) { set("match_format", v); },
  get firstLoadDone() { return get("first_load_done") === "true"; },
  set firstLoadDone(v: boolean) { set("first_load_done", String(v)); },
  get lastSync() { return num("last_sync", 0); },
  set lastSync(v: number) { set("last_sync", String(v)); },
  /** Adresa proxy (Cloudflare Worker), přes kterou web čte STIS. */
  get proxyUrl(): string {
    return (get("proxy_url") ?? (typeof window !== "undefined" ? window.MYSTIS_PROXY : "") ?? "").trim().replace(/\/+$/, "");
  },
  set proxyUrl(v: string) { set("proxy_url", v.trim() ? v.trim().replace(/\/+$/, "") : null); },
  get proxyFromConfig(): boolean { return get("proxy_url") == null && !!(typeof window !== "undefined" && window.MYSTIS_PROXY); },
};

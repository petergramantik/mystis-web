// Ladicí konzole (HotFix H1): záznam všech dotazů na STIS a ladicích hlášek.
// Zapisuje se vždy (kruhový zásobník 500 záznamů, přežije obnovení stránky);
// zobrazí se jen správci (O aplikaci → 5× klepnout na verzi → odemknout klíčem).
import { SP } from "../app/channel";

export type LogKind = "req" | "ok" | "err" | "info";
export interface LogEntry { t: number; k: LogKind; m: string; d?: string }

const KEY = SP + "debuglog";
const MAX = 500;
let entries: LogEntry[] = [];
try { entries = JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { entries = []; }
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* plné úložiště – jen v paměti */ }
  }, 1500);
}

export const DebugLog = {
  log(k: LogKind, m: string, d?: string) {
    entries.push(d ? { t: Date.now(), k, m, d: d.slice(0, 600) } : { t: Date.now(), k, m });
    if (entries.length > MAX) entries = entries.slice(-MAX);
    save();
    for (const l of listeners) l();
  },
  entries(): LogEntry[] { return entries; },
  clear() { entries = []; save(); for (const l of listeners) l(); },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  line(e: LogEntry): string {
    const d = new Date(e.t);
    const ts = `${d.getDate()}.${d.getMonth() + 1}. ${d.toLocaleTimeString("cs-CZ")}.${String(d.getMilliseconds()).padStart(3, "0")}`;
    return `${ts} [${e.k}] ${e.m}${e.d ? `\n    ${e.d}` : ""}`;
  },
  text(onlyErrors = false): string {
    const list = onlyErrors ? entries.filter((e) => e.k === "err") : entries;
    return list.map(DebugLog.line).join("\n");
  },
};

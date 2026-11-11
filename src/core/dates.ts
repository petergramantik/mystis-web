// Datum = počet dní od 1. 1. 1970 (jako LocalDate.toEpochDay), datum a čas = minuty od 1970 podle místních hodin.
export type LDate = number;
export type LDT = number;

export const LDATE_MIN = -1e9;
export const LDT_MAX = 1e15;

export function ldOf(y: number, m: number, d: number): LDate | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return Math.round(t / 86400000);
}
export function ldtOf(y: number, mo: number, d: number, h = 0, mi = 0): LDT {
  return Math.round(Date.UTC(y, mo - 1, d, h, mi) / 60000);
}
export function ldAtTime(d: LDate, h: number, mi: number): LDT {
  return d * 1440 + h * 60 + mi;
}
export function ldtDate(t: LDT): LDate { return Math.floor(t / 1440); }
export function ldYear(d: LDate): number { return new Date(d * 86400000).getUTCFullYear(); }
export function ldMonth(d: LDate): number { return new Date(d * 86400000).getUTCMonth() + 1; }
export function ldDay(d: LDate): number { return new Date(d * 86400000).getUTCDate(); }
export function ldDow(d: LDate): number { const w = new Date(d * 86400000).getUTCDay(); return w === 0 ? 7 : w; }
export function ldMinusYears(d: LDate, n: number): LDate {
  const y = ldYear(d) - n, m = ldMonth(d);
  let dd = ldDay(d);
  let r = ldOf(y, m, dd);
  while (r == null && dd > 28) { dd--; r = ldOf(y, m, dd); }
  return r ?? d - 365 * n;
}

/** Dnešní datum a aktuální čas podle hodin zařízení. */
export function today(): LDate {
  const n = new Date();
  return ldOf(n.getFullYear(), n.getMonth() + 1, n.getDate())!;
}
export function nowLdt(): LDT {
  const n = new Date();
  return ldtOf(n.getFullYear(), n.getMonth() + 1, n.getDate(), n.getHours(), n.getMinutes());
}

const pad = (n: number) => (n < 10 ? "0" : "") + n;
export function fmtDate(d: LDate | null | undefined): string {
  if (d == null) return "";
  return `${ldDay(d)}. ${ldMonth(d)}. ${ldYear(d)}`;
}
export function fmtShort(d: LDate | null | undefined): string {
  if (d == null) return "";
  return `${ldDay(d)}. ${ldMonth(d)}.`;
}
export function fmtDT(t: LDT | null | undefined): string {
  if (t == null) return "";
  const d = ldtDate(t);
  const mins = t - d * 1440;
  return `${ldDay(d)}. ${ldMonth(d)}. ${ldYear(d)} ${Math.floor(mins / 60)}:${pad(mins % 60)}`;
}
export function ldtHour(t: LDT): number { return Math.floor((t - ldtDate(t) * 1440) / 60); }
export function ldtMinute(t: LDT): number { return (t - ldtDate(t) * 1440) % 60; }

import { type LDT, type LDate, ldDay, ldDow, ldMonth, ldYear, ldtDate, ldtHour, ldtMinute } from "../core/dates";

const DAYS = ["", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"];
const MONTHS = ["", "leden", "únor", "březen", "duben", "květen", "červen", "červenec", "srpen", "září", "říjen", "listopad", "prosinec"];
const pad = (n: number) => (n < 10 ? "0" : "") + n;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Pátek 6. 11. 17:30" (EEEE d. M. HH:mm) */
export function fmtWhenShort(t: LDT): string {
  const d = ldtDate(t);
  return cap(`${DAYS[ldDow(d)]} ${ldDay(d)}. ${ldMonth(d)}. ${pad(ldtHour(t))}:${pad(ldtMinute(t))}`);
}
/** "Pátek 6. 11. 2026, 17:30" (EEEE d. M. yyyy, HH:mm) */
export function fmtWhenLong(t: LDT): string {
  const d = ldtDate(t);
  return cap(`${DAYS[ldDow(d)]} ${ldDay(d)}. ${ldMonth(d)}. ${ldYear(d)}, ${pad(ldtHour(t))}:${pad(ldtMinute(t))}`);
}
/** "Říjen 2026" (LLLL yyyy) */
export function fmtMonth(d: LDate): string { return cap(`${MONTHS[ldMonth(d)]} ${ldYear(d)}`); }
export function fmtDMYdt(t: LDT): string { const d = ldtDate(t); return `${ldDay(d)}. ${ldMonth(d)}. ${ldYear(d)}`; }
export function hhmm(ms: number): string { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function hhmmLdt(t: LDT): string { return `${pad(ldtHour(t))}:${pad(ldtMinute(t))}`; }

// Sdílené prvky vzhledu (přepis Components.kt).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Match } from "../core/models";
import type { Forecast } from "../core/stats";
import { type LDate, fmtDate, fmtShort, ldDay, ldMonth, ldYear } from "../core/dates";

export const C = {
  Navy: "#0E1A33", Navy2: "#17284A", Blue: "#1F4FB8", BlueLight: "#5F8CFF", Orange: "#E8571E", OrangeText: "#C2410C",
  Peach: "#FFA779", Ink: "#101828", Muted: "#5B6474", MutedOnNavy: "#B7C2D8", Line: "#E3E6EB", Ground: "#F4F5F7",
  Tint: "#EAF0FC", LossTint: "#FBE9E1", Win: "#15803D", WinLight: "#6EE7A0", WinTint: "#E3F5EA", Live: "#7C3AED", White: "#FFFFFF",
  Grey: "#8C97AA",
  result: (won: boolean) => (won ? C.Win : C.OrangeText),
  /** barva změny: plus zeleně, minus oranžově, nula neutrálně šedě */
  delta: (v: number | null | undefined) => { const x = v ?? 0; return x > 0.05 ? C.Win : x < -0.05 ? C.OrangeText : C.Muted; },
};

// ---------------------------------------------------------------- ikony (Material)
const ICONS: Record<string, string> = {
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  leaderboard: "M7.5 21H2V9h5.5v12zm7.25-18h-5.5v18h5.5V3zM22 11h-5.5v10H22V11z",
  chart: "M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z",
  list: "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z",
  search: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  refresh: "M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  more: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  event: "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
  groups: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  compare: "M9.01 14H2v2h7.01v3L13 15l-3.99-4v3zm5.98-1v-3H22V8h-7.01V5L11 9l3.99 4z",
  trophy: "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z",
  settings: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  swap: "M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z",
  caret: "M7 10l5 5 5-5z",
  share: "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z",
  person: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  info: "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z",
};
export function Icon({ name, size = 24, color, style }: { name: string; size?: number; color?: string; style?: CSSProperties }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} style={{ fill: color ?? "currentColor", flex: "none", ...style }} aria-hidden="true"><path d={ICONS[name]} /></svg>;
}

// ---------------------------------------------------------------- formátování
export const DM = (d: LDate | null | undefined) => fmtShort(d);
export const DMY = (d: LDate | null | undefined) => fmtDate(d);
export function signedInt(v: number | null | undefined): string {
  if (v == null) return "–";
  if (v > 0) return "+" + v;
  if (v < 0) return "−" + -v;
  return "0";
}
export const dec1 = (v: number) => v.toFixed(1).replace(".", ",");
export const f0 = (v: number) => Math.round(v).toString();
export function initials(name: string): string {
  const r = name.split(/\s+/).filter((w) => w && /\p{L}/u.test(w[0])).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return r || "?";
}
// ---------------------------------------------------------------- základní prvky
export function BigNumber({ text, color = C.Ink, size = 28, style }: { text: string; color?: string; size?: number; style?: CSSProperties }) {
  return <div className="big" style={{ color, fontSize: size, ...style }}>{text}</div>;
}

export function Muted({ text, color = C.Muted, size = 13, maxLines = 2, style, className }: { text: ReactNode; color?: string; size?: number; maxLines?: number; style?: CSSProperties; className?: string }) {
  const clamp: CSSProperties = maxLines === 1
    ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
    : { display: "-webkit-box", WebkitLineClamp: maxLines, WebkitBoxOrient: "vertical", overflow: "hidden" };
  return <div className={className} style={{ color, fontSize: size, lineHeight: 1.35, ...clamp, ...style }}>{text}</div>;
}

export function T({ children, size = 14, bold, semi, color, style, lines, className, center, end }: {
  children: ReactNode; size?: number; bold?: boolean; semi?: boolean; color?: string; style?: CSSProperties; lines?: number; className?: string; center?: boolean; end?: boolean;
}) {
  const clamp: CSSProperties = lines === 1 ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
    : lines ? { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } : {};
  return <div className={className} style={{ fontSize: size, fontWeight: bold ? 700 : semi ? 600 : 400, color, lineHeight: 1.3, textAlign: center ? "center" : end ? "right" : undefined, ...clamp, ...style }}>{children}</div>;
}

export function NavyHeader({ children }: { children: ReactNode }) { return <div className="header">{children}</div>; }

export function AppCard({ children, onClick, padding = 14, bg = "#fff", style, className }: { children: ReactNode; onClick?: (() => void) | null; padding?: number; bg?: string; style?: CSSProperties; className?: string }) {
  return <div className={"card" + (onClick ? " clickable" : "") + (className ? " " + className : "")} style={{ padding, background: bg, ...style }} onClick={onClick ?? undefined}>{children}</div>;
}
export function ListCard({ children, style }: { children: ReactNode; style?: CSSProperties }) { return <div className="listcard" style={style}>{children}</div>; }

export function StatTile({ label, value, dark, valueColor, sub, onClick, busy, suffix }: {
  label: string; value: string; dark?: boolean; valueColor?: string; sub?: string | null; onClick?: () => void; subLeftEllipsis?: boolean; busy?: boolean;
  /** menší text za hodnotou (např. barevný rozdíl) */
  suffix?: { text: string; color: string } | null;
}) {
  const mc = dark ? C.MutedOnNavy : C.Muted;
  return (
    <div className={"tile" + (dark ? " dark" : "") + (onClick ? " clickable" : "")} onClick={onClick}>
      <Marquee text={label} color={mc} size={12} />
      <div className="row" style={{ gap: 6 }}>
        <BigNumber text={value} color={valueColor ?? (dark ? "#fff" : C.Ink)} size={22} />
        {suffix && <span style={{ color: suffix.color, fontSize: 13, fontWeight: 700, alignSelf: "flex-end", paddingBottom: 3, whiteSpace: "nowrap" }}>{suffix.text}</span>}
        {busy && <Spinner size={13} width={2} color={mc} />}
      </div>
      {sub != null && <Marquee text={sub} color={mc} size={11} />}
    </div>
  );
}

/** Šířka prvku (pro grafy a zkracování textu). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/**
 * Text na jeden řádek: když se nevejde, pomalu se posune, aby byl vidět celý, chvíli počká a vrátí se zpět
 * (místo zkrácení třemi tečkami). Text, který se vejde, stojí.
 */
export function Marquee({ text, color, size, bold, center }: { text: string; color?: string; size?: number; bold?: boolean; center?: boolean }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [d, setD] = useState(0);
  useLayoutEffect(() => {
    const o = outer.current, i = inner.current;
    if (!o || !i) return;
    const measure = () => { const diff = Math.ceil(i.scrollWidth - o.clientWidth); setD(diff > 1 ? diff : 0); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o); ro.observe(i);
    return () => ro.disconnect();
  }, [text, size, bold]);
  // rychlost ~25 px/s, na začátku a na konci pauza
  const dur = 3 + (2 * d) / 25;
  const style: CSSProperties = { overflow: "hidden", whiteSpace: "nowrap", width: "100%", color, fontSize: size, fontWeight: bold ? 700 : undefined, lineHeight: 1.35, textAlign: d ? "left" : center ? "center" : undefined };
  return (
    <div ref={outer} className="mqbox" style={style}>
      <span ref={inner} className={d ? "mq" : undefined} style={d ? ({ ["--d" as any]: `-${d}px`, animationDuration: `${dur}s` } as CSSProperties) : { display: "inline-block" }}>{text}</span>
    </div>
  );
}

/** Hráč v hlavičce vzájemných zápasů: kolečko, jméno (vždy 2 řádky), STR a družstvo. */
export function HeaderPlayer({ name, str, team, color, onClick }: { name: string; str: number | null | undefined; team: string; color: string; onClick?: (() => void) | null }) {
  return (
    <div className={"col w1 g4" + (onClick ? " clickable" : "")} style={{ alignItems: "center" }} onClick={onClick ?? undefined}>
      <Avatar text={name} color={color} size={56} />
      <T bold color="#fff" center lines={2} style={{ minHeight: "2.6em", fontSize: 16 }}>{name + (onClick ? " ›" : "")}</T>
      <Muted text={`STR ${str ?? "–"}`} color={C.MutedOnNavy} size={13} maxLines={1} />
      <Marquee text={team.trim() ? team : " "} color={C.MutedOnNavy} size={12} center />
    </div>
  );
}

export function TileRow({ children }: { children: ReactNode }) { return <div className="tiles">{children}</div>; }

export function ResultBadge({ won, text, wide }: { won: boolean; text: string; wide?: boolean }) {
  return <div className={"badge" + (wide ? " wide" : "")} style={{ background: C.result(won) }}>{text}</div>;
}
/** Forma V/P: ikonky se rovnoměrně rozdělí do šířky (vždy jeden řádek), čtvercové, max. 40 px. */
/** Forma: [results] od nejnovějšího; zobrazí se zleva nejstarší, vpravo nejnovější (zvýrazněný rámečkem). */
export function FormDots({ results }: { results: boolean[] }) {
  const n = Math.max(results.length, 8);
  const list = [...results].reverse();
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0, 40px))`, gap: 6, padding: 3 }}>
      {list.map((w, i) => (
        <div key={i} title={i === list.length - 1 ? "nejnovější zápas" : undefined} style={{ aspectRatio: "1", background: C.result(w), borderRadius: "28%", color: "#fff", fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: "clamp(11px, 3.4vw, 14px)",
          boxShadow: i === list.length - 1 ? `0 0 0 2px #fff, 0 0 0 3.5px ${C.result(w)}` : undefined }}>{w ? "V" : "P"}</div>
      ))}
    </div>
  );
}

export function Chips({ options, selected, onSelect, style }: { options: [string, string][]; selected: string; onSelect: (k: string) => void; style?: CSSProperties }) {
  return (
    <div className="chips" style={style}>
      {options.map(([k, l]) => <button key={k} className={"chip" + (k === selected ? " on" : "")} onClick={() => onSelect(k)}>{l}</button>)}
    </div>
  );
}
export function Segmented({ options, selected, onSelect }: { options: [string, string][]; selected: string; onSelect: (k: string) => void }) {
  return <div className="seg">{options.map(([k, l]) => <button key={k} className={k === selected ? "on" : ""} onClick={() => onSelect(k)}><Marquee text={l} center /></button>)}</div>;
}
export function SectionTitle({ text, action, onAction }: { text: string; action?: string | null; onAction?: () => void }) {
  return <div className="section"><div className="t">{text}</div>{action && onAction && <button className="textbtn" onClick={onAction}>{action}</button>}</div>;
}
export function Spinner({ size = 22, width = 2.5, color = C.Blue }: { size?: number; width?: number; color?: string }) {
  return <div className="spinner" style={{ width: size, height: size, borderWidth: width, color }} />;
}
export function Loading({ text = "Načítám data ze STIS…" }: { text?: string }) {
  return <div className="row" style={{ justifyContent: "center", padding: 24, gap: 12 }}><Spinner /><Muted text={text} size={15} /></div>;
}
export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <AppCard>
      <T bold color={C.OrangeText}>Něco se nepovedlo</T>
      <Muted text={text} size={14} maxLines={6} />
      {onRetry && <div><button className="obtn" onClick={onRetry}>Zkusit znovu</button></div>}
    </AppCard>
  );
}
export function Empty({ text }: { text: string }) {
  return <div style={{ padding: 28, display: "flex", justifyContent: "center", textAlign: "center" }}><Muted text={text} size={15} maxLines={4} /></div>;
}
export function PrimaryButton({ text, onClick, enabled = true, full }: { text: string; onClick: () => void; enabled?: boolean; full?: boolean }) {
  return <button className="btn" disabled={!enabled} onClick={onClick} style={full ? { width: "100%" } : undefined}>{text}</button>;
}
export function OButton({ text, onClick, enabled = true, full, style }: { text: string; onClick: () => void; enabled?: boolean; full?: boolean; style?: CSSProperties }) {
  return <button className="obtn" disabled={!enabled} onClick={onClick} style={{ ...(full ? { width: "100%" } : {}), ...style }}>{text}</button>;
}
export function Avatar({ text, color = C.Blue, size = 40, square }: { text: string; color?: string; size?: number; square?: boolean }) {
  return <div className={"avatar" + (square ? " sq" : "")} style={{ width: size, height: size, background: color, fontSize: size / 2.6 }}>{initials(text)}</div>;
}
/** Pásek šance: zelená = moje družstvo; [reverse] = zelená zprava (hrajeme venku, jsme vpravo). */
export function ProbBar({ p, reverse = false }: { p: number; reverse?: boolean }) {
  return <div className="probbar"><div style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%`, marginLeft: reverse ? "auto" : undefined }} /></div>;
}

/** Kolečko s odpočtem do další aktualizace; klepnutí = obnovit hned. */
export function CountdownRing({ next, period, busy, onClick, dark = false }: { next: number; period: number; busy: boolean; onClick: () => void; dark?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, next - Date.now());
  const frac = busy ? 0.3 : Math.min(1, left / period);
  const r = 15, len = 2 * Math.PI * r;
  return (
    <div className="clickable" onClick={onClick} title="Obnovit" style={{ width: 40, height: 40, position: "relative", flex: "none" }}>
      <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: "rotate(-90deg)", animation: busy ? "ringspin 1s linear infinite" : undefined }}>
        <circle cx="20" cy="20" r={r} fill="none" stroke={dark ? "rgba(255,255,255,0.22)" : "#E3E8F2"} strokeWidth="4" />
        <circle cx="20" cy="20" r={r} fill="none" stroke={dark ? "#fff" : C.Blue} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={len} strokeDashoffset={len * (1 - frac)} style={{ transition: "stroke-dashoffset 1s linear" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: dark ? "#fff" : C.Blue }}>
        {busy ? "…" : Math.ceil(left / 1000)}
      </div>
    </div>
  );
}
export function Divider() { return <div className="divider" />; }
export function KeyValue({ label, value, valueColor = C.Ink, onClick }: { label: string; value: string; valueColor?: string; onClick?: (() => void) | null }) {
  return <div className={"kv" + (onClick ? " clickable" : "")} onClick={onClick ?? undefined}><div className="k">{label}</div><div className="v" style={{ color: valueColor }}>{value + (onClick ? " ›" : "")}</div></div>;
}
export function Pill({ text, bg = C.Tint, fg = C.Blue }: { text: string; bg?: string; fg?: string }) {
  return <span className="pilltag" style={{ background: bg, color: fg }}>{text}</span>;
}
export function Legend({ items }: { items: [string, string][] }) {
  return <div className="legend">{items.map(([c, t], i) => <div className="it" key={i}><div className="sw" style={{ background: c }} />{t}</div>)}</div>;
}

export function TextField({ value, onChange, label, placeholder, icon, numeric, onEnter }: {
  value: string; onChange: (v: string) => void; label: string; placeholder?: string; icon?: string; numeric?: boolean; onEnter?: () => void;
}) {
  return (
    <div className={"field" + (icon ? " icon" : "")}>
      {icon && <svg className="ico" viewBox="0 0 24 24"><path d={ICONS[icon]} /></svg>}
      <input value={value} placeholder={placeholder} inputMode={numeric ? "numeric" : undefined} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }} autoComplete="off" autoCorrect="off" spellCheck={false} />
      <label>{label}</label>
    </div>
  );
}

export function Dialog({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="dialog-bg" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="body">{children}</div>
        <div className="actions">{actions}</div>
      </div>
    </div>
  );
}

/** Chybová hláška s diagnostikou, kterou jde označit a zkopírovat. */
export function ErrorWithDiagnostics({ message, diagnostics }: { message: string; diagnostics?: string | null }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [message, diagnostics]);
  const copy = async () => {
    const full = message + (diagnostics ? `\nDiagnostika: ${diagnostics}` : "");
    try { await navigator.clipboard.writeText(full); } catch {
      const ta = document.createElement("textarea"); ta.value = full; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* */ } ta.remove();
    }
    setCopied(true);
  };
  return (
    <div className="col g6">
      <Muted text={message} color={C.OrangeText} size={14} maxLines={4} />
      {diagnostics && <div className="diag">Diagnostika: {diagnostics}</div>}
      <div className="row g10"><button className="obtn" onClick={copy}>Kopírovat</button>{copied && <T bold size={13} color={C.Win}>Zkopírováno</T>}</div>
    </div>
  );
}

// ---------------------------------------------------------------- řádek zápasu
export function MatchRow({ m, onClick, showDate = true }: { m: Match; onClick: () => void; showDate?: boolean }) {
  return (
    <>
      <div className="row g12 clickable" style={{ padding: "10px 14px" }} onClick={onClick}>
        {showDate ? (
          <div className="col" style={{ width: 42, alignItems: "center", flex: "none" }}>
            <T bold size={15}>{m.date != null ? DM(m.date) : m.dateText.substring(0, 6)}</T>
            <Muted text={m.date != null ? String(ldYear(m.date)) : ""} size={11} maxLines={1} />
          </div>
        ) : <ResultBadge won={m.won} text={m.won ? "V" : "P"} />}
        <div className="col w1">
          <T semi size={16} lines={1}>{m.opponent}</T>
          {m.oppStrBefore != null && (() => {
            // STR soupeře v době zápasu a rozdíl proti mému tehdejšímu STR (+ = soupeř silnější), vždy celé
            const d = m.strBefore != null ? m.oppStrBefore - m.strBefore : null;
            const col = d == null ? C.Muted : m.won && d >= 50 ? C.Win : !m.won && d <= -50 ? C.OrangeText : C.Muted;
            return <div style={{ fontSize: 13, color: C.Muted, whiteSpace: "nowrap" }}>{`STR ${m.oppStrBefore}`}{d != null && <span style={{ color: col, fontWeight: 600 }}>{` (${signedInt(d)})`}</span>}</div>;
          })()}
          <Muted text={m.opponentTeam} maxLines={1} />
          {m.unofficial && <T size={11} bold color={C.Live}>neoficiální · odhad STR</T>}
        </div>
        <div className="col" style={{ alignItems: "flex-end", gap: 2 }}>
          {showDate ? <ResultBadge won={m.won} text={m.score} wide /> : <BigNumber text={m.score} size={20} />}
          {m.delta != null && <T bold size={13} color={C.delta(m.delta)}>{signedInt(m.delta)}</T>}
        </div>
      </div>
      <Divider />
    </>
  );
}

// ---------------------------------------------------------------- grafy
export interface Series { color: string; points: [LDate, number][]; label?: string }

export function niceStep(raw: number): number {
  if (raw <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return mag * (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10);
}
const fmtMY = (d: LDate) => `${ldMonth(d)}/${String(ldYear(d) % 100).padStart(2, "0")}`;
const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function Grid({ minY, maxY, y, left, right }: { minY: number; maxY: number; y: (v: number) => number; left: number; right: number }) {
  const step = niceStep((maxY - minY) / 4);
  const lines: ReactNode[] = [];
  for (let g = Math.ceil(minY / step) * step; g <= maxY; g += step) {
    const yy = y(g);
    lines.push(<line key={"l" + g} x1={left} x2={right} y1={yy} y2={yy} stroke={C.Line} strokeWidth={0.8} />);
    lines.push(<text key={"t" + g} x={2} y={yy + 4} fontSize={11} fill={C.Muted}>{Math.trunc(g)}</text>);
  }
  return <>{lines}</>;
}

/** Graf STR v čase, volitelně s predikcí (přerušovaná čára + 80% pásmo). */
export function StrChart({ series, forecast = null, height = 230 }: { series: Series[]; forecast?: Forecast | null; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <Empty text="Graf zatím nemá data." />;
  const fpts = forecast?.path ?? [];
  const minX = Math.min(...all.map((p) => p[0]));
  const maxX = Math.max(Math.max(...all.map((p) => p[0])), fpts.length ? Math.max(...fpts.map((p) => p[0])) : -Infinity);
  const ys = [...all.map((p) => p[1]), ...fpts.flatMap((p) => [p[1][1], p[1][2]])];
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = Math.max(10, (maxY - minY) * 0.08);
  minY -= pad; maxY += pad;
  const left = 31, right = w - 4, top = 6, bottom = height - 17;
  const x = (d: number) => (maxX === minX ? (left + right) / 2 : left + (right - left) * ((d - minX) / (maxX - minX)));
  const y = (v: number) => bottom - (bottom - top) * ((v - minY) / (maxY - minY));
  const xl = [minX, Math.trunc((minX + maxX) / 2), maxX];
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {w > 0 && (
        <svg className="chart" width={w} height={height}>
          <Grid minY={minY} maxY={maxY} y={y} left={left} right={right} />
          {xl.map((d, i) => { const t = fmtMY(d); const tw = t.length * 6; return <text key={i} x={clampN(x(d) - tw / 2, left - 4, right - tw)} y={height - 3} fontSize={11} fill={C.Muted}>{t}</text>; })}
          {fpts.length >= 2 && (
            <>
              <path d={"M" + fpts.map((p) => `${x(p[0])},${y(p[1][2])}`).join("L") + "L" + [...fpts].reverse().map((p) => `${x(p[0])},${y(p[1][1])}`).join("L") + "Z"} fill={C.Orange} fillOpacity={0.15} />
              <path d={"M" + fpts.map((p) => `${x(p[0])},${y(p[1][0])}`).join("L")} fill="none" stroke={C.Orange} strokeWidth={2} strokeDasharray="6.5 5" strokeLinecap="round" />
              <line x1={x(fpts[0][0])} x2={x(fpts[0][0])} y1={top} y2={bottom} stroke={C.Ink} strokeOpacity={0.5} strokeWidth={0.8} strokeDasharray="2 3" />
              <text x={x(fpts[0][0]) - 11} y={top + 10} fontSize={11} fontWeight={700} fill={C.Ink}>dnes</text>
              <circle cx={x(fpts[fpts.length - 1][0])} cy={y(fpts[fpts.length - 1][1][0])} r={3.3} fill={C.Orange} />
            </>
          )}
          {series.filter((s) => s.points.length).map((s, i) => {
            const l = s.points[s.points.length - 1];
            return (
              <g key={i}>
                <path d={"M" + s.points.map((p) => `${x(p[0])},${y(p[1])}`).join("L")} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={x(l[0])} cy={y(l[1])} r={3.6} fill="#fff" stroke={s.color} strokeWidth={2} />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/**
 * Malý graf STR; konec: šipka nahoru (zeleně) / dolů (oranžovočerveně) podle změny v posledním utkání,
 * šedá tečka beze změny; [outline] = neoficiální odhad (obrysově).
 */
export function Sparkline({ values, width = 150, height = 70, color = C.BlueLight, end = null }: {
  values: number[]; width?: number; height?: number; color?: string;
  end?: { delta: number | null; outline?: boolean } | null;
}) {
  if (values.length < 2) return <div style={{ width, height }} />;
  const mn = Math.min(...values), mx = Math.max(...values);
  const w = width - 9; // místo pro šipku
  const py = (v: number) => (mx === mn ? height / 2 : height - 2 - (height - 4) * ((v - mn) / (mx - mn)));
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${(w * i) / (values.length - 1)},${py(v)}`).join("");
  const ex = w, ey = py(values[values.length - 1]);
  const dl = end?.delta ?? null;
  const out = !!end?.outline;
  let mark;
  if (dl == null || Math.round(dl) === 0) {
    mark = <circle cx={ex} cy={ey} r={3.6} fill={out ? "none" : C.Grey} stroke={C.Grey} strokeWidth={out ? 1.6 : 0} />;
  } else {
    const up = dl > 0, c = up ? C.WinLight : "#FF7A45", s = 7;
    const pts = up ? `${ex - s},${ey + s * 0.55} ${ex + s},${ey + s * 0.55} ${ex},${ey - s * 0.85}` : `${ex - s},${ey - s * 0.55} ${ex + s},${ey - s * 0.55} ${ex},${ey + s * 0.85}`;
    mark = <polygon points={pts} fill={out ? "none" : c} stroke={c} strokeWidth={out ? 1.8 : 1} strokeLinejoin="round" />;
  }
  return (
    <svg width={width} height={height} style={{ flex: "none", overflow: "visible" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {mark}
    </svg>
  );
}

/** Barva predikce: zeleně stoupá, oranžově klesá, šedě (změna pod 1 bod) beze změny. */
export function forecastColor(fc: Forecast | null | undefined): string {
  if (!fc) return C.Orange;
  const d = fc.center - fc.current;
  return Math.abs(d) < 1 ? C.Grey : d > 0 ? C.Win : C.Orange;
}

/**
 * Graf STR pro obrazovku STR: historie rozložená podle pořadí zápasů, za ní hry z probíhajícího utkání (fialově)
 * a úzký pruh vpravo s predikcí a 80% pásmem.
 */
export function StrTimelineChart({ history, live, forecast, height = 240, forecastFraction = 0.16 }: {
  history: [LDate, number][]; live: number[]; forecast: Forecast | null; height?: number; forecastFraction?: number;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  if (!history.length) return <Empty text="Graf zatím nemá data." />;
  const endStr = live.length ? live[live.length - 1] : history[history.length - 1][1];
  const shift = endStr - (forecast?.current ?? Math.trunc(endStr));
  const f = forecast?.path.map((p) => [p[1][0] + shift, p[1][1] + shift, p[1][2] + shift]) ?? [];
  const fcColor = forecastColor(forecast);
  const ys = [...history.map((p) => p[1]), ...live, ...f.flatMap((t) => [t[1], t[2]])];
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = Math.max(8, (maxY - minY) * 0.08);
  minY -= pad; maxY += pad;
  const n = history.length + live.length;
  const left = 31, right = w - 4, top = 6, bottom = height - 17;
  const histRight = f.length >= 2 ? left + (right - left) * (1 - forecastFraction) : right;
  const x = (i: number) => (n <= 1 ? (left + histRight) / 2 : left + ((histRight - left) * i) / (n - 1));
  const y = (v: number) => bottom - (bottom - top) * ((v - minY) / (maxY - minY));
  const labels = Array.from(new Set([0, Math.floor(history.length / 2), history.length - 1]));
  const fx = (k: number) => histRight + ((right - histRight) * k) / (f.length - 1);
  const lx = x(n - 1), ly = y(endStr);
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {w > 0 && (
        <svg className="chart" width={w} height={height}>
          <Grid minY={minY} maxY={maxY} y={y} left={left} right={right} />
          {labels.map((i) => { const t = DM(history[i][0]); const tw = t.length * 5.6; return <text key={i} x={clampN(x(i) - tw / 2, left - 4, histRight - tw)} y={height - 3} fontSize={11} fill={C.Muted}>{t}</text>; })}
          {f.length >= 2 && (
            <>
              <path d={"M" + f.map((t, k) => `${fx(k)},${y(t[2])}`).join("L") + "L" + f.map((t, k) => [k, t] as const).reverse().map(([k, t]) => `${fx(k)},${y(t[1])}`).join("L") + "Z"} fill={fcColor} fillOpacity={0.15} />
              <path d={"M" + f.map((t, k) => `${fx(k)},${y(t[0])}`).join("L")} fill="none" stroke={fcColor} strokeWidth={2} strokeDasharray="5 3.6" strokeLinecap="round" />
              <line x1={histRight} x2={histRight} y1={top} y2={bottom} stroke={C.Ink} strokeOpacity={0.4} strokeWidth={0.8} strokeDasharray="2 3" />
              <text x={histRight + 2} y={top + 9} fontSize={10} fontWeight={700} fill={C.Ink}>odhad</text>
              <circle cx={right - 1} cy={y(f[f.length - 1][0])} r={3} fill={fcColor} />
            </>
          )}
          <path d={"M" + history.map((p, i) => `${x(i)},${y(p[1])}`).join("L")} fill="none" stroke={C.Blue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {live.length > 0 && (
            <>
              <path d={`M${x(history.length - 1)},${y(history[history.length - 1][1])}` + live.map((v, k) => `L${x(history.length + k)},${y(v)}`).join("")} fill="none" stroke={C.Live} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              {live.map((v, k) => <circle key={k} cx={x(history.length + k)} cy={y(v)} r={2.5} fill={C.Live} />)}
              <text x={Math.min(x(history.length) - 14, histRight - 33)} y={bottom - 4} fontSize={10} fontWeight={700} fill={C.Live}>utkání</text>
            </>
          )}
          <circle cx={lx} cy={ly} r={3.6} fill="#fff" stroke={live.length ? C.Live : C.Blue} strokeWidth={2} />
        </svg>
      )}
    </div>
  );
}

export { ldDay };

/** Výběr ze seznamu (náhrada rozbalovacího menu v Android verzi). */
export function Field({ label, value, options, onPick }: { label: string; value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <div className="field">
      <select value={value} onChange={(e) => onPick(e.target.value)}>
        {!value && <option value="">–</option>}
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <label>{label}</label>
      <svg className="caret" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z" /></svg>
    </div>
  );
}

/** Výsledky setů (kladné = vyhráli domácí); sety mého družstva zeleně, prohrané oranžově. */
export function SetsLine({ sets, myHome, neutral = false }: { sets: number[]; myHome: boolean; neutral?: boolean }) {
  return (
    <div style={{ fontSize: 11, whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 600 }}>
      {sets.map((v, i) => {
        const pts = Math.abs(v), w = pts >= 10 ? pts + 2 : 11;
        return <span key={i} style={{ color: neutral ? C.Muted : (v > 0) === myHome ? C.Win : C.OrangeText }}>{(i ? "  " : "") + (v > 0 ? `${w}:${pts}` : `${pts}:${w}`)}</span>;
      })}
    </div>
  );
}

/** „Predikce: výhra 10 : 8“ – slovo z pohledu mého družstva (barevně), skóre v pořadí domácí : hosté. */
export function PredictionText({ hs, as_, myHome, size = 13, dark = false, center = false }: { hs: number; as_: number; myHome: boolean | null; size?: number; dark?: boolean; center?: boolean }) {
  const my = myHome === false ? as_ : hs, op = myHome === false ? hs : as_;
  const word = my > op ? "výhra" : my < op ? "prohra" : "remíza";
  const col = my > op ? (dark ? C.WinLight : C.Win) : my < op ? (dark ? C.Peach : C.OrangeText) : dark ? "#fff" : C.Ink;
  return (
    <T size={size} semi color={dark ? "#fff" : C.Ink} center={center}>
      {"Predikce: "}<span style={{ color: col, fontWeight: 800 }}>{word}</span>{` ${hs} : ${as_}`}
    </T>
  );
}

export { shortTeam } from "../core/names";
import { shortTeam } from "../core/names";
/** Název družstva v hlavičce: zkratky, až 3 řádky, u dlouhých menší písmo (bez ořezání). */
export function TeamName({ name, end = false, bold = true }: { name: string; end?: boolean; bold?: boolean }) {
  const n = shortTeam(name);
  const size = n.length > 26 ? 13 : n.length > 18 ? 14 : 16;
  return <T bold={bold} color="#fff" size={size} lines={3} end={end} style={{ flex: 1, wordBreak: "break-word" }}>{n}</T>;
}

// Ladicí konzole (HotFix H1, H3): všechny dotazy na STIS, ladicí hlášky a test spojení. Jen pro správce.
import { useEffect, useState } from "react";
import { vm } from "../../app/vm";
import { APP_VERSION } from "../../app/version";
import { Stis } from "../../core/models";
import { DebugLog, type LogEntry } from "../../data/debuglog";
import { AppCard, C, Chips, Muted, OButton, PrimaryButton, T, TextField } from "../components";
import { statsKey } from "./AdminStats";

const COLORS: Record<LogEntry["k"], string> = { req: C.Muted, ok: "#1B7A3E", err: "#B23A0B", info: "#1F4FB8" };

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* starší prohlížeč */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

/** Test spojení: Worker stáhne stejnou stránku několika způsoby a porovná, jak STIS odpoví. */
async function runDiag(path: string, ctrl: string) {
  const proxy = vm.prefs.proxyUrl;
  const key = statsKey();
  if (!proxy || !key) { DebugLog.log("err", "Test spojení: chybí adresa proxy nebo klíč správce"); return; }
  DebugLog.log("info", `Test spojení: ${path} (kontrola ${ctrl})`);
  const cookie = vm.fetcher.session;
  try {
    const r = await fetch(`${proxy}/__diag?key=${encodeURIComponent(key)}&path=${encodeURIComponent(path)}&ctrl=${encodeURIComponent(ctrl)}`,
      { cache: "no-store", headers: cookie ? { "X-Stis-Cookie": cookie } : {} });
    if (!r.ok) { DebugLog.log("err", `Test spojení: Worker vrátil ${r.status}`, (await r.text()).slice(0, 200)); return; }
    const j = await r.json();
    DebugLog.log("info", `Test spojení – Worker ${j.worker}, datové centrum ${j.colo || "?"}`);
    for (const x of j.results as any[]) {
      const bad = x.error || x.status >= 400 || x.short;
      DebugLog.log(bad ? "err" : "ok", `${x.label}: ${x.error ? "chyba spojení" : `STIS ${x.status}, ${x.bytes} B${x.short ? " (KRÁTKÁ)" : ""}`} (${x.ms} ms)`,
        [x.title ? `titulek „${x.title}“` : "", x.final && x.final !== x.path ? `konečná adresa ${x.final}` : "", x.cookieFromStis ? `STIS nastavil cookie ${x.cookieFromStis}` : "",
          x.stisCache ? `hlavičky ${x.stisCache}` : "", x.error ?? ""].filter(Boolean).join(" · "));
    }
  } catch (e) {
    DebugLog.log("err", "Test spojení: Worker nedostupný nebo starší než 2.5 (chybí /__diag)", String(e));
  }
}

export function ConsoleScreen() {
  const [, tick] = useState(0);
  const [filter, setFilter] = useState("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const me = vm.me;
  const ctx = vm.next[0];
  const [path, setPath] = useState(me ? Stis.canonicalPlayer(me.path) : "/");
  const [ctrl, setCtrl] = useState(ctx?.myTeam.ref ? Stis.tabulka(ctx.myTeam.ref.svaz, ctx.myTeam.ref.rocnik, ctx.myTeam.ref.soutez) : "/");
  useEffect(() => DebugLog.subscribe(() => tick((x) => x + 1)), []);
  const all = DebugLog.entries();
  const list = (filter === "err" ? all.filter((e) => e.k === "err") : all).slice().reverse();
  const header = `MySTIS ${APP_VERSION} · ${navigator.userAgent} · proxy ${vm.prefs.proxyUrl ?? "?"} · ${new Date().toLocaleString("cs-CZ")}`;
  const copy = async () => {
    const ok = await copyText(header + "\n" + DebugLog.text(filter === "err"));
    setMsg(ok ? `Zkopírováno (${filter === "err" ? all.filter((e) => e.k === "err").length : all.length} záznamů).` : "Kopírování se nepovedlo.");
  };
  return (
    <div className="col g12 px16" style={{ paddingTop: 4 }}>
      <AppCard>
        <T bold>Test spojení se STIS</T>
        <Muted size={12} maxLines={6} text="Worker stáhne stránku několika způsoby (jako aplikace / bez „MySTIS“ v identifikaci / bez relace / s novou relací) a kontrolní stránku. Výsledky se zapíší do konzole. Slouží jen k ověření, proč STIS odmítá – běžný provoz se nemění." />
        <TextField value={path} onChange={setPath} label="Testovaná stránka (např. profil)" />
        <TextField value={ctrl} onChange={setCtrl} label="Kontrolní stránka (funguje)" />
        <PrimaryButton text={busy ? "Testuji…" : "Test spojení"} enabled={!busy} onClick={async () => { setBusy(true); await runDiag(path.trim(), ctrl.trim()); setBusy(false); }} />
      </AppCard>
      <div className="row g8">
        <OButton text="Kopírovat vše" onClick={copy} style={{ flex: 1 }} />
        <OButton text="Vymazat" onClick={() => { DebugLog.clear(); setMsg(null); }} style={{ flex: 1 }} />
      </div>
      {msg && <Muted text={msg} size={13} />}
      <Chips options={[["all", `Vše (${all.length})`], ["err", `Jen chyby (${all.filter((e) => e.k === "err").length})`]]} selected={filter} onSelect={setFilter} />
      <AppCard>
        <Muted size={11} maxLines={3} text={header} />
        {list.length === 0 && <Muted text="Zatím žádné záznamy." size={13} />}
        {list.map((e, i) => (
          <div key={i} style={{ borderTop: i ? "1px solid #E3E8F0" : undefined, padding: "6px 0", fontFamily: "monospace", fontSize: 11.5, lineHeight: 1.35, wordBreak: "break-word" }}>
            <span style={{ color: C.Muted }}>{new Date(e.t).toLocaleTimeString("cs-CZ")} </span>
            <span style={{ color: COLORS[e.k], fontWeight: 700 }}>{e.m}</span>
            {e.d && <div style={{ color: "#4A5568" }}>{e.d}</div>}
          </div>
        ))}
      </AppCard>
    </div>
  );
}

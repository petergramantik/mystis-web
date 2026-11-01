// Živě: utkání vybraného dne ve sledovaných soutěžích, sledování utkání (max. 5) s vlastním upozorněním,
// a obrazovka sledovaného (cizího) utkání.
import { useEffect, useState } from "react";
import { vm, MAX_WATCHED, type LiveComp, type Watched } from "../../app/vm";
import { Stis, type LosMatch, type TeamRef } from "../../core/models";
import { Stats } from "../../core/stats";
import { Live, MatchFormats } from "../../core/live";
import { ldtDate, nowLdt, today } from "../../core/dates";
import type { SearchClub } from "../../core/search";
import { AppCard, Avatar, C, Chips, Divider, Empty, ListCard, Loading, Muted, OButton, Segmented, Spinner, T, shortTeam } from "../components";
import { hhmmLdt } from "../fmt";
import { GameRow, ScoreHeader } from "./LiveMatch";
import { useZapisStr } from "./Duel";
import { useZapisRefresh } from "../zapis";
import { SoundUnlockBar } from "../soundbar";

type Status = { kind: "future" | "live" | "done"; text: string; h: number | null; a: number | null; sub?: string };

/** Stav utkání: konečný výsledek, průběžný stav (z rozpisu nebo zápisu), nebo čas začátku. */
function statusOf(c: LiveComp, m: LosMatch): Status {
  const z = m.zapisPath ? vm.zapisy.get(m.zapisPath) : undefined;
  const fmt = vm.formatForComp(c);
  const now = nowLdt();
  const sm = /^(\d+)\s*:\s*(\d+)$/.exec(m.score);
  if (z && z.games.length) {
    const [h, a] = vm.scoreOf(z);
    if (vm.finished(z)) return { kind: "done", text: `${h} : ${a}`, h, a };
    return { kind: "live", text: `${h} : ${a}`, h, a, sub: `${z.games.filter((g) => g.result != null).length}/${Math.max(z.games.length, fmt.games)} her` };
  }
  if (sm) {
    const h = +sm[1], a = +sm[2];
    if (vm.scoreFinal(m.score, fmt)) return { kind: "done", text: `${h} : ${a}`, h, a };
    if (m.dateTime != null && m.dateTime > now - 5 * 60) return { kind: "live", text: `${h} : ${a}`, h, a };
    return { kind: "done", text: `${h} : ${a}`, h, a };
  }
  if (m.dateTime != null && m.dateTime <= now && m.dateTime > now - 5 * 60) return { kind: "live", text: "začalo", h: null, a: null };
  return { kind: "future", text: m.dateTime != null ? hhmmLdt(m.dateTime) : m.dateText, h: null, a: null };
}

/** Barva výsledku z pohledu fandění (domácí výchozí); null = neutrálně. */
function scoreColor(st: Status, fan: Watched["fan"] | "home"): string {
  if (st.h == null || st.a == null || fan === "none") return C.Ink;
  const my = fan === "away" ? st.a : st.h, op = fan === "away" ? st.h : st.a;
  return my > op ? C.Win : my < op ? C.OrangeText : C.Muted;
}

const MODE_LABEL: Record<Watched["mode"], string> = { off: "🔕 Vypnuto", games: "🔔 Hry", sets: "🔔 Sety" };
const FAN_LABEL: Record<Watched["fan"], string> = { home: "Fandím: domácí", away: "Fandím: hosté", none: "Fandím: nikomu" };
const nextMode = (m: Watched["mode"]): Watched["mode"] => (m === "off" ? "games" : m === "games" ? "sets" : "off");
const nextFan = (f: Watched["fan"]): Watched["fan"] => (f === "home" ? "away" : f === "away" ? "none" : "home");

/** Ovládání sledovaného utkání: upozornění a fandění (klepnutím se přepíná). */
export function WatchControls({ w }: { w: Watched }) {
  return (
    <div className="row g8" style={{ flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
      <button className="chip" style={{ height: 28, padding: "0 10px", fontSize: 12 }} onClick={() => vm.setWatch(w.key, { mode: nextMode(w.mode) })}>{MODE_LABEL[w.mode]}</button>
      <button className="chip" style={{ height: 28, padding: "0 10px", fontSize: 12 }} onClick={() => vm.setWatch(w.key, { fan: nextFan(w.fan) })}>{FAN_LABEL[w.fan]}</button>
    </div>
  );
}

export function LiveBoard() {
  const comps = vm.liveComps();
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    for (const c of comps) { vm.loadCompLos(c); if (!c.mine) vm.loadStrLadder(c.svaz, c.rocnik, c.soutez); }
    const t = setInterval(() => { for (const c of vm.liveComps()) vm.loadCompLos(c, true); }, 60_000);
    return () => clearInterval(t);
  }, [comps.length]);
  const day = today() + vm.liveDay;
  const watched = vm.watched();
  // online zápisy všech živých utkání (průběh her), obnova jednou za minutu jen při otevřené obrazovce
  const livePaths = comps.flatMap((c) => (vm.compLos.get(vm.compKey(c)) ?? []).filter((m) => m.zapisPath && statusOf(c, m).kind === "live").map((m) => m.zapisPath));
  const liveKey = livePaths.join(",");
  useEffect(() => {
    for (const p of livePaths) vm.loadZapis(p);
    const t = setInterval(() => { for (const p of livePaths) vm.loadZapis(p, false, true); }, 60_000);
    return () => clearInterval(t);
  }, [liveKey]);
  const sel = comps.some((c) => vm.compKey(c) === vm.liveCompSel) ? vm.liveCompSel : "all";
  const sections = comps.filter((c) => sel === "all" || vm.compKey(c) === sel).map((c) => {
    const los = vm.compLos.get(vm.compKey(c)) ?? [];
    const list = los.filter((m) => m.dateTime != null && ldtDate(m.dateTime) === day)
      .filter((m) => !vm.liveOnlyWatched || watched.some((w) => w.key === vm.boardKey(c, m)))
      .sort((a, b) => (a.dateTime ?? 0) - (b.dateTime ?? 0));
    return { c, list, loading: vm.compLosLoading.has(vm.compKey(c)) && !vm.compLos.has(vm.compKey(c)) };
  });
  const any = sections.some((s) => s.list.length);
  return (
    <div className="col g10 px16">
      <div className="row g8">
        <div style={{ flex: 1 }}><Chips options={[["-1", "Včera"], ["0", "Dnes"], ["1", "Zítra"]]} selected={String(vm.liveDay)} onSelect={(k) => { vm.liveDay = parseInt(k, 10); vm.emit(); }} /></div>
        <OButton text="+ Soutěž" onClick={() => setAdding(true)} />
      </div>
      <Segmented options={[["all", "Všechna"], ["watched", `★ Sledovaná (${watched.length}/${MAX_WATCHED})`]]} selected={vm.liveOnlyWatched ? "watched" : "all"}
        onSelect={(k) => { vm.liveOnlyWatched = k === "watched"; vm.emit(); }} />
      {comps.length > 1 && <Chips options={[["all", "Všechny"], ...comps.map((c) => [vm.compKey(c), shortComp(c.label)] as [string, string])]} selected={sel}
        onSelect={(k) => { vm.liveCompSel = k; vm.emit(); }} />}
      {msg && <Muted text={msg} color={C.OrangeText} size={13} maxLines={3} />}
      {sections.map(({ c, list, loading }) => {
        return (
          <div key={vm.compKey(c)} className="col g6">
            <div className="row g8" style={{ padding: "4px 4px 0" }}>
              <div className="col w1">
                <T bold size={13} color={C.Muted} lines={2} style={{ letterSpacing: 0.5 }}>{c.label.toUpperCase()}</T>
                <FormatBadge c={c} />
              </div>
              <span className="clickable" style={{ color: C.Blue, fontSize: 13, fontWeight: 600, flex: "none" }}
                onClick={() => vm.openCompetition({ id: "", name: "", svaz: c.svaz, rocnik: c.rocnik, soutez: c.soutez }, c.label, "", "tabulka")}>Tabulka ›</span>
              {!c.mine && <span className="clickable" aria-label="Odebrat soutěž" style={{ color: C.OrangeText, fontSize: 16, flex: "none", padding: "0 2px 0 6px" }}
                onClick={() => { if (window.confirm(`Odebrat soutěž ${c.label}?`)) { vm.removeLiveComp(c); vm.liveCompSel = "all"; vm.emit(); } }}>✕</span>}
            </div>
            {loading ? <AppCard><Loading text="Načítám rozpis soutěže…" /></AppCard>
              : !list.length ? <Muted text={vm.liveOnlyWatched ? "Žádné sledované utkání." : "V tento den se v soutěži nehraje."} size={13} style={{ paddingLeft: 4 }} />
                : <ListCard>{list.map((m) => <BoardRow key={vm.boardKey(c, m)} c={c} m={m} onError={setMsg} />)}</ListCard>}
          </div>
        );
      })}
      {!any && !sections.some((s) => s.loading) && <Empty text="Ve vybraný den se ve sledovaných soutěžích nehraje. Další soutěž přidáte tlačítkem + Soutěž." />}
      <Muted size={12} maxLines={5} text={`☆ = sledovat utkání (nejvýš ${MAX_WATCHED}, jen dnešní a zítřejší, která ještě neskončila). U sledovaného zvolíte upozornění (Hry / Sety / vypnuto) a komu fandíte – podle toho jsou barvy, notifikace i zvuky. Vaše družstva se sledují automaticky. Upozornění chodí jen při otevřené aplikaci.`} />
      {adding && <AddCompetitionSheet onClose={() => setAdding(false)} />}
      <div style={{ height: 8 }} />
    </div>
  );
}

/** Krátký popisek soutěže na tlačítko (zkratka z dlouhého názvu). */
function shortComp(label: string): string {
  const l = label.replace(/^Soutěž družstva /, "");
  return l.length > 22 ? l.slice(0, 21) + "…" : l;
}

function BoardRow({ c, m, onError }: { c: LiveComp; m: LosMatch; onError: (e: string | null) => void }) {
  const key = vm.boardKey(c, m);
  const w = vm.watchOf(key);
  const st = statusOf(c, m);
  const fan = w?.fan ?? "home";
  const can = vm.canWatch(c, m);
  return (
    <div>
      <div className="col clickable" style={{ padding: "10px 14px", background: st.kind === "live" ? C.Tint : undefined }} onClick={() => vm.go({ t: "Watch", key })}>
        <div className="row g10">
          <T bold size={13} color={C.Muted} style={{ width: 40, flex: "none" }}>{m.dateTime != null ? hhmmLdt(m.dateTime) : ""}</T>
          <div className="col w1">
            <T size={14} semi={fan === "home"} lines={1}>{shortTeam(m.home)}</T>
            <T size={14} semi={fan === "away"} lines={1}>{shortTeam(m.away)}</T>
          </div>
          <div className="col" style={{ alignItems: "flex-end", flex: "none" }}>
            {st.kind === "live" && <span style={{ fontSize: 11, fontWeight: 700, color: C.Live }}>● živě</span>}
            <T bold size={st.kind === "future" ? 13 : 15} color={st.kind === "future" ? C.Muted : st.kind === "live" ? C.Live : scoreColor(st, fan)} style={{ whiteSpace: "nowrap" }}>{st.kind === "future" ? m.round + ". kolo" : st.text}</T>
            {st.sub && <span style={{ fontSize: 11, color: C.Muted, whiteSpace: "nowrap" }}>{st.sub}</span>}
          </div>
          {(can || w) ? <span className="clickable" style={{ fontSize: 22, color: w ? "#F5A524" : C.Muted, flex: "none", padding: "0 2px" }}
            onClick={(e) => { e.stopPropagation(); onError(vm.toggleWatch(c, m)); }} aria-label="Sledovat">{w ? "★" : "☆"}</span>
            : <span style={{ width: 26, flex: "none" }} />}
        </div>
        {w && can && <div style={{ paddingLeft: 50, paddingTop: 6 }}><WatchControls w={w} /></div>}
      </div>
      <Divider />
    </div>
  );
}

/** Formát soutěže: kolečko při zjišťování, „neznámý – zvolit“, nebo popisek; klepnutím výběr formátu. */
export function FormatBadge({ c }: { c: { svaz: string; rocnik: number; soutez: string } }) {
  const [pick, setPick] = useState(false);
  if (!vm.formatAuto) return <Muted text={`${MatchFormats.short(vm.format)} (Nastavení)`} size={11} />;
  const state = vm.compFormatState(c);
  const f = vm.formatForComp(c);
  return (
    <>
      {state === "loading" ? (
        <div className="row g6"><Spinner size={11} width={2} color={C.Muted} /><Muted text="zjišťuji formát…" size={11} /></div>
      ) : (
        <span className="clickable" onClick={(e) => { e.stopPropagation(); setPick(true); }}
          style={{ fontSize: 11, fontWeight: state === "unknown" ? 700 : 500, color: state === "unknown" ? C.OrangeText : C.Muted }}>
          {state === "unknown" ? "Formát neznámý – zvolit ›" : `${MatchFormats.short(f)}${state === "manual" ? " · ručně" : state === "estimate" ? " (odhad)" : ""} ›`}
        </span>
      )}
      {pick && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={(e) => e.stopPropagation()}>
          <div onClick={() => setPick(false)} style={{ position: "absolute", inset: 0, background: "rgba(14,26,51,0.45)" }} />
          <div className="col g4" style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: C.Ground, borderRadius: "22px 22px 0 0", padding: "14px 16px 22px" }}>
            <T bold size={18}>Formát soutěže</T>
            <Muted size={12} maxLines={2} text="Podle formátu se počítají predikce, konec utkání a upozornění." />
            {[{ key: null as string | null, label: "Automaticky (podle zápisů)" }, ...MatchFormats.ALL.map((x) => ({ key: x.key as string | null, label: x.label }))].map((o) => {
              const on = o.key == null ? state !== "manual" : vm.compFormatOverride(c)?.key === o.key;
              return (
                <div key={String(o.key)} className="radio" onClick={() => { vm.setCompFormat(c, o.key); setPick(false); }}>
                  <div className={"c" + (on ? " on" : "")} />
                  <span>{o.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

/** Přidání soutěže: spodní panel s hledáním oddílu při psaní, návrhy, odkazem ze STIS a správou přidaných soutěží. */
function AddCompetitionSheet({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [clubs, setClubs] = useState<SearchClub[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [clubTeams, setClubTeams] = useState<Map<string, TeamRef[]>>(new Map());
  const rocnik = Stis.currentRocnik();
  const link = /svaz-([^/]+)\/rocnik-(\d+)\/soutez-(\d+)/.exec(q);
  const linkRef: TeamRef | null = link ? { id: "", name: "", svaz: link[1], rocnik: +link[2], soutez: link[3] } : null;
  // hledání při psaní (od 3 znaků), odkaz se rozpozná hned
  useEffect(() => {
    if (linkRef) { vm.loadStrLadder(linkRef.svaz, linkRef.rocnik, linkRef.soutez); vm.loadCompLos(linkRef); return; }
    const t = q.trim();
    if (t.length < 3) { setClubs(null); setErr(null); return; }
    setBusy(true);
    const id = setTimeout(() => vm.searchClubs(t, (r, e) => { setBusy(false); if (e) setErr(e); else { setErr(null); setClubs(r ?? []); } }), 400);
    return () => clearTimeout(id);
  }, [q]);
  const toggleClub = (c: SearchClub) => {
    if (open === c.id) { setOpen(null); return; }
    setOpen(c.id);
    if (clubTeams.has(c.id)) return;
    vm.repo.club(c.path).then((p) => {
      const ts = p.teams.filter((t) => t.rocnik === rocnik);
      for (const t of ts) { vm.loadStrLadder(t.svaz, t.rocnik, t.soutez); vm.loadCompLos(t); }
      setClubTeams((m) => new Map(m).set(c.id, ts));
    }, (e) => setErr(String(e?.message ?? e)));
  };
  const added = (t: { svaz: string; rocnik: number; soutez: string }) => vm.liveComps().some((x) => vm.compKey(x) === vm.compKey(t));
  const mineComps = vm.liveComps().filter((c) => !c.mine);
  // A: návrhy – soutěže ostatních družstev mého oddílu
  const suggest = vm.club.teams.filter((t) => t.rocnik === rocnik && !added(t))
    .filter((t, i, a) => a.findIndex((x) => vm.compKey(x) === vm.compKey(t)) === i);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(14,26,51,0.45)" }} />
      <div className="col g10" style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "86vh", overflowY: "auto", background: C.Ground,
        borderRadius: "22px 22px 0 0", padding: "10px 16px 20px", boxShadow: "0 -8px 30px rgba(0,0,0,0.18)" }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "#C4C7CF", alignSelf: "center" }} />
        <div className="row">
          <T bold size={20} style={{ flex: 1 }}>Přidat soutěž</T>
          <button className="iconbtn" onClick={onClose} aria-label="Zavřít" style={{ fontSize: 22, color: C.Muted }}>✕</button>
        </div>
        <div className="row g8" style={{ background: "#fff", borderRadius: 14, padding: "0 12px", border: "1px solid #D5D9E0" }}>
          <span style={{ fontSize: 18, color: C.Muted }}>🔍</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Oddíl nebo odkaz ze STIS" autoFocus
            style={{ flex: 1, border: 0, outline: "none", height: 46, fontSize: 16, background: "transparent" }} />
          {q && <span className="clickable" style={{ color: C.Muted }} onClick={() => setQ("")}>✕</span>}
        </div>
        {err && <Muted text={err} color={C.OrangeText} size={13} maxLines={3} />}

        {linkRef && <CompOffer t={linkRef} title={vm.compLabel(linkRef) ?? `Soutěž ${linkRef.soutez}`} added={added(linkRef)} />}

        {!linkRef && q.trim().length < 3 && (
          <>
            {suggest.length > 0 && <>
              <Muted text="SOUTĚŽE VAŠEHO ODDÍLU" size={12} style={{ paddingLeft: 4 }} />
              {suggest.map((t, i) => <CompOffer key={i} t={t} title={t.name} added={false} />)}
            </>}
            {suggest.length === 0 && <Muted text="Začněte psát název oddílu (např. „Ježov“), nebo vložte odkaz na soutěž ze STIS." size={13} maxLines={3} />}
          </>
        )}

        {!linkRef && busy && <Loading text="Hledám oddíly…" />}
        {!linkRef && clubs && !busy && (
          <div className="col g8">
            {!clubs.length && <Muted text="Nic nenalezeno." size={13} />}
            {clubs.slice(0, 12).map((c) => (
              <AppCard key={c.id} padding={0}>
                <div className="row g10 clickable" style={{ padding: "10px 12px" }} onClick={() => toggleClub(c)}>
                  <Avatar text={c.name} color={C.Blue} size={34} />
                  <T semi size={15} lines={2} style={{ flex: 1 }}>{c.name}</T>
                  <span style={{ color: C.Muted, fontSize: 20, transform: open === c.id ? "rotate(180deg)" : undefined }}>⌄</span>
                </div>
                {open === c.id && (
                  <div className="col g6" style={{ padding: "0 12px 12px" }}>
                    {!clubTeams.has(c.id) ? <Loading text="Načítám družstva…" />
                      : !clubTeams.get(c.id)!.length ? <Muted text="Oddíl nemá v této sezóně žádné družstvo." size={13} />
                        : clubTeams.get(c.id)!.map((t, i) => <CompOffer key={i} t={t} title={t.name} added={added(t)} flat />)}
                  </div>
                )}
              </AppCard>
            ))}
          </div>
        )}

        {mineComps.length > 0 && (
          <>
            <Muted text="MOJE PŘIDANÉ SOUTĚŽE" size={12} style={{ paddingLeft: 4, paddingTop: 6 }} />
            <AppCard padding={0}>
              {mineComps.map((c, i) => (
                <div key={i}>
                  <div className="row" style={{ padding: "10px 12px" }}>
                    <T size={14} semi lines={2} style={{ flex: 1 }}>{c.label}</T>
                    <span className="clickable" style={{ color: C.OrangeText, fontSize: 18, padding: "0 4px" }} onClick={() => vm.removeLiveComp(c)} aria-label="Odebrat">✕</span>
                  </div>
                  {i < mineComps.length - 1 && <Divider />}
                </div>
              ))}
            </AppCard>
          </>
        )}
      </div>
    </div>
  );
}

/** Nabídka soutěže: název soutěže, počet družstev, dnešní utkání; tlačítko Přidat / ✓ Přidáno. */
function CompOffer({ t, title, added, flat = false }: { t: TeamRef; title: string; added: boolean; flat?: boolean }) {
  const label = vm.compLabel(t);
  const los = vm.compLos.get(vm.compKey(t));
  const teams = los ? new Set(los.flatMap((m) => [Stats.fold(m.home), Stats.fold(m.away)])).size : null;
  const td = today();
  const todayN = los ? los.filter((m) => m.dateTime != null && ldtDate(m.dateTime) === td).length : null;
  const info = [label && label !== title ? label : null, teams ? `${teams} družstev` : null, todayN != null ? (todayN ? `dnes ${todayN} utkání` : "dnes se nehraje") : null].filter((x) => x).join(" · ");
  const body = (
    <div className="row g10" style={{ padding: flat ? "6px 0" : "10px 12px" }}>
      <div className="col w1">
        <T semi size={14} lines={2}>{title}</T>
        <Muted size={12} maxLines={2} text={info || "načítám informace o soutěži…"} />
      </div>
      {added ? <T bold color={C.Win} style={{ flex: "none" }}>✓ Přidáno</T>
        : <button className="chip on" style={{ height: 34, flex: "none" }} onClick={() => vm.addLiveComp(t, label ?? `Soutěž družstva ${t.name || t.soutez}`)}>+ Přidat</button>}
    </div>
  );
  return flat ? body : <AppCard padding={0}>{body}</AppCard>;
}

/** Obrazovka sledovaného / cizího utkání: živý stav ze zápisu, po konci celý zápis. */
export function WatchScreen({ k }: { k: string }) {
  const found = vm.boardMatch(k);
  const w = vm.watchOf(k);
  const m = found?.m;
  const path = m?.zapisPath || w?.zapisPath || "";
  useZapisRefresh(path);
  useEffect(() => {
    if (!found && w) vm.loadCompLos({ svaz: w.svaz, rocnik: w.rocnik, soutez: w.soutez });
  }, [k]);
  const z = path ? vm.zapisy.get(path) : undefined;
  const fan = w?.fan ?? "home";
  const neutral = fan === "none";
  const myHome = fan !== "away";
  const home = m?.home ?? w?.home ?? "", away = m?.away ?? w?.away ?? "";
  // po konci celý zápis (z pohledu toho, komu fandím)
  useEffect(() => {
    if (z && z.games.length && vm.finished(z)) vm.replace({ t: "ZapisDetail", path, myTeam: fan === "away" ? away : home });
  }, [z?.games.length, z && vm.finished(z)]);
  if (!m && !w) return <div className="px16"><Loading text="Hledám utkání…" /></div>;
  // STR všech hráčů ze zápisu (cizí hráči nejsou v mých soupiskách) – do načtení bez procent
  const strs = useZapisStr(path);
  const games = z ? Live.fromZapis(z, strs.strOf, (id, n) => vm.rangeOf(id, n)) : [];
  const st = Live.evaluate(games, z ? vm.fmtOf(z) : vm.format);
  const comp = found?.comp ?? (w ? { svaz: w.svaz, rocnik: w.rocnik, soutez: w.soutez, label: w.compLabel } as LiveComp : null);
  const dt = m?.dateTime ?? w?.dateTime ?? null;
  return (
    <div className="col g12">
      <ScoreHeader st={st} myHome={myHome} homeName={home} awayName={away} empty={!games.length || !strs.ready} neutral={neutral}
        emptyText={games.length && !strs.ready ? `Načítám STR hráčů… (${strs.done}/${strs.total})` : undefined} />
      <div className="col g12 px16">
        <SoundUnlockBar />
        <AppCard>
          <div className="row">
            <div className="col w1">
              <T semi size={14}>{comp ? vm.compLabel(comp) ?? comp.label : ""}</T>
              {comp && <FormatBadge c={comp} />}
              <Muted size={12} text={[m?.round ? `${m.round}. kolo` : null, dt != null ? `začátek ${hhmmLdt(dt)}` : null, z?.online ? "online zápis" : null].filter((x) => x).join(" · ")} />
            </div>
            {comp && m && (w || vm.canWatch(comp, m)) && <span className="clickable" style={{ fontSize: 26, color: w ? "#F5A524" : C.Muted }} onClick={() => { const e = vm.toggleWatch(comp, m); if (e) alertless(e); }}>{w ? "★" : "☆"}</span>}
          </div>
          {w ? <WatchControls w={w} /> : comp && m && vm.canWatch(comp, m) ? <Muted size={12} text="Klepnutím na ☆ utkání sledujete – přijdou upozornění." /> : null}
          {!path && <Muted size={13} maxLines={3} text={dt != null && dt > nowLdt() ? "Zápis se objeví po začátku utkání." : "Hledám online zápis… (objevuje se pár minut po začátku)"} />}
        </AppCard>
        {games.length > 0 && (
          <ListCard>
            {games.map((g, i) => {
              const h = g.home[0], a = g.away[0];
              const onOpen = !g.doubles && h && a ? () => vm.go({ t: "Duel", aId: h.id ?? "", aName: h.name, bId: a.id ?? "", bName: a.name, pA: st.gameProb[i] }) : null;
              return <GameRow key={g.no} g={g} pHome={strs.ready ? st.gameProb[i] : 0.5} myHome={myHome} mine={null} onOpen={onOpen} onResult={null} neutral={neutral || !strs.ready} />;
            })}
          </ListCard>
        )}
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

function alertless(e: string) { vm.error = e; vm.emit(); }

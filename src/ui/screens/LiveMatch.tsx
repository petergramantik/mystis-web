import { useEffect, useRef, useState, type ReactNode } from "react";
import { ModelLink } from "./Model";
import { SupportStrip } from "../support";
import { SoundUnlockBar } from "../soundbar";
import { vm } from "../../app/vm";
import { LiveModeSwitch } from "./Records";
import type { RosterPlayer } from "../../core/models";
import { Stats, maxBy } from "../../core/stats";
import { Live, MatchFormats, LiveTimeline, lp, type LiveGame, type LivePlayer, type LiveState, type MyLiveGame, type PlayerLive } from "../../core/live";
import { roundScore } from "../../core/search";
import { nowLdt } from "../../core/dates";
import {
  AppCard, BigNumber, C, Divider, Empty, ListCard, Loading, Muted, NavyHeader, OButton, PrimaryButton, ProbBar, SectionTitle, Segmented,
  StatTile, T, TextField, TileRow, dec1,
  SetsLine, CountdownRing, PredictionText, TeamName, shortTeam,
} from "../components";
import { hhmm, hhmmLdt } from "../fmt";


const LIVE_PERIOD = 60_000;

export function LiveScreen({ team }: { team: number }) {
  const me = vm.me;
  const ctx = vm.next[team];
  const tk = ctx ? vm.teamKey(ctx) : "";
  const suggested = ctx?.next?.zapisPath ?? "";
  const [mode, setMode] = useState("zapis");
  const [link, setLink] = useState(vm.liveLinks.get(tk) ?? suggested);
  const [manualLink, setManualLink] = useState(false);
  const found = vm.liveLinks.get(tk);
  // odkaz nalezený automaticky doplníme do pole
  useEffect(() => { if (found && !link) setLink(found); }, [found]);
  // sledovaný zápis si pamatujeme: po dohrání se odkaz u družstva maže a družstvo přejde na další utkání
  const followed = useRef<{ path: string; team: string } | null>(null);
  if (found && ctx && (!followed.current || followed.current.path !== found)) followed.current = { path: found, team: ctx.myTeam.name };
  const fz = followed.current ? vm.zapisy.get(followed.current.path) : undefined;
  const followedDone = !!fz && fz.games.length > 0 && vm.finished(fz);
  // dohráno -> místo živého utkání celý zápis (zpět vede na předchozí obrazovku)
  useEffect(() => {
    if (followedDone && followed.current && mode === "zapis") vm.replace({ t: "ZapisDetail", path: followed.current.path, myTeam: followed.current.team });
  }, [followedDone, mode]);
  const start = ctx?.next?.dateTime ?? null;
  const startedOrSoon = start == null || nowLdt() > start - 10;
  const linkEmpty = !link;

  // automatické hledání zápisu: po začátku utkání každou minutu, dokud se odkaz neobjeví
  useEffect(() => {
    if (!ctx || mode !== "zapis" || !linkEmpty || !startedOrSoon) return;
    let stop = false;
    const tick = () => { if (stop || vm.liveLinks.get(tk) != null) return; vm.autoFindZapis(team); };
    tick();
    const id = setInterval(tick, 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [tk, mode, linkEmpty, startedOrSoon]);
  // načtení zápisu
  useEffect(() => { if (ctx && mode === "zapis" && link && vm.liveZapisFor(tk) == null) vm.loadLive(tk, link, true); }, [tk, mode]);
  // obnovování během utkání
  useEffect(() => {
    const path = vm.liveLinks.get(tk);
    if (!ctx || mode !== "zapis" || !path) return;
    // každou sekundu kontrola, zda od poslední aktualizace uplynula minuta (sedí s odpočtem v kolečku)
    const id = setInterval(() => {
      const zz = vm.liveZapisFor(tk);
      if (zz && vm.finished(zz)) { clearInterval(id); return; }
      if (!vm.liveLoadingKeys.get(tk) && Date.now() - (vm.liveUpdated.get(tk) ?? 0) >= LIVE_PERIOD) vm.loadLive(tk, path, true);
    }, 1000);
    return () => clearInterval(id);
  }, [tk, mode, found]);

  const myRoster = ctx ? vm.fresh(ctx.myRoster) : [];
  const oppRoster = ctx ? vm.fresh(ctx.opponentRoster) : [];
  const loaded = ctx ? vm.liveZapisFor(tk) : null;
  const foreign = !!loaded && !!ctx && !vm.zapisBelongs(loaded, ctx);
  const z = loaded && mode === "zapis" && !foreign && loaded.games.length ? loaded : null;
  const myHome = ctx ? (z ? vm.zapisMyHome(z, ctx) : ctx.home) : true;
  const homeRoster = myHome ? myRoster : oppRoster;
  const awayRoster = myHome ? oppRoster : myRoster;
  const pH = `${tk}|H:`, pA = `${tk}|A:`;

  // výchozí ruční sestavy: stabilní sestava, čtyřhry 1+2 a 3+4
  useEffect(() => {
    if (!ctx) return;
    const has = (m: Map<string, number>) => Array.from(m.keys()).some((k) => k.startsWith(tk + "|"));
    if (has(vm.manualPos) || has(vm.manualDbl)) return;
    for (const [prefix, roster] of [[pH, homeRoster], [pA, awayRoster]] as [string, RosterPlayer[]][]) {
      const mineSide = (prefix === pH) === myHome;
      const lineup = mineSide ? vm.lineupFor(ctx.myTeam.name, ctx.myTeam.ref, roster) : vm.lineupFor(ctx.opponentName, ctx.opponentRef, roster);
      lineup.map((x) => x[0]).forEach((p, i) => {
        vm.manualPos.set(prefix + p.name, i + 1);
        if (vm.format.doubles >= 2) vm.manualDbl.set(prefix + p.name, i < 2 ? 1 : 2);
        else if (i < 2) vm.manualDbl.set(prefix + p.name, 1);
      });
    }
    vm.emit();
  }, [tk]);

  if (!me) return <Loading />;
  if (!ctx) return <Empty text="Utkání nenalezeno." />;

  const homeName = z && z.home.trim() ? z.home : myHome ? ctx.myTeam.name : ctx.opponentName;
  const awayName = z && z.away.trim() ? z.away : myHome ? ctx.opponentName : ctx.myTeam.name;

  let games: LiveGame[];
  if (z) games = Live.fromZapis(z, (id, n) => vm.strOf(id, n), (id, n) => vm.rangeOf(id, n));
  else {
    const toLp = (p: RosterPlayer): LivePlayer => lp(p.id, p.name, p.str);
    const pos = (prefix: string, roster: RosterPlayer[]) => {
      const m = new Map<number, LivePlayer>();
      for (let n = 1; n <= vm.format.players; n++) {
        const best = maxBy(roster.filter((p) => vm.manualPos.get(prefix + p.name) === n), (p) => p.str ?? 0);
        if (best) m.set(n, toLp(best));
      }
      return m;
    };
    const dbl = (prefix: string, roster: RosterPlayer[], d: number) =>
      roster.filter((p) => vm.manualDbl.get(prefix + p.name) === d).sort((a, b) => (b.str ?? 0) - (a.str ?? 0)).slice(0, 2).map(toLp);
    games = Live.manualByPosition(pos(pH, homeRoster), pos(pA, awayRoster),
      dbl(pH, homeRoster, 1), dbl(pH, homeRoster, 2), dbl(pA, awayRoster, 1), dbl(pA, awayRoster, 2),
      vm.manualResultsFor(tk), vm.format.players, vm.format.doubles, vm.singlesOrderFor(ctx.myTeam.ref));
  }
  const st = Live.evaluate(games, z ? vm.fmtOf(z) : vm.format);
  const pending = !!z && lineupsPending(games);
  const slots = z ? vm.singlesKeyFor(z) : null;
  const mine = new Map<number, MyLiveGame>();
  if (me.currentStr != null) for (const g of LiveTimeline.timeline(games, me.id, me.name, me.currentStr)) mine.set(g.game.no, g);
  const loading = vm.liveLoadingKeys.get(tk) === true;
  const updated = vm.liveUpdated.get(tk) ?? 0;
  const searchAt = vm.liveSearchAt.get(tk) ?? 0;
  // pole s odkazem jen když se zápis nepodařilo najít / načíst (nebo na přání)
  const searching = vm.liveSearchingKeys.get(tk) === true;
  const showField = manualLink || !!vm.liveErrors.get(tk) || foreign || (!found && startedOrSoon && !searching && searchAt > 0);

  return (
    <div className="col g12">
      <ScoreHeader st={st} myHome={myHome} homeName={homeName} awayName={awayName} empty={!games.length || pending}
        emptyText={pending ? "Sestavy dvouher zatím nejsou zapsané – predikce se ukáže po jejich doplnění." : undefined}
        comp={{ text: [ctx.myTeam.competition, ctx.next?.round ? `${ctx.next.round}. kolo` : null, MatchFormats.short(z ? vm.fmtOf(z) : vm.format)].filter((x) => x).join(" · "),
          onClick: ctx.myTeam.ref ? () => vm.openCompetition(ctx.myTeam.ref!, ctx.myTeam.competition || ctx.myTeam.name, ctx.myTeam.name, "tabulka") : undefined }} />
      <div className="col g12 px16">
        <SoundUnlockBar />
        <Muted text={`Utkání družstva ${ctx.myTeam.name}`} size={13} />
        <Segmented options={[["zapis", "Zápis ze STIS"], ["manual", "Ruční sestavy"]]} selected={mode} onSelect={setMode} />
        {mode === "zapis" ? (
          <AppCard>
            {!found && <Muted text="Aplikace sama najde online zápis o utkání na STIS (objevuje se pár minut po začátku) a čte sestavy, pořadí her a průběžné výsledky. Obnovuje se každou minutu." size={13} maxLines={5} />}
            {found && (!showField || manualLink) && (
              <div className="row g12">
                <div className="col w1">
                  <T semi size={14}>{z && vm.finished(z) ? "Utkání dohráno" : loading ? "Aktualizuji…" : "Sleduji online zápis"}</T>
                  <Muted size={13} text={updated > 0 ? `${loaded?.online ? "online · " : ""}aktualizováno ${hhmm(updated)}` : "načítám zápis…"} />
                </div>
                <span className="clickable" onClick={() => setManualLink((x) => !x)} style={{ flex: "none", fontSize: 13, fontWeight: 600, color: C.Blue }}>{manualLink ? "Skrýt odkaz" : "Odkaz"}</span>
              </div>
            )}
            {found && !(z && vm.finished(z)) && (
              <div className="col g4">
                <Muted text="Upozornění" size={12} />
                <LiveModeSwitch onError={(e) => vm.liveErrors.set(tk, e)} />
              </div>
            )}
            {link ? null : !startedOrSoon ? <Muted color={C.Ink} size={13} maxLines={3} text={`Zápis začnu hledat 10 minut před začátkem utkání (${start != null ? hhmmLdt(start) : ""}). Do té doby můžete připravit ruční sestavy.`} />
              : vm.liveSearchingKeys.get(tk) ? <Muted text="Hledám zápis na STIS…" color={C.Ink} size={13} />
                : <Muted color={C.Ink} size={13} maxLines={3} text={"Zápis zatím není zveřejněný – další pokus za minutu" + (searchAt > 0 ? ` (naposledy ${hhmm(searchAt)})` : "") + "."} />}
            {showField && <>
              <TextField value={link} onChange={setLink} label="Odkaz na zápis" placeholder="stis.ping-pong.cz/zapis/…/utkani-…" />
              <div className="row g8">
                <PrimaryButton text={loading ? "Načítám…" : "Sledovat"} onClick={() => { setManualLink(false); vm.loadLive(tk, link, true); }} enabled={!!link.trim() && !loading} />
              </div>
            </>}
            {vm.liveErrors.get(tk) && <Muted text={vm.liveErrors.get(tk)!} color={C.OrangeText} size={14} maxLines={4} />}
            {foreign && loaded ? (
              <Muted color={C.OrangeText} size={13} maxLines={4} text={`Tento zápis patří k jinému utkání (${loaded.home} – ${loaded.away}), ve kterém ${ctx.myTeam.name} nehraje. Vložte odkaz na zápis správného utkání.`} />
            ) : loaded && !loaded.games.length && !loading ? (
              <Muted text="Zápis zatím neobsahuje sestavy. Než je kapitáni vyplní, použijte ruční sestavy." size={13} maxLines={3} />
            ) : null}
          </AppCard>
        ) : (
          <>
            <LineupCard prefix={pH} teamName={homeName} roster={homeRoster} />
            <LineupCard prefix={pA} teamName={awayName} roster={awayRoster} />
            <Muted text={`Formát: ${vm.format.label} (změníte v Nastavení).`} size={12} />
            <Muted size={12} maxLines={4} text="Pořadí her: nejdřív čtyřhry, pak dvouhry po kolech (A–X, B–Y, …, A–Y, B–X, …). Klepnutím na výsledek vpravo zadáte vítěze hry, klepnutím na dvojici otevřete jejich vzájemné zápasy." />
          </>
        )}
        {!games.length ? <Empty text="Zatím nejsou známé sestavy." /> : (
          <>
            <SectionTitle text={`Hry (${st.played}/${games.length})`} />
            <ListCard>
              {games.map((g, i) => {
                const h = g.home[0], a = g.away[0];
                const onOpen = !g.doubles && h && a ? () => vm.go({ t: "Duel", aId: h.id ?? "", aName: h.name, bId: a.id ?? "", bName: a.name, pA: st.gameProb[i] }) : null;
                const onResult = z == null ? () => vm.toggleManualResult(tk, g.no) : null;
                return <GameRow key={g.no} g={g} pHome={st.gameProb[i]} myHome={myHome} mine={mine.get(g.no) ?? null} onOpen={onOpen} onResult={onResult} slot={slots?.get(g.no) ?? null} />;
              })}
            </ListCard>
            <PlayersCard title="Vaši hráči" list={st.players.filter((p) => p.home === myHome)} finished={st.finished} />
            <PlayersCard title="Soupeři" list={st.players.filter((p) => p.home !== myHome)} finished={st.finished} />
            {z == null && <div><OButton text="Vymazat zadané výsledky" onClick={() => vm.clearManualResults(tk)} /></div>}
          </>
        )}
        <SupportStrip />
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

/** Krátké bliknutí při změně podpisu [sig] (ne při prvním zobrazení). */
function useChangeFlash(sig: string, color: () => string | null): { n: number; color: string } | null {
  const prev = useRef<string | null>(null);
  const [f, setF] = useState<{ n: number; color: string } | null>(null);
  useEffect(() => {
    if (prev.current != null && prev.current !== sig) {
      const c = color();
      if (c) setF((x) => ({ n: (x?.n ?? 0) + 1, color: c }));
    }
    prev.current = sig;
  }, [sig]);
  return f;
}
const FlashOverlay = ({ f }: { f: { n: number; color: string } | null }) => (f ? <div key={f.n} className="flash" style={{ background: f.color }} /> : null);
const FLASH_EVENT = "mystis-flash";

export function ScoreHeader({ st, myHome, homeName, awayName, empty, neutral = false, emptyText, comp }: {
  st: LiveState; myHome: boolean; homeName: string; awayName: string; empty: boolean; neutral?: boolean; emptyText?: string;
  /** soutěž · kolo · formát nad družstvy; klepnutí = tabulka */
  comp?: { text: string; onClick?: () => void } | null;
}) {
  const my = myHome ? st.home : st.away, opp = myHome ? st.away : st.home;
  const pWin = myHome ? st.pHomeWin : st.pAwayWin, pLoss = myHome ? st.pAwayWin : st.pHomeWin;
  // nejpravděpodobnější konečný výsledek, pořadí domácí : hosté jako velké skóre
  const [a, b] = st.likely;
  // při posunu dolů zmenšená hlavička přichycená pod horní lištou
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const on = () => setCompact(window.scrollY > 230);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const pct = empty ? null : neutral ? Stats.pct(st.pHomeWin) : Stats.pct(pWin);
  // konec utkání: blikne hlavička (a kompaktní lišta)
  const endColor = () => (neutral ? C.Live : my > opp ? C.Win : my < opp ? C.OrangeText : C.Live);
  const endFlash = useChangeFlash(st.finished ? "end" : "run", () => {
    if (!st.finished) return null;
    const c = endColor();
    window.dispatchEvent(new CustomEvent(FLASH_EVENT, { detail: c }));
    return c;
  });
  // změna hry mimo obrazovku: blikne kompaktní lišta
  const [barFlash, setBarFlash] = useState<{ n: number; color: string } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setBarFlash((x) => ({ n: (x?.n ?? 0) + 1, color: (e as CustomEvent<string>).detail }));
    window.addEventListener(FLASH_EVENT, on);
    return () => window.removeEventListener(FLASH_EVENT, on);
  }, []);
  return (
    <>
    {compact && (
      <div className="row g8 clickable" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        style={{ position: "fixed", top: 56, left: 0, right: 0, zIndex: 19, background: C.Navy, color: "#fff", padding: "8px 16px", boxShadow: "0 4px 12px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <FlashOverlay f={barFlash} />
        <T bold size={13} color="#fff" lines={1} style={{ flex: 1, textAlign: "right" }}>{shortTeam(homeName)}</T>
        <T bold size={20} color="#fff" style={{ whiteSpace: "nowrap", flex: "none" }}>{`${st.home} : ${st.away}`}</T>
        <T bold size={13} color="#fff" lines={1} style={{ flex: 1 }}>{shortTeam(awayName)}</T>
        {pct && <T bold size={13} color={neutral ? "#fff" : pWin >= 0.5 ? C.WinLight : C.Peach} style={{ flex: "none" }}>{pct}</T>}
      </div>
    )}
    <div style={{ position: "relative" }}>
    <NavyHeader>
      <FlashOverlay f={endFlash} />
      {comp && <span className={comp.onClick ? "clickable" : undefined} onClick={comp.onClick} style={{ color: C.MutedOnNavy, fontSize: 13 }}>{comp.text}{comp.onClick ? " ›" : ""}</span>}
      <div className="row">
        <TeamName name={homeName} />
        <BigNumber text={`${st.home} : ${st.away}`} color="#fff" size={48} style={{ padding: "0 10px", whiteSpace: "nowrap" }} />
        <TeamName name={awayName} end />
      </div>
      {empty ? <Muted color={C.MutedOnNavy} size={13} text={emptyText ?? "Zatím nejsou známé sestavy – šance se ukáže, až bude zápis nebo ruční sestavy."} maxLines={3} /> : <>
      {/* dlaždice pod družstvem, kterého se týkají: moje šance na výhru na mé straně */}
      {neutral ? <TileRow>
        <StatTile label="Domácí" value={Stats.pct(st.pHomeWin)} dark />
        <StatTile label="Remíza" value={Stats.pct(st.pDraw)} dark />
        <StatTile label="Hosté" value={Stats.pct(st.pAwayWin)} dark />
      </TileRow> : <TileRow>
        {myHome ? <StatTile label="Výhra" value={Stats.pct(pWin)} dark valueColor={C.WinLight} /> : <StatTile label="Prohra" value={Stats.pct(pLoss)} dark valueColor={C.Peach} />}
        <StatTile label="Remíza" value={Stats.pct(st.pDraw)} dark />
        {myHome ? <StatTile label="Prohra" value={Stats.pct(pLoss)} dark valueColor={C.Peach} /> : <StatTile label="Výhra" value={Stats.pct(pWin)} dark valueColor={C.WinLight} />}
      </TileRow>}
      <ProbBar p={pWin + st.pDraw / 2} reverse={!myHome} />
      {st.finished ? <Muted color={C.MutedOnNavy} size={13} text={neutral ? `Konečný výsledek ${st.home} : ${st.away}` : `Konečný výsledek z pohledu vašeho družstva: ${my} : ${opp}`} />
        : <div className="row g8" style={{ flexWrap: "wrap" }}><PredictionText hs={a} as_={b} myHome={neutral ? null : myHome} dark /><Muted color={C.MutedOnNavy} size={13} text={`· odehráno ${st.played} z ${st.games.length}`} /></div>}
      </>}
      {!st.finished && <ModelLink section="zive" dark />}
    </NavyHeader>
    </div>
    </>
  );
}

/** Hraje se dvouhra, u které ještě nejsou zapsaní hráči (sestavy dvouher se doplňují až po čtyřhrách)? */
export function lineupsPending(games: LiveGame[]): boolean {
  return games.some((g) => g.result == null && (g.home.length === 0 || g.away.length === 0));
}

export function GameRow({ g, pHome, myHome, mine, onOpen, onResult, neutral = false, slot = null }: {
  g: LiveGame; pHome: number; myHome: boolean; mine: MyLiveGame | null; onOpen: (() => void) | null; onResult: (() => void) | null; neutral?: boolean;
  /** klíč dvouhry [A–D, X–W] pro hru bez zapsaných hráčů */
  slot?: [string, string] | null;
}) {
  let right;
  const unknown = g.result == null && (g.home.length === 0 || g.away.length === 0);
  if (unknown) {
    right = <Muted text="čeká na sestavu" size={11} maxLines={1} />;
  } else if (g.result == null) {
    const myP = myHome ? pHome : 1 - pHome;
    // favorit: jméno a jeho šance; zeleně můj hráč, oranžově soupeř
    const favHome = pHome >= 0.5;
    const favSide = favHome ? g.home : g.away;
    const favName = favSide.map((p) => p.name.replace(/\(.*?\)/g, "").trim().split(" ")[0]).join(" + ");
    const favP = favHome ? pHome : 1 - pHome;
    const even = Math.abs(pHome - 0.5) < 0.005;
    right = (
      <>
        <Muted text={even ? "Vyrovnané" : "Favorit"} size={10} maxLines={1} />
        <T bold color={even || neutral ? C.Ink : myP >= 0.5 ? C.Win : C.OrangeText} style={{ whiteSpace: "nowrap" }}>{even ? "50 : 50" : g.doubles ? Stats.pct(favP) : `${favName} ${Stats.pct(favP)}`}</T>
        {g.doubles && !even && !g.inProgress
          ? <T size={11} semi color={neutral ? C.Ink : myP >= 0.5 ? C.Win : C.OrangeText} lines={1} style={{ maxWidth: 130 }}>{favName}</T>
          : <Muted text={g.inProgress ? `hraje se ${g.homeSets ?? 0}:${g.awaySets ?? 0}` : onResult ? "zadat ›" : ""} size={11} maxLines={1} />}
      </>
    );
  } else {
    const iWon = (g.result === 1) === myHome;
    right = <T bold color="#fff" style={{ background: neutral ? C.Grey : C.result(iWon), borderRadius: 8, padding: "3px 8px" }}>{g.homeSets != null && g.awaySets != null ? `${g.homeSets}:${g.awaySets}` : g.result === 1 ? "domácí" : "hosté"}</T>;
  }
  let mineText: string | null = null;
  if (mine) {
    const b = Math.round(mine.strBefore);
    if (mine.won == null) mineText = `Vaše STR ${b} → výhra ${Math.round(mine.ifWin)} (+${Math.round(mine.ifWin - mine.strBefore)}) · prohra ${Math.round(mine.ifLoss)} (−${Math.round(mine.strBefore - mine.ifLoss)})`;
    else if (mine.won) mineText = `Vaše STR ${b} → ${Math.round(mine.strAfter!)} (+${Math.round(mine.strAfter! - mine.strBefore)}) · odhad`;
    else mineText = `Vaše STR ${b} → ${Math.round(mine.strAfter!)} (−${Math.round(mine.strBefore - mine.strAfter!)}) · odhad`;
  }
  // bliknutí při změně (dohraný set, konec hry, doplněná sestava)
  const rowRef = useRef<HTMLDivElement>(null);
  const sig = `${g.sets.join(",")}|${g.result}|${g.homeSets}:${g.awaySets}|${g.home.map((p) => p.name).join("+")}|${g.away.map((p) => p.name).join("+")}`;
  const flash = useChangeFlash(sig, () => {
    const lastSet = g.sets.length ? g.sets[g.sets.length - 1] : 0;
    const hs = g.homeSets ?? g.sets.filter((v) => v > 0).length, as_ = g.awaySets ?? g.sets.filter((v) => v < 0).length;
    const winHome = g.result != null ? g.result === 1 : g.sets.length ? lastSet > 0 : hs + as_ > 0 ? hs >= as_ : null;
    const c = winHome == null ? C.BlueLight : neutral ? C.Live : winHome === myHome ? C.Win : C.OrangeText;
    const r = rowRef.current?.getBoundingClientRect();
    if (r && (r.bottom < 110 || r.top > window.innerHeight)) window.dispatchEvent(new CustomEvent(FLASH_EVENT, { detail: c }));
    return c;
  });
  return (
    <>
      <div ref={rowRef} className={"col" + (onOpen ? " clickable" : "")} style={{ background: mine ? C.Tint : "#fff", padding: "9px 14px", position: "relative" }} onClick={onOpen ?? undefined}>
        <FlashOverlay f={flash} />
        <div className="row g10">
          <T bold color={C.Muted} style={{ width: 28, flex: "none" }}>{g.no}.</T>
          <div className="col w1">
            <T size={14} bold={neutral ? g.result === 1 : myHome} lines={1}>{g.home.length ? g.home.map((p) => p.name).join(" + ") : <span style={{ color: C.Muted, fontStyle: g.wo ? "italic" : undefined }}>{g.wo ? "nenastoupil(a)" : slot?.[0] ?? "?"}</span>}</T>
            <T size={14} bold={neutral ? g.result === -1 : !myHome} lines={1}>{g.away.length ? g.away.map((p) => p.name).join(" + ") : <span style={{ color: C.Muted, fontStyle: g.wo ? "italic" : undefined }}>{g.wo ? "nenastoupil(a)" : slot?.[1] ?? "?"}</span>}</T>
            {g.wo ? <Muted text="WO – kontumace" size={11} maxLines={1} /> : g.sets.length > 0 && <SetsLine sets={g.sets} myHome={myHome} neutral={neutral} />}
          </div>
          <div className={"col" + (onResult ? " clickable" : "")} style={{ alignItems: "flex-end", padding: onResult ? 4 : 0 }}
            onClick={onResult ? (e) => { e.stopPropagation(); onResult(); } : undefined}>{right}</div>
        </div>
        {mineText && <T size={12} semi color={mine!.won === true ? C.Win : mine!.won === false ? C.OrangeText : C.Ink} style={{ paddingLeft: 38, paddingTop: 3 }}>{mineText}</T>}
      </div>
      <Divider />
    </>
  );
}

function PlayersCard({ title, list, finished }: { title: string; list: PlayerLive[]; finished: boolean }) {
  if (!list.length) return null;
  return (
    <>
      <SectionTitle text={title} />
      <AppCard>
        <div className="row">
          <Muted text="HRÁČ" size={11} style={{ flex: 1 }} />
          <Muted text="VÝHRY" size={11} style={{ width: 62 }} />
          <Muted text={finished ? "VS. ODHAD" : "ODHAD"} size={11} style={{ width: 66 }} />
          <Muted text="STR" size={11} style={{ width: 46 }} />
        </div>
        {list.map((p, i) => {
          const d = Math.round(p.won - p.expectedBefore);
          const go = vm.playerClick(p.id, p.name);
          return (
            <div className={"row" + (go ? " clickable" : "")} key={i} style={{ padding: "3px 0" }} onClick={go ?? undefined}>
              <T size={14} semi lines={1} style={{ flex: 1 }}>{p.name}{go && <span style={{ color: C.Muted }}> ›</span>}</T>
              <T size={14} style={{ width: 62, flex: "none" }}>{`${p.won}/${p.played}`}</T>
              {finished ? <T size={14} bold color={C.delta(d)} style={{ width: 66, flex: "none" }}>{d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "0"}</T>
                : <T size={14} style={{ width: 66, flex: "none" }}>{`${Math.round(p.expectedFinal)} z ${p.singles}`}</T>}
              <T size={14} color={C.delta(p.strDelta)} style={{ width: 46, flex: "none" }}>{(p.strDelta >= 0 ? "+" : "−") + dec1(Math.abs(p.strDelta))}</T>
            </div>
          );
        })}
        <Muted size={11} maxLines={2} text={finished ? "Kladné číslo = vyhrál víc dvouher, než odpovídalo STR." : "Odhad = odehrané výhry + pravděpodobné výhry ve zbývajících dvouhrách."} />
      </AppCard>
    </>
  );
}

function LineupCard({ prefix, teamName, roster }: { prefix: string; teamName: string; roster: RosterPlayer[] }) {
  const size = vm.format.players;
  const letters = (prefix.endsWith("H:") ? ["A", "B", "C", "D"] : ["X", "Y", "Z", "W"]).slice(0, size);
  const dblCount = vm.format.doubles;
  const warnings: string[] = [];
  for (let dd = 1; dd <= dblCount; dd++) {
    const c = roster.filter((p) => vm.manualDbl.get(prefix + p.name) === dd).length;
    if (c > 2) warnings.push(`Ve čtyřhře ${dd} je ${c} hráčů – počítám 2 nejsilnější.`);
    if (c === 1) warnings.push(`Ve čtyřhře ${dd} je jen 1 hráč – čtyřhra se nepočítá.`);
  }
  for (let n = 1; n <= size; n++) {
    const c = roster.filter((p) => vm.manualPos.get(prefix + p.name) === n).length;
    if (c > 1) warnings.push(`Pozici ${n} (${letters[n - 1]}) má ${c} hráčů – počítám nejsilnějšího.`);
  }
  const missing = Array.from({ length: size }, (_, i) => i + 1).filter((n) => !roster.some((p) => vm.manualPos.get(prefix + p.name) === n));
  if (missing.length && roster.length) warnings.push(`Neobsazené pozice: ${missing.join(", ")} – jejich dvouhry se nepočítají.`);
  return (
    <AppCard>
      <T bold>{teamName}</T>
      <Muted size={12} maxLines={3} text={`U každého hráče zvolte čtyřhru (${dblCount >= 2 ? "Č1 / Č2" : "Č1"}) a pozici ve dvouhrách 1–${size} (${letters.join("")}). Podle pozic se určí, kdo s kým hraje.`} />
      {!roster.length && <Muted text="Soupiska není k dispozici." size={13} />}
      {[...roster].sort((a, b) => (b.str ?? 0) - (a.str ?? 0)).map((p) => {
        const key = prefix + p.name;
        const d = vm.manualDbl.get(key), ps = vm.manualPos.get(key);
        const active = d != null || ps != null;
        return (
          <div key={key} className="col" style={{ background: active ? C.Tint : "#fff", borderRadius: 10, padding: "6px 10px" }}>
            <div className="row">
              <T bold={active} lines={1} style={{ flex: 1 }}>{p.name}</T>
              <T size={12} color={C.Muted}>STR {p.str ?? "–"}</T>
            </div>
            <div className="row g6" style={{ paddingTop: 4, flexWrap: "wrap" }}>
              <button className={"mini" + (d === 1 ? " on" : "")} onClick={() => vm.toggleDbl(key, 1)}>Č1</button>
              {dblCount >= 2 && <button className={"mini" + (d === 2 ? " on" : "")} onClick={() => vm.toggleDbl(key, 2)}>Č2</button>}
              <span style={{ color: C.Muted }}>·</span>
              {Array.from({ length: size }, (_, i) => i + 1).map((n) => <button key={n} className={"mini" + (ps === n ? " on" : "")} onClick={() => vm.togglePos(key, n)}>{n}</button>)}
            </div>
          </div>
        );
      })}
      {warnings.map((w, i) => <Muted key={i} text={w} color={C.OrangeText} size={12} />)}
    </AppCard>
  );
}

/** Horní lišta Živého utkání: kolečko s odpočtem do další aktualizace (dokud se hraje), jinak běžné obnovení. */
export function LiveTopRing({ team, fallback }: { team: number; fallback: ReactNode }) {
  const ctx = vm.next[team];
  const tk = ctx ? vm.teamKey(ctx) : "";
  const link = ctx ? vm.liveLinks.get(tk) : undefined;
  const z = ctx ? vm.liveZapisFor(tk) : null;
  if (!ctx || !link || (z && vm.finished(z))) return <>{fallback}</>;
  return (
    <div style={{ width: 44, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
      <CountdownRing dark next={(vm.liveUpdated.get(tk) ?? 0) + LIVE_PERIOD} period={LIVE_PERIOD} busy={vm.liveLoadingKeys.get(tk) === true} onClick={() => vm.loadLive(tk, link, true)} />
    </div>
  );
}

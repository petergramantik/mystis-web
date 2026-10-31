import { useEffect, useState } from "react";
import { vm } from "../../app/vm";
import type { RosterPlayer } from "../../core/models";
import { Stats, maxBy } from "../../core/stats";
import { Live, LiveTimeline, lp, type LiveGame, type LivePlayer, type LiveState, type MyLiveGame, type PlayerLive } from "../../core/live";
import { roundScore } from "../../core/search";
import { nowLdt } from "../../core/dates";
import {
  AppCard, BigNumber, C, Divider, Empty, ListCard, Loading, Muted, NavyHeader, OButton, PrimaryButton, ProbBar, SectionTitle, Segmented,
  StatTile, T, TextField, TileRow, dec1,
} from "../components";
import { hhmm, hhmmLdt } from "../fmt";

const setsText = (sets: number[]) => sets.map((v) => { const pts = Math.abs(v); const w = pts >= 10 ? pts + 2 : 11; return v > 0 ? `${w}:${pts}` : `${pts}:${w}`; }).join("  ");

export function LiveScreen({ team }: { team: number }) {
  const me = vm.me;
  const ctx = vm.next[team];
  const tk = ctx ? vm.teamKey(ctx) : "";
  const suggested = ctx?.next?.zapisPath ?? "";
  const [mode, setMode] = useState("zapis");
  const [link, setLink] = useState(vm.liveLinks.get(tk) ?? suggested);
  const found = vm.liveLinks.get(tk);
  // odkaz nalezený automaticky doplníme do pole
  useEffect(() => { if (found && !link) setLink(found); }, [found]);
  const start = ctx?.next?.dateTime ?? null;
  const startedOrSoon = start == null || nowLdt() > start - 10;
  const linkEmpty = !link;

  // automatické hledání zápisu: po začátku utkání každé 2 minuty, dokud se odkaz neobjeví
  useEffect(() => {
    if (!ctx || mode !== "zapis" || !linkEmpty || !startedOrSoon) return;
    let stop = false;
    const tick = () => { if (stop || vm.liveLinks.get(tk) != null) return; vm.autoFindZapis(team); };
    tick();
    const id = setInterval(tick, 120_000);
    return () => { stop = true; clearInterval(id); };
  }, [tk, mode, linkEmpty, startedOrSoon]);
  // načtení zápisu
  useEffect(() => { if (ctx && mode === "zapis" && link && vm.liveZapisFor(tk) == null) vm.loadLive(tk, link, true); }, [tk, mode]);
  // obnovování během utkání
  useEffect(() => {
    const path = vm.liveLinks.get(tk);
    if (!ctx || mode !== "zapis" || !path) return;
    const id = setInterval(() => {
      const zz = vm.liveZapisFor(tk);
      if (zz && zz.games.length && zz.games.every((g) => g.result != null)) { clearInterval(id); return; }
      vm.loadLive(tk, path, true);
    }, 120_000);
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
  if (z) games = Live.fromZapis(z, (id, n) => vm.strOf(id, n));
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
      vm.manualResultsFor(tk), vm.format.players, vm.format.doubles);
  }
  const st = Live.evaluate(games, vm.format);
  const mine = new Map<number, MyLiveGame>();
  if (me.currentStr != null) for (const g of LiveTimeline.timeline(games, me.id, me.name, me.currentStr)) mine.set(g.game.no, g);
  const loading = vm.liveLoadingKeys.get(tk) === true;
  const updated = vm.liveUpdated.get(tk) ?? 0;
  const searchAt = vm.liveSearchAt.get(tk) ?? 0;

  return (
    <div className="col g12">
      <ScoreHeader st={st} myHome={myHome} homeName={homeName} awayName={awayName} />
      <div className="col g12 px16">
        <Muted text={`Utkání družstva ${ctx.myTeam.name}`} size={13} />
        <Segmented options={[["zapis", "Zápis ze STIS"], ["manual", "Ruční sestavy"]]} selected={mode} onSelect={setMode} />
        {mode === "zapis" ? (
          <AppCard>
            <Muted text="Aplikace sama najde online zápis o utkání na STIS (objevuje se pár minut po začátku) a čte sestavy, pořadí her a průběžné výsledky. Obnovuje se každé 2 minuty." size={13} maxLines={5} />
            {link ? null : !startedOrSoon ? <Muted color={C.Ink} size={13} maxLines={3} text={`Zápis začnu hledat 10 minut před začátkem utkání (${start != null ? hhmmLdt(start) : ""}). Do té doby můžete připravit ruční sestavy.`} />
              : vm.liveSearchingKeys.get(tk) ? <Muted text="Hledám zápis na STIS…" color={C.Ink} size={13} />
                : <Muted color={C.Ink} size={13} maxLines={3} text={"Zápis zatím není zveřejněný – další pokus za 2 minuty" + (searchAt > 0 ? ` (naposledy ${hhmm(searchAt)})` : "") + "."} />}
            <TextField value={link} onChange={setLink} label="Odkaz na zápis (vyplní se sám)" placeholder="stis.ping-pong.cz/zapis/…/utkani-…" />
            <div className="row g8">
              <PrimaryButton text={loading ? "Načítám…" : "Sledovat"} onClick={() => vm.loadLive(tk, link, true)} enabled={!!link.trim() && !loading} />
              {updated > 0 && z && <Muted text={`${z.online ? "online · " : ""}aktualizováno ${hhmm(updated)}`} size={13} />}
            </div>
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
                const onOpen = !g.doubles && h && a ? () => vm.go({ t: "Duel", aId: h.id ?? "", aName: h.name, bId: a.id ?? "", bName: a.name }) : null;
                const onResult = z == null ? () => vm.toggleManualResult(tk, g.no) : null;
                return <GameRow key={g.no} g={g} pHome={st.gameProb[i]} myHome={myHome} mine={mine.get(g.no) ?? null} onOpen={onOpen} onResult={onResult} />;
              })}
            </ListCard>
            <PlayersCard title="Vaši hráči" list={st.players.filter((p) => p.home === myHome)} finished={st.finished} />
            <PlayersCard title="Soupeři" list={st.players.filter((p) => p.home !== myHome)} finished={st.finished} />
            {z == null && <div><OButton text="Vymazat zadané výsledky" onClick={() => vm.clearManualResults(tk)} /></div>}
          </>
        )}
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

function ScoreHeader({ st, myHome, homeName, awayName }: { st: LiveState; myHome: boolean; homeName: string; awayName: string }) {
  const my = myHome ? st.home : st.away, opp = myHome ? st.away : st.home;
  const pWin = myHome ? st.pHomeWin : st.pAwayWin, pLoss = myHome ? st.pAwayWin : st.pHomeWin;
  const expMy = myHome ? st.expHome : st.expAway, expOpp = myHome ? st.expAway : st.expHome;
  const [a, b] = roundScore(expMy, expOpp);
  return (
    <NavyHeader>
      <div className="row">
        <T bold color="#fff" lines={2} style={{ flex: 1 }}>{homeName}</T>
        <BigNumber text={`${st.home} : ${st.away}`} color="#fff" size={48} style={{ padding: "0 10px", whiteSpace: "nowrap" }} />
        <T bold color="#fff" lines={2} end style={{ flex: 1 }}>{awayName}</T>
      </div>
      <TileRow>
        <StatTile label="Výhra" value={Stats.pct(pWin)} dark valueColor={C.WinLight} />
        <StatTile label="Remíza" value={Stats.pct(st.pDraw)} dark />
        <StatTile label="Prohra" value={Stats.pct(pLoss)} dark valueColor={C.Peach} />
      </TileRow>
      <ProbBar p={pWin + st.pDraw / 2} />
      <Muted color={C.MutedOnNavy} size={13} text={st.finished ? `Konečný výsledek z pohledu vašeho družstva: ${my} : ${opp}` : `Očekávaný konečný stav ${a} : ${b} · odehráno ${st.played} z ${st.games.length}`} />
    </NavyHeader>
  );
}

function GameRow({ g, pHome, myHome, mine, onOpen, onResult }: { g: LiveGame; pHome: number; myHome: boolean; mine: MyLiveGame | null; onOpen: (() => void) | null; onResult: (() => void) | null }) {
  let right;
  if (g.result == null) {
    const myP = myHome ? pHome : 1 - pHome;
    right = (
      <>
        <T bold color={myP >= 0.5 ? C.Win : C.OrangeText}>{Stats.pct(myP)}</T>
        <Muted text={g.inProgress ? `hraje se ${g.homeSets ?? 0}:${g.awaySets ?? 0}` : onResult ? "zadat ›" : "šance"} size={11} maxLines={1} />
      </>
    );
  } else {
    const iWon = (g.result === 1) === myHome;
    right = <T bold color="#fff" style={{ background: C.result(iWon), borderRadius: 8, padding: "3px 8px" }}>{g.homeSets != null && g.awaySets != null ? `${g.homeSets}:${g.awaySets}` : g.result === 1 ? "domácí" : "hosté"}</T>;
  }
  let mineText: string | null = null;
  if (mine) {
    const b = Math.round(mine.strBefore);
    if (mine.won == null) mineText = `Vaše STR ${b} → výhra ${Math.round(mine.ifWin)} (+${dec1(mine.ifWin - mine.strBefore)}) · prohra ${Math.round(mine.ifLoss)} (−${dec1(mine.strBefore - mine.ifLoss)})`;
    else if (mine.won) mineText = `Vaše STR ${b} → ${Math.round(mine.strAfter!)} (+${dec1(mine.strAfter! - mine.strBefore)}) · odhad`;
    else mineText = `Vaše STR ${b} → ${Math.round(mine.strAfter!)} (−${dec1(mine.strBefore - mine.strAfter!)}) · odhad`;
  }
  return (
    <>
      <div className={"col" + (onOpen ? " clickable" : "")} style={{ background: mine ? C.Tint : "#fff", padding: "9px 14px" }} onClick={onOpen ?? undefined}>
        <div className="row g10">
          <T bold color={C.Muted} style={{ width: 28, flex: "none" }}>{g.no}.</T>
          <div className="col w1">
            <T size={14} bold={myHome} lines={1}>{g.home.map((p) => p.name).join(" + ")}</T>
            <T size={14} bold={!myHome} lines={1}>{g.away.map((p) => p.name).join(" + ")}</T>
            {g.sets.length > 0 && <Muted text={setsText(g.sets)} size={11} maxLines={1} style={{ whiteSpace: "pre" }} />}
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
          return (
            <div className="row" key={i} style={{ padding: "3px 0" }}>
              <T size={14} semi lines={1} style={{ flex: 1 }}>{p.name}</T>
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

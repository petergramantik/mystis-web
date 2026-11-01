import { useEffect, useState } from "react";
import { SupportStrip } from "../support";
import { useZapisRefresh } from "../zapis";
import { vm } from "../../app/vm";
import { Stis, type Match, type PlayerPage, type ZapisGame } from "../../core/models";
import { Stats, StrModel, sum } from "../../core/stats";
import { Live } from "../../core/live";
import { Parsers } from "../../core/parsers";
import { today } from "../../core/dates";
import { roundScore } from "../../core/search";
import { HallCard } from "../hall";
import {
  AppCard, BigNumber, C, DMY, Divider, Empty, HeaderPlayer, KeyValue, ListCard, Loading, Muted, NavyHeader, ProbBar, ResultBadge, SectionTitle, T, dec1, signedInt,
  SetsLine, TeamName,
} from "../components";

/** [pA0] = šance hráče A převzatá z živého utkání (stejný výpočet jako v seznamu her). */
export function PairScreen({ aId0, aName0, bId0, bName0, pA0 }: { aId0: string; aName0: string; bId0: string; bName0: string; pA0?: number }) {
  const me = vm.meWithLive();
  const isMe = (id: string, name: string) => !!me && ((id !== "" && id === me.id) || Stats.fold(name) === Stats.fold(me.name));
  // A je vždy hráč, jehož stránku máme (já), jinak domácí hráč
  const swap = isMe(bId0, bName0) && !isMe(aId0, aName0);
  const aId = swap ? bId0 : aId0, aName = swap ? bName0 : aName0;
  const bId = swap ? aId0 : bId0, bName = swap ? aName0 : bName0;
  const aIsMe = isMe(aId, aName);
  const aPath = aIsMe ? me?.path ?? null : aId ? vm.playerPathById(aId) : null;
  const bPath = bId ? vm.playerPathById(bId) : null;
  useEffect(() => {
    if (!aIsMe && aPath) vm.loadPlayer(aPath);
    if (bPath) vm.loadPlayer(bPath);
  }, [aPath, bPath]);
  const pa = aIsMe ? me : aPath ? vm.players.get(aPath) : undefined;
  const pageA: PlayerPage | null = aIsMe ? me ?? null : pa ? vm.withLive(pa) : null;
  const pageB = bPath ? vm.players.get(bPath) ?? null : null;
  const strA = pageA?.currentStr ?? vm.strOf(aId, aName);
  const strB = pageB?.currentStr ?? vm.strOf(bId, bName);
  const lastTeam = (p: PlayerPage | null) => { const ch = p?.chronological ?? []; return ch.length ? ch[ch.length - 1].myTeam : ""; };
  const first = (n: string) => n.split(" ")[0];

  let body;
  if (!pageA && aPath && vm.loadingPlayers.get(aPath)) body = <Loading text="Načítám historii hráče…" />;
  else if (!pageA) body = <Empty text="Historii těchto hráčů se nepodařilo načíst (chybí odkaz na hráče v zápisu)." />;
  else {
    const list = pageA.chronological.filter((m) => (bId && m.opponentId === bId) || Stats.fold(m.opponent) === Stats.fold(bName));
    if (!list.length) body = <AppCard><T bold>Zatím spolu nehráli</T><Muted text="Ve STIS není žádný vzájemný zápas těchto hráčů." size={13} /></AppCard>;
    else {
      const w = list.filter((m) => m.won).length;
      body = (
        <>
          <AppCard>
            <div className="row"><T bold style={{ flex: 1 }}>Vzájemná bilance</T><BigNumber text={`${w} : ${list.length - w}`} color={w * 2 >= list.length ? C.Win : C.OrangeText} size={26} /></div>
            <Muted size={13} maxLines={3} text={`sety ${sum(list.map((m) => m.setsFor))} : ${sum(list.map((m) => m.setsAgainst))} · pětisetové ${list.filter((m) => m.fiveSetter && m.won).length}–${list.filter((m) => m.fiveSetter && !m.won).length} · z pohledu: ${aName}`} />
          </AppCard>
          <SectionTitle text="Všechny vzájemné zápasy" />
          <ListCard>
            {[...list].reverse().map((m, i) => <DuelMatchRow key={i} m={m} aId={pageA.id} aName={aName} bId={bId} bName={bName} />)}
          </ListCard>
        </>
      );
    }
  }
  return (
    <div className="col g12">
      <NavyHeader>
        <div className="rowt">
          <HeaderPlayer name={aName} str={strA} team={lastTeam(pageA)} color={C.Blue} onClick={aPath ? () => vm.go({ t: "Player", path: aPath }) : null} />
          <T bold color={C.MutedOnNavy} style={{ paddingTop: 20, flex: "none" }}>vs</T>
          <HeaderPlayer name={bName} str={strB} team={lastTeam(pageB)} color={C.Orange} onClick={bPath ? () => vm.go({ t: "Player", path: bPath }) : null} />
        </div>
      </NavyHeader>
      <div className="col g12 px16">
        {pA0 == null && ((aPath && !aIsMe && !vm.players.has(aPath) && vm.loadingPlayers.get(aPath) !== false) || (bPath && !vm.players.has(bPath) && vm.loadingPlayers.get(bPath) !== false)) ? <AppCard><Loading text="Načítám STR hráčů…" /></AppCard>
          : strA != null && strB != null && (() => {
          const p = pA0 != null ? (swap ? 1 - pA0 : pA0) : StrModel.winProbability(strA, strB);
          // strana mého družstva: zeleně; soupeř oranžově. Když nejde o moje družstvo: barvy podle avatarů.
          const mineTeams = new Set([...vm.next.map((c) => Stats.fold(c.myTeam.name)), ...(me?.matches ?? []).map((m) => Stats.fold(m.myTeam))]);
          const aMine = aIsMe || mineTeams.has(Stats.fold(lastTeam(pageA)));
          const bMine = !aMine && mineTeams.has(Stats.fold(lastTeam(pageB)));
          const colA = aMine ? C.Win : bMine ? C.OrangeText : C.Blue, colB = bMine ? C.Win : aMine ? C.OrangeText : C.Orange;
          const even = Math.abs(p - 0.5) < 0.005;
          const fav = p >= 0.5 ? aName : bName, favP = Math.max(p, 1 - p), favCol = p >= 0.5 ? colA : colB;
          const pct = (x: number) => Stats.pct(x);
          return (
            <AppCard>
              <div className="row">
                <T bold style={{ flex: 1 }}>{even ? "Vyrovnané" : `Favorit: ${first(fav)}`}</T>
                <BigNumber text={pct(even ? 0.5 : favP)} color={even ? C.Ink : favCol} size={22} />
              </div>
              <div className="row" style={{ height: 9, borderRadius: 5, overflow: "hidden" }}>
                <div style={{ width: `${p * 100}%`, background: colA, height: "100%" }} />
                <div style={{ flex: 1, background: colB, opacity: 0.85, height: "100%" }} />
              </div>
              <div className="row">
                <T size={13} bold color={colA} style={{ flex: 1 }}>{`${first(aName)} ${pct(p)}`}</T>
                <T size={13} bold color={colB}>{`${pct(1 - p)} ${first(bName)}`}</T>
              </div>
              <Muted size={13} maxLines={3} text={`${first(aName)}: výhra +${StrModel.gainIfWin(strA, strB)} / prohra −${-StrModel.lossIfLose(strA, strB)} · ${first(bName)}: výhra +${StrModel.gainIfWin(strB, strA)} / prohra −${-StrModel.lossIfLose(strB, strA)} STR`} />
            </AppCard>
          );
        })()}
        {body}
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

export function ZapisDetailScreen({ path, myTeam }: { path: string; myTeam: string }) {
  useZapisRefresh(path);
  const z = vm.zapisy.get(path);
  if (!z) return <Loading text="Načítám zápis o utkání…" />;
  // načtený hráč (můj profil) – zvýrazní se v bilanci i v hrách
  const me = vm.me;
  const clean = (n: string) => Stats.fold(n.replace(/\(.*?\)/g, "").trim());
  const isMe = (id: string | null | undefined, name: string) => !!me && (id ? id === me.id : clean(name) === clean(me.name));
  const meHome = z.games.find((g) => g.homeNames.some((n, i) => isMe(g.homeIds[i], n))) ? true
    : z.games.find((g) => g.awayNames.some((n, i) => isMe(g.awayIds[i], n))) ? false : null;
  const myHome = Stats.fold(z.home) === Stats.fold(myTeam) ? true : Stats.fold(z.away) === Stats.fold(myTeam) ? false : meHome ?? true;
  /** sdílený zápis bez mého družstva a bez mě: bez výhra/prohra */
  const neutral = !myTeam && meHome == null;
  const names = (ns: string[], ids: string[], bold: boolean) => ns.map((n, i) => (
    <span key={i} style={isMe(ids[i], n) ? { color: C.Blue, fontWeight: 800 } : bold ? { fontWeight: 700 } : undefined}>{(i ? " + " : "") + n}</span>
  ));
  const [hPts, aPts] = vm.scoreOf(z);
  const single = z.games.filter((g) => !g.doubles);
  const setsOf = (g: ZapisGame, home: boolean) => (home ? g.homeSets ?? 0 : g.awaySets ?? 0);
  const hSets = sum(z.games.map((g) => setsOf(g, true))), aSets = sum(z.games.map((g) => setsOf(g, false)));
  let hBalls = 0, aBalls = 0;
  for (const g of z.games) for (const v of g.sets) {
    const loser = Math.abs(v), winner = loser >= 10 ? loser + 2 : 11;
    if (v > 0) { hBalls += winner; aBalls += loser; } else { hBalls += loser; aBalls += winner; }
  }
  const my = myHome ? hPts : aPts, op = myHome ? aPts : hPts;
  const stats = Live.playerStats(z);
  const anyBody = z.games.some((g) => g.bodyHome != null);
  const zc = vm.compOfPath(path);
  const openZTeam = (id: string | null, name: string) => { if (zc && id) vm.openTeam({ id, name, ...zc }, z.competition); };
  let h = 0, a = 0;
  return (
    <div className="col g12">
      <NavyHeader>
        <Muted text={[z.competition, z.round.trim() ? `${z.round}. kolo` : null].filter((x) => x && x.trim()).join(" · ")} color={C.MutedOnNavy} size={13} />
        <div className="row">
          <div className="clickable" style={{ flex: 1, minWidth: 0 }} onClick={() => openZTeam(z.homeTeamId, z.home)}><TeamName name={z.home} bold={myHome} /></div>
          <BigNumber text={`${hPts} : ${aPts}`} color="#fff" size={44} style={{ padding: "0 10px", whiteSpace: "nowrap" }} />
          <div className="clickable" style={{ flex: 1, minWidth: 0 }} onClick={() => openZTeam(z.awayTeamId, z.away)}><TeamName name={z.away} bold={!myHome} end /></div>
        </div>
        {vm.finished(z)
          ? neutral ? <T bold color="#fff">{(hPts > aPts ? `Vítězství ${z.home}` : hPts < aPts ? `Vítězství ${z.away}` : "Remíza") + (z.online ? " · online zápis" : "")}</T>
            : <T bold color={my > op ? C.WinLight : my < op ? C.Peach : "#fff"}>{(my > op ? "Výhra" : my < op ? "Prohra" : "Remíza") + (z.online ? " · online zápis" : "")}</T>
          : <T bold color="#C4B5FD">{`Probíhá · stav ${hPts} : ${aPts}` + (z.online ? " · online zápis" : "")}</T>}
      </NavyHeader>
      <div className="col g12 px16">
        <AppCard>
          <KeyValue label="Body" value={`${hPts} : ${aPts}`} />
          <KeyValue label="Sady" value={`${hSets} : ${aSets}`} />
          <KeyValue label="Míčky" value={`${hBalls} : ${aBalls}`} />
          {z.dateText.trim() && <KeyValue label="Datum" value={z.dateText} />}
          {z.place.trim() && <KeyValue label="Místo" value={z.place} />}
        </AppCard>
        <HallCard teamRef={vm.refFromZapis(path, z.homeTeamId, z.home)} teamName={z.home} fallbackPlace={z.place.trim() || null} />
        <SectionTitle text="Bilance hráčů" />
        {[myHome, !myHome].map((home) => {
          const ps = stats.filter((p) => p.home === home);
          if (!ps.length) return null;
          return (
            <AppCard key={String(home)}>
              <T bold>{home ? z.home : z.away}</T>
              <div className="row">
                <Muted text="HRÁČ" size={11} style={{ flex: 1 }} />
                <Muted text="DVOUHRY" size={11} style={{ width: 70 }} />
                <Muted text="ČTYŘHRY" size={11} style={{ width: 66 }} />
              </div>
              {ps.map((p, i) => { const go = vm.playerClick(p.id, p.name, path); return (
                <div className={"row" + (go ? " clickable" : "")} key={i} onClick={go ?? undefined} style={isMe(p.id, p.name) ? { padding: "2px 6px", margin: "0 -6px", background: C.Tint, borderRadius: 6 } : { padding: "2px 0" }}>
                  <T size={14} semi lines={1} color={isMe(p.id, p.name) ? C.Blue : undefined} style={{ flex: 1 }}>{p.name}{go && <span style={{ color: C.Muted }}> ›</span>}</T>
                  <T size={14} bold color={p.singlesWon >= p.singlesLost ? C.Win : C.OrangeText} style={{ width: 70, flex: "none" }}>{`${p.singlesWon}–${p.singlesLost}`}</T>
                  <T size={14} style={{ width: 66, flex: "none" }}>{p.doublesWon + p.doublesLost > 0 ? `${p.doublesWon}–${p.doublesLost}` : "–"}</T>
                </div>
              ); })}
            </AppCard>
          );
        })}
        {z.games.some((g) => g.result != null) && <PredictionCard path={path} myHome={myHome} isMe={isMe} />}
        <SectionTitle text={`Všechny hry (${z.games.length})`} />
        <ListCard>
          {z.games.map((g) => {
            if (g.result === 1) h++; else if (g.result === -1) a++;
            const runH = h, runA = a;
            // průběžný stav: sloupec Body ze STIS (pokud ho zápis má), jinak dopočet z výsledků her
            const stav = anyBody ? (g.bodyHome != null && g.bodyAway != null ? `stav ${g.bodyHome}:${g.bodyAway}` : "čeká na započtení") : `stav ${runH}:${runA}`;
            const noShow = <span style={{ color: C.Muted, fontStyle: "italic" }}>nenastoupil(a)</span>;
            const singleGame = !g.doubles && g.homeNames.length > 0 && g.awayNames.length > 0;
            const iWon = g.result != null && (g.result === 1) === myHome;
            const mine = g.homeNames.some((n, i) => isMe(g.homeIds[i], n)) || g.awayNames.some((n, i) => isMe(g.awayIds[i], n));
            return (
              <div key={g.no}>
                <div className={"col" + (singleGame ? " clickable" : "")} style={{ padding: "9px 14px", background: mine ? C.Tint : undefined }}
                  onClick={singleGame ? () => vm.go({ t: "Duel", aId: g.homeIds[0] ?? "", aName: g.homeNames[0], bId: g.awayIds[0] ?? "", bName: g.awayNames[0] }) : undefined}>
                  <div className="row g10">
                    <T bold color={C.Muted} style={{ width: 28, flex: "none" }}>{g.no}.</T>
                    <div className="col w1">
                      <T size={14} lines={1}>{g.wo && !g.homeNames.length ? noShow : names(g.homeNames, g.homeIds, g.result === 1)}</T>
                      <T size={14} lines={1}>{g.wo && !g.awayNames.length ? noShow : names(g.awayNames, g.awayIds, g.result === -1)}</T>
                      {g.wo ? <Muted text="WO – kontumace (do STR ani predikcí se nepočítá)" size={11} maxLines={1} /> : g.sets.length > 0 && <SetsLine sets={g.sets} myHome={myHome} />}
                    </div>
                    <div className="col" style={{ alignItems: "flex-end" }}>
                      {g.result != null ? (
                        <>
                          <T bold color="#fff" style={{ background: C.result(iWon), borderRadius: 8, padding: "3px 8px" }}>{`${g.homeSets ?? "-"}:${g.awaySets ?? "-"}`}</T>
                          <Muted text={stav} size={11} />
                        </>
                      ) : <Muted text="nehráno" size={12} />}
                    </div>
                  </div>
                </div>
                <Divider />
              </div>
            );
          })}
        </ListCard>
        <Muted size={12} text={`Klepnutím na dvouhru otevřete vzájemné zápasy hráčů. ${single.length} dvouher, ${z.games.length - single.length} čtyřhry.`} />
        <SupportStrip />
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}


/** Rozdělí [total] na celá čísla podle podílů [parts] (metoda největších zbytků), aby součet seděl. */
function apportion(parts: number[], total: number): number[] {
  const base = parts.map((x) => Math.floor(x));
  let rest = total - sum(base);
  const order = parts.map((x, i) => [x - Math.floor(x), i] as [number, number]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rest <= 0) break; base[i]++; rest--; }
  for (let i = parts.length - 1; rest < 0 && i >= 0; i--) if (base[i] > 0) { base[i]--; rest++; }
  return base;
}

/** Cesta ke stránce hráče ve svazu zápisu (STR hráče v jeho soutěži). */
function zapisPlayerPath(id: string, zapisPath: string): string {
  const svaz = Stis.svaz(zapisPath);
  return svaz != null ? `/hrac-${id}/svaz-${svaz}/rocnik-${Stis.currentRocnik()}` : vm.playerPathById(id);
}

/**
 * STR hráčů zápisu pro predikci: potvrzené utkání -> STR před utkáním ze stránek hráčů,
 * nepotvrzené -> aktuální STR ze stránky hráče (= před utkáním). Dokud se stránky načítají, ready = false.
 */
export function useZapisStr(path: string) {
  const z = vm.zapisy.get(path);
  const ids = z ? Array.from(new Set(z.games.flatMap((g) => [...g.homeIds, ...g.awayIds]).filter((x) => !!x))) : [];
  useEffect(() => { for (const id of ids) vm.loadPlayer(zapisPlayerPath(id, path)); }, [path, ids.length]);
  return zapisStrInfo(path);
}
/** STR hráčů zápisu z už načtených dat (bez načítání). */
export function zapisStrInfo(path: string) {
  const z = vm.zapisy.get(path);
  const ids = z ? Array.from(new Set(z.games.flatMap((g) => [...g.homeIds, ...g.awayIds]).filter((x) => !!x))) : [];
  const pre = new Map<string, number>();
  const pages = [vm.me, ...vm.players.values()].filter((p): p is PlayerPage => !!p);
  for (const p of pages) for (const m of p.chronological) {
    if (m.zapisPath !== path) continue;
    if (m.strBefore != null && !pre.has(p.id)) pre.set(p.id, m.strBefore);
    if (m.oppStrBefore != null && m.opponentId && !pre.has(m.opponentId)) pre.set(m.opponentId, m.oppStrBefore);
  }
  const pageOf = (id: string) => (vm.me?.id === id ? vm.me : vm.players.get(zapisPlayerPath(id, path)) ?? null);
  const done = ids.filter((id) => pre.has(id) || pageOf(id) != null || vm.loadingPlayers.get(zapisPlayerPath(id, path)) === false).length;
  const strOf = (id: string | null, n: string): number | null => {
    if (id && pre.has(id)) return pre.get(id)!;
    const pg = id ? pageOf(id) : null;
    return pg?.currentStr ?? vm.strOf(id, n);
  };
  return { ready: done >= ids.length, done, total: ids.length, strOf, official: pre.size > 0 };
}

/**
 * Výkon proti predikci: jedna hlavička JMÉNO · PREDIKCE · VÝSLEDEK · +/−, pod ní za každé družstvo jeho řádek
 * a odsazení hráči + čtyřhry. Predikce v celých bodech (součet hráčů + čtyřher = predikce družstva). Sbalitelné.
 */
function PredictionCard({ path, myHome, isMe }: { path: string; myHome: boolean; isMe: (id: string | null | undefined, name: string) => boolean }) {
  const z = vm.zapisy.get(path)!;
  const strs = useZapisStr(path);
  const open = !vm.prefs.predCollapsed;
  const title = (
    <div className="row clickable" onClick={() => { vm.prefs.predCollapsed = open; vm.emit(); }} style={{ padding: "4px 4px 0" }}>
      <T bold size={18} style={{ flex: 1 }}>Výkon proti predikci</T>
      <span style={{ color: C.Muted, fontSize: 22, transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}>⌄</span>
    </div>
  );
  if (!open) return title;
  if (!strs.ready) return <>{title}<AppCard><Loading text={`Načítám STR hráčů… (${strs.done}/${strs.total})`} /></AppCard></>;

  const games = Live.fromZapis(z, strs.strOf, (id, n) => vm.rangeOf(id, n));
  const st = Live.evaluate(games, vm.fmtOf(z));
  const played = games.map((g, i) => [g, st.gameProb[i]] as const).filter(([g]) => g.result != null && !g.wo);
  const hExp = sum(played.map(([, p]) => p));
  const [hTotal, aTotal] = roundScore(hExp, played.length - hExp);

  type Row = { name: string; id: string | null; won: number; pred: number; kind: "team" | "player" | "doubles" };
  const sideRows = (home: boolean): Row[] => {
    const side = played.map(([g, p]) => ({ g, p: home ? p : 1 - p, won: (g.result === 1) === home }));
    const key = (pl: { id: string | null; name: string }) => pl.id || pl.name;
    const players = st.players.filter((p) => p.home === home).map((pl) => {
      const gs = side.filter((x) => { const f = (home ? x.g.home : x.g.away)[0]; return !x.g.doubles && f && key(f) === key(pl); });
      return { name: pl.name, id: pl.id, won: gs.filter((x) => x.won).length, exp: sum(gs.map((x) => x.p)) };
    }).filter((r) => r.exp > 0 || r.won > 0);
    const dbl = side.filter((x) => x.g.doubles);
    const parts = [...players.map((r) => r.exp), sum(dbl.map((x) => x.p))];
    const total = home ? hTotal : aTotal;
    const ints = apportion(parts, total);
    const rows: Row[] = players.map((r, i) => ({ name: r.name, id: r.id, won: r.won, pred: ints[i], kind: "player" as const }))
      .sort((a, b) => (b.won - b.pred) - (a.won - a.pred));
    if (dbl.length) rows.push({ name: "Čtyřhry", id: null, won: dbl.filter((x) => x.won).length, pred: ints[ints.length - 1], kind: "doubles" });
    return [{ name: home ? z.home : z.away, id: null, won: side.filter((x) => x.won).length, pred: total, kind: "team" }, ...rows];
  };
  const signed = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `−${-x}` : "0");
  const col = (x: number) => (x > 0 ? C.Win : x < 0 ? C.OrangeText : C.Muted);
  const surprises = played.map(([g, p]) => ({ g, pWin: g.result === 1 ? p : 1 - p }))
    .filter((x) => x.pWin < 0.5).sort((a, b) => a.pWin - b.pWin).slice(0, 3);
  const W = { pred: 62, res: 62, d: 34 };
  return (
    <>
      {title}
      <AppCard>
        <div className="row">
          <Muted text="JMÉNO" size={11} style={{ flex: 1 }} />
          <Muted text="PREDIKCE" size={11} style={{ width: W.pred, textAlign: "center" }} />
          <Muted text="VÝSLEDEK" size={11} style={{ width: W.res, textAlign: "center" }} />
          <Muted text="+/−" size={11} style={{ width: W.d, textAlign: "right" }} />
        </div>
        {[myHome, !myHome].map((home, si) => (
          <div key={si} className="col" style={{ paddingTop: si ? 8 : 2 }}>
            {sideRows(home).map((r, i) => {
              const me = r.kind === "player" && isMe(r.id, r.name);
              const team = r.kind === "team";
              const d = r.won - r.pred;
              const go = r.kind === "player" ? vm.playerClick(r.id, r.name, path) : null;
              return (
                <div className={"row" + (go ? " clickable" : "")} key={i} onClick={go ?? undefined} style={{
                  padding: team ? "4px 0" : "2px 6px 2px 14px", margin: team ? 0 : "0 -6px 0 0",
                  borderTop: team && si ? "1px solid #E3E8F2" : undefined,
                  background: me ? C.Tint : undefined, borderRadius: me ? 6 : 0,
                }}>
                  <T size={team ? 15 : 14} bold={team} semi={r.kind === "player"} lines={1}
                    color={me ? C.Blue : r.kind === "doubles" ? C.Muted : undefined} style={{ flex: 1 }}>{r.name}{go && <span style={{ color: C.Muted }}> ›</span>}</T>
                  <T size={14} bold={team} style={{ width: W.pred, flex: "none", textAlign: "center" }}>{String(r.pred)}</T>
                  <T size={14} bold={team} style={{ width: W.res, flex: "none", textAlign: "center" }}>{String(r.won)}</T>
                  <T size={14} bold color={col(d)} style={{ width: W.d, flex: "none", textAlign: "right" }}>{signed(d)}</T>
                </div>
              );
            })}
          </div>
        ))}
        <Muted size={11} maxLines={3} text="Výsledek: u družstva body utkání, u hráčů vyhrané dvouhry." />
        {surprises.length > 0 && (
          <div className="col g4" style={{ paddingTop: 6 }}>
            <T bold size={13}>Překvapení utkání <span style={{ fontWeight: 400, color: C.Muted }}>· vítěz tučně</span></T>
            {surprises.map(({ g, pWin }) => {
              const single = !g.doubles && g.home[0] && g.away[0];
              const names = (ps: { name: string }[]) => ps.map((p) => p.name).join(" + ");
              return (
                <div key={g.no} className={single ? "row clickable" : "row"} style={{ padding: "2px 0", alignItems: "flex-start" }}
                  onClick={single ? () => vm.go({ t: "Duel", aId: g.home[0].id ?? "", aName: g.home[0].name, bId: g.away[0].id ?? "", bName: g.away[0].name, pA: st.gameProb[games.indexOf(g)] }) : undefined}>
                  <T size={13} lines={2} style={{ flex: 1 }}>
                    {`${g.no}. `}
                    <span style={{ fontWeight: g.result === 1 ? 800 : 400 }}>{names(g.home)}</span>
                    {" – "}
                    <span style={{ fontWeight: g.result === -1 ? 800 : 400 }}>{names(g.away)}</span>
                  </T>
                  <T size={13} bold color={(g.result === 1) === myHome ? C.Win : C.OrangeText} style={{ flex: "none", paddingLeft: 6 }}>{`šance ${Stats.pct(pWin)}${single ? " ›" : ""}`}</T>
                </div>
              );
            })}
          </div>
        )}
        <Muted size={11} maxLines={3} text={strs.official ? "Šance her podle STR hráčů před utkáním (STIS)." : "Šance her podle aktuálního STR hráčů (utkání STIS ještě nezapočítal)."} />
      </AppCard>
    </>
  );
}

/** Vzájemný zápas: klepnutím se rozbalí jednotlivé sety (ze zápisu utkání) z pohledu hráče A. */
function DuelMatchRow({ m, aId, aName, bId, bName }: { m: Match; aId: string; aName: string; bId: string; bName: string }) {
  const [open, setOpen] = useState(false);
  const path = m.zapisPath;
  useEffect(() => { if (open && path) vm.loadZapis(path); }, [open, path]);
  const z = path ? vm.zapisy.get(path) : undefined;
  const same = (ids: string[], names: string[], id: string, name: string) =>
    (id !== "" && ids.includes(id)) || names.some((n) => Stats.fold(n.replace(/\(.*?\)/g, "").trim()) === Stats.fold(name));
  let sets: number[] | null = null;
  if (z) {
    const g = z.games.find((x) => !x.doubles && ((same(x.homeIds, x.homeNames, aId, aName) && same(x.awayIds, x.awayNames, bId, bName))
      || (same(x.awayIds, x.awayNames, aId, aName) && same(x.homeIds, x.homeNames, bId, bName))));
    if (g) sets = same(g.homeIds, g.homeNames, aId, aName) ? g.sets : g.sets.map((v) => -v);
  }
  return (
    <div>
      <div className="row clickable" style={{ padding: "10px 14px" }} onClick={() => setOpen(!open)}>
        <div className="col w1">
          <T bold>{m.date != null ? DMY(m.date) : m.dateText}</T>
          <Muted maxLines={2} text={`${m.competition}${m.strBefore != null ? ` · STR ${m.strBefore} vs ${m.oppStrBefore ?? "?"}` : ""}${m.delta != null ? ` · ${signedInt(m.delta)}` : ""}`} />
          {m.unofficial && <T size={11} bold color={C.Live}>neoficiální</T>}
        </div>
        <ResultBadge won={m.won} text={m.score} wide />
        <span style={{ color: C.Muted, fontSize: 18, paddingLeft: 8, transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}>⌄</span>
      </div>
      {open && (
        <div className="row" style={{ padding: "0 14px 10px", gap: 12 }}>
          <div className="w1">
            {!path ? <Muted text="Sety nejsou k dispozici." size={13} />
              : !z ? <Muted text="Načítám sety…" size={13} />
                : sets && sets.length ? <div style={{ transform: "scale(1.25)", transformOrigin: "left center" }}><SetsLine sets={sets} myHome={true} /></div>
                  : <Muted text="Sety nejsou k dispozici." size={13} />}
          </div>
          {path && <span className="clickable" style={{ fontSize: 13, fontWeight: 600, color: C.Blue, flex: "none" }}
            onClick={() => vm.go({ t: "ZapisDetail", path, myTeam: m.myTeam })}>Celý zápis ›</span>}
        </div>
      )}
      <Divider />
    </div>
  );
}

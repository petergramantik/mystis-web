import { useEffect } from "react";
import { useZapisRefresh } from "../zapis";
import { vm } from "../../app/vm";
import type { PlayerPage, ZapisGame } from "../../core/models";
import { Stats, StrModel, sum } from "../../core/stats";
import { Live } from "../../core/live";
import { HallCard } from "../hall";
import {
  AppCard, BigNumber, C, DMY, Divider, Empty, HeaderPlayer, KeyValue, ListCard, Loading, Muted, NavyHeader, ProbBar, ResultBadge, SectionTitle, T, dec1, signedInt,
  SetsLine,
} from "../components";

export function PairScreen({ aId0, aName0, bId0, bName0 }: { aId0: string; aName0: string; bId0: string; bName0: string }) {
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
  if (!me) return <Loading />;
  const pa = aIsMe ? me : aPath ? vm.players.get(aPath) : undefined;
  const pageA: PlayerPage | null = aIsMe ? me : pa ? vm.withLive(pa) : null;
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
            {[...list].reverse().map((m, i) => (
              <div key={i}>
                <div className="row" style={{ padding: "10px 14px" }}>
                  <div className="col w1">
                    <T bold>{m.date != null ? DMY(m.date) : m.dateText}</T>
                    <Muted maxLines={2} text={`${m.competition}${m.strBefore != null ? ` · STR ${m.strBefore} vs ${m.oppStrBefore ?? "?"}` : ""}${m.delta != null ? ` · ${signedInt(m.delta)}` : ""}`} />
                    {m.unofficial && <T size={11} bold color={C.Live}>neoficiální</T>}
                  </div>
                  <ResultBadge won={m.won} text={m.score} wide />
                </div>
                <Divider />
              </div>
            ))}
          </ListCard>
        </>
      );
    }
  }
  return (
    <div className="col g12">
      <NavyHeader>
        <div className="rowt">
          <HeaderPlayer name={aName} str={strA} team={lastTeam(pageA)} color={C.Blue} />
          <T bold color={C.MutedOnNavy} style={{ paddingTop: 20, flex: "none" }}>vs</T>
          <HeaderPlayer name={bName} str={strB} team={lastTeam(pageB)} color={C.Orange} />
        </div>
      </NavyHeader>
      <div className="col g12 px16">
        {strA != null && strB != null && (() => {
          const p = StrModel.winProbability(strA, strB);
          return (
            <AppCard>
              <div className="row"><T bold style={{ flex: 1 }}>Šance: {first(aName)}</T><BigNumber text={Stats.pct(p)} color={p >= 0.5 ? C.Win : C.OrangeText} size={22} /></div>
              <ProbBar p={p} />
              <Muted size={13} text={`${first(aName)}: výhra +${StrModel.gainIfWin(strA, strB)}, prohra −${-StrModel.lossIfLose(strA, strB)} STR`} />
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
  const myHome = Stats.fold(z.home) === Stats.fold(myTeam) ? true : Stats.fold(z.away) === Stats.fold(myTeam) ? false : true;
  const hPts = z.points[0] ?? z.games.filter((g) => g.result === 1).length;
  const aPts = z.points[1] ?? z.games.filter((g) => g.result === -1).length;
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
  let h = 0, a = 0;
  return (
    <div className="col g12">
      <NavyHeader>
        <Muted text={[z.competition, z.round.trim() ? `${z.round}. kolo` : null].filter((x) => x && x.trim()).join(" · ")} color={C.MutedOnNavy} size={13} />
        <div className="row">
          <T color="#fff" bold={myHome} lines={2} style={{ flex: 1 }}>{z.home}</T>
          <BigNumber text={`${hPts} : ${aPts}`} color="#fff" size={44} style={{ padding: "0 10px", whiteSpace: "nowrap" }} />
          <T color="#fff" bold={!myHome} lines={2} end style={{ flex: 1 }}>{z.away}</T>
        </div>
        {Live.isZapisFinished(z, vm.format)
          ? <T bold color={my > op ? C.WinLight : my < op ? C.Peach : "#fff"}>{(my > op ? "Výhra" : my < op ? "Prohra" : "Remíza") + (z.online ? " · online zápis" : "")}</T>
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
              {ps.map((p, i) => (
                <div className="row" key={i} style={{ padding: "2px 0" }}>
                  <T size={14} semi lines={1} style={{ flex: 1 }}>{p.name}</T>
                  <T size={14} bold color={p.singlesWon >= p.singlesLost ? C.Win : C.OrangeText} style={{ width: 70, flex: "none" }}>{`${p.singlesWon}–${p.singlesLost}`}</T>
                  <T size={14} style={{ width: 66, flex: "none" }}>{p.doublesWon + p.doublesLost > 0 ? `${p.doublesWon}–${p.doublesLost}` : "–"}</T>
                </div>
              ))}
            </AppCard>
          );
        })}
        <SectionTitle text={`Všechny hry (${z.games.length})`} />
        <ListCard>
          {z.games.map((g) => {
            if (g.result === 1) h++; else if (g.result === -1) a++;
            const runH = h, runA = a;
            const singleGame = !g.doubles && g.homeNames.length > 0 && g.awayNames.length > 0;
            const iWon = g.result != null && (g.result === 1) === myHome;
            return (
              <div key={g.no}>
                <div className={"col" + (singleGame ? " clickable" : "")} style={{ padding: "9px 14px" }}
                  onClick={singleGame ? () => vm.go({ t: "Duel", aId: g.homeIds[0] ?? "", aName: g.homeNames[0], bId: g.awayIds[0] ?? "", bName: g.awayNames[0] }) : undefined}>
                  <div className="row g10">
                    <T bold color={C.Muted} style={{ width: 28, flex: "none" }}>{g.no}.</T>
                    <div className="col w1">
                      <T size={14} bold={g.result === 1} lines={1}>{g.homeNames.join(" + ")}</T>
                      <T size={14} bold={g.result === -1} lines={1}>{g.awayNames.join(" + ")}</T>
                      {g.sets.length > 0 && <SetsLine sets={g.sets} myHome={myHome} />}
                    </div>
                    <div className="col" style={{ alignItems: "flex-end" }}>
                      {g.result != null ? (
                        <>
                          <T bold color="#fff" style={{ background: C.result(iWon), borderRadius: 8, padding: "3px 8px" }}>{`${g.homeSets ?? "-"}:${g.awaySets ?? "-"}`}</T>
                          <Muted text={`stav ${runH}:${runA}`} size={11} />
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
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}


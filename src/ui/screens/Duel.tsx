import { useEffect } from "react";
import { useZapisRefresh } from "../zapis";
import { vm } from "../../app/vm";
import type { PlayerPage, ZapisGame } from "../../core/models";
import { Stats, StrModel, sum } from "../../core/stats";
import { Live } from "../../core/live";
import { Parsers } from "../../core/parsers";
import { today } from "../../core/dates";
import { roundScore } from "../../core/search";
import { HallCard } from "../hall";
import {
  AppCard, BigNumber, C, DMY, Divider, Empty, HeaderPlayer, KeyValue, ListCard, Loading, Muted, NavyHeader, ProbBar, ResultBadge, SectionTitle, T, dec1, signedInt,
  SetsLine,
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
          const p = pA0 != null ? (swap ? 1 - pA0 : pA0) : StrModel.winProbability(strA, strB);
          // strana mého družstva: zeleně; soupeř oranžově. Když nejde o moje družstvo: barvy podle avatarů.
          const mineTeams = new Set([...vm.next.map((c) => Stats.fold(c.myTeam.name)), ...me.matches.map((m) => Stats.fold(m.myTeam))]);
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
  const names = (ns: string[], ids: string[], bold: boolean) => ns.map((n, i) => (
    <span key={i} style={isMe(ids[i], n) ? { color: C.Blue, fontWeight: 800 } : bold ? { fontWeight: 700 } : undefined}>{(i ? " + " : "") + n}</span>
  ));
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
                <div className="row" key={i} style={isMe(p.id, p.name) ? { padding: "2px 6px", margin: "0 -6px", background: C.Tint, borderRadius: 6 } : { padding: "2px 0" }}>
                  <T size={14} semi lines={1} color={isMe(p.id, p.name) ? C.Blue : undefined} style={{ flex: 1 }}>{p.name}</T>
                  <T size={14} bold color={p.singlesWon >= p.singlesLost ? C.Win : C.OrangeText} style={{ width: 70, flex: "none" }}>{`${p.singlesWon}–${p.singlesLost}`}</T>
                  <T size={14} style={{ width: 66, flex: "none" }}>{p.doublesWon + p.doublesLost > 0 ? `${p.doublesWon}–${p.doublesLost}` : "–"}</T>
                </div>
              ))}
            </AppCard>
          );
        })}
        {z.games.some((g) => g.result != null) && <PredictionCard path={path} myHome={myHome} isMe={isMe} />}
        <SectionTitle text={`Všechny hry (${z.games.length})`} />
        <ListCard>
          {z.games.map((g) => {
            if (g.result === 1) h++; else if (g.result === -1) a++;
            const runH = h, runA = a;
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
                      <T size={14} lines={1}>{names(g.homeNames, g.homeIds, g.result === 1)}</T>
                      <T size={14} lines={1}>{names(g.awayNames, g.awayIds, g.result === -1)}</T>
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


/** Rozdělí [total] na celá čísla podle podílů [parts] (metoda největších zbytků), aby součet seděl. */
function apportion(parts: number[], total: number): number[] {
  const base = parts.map((x) => Math.floor(x));
  let rest = total - sum(base);
  const order = parts.map((x, i) => [x - Math.floor(x), i] as [number, number]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (rest <= 0) break; base[i]++; rest--; }
  for (let i = parts.length - 1; rest < 0 && i >= 0; i--) if (base[i] > 0) { base[i]--; rest++; }
  return base;
}

/**
 * Výkon proti predikci: šance každé hry podle STR hráčů před utkáním (ze stránek hráčů, kde zápas už STIS
 * započítal), jinak podle aktuálního STR. Predikce v celých bodech; součet hráčů + čtyřher = predikce družstva.
 */
function PredictionCard({ path, myHome, isMe }: { path: string; myHome: boolean; isMe: (id: string | null | undefined, name: string) => boolean }) {
  const z = vm.zapisy.get(path)!;
  const ids = Array.from(new Set(z.games.flatMap((g) => [...g.homeIds, ...g.awayIds]).filter((x) => !!x)));
  // STR před utkáním z oficiálně započítaných zápasů tohoto zápisu
  const pre = new Map<string, number>();
  const pages = [vm.me, ...vm.players.values()].filter((p): p is PlayerPage => !!p);
  for (const p of pages) for (const m of p.chronological) {
    if (m.zapisPath !== path) continue;
    if (m.strBefore != null && !pre.has(p.id)) pre.set(p.id, m.strBefore);
    if (m.oppStrBefore != null && m.opponentId && !pre.has(m.opponentId)) pre.set(m.opponentId, m.oppStrBefore);
  }
  const missing = ids.filter((id) => !pre.has(id));
  const official = !!vm.me?.matches.some((m) => m.zapisPath === path) || pre.size > 0;
  useEffect(() => { if (official) for (const id of missing.slice(0, 10)) vm.loadPlayer(vm.playerPathById(id)); }, [path, official, missing.length]);
  const games = Live.fromZapis(z, (id, n) => (id && pre.has(id) ? pre.get(id)! : vm.strOf(id, n)), (id, n) => (id && pre.has(id) ? null : vm.rangeOf(id, n)));
  const st = Live.evaluate(games, vm.format);
  const played = games.map((g, i) => [g, st.gameProb[i]] as const).filter(([g]) => g.result != null);
  const date = Parsers.date(z.dateText);
  const estimate = missing.length > 0 && date != null && today() - date > 7;
  const hExp = sum(played.map(([, p]) => p));
  const [hTotal, aTotal] = roundScore(hExp, played.length - hExp);

  const sideRows = (home: boolean) => {
    const mineSide = played.map(([g, p]) => ({ g, p: home ? p : 1 - p, won: (g.result === 1) === home }));
    const actual = mineSide.filter((x) => x.won).length;
    const players = st.players.filter((p) => p.home === home);
    // jen dohrané dvouhry hráče
    const rows = players.map((pl) => {
      const gs = mineSide.filter((x) => !x.g.doubles && (home ? x.g.home : x.g.away)[0] && ((home ? x.g.home : x.g.away)[0].id || (home ? x.g.home : x.g.away)[0].name) === (pl.id || pl.name));
      return { name: pl.name, id: pl.id, won: gs.filter((x) => x.won).length, exp: sum(gs.map((x) => x.p)) };
    }).filter((r) => r.exp > 0 || r.won > 0);
    const dbl = mineSide.filter((x) => x.g.doubles);
    const parts = [...rows.map((r) => r.exp), sum(dbl.map((x) => x.p))];
    const total = home ? hTotal : aTotal;
    const ints = apportion(parts, total);
    const out = rows.map((r, i) => ({ ...r, pred: ints[i] }));
    if (dbl.length) out.push({ name: "Čtyřhry", id: null as any, won: dbl.filter((x) => x.won).length, exp: parts[parts.length - 1], pred: ints[ints.length - 1] });
    out.sort((a, b) => (a.name === "Čtyřhry" ? 1 : b.name === "Čtyřhry" ? -1 : (b.won - b.pred) - (a.won - a.pred)));
    return { actual, pred: total, rows: out };
  };
  const signed = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `−${-x}` : "0");
  const col = (x: number) => (x > 0 ? C.Win : x < 0 ? C.OrangeText : C.Muted);
  const sides = [myHome, !myHome];
  const surprises = played.map(([g, p]) => ({ g, pWin: g.result === 1 ? p : 1 - p }))
    .filter((x) => x.pWin < 0.5).sort((a, b) => a.pWin - b.pWin).slice(0, 3);
  const surname = (n: string) => n.replace(/\(.*?\)/g, "").trim().split(" ")[0];
  return (
    <>
      <SectionTitle text="Výkon proti predikci" />
      <AppCard>
        {sides.map((home) => {
          const s = sideRows(home);
          const d = s.actual - s.pred;
          return (
            <div key={String(home)} className="col g4" style={{ paddingBottom: 6 }}>
              <div className="row">
                <T bold lines={1} style={{ flex: 1 }}>{home ? z.home : z.away}</T>
                <T size={13} color={C.Muted} style={{ flex: "none" }}>{`predikce ${s.pred} · uhráno ${s.actual} · `}</T>
                <T size={14} bold color={col(d)} style={{ flex: "none", paddingLeft: 4 }}>{signed(d)}</T>
              </div>
              <div className="row">
                <Muted text="HRÁČ" size={11} style={{ flex: 1 }} />
                <Muted text="VÝHRY" size={11} style={{ width: 52 }} />
                <Muted text="PREDIKCE" size={11} style={{ width: 64 }} />
                <Muted text="+/−" size={11} style={{ width: 34, textAlign: "right" }} />
              </div>
              {s.rows.map((r, i) => {
                const me = r.id !== null && isMe(r.id, r.name);
                const dd = r.won - r.pred;
                return (
                  <div className="row" key={i} style={me ? { padding: "2px 6px", margin: "0 -6px", background: C.Tint, borderRadius: 6 } : { padding: "2px 0" }}>
                    <T size={14} semi={r.name !== "Čtyřhry"} lines={1} color={me ? C.Blue : r.name === "Čtyřhry" ? C.Muted : undefined} style={{ flex: 1 }}>{r.name}</T>
                    <T size={14} style={{ width: 52, flex: "none" }}>{String(r.won)}</T>
                    <T size={14} style={{ width: 64, flex: "none" }}>{String(r.pred)}</T>
                    <T size={14} bold color={col(dd)} style={{ width: 34, flex: "none", textAlign: "right" }}>{signed(dd)}</T>
                  </div>
                );
              })}
            </div>
          );
        })}
        {surprises.length > 0 && (
          <div className="col g4" style={{ paddingTop: 4 }}>
            <T bold size={13}>Překvapení utkání <span style={{ fontWeight: 400, color: C.Muted }}>· vítěz tučně</span></T>
            {surprises.map(({ g, pWin }) => {
              const w = g.result === 1 ? g.home : g.away, l = g.result === 1 ? g.away : g.home;
              const single = !g.doubles && w[0] && l[0];
              return (
                <div key={g.no} className={single ? "row clickable" : "row"} style={{ padding: "2px 0" }}
                  onClick={single ? () => vm.go({ t: "Duel", aId: g.home[0].id ?? "", aName: g.home[0].name, bId: g.away[0].id ?? "", bName: g.away[0].name, pA: st.gameProb[games.indexOf(g)] }) : undefined}>
                  <T size={13} lines={1} style={{ flex: 1 }}>
                    {`${g.no}. `}
                    <span style={{ fontWeight: g.result === 1 ? 800 : 400 }}>{g.home.map((p) => surname(p.name)).join("+")}</span>
                    {" – "}
                    <span style={{ fontWeight: g.result === -1 ? 800 : 400 }}>{g.away.map((p) => surname(p.name)).join("+")}</span>
                  </T>
                  <T size={13} bold color={(g.result === 1) === myHome ? C.Win : C.OrangeText} style={{ flex: "none", paddingLeft: 6 }}>{`šance ${Stats.pct(pWin)}${single ? " ›" : ""}`}</T>
                </div>
              );
            })}
          </div>
        )}
        <Muted size={11} maxLines={3} text={estimate ? "Odhad z aktuálního STR – STR hráčů před utkáním se nepodařilo zjistit." : official && missing.length === 0 ? "Šance her podle STR hráčů před utkáním." : "Šance her podle aktuálního STR hráčů."} />
      </AppCard>
    </>
  );
}

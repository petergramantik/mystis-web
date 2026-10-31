// Obrazovka Družstvo: hlavička z tabulky, graf vývoje (průměrné STR soupisky + výsledky utkání), soupiska a statistiky.
import { useEffect, useState } from "react";
import { vm } from "../../app/vm";
import { Stis, type LosMatch, type PlayerPage, type Zapis } from "../../core/models";
import { Stats, sum } from "../../core/stats";
import { Live } from "../../core/live";
import { Stability, roundScore } from "../../core/search";
import { type LDate, LDATE_MIN, ldDay, ldMinusYears, ldMonth, ldOf, ldYear, ldtDate, today } from "../../core/dates";
import {
  AppCard, Avatar, C, Chips, Divider, Empty, KeyValue, Legend, ListCard, Loading, Muted, NavyHeader, SectionTitle, StatTile, StrChart, T, TileRow,
  signedInt,
} from "../components";
import { strPoints } from "./StrScreen";

function minusMonths(d: LDate, n: number): LDate {
  let y = ldYear(d), m = ldMonth(d) - n;
  while (m < 1) { m += 12; y--; }
  let dd = ldDay(d);
  let r = ldOf(y, m, dd);
  while (r == null && dd > 28) { dd--; r = ldOf(y, m, dd); }
  return r ?? d - 30 * n;
}
function periodFrom(period: string): LDate {
  const td = today();
  return period === "3m" ? minusMonths(td, 3)
    : period === "sez" ? ldOf(Stis.currentRocnik(td), 7, 1)!
      : period === "1r" ? ldMinusYears(td, 1) : LDATE_MIN;
}

/** Skóre odehraného utkání z pohledu družstva: konečný výsledek z rozpisu, jinak ze zápisu. */
function matchScore(m: LosMatch, home: boolean, z: Zapis | undefined, myHome: (z: Zapis) => boolean): [number, number] | null {
  const sm = /^(\d+)\s*:\s*(\d+)$/.exec(m.score);
  if (sm && (vm.scoreFinal(m.score) || !z || !z.games.length)) { const h = +sm[1], a = +sm[2]; return home ? [h, a] : [a, h]; }
  if (z && z.games.length) { const [h, a] = z.score; return myHome(z) ? [h, a] : [a, h]; }
  return null;
}

export function TeamScreen({ team }: { team: number }) {
  const ctx = vm.next[team];
  const ref = ctx?.myTeam.ref ?? null;
  const [period, setPeriod] = useState("sez");
  const roster = ctx ? vm.fresh(ctx.myRoster) : [];
  const played = ctx ? ctx.los.filter((m) => m.played || (m.zapisPath && vm.zapisy.get(m.zapisPath)?.games.length)) : [];
  const playedDone = played.filter((m) => !(ctx!.liveNow && m === ctx!.next && !vm.liveFinished(ctx!)));
  useEffect(() => {
    if (!ctx) return;
    if (ref) vm.loadTabulka(ref.svaz, ref.rocnik, ref.soutez);
    for (const p of roster) if (p.path) vm.loadPlayer(p.path);
    for (const m of playedDone) if (m.zapisPath) vm.loadZapis(m.zapisPath);
  }, [ctx?.myTeam.name, roster.length, playedDone.length]);
  if (!ctx) return <Empty text="Družstvo nenalezeno." />;
  const me = vm.me;
  const tab = ref ? vm.tabulky.get(Stis.tabulka(ref.svaz, ref.rocnik, ref.soutez)) : undefined;
  const row = tab?.find((r) => (ref && r.teamId === ref.id) || Stats.fold(r.name) === Stats.fold(ctx.myTeam.name));
  const isHome = (m: LosMatch) => Stats.isHome(m, ref, ctx.myTeam.name);
  const zMyHome = (z: Zapis) => vm.zapisMyHome(z, ctx);

  // odehraná utkání s výsledkem (od nejstaršího)
  const results = playedDone.map((m) => {
    const z = m.zapisPath ? vm.zapisy.get(m.zapisPath) : undefined;
    return { m, z, home: isHome(m), sc: matchScore(m, isHome(m), z, zMyHome) };
  }).filter((x) => x.sc != null).sort((a, b) => (a.m.dateTime ?? 0) - (b.m.dateTime ?? 0)) as
    { m: LosMatch; z: Zapis | undefined; home: boolean; sc: [number, number] }[];

  // průměrné STR soupisky v čase (z grafů STR hráčů)
  const pages = roster.map((p) => (p.path ? vm.players.get(p.path) : undefined)).filter((p): p is PlayerPage => !!p);
  const loadingPlayers = roster.filter((p) => p.path && !vm.players.has(p.path) && vm.loadingPlayers.get(p.path) !== false).length;
  const from = periodFrom(period);
  const histories = pages.map((p) => strPoints(p, "vse"));
  const dates = Array.from(new Set(histories.flatMap((h) => h.map((x) => x[0])))).filter((d) => d >= from).sort((a, b) => a - b);
  const avgPts: [LDate, number][] = [];
  for (const d of dates) {
    const vals = histories.map((h) => { let v: number | null = null; for (const [hd, s] of h) { if (hd <= d) v = s; else break; } return v; }).filter((v): v is number => v != null);
    if (vals.length) avgPts.push([d, Math.round(sum(vals) / vals.length)]);
  }
  const resInPeriod = results.filter((r) => r.m.dateTime == null || ldtDate(r.m.dateTime) >= from);

  return (
    <div className="col g12">
      <NavyHeader>
        <T bold size={22} color="#fff" lines={2}>{ctx.myTeam.name}</T>
        <Muted text={ctx.myTeam.competition ?? ""} color={C.MutedOnNavy} size={13} />
        <TileRow>
          <StatTile label="Pořadí" value={row ? `${row.position}.` : "–"} dark />
          <StatTile label="Body" value={row ? String(row.points) : "–"} dark />
          <StatTile label="V–R–P" value={row ? `${row.wins}–${row.draws}–${row.losses}` : "–"} dark />
        </TileRow>
        {row && <Muted text={`Skóre her ${row.score} · odehráno ${row.played} z ${ctx.los.length} utkání`} color={C.MutedOnNavy} size={13} />}
      </NavyHeader>
      <div className="col g12 px16">
        <AppCard>
          <T bold>Vývoj družstva</T>
          <Chips options={[["3m", "3 měsíce"], ["sez", "Sezóna"], ["1r", "1 rok"], ["vse", "Vše"]]} selected={period} onSelect={setPeriod} />
          {loadingPlayers > 0 && !avgPts.length ? <Loading text={`Načítám STR hráčů… (${pages.length}/${roster.length})`} />
            : avgPts.length >= 2 ? <StrChart series={[{ color: C.Blue, points: avgPts }]} height={190} /> : <Empty text="Graf zatím nemá data." />}
          <Legend items={[[C.Blue, "průměrné STR hráčů soupisky"]]} />
          <T semi size={14} style={{ paddingTop: 6 }}>Výsledky utkání</T>
          {resInPeriod.length ? <ResultBars items={resInPeriod.map((r) => ({ label: r.m.round, diff: r.sc[0] - r.sc[1], text: `${r.sc[0]}:${r.sc[1]}`, path: r.m.zapisPath }))} team={ctx.myTeam.name} />
            : <Muted text="V tomto období žádná odehraná utkání." size={13} />}
        </AppCard>

        <SectionTitle text="Soupiska" />
        <ListCard>
          {!roster.length && <Empty text="Soupiska není k dispozici." />}
          {[...roster].sort((a, b) => (b.str ?? 0) - (a.str ?? 0)).map((p, i) => {
            const page = p.path ? vm.players.get(p.path) : undefined;
            const sez = page ? strPoints(page, "sez") : [];
            const change = sez.length >= 2 ? sez[sez.length - 1][1] - sez[0][1] : p.strChange;
            const w = p.wins, l = p.losses;
            const pct = w != null && l != null && w + l > 0 ? Math.round((100 * w) / (w + l)) : null;
            const utk = page ? Stability.utkani(page, ctx.myTeam.name, vm.season()) : null;
            const mine = !!me && (p.id === me.id || Stats.fold(p.name) === Stats.fold(me.name));
            return (
              <div key={i}>
                <div className={"row g12" + (p.path ? " clickable" : "")} style={{ padding: "10px 14px", background: mine ? C.Tint : undefined }}
                  onClick={p.path ? () => vm.go({ t: "Player", path: p.path! }) : undefined}>
                  <Avatar text={p.name} color={mine ? C.Blue : C.Grey} size={36} />
                  <div className="col w1">
                    <T semi size={15} lines={1} color={mine ? C.Blue : undefined}>{p.name}</T>
                    <Muted size={12} maxLines={1} text={[p.bilance ? `bilance ${p.bilance}` : null, pct != null ? `${pct} %` : null, utk != null ? `${utk} utk.` : null].filter((x) => x).join(" · ")} />
                  </div>
                  <div className="col" style={{ alignItems: "flex-end" }}>
                    <T bold size={16}>{p.str != null ? String(p.str) : "–"}</T>
                    {change != null && <T size={12} semi color={C.delta(change)}>{signedInt(change)}</T>}
                  </div>
                </div>
                <Divider />
              </div>
            );
          })}
        </ListCard>
        <Muted size={12} maxLines={3} text="STR, změna STR za sezónu, bilance dvouher a úspěšnost za družstvo, počet odehraných utkání za družstvo v této sezóně." />

        <TeamStats results={results} ctxName={ctx.myTeam.name} zMyHome={zMyHome} />
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

/** Sloupce výsledků: nad osou výhra (+body), pod osou prohra; klepnutí otevře zápis. */
function ResultBars({ items, team }: { items: { label: string; diff: number; text: string; path: string }[]; team: string }) {
  const max = Math.max(1, ...items.map((x) => Math.abs(x.diff)));
  const h = 56;
  return (
    <div className="row" style={{ alignItems: "stretch", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
      {items.map((x, i) => {
        const bh = Math.max(3, (Math.abs(x.diff) / max) * h);
        const col = x.diff > 0 ? C.Win : x.diff < 0 ? C.OrangeText : C.Muted;
        return (
          <div key={i} className={"col" + (x.path ? " clickable" : "")} style={{ alignItems: "center", flex: "1 0 26px", minWidth: 26 }}
            onClick={x.path ? () => vm.go({ t: "ZapisDetail", path: x.path, myTeam: team }) : undefined}>
            <div style={{ height: h, display: "flex", alignItems: "flex-end" }}>{x.diff >= 0 && <div style={{ width: 16, height: bh, background: col, borderRadius: 3 }} />}</div>
            <div style={{ width: "100%", height: 1, background: C.Line }} />
            <div style={{ height: h, display: "flex", alignItems: "flex-start" }}>{x.diff < 0 && <div style={{ width: 16, height: bh, background: col, borderRadius: 3 }} />}</div>
            <span style={{ fontSize: 10, color: col, fontWeight: 700 }}>{x.text}</span>
            <span style={{ fontSize: 10, color: C.Muted }}>{x.label}.</span>
          </div>
        );
      })}
    </div>
  );
}

function TeamStats({ results, ctxName, zMyHome }: {
  results: { m: LosMatch; z: Zapis | undefined; home: boolean; sc: [number, number] }[]; ctxName: string; zMyHome: (z: Zapis) => boolean;
}) {
  if (!results.length) return null;
  const rec = (list: typeof results) => {
    const w = list.filter((r) => r.sc[0] > r.sc[1]).length, d = list.filter((r) => r.sc[0] === r.sc[1]).length;
    const avgF = list.length ? sum(list.map((r) => r.sc[0])) / list.length : 0, avgA = list.length ? sum(list.map((r) => r.sc[1])) / list.length : 0;
    return list.length ? `${w}–${d}–${list.length - w - d} · Ø ${avgF.toFixed(1).replace(".", ",")} : ${avgA.toFixed(1).replace(".", ",")}` : "–";
  };
  // série
  const outcome = (r: (typeof results)[number]) => Math.sign(r.sc[0] - r.sc[1]);
  let cur = 0;
  for (let i = results.length - 1; i >= 0; i--) { if (outcome(results[i]) === outcome(results[results.length - 1])) cur++; else break; }
  const curKind = outcome(results[results.length - 1]);
  let best = 0, run = 0;
  for (const r of results) { run = outcome(r) > 0 ? run + 1 : 0; best = Math.max(best, run); }
  const byDiff = [...results].sort((a, b) => (b.sc[0] - b.sc[1]) - (a.sc[0] - a.sc[1]));
  const top = byDiff[0], worst = byDiff[byDiff.length - 1];
  const opp = (r: (typeof results)[number]) => (r.home ? r.m.away : r.m.home);

  // ze zápisů
  const zs = results.filter((r) => r.z && r.z.games.length).map((r) => ({ ...r, z: r.z!, mh: zMyHome(r.z!) }));
  const loadingZ = results.filter((r) => r.m.zapisPath && !r.z).length;
  let dW = 0, dL = 0, setsF = 0, setsA = 0, ballsF = 0, ballsA = 0, fiveW = 0, fiveL = 0, predSum = 0, actSum = 0;
  const pairs = new Map<string, [number, number]>();
  const singles = new Map<string, { name: string; w: number; l: number }>();
  let surprise: { p: number; text: string; path: string } | null = null;
  for (const { z, mh } of zs) {
    const games = Live.fromZapis(z, (id, n) => vm.strOf(id, n), (id, n) => vm.rangeOf(id, n));
    const st = Live.evaluate(games, vm.format);
    games.forEach((g, i) => {
      if (g.result == null) return;
      const won = (g.result === 1) === mh;
      const p = mh ? st.gameProb[i] : 1 - st.gameProb[i];
      predSum += p; actSum += won ? 1 : 0;
      const zg = z.games[i];
      const my = mh ? zg.homeNames : zg.awayNames, their = mh ? zg.awayNames : zg.homeNames;
      for (const v of zg.sets) {
        const loser = Math.abs(v), winner = loser >= 10 ? loser + 2 : 11;
        const mineSet = (v > 0) === mh;
        if (mineSet) { setsF++; ballsF += winner; ballsA += loser; } else { setsA++; ballsF += loser; ballsA += winner; }
      }
      if (zg.sets.length === 5) { if (won) fiveW++; else fiveL++; }
      if (g.doubles) {
        if (won) dW++; else dL++;
        const k = [...my].sort().join(" + ");
        const c = pairs.get(k) ?? [0, 0]; c[won ? 0 : 1]++; pairs.set(k, c);
      } else if (my[0]) {
        const k = Stats.fold(my[0]);
        const c = singles.get(k) ?? { name: my[0], w: 0, l: 0 }; if (won) c.w++; else c.l++; singles.set(k, c);
      }
      if (won && (!surprise || p < surprise.p) && p < 0.5) surprise = { p, text: `${my.join(" + ")} – ${their.join(" + ")}`, path: z.path };
    });
  }
  const bestPair = Array.from(pairs.entries()).filter(([, c]) => c[0] + c[1] >= 2).sort((a, b) => b[1][0] / (b[1][0] + b[1][1]) - a[1][0] / (a[1][0] + a[1][1]) || b[1][0] - a[1][0])[0];
  const bestPlayer = Array.from(singles.values()).filter((s) => s.w + s.l >= 4).sort((a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l))[0];
  const [predR] = roundScore(predSum, zs.length ? sum(zs.map((x) => x.z.games.filter((g) => g.result != null).length)) - predSum : 0);
  const vsPred = actSum - predR;
  const sp = surprise as { p: number; text: string; path: string } | null;

  return (
    <>
      <SectionTitle text="Statistiky sezóny" />
      <AppCard>
        <KeyValue label="Doma" value={rec(results.filter((r) => r.home))} />
        <KeyValue label="Venku" value={rec(results.filter((r) => !r.home))} />
        <KeyValue label="Aktuální série" value={`${cur}× ${curKind > 0 ? "výhra" : curKind < 0 ? "prohra" : "remíza"}`} valueColor={curKind > 0 ? C.Win : curKind < 0 ? C.OrangeText : C.Ink} />
        <KeyValue label="Nejdelší série výher" value={String(best)} />
        {top && top.sc[0] > top.sc[1] && <KeyValue label="Nejvyšší výhra" value={`${top.sc[0]}:${top.sc[1]} · ${opp(top)}`} valueColor={C.Win} />}
        {worst && worst.sc[0] < worst.sc[1] && <KeyValue label="Nejvyšší prohra" value={`${worst.sc[0]}:${worst.sc[1]} · ${opp(worst)}`} valueColor={C.OrangeText} />}
      </AppCard>
      <AppCard>
        <T bold>Ze zápisů utkání</T>
        {loadingZ > 0 && <Muted color={C.Blue} size={12} text={`Načítám zápisy… (${zs.length}/${zs.length + loadingZ})`} />}
        {zs.length === 0 ? <Muted text="Zápisy zatím nejsou načtené." size={13} /> : <>
          <KeyValue label="Čtyřhry" value={`${dW}–${dL}`} />
          {bestPair && <KeyValue label="Nejlepší dvojice" value={`${bestPair[0]} (${bestPair[1][0]}–${bestPair[1][1]})`} />}
          {bestPlayer && <KeyValue label="Nejlepší hráč (dvouhry)" value={`${bestPlayer.name} ${Math.round((100 * bestPlayer.w) / (bestPlayer.w + bestPlayer.l))} % (${bestPlayer.w}–${bestPlayer.l})`} />}
          <KeyValue label="Sety" value={`${setsF} : ${setsA}`} />
          <KeyValue label="Míčky" value={`${ballsF} : ${ballsA}`} />
          <KeyValue label="Pětisetové hry" value={`${fiveW}–${fiveL}`} />
          <KeyValue label="Výkon proti predikci" value={`predikce ${predR} · uhráno ${actSum} · ${signedInt(vsPred)}`} valueColor={vsPred > 0 ? C.Win : vsPred < 0 ? C.OrangeText : C.Ink} />
          {sp && (
            <div className="row clickable" onClick={() => vm.go({ t: "ZapisDetail", path: sp.path, myTeam: ctxName })} style={{ padding: "3px 0" }}>
              <div className="col w1">
                <Muted text="Překvapení sezóny" size={14} />
                <T size={13} lines={2}>{sp.text}</T>
              </div>
              <T bold color={C.Win} style={{ flex: "none" }}>{`šance ${Stats.pct(sp.p)} ›`}</T>
            </div>
          )}
          <Muted size={11} maxLines={2} text="Výkon proti predikci a překvapení podle aktuálního STR hráčů." />
        </>}
      </AppCard>
    </>
  );
}


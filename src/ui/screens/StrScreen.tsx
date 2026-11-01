import { useEffect, useState } from "react";
import type { SearchPlayer } from "../../core/search";
import { vm } from "../../app/vm";
import { Stis, type PlayerPage } from "../../core/models";
import { Stats, StrModel, sum } from "../../core/stats";
import { type LDate, LDATE_MIN, ldDay, ldMinusYears, ldMonth, ldOf, ldYear, today } from "../../core/dates";
import { AppCard, Avatar, Segmented, BigNumber, C, Chips, DMY, KeyValue, Legend, Loading, Muted, ProbBar, SectionTitle, StatTile, StrChart, StrTimelineChart, T, forecastColor, TextField, TileRow, dec1, f0, signedInt } from "../components";

function minusMonths(d: LDate, n: number): LDate {
  let y = ldYear(d), m = ldMonth(d) - n;
  while (m < 1) { m += 12; y--; }
  let dd = ldDay(d);
  let r = ldOf(y, m, dd);
  while (r == null && dd > 28) { dd--; r = ldOf(y, m, dd); }
  return r ?? d - 30 * n;
}

export function strPoints(p: PlayerPage, period: string): [LDate, number][] {
  let pts = p.graph.filter((g) => g.date != null && g.str != null).map((g) => [g.date!, g.str!] as [LDate, number]);
  if (!pts.length) pts = p.chronological.filter((m) => m.date != null && m.strAfter != null).map((m) => [m.date!, m.strAfter!] as [LDate, number]);
  const td = today();
  const from = period === "3m" ? minusMonths(td, 3)
    : period === "sez" ? ldOf(Stis.currentRocnik(td), 7, 1)!
      : period === "1r" ? ldMinusYears(td, 1)
        : period === "3r" ? ldMinusYears(td, 3)
          : LDATE_MIN;
  const f = pts.filter((x) => !(x[0] < from));
  return f.length >= 2 ? f : pts.slice(-30);
}

/** Hledání soupeře pro kalkulačku: nejdřív mezi soupeři z historie, pak na STIS. */
function OpponentFinder() {
  const [q, setQ] = useState("");
  const [stis, setStis] = useState<SearchPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const me = vm.meWithLive();
  const query = q.trim();
  const local = me && query.length >= 2 ? Stats.searchOpponents(me, query).slice(0, 8) : [];
  useEffect(() => {
    setStis([]); setErr(null);
    if (query.length < 3) return;
    const t = setTimeout(() => {
      setSearching(true);
      vm.searchPlayers(query, (r, e) => { setSearching(false); if (e) setErr(e); else setStis(r ?? []); });
    }, 700);
    return () => clearTimeout(t);
  }, [query]);
  if (!me) return null;
  const known = new Set(local.map((o) => o.id).filter((x) => x));
  const others = stis.filter((r) => r.id !== me.id && !known.has(r.id) && !Stats.opponents(me).some((o) => o.id === r.id)).slice(0, 15);
  const fromHistory = stis.filter((r) => !known.has(r.id)).map((r) => Stats.opponents(me).find((o) => o.id === r.id)).filter((x): x is NonNullable<typeof x> => !!x);
  const mine = [...local, ...fromHistory.filter((o) => !local.includes(o))];
  const myStr = me.currentStr;
  return (
    <div className="col g8">
      <TextField value={q} onChange={setQ} label="Jméno soupeře" icon="search" placeholder="např. Novák" />
      {query.length > 0 && query.length < 2 && <Muted text="Pište dál…" size={12} />}
      {mine.length > 0 && <Muted text="VAŠI SOUPEŘI" size={12} />}
      {mine.map((o) => (
        <div key={o.key} className="row g10 clickable" style={{ background: C.Tint, borderRadius: 10, padding: "8px 12px" }} onClick={() => vm.go({ t: "H2H", key: o.key })}>
          <Avatar text={o.name} color={C.Grey} size={32} />
          <div className="col w1">
            <T semi lines={1}>{o.name}</T>
            <Muted text={`${o.team}${o.lastStr != null ? ` · STR ${o.lastStr}` : ""} · vzájemně ${o.record}`} size={12} maxLines={1} />
          </div>
          {myStr != null && o.lastStr != null && <T bold color={StrModel.winProbability(myStr, o.lastStr) >= 0.5 ? C.Win : C.OrangeText}>{Stats.pct(StrModel.winProbability(myStr, o.lastStr))}</T>}
        </div>
      ))}
      {searching && <Loading text="Hledám na STIS…" />}
      {err && <Muted text={err} color={C.OrangeText} size={13} maxLines={3} />}
      {others.length > 0 && <Muted text="DALŠÍ HRÁČI NA STIS" size={12} />}
      {others.map((r) => (
        <div key={r.id} className="row g10 clickable" style={{ background: "#F0F2F5", borderRadius: 10, padding: "8px 12px" }}
          onClick={() => vm.go({ t: "Duel", aId: me.id, aName: me.name, bId: r.id, bName: r.name })}>
          <Avatar text={r.name} color={C.Grey} size={32} />
          <div className="col w1">
            <T semi lines={1}>{r.name + (r.birthYear != null ? ` (${r.birthYear})` : "")}</T>
            <Muted text={r.club || " "} size={12} maxLines={1} />
          </div>
          {myStr != null && r.str != null && r.str > 0 && <T bold color={StrModel.winProbability(myStr, r.str) >= 0.5 ? C.Win : C.OrangeText}>{Stats.pct(StrModel.winProbability(myStr, r.str))}</T>}
        </div>
      ))}
      {query.length >= 3 && !searching && !mine.length && !others.length && !err && stis.length === 0 && <Muted text="Nikoho jsem nenašel." size={13} />}
      <Muted text="Klepnutím otevřete vzájemné zápasy se šancí na výhru a změnou STR." size={12} />
    </div>
  );
}

export function StrScreen() {
  const me = vm.me;
  const nextOpp = (() => {
    const r = vm.next.find((c) => c.opponentRoster.length)?.opponentRoster.map((p) => p.str).filter((x): x is number => x != null) ?? [];
    return r.length ? Math.max(...r) : null;
  })();
  const [period, setPeriod] = useState("sez");
  const [oppText, setOppText] = useState(String(nextOpp ?? me?.currentStr ?? 0));
  const [calcMode, setCalcMode] = useState("str");
  if (!me) return <Loading />;
  const cur = me.currentStr ?? 0;
  const pts = strPoints(me, period);
  const remaining = Stats.estimateRemaining(me, vm.next.length ? sum(vm.next.map((c) => Stats.remainingTeamMatches(c.los))) : null);
  const until = vm.repo.seasonEnd(vm.next.flatMap((c) => c.los));
  const fc = Stats.forecast(me, remaining, until);
  const opp = /^\d+$/.test(oppText) ? parseInt(oppText, 10) : null;
  const change = pts.length ? cur - pts[0][1] : null;
  const liveGames = vm.myLiveGames();
  let prov: number | null = null;
  for (let i = liveGames.length - 1; i >= 0; i--) if (liveGames[i].strAfter != null) { prov = Math.round(liveGames[i].strAfter!); break; }
  const livePts = liveGames.map((g) => g.strAfter).filter((x): x is number => x != null).map((v) => Math.round(v));

  return (
    <div className="col g12 px16">
      <AppCard>
        <div className="rowb">
          <div className="col w1">
            <BigNumber text={`${prov ?? cur}`} color={prov != null ? C.Live : C.Ink} size={48} />
            {prov != null && <T semi size={13} color={C.Live}>odhad z probíhajícího utkání · oficiálně {cur}</T>}
            {change != null && <T semi color={C.delta(change)}>{change >= 0 ? "▲" : "▼"} {signedInt(change)} za zvolené období</T>}
          </div>
        </div>
        <Chips options={[["3m", "3 měsíce"], ["sez", "Sezóna"], ["1r", "1 rok"], ["3r", "3 roky"], ["vse", "Vše"]]} selected={period} onSelect={setPeriod} />
        {period === "vse" || period === "3r" ? <StrChart series={[{ color: C.Blue, points: pts }]} /> : <StrTimelineChart history={pts} live={livePts} forecast={fc} />}
        <Legend items={[[C.Blue, "oficiální STR"], ...(livePts.length ? [[C.Live, "probíhající utkání (odhad)"] as [string, string]] : []), [forecastColor(fc), "predikce a 80% pásmo"]]} />
        {livePts.length > 0 && <Muted text="Fialová část je odhad z online zápisu – STIS ji oficiálně přepočítá po skončení utkání." color={C.Live} size={12} />}
      </AppCard>
      {fc && (
        <>
          <TileRow>
            <StatTile label={`Konec sezóny ${DMY(until)}`} value={f0(fc.center)} sub={`80 %: ${f0(fc.low)} – ${f0(fc.high)}`}
              suffix={(() => { const d = Math.round(fc.center) - Math.round(fc.current); return { text: d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "±0", color: d > 0 ? C.Win : d < 0 ? C.OrangeText : C.Muted }; })()} />
            <StatTile label="Zbývá zápasů" value={`~${fc.remainingMatches}`} sub={`forma ${fc.formPerMatch >= 0 ? "+" : "−"}${dec1(Math.abs(fc.formPerMatch * 100))} % / zápas`} />
          </TileRow>
          <AppCard>
            <T bold>Jak predikce funguje</T>
            <Muted size={13} maxLines={8} text={"Model jsem ověřil na 547 historických případech: STR se chová skoro jako náhodná procházka, takže nejlepší odhad je " +
              "současná hodnota upravená podle formy (o kolik vyhráváte víc nebo míň, než říká STR). Pásmo ukazuje, kam se STR " +
              `s 80% pravděpodobností dostane po ~${fc.remainingMatches} zápasech.`} />
          </AppCard>
        </>
      )}
      <SectionTitle text="Kalkulačka zápasu" />
      <AppCard>
        <Segmented options={[["str", "Zadat STR"], ["find", "Najít soupeře"]]} selected={calcMode} onSelect={setCalcMode} />
        {calcMode === "find" ? <OpponentFinder /> : <TextField value={oppText} onChange={(v) => setOppText(v.replace(/\D/g, "").slice(0, 4))} label="STR soupeře" numeric />}
        {calcMode === "str" && opp != null && cur > 0 && (() => {
          const p = StrModel.winProbability(cur, opp);
          return (
            <>
              <div className="row"><T semi style={{ flex: 1 }}>Šance na výhru</T><BigNumber text={Stats.pct(p)} color={p >= 0.5 ? C.Win : C.OrangeText} size={22} /></div>
              <ProbBar p={p} />
              <TileRow>
                <StatTile label="Při výhře" value={"+" + StrModel.gainIfWin(cur, opp)} valueColor={C.Win} />
                <StatTile label="Při prohře" value={"−" + -StrModel.lossIfLose(cur, opp)} valueColor={C.OrangeText} />
              </TileRow>
              <Muted text="Změny STR podle oficiálního popisu eSTeR (lineárně podle rozdílu STR, celé body) – na 5 080 skutečných zápasech sedí 72 % přesně, průměrná odchylka 0,3 bodu. Šance na výhru je odhad podle rozdílu STR." size={12} />
            </>
          );
        })()}
      </AppCard>
      <SectionTitle text="STR podle STIS" />
      <AppCard>
        <KeyValue label="Aktuální STR" value={`${me.ster.str ?? cur}`} />
        {me.ster.stabil != null && <KeyValue label="Stabilní STR" value={dec1(me.ster.stabil)} />}
        {me.ster.min != null && <KeyValue label="Rozpětí (min…max)" value={`${me.ster.min} … ${me.ster.max}`} />}
        {me.ster.peak != null && <KeyValue label="Nejvyšší dosažené" value={`${me.ster.peak} (${me.ster.peakDate ?? ""})`} valueColor={C.Win} />}
      </AppCard>
      <SectionTitle text="Sezóny" />
      <AppCard>
        {Stats.seasons(vm.meWithLive() ?? me).slice(0, 12).map((s) => (
          <div className="row" key={s.year} style={{ padding: "4px 0" }}>
            <T semi style={{ width: 70, flex: "none" }}>{s.label}</T>
            <Muted text={`${s.wins}–${s.losses} · ${Stats.pct(s.success)}`} size={14} style={{ flex: 1 }} />
            <T bold style={{ width: 50, flex: "none" }}>{`${s.strEnd ?? "–"}`}</T>
            <T bold size={14} color={C.delta(s.change)} style={{ width: 44, flex: "none" }}>{signedInt(s.change)}</T>
          </div>
        ))}
      </AppCard>
      <div style={{ height: 8 }} />
    </div>
  );
}

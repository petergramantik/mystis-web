import { useState } from "react";
import { ModelLink } from "./Model";
import { vm } from "../../app/vm";
import { Stis, type PlayerPage } from "../../core/models";
import { Stats, sum } from "../../core/stats";
import { type LDate, LDATE_MIN, ldDay, ldMinusYears, ldMonth, ldOf, ldYear, today } from "../../core/dates";
import { AppCard, BigNumber, C, Chips, DMY, Legend, Muted, StatTile, StrChart, StrTimelineChart, T, forecastColor, TileRow, dec1, f0, signedInt } from "../components";

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

/** STR v profilu: graf s volbou období, predikce na konec sezóny (u mě i živý odhad z probíhajícího utkání). */
export function StrPanel({ p, isMe }: { p: PlayerPage; isMe: boolean }) {
  const [period, setPeriod] = useState("sez");
  const cur = p.currentStr ?? 0;
  const pts = strPoints(p, period);
  const myRemaining = isMe && vm.next.length ? sum(vm.next.map((c) => Stats.remainingTeamMatches(c.los))) : null;
  const remaining = Stats.estimateRemaining(p, myRemaining);
  const until = vm.repo.seasonEnd(vm.next.flatMap((c) => c.los));
  const fc = Stats.forecast(p, remaining, until);
  const change = pts.length ? cur - pts[0][1] : null;
  const liveGames = isMe ? vm.myLiveGames() : [];
  let prov: number | null = null;
  for (let i = liveGames.length - 1; i >= 0; i--) if (liveGames[i].strAfter != null) { prov = Math.round(liveGames[i].strAfter!); break; }
  const livePts = liveGames.map((g) => g.strAfter).filter((x): x is number => x != null).map((v) => Math.round(v));
  return (
    <>
      <AppCard>
        <div className="rowb">
          <div className="col w1">
            <BigNumber text={`${prov ?? cur}`} color={prov != null ? C.Live : C.Ink} size={40} />
            {prov != null && <T semi size={13} color={C.Live}>odhad z probíhajícího utkání · oficiálně {cur}</T>}
            {change != null && <T semi color={C.delta(change)}>{change >= 0 ? "▲" : "▼"} {signedInt(change)} za zvolené období</T>}
          </div>
        </div>
        <Chips options={[["3m", "3 měsíce"], ["sez", "Sezóna"], ["1r", "1 rok"], ["3r", "3 roky"], ["vse", "Vše"]]} selected={period} onSelect={setPeriod} />
        {period === "vse" || period === "3r" ? <StrChart series={[{ color: isMe ? C.Blue : C.Orange, points: pts }]} /> : <StrTimelineChart history={pts} live={livePts} forecast={fc} />}
        <Legend items={[[C.Blue, "oficiální STR"], ...(livePts.length ? [[C.Live, "probíhající utkání (odhad)"] as [string, string]] : []), ...(fc ? [[forecastColor(fc), "predikce a 80% pásmo"] as [string, string]] : [])]} />
        {livePts.length > 0 && <Muted text="Fialová část je odhad z online zápisu – STIS ji oficiálně přepočítá po skončení utkání." color={C.Live} size={12} />}
      </AppCard>
      {fc && (
        <>
          <TileRow>
            <StatTile label={`Konec sezóny ${DMY(until)}`} value={f0(fc.center)} sub={`80 %: ${f0(fc.low)} – ${f0(fc.high)}`}
              suffix={(() => { const d = Math.round(fc.center) - Math.round(fc.current); return { text: d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "±0", color: d > 0 ? C.Win : d < 0 ? C.OrangeText : C.Muted }; })()} />
            <StatTile label="Zbývá zápasů" value={`~${fc.remainingMatches}`} sub={`forma ${fc.formPerMatch >= 0 ? "+" : "−"}${dec1(Math.abs(fc.formPerMatch * 100))} % / zápas`} />
          </TileRow>
          <ModelLink section="str" />
        </>
      )}
    </>
  );
}

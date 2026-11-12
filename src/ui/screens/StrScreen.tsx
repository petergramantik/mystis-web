import { useState } from "react";
import { ModelLink } from "./Model";
import { vm } from "../../app/vm";
import { Stis, type PlayerPage } from "../../core/models";
import { Stats, sum } from "../../core/stats";
import { type LDate, LDATE_MIN, ldDay, ldMinusYears, ldMonth, ldOf, ldYear, today } from "../../core/dates";
import { AppCard, C, Chips, DMY, Legend, Muted, StatTile, StrChart, StrTimelineChart, T, forecastColor, TileRow, dec1, f0, signedInt } from "../components";

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
  // výchozí bod = hodnota na začátku období (poslední bod před ním), aby změna i graf začínaly od stejné hodnoty
  let anchor: [LDate, number] | null = null;
  for (const x of pts) if (x[0] < from) anchor = x;
  const r = anchor && from > LDATE_MIN ? [[from, anchor[1]] as [LDate, number], ...f] : f;
  return r.length >= 2 ? r : pts.slice(-30);
}

/** Změna STR za sezónu – stejná hodnota v hlavičce profilu i v panelu STR (období Sezóna). */
export function seasonChangeOf(p: PlayerPage): number | null {
  const v = vm.seasonStrChange(p);
  if (v != null) return v;
  const sez = strPoints(p, "sez");
  return sez.length >= 2 && p.currentStr != null ? p.currentStr - sez[0][1] : null;
}

/** STR v profilu: graf s volbou období, predikce na konec sezóny (u mě i živý odhad z probíhajícího utkání). */
export function StrPanel({ p, isMe, seasonChange }: { p: PlayerPage; isMe: boolean; seasonChange?: number | null }) {
  const [period, setPeriod] = useState("sez");
  const cur = p.currentStr ?? 0;
  const pts = strPoints(p, period);
  const myRemaining = isMe && vm.next.length ? sum(vm.next.map((c) => Stats.remainingTeamMatches(c.los))) : null;
  const remaining = Stats.estimateRemaining(p, myRemaining);
  const until = vm.repo.seasonEnd(vm.next.flatMap((c) => c.los));
  const fc = Stats.forecast(p, remaining, until);
  const change = period === "sez" && seasonChange !== undefined ? seasonChange : pts.length ? cur - pts[0][1] : null;
  const liveGames = isMe ? vm.myLiveGames() : [];
  let prov: number | null = null;
  for (let i = liveGames.length - 1; i >= 0; i--) if (liveGames[i].strAfter != null) { prov = Math.round(liveGames[i].strAfter!); break; }
  const livePts = liveGames.map((g) => g.strAfter).filter((x): x is number => x != null).map((v) => Math.round(v));
  return (
    <>
      <AppCard>
        <Chips options={[["sez", "Sezóna"], ["3m", "3 měsíce"], ["1r", "1 rok"], ["3r", "3 roky"], ["vse", "Vše"]]} selected={period} onSelect={setPeriod} />
        {change != null && <T semi color={C.delta(change)}>{change >= 0 ? "▲" : "▼"} {signedInt(change)} za zvolené období</T>}
        {prov != null && <T semi size={13} color={C.Live}>Odhad z probíhajícího utkání: {prov} · oficiálně {cur}</T>}
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

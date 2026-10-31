import { useEffect, useState } from "react";
import { vm, S } from "../../app/vm";
import { Stis, type PlayerPage, type TeamRoster } from "../../core/models";
import { Stats, distinctBy } from "../../core/stats";
import {
  AppCard, BigNumber, C, Chips, Divider, ErrorBox, Field, Legend, ListCard, Loading, Muted, Pill, SectionTitle, StrChart, T, signedInt,
} from "../components";
import { strPoints } from "./StrScreen";
import { TeamForecast } from "./NextMatch";

export function CaptainScreen() {
  const me = vm.me;
  const myTeamIds = me ? vm.repo.myTeams(me).map((t) => t.ref?.id).filter((x): x is string => !!x) : [];
  const base: TeamRoster[] = vm.club.rosters.length ? vm.club.rosters : vm.next.map((c) => ({ team: c.myTeam.ref, name: c.myTeam.name, players: c.myRoster }));
  const rosters = [...base].sort((a, b) => (myTeamIds.includes(a.team?.id ?? "") ? 0 : 1) - (myTeamIds.includes(b.team?.id ?? "") ? 0 : 1));
  const [sel, setSel] = useState(rosters.find((r) => myTeamIds.includes(r.team?.id ?? ""))?.team?.id ?? rosters[0]?.team?.id ?? "");
  if (!me) return <Loading />;
  if (!rosters.length) {
    return <div className="col g12 px16">{vm.loadingClub || vm.loadingNext ? <Loading text="Načítám soupisky…" /> : <ErrorBox text="Soupisky družstev nejsou k dispozici." onRetry={() => vm.loadClub(true)} />}</div>;
  }
  const roster0 = rosters.find((r) => r.team?.id === sel) ?? rosters[0];
  const roster = { ...roster0, players: vm.fresh(roster0.players) };
  const lineupP = vm.lineupFor(roster.name, roster.team, roster.players);
  const lineup = lineupP.map((x) => x[0]);
  const ctx = vm.next.find((c) => c.myTeam.ref?.id === roster.team?.id);
  return (
    <div className="col g12 px16">
      <Chips options={rosters.filter((r) => r.team?.id).map((r) => [r.team!.id, r.name])} selected={sel} onSelect={setSel} />
      <AppCard>
        <T bold size={17}>Doporučená sestava</T>
        <Muted size={13} maxLines={3} text="Stabilní hráči (aspoň třetina utkání družstva) podle STR a formy; chybějící místa doplní náhradníci s nejvíc odehranými utkáními." />
        {lineup.map((p, i) => (
          <div className="row g10" key={i}>
            <BigNumber text={`${i + 1}.`} color={C.Orange} size={20} style={{ width: 30, flex: "none" }} />
            <T semi style={{ flex: 1 }}>{p.name + (lineupP[i]?.[1] ? " (náhradník)" : "")}</T>
            <T bold>{`${p.str ?? "–"}`}</T>
            <T size={13} end color={C.delta(p.strChange)} style={{ width: 40, flex: "none" }}>{signedInt(p.strChange)}</T>
          </div>
        ))}
      </AppCard>
      {ctx?.next != null && ctx.opponentRoster.length > 0 && (
        <>
          <SectionTitle text={`Proti ${ctx.opponentName}`} action="Rozbor ›" onAction={() => vm.go(S.NextMatch)} />
          <TeamForecast me={me} minePick={lineupP} theirsPick={vm.lineupFor(ctx.opponentName, ctx.opponentRef, vm.fresh(ctx.opponentRoster))} fmt={vm.format} />
        </>
      )}
      <SectionTitle text="Celá soupiska" />
      <ListCard>
        <div className="row" style={{ padding: "8px 14px" }}>
          <Muted text="HRÁČ" size={12} style={{ flex: 1 }} />
          <Muted text="STR" size={12} style={{ width: 50 }} />
          <Muted text="±" size={12} style={{ width: 40 }} />
          <Muted text="ODEHRÁNO" size={12} style={{ width: 80 }} />
        </div>
        <Divider />
        {[...roster.players].sort((a, b) => (b.str ?? 0) - (a.str ?? 0)).map((p, i) => {
          const inLineup = lineup.some((x) => x.name === p.name);
          return (
            <div key={i}>
              <div className="row clickable" style={{ background: inLineup ? C.Tint : "#fff", padding: "10px 14px" }}
                onClick={() => { if (p.path) { if (p.id === me.id) vm.tab(S.Str); else vm.go({ t: "Player", path: p.path }); } }}>
                <div className="col w1">
                  <T semi lines={1}>{p.name}</T>
                  {p.ranking && <Muted text={p.ranking} size={12} maxLines={1} />}
                </div>
                <T bold style={{ width: 50, flex: "none" }}>{`${p.str ?? "–"}`}</T>
                <T size={13} color={C.delta(p.strChange)} style={{ width: 40, flex: "none" }}>{signedInt(p.strChange)}</T>
                <div className="col" style={{ width: 80, flex: "none" }}>
                  <T size={14}>{p.bilance != null ? `${p.played} dvouher` : "–"}</T>
                  {p.bilance && <Muted text={p.bilance} size={12} />}
                </div>
              </div>
              <Divider />
            </div>
          );
        })}
      </ListCard>
      <div className="row g8"><Pill text="modře = doporučená sestava" /></div>
      <div style={{ height: 8 }} />
    </div>
  );
}

const rate = (w: number, n: number) => (n === 0 ? null : w / n);
const cmp = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || a === b ? 0 : a > b ? 1 : -1);

function CompareRow({ label, a, b, better = 0, bold }: { label: string; a: string; b: string; better?: number; bold?: boolean }) {
  return (
    <div className="row" style={{ padding: "4px 0" }}>
      <Muted text={label} size={13} style={{ flex: 1 }} />
      <T size={14} end lines={1} bold={bold || better > 0} color={better > 0 ? C.Win : C.Ink} style={{ width: 100, flex: "none", paddingLeft: 6 }}>{a}</T>
      <T size={14} end lines={1} bold={bold || better < 0} color={better < 0 ? C.Win : C.Ink} style={{ width: 100, flex: "none", paddingLeft: 6 }}>{b}</T>
    </div>
  );
}

export function CompareScreen({ a0, b0 }: { a0: string | null; b0: string | null }) {
  const me = vm.me;
  const options: [string, string][] = me ? distinctBy([[me.path, `${me.name} (vy)`] as [string, string],
    ...vm.club.ladder.filter((e) => e.path != null && e.id !== me.id).map((e) => [e.path!, e.name] as [string, string])], (x) => x[0]) : [];
  const [a, setA] = useState(a0 ?? me?.path ?? "");
  const [b, setB] = useState(b0 ?? options[1]?.[0] ?? "");
  const [period, setPeriod] = useState("3r");
  const page = (p: string): PlayerPage | null => (me && p === me.path ? vm.meWithLive() ?? me : vm.players.get(p) ? vm.withLive(vm.players.get(p)!) : null);
  const pa = page(a), pb = page(b);
  useEffect(() => {
    if (!me) return;
    if (a !== me.path && a) vm.loadPlayer(a);
    if (b !== me.path && b) vm.loadPlayer(b);
  }, [a, b]);
  if (!me) return <Loading />;
  const nameOf = (p: string) => options.find((o) => o[0] === p)?.[1] ?? page(p)?.name ?? "Hráč";
  const opts = options.some((o) => o[0] === a) ? options : [...options, [a, nameOf(a)] as [string, string]];
  const opts2 = opts.some((o) => o[0] === b) || !b ? opts : [...opts, [b, nameOf(b)] as [string, string]];
  const season = Stis.currentRocnik();
  return (
    <div className="col g12 px16">
      <Field label="Hráč 1" value={a} options={opts2} onPick={setA} />
      <Field label="Hráč 2" value={b} options={opts2} onPick={setB} />
      {options.length < 2 && <Muted size={13} maxLines={4} text="Další hráče oddílu načtu z interního žebříčku (chvíli to trvá). Soupeře můžete porovnat i z obrazovky vzájemných zápasů." />}
      {!pa || !pb ? (b ? <Loading text="Načítám profily hráčů…" /> : null) : (() => {
        const sa = pa.chronological.filter((m) => m.season === season), sb = pb.chronological.filter((m) => m.season === season);
        const ra = Stats.records(pa), rb = Stats.records(pb);
        const fa = Stats.form(pa), fb = Stats.form(pb);
        const fiveA = pa.chronological.filter((m) => m.fiveSetter), fiveB = pb.chronological.filter((m) => m.fiveSetter);
        const w = (l: { won: boolean }[]) => l.filter((m) => m.won).length;
        const mutual = pa.chronological.filter((m) => m.opponentId && m.opponentId === pb.id);
        return (
          <>
            <AppCard>
              <Chips options={[["1r", "1 rok"], ["3r", "3 roky"], ["vse", "Vše"]]} selected={period} onSelect={setPeriod} />
              <StrChart series={[{ color: C.Blue, points: strPoints(pa, period) }, { color: C.Orange, points: strPoints(pb, period) }]} />
              <Legend items={[[C.Blue, pa.name], [C.Orange, pb.name]]} />
            </AppCard>
            <SectionTitle text="Srovnání" />
            <AppCard>
              <CompareRow label="" a={pa.name} b={pb.name} bold />
              <CompareRow label="STR" a={`${pa.currentStr ?? "–"}`} b={`${pb.currentStr ?? "–"}`} better={cmp(pa.currentStr, pb.currentStr)} />
              <CompareRow label="Nejvyšší STR" a={`${pa.ster.peak ?? "–"}`} b={`${pb.ster.peak ?? "–"}`} better={cmp(pa.ster.peak, pb.ster.peak)} />
              <CompareRow label="Sezóna" a={`${w(sa)}–${sa.length - w(sa)}`} b={`${w(sb)}–${sb.length - w(sb)}`} better={cmp(rate(w(sa), sa.length), rate(w(sb), sb.length))} />
              <CompareRow label="Kariéra" a={`${ra.wins}–${ra.losses}`} b={`${rb.wins}–${rb.losses}`} better={cmp(rate(ra.wins, ra.totalMatches), rate(rb.wins, rb.totalMatches))} />
              <CompareRow label="Nejdelší série výher" a={`${ra.longestWin.length}`} b={`${rb.longestWin.length}`} better={cmp(ra.longestWin.length, rb.longestWin.length)} />
              <CompareRow label="Forma (posl. 5)" a={`${fa.wins}–${fa.losses}`} b={`${fb.wins}–${fb.losses}`} better={cmp(fa.wins, fb.wins)} />
              <CompareRow label="Pětisetové" a={`${w(fiveA)}–${fiveA.length - w(fiveA)}`} b={`${w(fiveB)}–${fiveB.length - w(fiveB)}`} better={cmp(rate(w(fiveA), fiveA.length), rate(w(fiveB), fiveB.length))} />
            </AppCard>
            {mutual.length > 0 && (
              <>
                <SectionTitle text={`Vzájemně: ${w(mutual)}–${mutual.length - w(mutual)}`} />
                <AppCard>{[...mutual].reverse().map((m, i) => <Muted key={i} text={`${m.dateText} · ${m.score} · ${m.competition}`} color={C.Ink} size={14} maxLines={1} />)}</AppCard>
              </>
            )}
          </>
        );
      })()}
      <div style={{ height: 8 }} />
    </div>
  );
}

import { useEffect, useState } from "react";
import { vm } from "../../app/vm";
import { RosterPlayer, Stis, type PlayerPage, type TeamRef } from "../../core/models";
import { Stats } from "../../core/stats";
import { MatchFormats, type MatchFormat } from "../../core/live";
import { roundScore, type SearchClub } from "../../core/search";
import type { NextMatchContext } from "../../core/repository";
import {
  AppCard, Avatar, BigNumber, C, Chips, Divider, Empty, ErrorBox, ErrorWithDiagnostics, FormDots, ListCard, Loading, Muted, OButton,
  Pill, PrimaryButton, ProbBar, SectionTitle, T, TextField, dec1,
} from "../components";
import { fmtWhenLong } from "../fmt";
import { HallCard } from "../hall";

/** Rozbor dalšího (ne nejbližšího) budoucího utkání – stejný obsah jako Příští zápas. */
export function FixtureScreen({ team, round, home, away }: { team: number; round: string; home: string; away: string }) {
  const m = vm.fixtureMatch(team, round, home, away);
  useEffect(() => { if (m) vm.loadFixture(team, m); }, [team, round, home, away, !!m]);
  const me = vm.meWithLive();
  if (!me) return <Loading />;
  if (!m) return <div className="px16"><Empty text="Utkání jsem v rozpisu nenašel." /></div>;
  const ctx = vm.fixtures.get(vm.fixtureKey(team, m));
  if (!ctx) return <div className="px16"><MatchHeader ctx={{ ...vm.next[team], next: m, home: Stats.isHome(m, vm.next[team].myTeam.ref, vm.next[team].myTeam.name), opponentName: Stats.isHome(m, vm.next[team].myTeam.ref, vm.next[team].myTeam.name) ? m.away : m.home, liveNow: false }} /><Loading text="Načítám soupisku soupeře…" /></div>;
  return (
    <div className="col g12 px16">
      <MatchHeader ctx={ctx} />
        {ctx.next && <HallCard teamRef={ctx.home ? ctx.myTeam.ref : ctx.opponentRef} teamName={ctx.home ? ctx.myTeam.name : ctx.opponentName} />}
      <OpponentLoader ctx={ctx} />
      {!ctx.opponentRoster.length ? (
        <AppCard><Muted text="Soupisku soupeře se nepodařilo načíst." size={14} maxLines={4} /></AppCard>
      ) : (
        <>
          <TeamForecast me={me} minePick={vm.lineupFor(ctx.myTeam.name, ctx.myTeam.ref, vm.fresh(ctx.myRoster))}
            theirsPick={vm.lineupFor(ctx.opponentName, ctx.opponentRef, vm.fresh(ctx.opponentRoster))} fmt={vm.format} />
          <ScoutSection me={me} roster={vm.fresh(ctx.opponentRoster)} title={`Soupeři · ${ctx.opponentName}`} />
        </>
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}

export function NextMatchScreen() {
  const me = vm.meWithLive();
  if (!me) return <Loading />;
  const ctxs = vm.next;
  const selected = vm.nextSelected;
  let body;
  if (vm.loadingNext && !ctxs.length) body = <Loading text="Hledám příští utkání a soupisky soupeřů…" />;
  else if (!ctxs.length) body = <ErrorBox text="Nenašel jsem žádné vaše družstvo v aktuální sezóně." onRetry={() => vm.loadNext(true)} />;
  else {
    const idx = Math.max(0, Math.min(ctxs.length - 1, selected));
    const ctx = ctxs[idx];
    body = (
      <>
        {ctxs.length > 1 && <Chips options={ctxs.map((c, i) => [String(i), c.myTeam.name])} selected={String(selected)} onSelect={(k) => vm.selectTeam(parseInt(k, 10))} />}
        <MatchHeader ctx={ctx} />
        {ctx.next && <HallCard teamRef={ctx.home ? ctx.myTeam.ref : ctx.opponentRef} teamName={ctx.home ? ctx.myTeam.name : ctx.opponentName} />}
        <OpponentLoader ctx={ctx} />
        {ctx.next != null && (
          <>
            <PrimaryButton text={ctx.liveNow ? "Utkání probíhá – živé sledování" : "Zápas začíná – zadat sestavy"} onClick={() => vm.go({ t: "Live", team: idx })} full />
            {!ctx.opponentRoster.length ? (
              <AppCard><Muted text="Soupisku soupeře se nepodařilo načíst. Zkuste níže načíst družstvo ručně." size={14} maxLines={4} /></AppCard>
            ) : (
              <>
                <TeamForecast me={me} minePick={vm.lineupFor(ctx.myTeam.name, ctx.myTeam.ref, vm.fresh(ctx.myRoster))}
                  theirsPick={vm.lineupFor(ctx.opponentName, ctx.opponentRef, vm.fresh(ctx.opponentRoster))} fmt={vm.format} />
                <ScoutSection me={me} roster={vm.fresh(ctx.opponentRoster)} title={`Soupeři · ${ctx.opponentName}`} />
              </>
            )}
          </>
        )}
        <OtherClubSection me={me} ctx={ctx} />
      </>
    );
  }
  return <div className="col g12 px16">{body}<div style={{ height: 8 }} /></div>;
}

/** Aktuální STR a forma soupeřů (STR na soupisce je ze dne schválení soupisky). */
function OpponentLoader({ ctx }: { ctx: NextMatchContext }) {
  useEffect(() => {
    ctx.opponentRoster.map((p) => p.path).filter((x): x is string => !!x).slice(0, 12).forEach((p) => vm.loadPlayer(p));
    if (ctx.opponentRef) vm.loadTeamLos(ctx.opponentRef);
  }, [ctx.opponentName]);
  return null;
}

function MatchHeader({ ctx }: { ctx: NextMatchContext }) {
  const n = ctx.next;
  if (!n) return (
    <AppCard>
      <Muted text={ctx.myTeam.competition ?? ctx.myTeam.name} size={13} />
      <T bold>{ctx.myTeam.name}: žádné nadcházející utkání v rozpisu</T>
    </AppCard>
  );
  const played = ctx.los.filter((m) => m.played);
  return (
    <AppCard>
      <Muted text={ctx.myTeam.competition ?? ctx.myTeam.name} size={13} />
      <div className="row">
        <div className="col w1"><T bold size={17}>{ctx.home ? ctx.myTeam.name : ctx.opponentName}</T><Muted text="domácí" size={12} /></div>
        <T bold color={C.Muted} style={{ padding: "0 8px" }}>vs</T>
        <div className="col w1" style={{ alignItems: "flex-end" }}><T bold size={17} end>{ctx.home ? ctx.opponentName : ctx.myTeam.name}</T><Muted text="hosté" size={12} /></div>
      </div>
      <div className="row g8">
        <Pill text={ctx.home ? "Hrajete doma" : "Hrajete venku"} />
        <Pill text={`${n.round}. kolo`} bg="#F0F2F5" fg={C.Ink} />
      </div>
      <T semi>{n.dateTime != null ? fmtWhenLong(n.dateTime) : n.dateText}</T>
      {played.length > 0 && <Muted text={`Odehráno ${played.length} z ${ctx.los.length} kol`} size={12} />}
    </AppCard>
  );
}

/** Očekávaný výsledek utkání: doporučená sestava proti pravděpodobné sestavě soupeře. */
export function TeamForecast({ me, minePick, theirsPick, fmt = MatchFormats.DEFAULT }: { me: PlayerPage; minePick: [RosterPlayer, boolean][]; theirsPick: [RosterPlayer, boolean][]; fmt?: MatchFormat }) {
  const mineP: [RosterPlayer, boolean][] = minePick.length ? minePick
    : me.currentStr != null ? [[new RosterPlayer(me.id, me.path, me.name, 1, null, null, me.currentStr, null, null, "", null), false]] : [];
  const mine = mineP.map((x) => x[0]);
  const theirs = theirsPick.map((x) => x[0]);
  if (!mine.length || !theirs.length) return null;
  const exp = Stats.expectedTeamScore(mine.map((p) => [p.name, p.str ?? 0]), theirs.map((p) => p.str ?? 0), fmt.doubles);
  const [my, op] = roundScore(exp.my, exp.opp);
  const label = (p: [RosterPlayer, boolean]) => `${p[0].name.split(" ")[0]} ${p[0].str ?? ""}` + (p[1] ? " (náhradník)" : "");
  return (
    <AppCard>
      <div className="row"><T bold style={{ flex: 1 }}>Očekávaný výsledek</T><BigNumber text={`${my} : ${op}`} color={my > op ? C.Win : my < op ? C.OrangeText : C.Ink} size={26} /></div>
      <ProbBar p={exp.my / exp.games} />
      <Muted text={`Vaše sestava: ${mineP.map(label).join(", ")}`} size={13} maxLines={3} />
      <Muted text={`Pravděpodobná sestava soupeře: ${theirsPick.map(label).join(", ")}`} size={13} maxLines={3} />
      {exp.perPlayer.map(([name, w]) => (
        <div className="row" key={name}>
          <Muted text={name} color={C.Ink} size={14} maxLines={1} style={{ flex: 1 }} />
          <T semi size={14}>{`${Math.round(w)} z ${theirs.length}`}</T>
        </div>
      ))}
      <Muted size={12} maxLines={4} text={`Sestavy: stabilní hráči (aspoň třetina utkání družstva), doplnění náhradníky s nejvíc utkáními. Každý s každým (${mine.length}×${theirs.length} dvouher) + ${fmt.doubles} ${fmt.doubles === 1 ? "čtyřhra" : "čtyřhry"}, pravděpodobnosti podle STR.`} />
    </AppCard>
  );
}

export function ScoutSection({ me, roster, title }: { me: PlayerPage; roster: RosterPlayer[]; title: string }) {
  const scouts = Stats.scout(me, roster);
  const withPaths = roster.map((p) => p.path).filter((x): x is string => !!x);
  const anyLoaded = withPaths.some((p) => vm.players.has(p));
  return (
    <>
      <SectionTitle text={title} action={!anyLoaded && withPaths.length ? "Načíst formu" : null} onAction={() => withPaths.forEach((p) => vm.loadPlayer(p))} />
      <ListCard>
        {!scouts.length && <Empty text="Soupiska je prázdná." />}
        {scouts.map((s, i) => {
          const page = s.player.path ? vm.players.get(s.player.path) : undefined;
          const loading = s.player.path ? vm.loadingPlayers.get(s.player.path) === true : false;
          return (
            <div key={i}>
              <div className="row g12 clickable" style={{ padding: "11px 14px" }} onClick={() => {
                if (s.h2h) vm.go({ t: "H2H", key: s.h2h.key });
                else if (s.player.path) vm.go({ t: "Player", path: s.player.path });
              }}>
                <Avatar text={s.player.name} color={C.Grey} size={40} />
                <div className="col w1" style={{ gap: 3 }}>
                  <T semi size={16} lines={1}>{s.player.name}</T>
                  <Muted maxLines={2} text={[s.player.str != null ? `STR ${s.player.str}` : null,
                    s.player.bilance && s.player.played > 0 ? `sezóna ${s.player.bilance}` : null,
                    s.h2h ? `vzájemně ${s.h2h.record}` : "zatím jste nehráli"].filter((x) => x).join(" · ")} />
                  {page ? <FormDots results={Stats.form(page).last.map((m) => m.won)} /> : loading ? <Muted text="načítám formu…" size={12} /> : null}
                </div>
                <div className="col" style={{ alignItems: "flex-end" }}>
                  {s.winProb != null && <BigNumber text={Stats.pct(s.winProb)} color={s.winProb >= 0.5 ? C.Win : C.OrangeText} size={20} />}
                  {s.gain != null && s.loss != null && <Muted text={`+${s.gain} / −${-s.loss}`} size={12} maxLines={1} />}
                </div>
              </div>
              <Divider />
            </div>
          );
        })}
      </ListCard>
      <Muted text="Procento = vaše šance na výhru podle STR. +/− = změna vašeho STR při výhře/prohře." size={12} maxLines={3} />
    </>
  );
}

function OtherClubSection({ me, ctx }: { me: PlayerPage; ctx: NextMatchContext }) {
  const [input, setInput] = useState("");
  const [compTeams, setCompTeams] = useState<TeamRef[]>([]);
  const [loadingComp, setLoadingComp] = useState(false);
  const [clubResults, setClubResults] = useState<SearchClub[]>([]);
  const [clubSearching, setClubSearching] = useState(false);
  const [clubErr, setClubErr] = useState<string | null>(null);
  const [clubDiag, setClubDiag] = useState<string | null>(null);
  const ref = ctx.myTeam.ref;
  const other = vm.otherRoster;
  useEffect(() => {
    other?.players.map((p) => p.path).filter((x): x is string => !!x).slice(0, 12).forEach((p) => vm.loadPlayer(p));
    if (other?.team) vm.loadTeamLos(other.team);
  }, [other?.team?.id]);
  const submit = () => {
    setClubResults([]); setClubErr(null); setClubDiag(null);
    if (Stis.normalizeInput(input) != null || /^\d+$/.test(input.trim())) vm.loadOther(input);
    else {
      setClubSearching(true);
      vm.searchClubs(input.trim(), (found, e) => {
        setClubSearching(false);
        const list = found ?? [];
        if (e != null) { setClubErr(e); setClubDiag(vm.searchInfo()); }
        else if (!list.length) { setClubErr(`Oddíl „${input.trim()}“ jsem na STIS nenašel.`); setClubDiag(vm.searchInfo()); }
        else if (list.length === 1) vm.loadOther(list[0].path);
        else setClubResults(list);
      });
    }
  };
  const enabled = !!input.trim() && !vm.loadingOther && !clubSearching;
  return (
    <>
      <SectionTitle text="Načíst jiný klub / oddíl" />
      <AppCard>
        <Muted text="Vyberte družstvo ze soutěže, napište název oddílu (např. Ježov), nebo vložte odkaz na oddíl, družstvo či hráče ze STIS." size={14} maxLines={4} />
        {ref && (!compTeams.length ? (
          <div><OButton text={loadingComp ? "Načítám…" : `Družstva v soutěži ${ctx.myTeam.competition ?? ""}`} onClick={() => {
            setLoadingComp(true);
            vm.competitionTeams(ref, (l) => { setCompTeams(l.filter((t) => t.id !== ref.id)); setLoadingComp(false); });
          }} /></div>
        ) : (
          <Chips options={compTeams.map((t) => [t.id, t.name])} selected={vm.otherRoster?.team?.id ?? ""} onSelect={(id) => { const t = compTeams.find((x) => x.id === id); if (t) vm.pickOtherTeam(t); }} />
        ))}
        <TextField value={input} onChange={setInput} label="Název oddílu nebo odkaz" placeholder="např. Ježov" onEnter={() => enabled && submit()} />
        <div className="row g8">
          <PrimaryButton text={clubSearching ? "Hledám…" : "Načíst"} onClick={submit} enabled={enabled} />
          {(vm.otherRoster != null || vm.otherTeams.length > 0) && <OButton text="Zrušit" onClick={() => { vm.clearOther(); setInput(""); }} />}
        </div>
        {clubErr && <ErrorWithDiagnostics message={clubErr} diagnostics={clubDiag} />}
        {clubResults.length > 0 && (
          <>
            <Muted text="Nalezené oddíly – vyberte:" size={13} />
            <Chips options={clubResults.slice(0, 40).map((c) => [c.path, c.name])} selected="" onSelect={(p) => { setClubResults([]); vm.loadOther(p); }} />
          </>
        )}
        {vm.otherError && <Muted text={vm.otherError} color={C.OrangeText} size={14} maxLines={4} />}
        {vm.loadingOther && <Loading text="Načítám…" />}
        {vm.otherClub && <T bold>{vm.otherClub.name}</T>}
        {(vm.otherTeams.length > 1 || (vm.otherTeams.length === 1 && vm.otherRoster == null)) && (
          <Chips options={vm.otherTeams.map((t) => [t.id, t.name || `Družstvo ${t.id}`])} selected={vm.otherRoster?.team?.id ?? ""}
            onSelect={(id) => { const t = vm.otherTeams.find((x) => x.id === id); if (t) vm.pickOtherTeam(t); }} />
        )}
      </AppCard>
      {other && other.players.length > 0 && (
        <>
          <TeamForecast me={me} minePick={vm.lineupFor(ctx.myTeam.name, ctx.myTeam.ref, vm.fresh(ctx.myRoster))}
            theirsPick={vm.lineupFor(other.name, other.team, vm.fresh(other.players))} fmt={vm.format} />
          <ScoutSection me={me} roster={vm.fresh(other.players)} title={other.name} />
        </>
      )}
    </>
  );
}

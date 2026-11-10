import { useEffect, useState, type ReactNode } from "react";
import { vm } from "../../app/vm";
import { RosterPlayer, Stis, type PlayerPage, type TeamRef } from "../../core/models";
import { Stats } from "../../core/stats";
import { MatchFormats, type MatchFormat } from "../../core/live";
import { type SearchClub } from "../../core/search";
import { matchForecast } from "../../core/season";
import type { NextMatchContext } from "../../core/repository";
import {
  AppCard, Spinner, Avatar, BigNumber, C, Chips, Divider, Empty, ErrorBox, ErrorWithDiagnostics, FormDots, ListCard, Loading, Muted, OButton,
  Pill, PrimaryButton, ProbBar, SectionTitle, T, TextField, dec1,
} from "../components";
import { fmtWhenLong } from "../fmt";
import { HallCard } from "../hall";
import { shareLink, predictionLink, decodePred, type SharedPred } from "../share";
import { ShareSheet, type ShareOpt } from "../shareActions";

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
            theirsPick={vm.lineupFor(ctx.opponentName, ctx.opponentRef, vm.fresh(ctx.opponentRoster))} fmt={vm.format}
                  theirRoster={ctx.opponentRoster} theirRef={ctx.opponentRef} home={ctx.home} ctx={ctx} />
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
                  theirsPick={vm.lineupFor(ctx.opponentName, ctx.opponentRef, vm.fresh(ctx.opponentRoster))} fmt={vm.format}
                  theirRoster={ctx.opponentRoster} theirRef={ctx.opponentRef} home={ctx.home} ctx={ctx} />
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
  const oppRef = ctx.opponentRef;
  const openOpp = oppRef ? () => vm.openTeam({ ...oppRef, name: ctx.opponentName }, ctx.myTeam.competition ?? "") : undefined;
  const oppName = <span className={openOpp ? "clickable" : undefined} onClick={openOpp}>{ctx.opponentName + (openOpp ? " ›" : "")}</span>;
  return (
    <AppCard>
      <Muted text={ctx.myTeam.competition ?? ctx.myTeam.name} size={13} />
      <div className="row">
        <div className="col w1"><T bold size={17}>{ctx.home ? ctx.myTeam.name : oppName}</T><Muted text="domácí" size={12} /></div>
        <T bold color={C.Muted} style={{ padding: "0 8px" }}>vs</T>
        <div className="col w1" style={{ alignItems: "flex-end" }}><T bold size={17} end>{ctx.home ? oppName : ctx.myTeam.name}</T><Muted text="hosté" size={12} /></div>
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
export function TeamForecast({ me, minePick, theirsPick, fmt = MatchFormats.DEFAULT, theirRoster = [], theirRef = null, home = null, ctx = null }: {
  me: PlayerPage; minePick: [RosterPlayer, boolean][]; theirsPick: [RosterPlayer, boolean][]; fmt?: MatchFormat; theirRoster?: RosterPlayer[]; theirRef?: TeamRef | null;
  /** příští utkání – umožní sdílet predikci */
  ctx?: NextMatchContext | null;
  /** hraje moje družstvo doma? (null = neznámé, skóre pak vy : soupeř) */
  home?: boolean | null;
}) {
  const rs = vm.refineState(theirRoster, theirRef);
  const [shareOpen, setShareOpen] = useState(false);
  const mineP: [RosterPlayer, boolean][] = minePick.length ? minePick
    : me.currentStr != null ? [[new RosterPlayer(me.id, me.path, me.name, 1, null, null, me.currentStr, null, null, "", null), false]] : [];
  const mine = mineP.map((x) => x[0]);
  const theirs = theirsPick.map((x) => x[0]);
  if (!mine.length || !theirs.length) return null;
  const exp = Stats.expectedTeamScore(mine.map((p) => [p.name, p.str ?? 0]), theirs.map((p) => p.str ?? 0), fmt.doubles);
  // nejpravděpodobnější konečný výsledek (hraje se do cíle, proto ne zaokrouhlený součet všech her)
  const fc = matchForecast(mine.map((p) => p.str ?? 1400), theirs.map((p) => p.str ?? 1400), fmt);
  const [my, op] = fc.likely;
  const [hs, as_] = home === false ? [op, my] : [my, op];
  const label = (p: [RosterPlayer, boolean]) => `${p[0].name.split(" ")[0]} ${p[0].str ?? ""}` + (p[1] ? " (náhradník)" : "");
  return (
    <AppCard>
      <div className="row g8">
        <div className="col w1">
          <T bold>{my > op ? "Predikce: výhra" : my < op ? "Predikce: prohra" : "Predikce: remíza"}</T>
          <Muted size={12} text={`${home == null ? "vy : soupeř" : "domácí : hosté"} · výhra ${Stats.pct(fc.pWin)}, remíza ${Stats.pct(fc.pDraw)}, prohra ${Stats.pct(fc.pLoss)}`} maxLines={2} />
        </div>
        {rs.busy && <Spinner size={18} width={2} />}
        <BigNumber text={`${hs} : ${as_}`} color={rs.busy ? C.Muted : my > op ? C.Win : my < op ? C.OrangeText : C.Ink} size={26} />
      </div>
      {rs.busy && <Muted color={C.Blue} size={12} text={`Upřesňuji sestavy… ${rs.total ? `(načteno ${rs.done} z ${rs.total} hráčů) · ` : ""}předběžný odhad`} />}
      <div style={{ opacity: rs.busy ? 0.55 : 1, transition: "opacity .2s" }}><ProbBar p={exp.my / exp.games} /></div>
      <Muted text={`Vaše sestava: ${mineP.map(label).join(", ")}`} size={13} maxLines={3} />
      <Muted text={`Pravděpodobná sestava soupeře: ${theirsPick.map(label).join(", ")}`} size={13} maxLines={3} />
      {exp.perPlayer.map(([name, w]) => (
        <div className="row" key={name}>
          <Muted text={name} color={C.Ink} size={14} maxLines={1} style={{ flex: 1 }} />
          <T semi size={14}>{`${Math.round(w)} z ${theirs.length}`}</T>
        </div>
      ))}
      {ctx?.next && <button className="textbtn" style={{ alignSelf: "flex-start" }} onClick={() => setShareOpen(true)}>Sdílet predikci ›</button>}
      {ctx?.next && shareOpen && (() => {
        const n = ctx.next!;
        const [hn, an] = ctx.home ? [ctx.myTeam.name, ctx.opponentName] : [ctx.opponentName, ctx.myTeam.name];
        const when0 = n.dateTime != null ? fmtWhenLong(n.dateTime) : n.dateText;
        const when = when0 ? when0.charAt(0).toLowerCase() + when0.slice(1) : "";
        const res = my > op ? "výhra" : my < op ? "prohra" : "remíza";
        const text = [`Příští utkání: ${hn} – ${an}${n.round ? ` (${n.round}. kolo)` : ""}${when ? `, ${when}` : ""}`,
          `Predikce MySTIS: ${res} ${hs}:${as_} · výhra ${Stats.pct(fc.pWin)}, remíza ${Stats.pct(fc.pDraw)}, prohra ${Stats.pct(fc.pLoss)}`,
          `Naše sestava: ${mineP.map(label).join(", ")}`,
          `Soupeř: ${theirsPick.map(label).join(", ")}`].join("\n");
        const ref = ctx.myTeam.ref;
        const side = (l: [RosterPlayer, boolean][]) => l.map(([p]) => [p.id, p.name, p.str] as [string | null, string, number | null]);
        const mineT = { n: ctx.myTeam.name, id: ref?.id ?? null }, oppT = { n: ctx.opponentName, id: ctx.opponentRef?.id ?? null };
        const data: SharedPred | null = ref ? {
          s: ref.svaz, r: ref.rocnik, c: ref.soutez, cl: ctx.myTeam.competition ?? "", k: n.round, t: n.dateTime, dt: n.dateText, f: { p: fmt.players, g: fmt.games, d: fmt.doubles, t: fmt.target, l: fmt.label },
          h: ctx.home ? mineT : oppT, a: ctx.home ? oppT : mineT, hp: side(ctx.home ? mineP : theirsPick), ap: side(ctx.home ? theirsPick : mineP),
        } : null;
        const opts: ShareOpt[] = [
          { label: "Text", sub: "Termín, odhad výsledku a sestavy jako zpráva", icon: "list", run: () => shareLink(`${hn} – ${an}`, text) },
          ...(data ? [{ label: "Odkaz", sub: "Predikce v aplikaci – otevře ji i člověk bez profilu", icon: "share", run: () => shareLink(`Predikce: ${hn} – ${an}`, `Predikce: ${hn} – ${an}`, predictionLink(data)) }] : []),
        ];
        return <ShareSheet opts={opts} onClose={() => setShareOpen(false)} />;
      })()}
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
            theirsPick={vm.lineupFor(other.name, other.team, vm.fresh(other.players))} fmt={vm.format}
            theirRoster={other.players} theirRef={other.team} />
          <ScoutSection me={me} roster={vm.fresh(other.players)} title={other.name} />
        </>
      )}
    </>
  );
}

/** Sdílená predikce utkání (odkaz ?pr=): přepočet podle aktuálního STR, i bez nastavené aplikace. */
export function PredictionScreen({ data }: { data: string }) {
  const d = decodePred(data);
  const comp = d ? { svaz: d.s, rocnik: d.r, soutez: d.c } : null;
  const pathOf = (id: string | null) => (id && d ? `/hrac-${id}/svaz-${d.s}/rocnik-${Stis.currentRocnik()}` : null);
  useEffect(() => {
    if (!d || !comp) return;
    vm.loadCompLos(comp);
    vm.requestPlayers([...d.hp, ...d.ap].map((p) => pathOf(p[0])).filter((x): x is string => !!x));
  }, [data]);
  if (!d || !comp) return <div className="px16"><Empty text="Odkaz na predikci je neplatný nebo poškozený." /></div>;
  const fmt: MatchFormat = typeof d.f === "object" && d.f ? { key: "shared", label: d.f.l, players: d.f.p, games: d.f.g, doubles: d.f.d, target: d.f.t }
    : MatchFormats.ALL.find((x) => x.key === d.f) ?? MatchFormats.DEFAULT;
  const strNow = (p: [string | null, string, number | null]) => {
    const path = pathOf(p[0]);
    const pg = path ? (vm.me?.path === path || vm.me?.id === p[0] ? vm.me : vm.players.get(path)) : undefined;
    return pg?.currentStr ?? p[2];
  };
  const loading = [...d.hp, ...d.ap].filter((p) => { const x = pathOf(p[0]); return x && !vm.players.has(x) && vm.loadingPlayers.get(x) !== false && vm.me?.id !== p[0]; }).length;
  const hs = d.hp.map(strNow), as_ = d.ap.map(strNow);
  const fc = matchForecast(hs.map((x) => x ?? 1400), as_.map((x) => x ?? 1400), fmt);
  const [lh, la] = fc.likely;
  // stav utkání podle rozpisu soutěže
  const los = vm.compLos.get(vm.compKey(comp)) ?? [];
  const f = (x: string) => Stats.fold(x);
  const m = los.find((x) => x.round === d.k && ((d.h.id && x.homeRef?.id === d.h.id) || f(x.home) === f(d.h.n)) && ((d.a.id && x.awayRef?.id === d.a.id) || f(x.away) === f(d.a.n)));
  const st = m ? vm.boardStatus(comp, m) : null;
  const mineIdx = vm.next.findIndex((c) => c.myTeam.ref?.id && (c.myTeam.ref.id === d.h.id || c.myTeam.ref.id === d.a.id));
  const when0 = d.t != null ? fmtWhenLong(d.t) : d.dt;
  const team = (t: { n: string; id: string | null }) => (t.id ? () => vm.openTeam({ id: t.id!, name: t.n, svaz: d.s, rocnik: d.r, soutez: d.c }, d.cl) : undefined);
  const lineup = (title: string, ps: [string | null, string, number | null][], strs: (number | null)[]) => (
    <AppCard>
      <T bold>{title}</T>
      {ps.map((p, i) => {
        const go = p[0] ? () => vm.go({ t: "Player", path: pathOf(p[0])! }) : null;
        return (
          <div key={i} className={"row" + (go ? " clickable" : "")} style={{ padding: "3px 0" }} onClick={go ?? undefined}>
            <T semi size={14} lines={1} style={{ flex: 1 }}>{p[1]}{go && <span style={{ color: C.Muted }}> ›</span>}</T>
            <T bold size={14}>{strs[i] != null ? String(strs[i]) : "–"}</T>
          </div>
        );
      })}
    </AppCard>
  );
  return (
    <div className="col g12">
      <NavyHeaderLite>
        <Muted text={[d.cl, d.k ? `${d.k}. kolo` : null, when0].filter((x) => x).join(" · ")} color={C.MutedOnNavy} size={13} maxLines={2} />
        <div className="row g8" style={{ alignItems: "center" }}>
          <T bold size={17} color="#fff" lines={2} style={{ flex: 1 }}><span className={team(d.h) ? "clickable" : undefined} onClick={team(d.h)}>{d.h.n}</span></T>
          <div className="col" style={{ alignItems: "center", flex: "none" }}>
            <BigNumber text={`${lh} : ${la}`} color="#fff" size={34} style={{ whiteSpace: "nowrap" }} />
            <Muted text="nejpravděpodobněji" color={C.MutedOnNavy} size={11} />
          </div>
          <T bold size={17} color="#fff" lines={2} end style={{ flex: 1 }}><span className={team(d.a) ? "clickable" : undefined} onClick={team(d.a)}>{d.a.n}</span></T>
        </div>
        <Muted text={`výhra domácích ${Stats.pct(fc.pWin)} · remíza ${Stats.pct(fc.pDraw)} · výhra hostů ${Stats.pct(fc.pLoss)}`} color="#fff" size={13} maxLines={2} />
        <ProbBar p={fc.pWin + fc.pDraw / 2} />
        <Muted text={loading ? `Načítám aktuální STR hráčů… (${loading})` : "Podle STR hráčů k dnešnímu dni."} color={C.MutedOnNavy} size={12} />
      </NavyHeaderLite>
      <div className="col g12 px16">
        {st?.kind === "live" && m?.zapisPath && <AppCard bg={C.Live} onClick={() => vm.go({ t: "Shared", path: m.zapisPath })}><T bold color="#fff">{`● Utkání se už hraje (${st.text}) – sledovat živě ›`}</T></AppCard>}
        {st?.kind === "done" && m?.zapisPath && <AppCard bg={C.Navy} onClick={() => vm.go({ t: "ZapisDetail", path: m.zapisPath, myTeam: mineIdx >= 0 ? vm.next[mineIdx].myTeam.name : "" })}><T bold color="#fff">{`✓ Dohráno ${st.text} – zápis ›`}</T></AppCard>}
        {mineIdx >= 0 && !vm.guest && <OButton text="Otevřít můj Příští zápas ›" onClick={() => { vm.nextSelected = mineIdx; vm.go({ t: "NextMatch" }); }} />}
        {lineup(`Domácí: ${d.h.n}`, d.hp, hs)}
        {lineup(`Hosté: ${d.a.n}`, d.ap, as_)}
        <Muted size={12} maxLines={4} text={`Formát: ${fmt.label}. Sestavy podle toho, kdo predikci sdílel; šance se počítají ze STR systémem eSTeR.`} />
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

function NavyHeaderLite({ children }: { children: ReactNode }) { return <div className="header"><div className="col g8">{children}</div></div>; }

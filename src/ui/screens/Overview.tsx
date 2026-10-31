import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { vm, S } from "../../app/vm";
import { Clubs, Stis, type LosMatch } from "../../core/models";
import { Stats, StrModel, sum } from "../../core/stats";
import { matchForecast } from "../../core/season";
import { Live } from "../../core/live";
import type { NextMatchContext } from "../../core/repository";
import { roundScore, type SearchPlayer } from "../../core/search";
import {
  AppCard, Avatar, BigNumber, C, Chips, Marquee, Dialog, Empty, ErrorBox, ErrorWithDiagnostics, FormDots, Icon, ListCard, Loading, MatchRow,
  Muted, NavyHeader, Pill, PrimaryButton, ProbBar, ResultBadge, SectionTitle, Sparkline, Spinner, StatTile, T, TextField, TileRow, dec1, f0, signedInt,
} from "../components";
import { fmtDMYdt, fmtWhenShort } from "../fmt";
import { ProxySetup } from "./Records";
import { InstallBanner, InstallButton } from "../install";
import { useZapisRefresh } from "../zapis";

export function OnboardingScreen() {
  return (
    <div className="onboard">
      <div style={{ height: 40 }} />
      <div style={{ width: 64, height: 64, borderRadius: 32, background: C.Blue, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 16, height: 16, borderRadius: 8, background: C.Orange }} />
      </div>
      <BigNumber text="MySTIS" color="#fff" size={40} />
      <T size={17} color={C.MutedOnNavy}>Statistiky, žebříček oddílu a predikce STR – data přímo ze STIS.</T>
      {!vm.prefs.proxyUrl && <ProxySetup />}
      <AppCard>
        <T bold size={18}>Kdo jste?</T>
        <Muted text="Napište své jméno (aplikace vás najde na STIS), nebo vložte odkaz na svou stránku hráče či číslo hráče." size={14} maxLines={5} />
        <ProfileInput dark={false} buttonText="Načíst moje statistiky" onDone={() => {}} />
      </AppCard>
      <InstallButton />
      <Muted text="Aplikace čte veřejné stránky STIS (stejně jako prohlížeč), šetrně a s ukládáním do mezipaměti. Bez připojení ukáže poslední stažená data." color={C.MutedOnNavy} size={13} maxLines={5} />
    </div>
  );
}

export function OverviewScreen() {
  const me = vm.me;
  const [switching, setSwitching] = useState(false);
  if (me == null) {
    return <div style={{ padding: 16 }}>{vm.loadingMe ? <Loading /> : <ErrorBox text={vm.error ?? "Data zatím nejsou načtená."} onRetry={() => vm.loadMe(true)} />}</div>;
  }
  const season = me.matches.length ? Math.max(...me.matches.map((m) => m.season)) : Stis.currentRocnik();
  const meL = vm.meWithLive() ?? me;
  const seasonMatches = meL.chronological.filter((m) => m.season === season);
  const start = seasonMatches[0]?.strBefore ?? null;
  const cur = me.currentStr;
  const form = Stats.form(meL);
  // zápasy z online zápisu, u kterých se ještě dočítá STR soupeře (Výkon se může změnit)
  const formBusy = meL.chronological.slice(-25).some((m) => m.unofficial && m.oppStrBefore == null)
    && Array.from(vm.loadingPlayers.values()).some((x) => x);
  const teams = (me.currentSeason?.teams ?? []).filter((t) => !t.notOnRoster).map((t) => t.name).join(", ");
  const nextCtx = vm.next[vm.nextSelected] ?? vm.next.find((c) => c.next != null) ?? null;
  // Úspěšnost v soutěži aktivního družstva
  const activeTeam = vm.next[vm.nextSelected]?.myTeam ?? null;
  const teamMatches = activeTeam ? seasonMatches.filter((m) => Stats.fold(m.myTeam) === Stats.fold(activeTeam.name)) : seasonMatches;
  const teamWins = teamMatches.filter((m) => m.won).length;
  const remaining = Stats.estimateRemaining(me, vm.next.length ? sum(vm.next.map((c) => Stats.remainingTeamMatches(c.los))) : null);
  const fc = Stats.forecast(me, remaining, vm.repo.seasonEnd(vm.next.flatMap((c) => c.los)));
  const live = vm.myLiveGames();
  let provisional: number | null = null;
  for (let i = live.length - 1; i >= 0; i--) if (live[i].strAfter != null) { provisional = Math.round(live[i].strAfter!); break; }
  const running = vm.lastUtkani()?.running === true;
  const wins = seasonMatches.filter((m) => m.won).length;

  // Pořadí: celý oddíl, nebo družstvo zvolené ve voliči
  // úspěšnost a bilance: všechny soutěže sezóny, případně včetně neoficiálních výsledků z online zápisu
  const scopeSub = seasonMatches.some((m) => m.unofficial) ? "vč. neoficiálních ›" : "všechny soutěže ›";

  const myTeams = Array.from(new Set(meL.chronological.filter((m) => m.season === season).map((m) => m.myTeam).filter((t) => t.trim())));
  const recent = meL.chronological.filter((m) => vm.recentTeam === "all" || Stats.fold(m.myTeam) === Stats.fold(vm.recentTeam)).slice(-6).reverse();

  return (
    <div className="col g12">
      {switching && <SwitchPlayerDialog onClose={() => setSwitching(false)} />}
      <NavyHeader>
        <div className="row g12">
          <Avatar text={me.name} color={C.Blue} size={48} />
          <div className="col w1">
            <div className="row" style={{ minWidth: 0 }}>
              <T size={20} bold color="#fff" lines={1} style={{ minWidth: 0 }}>{me.name}</T>
              {vm.busy && !vm.firstLoad && (
                <>
                  <div style={{ width: 10 }} />
                  <Spinner size={16} width={2} color={C.Peach} />
                  <div style={{ width: 6 }} />
                  <T size={13} bold color={C.Peach} style={{ whiteSpace: "nowrap" }}>{vm.progressPercent} %</T>
                </>
              )}
            </div>
            <Muted text={[me.clubName, teams || null].filter((x) => x).join(" · ")} color={C.MutedOnNavy} size={14} />
            {vm.busy && !vm.firstLoad && vm.progressLabel && <Muted text={vm.progressLabel} color={C.MutedOnNavy} size={11} maxLines={1} />}
          </div>
          <button className="iconbtn" style={{ color: "#fff" }} onClick={() => setSwitching(true)} aria-label="Přepnout hráče"><Icon name="swap" /></button>
        </div>
        <div className="rowb">
          <div className="col w1">
            <div style={{ width: "calc(100% + 150px)", position: "relative", zIndex: 1 }}>
              <Marquee text={provisional == null ? "AKTUÁLNÍ STR" : running ? "STR · ODHAD Z PROBÍHAJÍCÍHO UTKÁNÍ" : "STR · ODHAD · NEOFICIÁLNÍ VÝSLEDKY"} color={C.MutedOnNavy} size={13} />
            </div>
            <BigNumber text={(provisional ?? cur)?.toString() ?? "—"} color="#fff" size={72} />
            {provisional != null && cur != null ? (
              <T semi size={14} color={provisional >= cur ? C.WinLight : C.Peach}>oficiálně {cur} · změna {signedInt(provisional - cur)} zatím neoficiální</T>
            ) : start != null && cur != null ? (
              <T semi size={15} color={cur >= start ? C.WinLight : C.Peach}>{(cur >= start ? "▲ " : "▼ ") + signedInt(cur - start)} za sezónu</T>
            ) : null}
          </div>
          {vm.firstLoad && vm.busy ? (
            <div style={{ width: 150, height: 90, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <Spinner size={72} width={5} color={C.Peach} />
              <T bold size={18} color="#fff" style={{ position: "absolute" }}>{vm.progressPercent} %</T>
            </div>
          ) : (
            <div className="clickable" onClick={() => vm.tab(S.Str)} aria-label="Vývoj STR" style={{ padding: "6px 0 6px 6px", margin: "-6px 0 -6px -6px" }}>
              <Sparkline values={me.graph.map((p) => p.str).filter((x): x is number => x != null).slice(-40)} />
            </div>
          )}
        </div>
        {vm.firstLoad && vm.busy && (
          <div className="col g4" style={{ background: C.Navy2, borderRadius: 14, padding: 12 }}>
            <T semi size={14} color="#fff">{vm.progressLabel || "Načítám data ze STIS…"}</T>
            <Muted text="První načtení stahuje data celého oddílu ze STIS a trvá déle. Nechte ho prosím doběhnout – příště se aplikace spustí rychle, data se jen doplní." color={C.MutedOnNavy} size={13} maxLines={5} />
          </div>
        )}
        <TileRow>
          <StatTile label="Úspěšnost" value={teamMatches.length ? Stats.pct(teamWins / teamMatches.length) : "–"} dark
            sub={activeTeam ? `${activeTeam.competition || activeTeam.name} ›` : scopeSub}
            onClick={() => { vm.ladderTab = "stis"; vm.strLadderSort = "pct"; vm.compSeason = null; vm.compId = null; vm.tab(S.Ladder); }} />
          <StatTile label="Bilance" value={`${wins}–${seasonMatches.length - wins}`} dark sub={scopeSub}
            onClick={() => { vm.matchesTeam = "all"; vm.matchesSeason = null; vm.matchesTab = "zapasy"; vm.tab(S.Matches); }} />
          <StatTile label="Výkon" value={form.sample ? (form.overExpected >= 0 ? "+" : "−") + dec1(Math.abs(form.overExpected)) : "–"} dark
            valueColor={!form.sample ? undefined : form.overExpected > 0.05 ? C.WinLight : form.overExpected < -0.05 ? C.Peach : "#fff"}
            busy={formBusy} sub={`posl. ${form.sample} zápasů ›`} onClick={() => { vm.scrollTarget = "klutch"; vm.go(S.Records); }} />
        </TileRow>
      </NavyHeader>
      <InstallBanner />
      {vm.error != null && <div className="px16"><ErrorBox text={vm.error} onRetry={() => vm.loadMe(true)} /></div>}
      <div className="col g12 px16">
        {vm.next.length >= 1 && <Chips options={vm.next.map((c, i) => [String(i), c.myTeam.name + (i === vm.nextSelected ? " ›" : "")])} selected={String(vm.nextSelected)}
          onSelect={(k) => { const i = parseInt(k, 10); if (i === vm.nextSelected) vm.go({ t: "Team", team: i }); else vm.selectTeam(i); }} />}
        <MatchPager ctx={nextCtx} />
        <LastUtkaniCard />
        <AppCard onClick={() => vm.tab(S.Str)}>
          <Muted text="Forma · posledních 5" size={13} />
          <FormDots results={form.last.map((m) => m.won)} />
          <div className="rowb" style={{ gap: 0 }}>
            <Muted text="Konec sezóny (odhad): " size={14} style={{ whiteSpace: "pre" }} />
            {fc != null ? (
              <>
                <BigNumber text={f0(fc.center)} color={C.Blue} size={26} />
                <T size={15} color={C.Muted} style={{ whiteSpace: "pre" }}>{` ± ${f0((fc.high - fc.low) / 2)}`}</T>
              </>
            ) : <BigNumber text="–" color={C.Blue} size={26} />}
          </div>
          <Muted text={`Posledních ${form.sample} zápasů: ${dec1(Math.abs(form.overExpected))} výher ${form.overExpected >= 0 ? "nad" : "pod"} očekáváním podle STR.`} size={13} />
        </AppCard>
        <div className="row g8">
          <QuickLink text="Rekordy" onClick={() => vm.go(S.Records)} />
          <QuickLink text="Kapitán" onClick={() => vm.go(S.Captain)} />
          <QuickLink text="Porovnat" onClick={() => vm.go({ t: "Compare", a: null, b: null })} />
        </div>
        <SectionTitle text="Poslední zápasy" action="Vše ›" onAction={() => { vm.matchesTeam = vm.recentTeam; vm.matchesSeason = null; vm.matchesTab = "zapasy"; vm.tab(S.Matches); }} />
        {myTeams.length > 1 && <Chips options={[["all", "Všechna"], ...myTeams.map((t) => [t, shortTeamName(t)] as [string, string])]} selected={vm.recentTeam} onSelect={(k) => vm.set("recentTeam", k)} />}
      </div>
      <div className="px16">
        <ListCard>
          {!recent.length && <Empty text="Zatím žádné zápasy." />}
          {recent.map((m, i) => <MatchRow key={i + m.opponentKey + m.seq} m={m} onClick={() => vm.go({ t: "H2H", key: m.opponentKey })} />)}
        </ListCard>
      </div>
      <Muted text={`Data: stis.ping-pong.cz${vm.loadingMe || vm.loadingClub ? " · aktualizuji…" : ""}${vm.clubProgress ? " · " + vm.clubProgress : ""}`} size={12} style={{ paddingLeft: 20, paddingBottom: 20 }} />
    </div>
  );
}

function QuickLink({ text, onClick }: { text: string; onClick: () => void }) {
  return <AppCard onClick={onClick} padding={12} style={{ flex: "1 1 0" }}><T bold color={C.Blue} center>{text}</T></AppCard>;
}

/** Výběr jiného hráče: naposledy použité profily, hráči oddílu nebo jméno / odkaz. */
export function SwitchPlayerDialog({ onClose }: { onClose: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const current = vm.prefs.playerPath;
  const recent = vm.prefs.recentProfiles.filter((r) => r[0] !== current);
  const clubPlayers = vm.club.ladder.filter((e) => e.path != null && e.id !== vm.me?.id).map((e) => [e.path!, e.name] as [string, string])
    .filter((c) => !recent.some((r) => Stis.playerId(r[0]) === Stis.playerId(c[0])));
  const pick = (path: string) => vm.setProfile(path, (e) => { if (e == null) onClose(); else setErr(e); });
  return (
    <Dialog title="Přepnout hráče" onClose={onClose} actions={<button className="textbtn" onClick={onClose}>Zavřít</button>}>
      <div className="col g6">
        {recent.length > 0 && <><Muted text="NAPOSLEDY POUŽITÉ" size={12} />{recent.map(([p, n]) => <SwitchRow key={p} name={n} enabled={!vm.loadingMe} onClick={() => pick(p)} />)}</>}
        {clubPlayers.length > 0 && <><Muted text="HRÁČI ODDÍLU" size={12} style={{ paddingTop: 6 }} />{clubPlayers.map(([p, n]) => <SwitchRow key={p} name={n} enabled={!vm.loadingMe} onClick={() => pick(p)} />)}</>}
        <Muted text="JINÝ HRÁČ" size={12} style={{ paddingTop: 6 }} />
        <ProfileInput dark={false} buttonText="Najít a přepnout" onDone={onClose} />
        {err && <Muted text={err} color={C.OrangeText} size={13} maxLines={4} />}
        <Muted text="Upozornění se přepnou na zvoleného hráče." size={12} maxLines={2} />
      </div>
    </Dialog>
  );
}

function SwitchRow({ name, enabled, onClick }: { name: string; enabled: boolean; onClick: () => void }) {
  return (
    <div className="row g10 clickable" style={{ padding: "8px 0", opacity: enabled ? 1 : 0.5 }} onClick={() => enabled && onClick()}>
      <Avatar text={name} color={C.Blue} size={32} />
      <T semi>{name}</T>
    </div>
  );
}

function MatchPager({ ctx }: { ctx: NextMatchContext | null }) {
  // stránky: nejstarší … předchozí utkání | příští zápas | další budoucí utkání
  const prevs = ctx ? vm.previousList(ctx) : [];
  const futures = ctx ? vm.futureList(ctx) : [];
  const nextIdx = prevs.length;
  const count = prevs.length + 1 + futures.length;
  const ref = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(nextIdx);
  const key = `${ctx?.myTeam.name}|${prevs.length}|${futures.length}`;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // výchozí stránka = příští zápas (bez "přichycení" k jiné stránce)
    const left = () => nextIdx * (el.clientWidth + 10);
    el.style.scrollSnapType = "none";
    el.scrollLeft = left();
    setPage(nextIdx);
    const id = requestAnimationFrame(() => { el.scrollLeft = left(); el.style.scrollSnapType = ""; });
    return () => cancelAnimationFrame(id);
  }, [key]);
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth + 10;
    setPage(Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / w))));
  };
  const goHome = () => { const el = ref.current; if (el) el.scrollTo({ left: nextIdx * (el.clientWidth + 10), behavior: "smooth" }); };
  const hint = count === 1 ? "  zatím žádné další utkání"
    : page === nextIdx ? "  " + [prevs.length ? `‹ předchozí (${prevs.length})` : "", futures.length ? `další (${futures.length}) ›` : ""].filter((x) => x).join(" · ")
      : page < nextIdx ? `  utkání ${nextIdx - page} z ${prevs.length} zpět · doleva novější ›`
        : `  ‹ doprava bližší · ${page - nextIdx + 1}. příští utkání`;
  return (
    <>
      <div className="pager" ref={ref} onScroll={onScroll}>
        {Array.from({ length: count }, (_, p) => (
          <div className="page" key={p === nextIdx ? "next" : p < nextIdx ? prevs[nextIdx - 1 - p]?.[1] || "p" + p : "f" + (p - nextIdx)}>
            {p === nextIdx ? <NextCard ctx={ctx} />
              : p < nextIdx ? <PreviousCard ctx={ctx} prev={prevs[nextIdx - 1 - p]} back={nextIdx - p} total={prevs.length} onHome={goHome} />
                : <FutureCard ctx={ctx!} m={futures[p - nextIdx - 1]} ahead={p - nextIdx + 1} team={Math.max(0, vm.next.indexOf(ctx!))} onHome={goHome} />}
          </div>
        ))}
      </div>
      <div className="dots">
        {count <= 9 && Array.from({ length: count }, (_, p) => (
          <div key={p} className="dot clickable" style={{ width: page === p ? 9 : 7, height: page === p ? 9 : 7, background: page === p ? C.Blue : p === nextIdx ? "#AFC3EE" : C.Line }}
            onClick={() => { const el = ref.current; if (el) el.scrollTo({ left: p * (el.clientWidth + 10), behavior: "smooth" }); }} />
        ))}
        <Muted size={11} maxLines={1} style={{ whiteSpace: "pre" }} text={hint} />
      </div>
    </>
  );
}

/** Další budoucí utkání (posunem doleva od příštího zápasu). */
function HomeButton({ onHome, left }: { onHome: () => void; left: boolean }) {
  return <button className="homebtn" onClick={(e) => { e.stopPropagation(); onHome(); }}>{left ? "‹ Nejbližší zápas" : "Nejbližší zápas ›"}</button>;
}

/** Tělo karty utkání: družstva pod sebou uprostřed (domácí první), pod nimi datum, kolo a DOMA/VENKU. */
function FixtureBody({ ctx, m, live }: { ctx: NextMatchContext; m: LosMatch; live?: boolean }) {
  const home = Stats.isHome(m, ctx.myTeam.ref, ctx.myTeam.name);
  const mine = Stats.fold(ctx.myTeam.name);
  const team = (n: string) => <T size={18} bold={Stats.fold(n) === mine} color="#fff" center lines={2} style={{ fontWeight: Stats.fold(n) === mine ? 700 : 500 }}>{n}</T>;
  return (
    <div className="col g4" style={{ alignItems: "center", textAlign: "center", padding: "2px 0" }}>
      {team(m.home)}
      <T size={12} bold color="#D6E1FA">vs</T>
      {team(m.away)}
      <div className="row g8" style={{ flexWrap: "wrap", justifyContent: "center", paddingTop: 6 }}>
        <T semi size={14} color="#fff">{m.dateTime != null ? fmtWhenShort(m.dateTime) : m.dateText}</T>
        <Pill text={`${m.round}. kolo`} bg={C.Navy} fg="#fff" />
        <Pill text={home ? "DOMA" : "VENKU"} bg={home ? C.Win : C.Orange} fg="#fff" />
        {live && <Pill text="právě se hraje" bg={C.Live} fg="#fff" />}
      </div>
    </div>
  );
}

function FutureCard({ ctx, m, ahead, team, onHome }: { ctx: NextMatchContext; m: LosMatch; ahead: number; team: number; onHome: () => void }) {
  const onBlue = "#D6E1FA";
  return (
    <AppCard bg={C.Blue} onClick={() => vm.go({ t: "Fixture", team, round: m.round, home: m.home, away: m.away })}>
      <div className="row">
        <T bold size={13} color={onBlue} style={{ letterSpacing: 1, flex: 1 }}>ZA {ahead} {ahead <= 4 ? "ZÁPASY" : "ZÁPASŮ"}</T>
        <T bold color="#fff">Rozbor soupeřů ›</T>
      </div>
      <FixtureBody ctx={ctx} m={m} />
      <FixtureForecastFor team={team} m={m} />
      <div style={{ marginTop: "auto" }}><HomeButton onHome={onHome} left /></div>
    </AppCard>
  );
}

function NextCard({ ctx }: { ctx: NextMatchContext | null }) {
  const onBlue = "#D6E1FA";
  const n = ctx ? vm.upcoming(ctx) : null;
  let body;
  if (ctx && n) body = <FixtureBody ctx={ctx} m={n} live={ctx.liveNow && n === ctx.next} />; else if (vm.loadingNext) body = <Muted text="Hledám v rozpisu…" color={onBlue} />;
  else body = <Muted text={`${ctx?.myTeam.name ? ctx.myTeam.name + ": " : ""}v rozpisu nevidím žádné nadcházející utkání.`} color={onBlue} />;
  return (
    <AppCard onClick={() => vm.go(S.NextMatch)} bg={C.Blue}>
      <div className="row">
        <T bold size={13} color={onBlue} style={{ letterSpacing: 1, flex: 1 }}>PŘÍŠTÍ ZÁPAS</T>
        <T bold color="#fff">Rozbor soupeřů ›</T>
      </div>
      {body}
      {ctx && n && (ctx.liveNow && n === ctx.next ? <LiveMini ctx={ctx} />
        : n === ctx.next ? <CardForecast ctx={ctx} oppName={ctx.opponentName} oppRef={ctx.opponentRef} oppRoster={ctx.opponentRoster} home={ctx.home} loading={false} />
          : <FixtureForecastFor team={Math.max(0, vm.next.indexOf(ctx))} m={n} />)}
      {ctx && n && ctx.liveNow && n === ctx.next && vm.needsLivePermission() && (
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="homebtn" onClick={async (e) => { e.stopPropagation(); await vm.askLivePermission(); }}>🔔 Povolit upozornění</button>
        </div>
      )}
    </AppCard>
  );
}

function PreviousCard({ ctx, prev, back, total, onHome }: { ctx: NextMatchContext | null; prev: [LosMatch | null, string] | undefined; back: number; total: number; onHome: () => void }) {
  const path = prev?.[1] ?? "";
  useZapisRefresh(path);
  const z = vm.zapisy.get(path);
  const muted = "#B7C2D8";
  const m = prev?.[0] ?? null;
  const head = (
    <div className="row">
      <T bold size={13} color={muted} style={{ letterSpacing: 1, flex: 1 }}>{back === 1 ? "PŘEDCHOZÍ UTKÁNÍ" : `UTKÁNÍ ${back}/${total} ZPĚT`}</T>
      {path && <T bold color="#fff">Celý zápis ›</T>}
    </div>
  );
  if (!prev || !ctx) return <AppCard bg={C.Navy}>{head}<Muted text="V této sezóně družstvo ještě nehrálo." color={muted} /><div><HomeButton onHome={onHome} left={false} /></div></AppCard>;
  const homeName = (z?.home.trim() ? z.home : null) ?? m?.home ?? "";
  const awayName = (z?.away.trim() ? z.away : null) ?? m?.away ?? "";
  const hp = z ? z.score[0] : null;
  const ap = z ? z.score[1] : null;
  const score = hp != null && ap != null ? `${hp} : ${ap}` : m?.score.replace(":", " : ") ?? "–";
  let stats: ReturnType<typeof Live.playerStats> = [];
  if (z) {
    const c = vm.next.find((x) => x.myTeam.name === ctx.myTeam.name);
    const myHome = c ? vm.zapisMyHome(z, c) : true;
    stats = Live.playerStats(z).filter((p) => p.home === myHome);
  }
  return (
    <AppCard bg={C.Navy} onClick={path ? () => vm.go({ t: "ZapisDetail", path, myTeam: ctx.myTeam.name }) : null}>
      {head}
      <div className="row">
        <T bold color="#fff" lines={2} style={{ flex: 1 }}>{homeName}</T>
        <BigNumber text={score} color="#fff" size={30} style={{ padding: "0 8px", whiteSpace: "nowrap" }} />
        <T bold color="#fff" lines={2} end style={{ flex: 1 }}>{awayName}</T>
      </div>
      <Muted text={[m?.dateTime != null ? fmtDMYdt(m.dateTime) : m?.dateText, m?.round ? `${m.round}. kolo` : null].filter((x) => x).join(" · ")} color={muted} size={12} />
      {!z ? <Muted text={!path ? "Zápis o utkání není k dispozici." : "Načítám zápis…"} color={muted} size={13} /> : stats.map((p, i) => (
        <div className="row" key={i}>
          <T size={14} color="#fff" lines={1} style={{ flex: 1 }}>{p.name}</T>
          <T size={13} semi color={p.singlesWon >= p.singlesLost ? C.WinLight : C.Peach}>dvouhry {p.singlesWon}–{p.singlesLost}</T>
          {p.doublesWon + p.doublesLost > 0 && <T size={13} color={muted} style={{ whiteSpace: "pre" }}>{`  4hra ${p.doublesWon}–${p.doublesLost}`}</T>}
        </div>
      ))}
      <div><HomeButton onHome={onHome} left={false} /></div>
    </AppCard>
  );
}

function LastUtkaniCard() {
  const team = vm.next[vm.nextSelected]?.myTeam.name ?? null;
  const byTeam = vm.lastByTeam && team != null;
  const last = vm.lastUtkani(byTeam ? team : null);
  if (!last) {
    if (byTeam) return (
      <AppCard bg={C.Navy} className="darkcard">
        <T bold size={16} color="#fff">Poslední utkání</T>
        <Muted text={`Za družstvo ${team} jste v této sezóně zatím nehrál.`} size={13} color={C.MutedOnNavy} />
        <div><button className="textbtn" onClick={() => vm.set("lastByTeam", false)}>Ukázat všechna družstva</button></div>
      </AppCard>
    );
    return null;
  }
  const liveTeam = Math.max(0, vm.next.findIndex((c) => c.myTeam.name === last.myTeam));
  return (
    <AppCard bg={C.Navy} className="darkcard" onClick={() => {
      if (last.running) vm.go({ t: "Live", team: liveTeam });
      else if (last.zapisPath) vm.go({ t: "ZapisDetail", path: last.zapisPath, myTeam: last.myTeam });
    }}>
      <div className="row">
        <T bold size={16} color="#fff" style={{ flex: 1 }}>{last.title}</T>
        <T bold color="#fff">{last.running ? "Živě ›" : "Zápis ›"}</T>
      </div>
      {team != null && (
        <div onClick={(e) => e.stopPropagation()}>
          <Chips options={[["team", "Aktuální družstvo"], ["all", "Všechna"]]} selected={vm.lastByTeam ? "team" : "all"} onSelect={(k) => vm.set("lastByTeam", k === "team")} />
          {!vm.lastByTeam && <Muted text={last.myTeam} size={12} color={C.MutedOnNavy} style={{ paddingTop: 8 }} />}
        </div>
      )}
      {last.unofficial && <Muted text="Výsledky a STR jsou odhad podle online zápisu – oficiálně je přepočítá STIS." color={C.Peach} size={12} maxLines={3} />}
      {last.unofficial ? last.live.map((g, i) => (
        <div className="row g10" key={i}>
          {g.won != null ? <ResultBadge won={g.won} text={g.won ? "V" : "P"} /> : <div style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Muted text={`${g.game.no}.`} size={13} color={C.MutedOnNavy} /></div>}
          <div className="col w1">
            <T semi lines={1} color="#fff">{g.opponent.name + (g.opponent.str != null ? ` (${g.opponent.str})` : "")}</T>
            <Muted size={12} maxLines={1} color={C.MutedOnNavy} text={
              g.won != null && g.game.homeSets != null ? `sety ${g.home ? `${g.game.homeSets}:${g.game.awaySets}` : `${g.game.awaySets}:${g.game.homeSets}`}`
                : g.game.inProgress ? "hraje se"
                  : g.won == null ? `výhra ${Math.round(g.ifWin)} · prohra ${Math.round(g.ifLoss)}` : ""} />
          </div>
          {g.strAfter != null && <T bold color={g.strAfter - g.strBefore >= 0 ? C.WinLight : C.Peach}>{signedInt(Math.round(g.strAfter - g.strBefore))}</T>}
        </div>
      )) : [...last.official].reverse().map((m, i) => (
        <div className="row g10" key={i}>
          <ResultBadge won={m.won} text={m.won ? "V" : "P"} />
          <div className="col w1">
            <T semi lines={1} color="#fff">{m.opponent + (m.oppStrBefore != null ? ` (${m.oppStrBefore})` : "")}</T>
            <Muted text={`${m.score} · ${m.opponentTeam}`} size={12} maxLines={1} color={C.MutedOnNavy} />
          </div>
          {m.delta != null && <T bold color={m.delta >= 0 ? C.WinLight : C.Peach}>{signedInt(m.delta)}</T>}
        </div>
      ))}
    </AppCard>
  );
}

/**
 * Zadání hráče: odkaz, číslo hráče, nebo jméno. Jméno se vyhledá na STIS; při více výsledcích se nabídne výběr.
 */
export function ProfileInput({ dark, initial = "", buttonText = "Načíst", onDone }: { dark: boolean; initial?: string; buttonText?: string; onDone: () => void }) {
  const [input, setInput] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [diag, setDiag] = useState<string | null>(null);
  const [results, setResults] = useState<SearchPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const load = (path: string) => vm.setProfile(path, (e) => { if (e == null) onDone(); else setErr(e); });
  const submit = () => {
    setErr(null); setDiag(null);
    const q = input.trim();
    if (Stis.normalizeInput(q) != null) { setResults([]); load(q); return; }
    if (q.length < 3) { setErr("Zadejte aspoň 3 znaky jména, odkaz nebo číslo hráče."); return; }
    setSearching(true);
    vm.searchPlayers(q, (found, e) => {
      setSearching(false);
      const list = found ?? [];
      if (e != null) { setErr(e); setDiag(vm.searchInfo()); }
      else if (!list.length) { setResults([]); setErr(`Hráče „${q}“ jsem na STIS nenašel.`); setDiag(vm.searchInfo()); }
      else if (list.length === 1) { setResults([]); load(list[0].path); }
      else {
        setResults(list);
        if (list.length >= 100) setErr("Výsledků je hodně (STIS ukáže nejvýš 100) – zkuste zadat celé jméno.");
      }
    });
  };
  const busy = vm.loadingMe || searching;
  return (
    <div className="col g8">
      <TextField value={input} onChange={(v) => { setInput(v); setErr(null); setDiag(null); }} label="Jméno, odkaz nebo číslo hráče" placeholder="např. Novák Jan" onEnter={() => { if (!busy && input.trim()) submit(); }} />
      {err && <ErrorWithDiagnostics message={err} diagnostics={diag} />}
      <PrimaryButton text={busy ? "Hledám…" : buttonText} onClick={submit} enabled={!busy && !!input.trim()} full />
      {results.length > 0 && (
        <>
          <Muted text={`Nalezeno ${results.length} hráčů – vyberte:`} color={dark ? C.MutedOnNavy : C.Muted} size={13} />
          {results.slice(0, 100).map((r) => (
            <div key={r.id} className="row g10 clickable" style={{ background: dark ? C.Navy2 : C.Tint, borderRadius: 10, padding: "10px 12px" }} onClick={() => { if (!vm.loadingMe) load(r.path); }}>
              <Avatar text={r.name} color={C.Blue} size={32} />
              <div className="col w1">
                <T semi color={dark ? "#fff" : C.Ink}>{r.name + (r.birthYear != null ? ` (${r.birthYear})` : "")}</T>
                <Muted text={r.club} color={dark ? C.MutedOnNavy : C.Muted} size={12} />
              </div>
              {r.str != null && r.str > 0 && <T bold size={13} color={dark ? "#fff" : C.Ink} style={{ whiteSpace: "nowrap" }}>STR {r.str}</T>}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** Krátký název družstva do přepínačů: "TJ Vlast Ježov B" -> "Ježov B". */
export function shortTeamName(team: string): string {
  const club = Clubs.clubName(team);
  const letter = (team.startsWith(club) ? team.substring(club.length) : team).trim();
  const words = club.split(/\s+/).filter((w) => w.trim());
  const word = words[words.length - 1] ?? club;
  return (word + (letter ? " " + letter : "")).trim();
}

/** Predikce budoucího utkání (soupiska soupeře se dočte přes loadFixture). */
function FixtureForecastFor({ team, m }: { team: number; m: LosMatch }) {
  const base = vm.next[team];
  useEffect(() => { if (base) vm.loadFixture(team, m); }, [team, m.round, m.home, m.away]);
  if (!base) return null;
  const f = vm.fixtures.get(vm.fixtureKey(team, m));
  if (!f) return <ForecastBox><Muted text="Počítám predikci…" color="#D6E1FA" size={13} /></ForecastBox>;
  return <CardForecast ctx={base} oppName={f.opponentName} oppRef={f.opponentRef} oppRoster={f.opponentRoster} home={f.home} loading={false} />;
}

function ForecastBox({ children }: { children: ReactNode }) {
  return <div className="col g4" style={{ background: "rgba(14,26,51,0.28)", borderRadius: 12, padding: "8px 10px", marginTop: 4 }}>{children}</div>;
}

function MiniOdds({ win, draw, loss, busy }: { win: number; draw: number; loss: number; busy?: boolean }) {
  const cell = (label: string, v: number, color: string) => (
    <div className="col" style={{ flex: 1, alignItems: "center" }}>
      <span style={{ fontSize: 11, color: "#D6E1FA" }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 800, color }}>{Stats.pct(v)}</span>
    </div>
  );
  return (
    <div className="row" style={{ opacity: busy ? 0.6 : 1 }}>
      {cell("Výhra", win, C.WinLight)}{cell("Remíza", draw, "#fff")}{cell("Prohra", loss, C.Peach)}
    </div>
  );
}

/** Predikce na kartě utkání: šance Výhra/Remíza/Prohra, pásek, očekávaný stav a moje dvouhry. */
function CardForecast({ ctx, oppName, oppRef, oppRoster, home }: {
  ctx: NextMatchContext; oppName: string; oppRef: NextMatchContext["opponentRef"]; oppRoster: NextMatchContext["opponentRoster"]; home: boolean; loading: boolean;
}) {
  const me = vm.me;
  const mine = vm.lineupFor(ctx.myTeam.name, ctx.myTeam.ref, vm.fresh(ctx.myRoster)).map((x) => x[0]);
  const theirs = vm.lineupFor(oppName, oppRef, vm.fresh(oppRoster)).map((x) => x[0]);
  const rs = vm.refineState(oppRoster, oppRef);
  if (!mine.length || !theirs.length) return <ForecastBox><Muted text={oppRoster.length ? "Počítám predikci…" : "Soupiska soupeře zatím není k dispozici."} color="#D6E1FA" size={13} /></ForecastBox>;
  const f = matchForecast(mine.map((p) => p.str ?? 1400), theirs.map((p) => p.str ?? 1400), vm.format);
  const [my, op] = roundScore(f.expHome, f.expAway);
  const meIn = me ? mine.find((p) => p.id === me.id || Stats.fold(p.name) === Stats.fold(me.name)) : undefined;
  const myStr = me?.currentStr ?? meIn?.str ?? null;
  const mySingles = meIn && myStr != null ? theirs.map((o) => [o.name.split(" ")[0], StrModel.winProbability(myStr, o.str ?? 1400)] as [string, number]) : [];
  void home;
  return (
    <ForecastBox>
      <MiniOdds win={f.pWin} draw={f.pDraw} loss={f.pLoss} busy={rs.busy} />
      <div style={{ opacity: rs.busy ? 0.6 : 1 }}><ProbBar p={f.pWin + f.pDraw / 2} /></div>
      <T size={13} semi color="#fff" center>{`Očekávaný stav ${my} : ${op}${rs.busy ? " · upřesňuji…" : ""}`}</T>
      {mySingles.length > 0 && (
        <T size={12} color="#D6E1FA" center lines={2}>
          {`Vy: ${Math.round(sum(mySingles.map((x) => x[1])))} z ${mySingles.length} dvouher (`}
          {mySingles.map(([n, p], i) => <span key={i} style={{ color: p >= 0.5 ? C.WinLight : C.Peach, fontWeight: 700 }}>{(i ? ", " : "") + `${n} ${Stats.pct(p)}`}</span>)}
          {")"}
        </T>
      )}
    </ForecastBox>
  );
}

/** Probíhající utkání na kartě: stav a šance z živého zápisu. */
function LiveMini({ ctx }: { ctx: NextMatchContext }) {
  const z = vm.liveZapisFor(vm.teamKey(ctx));
  if (!z || !z.games.length || !vm.zapisBelongs(z, ctx)) return <ForecastBox><Muted text="Čekám na online zápis…" color="#D6E1FA" size={13} /></ForecastBox>;
  const st = Live.evaluate(Live.fromZapis(z, (id, n) => vm.strOf(id, n), (id, n) => vm.rangeOf(id, n)), vm.format);
  const mh = vm.zapisMyHome(z, ctx);
  const my = mh ? st.home : st.away, op = mh ? st.away : st.home;
  const win = mh ? st.pHomeWin : st.pAwayWin, loss = mh ? st.pAwayWin : st.pHomeWin;
  return (
    <ForecastBox>
      <T size={13} bold color="#fff" center>{`Živě · stav ${my} : ${op} · odehráno ${st.played} z ${st.games.length}`}</T>
      <MiniOdds win={win} draw={st.pDraw} loss={loss} />
      <ProbBar p={win + st.pDraw / 2} />
    </ForecastBox>
  );
}

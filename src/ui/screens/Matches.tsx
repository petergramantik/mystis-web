import { useEffect, useState } from "react";
import { vm, S } from "../../app/vm";
import type { LosMatch } from "../../core/models";
import { Stats, groupBy, sum } from "../../core/stats";
import { LDT_MAX, fmtShort, ldDow, ldtDate, nowLdt, today } from "../../core/dates";
import { C, Chips, Divider, Empty, ListCard, Loading, MatchRow, Muted, Pill, Segmented, T, TextField } from "../components";
import { fmtMonth, hhmmLdt } from "../fmt";
import { LiveBoard } from "./LiveBoard";

/** Záložka Utkání: utkání družstva (minulá, probíhající, budoucí) a jednotlivé zápasy hráče. */
export function MatchesScreen() {
  const tab = vm.matchesTab;
  return (
    <div className="col g10">
      <div className="px16 row g8">
        <div style={{ flex: 1 }}><Segmented options={[["zapasy", "Zápasy"], ["utkani", "Utkání"]]} selected={tab} onSelect={(k) => vm.set("matchesTab", k)} /></div>
        <LiveButton on={tab === "zive"} onClick={() => vm.set("matchesTab", "zive")} />
      </div>
      {tab === "utkani" ? <TeamFixtures /> : tab === "zive" ? <LiveBoard /> : <PlayerMatches />}
    </div>
  );
}

/** Tlačítko Živě: červená tečka a počet dnešních utkání ve sledovaných soutěžích. */
function LiveButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  const comps = vm.liveComps();
  useEffect(() => { for (const c of comps) vm.loadCompLos(c); }, [comps.length]);
  const td = today();
  const n = comps.reduce((s, c) => s + (vm.compLos.get(vm.compKey(c)) ?? []).filter((m) => m.dateTime != null && ldtDate(m.dateTime) === td).length, 0);
  return (
    <button className={"chip" + (on ? " on" : "")} onClick={onClick} style={{ height: 40, borderRadius: 12, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: n > 0 ? "#E5484D" : C.Grey, display: "inline-block" }} />
      {`Živě${n > 0 ? ` ${n}` : ""}`}
    </button>
  );
}

function TeamFixtures() {
  const ctxs = vm.next;
  const idx = Math.max(0, Math.min(ctxs.length - 1, vm.utkaniTeam ?? vm.nextSelected));
  const ctx = ctxs[idx];
  // místa: zápisy odehraných utkání a herny soupeřů pro budoucí utkání
  useEffect(() => {
    if (!ctx) return;
    for (const m of ctx.los) if (m.played && m.zapisPath) vm.loadZapis(m.zapisPath);
    for (const m of ctx.los) if (!m.played) vm.ensureHomePlace(m.homeRef, m.home);
    for (const m of ctx.los) if (m.homeRef) vm.loadTeamInfo(m.homeRef);
  }, [ctx?.myTeam.name, ctx?.los.length, vm.teamLos.size]);
  if (!ctx) return <div className="px16">{vm.loadingNext ? <Loading text="Načítám rozpis utkání…" /> : <Empty text="Nenašel jsem žádné vaše družstvo v aktuální sezóně." />}</div>;
  const key = vm.teamKey(ctx);
  const liveZ = vm.liveZapisFor(key);
  const isLive = (m: LosMatch) => ctx.liveNow && m === ctx.next && !vm.liveFinished(ctx);
  const live = ctx.los.filter(isLive);
  // budoucí = bez výsledku a ještě nezačalo (nebo začalo před méně než 5 h); dohraná nepotvrzená jdou mezi odehraná
  const now = nowLdt();
  const future = ctx.los.filter((m) => !m.played && !isLive(m) && !(ctx.liveNow && m === ctx.next && vm.liveFinished(ctx))
    && !vm.awaitingConfirmation(m) && (m.dateTime == null || m.dateTime > now - 5 * 60))
    .sort((a, b) => (a.dateTime ?? LDT_MAX) - (b.dateTime ?? LDT_MAX));
  const played = ctx.los.filter((m) => !isLive(m) && !future.includes(m)).sort((a, b) => (b.dateTime ?? -LDT_MAX) - (a.dateTime ?? -LDT_MAX));
  const nextM = vm.upcoming(ctx);
  const row = (m: LosMatch, state: "live" | "future" | "played") => {
    const home = Stats.isHome(m, ctx.myTeam.ref, ctx.myTeam.name);
    const opp = home ? m.away : m.home;
    const z = m.zapisPath ? vm.zapisy.get(m.zapisPath) : state === "live" ? liveZ : undefined;
    const homeRef = m.homeRef ?? (home ? ctx.myTeam.ref : null);
    const place = (homeRef ? vm.teamInfos.get(homeRef.id)?.herna : null) ?? (z?.place.trim() ? z.place : null) ?? vm.homePlace(homeRef, m.home);
    let score: [number, number] | null = null;
    if (state === "live" && liveZ) {
      const [h, a] = liveZ.score;
      const zh = vm.zapisMyHome(liveZ, ctx);
      score = zh ? [h, a] : [a, h];
    } else if (state !== "future" || (z && z.games.length)) {
      const sm = /^(\d+)\s*:\s*(\d+)$/.exec(m.score);
      // STIS v rozpisu někdy drží 0:0 nebo průběžný stav i po dohrání – konečný výsledek pak bereme ze zápisu
      if (sm && (vm.scoreFinal(m.score) || !z || !z.games.length)) { const h = parseInt(sm[1], 10), a = parseInt(sm[2], 10); score = home ? [h, a] : [a, h]; }
      else if (z) {
        const [h, a] = z.score;
        score = vm.zapisMyHome(z, ctx) ? [h, a] : [a, h];
      }
    }
    const path = m.zapisPath || (state === "live" ? vm.liveLinks.get(key) ?? "" : "");
    const onClick = state === "live" ? () => vm.go({ t: "Live", team: idx })
      : path && state === "played" ? () => vm.go({ t: "ZapisDetail", path, myTeam: ctx.myTeam.name })
        : m === nextM ? () => vm.go(S.NextMatch)
          : state === "future" ? () => vm.go({ t: "Fixture", team: idx, round: m.round, home: m.home, away: m.away }) : null;
    const d = m.dateTime;
    return (
      <div key={m.round + m.home + m.away}>
        <div className={"row g12" + (onClick ? " clickable" : "")} style={{ padding: "10px 14px", background: state === "live" ? C.Tint : "#fff" }} onClick={onClick ?? undefined}>
          <div className="col" style={{ width: 52, alignItems: "center", flex: "none" }}>
            <T bold size={15}>{d != null ? fmtShort(ldtDate(d)) : m.dateText.substring(0, 6)}</T>
            <Muted text={d != null ? `${dayShort(d)} ${hhmmLdt(d)}` : ""} size={11} maxLines={1} />
          </div>
          <div className="col w1">
            <T semi size={16} lines={1}>{opp}</T>
            <Muted maxLines={1} size={13} text={<><b style={{ color: home ? C.Win : C.OrangeText }}>{home ? "doma" : "venku"}</b>{[place, `${m.round}. kolo`].filter((x) => x).map((x) => " · " + x).join("")}</>} />
          </div>
          <div className="col" style={{ alignItems: "flex-end", gap: 2, flex: "none" }}>
            {state === "live" && <Pill text="živě" bg={C.Live} fg="#fff" />}
            {score && <div className="badge wide" style={{ background: score[0] > score[1] ? C.Win : score[0] < score[1] ? C.OrangeText : C.Muted }}>{`${score[0]}:${score[1]}`}</div>}
            {state === "future" && m === nextM && <Pill text="příští" />}
            {state === "played" && (!m.played || !vm.scoreFinal(m.score)) && (vm.awaitingConfirmation(m) || (z && z.games.length > 0))
              ? <T size={11} bold color={C.Live}>čeká na potvrzení STIS</T>
              : state === "played" && !m.played && !score ? <T size={11} color={C.Muted}>bez výsledku</T> : null}
          </div>
        </div>
        <Divider />
      </div>
    );
  };
  return (
    <div className="col g8 px16">
      {ctxs.length > 1 && <Chips options={ctxs.map((c, i) => [String(i), c.myTeam.name])} selected={String(idx)} onSelect={(k) => vm.set("utkaniTeam", parseInt(k, 10))} />}
      <Muted text={`${ctx.myTeam.competition ?? ctx.myTeam.name} · odehráno ${ctx.los.filter((m) => m.played).length} z ${ctx.los.length}`} size={13} />
      {!ctx.los.length && <Empty text="Rozpis utkání družstva je prázdný." />}
      {live.length > 0 && <><T size={13} bold color={C.Muted} style={{ paddingLeft: 4 }}>PRÁVĚ SE HRAJE</T><ListCard>{live.map((m) => row(m, "live"))}</ListCard></>}
      {future.length > 0 && <><T size={13} bold color={C.Muted} style={{ paddingLeft: 4, paddingTop: 6 }}>NADCHÁZEJÍCÍ</T><ListCard>{future.map((m) => row(m, "future"))}</ListCard></>}
      {played.length > 0 && <><T size={13} bold color={C.Muted} style={{ paddingLeft: 4, paddingTop: 6 }}>ODEHRANÉ</T><ListCard>{played.map((m) => row(m, "played"))}</ListCard></>}
      <Muted size={12} maxLines={3} text="Klepnutím na odehrané nebo probíhající utkání otevřete zápis, na budoucí utkání rozbor soupeřů. Místo je herna domácího družstva podle STIS." />
      <div style={{ height: 8 }} />
    </div>
  );
}

const DAYS = ["", "po", "út", "st", "čt", "pá", "so", "ne"];
const dayShort = (t: number) => DAYS[ldDow(ldtDate(t))];

/** Jednotlivé zápasy hráče (dosavadní obrazovka Zápasy). */
function PlayerMatches() {
  const me = vm.meWithLive();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  if (!me) return <Loading />;
  const seasons = Array.from(new Set(me.chronological.map((m) => m.season))).sort((a, b) => b - a);
  const season = vm.matchesSeason ?? (seasons[0] != null ? String(seasons[0]) : "all");
  const teams = Array.from(new Set(me.chronological.filter((m) => season === "all" || String(m.season) === season).map((m) => m.myTeam).filter((t) => t.trim())));
  const team = vm.matchesTeam === "all" || teams.some((t) => Stats.fold(t) === Stats.fold(vm.matchesTeam)) ? vm.matchesTeam : "all";
  const q = Stats.fold(query);
  const list = [...me.chronological].reverse().filter((m) =>
    (season === "all" || String(m.season) === season) &&
    (team === "all" || Stats.fold(m.myTeam) === Stats.fold(team)) &&
    (filter === "all" || (filter === "w" && m.won) || (filter === "l" && !m.won) || (filter === "5" && m.fiveSetter)) &&
    (!q || Stats.fold(m.opponent).includes(q) || Stats.fold(m.opponentTeam).includes(q) || Stats.fold(m.competition).includes(q)));
  const groups = groupBy(list, (m) => (m.date != null ? fmtMonth(m.date) : "Bez data"));
  const w = list.filter((m) => m.won).length;
  const sf = sum(list.map((m) => m.setsFor)), sa = sum(list.map((m) => m.setsAgainst));

  return (
    <div className="col g8 px16">
      <TextField value={query} onChange={setQuery} label="Hledat soupeře, klub nebo soutěž" icon="search" />
      <Chips options={[["all", "Vše"], ["w", "Výhry"], ["l", "Prohry"], ["5", "Pětisetové"]]} selected={filter} onSelect={setFilter} />
      {teams.length > 1 && <Chips options={[["all", "Všechna družstva"], ...teams.map((t) => [t, t] as [string, string])]} selected={team} onSelect={(k) => vm.set("matchesTeam", k)} />}
      <Chips options={[["all", "Všechny sezóny"], ...seasons.map((s) => [String(s), `${s}/${(s + 1) % 100}`] as [string, string])]} selected={season} onSelect={(k) => vm.set("matchesSeason", k)} />
      <T size={14} color={C.Muted} style={{ padding: "0 4px" }}>{`${list.length} zápasů · ${w} výher · ${list.length - w} proher · sety ${sf}:${sa}`}</T>
      {!list.length && <Empty text="Žádné zápasy neodpovídají filtru." />}
      {Array.from(groups).map(([title, ms]) => (
        <div className="col g6" key={title}>
          <T size={13} bold color={C.Muted} style={{ paddingLeft: 4, paddingTop: 6 }}>{title.toUpperCase()}</T>
          <ListCard>{ms.map((m, i) => <MatchRow key={i} m={m} onClick={() => vm.go({ t: "H2H", key: m.opponentKey })} />)}</ListCard>
        </div>
      ))}
      <div style={{ height: 8 }} />
    </div>
  );
}

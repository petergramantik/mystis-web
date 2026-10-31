import { useEffect, useState } from "react";
import { vm, S } from "../../app/vm";
import type { LosMatch } from "../../core/models";
import { Stats, groupBy, sum } from "../../core/stats";
import { LDT_MAX, fmtShort, ldDow, ldtDate } from "../../core/dates";
import { C, Chips, Divider, Empty, ListCard, Loading, MatchRow, Muted, Pill, Segmented, T, TextField } from "../components";
import { fmtMonth, hhmmLdt } from "../fmt";

/** Záložka Utkání: utkání družstva (minulá, probíhající, budoucí) a jednotlivé zápasy hráče. */
export function MatchesScreen() {
  const tab = vm.matchesTab;
  return (
    <div className="col g10">
      <div className="px16"><Segmented options={[["utkani", "Utkání"], ["zapasy", "Zápasy"]]} selected={tab} onSelect={(k) => vm.set("matchesTab", k)} /></div>
      {tab === "utkani" ? <TeamFixtures /> : <PlayerMatches />}
    </div>
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
  }, [ctx?.myTeam.name, ctx?.los.length, vm.teamLos.size]);
  if (!ctx) return <div className="px16">{vm.loadingNext ? <Loading text="Načítám rozpis utkání…" /> : <Empty text="Nenašel jsem žádné vaše družstvo v aktuální sezóně." />}</div>;
  const key = vm.teamKey(ctx);
  const liveZ = vm.liveZapisFor(key);
  const isLive = (m: LosMatch) => ctx.liveNow && m === ctx.next && !vm.liveFinished(ctx);
  const live = ctx.los.filter(isLive);
  const future = ctx.los.filter((m) => !m.played && !isLive(m) && !(ctx.liveNow && m === ctx.next && vm.liveFinished(ctx)))
    .sort((a, b) => (a.dateTime ?? LDT_MAX) - (b.dateTime ?? LDT_MAX));
  const played = ctx.los.filter((m) => !isLive(m) && !future.includes(m)).sort((a, b) => (b.dateTime ?? -LDT_MAX) - (a.dateTime ?? -LDT_MAX));
  const nextM = vm.upcoming(ctx);
  const row = (m: LosMatch, state: "live" | "future" | "played") => {
    const home = Stats.isHome(m, ctx.myTeam.ref, ctx.myTeam.name);
    const opp = home ? m.away : m.home;
    const z = m.zapisPath ? vm.zapisy.get(m.zapisPath) : state === "live" ? liveZ : undefined;
    const place = (z?.place.trim() ? z.place : null) ?? vm.homePlace(home ? ctx.myTeam.ref : m.homeRef, m.home);
    let score: [number, number] | null = null;
    if (state === "live" && liveZ) {
      const h = liveZ.points[0] ?? liveZ.games.filter((g) => g.result === 1).length, a = liveZ.points[1] ?? liveZ.games.filter((g) => g.result === -1).length;
      const zh = vm.zapisMyHome(liveZ, ctx);
      score = zh ? [h, a] : [a, h];
    } else if (state !== "future" || (z && z.games.length)) {
      const sm = /^(\d+)\s*:\s*(\d+)$/.exec(m.score);
      if (sm) { const h = parseInt(sm[1], 10), a = parseInt(sm[2], 10); score = home ? [h, a] : [a, h]; }
      else if (z) { const h = z.points[0] ?? 0, a = z.points[1] ?? 0; score = home ? [h, a] : [a, h]; }
    }
    const path = m.zapisPath || (state === "live" ? vm.liveLinks.get(key) ?? "" : "");
    const onClick = state === "live" ? () => vm.go({ t: "Live", team: idx })
      : path && state === "played" ? () => vm.go({ t: "ZapisDetail", path, myTeam: ctx.myTeam.name })
        : m === nextM ? () => vm.go(S.NextMatch) : null;
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
            <Muted maxLines={1} size={13} text={[home ? "doma" : "venku", place, `${m.round}. kolo`].filter((x) => x).join(" · ")} />
          </div>
          <div className="col" style={{ alignItems: "flex-end", gap: 2, flex: "none" }}>
            {state === "live" && <Pill text="živě" bg={C.Live} fg="#fff" />}
            {score && <div className="badge wide" style={{ background: score[0] > score[1] ? C.Win : score[0] < score[1] ? C.OrangeText : C.Muted }}>{`${score[0]}:${score[1]}`}</div>}
            {state === "future" && m === nextM && <Pill text="příští" />}
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
      <Muted size={12} maxLines={3} text="Klepnutím na odehrané nebo probíhající utkání otevřete zápis, na příští utkání rozbor soupeřů. Místo je herna domácího družstva podle zápisů STIS." />
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

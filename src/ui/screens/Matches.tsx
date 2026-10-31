import { useState } from "react";
import { vm } from "../../app/vm";
import { Stats, groupBy, sum } from "../../core/stats";
import { C, Chips, Empty, ListCard, Loading, MatchRow, T, TextField } from "../components";
import { fmtMonth } from "../fmt";

export function MatchesScreen() {
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

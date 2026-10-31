import { useEffect, useState } from "react";
import { vm, S } from "../../app/vm";
import { Clubs, Stis, type StandingRow, type StrLadder, type StrLadderRow } from "../../core/models";
import { Stats, avg, maxBy, type LadderEntry } from "../../core/stats";
import { AppCard, BigNumber, C, Chips, Dialog, Divider, Empty, ErrorBox, ErrorWithDiagnostics, ListCard, Loading, Muted, Segmented, StatTile, T, TileRow, dec1, f0, signedInt } from "../components";

export function shortTeam(team: string, club: string): string {
  const letter = Clubs.teamLetter(team);
  return Clubs.clubName(team).toLowerCase() === Clubs.clubName(club).toLowerCase() || !club ? `${letter}-tým` : team;
}

/** Záložka Žebříčky: tabulka soutěže, oficiální žebříček STR a interní žebříček oddílu. */
export function LadderScreen() {
  const tab = vm.ladderTab;
  return (
    <div className="col g10">
      <div className="px16"><Segmented options={[["tabulka", "Tabulka"], ["stis", "Žebříček STIS"], ["interni", "Interní"]]} selected={tab} onSelect={(k) => vm.set("ladderTab", k)} /></div>
      {tab === "tabulka" ? <CompetitionView kind="tabulka" /> : tab === "stis" ? <CompetitionView kind="stis" /> : <InternalLadder />}
    </div>
  );
}

interface Comp { svaz: string; rocnik: number; soutez: string; label: string; teams: string[] }

/** Soutěže, ve kterých hráč hrál, podle sezón (z karet sezón na stránce hráče). */
function competitions(): Map<number, Comp[]> {
  const out = new Map<number, Comp[]>();
  for (const s of vm.me?.seasons ?? []) {
    for (const t of s.teams) {
      const r = t.ref;
      if (!r) continue;
      const list = out.get(r.rocnik) ?? [];
      const c = list.find((x) => x.soutez === r.soutez && x.svaz === r.svaz);
      if (c) { if (!c.teams.includes(t.name)) c.teams.push(t.name); }
      else list.push({ svaz: r.svaz, rocnik: r.rocnik, soutez: r.soutez, label: t.competition || t.name, teams: [t.name] });
      out.set(r.rocnik, list);
    }
  }
  return out;
}

function CompetitionView({ kind }: { kind: "tabulka" | "stis" }) {
  const me = vm.me;
  const comps = competitions();
  const seasons = Array.from(comps.keys()).sort((a, b) => b - a);
  const season = vm.compSeason != null && comps.has(vm.compSeason) ? vm.compSeason : seasons[0] ?? null;
  const list = season != null ? comps.get(season)! : [];
  // výchozí soutěž = soutěž hlavního družstva hráče
  const mainSoutez = vm.next[vm.mainTeamIndex]?.myTeam.ref?.soutez;
  const comp = list.find((c) => c.soutez === vm.compId) ?? list.find((c) => c.soutez === mainSoutez) ?? list[0] ?? null;
  useEffect(() => {
    if (!comp) return;
    if (kind === "tabulka") vm.loadTabulka(comp.svaz, comp.rocnik, comp.soutez);
    else vm.loadStrLadder(comp.svaz, comp.rocnik, comp.soutez);
  }, [kind, comp?.svaz, comp?.rocnik, comp?.soutez]);
  if (!me) return <Loading />;
  if (!comp) return <div className="px16"><Empty text="U hráče jsem nenašel žádnou soutěž." /></div>;
  const path = kind === "tabulka" ? Stis.tabulka(comp.svaz, comp.rocnik, comp.soutez) : Stis.zebricek(comp.svaz, comp.rocnik, comp.soutez);
  const loading = vm.compLoading.get(path) === true;
  const error = vm.compErrors.get(path);
  const reload = () => kind === "tabulka" ? vm.loadTabulka(comp.svaz, comp.rocnik, comp.soutez, true) : vm.loadStrLadder(comp.svaz, comp.rocnik, comp.soutez, true);
  return (
    <div className="col g10 px16">
      {seasons.length > 1 && <Chips options={seasons.map((y) => [String(y), `${y}/${(y + 1) % 100}`])} selected={String(season)} onSelect={(k) => { vm.set("compSeason", parseInt(k, 10)); vm.set("compId", null); }} />}
      {list.length > 1 && <Chips options={list.map((c) => [c.soutez, c.label])} selected={comp.soutez} onSelect={(k) => vm.set("compId", k)} />}
      {error ? <ErrorBox text={error} onRetry={reload} />
        : kind === "tabulka" ? <StandingsTable comp={comp} rows={vm.tabulky.get(path)} loading={loading} />
          : <OfficialLadder comp={comp} data={vm.strLadders.get(path)} loading={loading} />}
      <div style={{ height: 8 }} />
    </div>
  );
}

const myClubFold = () => Stats.fold(Clubs.clubName(vm.me?.clubName ?? vm.club.name ?? ""));

function StandingsTable({ comp, rows, loading }: { comp: Comp; rows: StandingRow[] | undefined; loading: boolean }) {
  if (!rows) return loading ? <Loading text="Načítám tabulku soutěže…" /> : <Empty text="Tabulka zatím není načtená." />;
  if (!rows.length) return <Empty text="Tabulka soutěže je prázdná nebo ji STIS zatím nezveřejnil." />;
  const club = myClubFold();
  const mine = (r: StandingRow) => comp.teams.some((t) => Stats.fold(t) === Stats.fold(r.name)) || (!!club && Stats.fold(Clubs.clubName(r.name)) === club);
  return (
    <>
      <Muted text={`${comp.label} · ${comp.rocnik}/${(comp.rocnik + 1) % 100}`} size={14} />
      <div className="row" style={{ padding: "0 14px" }}>
        <Muted text="#" size={12} style={{ width: 28 }} />
        <Muted text="DRUŽSTVO" size={12} style={{ flex: 1 }} />
        <Muted text="Z" size={12} style={{ width: 26, textAlign: "center" }} />
        <Muted text="V-R-P" size={12} style={{ width: 62, textAlign: "center" }} />
        <Muted text="SKÓRE" size={12} style={{ width: 58, textAlign: "center" }} />
        <Muted text="B" size={12} style={{ width: 30, textAlign: "right" }} />
      </div>
      <ListCard>
        {rows.map((r, i) => {
          const m = mine(r);
          return (
            <div key={i}>
              <div className="row" style={{ background: m ? C.Tint : "#fff", padding: "10px 14px" }}>
                <BigNumber text={`${r.position}`} size={18} color={r.position <= 3 ? C.Orange : C.Ink} style={{ width: 28, flex: "none" }} />
                <T semi={!m} bold={m} size={15} lines={2} style={{ flex: 1 }}>{r.name}</T>
                <T size={14} center style={{ width: 26, flex: "none" }}>{r.played}</T>
                <T size={13} center color={C.Muted} style={{ width: 62, flex: "none" }}>{`${r.wins}-${r.draws}-${r.losses}`}</T>
                <T size={13} center color={C.Muted} style={{ width: 58, flex: "none" }}>{r.score}</T>
                <BigNumber text={`${r.points}`} size={18} style={{ width: 30, flex: "none", textAlign: "right" }} />
              </div>
              <Divider />
            </div>
          );
        })}
      </ListCard>
      <Muted text="Z = utkání, V-R-P = výhry, remízy, prohry, B = body. Modře družstva vašeho oddílu." size={12} maxLines={2} />
    </>
  );
}

function OfficialLadder({ comp, data, loading }: { comp: Comp; data: StrLadder | undefined; loading: boolean }) {
  if (!data) return loading ? <Loading text="Načítám žebříček soutěže…" /> : <Empty text="Žebříček zatím není načtený." />;
  const total = data.sections.reduce((a, s) => a + s.rows.length, 0);
  if (!total) return (
    <AppCard>
      <ErrorWithDiagnostics message="Žebříček se nepodařilo přečíst (STIS možná změnil vzhled stránky, nebo ho pro soutěž zatím nezveřejnil)." diagnostics={data.info} />
    </AppCard>
  );
  const meId = vm.me?.id;
  const clubIds = new Set<string>();
  for (const e of vm.club.ladder) if (e.id) clubIds.add(e.id);
  for (const r of vm.club.rosters) for (const p of r.players) if (p.id) clubIds.add(p.id);
  if (meId) clubIds.add(meId);
  const onlyMine = vm.strLadderMine;
  const byPct = vm.strLadderSort === "pct";
  const pctOf = (r: StrLadderRow) => {
    const m = /^(\d+):(\d+)$/.exec(r.bilance ?? "");
    if (!m) return null;
    const w = parseInt(m[1], 10), l = parseInt(m[2], 10);
    return w + l ? w / (w + l) : null;
  };
  const sections = data.sections.map((s) => {
    let rows = s.rows;
    if (byPct) rows = [...rows].sort((a, b) => (pctOf(b) ?? -1) - (pctOf(a) ?? -1) || (b.matches ?? 0) - (a.matches ?? 0))
      .map((r, i) => ({ ...r, rank: i + 1 }));
    if (onlyMine) rows = rows.filter((r) => r.id != null && clubIds.has(r.id));
    return { ...s, rows };
  }).filter((s) => s.rows.length);
  return (
    <>
      <div className="row g8">
        <div style={{ flex: 1 }}><Segmented options={[["str", "STR"], ["pct", "Úspěšnost"]]} selected={byPct ? "pct" : "str"} onSelect={(k) => vm.set("strLadderSort", k)} /></div>
        <div style={{ flex: 1 }}><Segmented options={[["all", "Všichni"], ["mine", "Můj oddíl"]]} selected={onlyMine ? "mine" : "all"} onSelect={(k) => vm.set("strLadderMine", k === "mine")} /></div>
      </div>
      <Muted text={data.title || `${comp.label} · ${comp.rocnik}/${(comp.rocnik + 1) % 100}`} size={14} maxLines={2} />
      {!sections.length && <Empty text="V žebříčku této soutěže nikdo z vašeho oddílu není." />}
      {sections.map((s, si) => (
        <div className="col g6" key={si}>
          {s.title && <T size={13} bold color={C.Muted} style={{ paddingLeft: 4, paddingTop: 6 }}>{s.title.toUpperCase()}</T>}
          {si === 0 && (
            <div className="row" style={{ padding: "0 14px" }}>
              <Muted text="#" size={12} style={{ width: 34 }} />
              <Muted text="HRÁČ" size={12} style={{ flex: 1 }} />
              <Muted text="ZÁPASY" size={12} style={{ width: 66 }} />
              <Muted text={byPct ? "ÚSPĚŠ." : "STR"} size={12} style={{ width: 52, textAlign: "right" }} />
            </div>
          )}
          <ListCard>
            {s.rows.map((r, i) => {
              const mine = r.id != null && clubIds.has(r.id);
              const isMe = r.id != null && r.id === meId;
              return (
                <div key={i}>
                  <div className={"row" + (r.path ? " clickable" : "")} style={{ background: mine ? C.Tint : "#fff", padding: "9px 14px" }}
                    onClick={() => { if (isMe) vm.tab(S.Str); else if (r.path) vm.go({ t: "Player", path: r.path }); }}>
                    <BigNumber text={r.rank != null ? `${r.rank}` : "–"} size={18} color={mine ? C.Blue : C.Ink} style={{ width: 34, flex: "none" }} />
                    <div className="col w1">
                      <T size={15} bold={mine} semi={!mine} lines={1}>{r.name + (isMe ? " (vy)" : "")}</T>
                      <Muted text={[byPct ? (r.str != null ? `STR ${r.str}` : null) : (pctOf(r) != null ? `úspěšnost ${Stats.pct(pctOf(r)!)}` : null),
                        r.birthYear != null ? `nar. ${r.birthYear}` : null, !byPct && r.stabil != null ? `stabil ${dec1(r.stabil)}` : null].filter((x) => x).join(" · ")} size={12} maxLines={1} />
                    </div>
                    <div className="col" style={{ width: 66, flex: "none" }}>
                      <T size={14}>{r.matches ?? "–"}</T>
                      {r.bilance && <Muted text={r.bilance} size={12} />}
                    </div>
                    {byPct
                      ? <BigNumber text={pctOf(r) != null ? Stats.pct(pctOf(r)!).replace(" ", "") : "–"} size={18} color={(pctOf(r) ?? 0) >= 0.5 ? C.Win : C.OrangeText} style={{ width: 52, flex: "none", textAlign: "right" }} />
                      : <BigNumber text={r.str != null ? `${r.str}` : "–"} size={20} style={{ width: 52, flex: "none", textAlign: "right" }} />}
                  </div>
                  <Divider />
                </div>
              );
            })}
          </ListCard>
        </div>
      ))}
      <Muted size={12} maxLines={3} text={`Oficiální žebříček STR soutěže ze STIS. Modře hráči vašeho oddílu${vm.club.ladder.length ? "" : " (oddíl se ještě načítá)"}. Klepnutím otevřete profil hráče.`} />
    </>
  );
}

/** Interní žebříček oddílu (dosavadní obrazovka Žebříček). */
function InternalLadder() {
  const club = vm.club;
  const [team, setTeam] = useState("all");
  const [sort, setSort] = useState("str");
  const [chosen, setChosen] = useState<LadderEntry | null>(null);
  const meId = vm.me?.id;

  const dialog = chosen && (
    <Dialog title={chosen.name} onClose={() => setChosen(null)} actions={
      <>
        <button className="textbtn" onClick={() => { const p = chosen.path; setChosen(null); if (p) vm.go({ t: "Player", path: p }); }}>Jen zobrazit profil</button>
        <button className="textbtn" style={{ fontWeight: 700 }} onClick={() => { const p = chosen.path; setChosen(null); if (p) vm.setProfile(p, () => {}); }}>Přepnout na hráče</button>
      </>
    }>
      <Muted color={C.Ink} size={14} maxLines={8} style={{ whiteSpace: "pre-line" }} text={
        [chosen.str != null ? `STR ${chosen.str}` : null, chosen.teams.join(", ") || null, chosen.played > 0 ? `sezóna ${chosen.wins}–${chosen.losses}` : null].filter((x) => x).join(" · ") +
        "\n\nPřepnout aplikaci na tohoto hráče? Přehled, STR, zápasy, soupeři i upozornění se pak budou týkat jeho."} />
    </Dialog>
  );

  if (!club.ladder.length) {
    return (
      <div style={{ padding: 16 }}>
        {vm.loadingClub || vm.loadingMe ? <Loading text={vm.clubProgress || "Načítám družstva oddílu…"} />
          : <ErrorBox text="Žebříček oddílu se nepodařilo sestavit. Pokud STIS na vaší stránce neuvádí odkaz na oddíl, vložte ho v Nastavení." onRetry={() => vm.loadClub(true)} />}
      </div>
    );
  }

  const teamNames = Array.from(new Set(club.rosters.map((r) => r.name)));
  const filtered = club.ladder.filter((e) => team === "all" || e.teams.includes(team));
  const list = sort === "change" ? [...filtered].sort((a, b) => (b.strChange ?? -2147483648) - (a.strChange ?? -2147483648))
    : sort === "wins" ? [...filtered].sort((a, b) => (b.played === 0 ? -1 : b.wins / b.played) - (a.played === 0 ? -1 : a.wins / a.played))
      : filtered;
  const strsAll = filtered.map((e) => e.str).filter((x): x is number => x != null);
  const avgAll = strsAll.length ? avg(strsAll) : null;
  const teamScope = team === "all" ? null : team;
  const stableList = filtered.filter((e) => club.isStable(e.id, e.name, teamScope));
  const strsSt = stableList.map((e) => e.str).filter((x): x is number => x != null);
  const av = strsSt.length ? avg(strsSt) : null;
  const jumper = maxBy(filtered.filter((e) => e.strChange != null), (e) => e.strChange!);
  const pending = club.ladder.filter((e) => !e.live).length;

  return (
    <div className="col g10 px16">
      {dialog}
      <Muted text={`${club.name} · ${club.ladder.length} hráčů · ${club.rosters.length} družstev`} size={14} />
      <Chips options={[["all", "Celý oddíl"], ...teamNames.map((t) => [t, shortTeam(t, club.name)] as [string, string])]} selected={team} onSelect={setTeam} />
      <Chips options={[["str", "Podle STR"], ["change", "Změna za sezónu"], ["wins", "Úspěšnost"]]} selected={sort} onSelect={setSort} />
      <TileRow>
        <StatTile label={club.stabilityKnown ? "Průměr stabilní sestavy" : "Průměrné STR"} value={(av ?? avgAll) != null ? f0((av ?? avgAll)!) : "–"}
          sub={club.stabilityKnown ? `${stableList.length} hráčů · všichni ${avgAll != null ? f0(avgAll) : "–"}` : "počítám účast…"} />
        <StatTile label="Skokan sezóny" value={jumper ? signedInt(jumper.strChange) : "–"} sub={jumper?.name ?? null} />
      </TileRow>
      <div className="row" style={{ padding: "0 14px" }}>
        <Muted text="#" size={12} style={{ width: 34 }} />
        <Muted text="HRÁČ" size={12} style={{ flex: 1 }} />
        <Muted text="STR" size={12} style={{ width: 56 }} />
        <Muted text={sort === "wins" ? "ÚSPĚŠ." : "SEZÓNA"} size={12} style={{ width: 60, textAlign: "right" }} />
      </div>
      <ListCard>
        {!list.length && <Empty text="V tomto družstvu nikdo není." />}
        {list.map((e, i) => {
          const rank = club.ladder.indexOf(e) + 1;
          const mine = e.id != null && e.id === meId;
          return (
            <div key={(e.id ?? e.name) + i}>
              <div className="row clickable" style={{ background: mine ? C.Tint : "#fff", padding: "9px 14px" }}
                onClick={() => { if (mine) vm.tab(S.Str); else if (e.path != null) setChosen(e); }}>
                <BigNumber text={sort === "str" ? `${rank}` : `${i + 1}`} color={rank <= 3 && sort === "str" ? C.Orange : C.Ink} size={20} style={{ width: 34, flex: "none" }} />
                <div className="col w1">
                  <T size={16} bold={mine} semi={!mine} lines={1}>{e.name + (mine ? " (vy)" : "")}</T>
                  <div className="row" style={{ minWidth: 0 }}>
                    {club.stabilityKnown && !club.isStable(e.id, e.name, teamScope) && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.Muted, background: "#F0F2F5", borderRadius: 6, padding: "1px 6px", marginRight: 6, flex: "none" }}>náhradník</span>
                    )}
                    <Muted text={`${e.teams.map((t) => shortTeam(t, club.name)).join(", ")}${e.played > 0 ? ` · ${e.wins}–${e.losses}` : ""}`} maxLines={1} />
                  </div>
                </div>
                <BigNumber text={e.str?.toString() ?? "–"} color={e.live ? C.Ink : C.Muted} size={22} style={{ width: 56, flex: "none" }} />
                {sort === "wins"
                  ? <T bold size={14} end color={e.played === 0 ? C.Muted : e.wins * 2 >= e.played ? C.Win : C.OrangeText} style={{ width: 60, flex: "none" }}>{e.played ? Stats.pct(e.wins / e.played) : "–"}</T>
                  : <T bold size={14} end color={C.delta(e.strChange)} style={{ width: 60, flex: "none" }}>{signedInt(e.strChange)}</T>}
              </div>
              <Divider />
            </div>
          );
        })}
      </ListCard>
      <Muted size={12} maxLines={4} style={{ paddingBottom: 16 }} text={
        (pending > 0 ? `Šedé STR je zatím ze soupisky družstva, aktuální hodnoty se právě dočítají (${vm.clubProgress}). ` : "STR a bilance sezóny jsou aktuální ze stránek hráčů. ") +
        "Klepnutím na hráče ho můžete zobrazit nebo na něj aplikaci přepnout."} />
    </div>
  );
}

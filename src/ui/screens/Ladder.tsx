import { useState } from "react";
import { vm, S } from "../../app/vm";
import { Clubs } from "../../core/models";
import { avg, maxBy, type LadderEntry } from "../../core/stats";
import { BigNumber, C, Chips, Dialog, Divider, Empty, ErrorBox, ListCard, Loading, Muted, StatTile, T, TileRow, f0, signedInt } from "../components";

export function shortTeam(team: string, club: string): string {
  const letter = Clubs.teamLetter(team);
  return Clubs.clubName(team).toLowerCase() === Clubs.clubName(club).toLowerCase() || !club ? `${letter}-tým` : team;
}

export function LadderScreen() {
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
        <Muted text="SEZÓNA" size={12} style={{ width: 60 }} />
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
                <T bold size={14} end color={C.delta(e.strChange)} style={{ width: 60, flex: "none" }}>{signedInt(e.strChange)}</T>
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

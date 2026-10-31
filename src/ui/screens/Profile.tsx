// Profil hráče: hlavička, kariéra v číslech, graf STR, sezóny s rozbalovacími družstvy (soutěž, tabulka, soupiska).
import { useEffect, useState } from "react";
import { vm, S } from "../../app/vm";
import { Stis, type Match, type PlayerPage, type SeasonCard, type TeamMembership } from "../../core/models";
import { Stats } from "../../core/stats";
import {
  AppCard, Avatar, BigNumber, C, Divider, Empty, ListCard, Loading, MatchRow, Muted, NavyHeader, OButton, SectionTitle, StatTile, StrChart, T, TileRow, signedInt,
} from "../components";
import { strPoints } from "./StrScreen";

const seasonLabel = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
const rec = (ms: Match[]) => { const w = ms.filter((m) => m.won).length; return { w, l: ms.length - w, pct: ms.length ? w / ms.length : null }; };

export function ProfileScreen({ path }: { path: string }) {
  const me = vm.me;
  const isMe = !!me && me.path === path;
  useEffect(() => { if (!isMe) vm.loadPlayer(path); }, [path, isMe]);
  const p: PlayerPage | null | undefined = isMe ? vm.meWithLive() : vm.players.get(path);
  if (!p) return <div style={{ padding: 16 }}>{vm.loadingPlayers.get(path) !== false ? <Loading /> : <Empty text="Profil hráče se nepodařilo načíst." />}</div>;

  const ch = p.chronological;
  const lastSeason = ch.length ? Math.max(...ch.map((m) => m.season)) : Stis.currentRocnik();
  const sez = strPoints(p, "sez");
  const sezChange = sez.length >= 2 ? sez[sez.length - 1][1] - sez[0][1] : null;
  const total = rec(ch);
  const bySeason = new Map<number, Match[]>();
  for (const m of ch) { const l = bySeason.get(m.season) ?? []; l.push(m); bySeason.set(m.season, l); }
  const best = Array.from(bySeason.entries()).filter(([, ms]) => ms.length >= 10).map(([y, ms]) => [y, rec(ms)] as const)
    .sort((a, b) => (b[1].pct ?? 0) - (a[1].pct ?? 0))[0];
  const firstSeason = bySeason.size ? Math.min(...bySeason.keys()) : null;
  const jumps = Array.from(bySeason.entries()).map(([y, ms]) => {
    // první sezóna: zahajovací fáze se přeskočí – začátek = první zápas s ustáleným STR (předtím > 0, změna < 30)
    const startIdx = y === firstSeason
      ? ms.findIndex((m) => m.strBefore != null && m.strBefore > 0 && m.strAfter != null && Math.abs(m.strAfter - m.strBefore) < 30)
      : ms.findIndex((m) => m.strBefore != null);
    if (startIdx < 0) return [y, null] as const;
    const first = ms[startIdx].strBefore, last = [...ms.slice(startIdx)].reverse().find((m) => m.strAfter != null)?.strAfter;
    return [y, first != null && last != null ? last - first : null] as const;
  }).filter((x) => x[1] != null).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  const clubs = Array.from(new Set(p.seasons.map((s) => s.club).filter((x): x is string => !!x)));
  const seasons = [...p.seasons].sort((a, b) => b.year - a.year);
  const newest = seasons[0]?.year ?? null;
  const mutual: Match[] = !isMe && p.id ? vm.meWithLive()?.chronological.filter((m) => m.opponentId === p.id) ?? [] : [];

  return (
    <div className="col g12">
      <NavyHeader>
        <div className="row g12">
          <Avatar text={p.name} color={isMe ? C.Blue : C.Orange} size={52} />
          <div className="col w1">
            <T size={20} bold color="#fff" lines={2}>{p.name}</T>
            <Muted color={C.MutedOnNavy} size={13} maxLines={2}
              text={[p.birthYear != null ? `nar. ${p.birthYear}` : null, p.clubName, `ID ${p.id}`].filter((x) => x).join(" · ")} />
          </div>
        </div>
        <TileRow>
          <StatTile label="STR" value={`${p.currentStr ?? "–"}`} dark />
          <StatTile label="Nejvyšší" value={`${p.ster.peak ?? "–"}`} dark sub={p.ster.peakDate ?? null} />
          <StatTile label="Za sezónu" value={sezChange != null ? signedInt(sezChange) : "–"} dark
            valueColor={sezChange == null ? undefined : sezChange >= 0 ? C.WinLight : C.Peach} />
        </TileRow>
        <a href={Stis.BASE + p.path} target="_blank" rel="noopener" style={{ color: "#AFC3EE", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>Otevřít na STIS ↗</a>
      </NavyHeader>
      <div className="col g12 px16">
        <AppCard>
          <T bold>Kariéra v číslech</T>
          <div className="row g8" style={{ flexWrap: "wrap" }}>
            <Fact label="Zápasy" value={`${ch.length}`} sub={total.pct != null ? `${total.w}–${total.l} · ${Stats.pct(total.pct)}` : null} />
            <Fact label="Sezóny" value={`${bySeason.size || p.seasons.length}`} sub={clubs.length ? `${clubs.length} ${clubs.length === 1 ? "oddíl" : clubs.length < 5 ? "oddíly" : "oddílů"}` : null} />
            {best && <Fact label="Nejlepší sezóna" value={Stats.pct(best[1].pct ?? 0)} sub={`${seasonLabel(best[0])} · ${best[1].w}–${best[1].l}`} />}
            {jumps && <Fact label="Největší skok STR" value={signedInt(jumps[1] ?? 0)} sub={seasonLabel(jumps[0])} />}
          </div>
          {clubs.length > 0 && <Muted size={12} maxLines={3} text={`Oddíly: ${clubs.join(", ")}`} />}
        </AppCard>
        <AppCard><StrChart series={[{ color: isMe ? C.Blue : C.Orange, points: strPoints(p, "vse") }]} height={190} /></AppCard>
        {!isMe && me && (
          <div className="row g8">
            {mutual.length > 0 && <OButton text={`Vzájemně ${mutual.filter((m) => m.won).length}–${mutual.filter((m) => !m.won).length}`} onClick={() => vm.go({ t: "H2H", key: mutual[mutual.length - 1].opponentKey })} style={{ flex: 1 }} />}
            <OButton text="Porovnat se mnou" onClick={() => vm.go({ t: "Compare", a: me.path, b: path })} style={{ flex: 1 }} />
          </div>
        )}
        {!isMe && me && <OButton full enabled={!vm.loadingMe} text={vm.loadingMe ? "Přepínám…" : "Přepnout aplikaci na tohoto hráče"} onClick={() => vm.setProfile(p.path, () => {})} />}

        <SectionTitle text="Sezóny a družstva" />
        {!seasons.length && <Empty text="STIS neuvádí žádné sezóny." />}
        {seasons.map((s) => <SeasonBlock key={s.year} s={s} matches={bySeason.get(s.year) ?? []} newest={s.year === newest} isMe={isMe} />)}

        <SectionTitle text="Poslední zápasy" />
        <ListCard>{ch.slice(-10).reverse().map((m, i) => <MatchRow key={i} m={m} onClick={() => {}} />)}</ListCard>
        <Muted size={11} text={`Sezóna ${seasonLabel(lastSeason)} je nejnovější se zápasy.`} />
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="col" style={{ flex: "1 1 40%", background: C.Ground, borderRadius: 12, padding: "8px 10px", minWidth: 120 }}>
      <Muted text={label} size={12} />
      <BigNumber text={value} size={20} />
      {sub && <Muted text={sub} size={11} maxLines={1} />}
    </div>
  );
}

function SeasonBlock({ s, matches, newest, isMe }: { s: SeasonCard; matches: Match[]; newest: boolean; isMe: boolean }) {
  const r = rec(matches);
  return (
    <div className="col g8">
      <div className="row" style={{ padding: "0 4px" }}>
        <T bold size={15} style={{ flex: 1 }}>{`${seasonLabel(s.year)}${s.club ? ` · ${s.club}` : ""}`}</T>
        {matches.length > 0 && <T semi size={13} color={(r.pct ?? 0) >= 0.5 ? C.Win : C.OrangeText}>{`${Stats.pct(r.pct ?? 0)} (${r.w}–${r.l})`}</T>}
      </div>
      {!s.teams.length && <Muted text={s.singles ? `Dvouhry ${s.singles}` : "Bez družstva"} size={13} style={{ paddingLeft: 4 }} />}
      {s.teams.map((t, i) => <TeamBlock key={i} t={t} year={s.year} newest={newest} isMe={isMe} />)}
    </div>
  );
}

function TeamBlock({ t, year, newest, isMe }: { t: TeamMembership; year: number; newest: boolean; isMe: boolean }) {
  const [open, setOpen] = useState(newest);
  const ref = t.ref;
  useEffect(() => {
    if (!open || !ref) return;
    vm.loadTabulka(ref.svaz, ref.rocnik, ref.soutez);
    if (newest) vm.loadRoster(ref);
  }, [open, ref?.id]);
  const tab = ref ? vm.tabulky.get(Stis.tabulka(ref.svaz, ref.rocnik, ref.soutez)) : undefined;
  const row = tab?.find((r) => (ref && r.teamId === ref.id) || Stats.fold(r.name) === Stats.fold(t.name));
  const roster = ref ? vm.rosters.get(ref.id) : undefined;
  const me = vm.me;
  return (
    <AppCard padding={0}>
      <div className="row clickable" style={{ padding: "12px 14px" }} onClick={() => setOpen(!open)}>
        <div className="col w1">
          <T semi size={15} lines={1}>{t.name}</T>
          <Muted size={12} maxLines={2} text={[t.competition, t.singles ? `dvouhry ${t.singles}` : null, t.doubles ? `čtyřhry ${t.doubles}` : null, t.notOnRoster ? "mimo soupisku" : null].filter((x) => x).join(" · ")} />
        </div>
        <span style={{ color: C.Muted, fontSize: 20, transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}>⌄</span>
      </div>
      {open && (
        <div className="col g8" style={{ padding: "0 14px 12px" }}>
          <Divider />
          <div className="row g8" style={{ flexWrap: "wrap" }}>
            {t.category && <Muted text={t.category} size={13} />}
            {row && <T size={13} semi>{`${row.position}. místo · ${row.points} b. · ${row.wins}–${row.draws}–${row.losses} · skóre ${row.score}`}</T>}
            {ref && !tab && vm.compLoading.get(Stis.tabulka(ref.svaz, ref.rocnik, ref.soutez)) && <Muted text="Načítám tabulku…" size={13} />}
          </div>
          {ref && (
            <div className="row g8">
              <OButton text="Tabulka ›" onClick={() => vm.openCompetition(ref, t.competition || t.name, t.name, "tabulka")} style={{ flex: 1 }} />
              <OButton text="Žebříček STR ›" onClick={() => vm.openCompetition(ref, t.competition || t.name, t.name, "stis")} style={{ flex: 1 }} />
            </div>
          )}
          {isMe && !newest && (
            <OButton text="Zápasy za družstvo ›" onClick={() => { vm.matchesTeam = t.name; vm.matchesSeason = String(year); vm.matchesTab = "zapasy"; vm.tab(S.Matches); }} />
          )}
          {newest && ref && (
            <>
              <T bold size={13} style={{ paddingTop: 2 }}>Aktuální soupiska</T>
              {roster === undefined || roster === null ? <Muted text="Načítám soupisku…" size={13} /> : !roster.players.length ? <Muted text="Soupiska je prázdná." size={13} /> : (
                <div className="col">
                  {[...roster.players].sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).map((pl, i) => {
                    const mine = !!me && (pl.id === me.id || Stats.fold(pl.name) === Stats.fold(me.name));
                    return (
                      <div key={i} className={"row" + (pl.path ? " clickable" : "")} style={{ padding: "5px 6px", margin: "0 -6px", borderRadius: 6, background: mine ? C.Tint : undefined }}
                        onClick={pl.path ? () => vm.go({ t: "Player", path: mine ? me!.path : pl.path! }) : undefined}>
                        <Muted text={pl.order != null ? `${pl.order}.` : ""} size={12} style={{ width: 24, flex: "none" }} />
                        <T size={14} semi lines={1} color={mine ? C.Blue : undefined} style={{ flex: 1 }}>{pl.name}</T>
                        {pl.bilance && <Muted text={pl.bilance} size={12} style={{ paddingRight: 10 }} />}
                        <T size={14} bold style={{ width: 44, flex: "none", textAlign: "right" }}>{pl.str != null ? String(pl.str) : "–"}</T>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </AppCard>
  );
}

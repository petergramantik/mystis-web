// Profil hráče: hlavička, kariéra v číslech, graf STR, sezóny s rozbalovacími družstvy (soutěž, tabulka, soupiska).
import { playerLink, shareLink } from "../share";
import { useEffect, useState } from "react";
import { vm, S } from "../../app/vm";
import { Stis, type Match, type PlayerPage, type SeasonCard, type TeamMembership } from "../../core/models";
import { Stats } from "../../core/stats";
import {
  AppCard, Avatar, BigNumber, C, Divider, Empty, FormDots, KeyValue, ListCard, Loading, MatchRow, Muted, NavyHeader, OButton, SectionTitle, StatTile, StrChart, T, TileRow, signedInt,
} from "../components";
import { strPoints } from "./StrScreen";

const seasonLabel = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
const rec = (ms: Match[]) => { const w = ms.filter((m) => m.won).length; return { w, l: ms.length - w, pct: ms.length ? w / ms.length : null }; };

export function ProfileScreen({ path }: { path: string }) {
  const me = vm.me;
  const isMe = !!me && me.path === path;
  const [seasonsOpen, setSeasonsOpen] = useState(false);
  useEffect(() => { if (!isMe) vm.loadPlayer(path); }, [path, isMe]);
  const p: PlayerPage | null | undefined = isMe ? vm.meWithLive() : vm.players.get(path);
  if (!p) return <div style={{ padding: 16 }}>{vm.loadingPlayers.get(path) !== false ? <Loading /> : <Empty text="Profil hráče se nepodařilo načíst." />}</div>;

  const ch = p.chronological;
  const lastSeason = ch.length ? Math.max(...ch.map((m) => m.season)) : Stis.currentRocnik();
  const sez = strPoints(p, "sez");
  const sezChange = vm.seasonStrChange(isMe && me ? me : p) ?? (sez.length >= 2 ? sez[sez.length - 1][1] - sez[0][1] : null);
  const total = rec(ch);
  const bySeason = new Map<number, Match[]>();
  for (const m of ch) { const l = bySeason.get(m.season) ?? []; l.push(m); bySeason.set(m.season, l); }
  const best = Array.from(bySeason.entries()).filter(([, ms]) => ms.length >= 10).map(([y, ms]) => [y, rec(ms)] as const)
    .sort((a, b) => (b[1].pct ?? 0) - (a[1].pct ?? 0))[0];
  const jumps = biggestJump(strPoints(p, "vse"));
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
        <ProfileExtras p={p} />
        {!isMe && me && (
          <div className="row g8">
            {mutual.length > 0 && <OButton text={`Vzájemně ${mutual.filter((m) => m.won).length}–${mutual.filter((m) => !m.won).length}`} onClick={() => vm.go({ t: "H2H", key: mutual[mutual.length - 1].opponentKey })} style={{ flex: 1 }} />}
            <OButton text="Porovnat se mnou" onClick={() => vm.go({ t: "Compare", a: me.path, b: path })} style={{ flex: 1 }} />
          </div>
        )}
        <OButton full text="Sdílet profil" onClick={() => shareLink(p.name, `${p.name} – STR ${p.currentStr ?? "–"} (MySTIS)`, playerLink(p.path))} />
        {!isMe && me && <OButton full enabled={!vm.loadingMe} text={vm.loadingMe ? "Přepínám…" : "Přepnout aplikaci na tohoto hráče"} onClick={() => vm.setProfile(p.path, () => {})} />}

        <div className="row clickable" onClick={() => setSeasonsOpen(!seasonsOpen)} style={{ padding: "8px 4px 0" }}>
          <div className="col w1">
            <T bold size={18}>Sezóny a družstva</T>
            {!seasonsOpen && <Muted size={12} text={`${seasons.length} ${seasons.length === 1 ? "sezóna" : seasons.length < 5 ? "sezóny" : "sezón"}${clubs.length ? ` · ${clubs.length} ${clubs.length === 1 ? "oddíl" : clubs.length < 5 ? "oddíly" : "oddílů"}` : ""}`} />}
          </div>
          <span style={{ color: C.Muted, fontSize: 22, transform: seasonsOpen ? "rotate(180deg)" : undefined, transition: "transform .15s" }}>⌄</span>
        </div>
        {seasonsOpen && !seasons.length && <Empty text="STIS neuvádí žádné sezóny." />}
        {seasonsOpen && seasons.map((s) => <SeasonBlock key={s.year} s={s} matches={bySeason.get(s.year) ?? []} newest={s.year === newest} isMe={isMe} />)}

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

/**
 * Největší nárůst STR během jedné sezóny podle grafu STR (stejná data jako graf na profilu).
 * V první sezóně se přeskočí zahajovací fáze: začátek = bod po posledním velkém skoku (≥ 150) z úvodního zařazení
 * (počáteční hodnota se v grafu může opakovat, např. 13, 13, 830, 1180, 1185 …).
 */
export function seasonRanges(pts: [number, number][]): Map<number, [number, number]> {
  const bySeason = new Map<number, number[]>();
  for (const [d, v] of [...pts].sort((a, b) => a[0] - b[0])) {
    const y = Stis.currentRocnik(d);
    const l = bySeason.get(y) ?? []; l.push(v); bySeason.set(y, l);
  }
  const out = new Map<number, [number, number]>();
  if (!bySeason.size) return out;
  const firstSeason = Math.min(...bySeason.keys());
  for (const [y, vs] of bySeason) {
    let i: number;
    if (y === firstSeason) {
      let last = -1;
      for (let k = 1; k < vs.length; k++) if (Math.abs(vs[k] - vs[k - 1]) >= 150) last = k;
      i = last >= 0 ? last : vs.findIndex((v) => v > 0);
      if (i < 0 || i >= vs.length - 1) continue;
    } else {
      i = vs.findIndex((v) => v > 0);
      if (i < 0) continue;
    }
    out.set(y, [vs[i], vs[vs.length - 1]]);
  }
  return out;
}

export function biggestJump(pts: [number, number][]): readonly [number, number] | null {
  let best: readonly [number, number] | null = null;
  for (const [y, [a, b]] of seasonRanges(pts)) if (best == null || b - a > best[1]) best = [y, b - a] as const;
  return best;
}

/** Nejcennější výhry, soupeři, síla soupeřů, přehled sezón, rekordy a forma. */
function ProfileExtras({ p }: { p: PlayerPage }) {
  const ch = p.chronological;
  if (!ch.length) return null;
  const rec0 = Stats.records(p);
  // nejcennější výhry: seznam ze STIS, jinak výhry s největším rozdílem STR
  type W = { opponent: string; opponentId: string; oppStr: number | null; diff: number | null; score: string; date: string; comp: string };
  let wins: W[] = (p.ster.valuableWins ?? []).map((v) => ({ opponent: v.opponent, opponentId: v.opponentId, oppStr: v.opponentStr, diff: v.opponentStr - v.myStr, score: v.score, date: v.date, comp: v.competition }));
  if (!wins.length) wins = ch.filter((m) => m.won && m.oppStrBefore != null && m.strBefore != null)
    .sort((a, b) => (b.oppStrBefore! - b.strBefore!) - (a.oppStrBefore! - a.strBefore!))
    .map((m) => ({ opponent: m.opponent, opponentId: m.opponentId, oppStr: m.oppStrBefore, diff: m.oppStrBefore! - m.strBefore!, score: m.score, date: m.dateText, comp: m.competition }));
  wins = wins.slice(0, 10);
  const duel = (id: string, name: string) => vm.go({ t: "Duel", aId: p.id, aName: p.name, bId: id, bName: name });
  const splits = Stats.splits(ch).filter((s) => s.label.startsWith("Proti"));
  const ranges = seasonRanges(strPoints(p, "vse"));
  const seasons = Stats.seasons(p);
  const five = ch.filter((m) => m.fiveSetter), fiveW = five.filter((m) => m.won).length;
  const last10 = ch.slice(-8);
  const cur = rec0.currentStreak;
  const opp = (o: { name: string; id: string; record: string; matches: Match[] } | null, label: string, color: string) => o && (
    <div className="row clickable" style={{ padding: "4px 0" }} onClick={() => duel(o.id, o.name)}>
      <div className="col w1">
        <Muted text={label} size={12} />
        <T semi size={15} lines={1}>{o.name}</T>
      </div>
      <T bold color={color} style={{ flex: "none" }}>{`${o.record} ›`}</T>
    </div>
  );
  return (
    <>
      <SectionTitle text="Nejcennější výhry" />
      <ListCard>
        {!wins.length && <Empty text="Zatím žádné výhry se známým STR soupeře." />}
        {wins.map((w, i) => (
          <div key={i}>
            <div className="row g10 clickable" style={{ padding: "9px 14px" }} onClick={() => duel(w.opponentId, w.opponent)}>
              <T bold color={C.Muted} style={{ width: 24, flex: "none" }}>{`${i + 1}.`}</T>
              <div className="col w1">
                <T semi size={15} lines={1}>{w.opponent}</T>
                <Muted size={12} maxLines={1} text={[w.date, w.comp].filter((x) => x).join(" · ")} />
              </div>
              <div className="col" style={{ alignItems: "flex-end", flex: "none" }}>
                <T bold size={14}>{w.oppStr != null ? `STR ${w.oppStr}` : w.score}</T>
                <T size={12} semi color={C.Win}>{`${w.diff != null ? signedInt(w.diff) + " · " : ""}${w.score} ›`}</T>
              </div>
            </div>
            <Divider />
          </div>
        ))}
      </ListCard>

      <AppCard>
        <T bold>Forma</T>
        <FormDots results={last10.map((m) => m.won)} />
        <Muted size={13} text={`Posledních ${last10.length}: ${last10.filter((m) => m.won).length}–${last10.filter((m) => !m.won).length} · aktuální série ${Math.abs(cur)}× ${cur > 0 ? "výhra" : "prohra"}`} />
      </AppCard>

      <AppCard>
        <T bold>Soupeři v číslech</T>
        {opp(rec0.nemesis && rec0.nemesis.losses > rec0.nemesis.wins ? rec0.nemesis : null, "Nejtěžší soupeř (min. 3 zápasy)", C.OrangeText)}
        {opp(rec0.favourite && rec0.favourite.wins > rec0.favourite.losses ? rec0.favourite : null, "Oblíbený soupeř (min. 3 zápasy)", C.Win)}
        {opp(rec0.mostPlayed, "Nejčastější soupeř", C.Ink)}
        <Divider />
        <T semi size={14}>Podle síly soupeře</T>
        {splits.map((s, i) => (
          <div className="row" key={i} style={{ padding: "2px 0" }}>
            <T size={14} style={{ flex: 1 }}>{s.label.replace("Proti ", "")}</T>
            <T semi size={14} style={{ width: 70, textAlign: "right" }}>{`${s.wins}–${s.losses}`}</T>
            <T size={13} style={{ width: 52, textAlign: "right" }}>{s.total ? Stats.pct(s.success) : "–"}</T>
            <T size={13} bold color={s.overExpected >= 0 ? C.Win : C.OrangeText} style={{ width: 52, textAlign: "right" }}>{s.total ? (s.overExpected >= 0 ? "+" : "−") + Math.abs(s.overExpected).toFixed(1).replace(".", ",") : ""}</T>
          </div>
        ))}
        <Muted size={11} maxLines={2} text="Bilance, úspěšnost a o kolik výher víc/méně, než odpovídá STR soupeřů." />
      </AppCard>

      <AppCard>
        <T bold>Přehled sezón</T>
        <div className="row">
          <Muted text="SEZÓNA" size={11} style={{ flex: 1 }} />
          <Muted text="ZÁPASY" size={11} style={{ width: 96, textAlign: "right" }} />
          <Muted text="STR" size={11} style={{ width: 128, textAlign: "right" }} />
        </div>
        {seasons.map((s) => {
          const r = ranges.get(s.year);
          const a = r?.[0] ?? s.strStart, b = r?.[1] ?? s.strEnd;
          const ch2 = a != null && b != null ? b - a : null;
          return (
            <div className="row" key={s.year} style={{ padding: "3px 0" }}>
              <T semi size={13} style={{ flex: 1, whiteSpace: "nowrap" }}>{seasonLabel(s.year)}</T>
              <T size={12} style={{ width: 96, textAlign: "right", whiteSpace: "nowrap", flex: "none" }}>{`${s.wins}–${s.losses} · ${Stats.pct(s.success)}`}</T>
              <T size={12} style={{ width: 128, textAlign: "right", whiteSpace: "nowrap", flex: "none" }}>
                {a != null && b != null ? `${a}→${b} ` : "–"}
                {ch2 != null && <span style={{ color: C.delta(ch2), fontWeight: 700 }}>{signedInt(ch2)}</span>}
              </T>
            </div>
          );
        })}
      </AppCard>

      <AppCard>
        <T bold>Rekordy</T>
        <KeyValue label="Nejdelší série výher" value={rec0.longestWin.length ? `${rec0.longestWin.length} (${rec0.longestWin.from?.dateText ?? ""} – ${rec0.longestWin.to?.dateText ?? ""})` : "–"} />
        <KeyValue label="Pětisetové zápasy" value={five.length ? `${fiveW}–${five.length - fiveW}` : "–"} />
        {rec0.worstLoss && (
          <div className="row clickable" style={{ padding: "3px 0" }} onClick={() => duel(rec0.worstLoss!.opponentId, rec0.worstLoss!.opponent)}>
            <div className="col w1">
              <Muted text="Nejbolestivější prohra" size={14} />
              <T size={13} lines={1}>{`${rec0.worstLoss.opponent} · ${rec0.worstLoss.dateText}`}</T>
            </div>
            <T bold color={C.OrangeText} style={{ flex: "none" }}>{`${rec0.worstLoss.score} · STR ${rec0.worstLoss.oppStrBefore ?? "?"} (${signedInt((rec0.worstLoss.oppStrBefore ?? 0) - (rec0.worstLoss.strBefore ?? 0))}) ›`}</T>
          </div>
        )}
      </AppCard>
    </>
  );
}

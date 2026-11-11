import { ModelToggle } from "../modelToggle";
import { useEffect, useState } from "react";
import { vm, S } from "../../app/vm";
import { Stis, type PlayerPage, type TeamRoster } from "../../core/models";
import { Stats, StrModel } from "../../core/stats";
import type { SearchPlayer } from "../../core/search";
import {
  AppCard, BigNumber, Empty, TextField, C, Chips, Divider, ErrorBox, Legend, ListCard, Loading, Muted, Pill, SectionTitle, StrChart, T, signedInt,
} from "../components";
import { strPoints } from "./StrScreen";
import { TeamForecast } from "./NextMatch";

export function CaptainScreen() {
  const me = vm.me;
  const myTeamIds = me ? vm.repo.myTeams(me).map((t) => t.ref?.id).filter((x): x is string => !!x) : [];
  const base: TeamRoster[] = vm.club.rosters.length ? vm.club.rosters : vm.next.map((c) => ({ team: c.myTeam.ref, name: c.myTeam.name, players: c.myRoster }));
  const rosters = [...base].sort((a, b) => (myTeamIds.includes(a.team?.id ?? "") ? 0 : 1) - (myTeamIds.includes(b.team?.id ?? "") ? 0 : 1));
  const [sel, setSel] = useState(rosters.find((r) => myTeamIds.includes(r.team?.id ?? ""))?.team?.id ?? rosters[0]?.team?.id ?? "");
  if (!me) return <Loading />;
  if (!rosters.length) {
    return <div className="col g12 px16">{vm.loadingClub || vm.loadingNext ? <Loading text="Načítám soupisky…" /> : <ErrorBox text="Soupisky družstev nejsou k dispozici." onRetry={() => vm.loadClub(true)} />}</div>;
  }
  const roster0 = rosters.find((r) => r.team?.id === sel) ?? rosters[0];
  const roster = { ...roster0, players: vm.fresh(roster0.players) };
  const lineupP = vm.lineupFor(roster.name, roster.team, roster.players);
  const lineup = lineupP.map((x) => x[0]);
  const ctx = vm.next.find((c) => c.myTeam.ref?.id === roster.team?.id);
  return (
    <div className="col g12 px16">
      <Chips options={rosters.filter((r) => r.team?.id).map((r) => [r.team!.id, r.name])} selected={sel} onSelect={setSel} />
      <AppCard>
        <T bold size={17}>Doporučená sestava</T>
        <Muted size={13} maxLines={3} text="Stabilní hráči (aspoň třetina utkání družstva) podle STR a formy; chybějící místa doplní náhradníci s nejvíc odehranými utkáními." />
        {lineup.map((p, i) => (
          <div className="row g10" key={i}>
            <BigNumber text={`${i + 1}.`} color={C.Orange} size={20} style={{ width: 30, flex: "none" }} />
            <T semi style={{ flex: 1 }}>{p.name + (lineupP[i]?.[1] ? " (náhradník)" : "")}</T>
            <T bold>{`${p.str ?? "–"}`}</T>
            <T size={13} end color={C.delta(p.strChange)} style={{ width: 40, flex: "none" }}>{signedInt(p.strChange)}</T>
          </div>
        ))}
      </AppCard>
      {ctx?.next != null && ctx.opponentRoster.length > 0 && (
        <>
          <SectionTitle text={`Proti ${ctx.opponentName}`} action="Rozbor ›" onAction={() => vm.go(S.NextMatch)} />
          <TeamForecast me={me} minePick={lineupP} theirsPick={vm.lineupFor(ctx.opponentName, ctx.opponentRef, vm.fresh(ctx.opponentRoster))} fmt={vm.format}
            theirRoster={ctx.opponentRoster} theirRef={ctx.opponentRef} />
        </>
      )}
      <SectionTitle text="Celá soupiska" />
      <ListCard>
        <div className="row" style={{ padding: "8px 14px" }}>
          <Muted text="HRÁČ" size={12} style={{ flex: 1 }} />
          <Muted text="STR" size={12} style={{ width: 50 }} />
          <Muted text="±" size={12} style={{ width: 40 }} />
          <Muted text="ODEHRÁNO" size={12} style={{ width: 80 }} />
        </div>
        <Divider />
        {[...roster.players].sort((a, b) => (b.str ?? 0) - (a.str ?? 0)).map((p, i) => {
          const inLineup = lineup.some((x) => x.name === p.name);
          return (
            <div key={i}>
              <div className="row clickable" style={{ background: inLineup ? C.Tint : "#fff", padding: "10px 14px" }}
                onClick={() => { if (p.path) { if (p.id === me.id) vm.tab(S.Str); else vm.go({ t: "Player", path: p.path }); } }}>
                <div className="col w1">
                  <T semi lines={1}>{p.name}</T>
                  {p.ranking && <Muted text={p.ranking} size={12} maxLines={1} />}
                </div>
                <T bold style={{ width: 50, flex: "none" }}>{`${p.str ?? "–"}`}</T>
                <T size={13} color={C.delta(p.strChange)} style={{ width: 40, flex: "none" }}>{signedInt(p.strChange)}</T>
                <div className="col" style={{ width: 80, flex: "none" }}>
                  <T size={14}>{p.bilance != null ? `${p.played} dvouher` : "–"}</T>
                  {p.bilance && <Muted text={p.bilance} size={12} />}
                </div>
              </div>
              <Divider />
            </div>
          );
        })}
      </ListCard>
      <div className="row g8"><Pill text="modře = doporučená sestava" /></div>
      <div style={{ height: 8 }} />
    </div>
  );
}

const rate = (w: number, n: number) => (n === 0 ? null : w / n);
const cmp = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || a === b ? 0 : a > b ? 1 : -1);

function CompareRow({ label, a, b, better = 0, bold }: { label: string; a: string; b: string; better?: number; bold?: boolean }) {
  return (
    <div className="row" style={{ padding: "4px 0" }}>
      <Muted text={label} size={13} style={{ flex: 1 }} />
      <T size={14} end lines={1} bold={bold || better > 0} color={better > 0 ? C.Win : C.Ink} style={{ width: 100, flex: "none", paddingLeft: 6 }}>{a}</T>
      <T size={14} end lines={1} bold={bold || better < 0} color={better < 0 ? C.Win : C.Ink} style={{ width: 100, flex: "none", paddingLeft: 6 }}>{b}</T>
    </div>
  );
}

/** Výběr hráče pro porovnání: zvolený hráč, hledání na STIS a rychlé návrhy (já, oddíl, nejčastější soupeři). */
function PlayerPick({ label, value, name, onPick, offerMe }: { label: string; value: string; name: string | null; onPick: (path: string, name: string) => void; offerMe: boolean }) {
  const me = vm.me;
  const [q, setQ] = useState("");
  const [res, setRes] = useState<SearchPlayer[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(!value);
  const search = () => {
    const t = q.trim();
    if (t.length < 2) return;
    setBusy(true); setErr(null);
    vm.searchPlayers(t, (r, e) => { setBusy(false); setRes(r); setErr(e); });
  };
  const pick = (path: string, n: string) => { onPick(path, n); setOpen(false); setQ(""); setRes(null); };
  // rychlé návrhy: oddíl (interní žebříček) a nejčastější soupeři
  const club = me ? vm.club.ladder.filter((e) => e.path && e.id !== me.id).slice(0, 6).map((e) => [e.path!, e.name] as [string, string]) : [];
  const opps = me ? Stats.opponents(me).filter((o) => o.matches.some((m) => m.opponentPath)).slice(0, 6)
    .map((o) => [o.matches.find((m) => m.opponentPath)!.opponentPath, o.name] as [string, string]) : [];
  const chip = (path: string, n: string, k: string) => (
    <button key={k} className={"chip" + (path === value ? " on" : "")} style={{ height: 32, fontSize: 13 }} onClick={() => pick(path, n)}>{n}</button>
  );
  return (
    <AppCard>
      <div className="row clickable" onClick={() => setOpen(!open)}>
        <div className="col w1">
          <Muted text={label} size={12} />
          <T bold size={16} lines={1} color={value ? C.Ink : C.Muted}>{value ? name ?? "Hráč" : "Vyberte hráče"}</T>
        </div>
        <T bold color={C.Blue} style={{ flex: "none" }}>{open ? "Zavřít" : "Změnit ›"}</T>
      </div>
      {open && <>
        {offerMe && me && <div className="row g6" style={{ flexWrap: "wrap" }}>{chip(me.path, `Já (${me.name})`, "me")}</div>}
        <TextField value={q} onChange={setQ} icon="search" label="Hledat hráče na STIS (jméno)" onEnter={search} />
        <div className="row g8"><button className="chip on" style={{ height: 34 }} onClick={search}>{busy ? "Hledám…" : "Hledat"}</button></div>
        {err && <Muted text={err} color={C.OrangeText} size={12} maxLines={3} />}
        {res && !res.length && <Muted text="Nikoho takového STIS nenašel." size={13} />}
        {res && res.slice(0, 15).map((r) => (
          <div key={r.path} className="row clickable" style={{ padding: "6px 0" }} onClick={() => pick(r.path, r.name)}>
            <div className="col w1">
              <T semi size={14} lines={1}>{r.name}</T>
              <Muted size={12} maxLines={1} text={[r.club, r.birthYear ? `nar. ${r.birthYear}` : null, r.str != null ? `STR ${r.str}` : null].filter((x) => x).join(" · ")} />
            </div>
            <T color={C.Blue} style={{ flex: "none" }}>›</T>
          </div>
        ))}
        {!res && club.length > 0 && <><Muted text="Hráči oddílu" size={12} /><div className="row g6" style={{ flexWrap: "wrap" }}>{club.map(([p, n]) => chip(p, n, "c" + p))}</div></>}
        {!res && opps.length > 0 && <><Muted text="Nejčastější soupeři" size={12} /><div className="row g6" style={{ flexWrap: "wrap" }}>{opps.map(([p, n]) => chip(p, n, "o" + p))}</div></>}
      </>}
    </AppCard>
  );
}

const signedDec = (x: number) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(1).replace(".", ",");

export function CompareScreen({ a0, b0 }: { a0: string | null; b0: string | null }) {
  const me = vm.me;
  const [a, setA] = useState(a0 ?? me?.path ?? "");
  const [b, setB] = useState(b0 ?? "");
  const [names, setNames] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState("3r");
  const page = (p: string): PlayerPage | null => (me && p === me.path ? vm.meWithLive() ?? me : vm.players.get(p) ? vm.withLive(vm.players.get(p)!) : null);
  const pa = a ? page(a) : null, pb = b ? page(b) : null;
  useEffect(() => {
    if (a && a !== me?.path) vm.loadPlayer(a);
    if (b && b !== me?.path) vm.loadPlayer(b);
  }, [a, b]);
  const nameOf = (p: string) => (p ? page(p)?.name ?? names[p] ?? (me && p === me.path ? me.name : null) : null);
  const season = Stis.currentRocnik();
  return (
    <div className="col g12 px16">
      <PlayerPick label="Hráč 1" value={a} name={nameOf(a)} offerMe onPick={(p, n) => { setA(p); setNames({ ...names, [p]: n }); }} />
      <div className="row" style={{ justifyContent: "center", marginTop: -6, marginBottom: -6 }}>
        <button className="chip" style={{ height: 30 }} onClick={() => { setA(b); setB(a); }} aria-label="Prohodit hráče">⇅ prohodit</button>
      </div>
      <PlayerPick label="Hráč 2" value={b} name={nameOf(b)} offerMe={a !== me?.path} onPick={(p, n) => { setB(p); setNames({ ...names, [p]: n }); }} />
      {!a || !b ? <Muted size={13} maxLines={3} text="Vyberte oba hráče – hledat lze kohokoli ze STIS." />
        : !pa || !pb ? ((vm.loadingPlayers.get(a) !== false || vm.loadingPlayers.get(b) !== false) ? <Loading text="Načítám profily hráčů…" /> : <Empty text="Profil hráče se nepodařilo načíst." />) : (() => {
        const sa = pa.chronological.filter((m) => m.season === season), sb = pb.chronological.filter((m) => m.season === season);
        const ra = Stats.records(pa), rb = Stats.records(pb);
        const fa = Stats.form(pa), fb = Stats.form(pb);
        const fiveA = pa.chronological.filter((m) => m.fiveSetter), fiveB = pb.chronological.filter((m) => m.fiveSetter);
        const w = (l: { won: boolean }[]) => l.filter((m) => m.won).length;
        const mutual = pa.chronological.filter((m) => m.opponentId && m.opponentId === pb.id);
        const strA = pa.currentStr, strB = pb.currentStr;
        const h2h = vm.complexOn && pa.id && pb.id ? vm.pairInfo(pa.id, pb.id) : null;
        const first = (n: string) => n.split(" ")[0];
        return (
          <>
            {strA != null && strB != null && (() => {
              const p = StrModel.winProbability(strA + (h2h?.adj ?? 0), strB), pBase = StrModel.winProbability(strA, strB);
              const fav = p >= 0.5 ? pa.name : pb.name;
              return (
                <AppCard>
                  <div className="row g8">
                    <T bold style={{ flex: 1 }}>{Math.abs(p - 0.5) < 0.005 ? "Vzájemný zápas: vyrovnané" : `Vzájemný zápas: favorit ${first(fav)}`}</T>
                    <ModelToggle />
                  </div>
                  <div className="row" style={{ height: 9, borderRadius: 5, overflow: "hidden" }}>
                    <div style={{ width: `${p * 100}%`, background: C.Blue, height: "100%" }} />
                    <div style={{ flex: 1, background: C.Orange, opacity: 0.85, height: "100%" }} />
                  </div>
                  <div className="row">
                    <T size={14} bold color={C.Blue} style={{ flex: 1 }}>{`${first(pa.name)} ${Stats.pct(p)}`}</T>
                    <T size={14} bold color={C.Orange}>{`${Stats.pct(1 - p)} ${first(pb.name)}`}</T>
                  </div>
                  {vm.complexOn && <Muted size={12} maxLines={2} text={h2h && h2h.games ? `STR+: vzájemná korekce ${first(pa.name)} ${signedInt(h2h.adj)} STR z ${h2h.games} zápasů · podle samotného STR ${Stats.pct(pBase)} : ${Stats.pct(1 - pBase)}` : "STR+: vzájemná korekce je nulová, šance je stejná jako podle STR."} />}
                  <Muted size={13} maxLines={3} text={`${first(pa.name)}: výhra +${StrModel.gainIfWin(strA, strB)} / prohra −${-StrModel.lossIfLose(strA, strB)} · ${first(pb.name)}: výhra +${StrModel.gainIfWin(strB, strA)} / prohra −${-StrModel.lossIfLose(strB, strA)} STR`} />
                  {pa.id && pb.id && <span className="clickable" style={{ color: C.Blue, fontWeight: 600, fontSize: 14 }} onClick={() => vm.go({ t: "Duel", aId: pa.id, aName: pa.name, bId: pb.id, bName: pb.name })}>{mutual.length ? `Vzájemné zápasy (${w(mutual)}–${mutual.length - w(mutual)}) ›` : "Detail dvojice ›"}</span>}
                </AppCard>
              );
            })()}
            <AppCard>
              <Chips options={[["1r", "1 rok"], ["3r", "3 roky"], ["vse", "Vše"]]} selected={period} onSelect={setPeriod} />
              <StrChart series={[{ color: C.Blue, points: strPoints(pa, period) }, { color: C.Orange, points: strPoints(pb, period) }]} />
              <Legend items={[[C.Blue, pa.name], [C.Orange, pb.name]]} />
            </AppCard>
            <SectionTitle text="Srovnání" />
            <AppCard>
              <div className="row" style={{ padding: "4px 0" }}>
                <div style={{ flex: 1 }} />
                <T size={14} end lines={1} bold color={C.Blue} className="clickable" style={{ width: 100, flex: "none", paddingLeft: 6 }}><span onClick={() => vm.go({ t: "Player", path: pa.path })}>{pa.name} ›</span></T>
                <T size={14} end lines={1} bold color={C.Blue} className="clickable" style={{ width: 100, flex: "none", paddingLeft: 6 }}><span onClick={() => vm.go({ t: "Player", path: pb.path })}>{pb.name} ›</span></T>
              </div>
              <CompareRow label="STR" a={`${pa.currentStr ?? "–"}`} b={`${pb.currentStr ?? "–"}`} better={cmp(pa.currentStr, pb.currentStr)} />
              <CompareRow label="Nejvyšší STR" a={`${pa.ster.peak ?? "–"}`} b={`${pb.ster.peak ?? "–"}`} better={cmp(pa.ster.peak, pb.ster.peak)} />
              <CompareRow label="Sezóna" a={`${w(sa)}–${sa.length - w(sa)}`} b={`${w(sb)}–${sb.length - w(sb)}`} better={cmp(rate(w(sa), sa.length), rate(w(sb), sb.length))} />
              <CompareRow label="Kariéra" a={`${ra.wins}–${ra.losses}`} b={`${rb.wins}–${rb.losses}`} better={cmp(rate(ra.wins, ra.totalMatches), rate(rb.wins, rb.totalMatches))} />
              <CompareRow label="Nejdelší série výher" a={`${ra.longestWin.length}`} b={`${rb.longestWin.length}`} better={cmp(ra.longestWin.length, rb.longestWin.length)} />
              <CompareRow label="Forma (posl. 8)" a={`${fa.wins}–${fa.losses}`} b={`${fb.wins}–${fb.losses}`} better={cmp(fa.wins, fb.wins)} />
              <CompareRow label="Výkon ve formě" a={fa.lastRated ? signedDec(fa.lastOver) : "–"} b={fb.lastRated ? signedDec(fb.lastOver) : "–"} better={cmp(fa.lastRated ? fa.lastOver : null, fb.lastRated ? fb.lastOver : null)} />
              <CompareRow label="Pětisetové" a={`${w(fiveA)}–${fiveA.length - w(fiveA)}`} b={`${w(fiveB)}–${fiveB.length - w(fiveB)}`} better={cmp(rate(w(fiveA), fiveA.length), rate(w(fiveB), fiveB.length))} />
            </AppCard>
            {mutual.length > 0 && (
              <>
                <SectionTitle text={`Vzájemně: ${w(mutual)}–${mutual.length - w(mutual)}`} />
                <AppCard>{[...mutual].reverse().map((m, i) => <Muted key={i} text={`${m.dateText} · ${m.score} · ${m.competition}`} color={C.Ink} size={14} maxLines={1} />)}</AppCard>
              </>
            )}
          </>
        );
      })()}
      <div style={{ height: 8 }} />
    </div>
  );
}

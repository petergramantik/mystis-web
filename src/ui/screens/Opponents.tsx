import { useEffect, useState } from "react";
import { vm } from "../../app/vm";
import type { Match } from "../../core/models";
import { ClubStat, OpponentStat, Stats, StrModel, sum } from "../../core/stats";
import {
  AppCard, Avatar, BigNumber, C, Chips, DMY, Divider, Empty, HeaderPlayer, ListCard, Loading, Muted, NavyHeader, OButton, Pill, ProbBar,
  ResultBadge, SectionTitle, Segmented, StatTile, T, TextField, TileRow, dec1, signedInt, Icon,
} from "../components";

export function OpponentsScreen() {
  const meAll = vm.meWithLive();
  const [query, setQuery] = useState("");
  if (!meAll) return <Loading />;
  const mode = vm.oppMode;
  const comps = Array.from(new Set([...meAll.chronological].reverse().map((m) => m.competition).filter((c) => c.trim())));
  // výchozí: hlavní soutěž (soutěž družstva, za které hraji nejvíc) – poslední soutěž zápasů za toto družstvo
  const mainTeam = vm.next[vm.mainTeamIndex]?.myTeam.name;
  const mainComp = mainTeam ? [...meAll.chronological].reverse().find((m) => Stats.fold(m.myTeam) === Stats.fold(mainTeam) && m.competition.trim())?.competition : undefined;
  const saved = vm.prefs.oppComp;
  const comp = saved === "all" || (saved && comps.includes(saved)) ? saved : mainComp && comps.includes(mainComp) ? mainComp : "all";
  const me = comp === "all" ? meAll : meAll.copy({ matches: meAll.matches.filter((m) => m.competition === comp) });
  const opps = Stats.opponents(me);
  const clubs = Stats.clubsOf(opps);
  return (
    <div className="col g10 px16">
      <div className="row g8">
        <div style={{ flex: 1 }}><Segmented options={[["name", "Podle jména"], ["club", "Podle klubu"]]} selected={mode} onSelect={(k) => { vm.set("oppMode", k); setQuery(""); }} /></div>
        <button className="chip" onClick={() => vm.go({ t: "Compare", a: null, b: null })} style={{ height: 40, borderRadius: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="compare" size={18} />Porovnat
        </button>
      </div>
      <TextField value={query} onChange={setQuery} icon="search" label={mode === "club" ? "Název klubu, např. Slavoj" : "Jméno soupeře"} />
      {comps.length > 1 && <Chips options={[["all", "Všichni"], ...comps.map((c) => [c, c] as [string, string])]} selected={comp} onSelect={(k) => { vm.prefs.oppComp = k; vm.emit(); }} />}
      <T size={14} color={C.Muted} style={{ padding: "0 4px" }}>{`${opps.length} soupeřů z ${clubs.length} klubů`}</T>
      {mode === "club" ? (() => {
        const list = Stats.searchClubs(me, query);
        return (
          <>
            <T size={13} bold color={C.Muted}>KLUBY PODLE POČTU ZÁPASŮ</T>
            <ListCard>
              {!list.length && <Empty text="Žádný klub neodpovídá hledání." />}
              {list.slice(0, 150).map((c) => <ClubRow key={c.club} c={c} onClick={() => vm.go({ t: "Club", name: c.club })} />)}
            </ListCard>
          </>
        );
      })() : (() => {
        const list = Stats.searchOpponents(me, query);
        return (
          <>
            <T size={13} bold color={C.Muted}>{query ? "VÝSLEDKY HLEDÁNÍ" : "NEJČASTĚJŠÍ SOUPEŘI"}</T>
            <ListCard>
              {!list.length && <Empty text="Nikoho takového jste zatím nepotkali." />}
              {list.slice(0, 150).map((o) => <OpponentRow key={o.key} o={o} myStr={me.currentStr} onClick={() => vm.go({ t: "H2H", key: o.key })} />)}
            </ListCard>
          </>
        );
      })()}
      <div style={{ height: 8 }} />
    </div>
  );
}

function ClubRow({ c, onClick }: { c: ClubStat; onClick: () => void }) {
  return (
    <>
      <div className="row g12 clickable" style={{ padding: "11px 14px" }} onClick={onClick}>
        <Avatar text={c.club} color={C.Blue} size={40} square />
        <div className="col w1">
          <T semi size={16} lines={1}>{c.club}</T>
          <Muted text={`${c.opponents.length} soupeřů · ${c.matches} zápasů`} maxLines={1} />
        </div>
        <div className="col" style={{ alignItems: "flex-end" }}>
          <BigNumber text={`${c.wins}–${c.losses}`} size={20} />
          <Muted text={Stats.pct(c.success)} size={12} />
        </div>
      </div>
      <Divider />
    </>
  );
}

export function OpponentRow({ o, myStr, onClick }: { o: OpponentStat; myStr: number | null; onClick: () => void }) {
  const ls = o.lastStr;
  return (
    <>
      <div className="row g12 clickable" style={{ padding: "11px 14px" }} onClick={onClick}>
        <Avatar text={o.name} color={C.Grey} size={40} />
        <div className="col w1">
          <T semi size={16} lines={1}>{o.name}</T>
          <Muted text={`${o.team}${ls != null ? ` · STR ${ls}` : ""}${o.last?.date != null ? ` · ${DMY(o.last.date)}` : ""}`} maxLines={1} />
        </div>
        <div className="col" style={{ alignItems: "flex-end" }}>
          <BigNumber text={o.record} color={o.wins >= o.losses ? C.Win : C.OrangeText} size={20} />
          {myStr != null && ls != null && <Muted text={`šance ${Stats.pct(StrModel.winProbability(myStr, ls))}`} size={12} />}
        </div>
      </div>
      <Divider />
    </>
  );
}

export function ClubScreen({ club }: { club: string }) {
  const me = vm.meWithLive();
  const [sort, setSort] = useState("often");
  if (!me) return <Loading />;
  const c = Stats.clubs(me).find((x) => x.club === club);
  if (!c) return <Empty text="Klub nenalezen." />;
  const list = sort === "str" ? [...c.opponents].sort((a, b) => (b.lastStr ?? 0) - (a.lastStr ?? 0))
    : sort === "last" ? [...c.opponents].sort((a, b) => (b.last?.date ?? -1e9) - (a.last?.date ?? -1e9))
      : sort === "worst" ? [...c.opponents].sort((a, b) => (b.losses - b.wins) - (a.losses - a.wins))
        : c.opponents;
  return (
    <div className="col g10">
      <NavyHeader>
        <div className="row g12">
          <Avatar text={c.club} color={C.Blue} size={52} square />
          <div className="col w1">
            <T size={24} bold color="#fff">{c.club}</T>
            <Muted text={Array.from(new Set(c.opponents.map((o) => o.team))).join(", ")} color={C.MutedOnNavy} size={14} />
          </div>
        </div>
        <TileRow>
          <StatTile label="Zápasů" value={`${c.matches}`} dark />
          <StatTile label="Bilance" value={`${c.wins}–${c.losses}`} dark />
          <StatTile label="Úspěšnost" value={Stats.pct(c.success)} dark />
        </TileRow>
      </NavyHeader>
      <Chips style={{ padding: "1px 16px" }} options={[["often", "Nejčastější"], ["str", "Nejsilnější"], ["last", "Naposledy"], ["worst", "Nejhorší bilance"]]} selected={sort} onSelect={setSort} />
      <div className="px16"><ListCard>{list.map((o) => <OpponentRow key={o.key} o={o} myStr={me.currentStr} onClick={() => vm.go({ t: "H2H", key: o.key })} />)}</ListCard></div>
      <div style={{ height: 8 }} />
    </div>
  );
}

export function H2HScreen({ oppKey }: { oppKey: string }) {
  const me = vm.meWithLive();
  const o = me ? Stats.opponents(me).find((x) => x.key === oppKey) ?? null : null;
  let oppPath: string | null = null;
  if (o) {
    for (let i = o.matches.length - 1; i >= 0; i--) if (o.matches[i].opponentPath) { oppPath = o.matches[i].opponentPath; break; }
    if (!oppPath && o.id) oppPath = `/hrac-${o.id}`;
  }
  // aktuální STR soupeře ze stránky hráče (STR z posledního vzájemného zápasu může být staré)
  useEffect(() => { if (oppPath) vm.loadPlayer(oppPath); }, [oppPath]);
  if (!me) return <Loading />;
  if (!o) return <Empty text="Soupeř nenalezen." />;
  const myStr = me.currentStr;
  const oppStr = (oppPath ? vm.players.get(oppPath)?.currentStr : null) ?? o.lastStr;
  const p = myStr != null && oppStr != null ? StrModel.winProbability(myStr, oppStr) : null;
  const five = o.matches.filter((m) => m.fiveSetter);
  const dSum = sum(o.matches.map((m) => m.delta).filter((x): x is number => x != null));
  return (
    <div className="col g12">
      <NavyHeader>
        <div className="rowt">
          <HeaderPlayer name={me.name} str={myStr} team={o.last?.myTeam ?? ""} color={C.Blue} />
          <div className="col" style={{ alignItems: "center", paddingTop: 8, flex: "none" }}>
            <BigNumber text={`${o.wins} : ${o.losses}`} color="#fff" size={52} style={{ whiteSpace: "nowrap" }} />
            <Muted text={`sety ${o.setsFor} : ${o.setsAgainst}`} color={C.MutedOnNavy} />
          </div>
          <HeaderPlayer name={o.name} str={oppStr} team={o.team} color={C.Orange} />
        </div>
      </NavyHeader>
      <div className="col g12 px16">
        {p != null && myStr != null && oppStr != null && (
          <AppCard>
            <div className="row"><T bold style={{ flex: 1 }}>Šance na výhru v dalším zápase</T><BigNumber text={Stats.pct(p)} color={p >= 0.5 ? C.Win : C.OrangeText} size={24} /></div>
            <ProbBar p={p} />
            <Muted size={13} text={`Rozdíl STR ${signedInt(myStr - oppStr)} · výhra +${StrModel.gainIfWin(myStr, oppStr)} · prohra −${-StrModel.lossIfLose(myStr, oppStr)} STR`} />
          </AppCard>
        )}
        <TileRow>
          <StatTile label="Pětisetové" value={`${five.filter((m) => m.won).length}–${five.filter((m) => !m.won).length}`} />
          <StatTile label="Hladké 3:0" value={`${o.matches.filter((m) => m.setsFor === 3 && m.setsAgainst === 0).length}–${o.matches.filter((m) => m.setsFor === 0 && m.setsAgainst === 3).length}`} />
          <StatTile label="Změna STR" value={signedInt(dSum)} valueColor={C.delta(dSum)} />
        </TileRow>
        {oppPath && (
          <div className="row g8">
            <OButton text="Profil soupeře" onClick={() => vm.go({ t: "Player", path: oppPath! })} style={{ flex: 1 }} />
            <OButton text="Porovnat" onClick={() => vm.go({ t: "Compare", a: me.path, b: oppPath })} style={{ flex: 1 }} />
          </div>
        )}
        <SectionTitle text="Všechny vzájemné zápasy" />
        <ListCard>{[...o.matches].reverse().map((m, i) => <H2HMatch key={i} m={m} myId={me.id} oppId={o.id} />)}</ListCard>
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

function H2HMatch({ m, myId, oppId }: { m: Match; myId: string; oppId: string }) {
  useEffect(() => { vm.loadZapis(m.zapisPath); }, [m.zapisPath]);
  const z = vm.zapisy.get(m.zapisPath);
  const game = z?.games.find((g) => !g.doubles && [...g.homeIds, ...g.awayIds].includes(myId) && [...g.homeIds, ...g.awayIds].includes(oppId));
  return (
    <>
      <div className="col g6" style={{ padding: "12px 14px" }}>
        <div className="row">
          <div className="col w1">
            <T bold>{m.date != null ? DMY(m.date) : m.dateText}</T>
            <Muted text={`${m.competition}${m.delta != null ? ` · STR ${signedInt(m.delta)}` : ""}`} maxLines={1} />
            {m.unofficial && <T size={11} bold color={C.Live}>neoficiální · odhad podle online zápisu</T>}
          </div>
          <ResultBadge won={m.won} text={m.score} wide />
        </div>
        {game ? (
          <div className="flow" style={{ gap: "6px 8px" }}>
            {game.sets.map((v, i) => {
              const home = game.homeIds.includes(myId);
              const iWon = home ? v > 0 : v < 0;
              const pts = Math.abs(v);
              const other = pts >= 10 ? pts + 2 : 11;
              return <Pill key={i} text={iWon ? `${other}:${pts}` : `${pts}:${other}`} bg={iWon ? C.WinTint : C.LossTint} fg={iWon ? C.Win : "#B23A0B"} />;
            })}
          </div>
        ) : m.zapisPath && !z ? <Muted text="načítám sety…" size={12} /> : null}
      </div>
      <Divider />
    </>
  );
}

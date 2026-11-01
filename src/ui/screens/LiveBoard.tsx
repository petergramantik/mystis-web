// Živě: utkání vybraného dne ve sledovaných soutěžích, sledování utkání (max. 5) s vlastním upozorněním,
// a obrazovka sledovaného (cizího) utkání.
import { useEffect, useState } from "react";
import { vm, MAX_WATCHED, type LiveComp, type Watched } from "../../app/vm";
import { Stis, type LosMatch, type TeamRef } from "../../core/models";
import { Stats } from "../../core/stats";
import { Live } from "../../core/live";
import { ldtDate, nowLdt, today } from "../../core/dates";
import type { SearchClub } from "../../core/search";
import { AppCard, C, Chips, Dialog, Divider, Empty, ListCard, Loading, Muted, OButton, Segmented, T, TextField } from "../components";
import { hhmmLdt } from "../fmt";
import { GameRow, ScoreHeader } from "./LiveMatch";
import { useZapisRefresh } from "../zapis";

type Status = { kind: "future" | "live" | "done"; text: string; h: number | null; a: number | null };

/** Stav utkání: konečný výsledek, průběžný stav (z rozpisu nebo zápisu), nebo čas začátku. */
function statusOf(m: LosMatch): Status {
  const z = m.zapisPath ? vm.zapisy.get(m.zapisPath) : undefined;
  const now = nowLdt();
  const sm = /^(\d+)\s*:\s*(\d+)$/.exec(m.score);
  if (z && z.games.length) {
    const [h, a] = z.score;
    if (Live.isZapisFinished(z, vm.format)) return { kind: "done", text: `${h} : ${a}`, h, a };
    return { kind: "live", text: `${h} : ${a} · ${z.games.filter((g) => g.result != null).length}/${z.games.length || vm.format.games}`, h, a };
  }
  if (sm) {
    const h = +sm[1], a = +sm[2];
    if (vm.scoreFinal(m.score)) return { kind: "done", text: `${h} : ${a}`, h, a };
    if (m.dateTime != null && m.dateTime > now - 5 * 60) return { kind: "live", text: `${h} : ${a}`, h, a };
    return { kind: "done", text: `${h} : ${a}`, h, a };
  }
  if (m.dateTime != null && m.dateTime <= now && m.dateTime > now - 5 * 60) return { kind: "live", text: "začalo", h: null, a: null };
  return { kind: "future", text: m.dateTime != null ? hhmmLdt(m.dateTime) : m.dateText, h: null, a: null };
}

/** Barva výsledku z pohledu fandění (domácí výchozí); null = neutrálně. */
function scoreColor(st: Status, fan: Watched["fan"] | "home"): string {
  if (st.h == null || st.a == null || fan === "none") return C.Ink;
  const my = fan === "away" ? st.a : st.h, op = fan === "away" ? st.h : st.a;
  return my > op ? C.Win : my < op ? C.OrangeText : C.Muted;
}

const MODE_LABEL: Record<Watched["mode"], string> = { off: "🔕 Vypnuto", games: "🔔 Hry", sets: "🔔 Sety" };
const FAN_LABEL: Record<Watched["fan"], string> = { home: "Fandím: domácí", away: "Fandím: hosté", none: "Fandím: nikomu" };
const nextMode = (m: Watched["mode"]): Watched["mode"] => (m === "off" ? "games" : m === "games" ? "sets" : "off");
const nextFan = (f: Watched["fan"]): Watched["fan"] => (f === "home" ? "away" : f === "away" ? "none" : "home");

/** Ovládání sledovaného utkání: upozornění a fandění (klepnutím se přepíná). */
export function WatchControls({ w }: { w: Watched }) {
  return (
    <div className="row g8" style={{ flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
      <button className="chip" style={{ height: 28, padding: "0 10px", fontSize: 12 }} onClick={() => vm.setWatch(w.key, { mode: nextMode(w.mode) })}>{MODE_LABEL[w.mode]}</button>
      <button className="chip" style={{ height: 28, padding: "0 10px", fontSize: 12 }} onClick={() => vm.setWatch(w.key, { fan: nextFan(w.fan) })}>{FAN_LABEL[w.fan]}</button>
    </div>
  );
}

export function LiveBoard() {
  const comps = vm.liveComps();
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    for (const c of comps) { vm.loadCompLos(c); if (!c.mine) vm.loadStrLadder(c.svaz, c.rocnik, c.soutez); }
    const t = setInterval(() => { for (const c of vm.liveComps()) vm.loadCompLos(c, true); }, 60_000);
    return () => clearInterval(t);
  }, [comps.length]);
  const day = today() + vm.liveDay;
  const q = Stats.fold(vm.liveQuery);
  const watched = vm.watched();
  const sections = comps.map((c) => {
    const los = vm.compLos.get(vm.compKey(c)) ?? [];
    const list = los.filter((m) => m.dateTime != null && ldtDate(m.dateTime) === day)
      .filter((m) => !q || Stats.fold(m.home).includes(q) || Stats.fold(m.away).includes(q))
      .filter((m) => !vm.liveOnlyWatched || watched.some((w) => w.key === vm.boardKey(c, m)))
      .sort((a, b) => (a.dateTime ?? 0) - (b.dateTime ?? 0));
    return { c, list, loading: vm.compLosLoading.has(vm.compKey(c)) && !vm.compLos.has(vm.compKey(c)) };
  });
  const any = sections.some((s) => s.list.length);
  return (
    <div className="col g10 px16">
      <Chips options={[["-1", "Včera"], ["0", "Dnes"], ["1", "Zítra"]]} selected={String(vm.liveDay)} onSelect={(k) => { vm.liveDay = parseInt(k, 10); vm.emit(); }} />
      <div className="row g8">
        <div style={{ flex: 1 }}><TextField value={vm.liveQuery} onChange={(v) => { vm.liveQuery = v; vm.emit(); }} label="Hledat družstvo…" /></div>
        <OButton text="+ Soutěž" onClick={() => setAdding(true)} />
      </div>
      <Segmented options={[["all", "Všechna"], ["watched", `★ Sledovaná (${watched.length}/${MAX_WATCHED})`]]} selected={vm.liveOnlyWatched ? "watched" : "all"}
        onSelect={(k) => { vm.liveOnlyWatched = k === "watched"; vm.emit(); }} />
      {msg && <Muted text={msg} color={C.OrangeText} size={13} maxLines={3} />}
      {sections.map(({ c, list, loading }) => (
        <div key={vm.compKey(c)} className="col g6">
          <div className="row" style={{ padding: "4px 4px 0" }}>
            <T bold size={13} color={C.Muted} style={{ flex: 1, letterSpacing: 0.5 }}>{c.label.toUpperCase()}</T>
            {!c.mine && <span className="clickable" style={{ color: C.Muted, fontSize: 13 }} onClick={() => vm.removeLiveComp(c)}>odebrat ×</span>}
          </div>
          {loading ? <AppCard><Loading text="Načítám rozpis soutěže…" /></AppCard>
            : !list.length ? <Muted text={vm.liveOnlyWatched ? "Žádné sledované utkání." : "V tento den se v soutěži nehraje."} size={13} style={{ paddingLeft: 4 }} />
              : <ListCard>{list.map((m) => <BoardRow key={vm.boardKey(c, m)} c={c} m={m} onError={setMsg} />)}</ListCard>}
        </div>
      ))}
      {!any && !sections.some((s) => s.loading) && <Empty text="Ve vybraný den se ve sledovaných soutěžích nehraje. Další soutěž přidáte tlačítkem + Soutěž." />}
      <Muted size={12} maxLines={5} text={`☆ = sledovat utkání (nejvýš ${MAX_WATCHED}). U sledovaného zvolíte upozornění (Hry / Sety / vypnuto) a komu fandíte – podle toho jsou barvy, notifikace i zvuky. Vaše družstva se sledují automaticky. Upozornění chodí jen při otevřené aplikaci.`} />
      {adding && <AddCompetitionDialog onClose={() => setAdding(false)} />}
      <div style={{ height: 8 }} />
    </div>
  );
}

function BoardRow({ c, m, onError }: { c: LiveComp; m: LosMatch; onError: (e: string | null) => void }) {
  const key = vm.boardKey(c, m);
  const w = vm.watchOf(key);
  const st = statusOf(m);
  const fan = w?.fan ?? "home";
  return (
    <div>
      <div className="col clickable" style={{ padding: "10px 14px", background: st.kind === "live" ? C.Tint : undefined }} onClick={() => vm.go({ t: "Watch", key })}>
        <div className="row g10">
          <T bold size={13} color={C.Muted} style={{ width: 40, flex: "none" }}>{m.dateTime != null ? hhmmLdt(m.dateTime) : ""}</T>
          <div className="col w1">
            <T size={14} semi={fan === "home"} lines={1}>{m.home}</T>
            <T size={14} semi={fan === "away"} lines={1}>{m.away}</T>
          </div>
          <div className="col" style={{ alignItems: "flex-end", flex: "none" }}>
            {st.kind === "live" && <span style={{ fontSize: 11, fontWeight: 700, color: C.Live }}>● živě</span>}
            <T bold size={st.kind === "future" ? 13 : 15} color={st.kind === "future" ? C.Muted : st.kind === "live" ? C.Live : scoreColor(st, fan)}>{st.kind === "future" ? m.round + ". kolo" : st.text}</T>
          </div>
          <span className="clickable" style={{ fontSize: 22, color: w ? "#F5A524" : C.Muted, flex: "none", padding: "0 2px" }}
            onClick={(e) => { e.stopPropagation(); onError(vm.toggleWatch(c, m)); }} aria-label="Sledovat">{w ? "★" : "☆"}</span>
        </div>
        {w && <div style={{ paddingLeft: 50, paddingTop: 6 }}><WatchControls w={w} /></div>}
      </div>
      <Divider />
    </div>
  );
}

/** Přidání soutěže: vyhledání oddílu -> jeho družstva, nebo odkaz ze STIS (…/svaz-…/rocnik-…/soutez-…). */
function AddCompetitionDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [clubs, setClubs] = useState<SearchClub[] | null>(null);
  const [teams, setTeams] = useState<TeamRef[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fromLink = () => {
    const m = /svaz-([^/]+)\/rocnik-(\d+)\/soutez-(\d+)/.exec(q);
    if (!m) return false;
    vm.addLiveComp({ id: "", name: "", svaz: m[1], rocnik: +m[2], soutez: m[3] }, `Soutěž ${m[3]}`);
    onClose();
    return true;
  };
  const search = () => {
    if (fromLink()) return;
    if (q.trim().length < 3) { setErr("Zadejte aspoň 3 znaky názvu oddílu, nebo vložte odkaz na soutěž ze STIS."); return; }
    setBusy(true); setErr(null); setTeams(null);
    vm.searchClubs(q.trim(), (r, e) => { setBusy(false); if (e) setErr(e); else setClubs(r ?? []); });
  };
  const openClub = (c: SearchClub) => {
    setBusy(true); setErr(null);
    vm.repo.club(c.path).then((p) => { setTeams(p.teams); setBusy(false); }, (e) => { setErr(String(e?.message ?? e)); setBusy(false); });
  };
  const rocnik = Stis.currentRocnik();
  return (
    <Dialog title="Přidat soutěž" onClose={onClose} actions={<OButton text="Zavřít" onClick={onClose} />}>
      <Muted size={13} maxLines={3} text="Vyhledejte oddíl a vyberte jeho družstvo – přidá se celá soutěž, ve které hraje. Nebo vložte odkaz na soutěž ze STIS." />
      <div className="row g8">
        <div style={{ flex: 1 }}><TextField value={q} onChange={setQ} label="Oddíl nebo odkaz" /></div>
        <OButton text="Hledat" onClick={search} />
      </div>
      {busy && <Loading />}
      {err && <Muted text={err} color={C.OrangeText} size={13} maxLines={3} />}
      {teams ? (
        <div className="col">
          {!teams.filter((t) => t.rocnik === rocnik).length && <Muted text="Oddíl nemá v této sezóně žádné družstvo." size={13} />}
          {teams.filter((t) => t.rocnik === rocnik).map((t, i) => (
            <div key={i} className="row clickable" style={{ padding: "8px 0" }} onClick={() => { vm.addLiveComp(t, `Soutěž družstva ${t.name}`); onClose(); }}>
              <T semi size={14} style={{ flex: 1 }}>{t.name}</T>
              <T bold color={C.Blue}>Přidat ›</T>
            </div>
          ))}
        </div>
      ) : clubs && (
        <div className="col">
          {!clubs.length && <Muted text="Nic nenalezeno." size={13} />}
          {clubs.slice(0, 12).map((c) => (
            <div key={c.id} className="row clickable" style={{ padding: "8px 0" }} onClick={() => openClub(c)}>
              <T semi size={14} style={{ flex: 1 }}>{c.name}</T>
              <T bold color={C.Blue}>Družstva ›</T>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/** Obrazovka sledovaného / cizího utkání: živý stav ze zápisu, po konci celý zápis. */
export function WatchScreen({ k }: { k: string }) {
  const found = vm.boardMatch(k);
  const w = vm.watchOf(k);
  const m = found?.m;
  const path = m?.zapisPath || w?.zapisPath || "";
  useZapisRefresh(path);
  useEffect(() => {
    if (!found && w) vm.loadCompLos({ svaz: w.svaz, rocnik: w.rocnik, soutez: w.soutez });
  }, [k]);
  const z = path ? vm.zapisy.get(path) : undefined;
  const fan = w?.fan ?? "home";
  const neutral = fan === "none";
  const myHome = fan !== "away";
  const home = m?.home ?? w?.home ?? "", away = m?.away ?? w?.away ?? "";
  // po konci celý zápis (z pohledu toho, komu fandím)
  useEffect(() => {
    if (z && z.games.length && Live.isZapisFinished(z, vm.format)) vm.replace({ t: "ZapisDetail", path, myTeam: fan === "away" ? away : home });
  }, [z?.games.length, z && Live.isZapisFinished(z, vm.format)]);
  if (!m && !w) return <div className="px16"><Loading text="Hledám utkání…" /></div>;
  const games = z ? Live.fromZapis(z, (id, n) => vm.strOf(id, n), (id, n) => vm.rangeOf(id, n)) : [];
  const st = Live.evaluate(games, vm.format);
  const comp = found?.comp ?? (w ? { svaz: w.svaz, rocnik: w.rocnik, soutez: w.soutez, label: w.compLabel } as LiveComp : null);
  const dt = m?.dateTime ?? w?.dateTime ?? null;
  return (
    <div className="col g12">
      <ScoreHeader st={st} myHome={myHome} homeName={home} awayName={away} empty={!games.length} neutral={neutral} />
      <div className="col g12 px16">
        <AppCard>
          <div className="row">
            <div className="col w1">
              <T semi size={14}>{comp?.label ?? ""}</T>
              <Muted size={12} text={[m?.round ? `${m.round}. kolo` : null, dt != null ? `začátek ${hhmmLdt(dt)}` : null, z?.online ? "online zápis" : null].filter((x) => x).join(" · ")} />
            </div>
            {comp && m && <span className="clickable" style={{ fontSize: 26, color: w ? "#F5A524" : C.Muted }} onClick={() => { const e = vm.toggleWatch(comp, m); if (e) alertless(e); }}>{w ? "★" : "☆"}</span>}
          </div>
          {w ? <WatchControls w={w} /> : <Muted size={12} text="Klepnutím na ☆ utkání sledujete – přijdou upozornění." />}
          {!path && <Muted size={13} maxLines={3} text={dt != null && dt > nowLdt() ? "Zápis se objeví po začátku utkání." : "Hledám online zápis… (objevuje se pár minut po začátku)"} />}
        </AppCard>
        {games.length > 0 && (
          <ListCard>
            {games.map((g, i) => {
              const h = g.home[0], a = g.away[0];
              const onOpen = !g.doubles && h && a ? () => vm.go({ t: "Duel", aId: h.id ?? "", aName: h.name, bId: a.id ?? "", bName: a.name, pA: st.gameProb[i] }) : null;
              return <GameRow key={g.no} g={g} pHome={st.gameProb[i]} myHome={myHome} mine={null} onOpen={onOpen} onResult={null} neutral={neutral} />;
            })}
          </ListCard>
        )}
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

function alertless(e: string) { vm.error = e; vm.emit(); }

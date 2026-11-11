// Karta „Hráči“: Moji soupeři + Hledat (kohokoli – hráče, oddíl, soutěž). Data ze STIS se načítají jen na vyžádání.
import { vm } from "../../app/vm";
import { Stis, type TeamRef } from "../../core/models";
import { Stats } from "../../core/stats";
import { MatchFormats } from "../../core/live";
import { fmtShort, ldtDate } from "../../core/dates";
import {
  AppCard, Avatar, BigNumber, C, Chips, Divider, Empty, ErrorBox, Icon, ListCard, Loading, Muted, NavyHeader, OButton, PrimaryButton,
  SectionTitle, Segmented, T, TextField,
} from "../components";
import { OpponentsScreen } from "./Opponents";
import { StandingsTable } from "./Ladder";

type CompRef = { svaz: string; rocnik: number; soutez: string };
const season = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;

export function PlayersScreen() {
  const tab = vm.playersTab;
  return (
    <div className="col g10">
      <div className="px16"><Segmented options={[["mine", "Moji soupeři"], ["search", "Hledat"]]} selected={tab} onSelect={(k) => { vm.playersTab = k as "mine" | "search"; vm.emit(); }} /></div>
      {tab === "mine" ? <OpponentsScreen /> : <BrowseView />}
    </div>
  );
}

/** Upozornění: nic se nestahuje samo. */
function ManualNote({ text }: { text: string }) {
  return (
    <div className="row g8" style={{ background: C.Tint, borderRadius: 12, padding: "8px 12px" }}>
      <Icon name="info" size={18} color={C.Blue} />
      <Muted size={12} maxLines={3} text={text} style={{ flex: 1 }} />
    </div>
  );
}

function openPlayer(path: string, name: string) { vm.addBrowseRecent("p", path, name); vm.go({ t: "Player", path, name, ask: true }); }
function openClub(path: string, name: string) { vm.addBrowseRecent("o", path, name); vm.go({ t: "BrowseClub", path, name }); }
function openComp(c: CompRef & { name: string }) { vm.addBrowseRecent("s", `${c.svaz}|${c.rocnik}|${c.soutez}`, c.name); vm.go({ t: "BrowseComp", ...c }); }

function BrowseView() {
  const b = vm.browse;
  const set = (p: Partial<typeof b>) => { Object.assign(b, p); vm.emit(); };
  const link = Stis.normalizeInput(b.query);
  // vložený odkaz ze STIS: hráč / oddíl / soutěž
  const compFromLink = (() => {
    const m = /svaz-(\d+)\/rocnik-(\d{4})\/soutez-(\d+)/.exec(b.query);
    return m ? { svaz: m[1], rocnik: +m[2], soutez: m[3] } : null;
  })();
  const comps = b.kind === "s" ? vm.knownComps().filter((c) => !b.query.trim() || compFromLink || Stats.fold(c.name).includes(Stats.fold(b.query))) : [];
  const recent = vm.browseRecent();
  const go = () => {
    if (link?.kind === "player") { openPlayer(link.path, "Hráč"); return; }
    if (compFromLink) { openComp({ ...compFromLink, name: comps.find((c) => c.soutez === compFromLink.soutez)?.name ?? "Soutěž" }); return; }
    const club = /\/oddil-\d+[^\s"]*/.exec(b.query)?.[0];
    if (club) { openClub(club, "Oddíl"); return; }
    vm.browseSearch();
  };
  return (
    <div className="col g10 px16">
      <Segmented options={[["p", "Hráči"], ["o", "Oddíly"], ["s", "Soutěže"]]} selected={b.kind} onSelect={(k) => set({ kind: k as "p" | "o" | "s", err: null })} />
      <TextField value={b.query} onChange={(v) => set({ query: v })} icon="search" onEnter={go}
        label={b.kind === "p" ? "Jméno hráče nebo odkaz ze STIS" : b.kind === "o" ? "Název oddílu nebo odkaz ze STIS" : "Název soutěže nebo odkaz ze STIS"} />
      {b.kind !== "s" && <PrimaryButton text={b.loading ? "Hledám…" : "Hledat na STIS"} onClick={go} enabled={!b.loading && b.query.trim().length >= 2} />}
      <ManualNote text={b.kind === "s"
        ? "Soutěže z vašich družstev, otevřených hráčů a oddílů. Jinou soutěž najdete přes oddíl nebo hráče, nebo vložte odkaz na její stránku na STIS."
        : "Data ze STIS se stahují jen na vyžádání – po hledání a po klepnutí na „Načíst“ u hráče, oddílu nebo soutěže."} />
      {b.err && <ErrorBox text={b.err} onRetry={go} />}
      {b.loading && <Loading text="Hledám na STIS…" />}
      {b.kind === "p" && b.players && !b.loading && (
        <ListCard>
          {!b.players.length && <Empty text="Nikoho takového STIS nenašel." />}
          {b.players.slice(0, 100).map((p) => (
            <div key={p.path}>
              <div className="row g12 clickable" style={{ padding: "10px 14px" }} onClick={() => openPlayer(p.path, p.name)}>
                <Avatar text={p.name} color={C.Blue} size={38} />
                <div className="col w1"><T semi size={15} lines={1}>{p.name}{p.birthYear ? <span style={{ color: C.Muted }}>{` (${p.birthYear})`}</span> : null}</T><Muted size={12} text={p.club || "–"} maxLines={1} /></div>
                {p.str != null && p.str > 0 && <T semi size={14} color={C.Muted}>{`STR ${p.str}`}</T>}
              </div>
              <Divider />
            </div>
          ))}
        </ListCard>
      )}
      {b.kind === "o" && b.clubs && !b.loading && (
        <ListCard>
          {!b.clubs.length && <Empty text="Žádný oddíl neodpovídá hledání." />}
          {b.clubs.slice(0, 100).map((c) => (
            <div key={c.path}>
              <div className="row g12 clickable" style={{ padding: "10px 14px" }} onClick={() => openClub(c.path, c.name)}>
                <Avatar text={c.name} color={C.Blue} size={38} square />
                <T semi size={15} lines={2} style={{ flex: 1 }}>{c.name}</T>
                <T bold color={C.Blue}>›</T>
              </div>
              <Divider />
            </div>
          ))}
        </ListCard>
      )}
      {b.kind === "s" && (
        <ListCard>
          {compFromLink && (
            <><div className="row g12 clickable" style={{ padding: "10px 14px" }} onClick={go}>
              <Icon name="trophy" size={22} color={C.Blue} /><T semi size={15} style={{ flex: 1 }}>{`Otevřít soutěž z odkazu (${season(compFromLink.rocnik)})`}</T><T bold color={C.Blue}>›</T>
            </div><Divider /></>
          )}
          {!comps.length && !compFromLink && <Empty text="Žádná známá soutěž neodpovídá hledání." />}
          {comps.slice(0, 120).map((c) => (
            <div key={`${c.svaz}|${c.rocnik}|${c.soutez}`}>
              <div className="row g12 clickable" style={{ padding: "10px 14px" }} onClick={() => openComp(c)}>
                <Icon name="trophy" size={22} color={C.Blue} />
                <div className="col w1"><T semi size={15} lines={2}>{c.name || `Soutěž ${c.soutez}`}</T><Muted size={12} text={season(c.rocnik)} /></div>
                <T bold color={C.Blue}>›</T>
              </div>
              <Divider />
            </div>
          ))}
        </ListCard>
      )}
      {!b.loading && recent.length > 0 && ((b.kind === "p" && !b.players) || (b.kind === "o" && !b.clubs) || b.kind === "s") && (
        <>
          <SectionTitle text="Naposledy otevřené" action="Vymazat" onAction={() => { vm.prefs.browseRecentJson = "[]"; vm.emit(); }} />
          <ListCard>
            {recent.map((r) => (
              <div key={r.k + r.id}>
                <div className="row g12 clickable" style={{ padding: "9px 14px" }} onClick={() => {
                  if (r.k === "p") openPlayer(r.id, r.name);
                  else if (r.k === "o") openClub(r.id, r.name);
                  else { const [svaz, rocnik, soutez] = r.id.split("|"); openComp({ svaz, rocnik: +rocnik, soutez, name: r.name }); }
                }}>
                  <Icon name={r.k === "p" ? "person" : r.k === "o" ? "groups" : "trophy"} size={20} color={C.Muted} />
                  <T size={14} lines={1} style={{ flex: 1 }}>{r.name}</T>
                  <Muted size={11} text={r.k === "p" ? "hráč" : r.k === "o" ? "oddíl" : "soutěž"} />
                </div>
                <Divider />
              </div>
            ))}
          </ListCard>
        </>
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}

/** Načtení ručně: karta s vysvětlením a tlačítkem. */
function LoadCard({ title, text, button, onLoad, busy }: { title: string; text: string; button: string; onLoad: () => void; busy: boolean }) {
  return (
    <AppCard>
      <T bold>{title}</T>
      <Muted size={13} maxLines={4} text={text} />
      {busy ? <Loading text="Načítám ze STIS…" /> : <PrimaryButton text={button} onClick={onLoad} />}
    </AppCard>
  );
}

export function BrowseClubScreen({ path, name }: { path: string; name: string }) {
  const c = vm.clubPages.get(path);
  const busy = vm.clubPageLoading.has(path);
  const e = vm.clubPageErr.get(path);
  const rosters = vm.clubBrowseRosters.get(path);
  const title = c?.name || name;
  const ladder = rosters ? Array.from(new Map(rosters.flatMap((r) => r.players).filter((p) => p.str != null).map((p) => [p.id ?? p.name, p])).values()).sort((a, b) => (b.str ?? 0) - (a.str ?? 0)) : [];
  return (
    <div className="col g12">
      <NavyHeader>
        <div className="row g12">
          <Avatar text={title} color={C.Blue} size={52} square />
          <div className="col w1"><T size={22} bold color="#fff">{title}</T><Muted text={c ? `${c.teams.length} družstev` : "Oddíl"} color={C.MutedOnNavy} size={14} /></div>
        </div>
      </NavyHeader>
      <div className="col g12 px16">
        {e && <ErrorBox text={e} onRetry={() => vm.loadClubPage(path, true)} />}
        {!c ? <LoadCard title="Oddíl zatím není načtený" text="Načte se seznam družstev oddílu a jejich soutěže (jedna stránka STIS)." button="Načíst oddíl" busy={busy} onLoad={() => vm.loadClubPage(path)} /> : (
          <>
            <SectionTitle text="Družstva" action="Obnovit" onAction={() => vm.loadClubPage(path, true)} />
            <ListCard>
              {!c.teams.length && <Empty text="Oddíl nemá v tomto ročníku žádné družstvo." />}
              {c.teams.map((t) => {
                const comp = vm.knownComps().find((k) => k.soutez === t.soutez && k.svaz === t.svaz && k.rocnik === t.rocnik);
                return (
                  <div key={t.id + t.soutez}>
                    <div className="row g12" style={{ padding: "10px 14px" }}>
                      <div className="col w1 clickable" onClick={() => vm.openTeam(t, comp?.name ?? "")}>
                        <T semi size={15} lines={1}>{t.name} <span style={{ color: C.Muted }}>›</span></T>
                        <Muted size={12} text={comp?.name || `soutěž ${t.soutez} · ${season(t.rocnik)}`} maxLines={1} />
                      </div>
                      <button className="chip" style={{ height: 32 }} onClick={() => openComp({ svaz: t.svaz, rocnik: t.rocnik, soutez: t.soutez, name: comp?.name || `${t.name} – soutěž` })}>Soutěž ›</button>
                    </div>
                    <Divider />
                  </div>
                );
              })}
            </ListCard>
            {!rosters ? <LoadCard title="Hráči oddílu" text={`Načte soupisky všech ${c.teams.length} družstev a seřadí hráče oddílu podle STR (${c.teams.length} stránek STIS).`} button="Načíst hráče oddílu" busy={vm.clubRosterLoading.has(path)} onLoad={() => vm.loadClubRosters(path)} /> : (
              <>
                <SectionTitle text={`Hráči oddílu podle STR (${ladder.length})`} />
                <ListCard>
                  {ladder.map((p, i) => (
                    <div key={(p.id ?? p.name) + i}>
                      <div className={"row g12" + (p.path ? " clickable" : "")} style={{ padding: "9px 14px" }} onClick={p.path ? () => openPlayer(p.path!, p.name) : undefined}>
                        <BigNumber text={`${i + 1}`} size={16} style={{ width: 26 }} />
                        <T size={15} lines={1} style={{ flex: 1 }}>{p.name}</T>
                        <T semi size={15}>{String(p.str)}</T>
                      </div>
                      <Divider />
                    </div>
                  ))}
                </ListCard>
              </>
            )}
          </>
        )}
      </div>
      <div style={{ height: 8 }} />
    </div>
  );
}

export function BrowseCompScreen({ c }: { c: CompRef & { name: string } }) {
  const tabKey = Stis.tabulka(c.svaz, c.rocnik, c.soutez);
  const rows = vm.tabulky.get(tabKey);
  const los = vm.compLos.get(vm.compKey(c));
  const loaded = vm.compBrowseLoaded(c);
  const busy = vm.compLoading.get(tabKey) === true || vm.compLosLoading.has(vm.compKey(c));
  const fmt = vm.formatForComp(c);
  const current = c.rocnik === Stis.currentRocnik();
  const view = vm.compView;
  const comp = { svaz: c.svaz, rocnik: c.rocnik, soutez: c.soutez, label: c.name, teams: [] as string[] };
  const rounds = new Map<string, typeof los>();
  for (const m of los ?? []) { const l = rounds.get(m.round) ?? []; l!.push(m); rounds.set(m.round, l); }
  return (
    <div className="col g12">
      <NavyHeader>
        <T size={22} bold color="#fff">{c.name || `Soutěž ${c.soutez}`}</T>
        <Muted text={`${season(c.rocnik)} · ${MatchFormats.short(fmt)}`} color={C.MutedOnNavy} size={14} />
      </NavyHeader>
      <div className="col g12 px16">
        {!loaded ? <LoadCard title="Soutěž zatím není načtená" text="Načte se tabulka a rozpis utkání soutěže (u některých soutěží rozpisy všech družstev)." button="Načíst soutěž" busy={busy} onLoad={() => vm.loadCompBrowse(c)} /> : (
          <>
            <div className="row g8">
              <div style={{ flex: 1 }}><Chips options={[["tab", "Tabulka"], ["los", "Rozpis a výsledky"]]} selected={view} onSelect={(k) => { vm.compView = k as "tab" | "los"; vm.emit(); }} /></div>
              <button className="chip" style={{ height: 34 }} onClick={() => vm.loadCompBrowse(c, true)}>{busy ? "Načítám…" : "Obnovit"}</button>
            </div>
            {view === "tab" ? <StandingsTable comp={comp} rows={rows} loading={busy} current={current} /> : (
              !los ? (busy ? <Loading text="Načítám rozpis…" /> : <Empty text="Rozpis se nepodařilo načíst." />) : (
                <>
                  {Array.from(rounds.entries()).map(([round, ms]) => (
                    <div key={round} className="col g6">
                      <SectionTitle text={`${round}. kolo${ms![0]?.dateTime ? ` · ${fmtShort(ldtDate(ms![0].dateTime!))}` : ""}`} />
                      <ListCard>
                        {ms!.map((m, i) => {
                          const open = m.zapisPath && m.played ? () => vm.go({ t: "ZapisDetail", path: m.zapisPath, myTeam: m.home }) : null;
                          const team = (r: TeamRef | null, n: string) => r?.id ? () => vm.openTeam({ ...r, name: n }, c.name) : undefined;
                          return (
                            <div key={i}>
                              <div className="row g8" style={{ padding: "9px 14px" }}>
                                <div style={{ flex: 1 }} className={m.homeRef?.id ? "clickable" : ""} onClick={team(m.homeRef, m.home)}><T size={14} lines={2}>{m.home}</T></div>
                                <span className={open ? "clickable" : ""} onClick={open ?? undefined} style={{ minWidth: 58, textAlign: "center", fontWeight: 700, color: m.played ? C.Ink : C.Muted, fontSize: 14 }}>{m.played ? `${m.score}${open ? " ›" : ""}` : m.dateText.split(" ")[1] ?? "–"}</span>
                                <div style={{ flex: 1, textAlign: "right" }} className={m.awayRef?.id ? "clickable" : ""} onClick={team(m.awayRef, m.away)}><T size={14} lines={2}>{m.away}</T></div>
                              </div>
                              <Divider />
                            </div>
                          );
                        })}
                      </ListCard>
                    </div>
                  ))}
                </>
              )
            )}
          </>
        )}
        <OButton text="Žebříček STR soutěže na STIS" onClick={() => window.open(Stis.BASE + Stis.zebricek(c.svaz, c.rocnik, c.soutez), "_blank")} />
      </div>
      <div style={{ height: 8 }} />
    </div>
  );
}

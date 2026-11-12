import { useEffect } from "react";
import { CompTree, type TreeComp, type TreeSvaz } from "../../core/compTree";
// Karta „Hráči“: Moji soupeři + Hledat (kohokoli – hráče, oddíl, soutěž). Data ze STIS se načítají jen na vyžádání.
import { vm } from "../../app/vm";
import { Stis, type TeamRef } from "../../core/models";
import { MatchFormats } from "../../core/live";
import { fmtShort, ldtDate } from "../../core/dates";
import {
  AppCard, Avatar, BigNumber, C, Chips, Divider, Empty, ErrorBox, Icon, ListCard, Loading, Muted, NavyHeader, OButton, PrimaryButton,
  SectionTitle, Segmented, T, TextField,
} from "../components";
import { OpponentsScreen } from "./Opponents";
import { CompetitionView, StandingsTable } from "./Ladder";

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

/** Karta Soutěže: Moje soutěže (tabulky, rozpis, predikce) a všechny soutěže republiky. */
export function CompsScreen() {
  const tab = vm.compsTab;
  // při otevření karty: aktuální sezóna, starší sbalené
  useEffect(() => { if (!vm.compExplicit) { vm.compOlderOpen = false; vm.compSeason = null; vm.emit(); } }, []);
  return (
    <div className="col g10">
      <div className="px16"><Segmented options={[["mine", "Moje soutěže"], ["all", "Všechny soutěže"]]} selected={tab} onSelect={(k) => { vm.compsTab = k as "mine" | "all"; vm.emit(); }} /></div>
      {tab === "mine" ? <CompetitionView kind="tabulka" /> : <BrowseView soutezeOnly />}
    </div>
  );
}

function BrowseView({ soutezeOnly = false }: { soutezeOnly?: boolean }) {
  // karta Hráči hledá hráče a oddíly, karta Soutěže soutěže (sdílený stav hledání, každá svůj druh)
  const b0 = vm.browse;
  const b = soutezeOnly ? vm.browseComps : b0;
  if (!soutezeOnly && b0.kind === "s") b0.kind = "p";
  const set = (p: Partial<typeof b>) => { Object.assign(b, p); vm.emit(); };
  const link = Stis.normalizeInput(b.query);
  // vložený odkaz ze STIS: hráč / oddíl / soutěž
  const compFromLink = (() => {
    const m = /svaz-(\d+)\/rocnik-(\d{4})\/soutez-(\d+)/.exec(b.query);
    return m ? { svaz: m[1], rocnik: +m[2], soutez: m[3] } : null;
  })();
  // jen soutěže aktuálního ročníku (starší lze otevřít vloženým odkazem ze STIS)
  const rocnik = Stis.currentRocnik();
  const comps0 = vm.knownComps();
  // hledání bez ohledu na mezery, tečky, velikost písmen a diakritiku („OL 1“ = „ol1“), i podle zkratek
  const q = CompTree.norm(b.query);
  const comps = b.kind === "s" ? comps0.filter((c) => c.rocnik === rocnik && (!q || compFromLink
    || [c.name, vm.treeEntry(c.soutez)?.svazName ?? "", ...vm.compAliases(c)].some((x) => CompTree.norm(x).includes(q)))) : [];
  const recent = vm.browseRecent().filter((r) => (soutezeOnly ? r.k === "s" : r.k !== "s"));
  const go = () => {
    if (link?.kind === "player") { openPlayer(link.path, "Hráč"); return; }
    if (compFromLink) { openComp({ ...compFromLink, name: comps.find((c) => c.soutez === compFromLink.soutez)?.name ?? "Soutěž" }); return; }
    const club = /\/oddil-\d+[^\s"]*/.exec(b.query)?.[0];
    if (club) { openClub(club, "Oddíl"); return; }
    vm.browseSearch();
  };
  return (
    <div className="col g10 px16">
      {!soutezeOnly && <Segmented options={[["p", "Hráči"], ["o", "Oddíly"]]} selected={b.kind === "s" ? "p" : b.kind} onSelect={(k) => set({ kind: k as "p" | "o", err: null })} />}
      <TextField value={b.query} onChange={(v) => set({ query: v })} icon="search" onEnter={go}
        label={b.kind === "p" ? "Jméno hráče nebo odkaz ze STIS" : b.kind === "o" ? "Název oddílu nebo odkaz ze STIS" : "Název soutěže nebo odkaz ze STIS"} />
      {b.kind !== "s" && <PrimaryButton text={b.loading ? "Hledám…" : "Hledat na STIS"} onClick={go} enabled={!b.loading && b.query.trim().length >= 2} />}
      <ManualNote text={b.kind === "s"
        ? `Všechny soutěže republiky v ročníku ${season(rocnik)}: procházejte svazy, nebo hledejte podle názvu soutěže či svazu. Starší ročník otevřete vloženým odkazem ze STIS.`
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
      {b.kind === "s" && compFromLink && (
        <ListCard>
          <div className="row g12 clickable" style={{ padding: "10px 14px" }} onClick={go}>
            <Icon name="trophy" size={22} color={C.Blue} /><T semi size={15} style={{ flex: 1 }}>{`Otevřít soutěž z odkazu (${season(compFromLink.rocnik)})`}</T><T bold color={C.Blue}>›</T>
          </div>
        </ListCard>
      )}
      {b.kind === "s" && !compFromLink && (b.query.trim() ? (
        <ListCard>
          {!comps.length && <Empty text="Žádná soutěž neodpovídá hledání." />}
          {comps.slice(0, 150).map((c) => <CompRow key={`${c.svaz}|${c.soutez}`} c={c} sub={[...vm.compAliases(c).slice(0, 2), vm.treeEntry(c.soutez)?.svazName ?? season(c.rocnik)].join(" · ")} />)}
        </ListCard>
      ) : <SvazBrowser />)}
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
                  <T size={14} lines={1} style={{ flex: 1 }}>{r.k === "s" ? (comps0.find((c) => `${c.svaz}|${c.rocnik}|${c.soutez}` === r.id)?.name || r.name) : r.name}</T>
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
                const comp = { name: c.comps?.[`${t.svaz}|${t.rocnik}|${t.soutez}`] ?? vm.knownComps().find((k) => k.soutez === t.soutez && k.svaz === t.svaz && k.rocnik === t.rocnik)?.name ?? "" };
                return (
                  <div key={t.id + t.soutez}>
                    <div className="row g12" style={{ padding: "10px 14px" }}>
                      <div className="col w1 clickable" onClick={() => vm.openTeam(t, comp.name)}>
                        <T semi size={15} lines={1}>{t.name} <span style={{ color: C.Muted }}>›</span></T>
                        <Muted size={12} text={comp.name ? `${comp.name} · ${season(t.rocnik)}` : `soutěž ${t.soutez} · ${season(t.rocnik)}`} maxLines={1} />
                      </div>
                      <button className="chip" style={{ height: 32 }} onClick={() => openComp({ svaz: t.svaz, rocnik: t.rocnik, soutez: t.soutez, name: comp.name || `Soutěž družstva ${t.name}` })}>Soutěž ›</button>
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

export function BrowseCompScreen({ c: c0 }: { c: CompRef & { name: string } }) {
  // skutečný název soutěže, jakmile je známý (ze stránky oddílu, hráče nebo mých družstev)
  const known = vm.knownComps().find((k) => k.svaz === c0.svaz && k.rocnik === c0.rocnik && k.soutez === c0.soutez)?.name;
  const c = known ? { ...c0, name: known } : c0;
  // název zatím neznámý: přečte se z hlavičky jednoho odehraného zápisu soutěže (jedna stránka)
  const losAll = vm.compLos.get(vm.compKey(c0));
  useEffect(() => {
    if (known || !losAll) return;
    const z = losAll.find((m) => m.played && m.zapisPath);
    if (z && !vm.zapisy.has(z.zapisPath)) vm.loadZapis(z.zapisPath);
  }, [known, !!losAll]);
  useEffect(() => {
    const id = `${c0.svaz}|${c0.rocnik}|${c0.soutez}`;
    if (known && vm.browseRecent().some((r) => r.k === "s" && r.id === id && r.name !== known)) vm.addBrowseRecent("s", id, known);
    // starý náhradní název v katalogu nahradí skutečný (knownComps ho uloží)
  }, [known]);
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
        <T size={22} bold color="#fff">{known ? c.name : (() => { const z = losAll?.find((m) => m.played && m.zapisPath); return z && !vm.zapisy.has(z.zapisPath) ? "Zjišťuji název soutěže…" : c.name || `Soutěž ${c.soutez}`; })()}</T>
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

function CompRow({ c, sub }: { c: { svaz: string; rocnik: number; soutez: string; name: string }; sub: string }) {
  return (
    <div>
      <div className="row g12 clickable" style={{ padding: "10px 14px" }} onClick={() => openComp(c)}>
        <Icon name="trophy" size={22} color={C.Blue} />
        <div className="col w1"><T semi size={15} lines={2}>{c.name || `Soutěž ${c.soutez}`}</T><Muted size={12} text={sub} maxLines={1} /></div>
        <T bold color={C.Blue}>›</T>
      </div>
      <Divider />
    </div>
  );
}

/** Procházení svazů: republika a kraje → svaz (soutěže podle kategorií + podřízené svazy). */
function SvazBrowser() {
  const t = vm.compTree();
  const rocnik = Stis.currentRocnik();
  const update = (
    <div className="col g4" style={{ alignItems: "center" }}>
      <span className="clickable" style={{ color: C.Blue, fontSize: 13, fontWeight: 600 }} onClick={() => vm.refreshCompTree(true)}>{vm.treeLoading ? "Aktualizuji seznam soutěží…" : "Aktualizovat seznam soutěží ze STIS"}</span>
      {vm.treeErr && <Muted size={12} color={C.OrangeText} text={vm.treeErr} />}
    </div>
  );
  if (!t) return (
    <AppCard>
      <T bold>Seznam soutěží {season(rocnik)}</T>
      <Muted size={13} maxLines={3} text="Načte se jednou na celou sezónu: všechny svazy a soutěže republiky s plnými názvy (jedna stránka STIS)." />
      {vm.treeLoading ? <Loading text="Načítám seznam soutěží…" /> : <PrimaryButton text="Načíst seznam soutěží" onClick={() => vm.refreshCompTree(true)} />}
      {vm.treeErr && <Muted size={12} color={C.OrangeText} text={vm.treeErr} />}
    </AppCard>
  );
  const cur = vm.browseSvaz ? CompTree.find(t, vm.browseSvaz) : null;
  const open = (id: string | null) => { vm.browseSvaz = id; vm.emit(); };
  // moje svazy (podle mých družstev): kraj i okres
  const mineIds = new Set<string>();
  for (const x of vm.next) if (x.myTeam.ref?.svaz) mineIds.add(x.myTeam.ref.svaz);
  for (const x of vm.me?.currentSeason?.teams ?? []) if (x.ref?.svaz) mineIds.add(x.ref.svaz);
  const mine = Array.from(mineIds).map((id) => CompTree.find(t, id)?.svaz).filter((x): x is TreeSvaz => !!x);
  if (!cur) {
    const kraje = Object.values(t.svazy).filter((s) => s.id !== CompTree.ROOT && (s.souteze.length || Object.keys(s.svazy ?? {}).length));
    const root = t.svazy[CompTree.ROOT];
    return (
      <div className="col g10">
        {mine.length > 0 && (
          <div className="row g8" style={{ flexWrap: "wrap" }}>
            {mine.map((s) => <button key={s.id} className="chip" style={{ height: 34 }} onClick={() => open(s.id)}>{`Můj svaz: ${s.nazev} ›`}</button>)}
          </div>
        )}
        <ListCard>
          {root && <SvazRow s={root} title="Republika – ČAST" onClick={() => open(root.id)} />}
          {kraje.map((s) => <SvazRow key={s.id} s={s} onClick={() => open(s.id)} />)}
        </ListCard>
        {update}
      </div>
    );
  }
  const s = cur.svaz;
  const groups = new Map<string, TreeComp[]>();
  for (const c of s.souteze) { const l = groups.get(c.kat) ?? []; l.push(c); groups.set(c.kat, l); }
  const subs = Object.values(s.svazy ?? {});
  return (
    <div className="col g10">
      <div className="row g8">
        <button className="chip" style={{ height: 34 }} onClick={() => open(cur.parent?.id ?? null)}>{`‹ ${cur.parent ? cur.parent.nazev : "Přehled svazů"}`}</button>
      </div>
      <T bold size={18}>{s.id === CompTree.ROOT ? "Republika – ČAST" : s.nazev}</T>
      {!s.souteze.length && !subs.length && <Empty text="Svaz nemá v tomto ročníku žádné soutěže." />}
      {Array.from(groups.entries()).map(([kat, cs]) => (
        <div key={kat} className="col g6">
          <SectionTitle text={CompTree.katLabel(kat)} />
          <ListCard>{cs.map((c) => <CompRow key={c.id_soutez} c={{ svaz: s.id, rocnik: t.rocnik, soutez: c.id_soutez, name: c.nazev.trim() }} sub={`${s.nazev} · ${season(t.rocnik)}`} />)}</ListCard>
        </div>
      ))}
      {subs.length > 0 && (
        <>
          <SectionTitle text="Okresní a regionální svazy" />
          <ListCard>{subs.map((x) => <SvazRow key={x.id} s={x} onClick={() => open(x.id)} />)}</ListCard>
        </>
      )}
      {update}
    </div>
  );
}

function SvazRow({ s, title, onClick }: { s: TreeSvaz; title?: string; onClick: () => void }) {
  const n = s.souteze.length, k = Object.keys(s.svazy ?? {}).length;
  return (
    <div>
      <div className="row g12 clickable" style={{ padding: "10px 14px" }} onClick={onClick}>
        <Icon name="groups" size={22} color={C.Blue} />
        <div className="col w1"><T semi size={15} lines={1}>{title ?? s.nazev}</T><Muted size={12} text={`${n} ${n === 1 ? "soutěž" : n >= 2 && n <= 4 ? "soutěže" : "soutěží"}${k ? ` · ${k} okresních svazů` : ""}`} /></div>
        <T bold color={C.Blue}>›</T>
      </div>
      <Divider />
    </div>
  );
}

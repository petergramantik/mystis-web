// Stav aplikace a načítání dat (přepis AppViewModel.kt). Každá změna stavu zavolá emit() a React překreslí obrazovku.
import { Match, Stis, type TeamInfo, type StandingRow, type StrLadder, type ClubPage, type LosMatch, type PlayerPage, type RosterPlayer, type TeamRef, type TeamRoster, type Zapis } from "../core/models";
import { Parsers } from "../core/parsers";
import { StisRepository, HOUR, type NextMatchContext } from "../core/repository";
import { Stats, LadderEntry, maxBy, minBy, distinct, distinctBy, type SetStats } from "../core/stats";
import { Live, LiveTimeline, MatchFormats, type MatchFormat, type MyLiveGame } from "../core/live";
import { Stability, type SearchClub, type SearchPlayer } from "../core/search";
import { pointsRule, predictSeason, type SeasonPrediction, type SeasonTeam } from "../core/season";
import { type LDate, LDATE_MIN, LDT_MAX, fmtDT, ldDay, ldMonth, ldYear, ldtDate, ldtHour, ldtMinute, ldtOf, today, nowLdt } from "../core/dates";
import { FetchError, WebFetcher } from "../data/fetcher";
import { prefs } from "../data/prefs";

/** Obrazovky aplikace (vlastní navigace se zásobníkem). */
export type Screen =
  | { t: "Overview" } | { t: "Ladder" } | { t: "Str" } | { t: "Matches" } | { t: "Opponents" }
  | { t: "Club"; name: string } | { t: "H2H"; key: string } | { t: "NextMatch" } | { t: "Captain" }
  | { t: "Compare"; a: string | null; b: string | null } | { t: "Records" } | { t: "Settings" }
  | { t: "Player"; path: string } | { t: "Live"; team: number }
  | { t: "Duel"; aId: string; aName: string; bId: string; bName: string }
  | { t: "ZapisDetail"; path: string; myTeam: string }
  | { t: "Fixture"; team: number; round: string; home: string; away: string };

export const S = {
  Overview: { t: "Overview" } as Screen, Ladder: { t: "Ladder" } as Screen, Str: { t: "Str" } as Screen,
  Matches: { t: "Matches" } as Screen, Opponents: { t: "Opponents" } as Screen, NextMatch: { t: "NextMatch" } as Screen,
  Captain: { t: "Captain" } as Screen, Records: { t: "Records" } as Screen, Settings: { t: "Settings" } as Screen,
};
export const screenKey = (s: Screen) => JSON.stringify(s);
const sameScreen = (a: Screen, b: Screen) => screenKey(a) === screenKey(b);

export class ClubState {
  constructor(
    readonly name = "",
    readonly teams: TeamRef[] = [],
    readonly rosters: TeamRoster[] = [],
    readonly ladder: LadderEntry[] = [],
    /** hráč (ID nebo "jm:jméno") -> družstva, ve kterých patří do stabilní sestavy */
    readonly stable = new Map<string, Set<string>>(),
    /** hráč -> družstvo -> počet odehraných utkání v sezóně */
    readonly utkani = new Map<string, Map<string, number>>(),
    readonly stabilityKnown = false,
  ) {}
  keyOf(id: string | null | undefined, name: string) { return id ?? "jm:" + name; }
  isStable(id: string | null | undefined, name: string, team: string | null = null): boolean {
    if (!this.stabilityKnown) return true;
    const s = this.stable.get(this.keyOf(id, name));
    if (!s) return false;
    if (team == null) return s.size > 0;
    return Array.from(s).some((x) => Stats.fold(x) === Stats.fold(team));
  }
}

export interface LastUtkani {
  title: string; unofficial: boolean; live: MyLiveGame[]; official: Match[]; zapisPath: string; myTeam: string; running: boolean;
}

function err(e: unknown): string {
  if (e instanceof FetchError) return e.message;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "Nejste připojeni k internetu.";
  return (e as Error)?.message || "Nepodařilo se načíst data ze STIS.";
}

const pad2 = (n: number) => (n < 10 ? "0" : "") + n;

export class AppVm {
  readonly fetcher = new WebFetcher();
  readonly repo = new StisRepository(this.fetcher);
  readonly prefs = prefs;

  // ---------- překreslování
  version = 0;
  private listeners = new Set<() => void>();
  private pending = false;
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getVersion = () => this.version;
  emit() {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => { this.pending = false; this.version++; for (const l of this.listeners) l(); });
  }

  // ---------- navigace
  stack: Screen[] = [S.Overview];
  get current(): Screen { return this.stack[this.stack.length - 1]; }
  go(s: Screen) { if (!sameScreen(this.current, s)) this.stack = [...this.stack, s]; this.trim(); this.emit(); this.scrollTop(); }
  /** Přepnutí záložky: obrazovka se přesune na vrchol historie. */
  tab(s: Screen) {
    if (sameScreen(this.current, s)) return;
    this.stack = [...this.stack.filter((x) => !sameScreen(x, s)), s];
    this.trim(); this.emit(); this.scrollTop();
  }
  private trim() { while (this.stack.length > 30) this.stack.shift(); }
  back(): boolean {
    if (this.stack.length > 1) { this.stack = this.stack.slice(0, -1); this.emit(); this.scrollTop(); return true; }
    return false;
  }
  resetTo(s: Screen) { this.stack = [s]; this.emit(); this.scrollTop(); }
  private scrollTop() { if (typeof window !== "undefined") queueMicrotask(() => window.scrollTo(0, 0)); }

  // ---------- můj profil
  me: PlayerPage | null = null;
  loadingMe = false;
  error: string | null = null;
  onboarding = prefs.playerPath == null;

  // ---------- oddíl, příští zápas, ostatní
  club = new ClubState();
  loadingClub = false;
  clubProgress = "";
  next: NextMatchContext[] = [];
  loadingNext = false;
  private finishedTeams = new Set<string>();
  nextSelected = 0;
  private nextSelectedByUser = false;
  setStats: SetStats | null = null;
  loadingSets = false;

  players = new Map<string, PlayerPage>();
  loadingPlayers = new Map<string, boolean>();
  zapisy = new Map<string, Zapis>();

  otherClub: ClubPage | null = null;
  otherTeams: TeamRef[] = [];
  otherRoster: TeamRoster | null = null;
  loadingOther = false;
  otherError: string | null = null;

  constructor() {
    if (prefs.playerPath != null && typeof window !== "undefined") this.loadMe(false);
  }

  selectTeam(i: number) { this.nextSelected = i; this.nextSelectedByUser = true; this.emit(); }

  private defaultTeamIndex(ctxs: NextMatchContext[], m: PlayerPage): number {
    if (ctxs.length <= 1) return 0;
    const season = m.matches.length ? Math.max(...m.matches.map((x) => x.season)) : Stis.currentRocnik();
    const counts = ctxs.map((c) => {
      const byMatches = m.matches.filter((x) => x.season === season && x.valid && Stats.fold(x.myTeam) === Stats.fold(c.myTeam.name)).length;
      const byBilance = (c.myTeam.singles ?? "").split(":").map((x) => parseInt(x.trim(), 10)).filter((x) => Number.isFinite(x)).reduce((a, b) => a + b, 0);
      return Math.max(byMatches, byBilance);
    });
    let best = 0;
    counts.forEach((c, i) => { if (c > counts[best]) best = i; });
    return best;
  }

  setProfile(input: string, onDone: (e: string | null) => void) {
    const link = Stis.normalizeInput(input);
    if (link?.kind !== "player") { onDone("Vložte odkaz na stránku hráče na STIS (…/hrac-12345/…) nebo číslo hráče."); return; }
    this.loadingMe = true; this.emit();
    (async () => {
      try {
        const p = await this.repo.player(link.path, 0);
        if (p == null) {
          onDone("Na odkazu jsem nenašel stránku hráče.");
        } else {
          const switching = prefs.playerPath != null && prefs.playerPath !== p.path;
          if (switching || prefs.playerPath == null) { this.firstLoad = true; prefs.firstLoadDone = false; }
          prefs.playerPath = p.path;
          prefs.addRecent(p.path, p.name);
          if (switching) prefs.lastMatchCount = -1;
          this.me = p;
          this.resetManual(); this.clearOther();
          this.nextSelectedByUser = false; this.nextSelected = 0;
          this.resetTo(S.Overview);
          this.remember(p);
          this.onboarding = false;
          this.club = new ClubState(); this.next = []; this.setStats = null;
          onDone(null);
          this.loadClub(false); this.loadNext(false);
        }
      } catch (e) {
        onDone(err(e));
      } finally {
        this.loadingMe = false; this.emit();
      }
    })();
  }

  loadMe(force: boolean) {
    const path = prefs.playerPath;
    if (!path || this.loadingMe) return;
    this.loadingMe = true;
    this.error = null;
    this.stepsAdd(1, "Načítám profil hráče…");
    this.emit();
    (async () => {
      try {
        const p = await this.repo.player(path, force ? 0 : 6 * HOUR);
        if (p != null) {
          this.me = p;
          if (p.path !== path) prefs.playerPath = p.path;
          prefs.addRecent(p.path, p.name);
          this.remember(p);
        } else this.error = "Stránku hráče se nepodařilo přečíst (možná STIS změnil vzhled).";
      } catch (e) {
        this.error = err(e);
      } finally {
        this.loadingMe = false; this.emit();
      }
      if (this.me != null) {
        if (this.club.ladder.length === 0 || force) this.loadClub(force);
        if (this.next.length === 0 || force) this.loadNext(force);
      }
      this.stepDone();
    })();
  }

  refreshAll() { this.loadMe(true); }

  // ---------- průběh načítání
  progressTotal = 0;
  progressDone = 0;
  progressLabel = "";
  get busy() { return this.progressTotal > 0 && this.progressDone < this.progressTotal; }
  get progressPercent() { return this.progressTotal === 0 ? 0 : Math.max(0, Math.min(99, Math.floor((100 * this.progressDone) / this.progressTotal))); }
  private stepsAdd(n: number, label: string | null = null) {
    if (n <= 0) return;
    if (!this.busy) { this.progressTotal = 0; this.progressDone = 0; }
    this.progressTotal += n;
    if (label != null) this.progressLabel = label;
    this.emit();
  }
  private stepDone(label: string | null = null) {
    this.progressDone = Math.min(this.progressDone + 1, this.progressTotal);
    if (label != null) this.progressLabel = label;
    if (this.progressDone >= this.progressTotal) {
      this.progressTotal = 0; this.progressDone = 0; this.progressLabel = "";
      if (this.firstLoad && this.me != null && this.club.ladder.length > 0) { this.firstLoad = false; prefs.firstLoadDone = true; }
    }
    this.emit();
  }
  /** probíhá první (dlouhé) načtení dat */
  firstLoad = !prefs.firstLoadDone;

  season(): number { const m = this.me?.matches ?? []; return m.length ? Math.max(...m.map((x) => x.season)) : Stis.currentRocnik(); }

  /** Aktuální STR hráče: ze stránky hráče, z žebříčku oddílu, nebo z historie mých zápasů. */
  strOf(id: string | null | undefined, name: string): number | null {
    const m = this.me;
    if (m != null && (id === m.id || Stats.fold(name) === Stats.fold(m.name))) return m.currentStr;
    const rosters = () => this.next.flatMap((c) => [...c.opponentRoster, ...c.myRoster]);
    const lastOpp = (f: (x: Match) => boolean) => { const ch = m?.chronological ?? []; for (let i = ch.length - 1; i >= 0; i--) if (f(ch[i])) return ch[i].oppStrAfter; return null; };
    if (id) {
      for (const p of this.players.values()) if (p.id === id && p.currentStr != null) return p.currentStr;
      const l = this.club.ladder.find((e) => e.id === id)?.str; if (l != null) return l;
      const r = rosters().find((x) => x.id === id)?.str; if (r != null) return r;
      const o = lastOpp((x) => x.opponentId === id); if (o != null) return o;
    }
    const f = Stats.fold(name);
    const l = this.club.ladder.find((e) => Stats.fold(e.name) === f)?.str; if (l != null) return l;
    const r = rosters().find((x) => Stats.fold(x.name) === f)?.str; if (r != null) return r;
    return lastOpp((x) => Stats.fold(x.opponent) === f);
  }

  /** Rozpětí STRmin…STRmax nového hráče (jen když je široké – u zavedených hráčů se počítá s STR). */
  rangeOf(id: string | null | undefined, name: string): [number, number] | null {
    const f = Stats.fold(name);
    for (const p of this.players.values()) {
      if (!((id && p.id === id) || (!id && Stats.fold(p.name) === f))) continue;
      const { min, max } = p.ster;
      return min != null && max != null && max - min >= 200 ? [min, max] : null;
    }
    return null;
  }

  /** Soupiska s aktuálním STR. */
  fresh(list: RosterPlayer[]): RosterPlayer[] {
    return list.map((p) => {
      const page = (p.path ? this.players.get(p.path) : undefined) ?? Array.from(this.players.values()).find((x) => p.id != null && x.id === p.id);
      const live = this.club.ladder.find((e) => e.live && p.id != null && e.id === p.id);
      if (page?.currentStr != null) return p.copy({ str: page.currentStr });
      if (live?.str != null) return p.copy({ str: live.str });
      if (p.id != null && p.id === this.me?.id) return p.copy({ str: this.me?.currentStr ?? p.str });
      return p;
    });
  }

  // ---------- živé utkání
  liveLinks = new Map<string, string>();
  liveUpdated = new Map<string, number>();
  liveLoadingKeys = new Map<string, boolean>();
  liveErrors = new Map<string, string>();
  liveSearchingKeys = new Map<string, boolean>();
  liveSearchAt = new Map<string, number>();
  manualResults = new Map<string, number>();
  manualPos = new Map<string, number>();
  manualDbl = new Map<string, number>();

  teamKey(ctx: NextMatchContext): string { return ctx.myTeam.ref?.id ?? ctx.myTeam.name; }
  liveZapisFor(key: string): Zapis | null { const l = this.liveLinks.get(key); return l ? this.zapisy.get(l) ?? null : null; }

  zapisBelongs(z: Zapis, ctx: NextMatchContext): boolean {
    const id = ctx.myTeam.ref?.id;
    if (id != null && (z.homeTeamId === id || z.awayTeamId === id)) return true;
    const n = Stats.fold(ctx.myTeam.name);
    if (Stats.fold(z.home) === n || Stats.fold(z.away) === n) return true;
    return z.homeTeamId == null && z.awayTeamId == null && !z.home.trim() && !z.away.trim();
  }

  zapisMyHome(z: Zapis, ctx: NextMatchContext): boolean {
    const id = ctx.myTeam.ref?.id;
    const n = Stats.fold(ctx.myTeam.name);
    if (id != null && z.homeTeamId === id) return true;
    if (id != null && z.awayTeamId === id) return false;
    if (Stats.fold(z.home) === n) return true;
    if (Stats.fold(z.away) === n) return false;
    return ctx.home;
  }

  loadLive(key: string, path: string, force: boolean) {
    let link = path.trim().replace(/^https?:\/\/[^/]+/, "");
    const h = link.indexOf("#"); if (h >= 0) link = link.substring(0, h);
    if (!link.includes("utkani-") && !link.includes("/zapis/")) { this.liveErrors.set(key, "Vložte odkaz na zápis o utkání (…/zapis/…/utkani-…)."); this.emit(); return; }
    if (this.liveLoadingKeys.get(key)) return;
    this.liveLinks.set(key, link);
    this.liveLoadingKeys.set(key, true);
    this.liveErrors.delete(key);
    this.emit();
    (async () => {
      try {
        const z = await this.repo.zapis(link, force ? 0 : 60_000);
        if (z == null) this.liveErrors.set(key, "Zápis se nepodařilo přečíst.");
        else {
          this.zapisy.set(link, z);
          this.liveUpdated.set(key, Date.now());
          const ctx = this.next.find((c) => this.teamKey(c) === key);
          if (ctx && ctx.liveNow && this.zapisBelongs(z, ctx) && Live.isZapisFinished(z, this.format)) this.loadNext(false);
          const svaz = Stis.svaz(link);
          const ids = distinct(z.games.flatMap((g) => [...g.homeIds, ...g.awayIds])).filter((id) => id && this.strOf(id, "") == null);
          for (const id of ids.slice(0, 12)) {
            this.loadPlayer(svaz != null ? `/hrac-${id}/svaz-${svaz}/rocnik-${Stis.currentRocnik()}` : `/hrac-${id}`);
          }
        }
      } catch (e) {
        this.liveErrors.set(key, err(e));
      } finally {
        this.liveLoadingKeys.set(key, false); this.emit();
      }
    })();
  }

  autoFindZapis(team: number) {
    const ctx = this.next[team];
    if (!ctx) return;
    const key = this.teamKey(ctx);
    if (this.liveSearchingKeys.get(key)) return;
    this.liveSearchingKeys.set(key, true); this.emit();
    (async () => {
      try {
        const path = await this.repo.findZapis(ctx);
        this.liveSearchAt.set(key, Date.now());
        if (path != null) this.loadLive(key, path, true);
      } catch (e) {
        this.liveErrors.set(key, err(e));
      } finally {
        this.liveSearchingKeys.set(key, false); this.emit();
      }
    })();
  }

  playerPathById(id: string): string {
    let svaz: string | null = null;
    for (const l of this.liveLinks.values()) { svaz = Stis.svaz(l); if (svaz) break; }
    svaz ??= Stis.svaz(this.me?.path);
    return svaz != null ? `/hrac-${id}/svaz-${svaz}/rocnik-${Stis.currentRocnik()}` : `/hrac-${id}`;
  }

  /** Moje hry v probíhajícím utkání (odhad STR). */
  myLiveGames(team: string | null = null): MyLiveGame[] {
    const z = this.latestPendingZapis(team);
    const m = this.me;
    if (!z || !m) return [];
    const start = m.currentStr;
    if (start == null) return [];
    const unoff = this.unofficialFor(m).filter((x) => x.zapisPath !== z.path);
    let before = start;
    for (let i = unoff.length - 1; i >= 0; i--) if (unoff[i].strAfter != null) { before = unoff[i].strAfter!; break; }
    const games = Live.fromZapis(z, (id, n) => this.strOf(id, n), (id, n) => this.rangeOf(id, n));
    return LiveTimeline.timeline(games, m.id, m.name, before);
  }

  latestPendingZapis(team: string | null = null): Zapis | null {
    const m = this.me;
    if (!m) return null;
    const unoff = this.unofficialFor(m).filter((x) => team == null || Stats.fold(x.myTeam) === Stats.fold(team));
    const paths = distinct(unoff.map((x) => x.zapisPath));
    for (const c of this.next) {
      if (team != null && Stats.fold(c.myTeam.name) !== Stats.fold(team)) continue;
      const z = this.liveZapisFor(this.teamKey(c));
      if (!z || !this.zapisBelongs(z, c) || m.matches.some((x) => x.zapisPath === z.path)) continue;
      if (LiveTimeline.timeline(Live.fromZapis(z, (id, n) => this.strOf(id, n), (id, n) => this.rangeOf(id, n)), m.id, m.name, 1500).length) return z;
    }
    const lp = paths[paths.length - 1];
    return lp ? this.zapisy.get(lp) ?? null : null;
  }

  // ---------- formát utkání
  format: MatchFormat = MatchFormats.of(prefs.matchFormat);
  changeFormat(f: MatchFormat) { prefs.matchFormat = f.key; this.format = f; this.emit(); }

  liveFinished(ctx: NextMatchContext): boolean {
    const z = this.liveZapisFor(this.teamKey(ctx));
    return !!z && this.zapisBelongs(z, ctx) && Live.isZapisFinished(z, this.format);
  }

  upcoming(ctx: NextMatchContext): LosMatch | null {
    const n = ctx.next;
    if (!n) return null;
    if (!(ctx.liveNow && this.liveFinished(ctx))) return n;
    return minBy(ctx.los.filter((x) => !x.played && x !== n && (x.dateTime == null || n.dateTime == null || x.dateTime > n.dateTime)), (x) => x.dateTime ?? LDT_MAX);
  }

  /**
   * Stav upřesňování sestav pro očekávaný výsledek: dočítají se stránky hráčů (aktuální STR, účast)
   * a rozpis soupeře. busy = výpočet se ještě změní.
   */
  refineState(players: RosterPlayer[], ref: TeamRef | null): { busy: boolean; done: number; total: number } {
    const paths = players.map((p) => p.path).filter((x): x is string => !!x)
      .filter((p) => this.players.has(p) || this.loadingPlayers.has(p));
    const loading = paths.filter((p) => this.loadingPlayers.get(p) === true).length;
    const losPending = !!ref && this.teamLos.has(ref.id) && this.teamLos.get(ref.id) === null;
    return { busy: loading > 0 || losPending || this.loadingClub, done: paths.length - loading, total: paths.length };
  }

  /** Rozbor libovolného budoucího utkání (soupeř a jeho soupiska), stejně jako u příštího zápasu. */
  fixtures = new Map<string, NextMatchContext | null>();
  fixtureKey(team: number, m: { round: string; home: string; away: string }) { return `${team}|${m.round}|${m.home}|${m.away}`; }
  fixtureMatch(team: number, round: string, home: string, away: string): LosMatch | null {
    return this.next[team]?.los.find((x) => x.round === round && x.home === home && x.away === away) ?? null;
  }
  loadFixture(team: number, m: LosMatch) {
    const key = this.fixtureKey(team, m);
    const base = this.next[team];
    if (!base || this.fixtures.has(key)) return;
    this.fixtures.set(key, null); this.emit();
    (async () => {
      const ref = base.myTeam.ref;
      const home = Stats.isHome(m, ref, base.myTeam.name);
      const oppName = home ? m.away : m.home;
      let oppRef = home ? m.awayRef : m.homeRef;
      let roster: RosterPlayer[] = [];
      try {
        if (!oppRef && ref) oppRef = (await this.repo.soupisky(ref.svaz, ref.rocnik, ref.soutez)).find((x) => Stats.fold(x.name) === Stats.fold(oppName))?.team ?? null;
        if (oppRef) roster = (await this.repo.teamRoster({ ...oppRef, name: oppName })).players;
      } catch { /* soupiska soupeře chybí – rozbor bez ní */ }
      this.fixtures.set(key, { ...base, next: m, home, opponentName: oppName, opponentRef: oppRef, opponentRoster: roster, liveNow: false });
      this.emit();
    })();
  }

  /** Budoucí utkání družstva po příštím zápase (pro posouvání panelu doleva). */
  futureList(ctx: NextMatchContext): LosMatch[] {
    const n = this.upcoming(ctx);
    if (!n) return [];
    return ctx.los.filter((x) => !x.played && x !== n && x !== ctx.next && (x.dateTime == null || n.dateTime == null || x.dateTime > n.dateTime))
      .sort((a, b) => (a.dateTime ?? LDT_MAX) - (b.dateTime ?? LDT_MAX));
  }

  /** Zápasy hráče ze zápisů, které STIS ještě nezapočítal do jeho profilu. */
  unofficialFor(p: PlayerPage): Match[] {
    const start = p.currentStr;
    if (start == null) return [];
    const ch = p.chronological;
    const lastOfficial = ch.length ? ch[ch.length - 1].date : null;
    const td = today();
    const officialPaths = new Set(p.matches.map((m) => m.zapisPath).filter((x) => x));
    const candidates = distinctBy(Array.from(this.zapisy.values()), (z) => z.path)
      .filter((z) => !officialPaths.has(z.path) && z.games.length > 0)
      .map((z) => [z, Parsers.date(z.dateText) ?? td] as [Zapis, LDate])
      .filter(([, d]) => !(d < td - 21) && (lastOfficial == null || !(d < lastOfficial)))
      .sort((a, b) => a[1] - b[1]);
    let cur = start;
    const out: Match[] = [];
    for (const [z, date] of candidates) {
      const games = Live.fromZapis(z, (id, n) => this.strOf(id, n), (id, n) => this.rangeOf(id, n));
      const tl = LiveTimeline.timeline(games, p.id, p.name, cur);
      if (!tl.length) continue;
      const myHome = tl[0].home;
      for (const g of tl) {
        if (g.won == null) continue;
        const hs = g.game.homeSets, aw = g.game.awaySets;
        const score = hs != null && aw != null ? (g.home ? `${hs}:${aw}` : `${aw}:${hs}`) : g.won ? "3:0" : "0:3";
        out.push(Match.of({
          seq: -1000 - g.game.no, season: Stis.currentRocnik(date),
          dateText: `${pad2(ldDay(date))}.${pad2(ldMonth(date))}.${ldYear(date)}`, date,
          myTeam: myHome ? z.home : z.away, opponent: g.opponent.name, opponentId: g.opponent.id ?? "",
          opponentTeam: g.home ? z.away : z.home, score, zapisPath: z.path, competition: z.competition,
          strBefore: Math.round(g.strBefore), strAfter: g.strAfter != null ? Math.round(g.strAfter) : null,
          oppStrBefore: g.opponent.str, oppStrAfter: g.opponent.str,
          opponentPath: g.opponent.id ? this.playerPathById(g.opponent.id) : "",
          unofficial: true,
        }));
      }
      for (let i = tl.length - 1; i >= 0; i--) if (tl[i].strAfter != null) { cur = Math.round(tl[i].strAfter!); break; }
    }
    return out;
  }

  unofficialMatches(): Match[] { return this.me ? this.unofficialFor(this.me) : []; }

  withLive(p: PlayerPage): PlayerPage {
    const extra = this.unofficialFor(p);
    return extra.length ? p.copy({ matches: [...p.matches, ...extra] }) : p;
  }

  loadPendingZapisy() {
    const m = this.me;
    if (!m) return;
    const official = new Set(m.matches.map((x) => x.zapisPath).filter((x) => x));
    const ch = m.chronological;
    const lastOfficial = ch.length ? ch[ch.length - 1].date : null;
    const td = today();
    for (const ctx of this.next) {
      const l = this.liveLinks.get(this.teamKey(ctx));
      if (l && !official.has(l)) this.loadZapis(l, true);
      for (const x of ctx.los) {
        if (x.dateTime == null) continue;
        const d = ldtDate(x.dateTime);
        if (!x.zapisPath || official.has(x.zapisPath)) continue;
        if (d > td || d < td - 21) continue;
        if (lastOfficial != null && d < lastOfficial) continue;
        // i utkání bez výsledku v rozpisu: zápis existuje, jen ho STIS ještě nepotvrdil
        if (!x.played && !(ctx.liveNow && x === ctx.next) && x.dateTime > nowLdt()) continue;
        this.loadZapis(x.zapisPath, true);
      }
      // minulé utkání bez výsledku i bez odkazu na zápis: zkusíme zápis dohledat (jednou za spuštění)
      for (const x of ctx.los) {
        if (x.played || x.zapisPath || x.dateTime == null || x.dateTime > nowLdt() - 60) continue;
        const d = ldtDate(x.dateTime);
        if (d < td - 21 || (lastOfficial != null && d < lastOfficial)) continue;
        const k = this.fixtureKey(-1, x);
        if (this.zapisSearched.has(k)) continue;
        this.zapisSearched.add(k);
        this.repo.findZapis({ ...ctx, next: x }).then((p) => { if (p && !official.has(p)) { x.zapisPath = p; this.loadZapis(p, true); } }, () => {});
      }
    }
  }
  private zapisSearched = new Set<string>();

  /** Dohrané, ale STIS ho ještě nepotvrdil (v rozpisu bez výsledku, zápis je kompletní). */
  awaitingConfirmation(m: LosMatch): boolean {
    if (m.played || !m.zapisPath) return false;
    const z = this.zapisy.get(m.zapisPath);
    return !!z && z.games.length > 0 && Live.isZapisFinished(z, this.format);
  }

  meWithLive(): PlayerPage | null {
    const m = this.me;
    if (!m) return null;
    const extra = this.unofficialMatches();
    return extra.length ? m.copy({ matches: [...m.matches, ...extra] }) : m;
  }

  /** Všechna odehraná utkání družstva v sezóně, od nejnovějšího. */
  previousList(ctx: NextMatchContext): [LosMatch | null, string][] {
    const out: [LosMatch | null, string][] = [];
    const liveDone = ctx.liveNow && this.liveFinished(ctx);
    if (liveDone) { const l = this.liveLinks.get(this.teamKey(ctx)); if (l) out.push([ctx.next, l]); }
    const losPaths = new Set(ctx.los.filter((x) => x.played).map((x) => x.zapisPath));
    Array.from(this.zapisy.values())
      .filter((z) => !losPaths.has(z.path) && !out.some((o) => o[1] === z.path) && this.zapisBelongs(z, ctx) && Live.isZapisFinished(z, this.format))
      .sort((a, b) => (Parsers.date(b.dateText) ?? LDATE_MIN) - (Parsers.date(a.dateText) ?? LDATE_MIN))
      .forEach((z) => out.push([ctx.los.find((x) => x.zapisPath === z.path) ?? null, z.path]));
    ctx.los.filter((x) => x.played && !(liveDone && x === ctx.next))
      .sort((a, b) => (b.dateTime ?? -LDT_MAX) - (a.dateTime ?? -LDT_MAX))
      .forEach((x) => out.push([x, x.zapisPath]));
    return out;
  }

  lastUtkani(team: string | null = null): LastUtkani | null {
    const m = this.me;
    if (!m) return null;
    const pending = this.latestPendingZapis(team);
    if (pending) {
      const live = this.myLiveGames(team);
      const running = !Live.isZapisFinished(pending, this.format);
      const myTeam = this.next.find((c) => this.zapisBelongs(pending, c))?.myTeam.name ?? (live[0]?.home === true ? pending.home : pending.away);
      return { title: running ? "Probíhající utkání" : "Poslední utkání · čeká na potvrzení STIS", unofficial: true, live, official: [], zapisPath: pending.path, myTeam, running };
    }
    const ch = m.chronological;
    let last: Match | null = null;
    for (let i = ch.length - 1; i >= 0; i--) if (team == null || Stats.fold(ch[i].myTeam) === Stats.fold(team)) { last = ch[i]; break; }
    if (!last) return null;
    const keyOf = (x: Match) => x.zapisPath || x.dateText + x.myTeam;
    const key = keyOf(last);
    const games = ch.filter((x) => keyOf(x) === key);
    return { title: `Poslední utkání · ${last.dateText}`, unofficial: false, live: [], official: games, zapisPath: last.zapisPath, myTeam: last.myTeam, running: false };
  }

  // ---------- žebříčky soutěží (tabulka družstev a oficiální žebříček STR)
  /** hlavní družstvo hráče = nejvíc zápasů v sezóně */
  mainTeamIndex = 0;
  tabulky = new Map<string, StandingRow[]>();
  strLadders = new Map<string, StrLadder>();
  compErrors = new Map<string, string>();
  compLoading = new Map<string, boolean>();

  private loadComp(path: string, work: () => Promise<void>) {
    if (this.compLoading.get(path)) return;
    this.compLoading.set(path, true); this.compErrors.delete(path); this.emit();
    work().catch((e) => { this.compErrors.set(path, err(e)); }).finally(() => { this.compLoading.set(path, false); this.emit(); });
  }
  loadTabulka(svaz: string, rocnik: number, soutez: string, force = false) {
    const path = Stis.tabulka(svaz, rocnik, soutez);
    if (!force && this.tabulky.has(path)) return;
    this.loadComp(path, async () => { this.tabulky.set(path, await this.repo.tabulka(svaz, rocnik, soutez, force ? 0 : 6 * HOUR)); });
  }
  loadStrLadder(svaz: string, rocnik: number, soutez: string, force = false) {
    const path = Stis.zebricek(svaz, rocnik, soutez);
    if (!force && this.strLadders.has(path)) return;
    this.loadComp(path, async () => { this.strLadders.set(path, await this.repo.strLadder(svaz, rocnik, soutez, force ? 0 : 6 * HOUR)); });
  }

  // ---------- predikce konečné tabulky soutěže
  predictions = new Map<string, SeasonPrediction>();
  predLoading = new Map<string, boolean>();
  predErrors = new Map<string, string>();
  predProgress = "";
  /** Spočítá predikci tabulky po sezóně: rozpisy všech družstev soutěže, soupisky, simulace. */
  loadPrediction(svaz: string, rocnik: number, soutez: string, force = false) {
    const key = Stis.tabulka(svaz, rocnik, soutez);
    if (this.predLoading.get(key) || (!force && this.predictions.has(key))) return;
    this.predLoading.set(key, true); this.predErrors.delete(key); this.predProgress = "Načítám tabulku…"; this.emit();
    (async () => {
      try {
        const rows = this.tabulky.get(key) ?? (await this.repo.tabulka(svaz, rocnik, soutez));
        this.tabulky.set(key, rows);
        if (!rows.length) throw new Error("Tabulka soutěže je prázdná – není z čeho počítat.");
        this.predProgress = "Načítám soupisky soutěže…"; this.emit();
        const rosters = await this.repo.soupisky(svaz, rocnik, soutez);
        let refs: TeamRef[] = rosters.map((r) => r.team).filter((x): x is TeamRef => !!x);
        if (!refs.length) {
          const mine = this.me?.seasons.flatMap((s) => s.teams).map((t) => t.ref).find((r) => r && r.soutez === soutez && r.rocnik === rocnik);
          if (mine) refs = await this.repo.competitionTeams(mine);
        }
        const tableName = (n: string) => {
          const f = Stats.fold(n);
          return rows.find((r) => Stats.fold(r.name) === f)?.name ?? rows.find((r) => f.startsWith(Stats.fold(r.name)) || Stats.fold(r.name).startsWith(f))?.name ?? null;
        };
        const future = new Map<string, { home: string; away: string }>();
        for (let i = 0; i < refs.length; i++) {
          this.predProgress = `Načítám rozpisy družstev ${i + 1}/${refs.length}…`; this.emit();
          let los: LosMatch[] = [];
          try { los = await this.repo.los(refs[i]); } catch { /* družstvo bez rozpisu */ }
          for (const m of los) {
            if (m.played) continue;
            const h = tableName(m.home), a = tableName(m.away);
            if (!h || !a || h === a) continue;
            future.set(`${m.round}|${h}|${a}`, { home: h, away: a });
          }
        }
        this.predProgress = "Odhaduji sestavy…"; this.emit();
        const teams: SeasonTeam[] = [];
        for (const r of rows) {
          let players = rosters.find((x) => Stats.fold(x.name) === Stats.fold(r.name))?.players ?? [];
          if (!players.length) {
            const ref = refs.find((x) => Stats.fold(x.name) === Stats.fold(r.name));
            if (ref) { try { players = (await this.repo.teamRoster(ref)).players; } catch { /* bez soupisky */ } }
          }
          const lineup = Stats.suggestLineup(this.fresh(players), this.format.players).map((p) => p.str ?? 0).filter((x) => x > 0);
          const [a, b] = r.score.split(":").map((x) => parseInt(x, 10));
          teams.push({ name: r.name, points: r.points, played: r.played, wins: r.wins, draws: r.draws, losses: r.losses, diff: (a || 0) - (b || 0), lineup });
        }
        // průměr soutěže pro družstva bez známé sestavy
        const all = teams.flatMap((t) => t.lineup);
        const avgStr = all.length ? Math.round(all.reduce((x, y) => x + y, 0) / all.length) : 1400;
        for (const t of teams) if (!t.lineup.length) t.lineup = [avgStr];
        this.predProgress = `Simuluji ${future.size} zbývajících utkání…`; this.emit();
        await new Promise((r) => setTimeout(r, 30));
        this.predictions.set(key, predictSeason(teams, Array.from(future.values()), pointsRule(rows), this.format));
      } catch (e) {
        this.predErrors.set(key, err(e));
      } finally {
        this.predLoading.set(key, false); this.predProgress = ""; this.emit();
      }
    })();
  }

  // ---------- herna, vybavení a kontakt družstev (stránka družstva)
  teamInfos = new Map<string, TeamInfo>();
  teamInfoLoading = new Set<string>();
  loadTeamInfo(ref: TeamRef) {
    if (this.teamInfos.has(ref.id) || this.teamInfoLoading.has(ref.id)) return;
    this.teamInfoLoading.add(ref.id);
    this.repo.teamInfo(ref).then((i) => { this.teamInfos.set(ref.id, i); }, () => { /* bez údajů */ })
      .finally(() => { this.teamInfoLoading.delete(ref.id); this.emit(); });
  }
  /** Družstvo jako odkaz podle ID a cesty zápisu (/zapis/svaz-…/rocnik-…/soutez-…/utkani-…). */
  refFromZapis(path: string, teamId: string | null, name: string): TeamRef | null {
    const m = /svaz-(\d+)\/rocnik-(\d{4})\/soutez-(\d+)/.exec(path);
    return teamId && m ? { id: teamId, svaz: m[1], rocnik: parseInt(m[2], 10), soutez: m[3], name } : null;
  }

  // ---------- místo utkání (herna domácího družstva)
  /** Herna družstva podle některého z jeho domácích zápisů ("Hráno v místnosti"). */
  homePlace(ref: TeamRef | null, name: string): string | null {
    const f = Stats.fold(name);
    for (const z of this.zapisy.values()) {
      if (!z.place.trim()) continue;
      if ((ref && z.homeTeamId === ref.id) || Stats.fold(z.home) === f) return z.place;
    }
    return null;
  }
  /** Dočte jeden domácí zápis družstva (přes jeho rozpis), aby bylo známé místo budoucích utkání. */
  ensureHomePlace(ref: TeamRef | null, name: string) {
    if (!ref || this.homePlace(ref, name)) return;
    const los = this.next.find((c) => c.myTeam.ref?.id === ref.id)?.los ?? this.teamLos.get(ref.id);
    if (los === undefined) { this.loadTeamLos(ref); return; }
    if (los === null) return;
    const home = los.find((x) => x.played && x.zapisPath && (x.homeRef?.id === ref.id || Stats.fold(x.home) === Stats.fold(name)));
    if (home) this.loadZapis(home.zapisPath);
  }

  // ---------- volby filtrů, které se pamatují mezi obrazovkami
  lastByTeam = true;
  matchesTeam = "all";
  matchesSeason: string | null = null;
  recentTeam = "all";
  oppMode = "name";
  oppComp = "all";
  rankByTeam = false;
  ladderTab = "tabulka";
  /** po otevření obrazovky posunout na sekci (např. "klutch" v Rekordech) */
  scrollTarget: string | null = null;
  matchesTab = "utkani";
  compSeason: number | null = null;
  compId: string | null = null;
  strLadderMine = false;
  strLadderSort = "str";
  predOn = false;
  utkaniTeam: number | null = null;
  set<K extends "lastByTeam" | "matchesTeam" | "matchesSeason" | "recentTeam" | "oppMode" | "oppComp" | "rankByTeam" | "ladderTab" | "matchesTab" | "compSeason" | "compId" | "strLadderMine" | "strLadderSort" | "utkaniTeam" | "predOn">(k: K, v: AppVm[K]) {
    (this as any)[k] = v; this.emit();
  }

  searchInfo(): string { return this.fetcher.lastSearchInfo; }

  resetManual() { this.manualResults.clear(); this.manualPos.clear(); this.manualDbl.clear(); this.emit(); }
  toggleDbl(key: string, d: number) { if (this.manualDbl.get(key) === d) this.manualDbl.delete(key); else this.manualDbl.set(key, d); this.emit(); }
  togglePos(key: string, p: number) { if (this.manualPos.get(key) === p) this.manualPos.delete(key); else this.manualPos.set(key, p); this.emit(); }
  toggleManualResult(key: string, no: number) {
    const k = `${key}|${no}`;
    const v = this.manualResults.get(k);
    if (v == null) this.manualResults.set(k, 1); else if (v === 1) this.manualResults.set(k, -1); else this.manualResults.delete(k);
    this.emit();
  }
  manualResultsFor(key: string): Map<number, number> {
    const out = new Map<number, number>();
    for (const [k, v] of this.manualResults) if (k.startsWith(key + "|")) out.set(parseInt(k.substring(k.lastIndexOf("|") + 1), 10), v);
    return out;
  }
  clearManualResults(key: string) { for (const k of Array.from(this.manualResults.keys())) if (k.startsWith(key + "|")) this.manualResults.delete(k); this.emit(); }

  loadClub(force: boolean) {
    const m = this.me;
    if (!m || this.loadingClub) return;
    this.loadingClub = true;
    this.stepsAdd(1, "Hledám družstva oddílu…");
    let pendingSteps = 1;
    (async () => {
      try {
        const [name, teams] = await this.repo.clubTeams(m, prefs.clubPath ?? m.currentSeason?.clubPath ?? null);
        this.stepDone(); pendingSteps--;
        this.stepsAdd(teams.length * 2); pendingSteps += teams.length * 2;
        const rosters: TeamRoster[] = [];
        for (let i = 0; i < teams.length; i++) {
          this.clubProgress = `Načítám družstvo ${i + 1}/${teams.length}…`;
          rosters.push(await this.repo.teamRoster(teams[i], force ? 0 : 24 * HOUR));
          this.stepDone(this.clubProgress); pendingSteps--;
        }
        let ladder = Stats.ladder(rosters);
        this.club = new ClubState(name, teams, rosters, Stats.refreshLadder(ladder, new Map(), m, this.season()));
        this.emit();
        const pages = new Map<string, PlayerPage>();
        const todo = ladder.filter((e) => e.path != null && e.id != null && e.id !== m.id);
        this.stepsAdd(todo.length); pendingSteps += todo.length;
        for (let i = 0; i < todo.length; i++) {
          const e = todo[i];
          this.clubProgress = `Aktualizuji STR hráčů ${i + 1}/${todo.length}…`;
          this.progressLabel = this.clubProgress;
          try {
            const p = await this.repo.player(e.path!, force ? 0 : 24 * HOUR);
            if (p) { pages.set(e.id!, p); this.players.set(e.path!, p); }
          } catch { /* hráč zůstane s hodnotou ze soupisky */ }
          this.stepDone(); pendingSteps--;
          if (i % 4 === 3 || i === todo.length - 1) this.club = new ClubState(name, teams, rosters, Stats.refreshLadder(ladder, pages, m, this.season()));
        }
        ladder = Stats.refreshLadder(ladder, pages, m, this.season());
        this.club = new ClubState(name, teams, rosters, ladder);
        this.clubProgress = "Počítám stabilní sestavy…";
        const teamPlayed = new Map<string, number>();
        for (const t of teams) {
          this.progressLabel = "Počítám stabilní sestavy…";
          try { teamPlayed.set(t.name, (await this.repo.los(t)).filter((x) => x.played).length); } catch { teamPlayed.set(t.name, 0); }
          this.stepDone(); pendingSteps--;
        }
        pages.set(m.id, m);
        this.club = this.withStability(new ClubState(name, teams, rosters, ladder), pages, teamPlayed);
      } catch (e) {
        this.error = err(e);
      } finally {
        this.loadingClub = false;
        this.clubProgress = "";
        for (let i = 0; i < Math.max(0, pendingSteps); i++) this.stepDone();
        this.emit();
      }
    })();
  }

  private withStability(c: ClubState, pages: Map<string, PlayerPage>, teamPlayed: Map<string, number>): ClubState {
    const s = this.season();
    const stable = new Map<string, Set<string>>();
    const utkani = new Map<string, Map<string, number>>();
    for (const r of c.rosters) {
      const known = r.players.map((p) => (p.id ? pages.get(p.id) : undefined)).filter((x): x is PlayerPage => !!x);
      const lastTeamPlayed = known.length ? Math.max(...known.map((pg) => Stability.utkani(pg, r.name, s - 1))) : 0;
      for (const p of r.players) {
        const key = c.keyOf(p.id, p.name);
        const page = p.id ? pages.get(p.id) : undefined;
        if (!page) continue;
        const played = Stability.utkani(page, r.name, s);
        const um = new Map(utkani.get(key) ?? []); um.set(r.name, played); utkani.set(key, um);
        if (Stability.isStable(played, teamPlayed.get(r.name) ?? 0, Stability.utkani(page, r.name, s - 1), lastTeamPlayed)) {
          const st = new Set(stable.get(key) ?? []); st.add(r.name); stable.set(key, st);
        }
      }
    }
    return new ClubState(c.name, c.teams, c.rosters, c.ladder, stable, utkani, true);
  }

  // ---------- soupeřova družstva: rozpis pro účast hráčů
  teamLos = new Map<string, LosMatch[] | null>();
  loadTeamLos(ref: TeamRef) {
    if (this.teamLos.has(ref.id)) return;
    this.teamLos.set(ref.id, null);
    (async () => {
      try { this.teamLos.set(ref.id, await this.repo.los(ref)); } catch { this.teamLos.delete(ref.id); }
      this.emit();
    })();
  }

  lineupFor(teamName: string, teamRef: TeamRef | null, roster: RosterPlayer[]): [RosterPlayer, boolean][] {
    const size = this.format.players;
    const s = this.season();
    const club = this.club;
    const isClubTeam = club.stabilityKnown && club.rosters.some((r) => Stats.fold(r.name) === Stats.fold(teamName));
    if (isClubTeam) {
      return Stability.lineup(roster, size, (p) => club.isStable(p.id, p.name, teamName), (p) => {
        const m = club.utkani.get(club.keyOf(p.id, p.name));
        if (!m) return 0;
        for (const [k, v] of m) if (Stats.fold(k) === Stats.fold(teamName)) return v;
        return 0;
      });
    }
    const pageOf = (p: RosterPlayer) => (p.path ? this.players.get(p.path) : undefined) ?? Array.from(this.players.values()).find((x) => p.id != null && x.id === p.id);
    const tl = teamRef ? this.teamLos.get(teamRef.id) : undefined;
    const teamPlayed = tl ? tl.filter((x) => x.played).length : null;
    const known = roster.map(pageOf).filter((x): x is PlayerPage => !!x);
    if (teamPlayed == null || !known.length) return Stats.suggestLineup(roster, size).map((p) => [p, false]);
    const lastTeamPlayed = Math.max(...known.map((pg) => Stability.utkani(pg, teamName, s - 1)));
    return Stability.lineup(roster, size,
      (p) => { const pg = pageOf(p); return pg ? Stability.isStable(Stability.utkani(pg, teamName, s), teamPlayed, Stability.utkani(pg, teamName, s - 1), lastTeamPlayed) : false; },
      (p) => { const pg = pageOf(p); return pg ? Stability.utkani(pg, teamName, s) : 0; });
  }

  // ---------- vyhledávání na STIS
  searchPlayers(query: string, onResult: (r: SearchPlayer[] | null, e: string | null) => void) {
    this.repo.searchPlayers(query).then((r) => onResult(r, null), (e) => onResult(null, err(e)));
  }
  searchClubs(query: string, onResult: (r: SearchClub[] | null, e: string | null) => void) {
    this.repo.searchClubs(query).then((r) => onResult(r, null), (e) => onResult(null, err(e)));
  }

  loadNext(_force: boolean) {
    const m = this.me;
    if (!m || this.loadingNext) return;
    this.loadingNext = true;
    this.stepsAdd(1, "Načítám rozpisy a příští zápasy…");
    (async () => {
      try {
        const finished = new Set([...this.next.filter((c) => c.liveNow && this.liveFinished(c)).map((c) => c.myTeam.ref?.id).filter((x): x is string => !!x), ...this.finishedTeams]);
        for (const f of finished) this.finishedTeams.add(f);
        const ctx = await this.repo.nextMatches(m, nowLdt(), finished);
        this.next = ctx;
        for (const c of ctx) {
          const key = this.teamKey(c);
          const z = this.liveZapisFor(key);
          if (!z) continue;
          if (!c.liveNow && this.zapisBelongs(z, c) && Live.isZapisFinished(z, this.format)) this.liveLinks.delete(key);
        }
        this.mainTeamIndex = this.defaultTeamIndex(ctx, m);
        if (!this.nextSelectedByUser || this.nextSelected >= ctx.length) this.nextSelected = this.mainTeamIndex;
        ctx.forEach((c, i) => { if (c.liveNow && this.liveLinks.get(this.teamKey(c)) == null) this.autoFindZapis(i); });
        this.loadPendingZapisy();
        const c = ctx.find((x) => x.next?.dateTime != null);
        if (c) {
          const dt = c.next!.dateTime!;
          const d = ldtDate(dt);
          prefs.nextMatchText = `${c.home ? "doma" : "venku"} vs ${c.opponentName}, ${ldDay(d)}. ${ldMonth(d)}. ${pad2(ldtHour(dt))}:${pad2(ldtMinute(dt))}`;
          this.remind(m, ctx);
        }
      } catch (e) {
        this.error = err(e);
      } finally {
        this.loadingNext = false;
        this.stepDone();
      }
    })();
  }

  loadPlayer(path: string, force = false) {
    if (this.loadingPlayers.get(path)) return;
    if (!force && this.players.has(path)) return;
    this.loadingPlayers.set(path, true); this.emit();
    (async () => {
      try {
        const p = await this.repo.player(path, force ? 0 : 24 * HOUR);
        if (p) this.players.set(path, p);
      } catch (e) {
        this.error = err(e);
      } finally {
        this.loadingPlayers.set(path, false); this.emit();
      }
    })();
  }

  private zapisLoading = new Set<string>();
  loadZapis(path: string, track = false) {
    if (this.zapisy.has(path) || !path || this.zapisLoading.has(path)) return;
    this.zapisLoading.add(path);
    if (track) this.stepsAdd(1, "Načítám zápisy utkání…");
    (async () => {
      try {
        const z = await this.repo.zapis(path);
        if (z) this.zapisy.set(path, z);
      } catch { /* detail setů je jen doplněk */ }
      finally {
        this.zapisLoading.delete(path);
        if (track) this.stepDone(); else this.emit();
      }
    })();
  }

  loadSetStats() {
    const m = this.me;
    if (!m || this.loadingSets) return;
    this.loadingSets = true; this.emit();
    (async () => {
      try {
        const season = m.matches.length ? Math.max(...m.matches.map((x) => x.season)) : Stis.currentRocnik();
        const list = await this.repo.zapisyForSeason(m, season);
        for (const z of list) this.zapisy.set(z.path, z);
        this.setStats = Stats.setStats(list, m.id);
      } catch (e) {
        this.error = err(e);
      } finally {
        this.loadingSets = false; this.emit();
      }
    })();
  }

  /** Načte libovolný oddíl / družstvo podle vloženého odkazu nebo čísla oddílu. */
  loadOther(input: string) {
    const m = this.me;
    this.otherError = null;
    let link = Stis.normalizeInput(input);
    if (link?.kind === "player" && /^\d{6,}$/.test(input.trim())) {
      const ref = this.next[0]?.myTeam.ref;
      link = { kind: "club", id: input.trim(), svaz: ref?.svaz ?? null, rocnik: ref?.rocnik ?? null, path: "" };
    }
    this.loadingOther = true; this.emit();
    const target = link;
    (async () => {
      try {
        if (target == null) this.otherError = "Vložte odkaz na oddíl, družstvo nebo hráče ze STIS, případně číslo oddílu.";
        else if (target.kind === "team") {
          this.otherClub = null; this.otherTeams = [target.ref];
          this.otherRoster = await this.repo.teamRoster(target.ref);
        } else if (target.kind === "club") {
          const svaz = target.svaz ?? (m ? this.repo.myTeams(m)[0]?.ref?.svaz ?? null : null);
          const rocnik = target.rocnik ?? Stis.currentRocnik();
          const path = target.path || (svaz != null ? Stis.oddil(target.id, svaz, rocnik) : `/oddil-${target.id}`);
          const c = await this.repo.club(Stis.clubForRocnik(path), 0);
          this.otherClub = c; this.otherTeams = c.teams; this.otherRoster = null;
          if (!c.teams.length) this.otherError = "Na stránce oddílu jsem nenašel žádná družstva.";
        } else {
          const p = await this.repo.player(target.path);
          const teams = (p?.currentSeason?.teams ?? []).map((t) => t.ref).filter((x): x is TeamRef => !!x);
          this.otherClub = null; this.otherTeams = teams; this.otherRoster = null;
          if (!teams.length) this.otherError = "U hráče jsem nenašel aktuální družstvo.";
        }
      } catch (e) {
        this.otherError = err(e);
      } finally {
        this.loadingOther = false; this.emit();
      }
    })();
  }

  pickOtherTeam(ref: TeamRef) {
    this.loadingOther = true; this.otherError = null; this.emit();
    (async () => {
      try {
        this.otherRoster = await this.repo.teamRoster(ref);
        if (!this.otherRoster?.players.length) this.otherError = "Soupiska družstva je prázdná nebo nečitelná.";
      } catch (e) {
        this.otherError = err(e);
      } finally {
        this.loadingOther = false; this.emit();
      }
    })();
  }

  competitionTeams(ref: TeamRef, onResult: (l: TeamRef[]) => void) {
    this.repo.competitionTeams(ref).then(onResult, () => onResult([]));
  }

  clearOther() { this.otherClub = null; this.otherTeams = []; this.otherRoster = null; this.otherError = null; this.emit(); }

  rosterOf(teamId: string | null): RosterPlayer[] { return this.club.rosters.find((r) => r.team?.id === teamId)?.players ?? []; }

  setClubPath(input: string): boolean {
    if (!input.trim()) { prefs.clubPath = null; this.club = new ClubState(); this.loadClub(true); return true; }
    const l = Stis.normalizeInput(input);
    if (l?.kind !== "club") return false;
    prefs.clubPath = l.path;
    this.club = new ClubState();
    this.loadClub(true);
    return true;
  }

  // ---------- upozornění (na webu jen při otevření aplikace)
  async setNotifications(on: boolean): Promise<string | null> {
    prefs.notifications = on;
    this.emit();
    if (on && typeof Notification !== "undefined" && Notification.permission === "default") {
      const r = await Notification.requestPermission();
      if (r !== "granted") return "Bez povolení notifikací nebudou chodit upozornění.";
    }
    if (on && typeof Notification !== "undefined" && Notification.permission === "denied") return "Notifikace jsou v prohlížeči zakázané – povolte je v nastavení webu.";
    return null;
  }

  private async post(tag: string, title: string, body: string) {
    if (!prefs.notifications || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification(title, { body, tag, icon: "icon-192.png", badge: "icon-192.png" });
      else new Notification(title, { body, tag });
    } catch { /* nepodstatné */ }
  }

  /** Souhrn pro upozornění: nové zápasy od minula (přepis SyncWorker.remember). */
  private remember(me: PlayerPage) {
    const season = Stis.currentRocnik();
    const all = me.chronological;
    const before = prefs.lastMatchCount;
    const oldStr = prefs.lastStr;
    const fresh = before >= 0 && before < all.length ? all.slice(before) : [];
    prefs.lastMatchCount = all.length;
    prefs.lastStr = me.currentStr ?? -1;
    const sm = all.filter((x) => x.season === season);
    const start = sm[0]?.strBefore;
    prefs.seasonDelta = start != null && me.currentStr != null ? me.currentStr - start : 0;
    prefs.playerName = me.name;
    prefs.lastSync = Date.now();
    if (fresh.length) {
      const w = fresh.filter((x) => x.won).length;
      const n = fresh.length;
      const word = n === 1 ? "zápas" : n <= 4 ? "zápasy" : "zápasů";
      const strText = oldStr > 0 && me.currentStr != null ? `STR ${oldStr} → ${me.currentStr}` : `STR ${me.currentStr ?? "?"}`;
      void this.post("results", `Nové výsledky: ${n} ${word} (${w}–${n - w})`, `${strText} · ` + fresh.slice(-3).map((x) => `${x.opponent} ${x.score}`).join(", "));
    }
  }

  /** Připomínka utkání do 30 hodin. */
  private remind(me: PlayerPage, ctxs: NextMatchContext[]) {
    const ctx = ctxs.find((c) => c.next?.dateTime != null);
    const nx = ctx?.next;
    if (!ctx || nx?.dateTime == null) return;
    const key = ctx.myTeam.name + nx.dateText;
    const hours = (nx.dateTime - nowLdt()) / 60;
    if (hours < 0 || hours > 30 || prefs.remindedMatch === key || !prefs.notifications) return;
    prefs.remindedMatch = key;
    const txt = `${ctx.home ? "doma" : "venku"} vs ${ctx.opponentName}, ${fmtDT(nx.dateTime)}`;
    const sc = Stats.scout(me, ctx.opponentRoster).slice(0, 4);
    const body = sc.length ? txt + " · soupeři: " + sc.map((s) => `${s.player.name.split(" ")[0]} ${s.winProb != null ? Stats.pct(s.winProb) : ""}`).join(", ") : txt;
    void this.post("reminder", `Zítra hrajete: ${ctx.myTeam.name}`, body);
  }

  async clearCache() { await this.fetcher.clear(); this.firstLoad = true; prefs.firstLoadDone = false; this.emit(); }
  cacheSize(): Promise<number> { return this.fetcher.cacheSizeBytes(); }

  logout() {
    prefs.playerPath = null;
    this.me = null; this.club = new ClubState(); this.next = []; this.setStats = null;
    this.players.clear();
    this.onboarding = true;
    this.resetTo(S.Overview);
  }
}

export const vm = new AppVm();
export { ldtOf };

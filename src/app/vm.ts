// Stav aplikace a načítání dat (přepis AppViewModel.kt). Každá změna stavu zavolá emit() a React překreslí obrazovku.
import { CompTree, type CompEntry, type CompTreeData } from "../core/compTree";
import { Complex, h2hAdj, homeAdvantage, type H2HInfo } from "../core/complex";
import { Match, Stis, type TeamInfo, type StandingRow, type StrLadder, type ClubPage, type LosMatch, type PlayerPage, type RosterPlayer, type TeamRef, type TeamRoster, type Zapis, type ZapisGame } from "../core/models";
import { Parsers } from "../core/parsers";
import { shortTeam, surname } from "../core/names";
import { StisRepository, HOUR, type NextMatchContext } from "../core/repository";
import { playSound, soundUnlocked, onSoundUnlock } from "./sound";
import { Stats, StrModel, LadderEntry, minBy, distinct, distinctBy, type SetStats } from "../core/stats";
import { Live, LiveTimeline, MatchFormats, type MatchFormat, type MyLiveGame } from "../core/live";
import { Stability, type SearchClub, type SearchPlayer } from "../core/search";
import { pointsRule, predictSeason, type SeasonPrediction, type SeasonTeam } from "../core/season";
import { type LDate, LDT_MAX, fmtDT, ldDay, ldMonth, ldYear, ldtDate, ldtHour, ldtMinute, ldtOf, today, nowLdt } from "../core/dates";
import { FetchError, WebFetcher } from "../data/fetcher";
import { prefs } from "../data/prefs";
import { SP } from "./channel";
const DAY_MS = 86_400_000;

/** Soutěž na obrazovce Živě. */
export interface LiveComp { svaz: string; rocnik: number; soutez: string; label: string; mine?: boolean }
/** Sledované utkání (max. 5) s vlastním nastavením upozornění. */
export interface Watched {
  key: string; svaz: string; rocnik: number; soutez: string; compLabel: string; round: string;
  home: string; away: string; homeRef: TeamRef | null; awayRef: TeamRef | null; dateTime: number | null;
  zapisPath: string; mode: "off" | "games" | "sets"; fan: "home" | "away" | "none";
}
export const MAX_WATCHED = 5;

/** Obrazovky aplikace (vlastní navigace se zásobníkem). */
export type BoardStatus = { kind: "future" | "live" | "done"; text: string; h: number | null; a: number | null; sub?: string };

export type Screen =
  | { t: "Overview" } | { t: "Ladder" } | { t: "Comps" } | { t: "Matches" } | { t: "Opponents" }
  | { t: "Club"; name: string } | { t: "H2H"; key: string } | { t: "NextMatch" } | { t: "Captain" }
  | { t: "Compare"; a: string | null; b: string | null } | { t: "Records" } | { t: "Settings" }
  | { t: "Player"; path: string; name?: string; ask?: boolean } | { t: "Live"; team: number }
  | { t: "BrowseClub"; path: string; name: string }
  | { t: "BrowseComp"; svaz: string; rocnik: number; soutez: string; name: string }
  | { t: "Duel"; aId: string; aName: string; bId: string; bName: string; pA?: number }
  | { t: "ZapisDetail"; path: string; myTeam: string }
  | { t: "Fixture"; team: number; round: string; home: string; away: string }
  | { t: "Team"; team: number }
  | { t: "Watch"; key: string }
  | { t: "About" }
  | { t: "AdminStats" }
  | { t: "Shared"; path: string }
  | { t: "OtherTeam"; ref: TeamRef; comp: string }
  | { t: "Prediction"; data: string }
  | { t: "Model"; section?: string | null };

export const S = {
  Overview: { t: "Overview" } as Screen, Ladder: { t: "Ladder" } as Screen, Comps: { t: "Comps" } as Screen,
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
  /** datum utkání (text) a kolo, pokud je známé */
  dateText: string; round: string | null;
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
    queueMicrotask(() => { this.pending = false; this.version++; this.saveStack(); for (const l of this.listeners) l(); });
  }
  /** Obrazovky, které po obnovení stránky nedávají smysl (závisí na právě běžícím utkání). */
  private static NO_RESTORE = new Set(["Live", "Fixture", "Team", "Watch", "Shared", "Prediction"]);
  private savedStack = "";
  /** Historie obrazovek přežije obnovení stránky (pull-to-refresh prohlížeče, aktualizace aplikace). */
  private saveStack() {
    if (typeof sessionStorage === "undefined" || this.onboarding || this.guest) return;
    const v = JSON.stringify(this.stack);
    if (v === this.savedStack) return;
    this.savedStack = v;
    try { sessionStorage.setItem(SP + "stack", JSON.stringify({ s: this.stack, t: Date.now() })); } catch { /* soukromý režim */ }
  }
  private restoreStack() {
    try {
      const x = JSON.parse(sessionStorage.getItem(SP + "stack") ?? "null");
      if (!x || Date.now() - x.t > 6 * 3600_000 || !Array.isArray(x.s)) return;
      const st = (x.s as Screen[]).filter((s) => s && typeof s.t === "string" && !AppVm.NO_RESTORE.has(s.t));
      if (st.length) this.stack = st;
    } catch { /* */ }
  }
  /** Obnovit data aktuální obrazovky (tlačítko Obnovit i stažení obrazovky dolů). */
  refreshCurrent() {
    const s = this.current;
    switch (s.t) {
      case "BrowseClub": this.loadClubPage(s.path, true); break;
      case "BrowseComp": this.loadCompBrowse(s, true); break;
      case "Player": if (this.me && s.path === this.me.path) this.refreshAll(); else this.loadPlayer(s.path, true); break;
      case "ZapisDetail": this.loadZapis(s.path, false, true); break;
      default: this.refreshAll();
    }
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
  /** Nahradí aktuální obrazovku (zpět pak vede na předchozí). */
  replace(s: Screen) { this.stack = [...this.stack.slice(0, -1), s]; this.trim(); this.emit(); this.scrollTop(); }
  /**
   * Otevření z notifikace živého utkání: dohrané utkání -> celý zápis, jinak Živé utkání
   * (družstvo podle klíče, protože pořadí družstev se po dohrání mění).
   */
  openLiveNotification(d: { path?: string; key?: string; team?: string; live?: number; watch?: string }) {
    if (d.watch) { this.go({ t: "Watch", key: d.watch }); return; }
    const path = d.path ?? "";
    const z = path ? this.zapisy.get(path) : undefined;
    const idx = d.key != null ? this.next.findIndex((c) => this.teamKey(c) === d.key) : d.live ?? -1;
    const ctx = idx >= 0 ? this.next[idx] : undefined;
    const running = !!ctx && ctx.liveNow && this.liveLinks.get(this.teamKey(ctx)) === path && !(z && this.finished(z));
    if (path && !running) this.go({ t: "ZapisDetail", path, myTeam: d.team ?? ctx?.myTeam.name ?? "" });
    else if (idx >= 0) this.go({ t: "Live", team: idx });
  }
  resetTo(s: Screen) { this.stack = [s]; this.emit(); this.scrollTop(); }
  private scrollTop() { if (typeof window !== "undefined") queueMicrotask(() => window.scrollTo(0, 0)); }

  // ---------- můj profil
  me: PlayerPage | null = null;
  loadingMe = false;
  error: string | null = null;
  onboarding = prefs.playerPath == null;
  /** Host: otevřel sdílený odkaz a aplikaci nemá nastavenou (vidí jen sdílenou obrazovku). */
  guest = false;
  /** Svaz z otevřeného sdíleného odkazu (pro odkazy na hráče u hosta). */
  svazHint: string | null = null;
  toastText: string | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  toast(text: string) {
    this.toastText = text; this.emit();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastText = null; this.emit(); }, 2500);
  }
  /** Otevře sdílený odkaz (?z= zápis, ?h= hráč, ?d= vzájemné zápasy); vrací false, když v něm nic není. */
  openShared(q: URLSearchParams): boolean {
    let s: Screen | null = null;
    // odkaz může obsahovat i adresu STIS (https://stis.ping-pong.cz/zapis/…) – bere se jen cesta
    const norm = (x: string | null, part: string) => { if (!x) return null; const i = x.indexOf(part); return i >= 0 ? x.slice(i).split("#")[0] : null; };
    const z = norm(q.get("z"), "/zapis/"), h = norm(q.get("h"), "/hrac-"), d = q.get("d"), pr = q.get("pr");
    const idOf = (p: string) => /hrac-(\d+)/.exec(p)?.[1] ?? "";
    if (z && z.startsWith("/zapis/")) s = { t: "Shared", path: z };
    else if (h && h.startsWith("/hrac-")) s = { t: "Player", path: h };
    else if (pr) s = { t: "Prediction", data: pr };
    else if (q.has("m")) s = { t: "Model", section: q.get("m") || null };
    else if (q.get("s")) {
      const [id, ...nm] = q.get("s")!.split("~"); const [svaz, rocnik, soutez] = id.split(".");
      if (svaz && rocnik && soutez) s = { t: "BrowseComp", svaz, rocnik: +rocnik, soutez, name: nm.join("~") || "Soutěž" };
    } else if (q.get("o")?.startsWith("/oddil-")) {
      const [path, ...nm] = q.get("o")!.split("~");
      s = { t: "BrowseClub", path, name: nm.join("~") || "Oddíl" };
    }
    else if (d) {
      const [ap, an, bp, bn] = d.split("~");
      if (ap && bp) s = { t: "Duel", aId: idOf(ap), aName: an ?? "", bId: idOf(bp), bName: bn ?? "" };
    }
    if (!s) return false;
    this.svazHint = Stis.svaz(z ?? h ?? d ?? "") ?? null;
    if (pr) { try { const x = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(pr.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0)))); if (x?.s) this.svazHint = String(x.s); } catch { /* */ } }
    if (this.onboarding) { this.guest = true; this.stack = [s]; this.emit(); } else this.go(s);
    return true;
  }
  /** Host chce vlastní statistiky -> úvodní obrazovka. */
  leaveGuest() { this.guest = false; this.resetTo(S.Overview); }

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
    Complex.on = prefs.complexModel;
    Complex.pair = (a, b) => this.pairInfo(a, b).adj;
    if (prefs.playerPath != null && typeof window !== "undefined") { this.restoreStack(); this.loadMe(false); }
  }

  selectTeam(i: number) { this.nextSelected = i; this.nextSelectedByUser = true; this.ovTile = null; this.emit(); }

  private defaultTeamIndex(ctxs: NextMatchContext[], m: PlayerPage): number {
    if (ctxs.length <= 1) return 0;
    const live = ctxs.findIndex((c) => c.liveNow && !this.liveFinished(c));
    if (live >= 0) return live;
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
          this.onboarding = false; this.guest = false;
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
      const cur = this.players.get(this.playerPathById(id))?.currentStr; if (cur != null) return cur;
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

  /** Změna STR za sezónu: aktuální STR − STR před prvním zápasem nejnovější sezóny (stejně jako na Přehledu). */
  seasonStrChange(page: PlayerPage): number | null {
    const ch = page.chronological;
    if (!ch.length || page.currentStr == null) return null;
    const season = Math.max(...ch.map((m) => m.season));
    const first = ch.find((m) => m.season === season && m.strBefore != null);
    return first ? page.currentStr - first.strBefore! : null;
  }
  /** Soupiska s aktuálním STR. */
  fresh(list: RosterPlayer[]): RosterPlayer[] {
    return list.map((p) => {
      // já: vždy aktuální vlastní stránka (stránka v this.players může být starší kopie)
      if (this.me && (p.id === this.me.id || (p.id == null && Stats.fold(p.name) === Stats.fold(this.me.name)))) return p.copy({ str: this.me.currentStr ?? p.str });
      const page = (p.path ? this.players.get(p.path) : undefined) ?? Array.from(this.players.values()).find((x) => p.id != null && x.id === p.id);
      const live = this.club.ladder.find((e) => e.live && p.id != null && e.id === p.id);
      if (page?.currentStr != null) return p.copy({ str: page.currentStr });
      if (live?.str != null) return p.copy({ str: live.str });
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
          this.notifyLive(link, z);
          const ctx = this.next.find((c) => this.teamKey(c) === key);
          if (ctx && ctx.liveNow && this.zapisBelongs(z, ctx) && this.finished(z)) this.loadNext(false);
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
    svaz ??= Stis.svaz(this.me?.path) ?? this.svazHint;
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
    const games = Live.fromZapis(z, this.oppStrFor(z, m), (id, n) => this.rangeOf(id, n));
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
  /** Automaticky podle soutěže (výchozí), nebo ruční volba v Nastavení. */
  get formatAuto(): boolean { const k = prefs.matchFormat; return !k || k === "auto"; }
  /** Formát pro moje družstvo (ruční volba, jinak rozpoznaný ze zápisů soutěže vybraného družstva). */
  get format(): MatchFormat {
    if (!this.formatAuto) return MatchFormats.of(prefs.matchFormat);
    const r = this.next[this.nextSelected]?.myTeam.ref ?? this.next[0]?.myTeam.ref;
    return r ? this.formatForComp(r) : MatchFormats.DEFAULT;
  }
  /** Název soutěže (z mých družstev a načtených hráčů) – pro předvolbu formátu. */
  compNameFor(c: { svaz: string; soutez: string }): string | null {
    const same = (r: TeamRef | null | undefined) => !!r && r.svaz === c.svaz && r.soutez === c.soutez;
    for (const x of this.next) if (same(x.myTeam.ref) && x.myTeam.competition) return x.myTeam.competition;
    for (const p of [this.me, ...this.players.values()]) for (const t of p?.currentSeason?.teams ?? []) if (same(t.ref) && t.competition) return t.competition;
    return null;
  }
  changeFormat(f: MatchFormat | null) { prefs.matchFormat = f ? f.key : "auto"; this.emit(); }
  compOfPath(path: string): { svaz: string; rocnik: number; soutez: string } | null {
    const m = /svaz-([^/]+)\/rocnik-(\d+)\/soutez-(\d+)/.exec(path);
    return m ? { svaz: m[1], rocnik: +m[2], soutez: m[3] } : null;
  }
  /** Formát soutěže rozpoznaný z načtených zápisů této soutěže (null = zatím neznámý). */
  compFormat(c: { svaz: string; soutez: string }): MatchFormat | null { return this.compFormatInfo(c).fmt; }
  /** Rozpoznání ze zápisů soutěže z minulých dnů (dnešní mohou být rozehrané). */
  compFormatInfo(c: { svaz: string; soutez: string; rocnik?: number }) { return MatchFormats.detectInfo(this.compPastZapisy(c)); }
  /** Načtené zápisy soutěže z minulých dnů (dnešní mohou být rozehrané). */
  compPastZapisy(c: { svaz: string; soutez: string; rocnik?: number }): Zapis[] {
    const td = today();
    return Array.from(this.zapisy.values()).filter((z) => z.path.includes(`/svaz-${c.svaz}/`) && z.path.includes(`/soutez-${c.soutez}/`)
      && (c.rocnik == null || z.path.includes(`/rocnik-${c.rocnik}/`)))
      .filter((z) => { const d = Parsers.date(z.dateText); return d == null || d < td; });
  }
  /** Pořadí dvouher soutěže (1-based [domácí, hosté]) z odehraných zápisů, jinak standardní točení. */
  singlesOrderFor(c: { svaz: string; soutez: string; rocnik?: number } | null | undefined): [number, number][] {
    const fmt = c ? this.formatForComp(c) : this.format;
    return MatchFormats.singlesOrder(c ? this.compPastZapisy(c) : [], fmt);
  }
  /** Klíč pořadí dvouher pro zápis (z dohraných zápisů soutěže, jinak standardní). */
  singlesKeyFor(z: Zapis): Map<number, [string, string]> {
    const c = this.compOfPath(z.path);
    return MatchFormats.singlesKey(c ? this.compPastZapisy(c) : [], this.fmtOf(z));
  }
  /** Formát pro soutěž: ruční volba, jinak rozpoznaný, jinak výchozí. */
  formatForComp(c: { svaz: string; soutez: string } | null): MatchFormat {
    const f = this.formatForCompBase(c);
    // komplexní model: výhoda domácích odhadnutá z dvouher soutěže
    return Complex.on && c ? { ...f, homeAdv: this.homeAdvFor(c).adj } : f;
  }
  private formatForCompBase(c: { svaz: string; soutez: string } | null): MatchFormat {
    if (!this.formatAuto) return MatchFormats.of(prefs.matchFormat);
    const o = c ? this.compFormatOverride(c) : null;
    if (o) return o;
    return (c && (this.compFormat(c) ?? MatchFormats.byName(this.compNameFor(c)))) ?? MatchFormats.DEFAULT;
  }

  // ---------- komplexní model predikcí ----------
  get complexOn(): boolean { return Complex.on; }
  setComplex(v: boolean) {
    prefs.complexModel = v; Complex.on = v; this.pairCache.clear();
    // predikce konce sezóny má výsledek pro každý model zvlášť (uložený) – chybějící se dopočítá
    const bases = new Set(Array.from(this.predictions.keys()).map((k) => k.replace(/\|\+?$/, "")));
    for (const k of bases) {
      const m = /svaz-(\d+)\/rocnik-(\d+)\/soutez-(\d+)/.exec(k);
      if (m) this.loadPrediction(m[1], +m[2], m[3]);
    }
    this.emit();
  }
  private pairCache = new Map<string, H2HInfo>();
  private pairVer = "";
  /** Vzájemná korekce STR hráče a proti b (z historie a, případně b). */
  pairInfo(a: string, b: string): H2HInfo {
    const ver = `${this.players.size}|${this.me?.matches.length ?? 0}`;
    if (ver !== this.pairVer) { this.pairCache.clear(); this.pairVer = ver; }
    const key = a + "|" + b;
    const hit = this.pairCache.get(key);
    if (hit) return hit;
    const pageOf = (id: string) => (this.me?.id === id ? this.me : this.players.get(this.playerPathById(id)) ?? Array.from(this.players.values()).find((p) => p.id === id) ?? null);
    const sa = this.strOf(a, ""), sb = this.strOf(b, "");
    const td = today();
    let r: H2HInfo = { adj: 0, games: 0, weight: 0 };
    const pa = pageOf(a);
    if (pa) r = h2hAdj(pa.chronological, b, sa, sb, td);
    if (!r.games) { const pb = pageOf(b); if (pb) { const x = h2hAdj(pb.chronological, a, sb, sa, td); r = { ...x, adj: -x.adj }; } }
    this.pairCache.set(key, r);
    return r;
  }
  /** Moje šance proti soupeři (komplexní model přidá vzájemnou korekci). */
  myWinProb(oppId: string | null | undefined, myStr: number, oppStr: number): number {
    const adj = Complex.on && oppId && this.me?.id ? this.pairInfo(this.me.id, oppId).adj : 0;
    return StrModel.winProbability(myStr + adj, oppStr);
  }
  /** Komplexní model: dotáhne profily hráčů mého družstva (jejich vzájemné zápasy se soupeři). */
  complexNeed(ids: (string | null | undefined)[]) {
    if (!Complex.on) return;
    this.requestPlayers(ids.filter((x): x is string => !!x && x !== this.me?.id).map((x) => this.playerPathById(x)));
  }
  private homeCache = new Map<string, { n: number; r: { adj: number; games: number } }>();
  /** Výhoda domácích v soutěži z odehraných dvouher (STR hráčů podle dnešních hodnot). */
  homeAdvFor(c: { svaz: string; soutez: string }): { adj: number; games: number } {
    const zs = this.compPastZapisy(c);
    const key = c.svaz + "/" + c.soutez;
    const hit = this.homeCache.get(key);
    if (hit && hit.n === zs.length) return hit.r;
    const games: { home: number; away: number; homeWon: boolean }[] = [];
    for (const z of zs) for (const g of z.games) {
      if (g.doubles || g.wo || g.result == null || g.homeNames.length !== 1 || g.awayNames.length !== 1) continue;
      const h = this.strOf(g.homeIds[0] ?? null, g.homeNames[0]), a = this.strOf(g.awayIds[0] ?? null, g.awayNames[0]);
      if (h != null && a != null) games.push({ home: h, away: a, homeWon: g.result === 1 });
    }
    const r = homeAdvantage(games);
    this.homeCache.set(key, { n: zs.length, r });
    return r;
  }
  private compFormats(): Record<string, string> { try { return JSON.parse(prefs.compFormatsJson); } catch { return {}; } }
  /** Ručně zvolený formát soutěže (má přednost před rozpoznaným). */
  compFormatOverride(c: { svaz: string; soutez: string }): MatchFormat | null {
    const k = this.compFormats()[`${c.svaz}|${c.soutez}`];
    return k ? MatchFormats.of(k) : null;
  }
  setCompFormat(c: { svaz: string; soutez: string }, key: string | null) {
    const m = this.compFormats();
    if (key) m[`${c.svaz}|${c.soutez}`] = key; else delete m[`${c.svaz}|${c.soutez}`];
    prefs.compFormatsJson = JSON.stringify(m);
    this.emit();
  }
  /** Stav formátu soutěže: ručně zvolený / rozpoznaný / zjišťuje se / neznámý. */
  compFormatState(c: { svaz: string; rocnik: number; soutez: string }): "manual" | "detected" | "loading" | "estimate" | "unknown" {
    if (this.compFormatOverride(c)) return "manual";
    const info = this.compFormatInfo(c);
    if (info.certain) return "detected";
    const k = this.compKey(c);
    // ještě jsou další vzorky k načtení
    const los = this.losForComp(c);
    if (los && this.fmtSamples(c, los).some((p) => !this.zapisy.has(p))) {
      this.ensureCompFormat(c, los);
      if (Array.from(this.zapisLoading).some((p) => p.includes(`/svaz-${c.svaz}/`) && p.includes(`/soutez-${c.soutez}/`))) return "loading";
    }
    if (info.fmt) return this.compLosLoading.has(k) || Array.from(this.zapisLoading).some((p) => p.includes(`/soutez-${c.soutez}/`)) ? "loading" : "estimate";
    const own = this.next.some((x) => x.myTeam.ref && this.compKey(x.myTeam.ref) === k);
    if (this.compLosLoading.has(k) || (!own && !this.compLos.has(k)) || (own && this.loadingNext)) return "loading";
    if (Array.from(this.zapisLoading).some((p) => p.includes(`/svaz-${c.svaz}/`) && p.includes(`/soutez-${c.soutez}/`))) return "loading";
    return MatchFormats.byName(this.compNameFor(c)) ? "estimate" : "unknown";
  }
  /**
   * Skóre utkání [domácí, hosté]: z her (hlavička online zápisu zaostává), ale u dohraného utkání „do 10“,
   * kde se po rozhodnutí ještě dohrávalo, oficiální skóre z hlavičky (např. 10:6 místo 10:8).
   */
  scoreOf(z: Zapis): [number, number] {
    const s = z.score;
    const f = this.fmtOf(z);
    const [ph, pa] = z.points;
    if (f.target == null || ph == null || pa == null || Math.max(ph, pa) !== f.target) return s;
    const gs = [...z.games].sort((a, b) => a.no - b.no);
    let h = 0, a = 0, reached = -1;
    gs.forEach((g, i) => { if (g.result === 1) h++; else if (g.result === -1) a++; if (reached < 0 && Math.max(h, a) >= f.target!) reached = i; });
    const playedAfter = reached >= 0 && gs.slice(reached + 1).some((g) => g.result != null);
    return playedAfter ? [ph, pa] : s;
  }
  fmtOf(z: Zapis): MatchFormat { return this.formatForComp(this.compOfPath(z.path)); }
  finished(z: Zapis): boolean { return Live.isZapisFinished(z, this.fmtOf(z)); }
  /** Rozpis soutěže (moje družstvo nebo načtený rozpis soutěže). */
  private losForComp(c: { svaz: string; rocnik: number; soutez: string }): LosMatch[] | null {
    const k = this.compKey(c);
    const own = this.next.find((x) => x.myTeam.ref && this.compKey(x.myTeam.ref) === k);
    return this.compLos.get(k) ?? own?.los ?? null;
  }
  /** Až 6 nejnovějších dohraných utkání soutěže jako vzorky pro rozpoznání formátu. */
  private fmtSamples(c: { svaz: string; soutez: string }, los: LosMatch[]): string[] {
    const td = today();
    return los.filter((x) => x.played && x.zapisPath && this.scoreFinalAny(x.score) && x.dateTime != null && ldtDate(x.dateTime) < td)
      .sort((a, b) => (b.dateTime ?? 0) - (a.dateTime ?? 0)).slice(0, 6).map((x) => x.zapisPath);
  }
  /** Postupně (po dvou) načítá vzorové zápisy, dokud formát není jistý nebo není prohlédnuto 6 zápisů. */
  ensureCompFormat(c: { svaz: string; rocnik: number; soutez: string }, los: LosMatch[]) {
    if (!this.formatAuto || this.compFormatOverride(c) || this.compFormatInfo(c).certain) return;
    const samples = this.fmtSamples(c, los);
    if (samples.some((p) => this.zapisLoading.has(p))) return;
    const next = samples.filter((p) => !this.zapisy.has(p)).slice(0, 2);
    for (const p of next) this.loadZapis(p);
  }
  /** Výsledek vypadá konečně v jakémkoli formátu (pro výběr vzorových zápisů). */
  private scoreFinalAny(score: string): boolean {
    const p = /^(\d+):(\d+)$/.exec(score.trim());
    return !!p && +p[1] + +p[2] >= 5;
  }

  liveFinished(ctx: NextMatchContext): boolean {
    const z = this.liveZapisFor(this.teamKey(ctx));
    return !!z && this.zapisBelongs(z, ctx) && this.finished(z);
  }

  /** Výsledek z rozpisu je konečný (ne průběžný stav): dosažený cíl nebo odehrané všechny hry. */
  scoreFinal(score: string, fmt: MatchFormat | null = null): boolean {
    const p = /^(\d+):(\d+)$/.exec(score.trim());
    if (!p) return false;
    const h = +p[1], a = +p[2], f = fmt ?? this.format;
    return (f.target != null && (h >= f.target || a >= f.target)) || h + a >= f.games;
  }

  /** Utkání se právě hraje a ještě neskončilo. */
  liveRunning(ctx: NextMatchContext): boolean { return ctx.liveNow && !this.liveFinished(ctx); }

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
      const games = Live.fromZapis(z, this.oppStrFor(z, p), (id, n) => this.rangeOf(id, n));
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

  /**
   * STR soupeřů hráče [p] v zápisu pro odhad změny STR: přednostně STR před tímto utkáním z jejich stránky
   * (zápas už jim STIS započítal), jinak aktuální STR z jejich stránky; chybějící stránky se dočtou na pozadí
   * (do té doby ukazuje Přehled „počítám odhad…“). Ostatní hráči jako dřív (žebříčky, soupisky).
   */
  oppStrFor(z: Zapis, p: { id: string; name: string }): (id: string | null, n: string) => number | null {
    const oppIds = this.zapisOpponentIds(z, p);
    const oppPaths = oppIds.map((id) => this.zapisPlayerPath(id, z.path));
    this.requestPlayers(oppPaths);
    if (p.id === this.me?.id) for (const x of oppPaths) this.estPaths.add(x);
    return (id, n) => {
      if (id && oppIds.includes(id)) {
        const pg = this.players.get(this.zapisPlayerPath(id, z.path));
        if (pg) {
          // jejich zápas proti mně v tomto utkání (STR před přesně tou hrou)
          const mm = pg.matches.find((x) => x.zapisPath === z.path && x.strBefore != null && (x.opponentId === p.id || Stats.fold(x.opponent) === Stats.fold(p.name)));
          if (mm) return mm.strBefore;
          if (pg.currentStr != null) return pg.currentStr;
        }
      }
      return this.strOf(id, n);
    };
  }
  /** Cesta na profil hráče podle ID (u zápisu svaz zápisu), jinak dohledaná podle jména; null = neznámý. */
  playerPathFor(id: string | null | undefined, name: string, zapisPath?: string): string | null {
    const f = Stats.fold(name.replace(/\(.*?\)/g, "").trim());
    const me = this.me;
    if (me && (id === me.id || (!id && f === Stats.fold(me.name)))) return me.path;
    if (id) return zapisPath ? this.zapisPlayerPath(id, zapisPath) : this.playerPathById(id);
    if (!f) return null;
    for (const p of this.players.values()) if (Stats.fold(p.name) === f) return p.path;
    const l = this.club.ladder.find((e) => Stats.fold(e.name) === f && e.path); if (l?.path) return l.path;
    for (const c of this.next) for (const r of [...c.myRoster, ...c.opponentRoster]) if (r.path && Stats.fold(r.name) === f) return r.path;
    const ch = me?.chronological ?? [];
    for (let i = ch.length - 1; i >= 0; i--) if (ch[i].opponentPath && Stats.fold(ch[i].opponent) === f) return ch[i].opponentPath;
    return null;
  }
  /** Klepnutí na jméno hráče: otevře jeho profil (null = hráče nejde dohledat). */
  playerClick(id: string | null | undefined, name: string, zapisPath?: string): (() => void) | null {
    const path = this.playerPathFor(id, name, zapisPath);
    return path ? () => this.go({ t: "Player", path }) : null;
  }
  /** Stránka hráče ze zápisu (svaz zápisu, aktuální ročník). */
  zapisPlayerPath(id: string, zapisPath: string): string {
    const svaz = Stis.svaz(zapisPath);
    return svaz != null ? `/hrac-${id}/svaz-${svaz}/rocnik-${Stis.currentRocnik()}` : this.playerPathById(id);
  }
  /** ID soupeřů hráče [p] ve dvouhrách zápisu. */
  zapisOpponentIds(z: Zapis, p: { id: string; name: string }): string[] {
    const f = Stats.fold(p.name);
    const isMe = (id: string | undefined, n: string) => (!!id && id === p.id) || Stats.fold(n.replace(/\(.*?\)/g, "").trim()) === f;
    const out: string[] = [];
    for (const g of z.games) {
      if (g.doubles) continue;
      const hMe = isMe(g.homeIds[0], g.homeNames[0] ?? ""), aMe = isMe(g.awayIds[0], g.awayNames[0] ?? "");
      const opp = hMe ? g.awayIds[0] : aMe ? g.homeIds[0] : undefined;
      if (opp && !out.includes(opp)) out.push(opp);
    }
    return out;
  }
  private requested = new Set<string>();
  /** Načte stránky hráčů na pozadí (každou jen jednou za běh; volatelné i během vykreslení). */
  requestPlayers(paths: string[]) {
    const todo = paths.filter((x) => !this.requested.has(x) && !this.players.has(x));
    if (!todo.length) return;
    for (const x of todo) this.requested.add(x);
    queueMicrotask(() => { for (const x of todo) this.loadPlayer(x); });
  }
  /** Odhad STR z neoficiálních zápasů ještě čeká na STR soupeřů (stránky se načítají). */
  unofficialPending(): boolean {
    for (const x of this.estPaths) if (!this.players.has(x) && this.loadingPlayers.get(x) !== false) return true;
    return false;
  }
  /** Stránky soupeřů potřebné pro odhad mého STR z neoficiálních zápasů. */
  private estPaths = new Set<string>();

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
    if ((m.played && this.scoreFinal(m.score)) || !m.zapisPath) return false;
    const z = this.zapisy.get(m.zapisPath);
    return !!z && z.games.length > 0 && this.finished(z);
  }

  meWithLive(): PlayerPage | null {
    const m = this.me;
    if (!m) return null;
    const extra = this.unofficialMatches();
    return extra.length ? m.copy({ matches: [...m.matches, ...extra] }) : m;
  }

  /** Všechna odehraná utkání družstva v sezóně, od nejnovějšího. */
  previousList(ctx: NextMatchContext): [LosMatch | null, string][] {
    // jen utkání z aktuálního rozpisu družstva (žádné jiné načtené zápisy, např. z minulé sezóny), seřazená podle data
    const liveDone = ctx.liveNow && this.liveFinished(ctx);
    const running = this.liveRunning(ctx);
    const items: [LosMatch, string][] = [];
    for (const x of ctx.los) {
      if (running && x === ctx.next) continue;
      if (liveDone && x === ctx.next) { items.push([x, this.liveLinks.get(this.teamKey(ctx)) ?? x.zapisPath]); continue; }
      if (x.played) { items.push([x, x.zapisPath]); continue; }
      // dohrané, ale STIS ho ještě nepotvrdil
      const z = x.zapisPath ? this.zapisy.get(x.zapisPath) : undefined;
      if (z && z.games.length && this.zapisBelongs(z, ctx) && this.finished(z)) items.push([x, x.zapisPath]);
    }
    return items.sort((a, b) => (b[0].dateTime ?? -LDT_MAX) - (a[0].dateTime ?? -LDT_MAX));
  }

  lastUtkani(team: string | null = null): LastUtkani | null {
    const m = this.me;
    if (!m) return null;
    const pending = this.latestPendingZapis(team);
    if (pending) {
      const live = this.myLiveGames(team);
      const running = !this.finished(pending);
      const myTeam = this.next.find((c) => this.zapisBelongs(pending, c))?.myTeam.name ?? (live[0]?.home === true ? pending.home : pending.away);
      return { title: running ? "Moje probíhající utkání" : "Moje poslední utkání", unofficial: true, live, official: [], zapisPath: pending.path, myTeam, running,
        dateText: pending.dateText.split(" ")[0] ?? "", round: pending.round.trim() || null };
    }
    const ch = m.chronological;
    let last: Match | null = null;
    for (let i = ch.length - 1; i >= 0; i--) if (team == null || Stats.fold(ch[i].myTeam) === Stats.fold(team)) { last = ch[i]; break; }
    if (!last) return null;
    const keyOf = (x: Match) => x.zapisPath || x.dateText + x.myTeam;
    const key = keyOf(last);
    const games = ch.filter((x) => keyOf(x) === key);
    const z = last.zapisPath ? this.zapisy.get(last.zapisPath) : undefined;
    const ctx = this.next.find((c) => Stats.fold(c.myTeam.name) === Stats.fold(last!.myTeam));
    const round = z?.round.trim() || ctx?.los.find((x) => x.zapisPath && x.zapisPath === last!.zapisPath)?.round || null;
    return { title: "Moje poslední utkání", unofficial: false, live: [], official: games, zapisPath: last.zapisPath, myTeam: last.myTeam, running: false, dateText: last.dateText, round };
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
  /** klíč výsledku = tabulka + model (STR / STR+) */
  predictions = new Map<string, SeasonPrediction>();
  predMeta = new Map<string, { at: number; round: number }>();
  predLoading = new Map<string, boolean>();
  predErrors = new Map<string, string>();
  predProgress = "";
  private mk(key: string, plus = Complex.on) { return key + "|" + (plus ? "+" : ""); }
  pred(key: string): SeasonPrediction | undefined { return this.predictions.get(this.mk(key)); }
  predInfo(key: string) { return this.predMeta.get(this.mk(key)); }
  predBusy(key: string): boolean { return this.predLoading.get(this.mk(key)) === true; }
  /** Otisk vstupů: tabulka se mění jen po odehraném kole -> stejný otisk = stejná predikce. */
  private predFp(rows: StandingRow[]) { return rows.map((r) => `${r.name}:${r.played}:${r.points}:${r.score}`).join("|"); }
  private predRead(mk: string): { fp: string; at: number; round: number; p: SeasonPrediction } | null {
    try { return JSON.parse(localStorage.getItem(SP + "pred:" + mk) ?? "null"); } catch { return null; }
  }
  private predWrite(mk: string, fp: string, round: number, p: SeasonPrediction) {
    const at = Date.now();
    this.predictions.set(mk, p); this.predMeta.set(mk, { at, round });
    try {
      // staré výsledky (déle než 120 dní) pryč
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(SP + "pred:")) { try { if (at - (JSON.parse(localStorage.getItem(k) ?? "{}").at ?? 0) > 120 * DAY_MS) localStorage.removeItem(k); } catch { localStorage.removeItem(k); } }
      }
      localStorage.setItem(SP + "pred:" + mk, JSON.stringify({ fp, at, round, p }));
    } catch { /* plné úložiště – jen v paměti */ }
  }
  /** Spočítá predikci tabulky po sezóně: rozpisy všech družstev soutěže, soupisky, simulace. Hotový výsledek se znovu použije, dokud se tabulka nezmění. */
  loadPrediction(svaz: string, rocnik: number, soutez: string, force = false) {
    const key = Stis.tabulka(svaz, rocnik, soutez);
    const plus = Complex.on, mk = this.mk(key, plus);
    if (this.predLoading.get(mk) || (!force && this.predictions.has(mk))) return;
    this.predLoading.set(mk, true); this.predErrors.delete(key); this.predProgress = "Načítám tabulku…"; this.emit();
    (async () => {
      try {
        const rows = (!force && this.tabulky.get(key)) || (await this.repo.tabulka(svaz, rocnik, soutez, force ? 0 : undefined));
        this.tabulky.set(key, rows);
        if (!rows.length) throw new Error("Tabulka soutěže je prázdná – není z čeho počítat.");
        const fp = this.predFp(rows);
        const round = Math.max(0, ...rows.map((r) => r.played));
        if (!force) {
          const st = this.predRead(mk);
          if (st && st.fp === fp) { this.predictions.set(mk, st.p); this.predMeta.set(mk, { at: st.at, round: st.round }); return; }
        }
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
        const lineups: Record<string, { players: [string, number][]; active: boolean }> = {};
        const size = this.formatForComp({ svaz, soutez }).players;
        for (const r of rows) {
          let players = rosters.find((x) => Stats.fold(x.name) === Stats.fold(r.name))?.players ?? [];
          if (!players.length) {
            const ref = refs.find((x) => Stats.fold(x.name) === Stats.fold(r.name));
            if (ref) { try { players = (await this.repo.teamRoster(ref)).players; } catch { /* bez soupisky */ } }
          }
          // sestava z hráčů, kteří za družstvo opravdu nastupují (podle bilance dvouher na soupisce STIS):
          // počet utkání ≈ dvouhry / velikost sestavy; stabilní = aspoň ⅓ utkání družstva; na začátku sezóny nejsilnější hráči
          const fresh = this.fresh(players);
          const utk = (p: RosterPlayer) => { const g = (p.wins ?? 0) + (p.losses ?? 0); return g > 0 ? Math.max(1, Math.round(g / size)) : 0; };
          const active = r.played >= 2 && fresh.some((p) => utk(p) > 0);
          const picked = active ? Stability.lineup(fresh, size, (p) => utk(p) * 3 >= r.played, utk).map((x) => x[0]) : Stats.suggestLineup(fresh, size);
          const withStr = picked.filter((p) => (p.str ?? 0) > 0);
          lineups[r.name] = { players: withStr.map((p) => [p.name, p.str!] as [string, number]), active };
          const lineup = withStr.map((p) => p.str!);
          const [a, b] = r.score.split(":").map((x) => parseInt(x, 10));
          teams.push({ name: r.name, points: r.points, played: r.played, wins: r.wins, draws: r.draws, losses: r.losses, diff: (a || 0) - (b || 0), lineup });
        }
        // průměr soutěže pro družstva bez známé sestavy
        const all = teams.flatMap((t) => t.lineup);
        const avgStr = all.length ? Math.round(all.reduce((x, y) => x + y, 0) / all.length) : 1400;
        for (const t of teams) if (!t.lineup.length) t.lineup = [avgStr];
        this.predProgress = `Simuluji ${future.size} zbývajících utkání…`; this.emit();
        await new Promise((r) => setTimeout(r, 30));
        const run = (model: boolean) => {
          // simulace je synchronní – model se nastaví jen na dobu výpočtu
          const prev = Complex.on;
          Complex.on = model; this.pairCache.clear();
          try { return { ...predictSeason(teams, Array.from(future.values()), pointsRule(rows), this.formatForComp({ svaz, soutez }), 5000, this.singlesOrderFor({ svaz, soutez, rocnik })), lineups }; }
          finally { Complex.on = prev; this.pairCache.clear(); }
        };
        this.predWrite(mk, fp, round, run(plus));
        // druhý model dopočítat na pozadí, ať je přepnutí STR / STR+ okamžité
        const mk2 = this.mk(key, !plus);
        setTimeout(() => {
          if (this.predLoading.get(mk2) || (this.predictions.has(mk2) && this.predRead(mk2)?.fp === fp)) return;
          try { this.predWrite(mk2, fp, round, run(!plus)); this.emit(); } catch { /* jen na vyžádání */ }
        }, 1500);
      } catch (e) {
        this.predErrors.set(key, err(e));
      } finally {
        this.predLoading.set(mk, false); this.predProgress = ""; this.emit();
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
  matchesTab = "zapasy";
  // ---------- Živě: utkání soutěží a sledovaná utkání
  liveDay = 0;
  /** stránka dlaždic Úspěšnost/Bilance/Výkon na Přehledu (null = soutěž aktivního družstva) */
  ovTile: number | null = null;
  liveOnlyWatched = false;
  liveQuery = "";
  compLos = new Map<string, LosMatch[]>();
  compLosAt = new Map<string, number>();
  compLosLoading = new Set<string>();
  compKey(c: { svaz: string; rocnik: number; soutez: string }) { return `${c.svaz}|${c.rocnik}|${c.soutez}`; }
  /** Soutěže mých družstev + přidané (pamatují se). */
  liveComps(): LiveComp[] {
    const out: LiveComp[] = [];
    for (const c of this.next) {
      const r = c.myTeam.ref;
      if (r && !out.some((x) => this.compKey(x) === this.compKey(r))) out.push({ svaz: r.svaz, rocnik: r.rocnik, soutez: r.soutez, label: c.myTeam.competition || c.myTeam.name, mine: true });
    }
    let extra: LiveComp[] = [];
    try { extra = JSON.parse(prefs.liveCompsJson); } catch { extra = []; }
    for (const e of extra) if (!out.some((x) => this.compKey(x) === this.compKey(e))) out.push({ ...e, label: this.compLabel(e) ?? e.label, mine: false });
    return out;
  }
  /** Název soutěže z nadpisu žebříčku STR („POŘADÍ STR - KSST … - K2C - 2026-2027“). */
  compLabel(c: { svaz: string; rocnik: number; soutez: string }): string | null {
    // celý název soutěže z hlavičky libovolného zápisu této soutěže
    for (const z of this.zapisy.values()) if (z.competition.trim() && z.path.includes(`/svaz-${c.svaz}/`) && z.path.includes(`/soutez-${c.soutez}/`)) return z.competition.trim();
    const t = this.strLadders.get(Stis.zebricek(c.svaz, c.rocnik, c.soutez))?.title ?? "";
    const parts = t.split(" - ").map((x) => x.trim()).filter((x) => x);
    return parts.length >= 3 ? parts[parts.length - 2] : null;
  }
  addLiveComp(ref: TeamRef, label: string) {
    let extra: LiveComp[] = [];
    try { extra = JSON.parse(prefs.liveCompsJson); } catch { extra = []; }
    const c: LiveComp = { svaz: ref.svaz, rocnik: ref.rocnik, soutez: ref.soutez, label };
    if (!this.liveComps().some((x) => this.compKey(x) === this.compKey(c))) { extra.push(c); prefs.liveCompsJson = JSON.stringify(extra); }
    this.liveCompSel = this.compKey(c);
    this.loadStrLadder(c.svaz, c.rocnik, c.soutez);
    this.loadCompLos(c, true);
    this.emit();
  }
  removeLiveComp(c: LiveComp) {
    let extra: LiveComp[] = [];
    try { extra = JSON.parse(prefs.liveCompsJson); } catch { extra = []; }
    prefs.liveCompsJson = JSON.stringify(extra.filter((x) => this.compKey(x) !== this.compKey(c)));
    this.emit();
  }
  loadCompLos(c: { svaz: string; rocnik: number; soutez: string }, force = false) {
    const k = this.compKey(c);
    if (this.compLosLoading.has(k)) return;
    if (!force && this.compLos.has(k) && Date.now() - (this.compLosAt.get(k) ?? 0) < 3 * 60_000) return;
    this.compLosLoading.add(k); this.emit();
    this.repo.competitionLos(c, force ? 60_000 : 5 * 60_000).then((l) => {
      this.compLos.set(k, l); this.compLosAt.set(k, Date.now());
      this.ensureCompFormat(c, l);
      // u sledovaných doplnit odkaz na zápis a čas
      let changed = false;
      const ws = this.watched();
      for (const w of ws) {
        if (this.compKey(w) !== k) continue;
        const m = l.find((x) => this.boardKey(c, x) === w.key);
        if (m && m.zapisPath && m.zapisPath !== w.zapisPath) { w.zapisPath = m.zapisPath; changed = true; }
      }
      if (changed) this.saveWatched(ws);
    }, () => {}).finally(() => { this.compLosLoading.delete(k); this.emit(); });
  }
  boardKey(c: { svaz: string; rocnik: number; soutez: string }, m: { round: string; home: string; away: string }) {
    return `${this.compKey(c)}|${m.round}|${Stats.fold(m.home)}|${Stats.fold(m.away)}`;
  }
  /** Utkání podle klíče (z načtených rozpisů soutěží nebo ze sledovaných). */
  boardMatch(key: string): { comp: LiveComp; m: LosMatch } | null {
    for (const c of this.liveComps()) {
      const m = this.compLos.get(this.compKey(c))?.find((x) => this.boardKey(c, x) === key);
      if (m) return { comp: c, m };
    }
    return null;
  }
  /** Sledovaná utkání; utkání z minulých dnů se samy vyřadí (uvolní limit). */
  watched(): Watched[] {
    let ws: Watched[] = [];
    try { ws = JSON.parse(prefs.watchedJson); } catch { ws = []; }
    const td = today();
    const keep = ws.filter((w) => w.dateTime == null || ldtDate(w.dateTime) >= td);
    if (keep.length !== ws.length) prefs.watchedJson = JSON.stringify(keep);
    return keep;
  }
  /** Lze utkání ještě sledovat (dnes/zítra a neskončilo)? */
  canWatch(c: { svaz: string; soutez: string }, m: LosMatch): boolean {
    if (m.dateTime == null || ldtDate(m.dateTime) < today()) return false;
    const z = m.zapisPath ? this.zapisy.get(m.zapisPath) : undefined;
    if (z && z.games.length && this.finished(z)) return false;
    return !(m.played && this.scoreFinal(m.score, this.formatForComp(c)));
  }
  get liveCompSel(): string { return prefs.liveCompSel ?? "all"; }
  set liveCompSel(v: string) { prefs.liveCompSel = v; }
  private saveWatched(ws: Watched[]) { prefs.watchedJson = JSON.stringify(ws); this.emit(); }
  watchOf(key: string): Watched | null { return this.watched().find((w) => w.key === key) ?? null; }
  /** Přidá / odebere sledování; vrací chybu při překročení limitu. */
  toggleWatch(c: LiveComp, m: LosMatch): string | null {
    const ws = this.watched();
    const key = this.boardKey(c, m);
    if (ws.some((w) => w.key === key)) { this.saveWatched(ws.filter((w) => w.key !== key)); return null; }
    if (ws.length >= MAX_WATCHED) return `Sledovat jde nejvýš ${MAX_WATCHED} utkání – nejdřív zrušte jiné.`;
    ws.push({ key, svaz: c.svaz, rocnik: c.rocnik, soutez: c.soutez, compLabel: c.label, round: m.round, home: m.home, away: m.away,
      homeRef: m.homeRef, awayRef: m.awayRef, dateTime: m.dateTime, zapisPath: m.zapisPath, mode: "games", fan: "home" });
    this.saveWatched(ws);
    void this.askLivePermissionQuiet();
    this.startLiveWatch();
    return null;
  }
  setWatch(key: string, patch: Partial<Pick<Watched, "mode" | "fan">>) {
    this.saveWatched(this.watched().map((w) => (w.key === key ? { ...w, ...patch } : w)));
  }
  private async askLivePermissionQuiet() {
    if (typeof Notification !== "undefined" && Notification.permission === "default") { try { await Notification.requestPermission(); } catch { /* */ } this.emit(); }
  }
  /** Dnešní ještě nezačatá utkání (soutěže na obrazovce Živě + moje družstva), od nejbližšího; mine = moje nebo sledované. */
  boardUpcomingToday(): { home: string; away: string; dateTime: number; mine: boolean }[] {
    const now = nowLdt(), td = today();
    const out = new Map<string, { home: string; away: string; dateTime: number; mine: boolean }>();
    const watchedKeys = new Set(this.watched().map((w) => w.key));
    const add = (m: LosMatch, mine: boolean) => {
      if (m.dateTime == null || m.dateTime <= now || ldtDate(m.dateTime) !== td) return;
      const k = `${Stats.fold(m.home)}|${Stats.fold(m.away)}|${m.dateTime}`;
      const prev = out.get(k);
      out.set(k, { home: m.home, away: m.away, dateTime: m.dateTime, mine: mine || !!prev?.mine });
    };
    for (const c of this.next) for (const m of c.los) add(m, true);
    for (const c of this.liveComps()) for (const m of this.compLos.get(this.compKey(c)) ?? []) add(m, watchedKeys.has(this.boardKey(c, m)));
    return Array.from(out.values()).sort((a, b) => a.dateTime - b.dateTime);
  }
  /**
   * Změna STR hráčů jedné strany zápisu (klíč = id nebo jméno): skutečná ze stránky hráče (zápas započítaný STIS),
   * jinak odhad podle výsledků a STR soupeřů (est = true). Chybějící stránky se dočtou na pozadí.
   */
  zapisDeltas(z: Zapis, home: boolean): Map<string, { d: number; est: boolean }> {
    const out = new Map<string, { d: number; est: boolean }>();
    const games = Live.fromZapis(z, (id, n) => this.strOf(id, n), (id, n) => this.rangeOf(id, n));
    const st = Live.evaluate(games, this.fmtOf(z));
    const svaz = Stis.svaz(z.path);
    for (const p of st.players.filter((x) => x.home === home)) {
      const key = p.id || p.name;
      const page = p.id ? (this.me?.id === p.id ? this.me : Array.from(this.players.values()).find((x) => x.id === p.id)) : null;
      const ms = page ? page.matches.filter((m) => m.zapisPath === z.path && m.delta != null) : [];
      if (ms.length) out.set(key, { d: ms.reduce((s, m) => s + (m.delta ?? 0), 0), est: false });
      else {
        out.set(key, { d: p.strDelta, est: true });
        if (p.id && !page && Date.now() - (this.deltaPageAsked.get(p.id) ?? 0) > 10 * 60_000) {
          this.deltaPageAsked.set(p.id, Date.now());
          const id = p.id;
          queueMicrotask(() => this.loadPlayer(svaz != null ? `/hrac-${id}/svaz-${svaz}/rocnik-${Stis.currentRocnik()}` : `/hrac-${id}`));
        }
      }
    }
    return out;
  }
  private deltaPageAsked = new Map<string, number>();
  /** Počet právě probíhajících utkání ve všech soutěžích na obrazovce Živě. */
  /** Stav utkání na přehledu Živě: konečný výsledek, průběžný stav (z rozpisu nebo zápisu), nebo čas začátku. */
  boardStatus(c: { svaz: string; soutez: string }, m: LosMatch): BoardStatus {
    const z = m.zapisPath ? this.zapisy.get(m.zapisPath) : undefined;
    const fmt = this.formatForComp(c);
    const now = nowLdt();
    const sm = /^(\d+)\s*:\s*(\d+)$/.exec(m.score);
    if (z && z.games.length) {
      const [h, a] = this.scoreOf(z);
      if (this.finished(z)) return { kind: "done", text: `${h} : ${a}`, h, a };
      return { kind: "live", text: `${h} : ${a}`, h, a, sub: `${z.games.filter((g) => g.result != null).length}/${Math.max(z.games.length, fmt.games)} her` };
    }
    if (sm) {
      const h = +sm[1], a = +sm[2];
      if (this.scoreFinal(m.score, fmt)) return { kind: "done", text: `${h} : ${a}`, h, a };
      if (m.dateTime != null && m.dateTime > now - 5 * 60) return { kind: "live", text: `${h} : ${a}`, h, a };
      return { kind: "done", text: `${h} : ${a}`, h, a };
    }
    const hm = (t: number) => `${String(ldtHour(t)).padStart(2, "0")}:${String(ldtMinute(t)).padStart(2, "0")}`;
    if (m.dateTime != null && m.dateTime <= now && m.dateTime > now - 5 * 60) return { kind: "live", text: "začalo", h: null, a: null };
    return { kind: "future", text: m.dateTime != null ? hm(m.dateTime) : m.dateText, h: null, a: null };
  }
  /** Počty dnešních utkání ve sledovaných soutěžích podle stavu (stejně jako na přehledu Živě). */
  boardTodayCounts(): { live: number; done: number; future: number; total: number } {
    const td = today();
    const out = { live: 0, done: 0, future: 0, total: 0 };
    const seen = new Set<string>();
    for (const c of this.liveComps()) for (const m of this.compLos.get(this.compKey(c)) ?? []) {
      if (m.dateTime == null || ldtDate(m.dateTime) !== td) continue;
      const k = this.boardKey(c, m);
      if (seen.has(k)) continue;
      seen.add(k);
      out[this.boardStatus(c, m).kind]++; out.total++;
    }
    return out;
  }
  boardLiveCount(): number { return this.boardTodayCounts().live; }
  /** Sledovaná utkání, která právě probíhají (−5 h … +30 min od začátku, zápis ještě neskončil). */
  watchedRunning(): Watched[] {
    const now = nowLdt();
    return this.watched().filter((w) => {
      if (w.dateTime == null || w.dateTime < now - 5 * 60 || w.dateTime > now + 30) return false;
      const z = w.zapisPath ? this.zapisy.get(w.zapisPath) : undefined;
      if (z && z.games.length) return !this.finished(z);
      // zápis není načtený: rozhodne stav z rozpisu soutěže (stejně jako přehled Živě)
      const f = this.boardMatch(w.key);
      return !f || this.boardStatus(f.comp, f.m).kind !== "done";
    });
  }
  private watchSearched = new Map<string, number>();
  /** Obnoví sledovaná probíhající utkání (zápis nebo jeho dohledání). */
  private watchTick() {
    for (const w of this.watchedRunning()) {
      if (w.mode === "off" && !(this.current.t === "Watch" && (this.current as { key: string }).key === w.key)) continue;
      if (w.zapisPath) { this.loadZapis(w.zapisPath, false, true); continue; }
      const c = { svaz: w.svaz, rocnik: w.rocnik, soutez: w.soutez };
      this.loadCompLos(c, true);
      const last = this.watchSearched.get(w.key) ?? 0;
      if (Date.now() - last < 60_000 || !w.homeRef) continue;
      this.watchSearched.set(w.key, Date.now());
      const m = this.boardMatch(w.key)?.m;
      if (!m) continue;
      const fake = { myTeam: { name: w.home, ref: w.homeRef, category: null, competition: null, singles: null, doubles: null, notOnRoster: false }, next: m } as unknown as NextMatchContext;
      this.repo.findZapis(fake).then((p) => { if (p) { this.setWatchPath(w.key, p); this.loadZapis(p, false, true); } }, () => {});
    }
  }
  private setWatchPath(key: string, path: string) { this.saveWatched(this.watched().map((w) => (w.key === key ? { ...w, zapisPath: path } : w))); }
  compSeason: number | null = null;
  compId: string | null = null;
  /** soutěž otevřená z profilu jiného hráče (není mezi mými soutěžemi) */
  extraComp: { svaz: string; rocnik: number; soutez: string; label: string; teams: string[] } | null = null;
  /** Otevře obrazovku družstva: moje → Družstvo, cizí → profil cizího družstva. */
  openTeam(ref: TeamRef, comp: string) {
    const i = this.next.findIndex((c) => c.myTeam.ref?.id === ref.id || (!ref.id && Stats.fold(c.myTeam.name) === Stats.fold(ref.name)));
    if (i >= 0) this.go({ t: "Team", team: i });
    else if (ref.id) this.go({ t: "OtherTeam", ref: { id: ref.id, name: ref.name, svaz: ref.svaz, rocnik: ref.rocnik, soutez: ref.soutez }, comp });
  }
  /** Otevře Žebříčky (tabulku / žebříček STR) na zadané soutěži. */
  openCompetition(ref: TeamRef, label: string, team: string, tab: "tabulka" | "stis") {
    this.extraComp = { svaz: ref.svaz, rocnik: ref.rocnik, soutez: ref.soutez, label, teams: [team] };
    this.compSeason = ref.rocnik; this.compId = ref.soutez;
    // otevřená konkrétní soutěž (i starší sezóna) se načte rovnou, karta si výběr nechá
    this.compExplicit = true; this.compOlderOpen = true;
    if (tab === "tabulka") { this.compsTab = "mine"; this.tab(S.Comps); }
    else { this.ladderTab = "stis"; this.tab(S.Ladder); }
  }
  /** Soupisky družstev načtené pro profil hráče (klíč = id družstva). */
  rosters = new Map<string, TeamRoster | null>();
  loadRoster(ref: TeamRef) {
    if (this.rosters.has(ref.id)) return;
    this.rosters.set(ref.id, null); this.emit();
    this.repo.teamRoster(ref).then((r) => { this.rosters.set(ref.id, r); this.emit(); }, () => { this.rosters.delete(ref.id); this.emit(); });
  }
  strLadderMine = false;
  strLadderSort = "str";
  predOn = false;
  utkaniTeam: number | null = null;
  /** soutěž dlaždic na Přehledu (pro obrázek „aktuální stav“) */
  ovScopeTeam: string | null = null;
  ovScopeComp: string | null = null;
  /** stránka karty Poslední utkání (null = nejnovější) */
  lastIdx: number | null = null;
  /** filtr na kartě Utkání: all / next / played */
  utkaniFilter = prefs.utkaniFilter;
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
            if (p) { pages.set(e.id!, p); this.putPlayer(e.path!, p); }
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
  // ---------- karta Hráči → Hledat (nic se nenačítá samo)
  playersTab: "mine" | "search" = "mine";
  compsTab: "mine" | "all" = "mine";
  /** rozbalené starší sezóny v Moje soutěže / Žebříček STIS (po návratu na kartu sbalené) */
  compOlderOpen = false;
  compExplicit = false;
  /** Můj profil (dřív karta STR). */
  openMyProfile() { if (this.me) this.go({ t: "Player", path: this.me.path }); }
  /** procházení svazů v Hledat → Soutěže (null = přehled republika + kraje) */
  browseSvaz: string | null = null;
  compView: "tab" | "los" = "tab";
  browse: { kind: "p" | "o" | "s"; query: string; players: SearchPlayer[] | null; clubs: SearchClub[] | null; loading: boolean; err: string | null; all?: { p: boolean; o: boolean } } =
    { kind: "p", query: "", players: null, clubs: null, loading: false, err: null };
  /** hledání na kartě Soutěže (oddělené od hledání hráčů) */
  browseComps: { kind: "p" | "o" | "s"; query: string; players: SearchPlayer[] | null; clubs: SearchClub[] | null; loading: boolean; err: string | null; all?: { p: boolean; o: boolean } } =
    { kind: "s", query: "", players: null, clubs: null, loading: false, err: null };
  browseSearch() {
    const b = this.browse, q = b.query.trim();
    if (b.kind === "s" || q.length < 2) return;
    b.loading = true; b.err = null; this.emit();
    // jedno pole: hráči i oddíly najednou (chyba jen když selžou obě hledání)
    const ps = this.repo.searchPlayers(q), cs = this.repo.searchClubs(q);
    Promise.allSettled([ps, cs]).then(([p, c]) => {
      b.players = p.status === "fulfilled" ? p.value : null;
      b.clubs = c.status === "fulfilled" ? c.value : null;
      b.all = { p: false, o: false };
      b.loading = false;
      b.err = p.status === "rejected" && c.status === "rejected" ? err(p.reason) : null;
      this.emit();
    });
  }
  /** Soutěže známé z načtených dat (moje družstva, profily hráčů, načtené oddíly a soupeři). */
  knownComps(): { svaz: string; rocnik: number; soutez: string; name: string }[] {
    const out = new Map<string, { svaz: string; rocnik: number; soutez: string; name: string }>();
    // náhradní názvy (dokud nebyl znám skutečný) se nepočítají
    const placeholder = (n: string | null | undefined) => !n || /– soutěž$|^Soutěž družstva |^Soutěž( \d+)?$|^(tabulka|tabulky|zobrazit|detail)$/i.test(n.trim());
    // název z katalogu STIS (oficiální plný) > plný název odjinud > zkratka
    const official = new Set<string>();
    const score = (n: string) => (!n ? 0 : official.has(n) ? 3 : /\s/.test(n) && n.length > 6 ? 2 : 1);
    const aliases = this.compAliasStore();
    let aliasChanged = false;
    const add = (r: TeamRef | null | undefined, name0: string | null | undefined) => {
      if (!r?.soutez || !r.svaz) return;
      const name = placeholder(name0) ? "" : name0!.trim();
      // zkratky (K2C, OS 1, RP2) si pamatuje pro hledání
      if (name && r.rocnik === aliases.rocnik && !official.has(name) && score(name) === 1) {
        const k = `${r.svaz}|${r.rocnik}|${r.soutez}`, l = aliases.items[k] ?? [];
        if (!l.includes(name)) { aliases.items[k] = [...l, name].slice(-4); aliasChanged = true; }
      }
      const k = this.compKey(r), cur = out.get(k);
      if (!cur || score(name) > score(cur.name)) out.set(k, { svaz: r.svaz, rocnik: r.rocnik, soutez: r.soutez, name: name || cur?.name || "" });
    };
    const cur = Stis.currentRocnik();
    for (const e of CompTree.entries(this.compTree(cur) ?? { rocnik: cur, svazy: {} })) { official.add(e.name); add({ id: "", name: "", svaz: e.svaz, rocnik: e.rocnik, soutez: e.soutez }, e.name); }
    for (const c of this.next) add(c.myTeam.ref, c.myTeam.competition);
    for (const p of [this.me, ...this.players.values()]) for (const s of p?.seasons ?? []) for (const t of s.teams) add(t.ref, t.competition);
    for (const c of this.clubPages.values()) for (const [k, n] of Object.entries(c.comps ?? {})) { const [svaz, rocnik, soutez] = k.split("|"); add({ id: "", name: "", svaz, rocnik: +rocnik, soutez }, n); }
    // názvy z odkazů na tabulky na jakékoli stažené stránce a z hlaviček zápisů („Název soutěže“)
    for (const [k, n] of this.repo.compNames) { const [svaz, rocnik, soutez] = k.split("|"); add({ id: "", name: "", svaz, rocnik: +rocnik, soutez }, n); }
    for (const z of this.zapisy.values()) {
      const m = /svaz-(\d+)\/rocnik-(\d{4})\/soutez-(\d+)/.exec(z.path);
      if (m && z.competition) add({ id: "", name: "", svaz: m[1], rocnik: +m[2], soutez: m[3] }, z.competition);
    }
    for (const r of this.browseRecent()) if (r.k === "s") { const [svaz, rocnik, soutez] = r.id.split("|"); add({ id: "", name: "", svaz, rocnik: +rocnik, soutez }, r.name); }
    // trvalý katalog soutěží aktuálního ročníku: co aplikace jednou potkala, zůstane i po restartu
    const cat = this.compCatalog();
    for (const [k, n] of Object.entries(cat.items)) { const [svaz, rocnik, soutez] = k.split("|"); add({ id: "", name: "", svaz, rocnik: +rocnik, soutez }, n); }
    let changed = false;
    for (const c of out.values()) {
      if (!c.name || official.has(c.name)) continue; // katalog STIS se do vlastního katalogu neukládá
      // zkratky celostátních lig rozepsat: 2LMB → 2. liga mužů skupina B
      if (score(c.name) < 2) c.name = MatchFormats.fullCompName(c.name);
      if (c.rocnik !== cat.rocnik) continue;
      const k = `${c.svaz}|${c.rocnik}|${c.soutez}`;
      if (cat.items[k] !== c.name) { cat.items[k] = c.name; changed = true; }
    }
    if (changed) prefs.compCatalogJson = JSON.stringify(cat);
    if (aliasChanged) prefs.compAliasesJson = JSON.stringify(aliases);
    // soutěž aktuálního ročníku, kterou katalog nezná (nová, play-off, pohár) → katalog se dotáhne (nejvýš jednou denně)
    if (this.treeCache?.t && Array.from(out.values()).some((c) => c.rocnik === cur && !this.treeCache!.idx.has(c.soutez))) this.refreshCompTree(false);
    return Array.from(out.values()).sort((a, b) => b.rocnik - a.rocnik || a.name.localeCompare(b.name, "cs"));
  }
  // ---------- katalog svazů a soutěží (STIS oblast) – uložený na celou sezónu
  private treeCache: { r: number; t: CompTreeData | null; idx: Map<string, CompEntry> } | null = null;
  treeLoading = false;
  treeErr: string | null = null;
  /** Strom svazů a soutěží ročníku: uložený → vestavěný → (loňský jako výchozí). */
  compTree(rocnik = Stis.currentRocnik()): CompTreeData | null {
    if (this.treeCache?.r === rocnik) return this.treeCache.t;
    let t: CompTreeData | null = null;
    try { const s = JSON.parse(prefs.compTreeJson || "null"); if (s?.rocnik === rocnik && s.svazy) t = s; } catch { /* */ }
    t ??= CompTree.seed(rocnik);
    const idx = new Map<string, CompEntry>();
    if (t) for (const e of CompTree.entries(t)) idx.set(e.soutez, e);
    this.treeCache = { r: rocnik, t, idx };
    if (!t && rocnik === Stis.currentRocnik()) this.refreshCompTree(false);
    return t;
  }
  /** Soutěž v katalogu podle čísla (čísla soutěží jsou v ročníku jedinečná). */
  treeEntry(soutez: string, rocnik = Stis.currentRocnik()): CompEntry | null {
    this.compTree(rocnik);
    return this.treeCache?.idx.get(soutez) ?? null;
  }
  /** Stáhne katalog znovu (ručně, na začátku sezóny, nebo když se objeví neznámá soutěž – nejvýš jednou denně). */
  refreshCompTree(manual: boolean) {
    const r = Stis.currentRocnik(), day = new Date().toISOString().slice(0, 10);
    if (this.treeLoading || (!manual && prefs.compTreeTried === `${r}|${day}`)) return;
    prefs.compTreeTried = `${r}|${day}`;
    this.treeLoading = true; this.treeErr = null; this.emit();
    this.repo.compTree(r, manual ? 0 : DAY_MS).then((t) => {
      if (t) { prefs.compTreeJson = JSON.stringify(t); this.treeCache = null; this.knownComps(); }
      else this.treeErr = "Seznam soutěží se nepodařilo přečíst.";
    }, (e) => { this.treeErr = err(e); }).finally(() => { this.treeLoading = false; this.emit(); });
  }

  private compAliasStore(): { rocnik: number; items: Record<string, string[]> } {
    const rocnik = Stis.currentRocnik();
    try { const c = JSON.parse(prefs.compAliasesJson || "null"); if (c && c.rocnik === rocnik && c.items) return c; } catch { /* */ }
    return { rocnik, items: {} };
  }
  /** Zkratky soutěže: ze STIS (K2C, OS 1…) a odvozené u celostátních lig (2LMB). */
  compAliases(c: { svaz: string; rocnik: number; soutez: string; name: string }): string[] {
    const out = [...(this.compAliasStore().items[`${c.svaz}|${c.rocnik}|${c.soutez}`] ?? [])];
    const d = CompTree.derivedCode(c.name);
    if (d && !out.some((x) => CompTree.norm(x) === CompTree.norm(d))) out.unshift(d);
    return out;
  }

  /** Katalog soutěží aktuálního ročníku (nový ročník = prázdný katalog). */
  private compCatalog(): { rocnik: number; items: Record<string, string> } {
    const rocnik = Stis.currentRocnik();
    try { const c = JSON.parse(prefs.compCatalogJson || "null"); if (c && c.rocnik === rocnik && c.items) return c; } catch { /* */ }
    return { rocnik, items: {} };
  }
  /** Naposledy otevřené (hráči, oddíly, soutěže) – rychlé odkazy v Hledat. */
  browseRecent(): { k: "p" | "o" | "s"; id: string; name: string }[] {
    try { return JSON.parse(prefs.browseRecentJson || "[]"); } catch { return []; }
  }
  addBrowseRecent(k: "p" | "o" | "s", id: string, name: string) {
    const list = [{ k, id, name }, ...this.browseRecent().filter((x) => !(x.k === k && x.id === id))].slice(0, 12);
    prefs.browseRecentJson = JSON.stringify(list);
  }
  clubPages = new Map<string, ClubPage>();
  clubPageLoading = new Set<string>();
  clubPageErr = new Map<string, string>();
  loadClubPage(path: string, force = false) {
    if (this.clubPageLoading.has(path) || (!force && this.clubPages.has(path))) return;
    this.clubPageLoading.add(path); this.clubPageErr.delete(path); this.emit();
    this.repo.club(path, force ? 0 : 24 * HOUR).then((c) => { this.clubPages.set(path, c); this.knownComps(); }, (e) => { this.clubPageErr.set(path, err(e)); })
      .finally(() => { this.clubPageLoading.delete(path); this.emit(); });
  }
  clubBrowseRosters = new Map<string, TeamRoster[]>();
  clubRosterLoading = new Set<string>();
  /** Soupisky všech družstev oddílu → žebříček hráčů oddílu podle STR. */
  loadClubRosters(path: string) {
    const c = this.clubPages.get(path);
    if (!c || this.clubRosterLoading.has(path)) return;
    this.clubRosterLoading.add(path); this.emit();
    this.repo.clubRosters(c.teams).then((r) => { this.clubBrowseRosters.set(path, r); }, (e) => { this.clubPageErr.set(path, err(e)); })
      .finally(() => { this.clubRosterLoading.delete(path); this.emit(); });
  }
  /** Data soutěže (tabulka + rozpis) jsou načtená. */
  compBrowseLoaded(c: { svaz: string; rocnik: number; soutez: string }): boolean {
    return this.tabulky.has(Stis.tabulka(c.svaz, c.rocnik, c.soutez)) || this.compLos.has(this.compKey(c));
  }
  loadCompBrowse(c: { svaz: string; rocnik: number; soutez: string }, force = false) {
    this.loadTabulka(c.svaz, c.rocnik, c.soutez, force);
    this.loadCompLos(c, force);
  }

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
        const ctx = await this.repo.nextMatches(m, nowLdt(), finished, (s) => this.scoreFinal(s));
        this.next = ctx;
        for (const c of ctx) if (c.myTeam.ref) this.ensureCompFormat(c.myTeam.ref, c.los);
        for (const c of ctx) {
          const key = this.teamKey(c);
          const z = this.liveZapisFor(key);
          if (!z) continue;
          if (!c.liveNow && this.zapisBelongs(z, c) && this.finished(z)) this.liveLinks.delete(key);
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
        this.startLiveWatch();
      }
    })();
  }

  /** Profilů hráčů v paměti nejvýš tolik; nejstarší se zahodí (při dalším otevření se rychle načtou z mezipaměti). */
  private static PLAYERS_MAX = 120;
  private putPlayer(path: string, p: PlayerPage) {
    this.players.delete(path); this.players.set(path, p);
    this.knownComps(); // soutěže z profilu do trvalého katalogu
    if (this.players.size <= AppVm.PLAYERS_MAX) return;
    const keep = new Set([this.me?.path, ...this.next.flatMap((c) => c.myRoster.map((r) => r.path))]);
    for (const k of this.players.keys()) {
      if (this.players.size <= AppVm.PLAYERS_MAX) break;
      if (keep.has(k)) continue;
      this.players.delete(k); this.requested.delete(k); this.loadingPlayers.delete(k);
    }
  }
  loadPlayer(path: string, force = false) {
    if (this.loadingPlayers.get(path)) return;
    if (!force && this.players.has(path)) return;
    this.loadingPlayers.set(path, true); this.emit();
    (async () => {
      try {
        const p = await this.repo.player(path, force ? 0 : 24 * HOUR);
        if (p) this.putPlayer(path, p);
      } catch {
        // stránky hráčů se většinou načítají na pozadí (STR soupeřů, změny STR) – chyba se nehlásí globálně;
        // obrazovka profilu ukáže vlastní „nepodařilo se načíst“
      } finally {
        this.loadingPlayers.set(path, false); this.emit();
      }
    })();
  }

  private zapisLoading = new Set<string>();
  private zapisFetched = new Map<string, number>();
  /** Zápis je načtený, ale utkání ještě není dohrané. */
  zapisRunning(path: string): boolean {
    const z = this.zapisy.get(path);
    return !!z && !this.finished(z);
  }
  /**
   * Načte zápis. Dohraný zápis se bere z mezipaměti (30 dní); rozehraný se stahuje znovu,
   * pokud je starší než minuta ([force] = vždy znovu).
   */
  loadZapis(path: string, track = false, force = false) {
    if (!path || this.zapisLoading.has(path)) return;
    const have = this.zapisy.get(path);
    if (have && !force && (this.finished(have) || Date.now() - (this.zapisFetched.get(path) ?? 0) < 60_000)) return;
    this.zapisLoading.add(path);
    if (track) this.stepsAdd(1, "Načítám zápisy utkání…");
    (async () => {
      try {
        let z = have || force ? null : await this.repo.zapis(path);
        if (!z || !this.finished(z)) z = await this.repo.zapis(path, force ? 0 : 60_000) ?? z;
        if (z) {
          const wasRunning = !!have && !this.finished(have);
          this.zapisy.set(path, z); this.zapisFetched.set(path, Date.now());
          // nepotvrzený zápis mého družstva: dočíst stránky hráčů bez známého STR (STR soupeře u neoficiálních zápasů)
          if (this.next.some((c) => this.zapisBelongs(z!, c)) && !this.me?.matches.some((m) => m.zapisPath === path)) {
            const svaz = Stis.svaz(path);
            const ids = distinct(z.games.flatMap((g) => [...g.homeIds, ...g.awayIds])).filter((id) => id && this.strOf(id, "") == null);
            for (const id of ids.slice(0, 12)) this.loadPlayer(svaz != null ? `/hrac-${id}/svaz-${svaz}/rocnik-${Stis.currentRocnik()}` : `/hrac-${id}`);
          }
          const zc = this.compOfPath(path);
          if (zc) { const l = this.losForComp(zc); if (l) queueMicrotask(() => this.ensureCompFormat(zc, l)); }
          this.notifyLive(path, z);
          if (wasRunning && this.finished(z) && this.next.some((c) => c.liveNow && this.zapisBelongs(z!, c))) this.loadNext(false);
        }
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

  async setLiveNotify(on: boolean): Promise<string | null> {
    prefs.liveNotify = on;
    this.emit();
    if (!on) return null;
    return this.askLivePermission();
  }
  /** Rozsah upozornění na živé utkání (Nastavení i přepínač na kartě Živé utkání). */
  async setLiveMode(mode: "off" | "games" | "sets"): Promise<string | null> {
    prefs.liveMode = mode;
    this.emit();
    if (mode === "off") return null;
    const e = await this.askLivePermission();
    if (e) { prefs.liveMode = mode; this.emit(); } // bez povolení notifikací zůstanou aspoň zvuky
    return e;
  }
  setLiveSounds(on: boolean) { prefs.liveSounds = on; this.emit(); if (on) playSound("win"); }
  /** Je potřeba klepnutím povolit notifikace (upozornění zapnutá, prohlížeč se ještě neptal). */
  needsLivePermission(): boolean {
    return prefs.liveNotify && typeof Notification !== "undefined" && Notification.permission === "default";
  }
  async askLivePermission(): Promise<string | null> {
    if (typeof Notification === "undefined") { prefs.liveNotify = false; this.emit(); return "Tento prohlížeč notifikace nepodporuje."; }
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") { prefs.liveNotify = false; this.emit(); return "Notifikace nejsou povolené – povolte je v nastavení webu (zámek u adresy → Oprávnění)."; }
    this.startLiveWatch();
    this.emit();
    return null;
  }

  // ---------- notifikace z probíhajícího utkání (jen při otevřené aplikaci)
  /** zápis → čísla her, které už byly dohrané (oznámené nebo dohrané při prvním načtení) */
  private liveSeen = new Map<string, Set<number>>();
  private liveEndSent = new Set<string>();
  /** zápis → hra → počet už známých setů */
  private liveSetsSeen = new Map<string, Map<number, number>>();
  private liveWatch: ReturnType<typeof setInterval> | null = null;

  /** Při otevřené aplikaci každé 2 minuty obnoví zápis probíhajícího utkání (i mimo obrazovku Živé utkání). */
  startLiveWatch() {
    // už načtené zápisy probíhajících utkání: zapamatovat dohrané hry, ať se neoznamují
    for (const c of this.next) { const l = this.liveLinks.get(this.teamKey(c)); const z = l ? this.zapisy.get(l) : null; if (l && z && c.liveNow) this.notifyLive(l, z); }
    if (this.liveWatch != null || typeof window === "undefined") return;
    this.liveWatch = setInterval(() => this.liveWatchTick(), 60_000);
  }
  private liveWatchTick() {
    this.watchTick();
    if (prefs.liveMode === "off") return;
    this.next.forEach((c, i) => {
      if (!this.liveRunning(c)) return;
      const key = this.teamKey(c);
      const link = this.liveLinks.get(key);
      if (!link) { this.autoFindZapis(i); return; }
      if (Date.now() - (this.liveUpdated.get(key) ?? 0) < 50_000) return; // obnovila ho právě obrazovka Živé utkání
      this.loadLive(key, link, true);
    });
  }

  private notifyLive(path: string, z: Zapis) {
    const idx = this.next.findIndex((c) => c.liveNow && this.zapisBelongs(z, c));
    if (idx >= 0) {
      const ctx = this.next[idx];
      this.notifyCore(path, z, this.zapisMyHome(z, ctx), prefs.liveMode, null, ctx.myTeam.name,
        (tag, t, b) => this.post(tag, t, b, true, idx, path));
      return;
    }
    const w = this.watched().find((x) => x.zapisPath === path);
    if (!w) return;
    const mh = w.fan === "home" ? true : w.fan === "away" ? false : null;
    this.notifyCore(path, z, mh, w.mode, `${shortTeam(w.home)} – ${shortTeam(w.away)}`, mh == null ? "" : mh ? w.home : w.away,
      (tag, t, b) => this.postWatch(tag, t, b, w));
  }

  /**
   * Společné oznamování nových her / setů / konce zápisu. [myHomeOrNull] = pohled (null = nikomu nefandím:
   * bez ✅/❌ a bez zvuků), [label] = název cizího utkání v notifikaci.
   */
  private notifyCore(path: string, z: Zapis, myHomeOrNull: boolean | null, mode: "off" | "games" | "sets", label: string | null, endTeam: string,
    send: (tag: string, title: string, body: string) => void) {
    const neutral = myHomeOrNull == null;
    const pre = label ? `${label} · ` : "";
    const myHome = myHomeOrNull ?? true;
    const done = z.games.filter((g) => g.result != null);
    const seen = this.liveSeen.get(path);
    const finished = this.finished(z);
    const setCount = (g: ZapisGame) => g.sets.length;
    if (!seen) { // první načtení: už dohrané hry a sety neoznamujeme
      this.liveSeen.set(path, new Set(done.map((g) => g.no)));
      this.liveSetsSeen.set(path, new Map(z.games.map((g) => [g.no, setCount(g)])));
      if (finished) this.liveEndSent.add(path);
      return;
    }
    const setsSeen = this.liveSetsSeen.get(path) ?? new Map<number, number>();
    this.liveSetsSeen.set(path, setsSeen);
    let h = 0, a = 0, lastWon = false;
    const fresh: string[][] = [];
    const freshSets: string[][] = [];
    let lastSetWon = false;
    for (const g of z.games) {
      if (g.result === 1) h++; else if (g.result === -1) a++;
      // nově dohrané sety v ještě rozehrané hře
      const before = setsSeen.get(g.no) ?? 0, now = setCount(g);
      setsSeen.set(g.no, now);
      if (g.result == null && now > before) {
        const v = g.sets[now - 1];
        const wonSet = (v > 0) === myHome;
        const pts = Math.abs(v), w = pts >= 10 ? pts + 2 : 11;
        const mineN = (myHome ? g.homeNames : g.awayNames).map(surname).join(" + "), oppN = (myHome ? g.awayNames : g.homeNames).map(surname).join(" + ");
        const hs = g.sets.filter((x) => x > 0).length, as = g.sets.filter((x) => x < 0).length;
        lastSetWon = wonSet;
        freshSets.push([`${neutral ? "•" : wonSet ? "🟢" : "🔴"} ${mineN} – ${oppN}: set ${wonSet ? `${w}:${pts}` : `${pts}:${w}`}`, `${pre}${g.no}. hra · sety ${myHome ? hs : as}:${myHome ? as : hs}`, `${g.no}-${now}`]);
      }
      if (g.result == null || seen.has(g.no)) continue;
      seen.add(g.no);
      const won = (g.result === 1) === myHome;
      const mine = (myHome ? g.homeNames : g.awayNames).map(surname).join(" + "), opp = (myHome ? g.awayNames : g.homeNames).map(surname).join(" + ");
      const ms = myHome ? g.homeSets : g.awaySets, os = myHome ? g.awaySets : g.homeSets;
      lastWon = won;
      fresh.push([`${neutral ? "•" : won ? "✅" : "❌"} ${mine} – ${opp}${ms != null && os != null ? ` ${ms}:${os}` : ""}`, `${pre}${g.no}. hra · stav ${myHome ? h : a}:${myHome ? a : h}`, String(g.no)]);
    }
    const my = myHome ? h : a, op = myHome ? a : h;
    const endNow = finished && !this.liveEndSent.has(path);
    const withSets = mode === "sets" && freshSets.length > 0;
    // aplikace na obrazovce s odemčeným zvukem: notifikace potichu, ozve se jen MP3
    const mp3 = prefs.liveSounds && !neutral && mode !== "off";
    this.notifySilent = mp3 && typeof document !== "undefined" && document.visibilityState === "visible" && soundUnlocked();
    if (prefs.liveSounds && !neutral && mode !== "off" && (fresh.length || endNow || withSets))
      playSound(endNow ? (my >= op ? "victory" : "loss") : fresh.length ? (lastWon ? "win" : "loss") : lastSetWon ? "win" : "loss");
    if (mode === "off") { if (endNow) this.liveEndSent.add(path); return; }
    if (withSets) for (const f of freshSets.slice(-3)) send(`live-${path}-set-${f[2]}`, f[0], f[1]);
    if (fresh.length > 3) {
      send(`live-${path}-${fresh[fresh.length - 1][2]}`, `${fresh.length} nových her · stav ${my}:${op}`, (label ? label + "\n" : "") + fresh.map((f) => f[0]).join("\n"));
    } else for (const f of fresh) send(`live-${path}-${f[2]}`, f[0], f[1]);
    if (endNow) {
      this.liveEndSent.add(path);
      const opp = myHome ? z.away : z.home;
      if (neutral) send(`live-end-${path}`, `🏁 Konec: ${shortTeam(z.home)} ${h} : ${a} ${shortTeam(z.away)}`, "");
      else send(`live-end-${path}`, `🏁 Konec: ${my > op ? "výhra" : my < op ? "prohra" : "remíza"} ${my} : ${op}`, `${shortTeam(endTeam)} – ${shortTeam(opp)}`);
    }
  }

  /** odemčení zvuku překreslí aplikaci (odběr se drží po celou dobu běhu) */
  readonly soundHook = onSoundUnlock(() => this.emit());
  /** Další notifikace mají jít potichu (zvuk obstará MP3 v aplikaci). */
  private notifySilent = false;
  private async post(tag: string, title: string, body: string, live = false, liveTeam = 0, livePath = "") {
    if (live ? !prefs.liveNotify : !prefs.notifications) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const data = live ? { live: liveTeam, path: livePath, key: this.next[liveTeam] ? this.teamKey(this.next[liveTeam]) : undefined, team: this.next[liveTeam]?.myTeam.name } : undefined;
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification(title, { body, tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data, silent: live && this.notifySilent });
      else {
        const n = new Notification(title, { body, tag, silent: live && this.notifySilent });
        if (data) n.onclick = () => { try { window.focus(); } catch { /* */ } this.openLiveNotification(data); };
      }
    } catch { /* nepodstatné */ }
  }

  /** Notifikace sledovaného cizího utkání (stačí povolení prohlížeče). */
  private async postWatch(tag: string, title: string, body: string, w: Watched) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const data = { watch: w.key, path: w.zapisPath };
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification(title, { body, tag, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data, silent: this.notifySilent });
      else {
        const n = new Notification(title, { body, tag, silent: this.notifySilent });
        n.onclick = () => { try { window.focus(); } catch { /* */ } this.openLiveNotification(data); };
      }
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

// Načítání a skládání dat ze STIS (přepis Repository.kt, asynchronně).
import { CompTree, type CompTreeData } from "./compTree";
import { Html, rx, findAll, find, g } from "./html";
import { type LDate, type LDT, LDT_MAX, ldOf, ldtDate, nowLdt, today as todayFn } from "./dates";
import { Clubs, Stis, type StrLadder, type TeamInfo, type ClubPage, type LosMatch, type PlayerPage, type RosterPlayer, type StandingRow, type TeamMembership, type TeamRef, type TeamRoster, type Zapis } from "./models";
import { Parsers } from "./parsers";
import { Search, type SearchClub, type SearchPlayer } from "./search";
import { Stats, distinctBy, minBy } from "./stats";

/** Zdroj HTML (v aplikaci proxy + cache, v testech falešná data). */
export interface Fetcher {
  /** maxAgeMs = jak stará může být kopie v cache (0 = vždy stáhnout). */
  get(path: string, maxAgeMs: number): Promise<string>;
}

export interface NextMatchContext {
  myTeam: TeamMembership;
  los: LosMatch[];
  next: LosMatch | null;
  home: boolean;
  opponentName: string;
  opponentRef: TeamRef | null;
  opponentRoster: RosterPlayer[];
  myRoster: RosterPlayer[];
  /** utkání právě probíhá (začátek před méně než 5 hodinami) */
  liveNow: boolean;
}

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

export class StisRepository {
  constructor(readonly fetcher: Fetcher) {}

  /** Názvy soutěží posbírané z každé stažené stránky (odkazy na tabulky): „svaz|ročník|soutěž“ → název. */
  readonly compNames = new Map<string, string>();
  private async get(path: string, maxAge: number): Promise<string> {
    const html = await this.fetcher.get(path, maxAge);
    try { for (const [k, n] of Object.entries(Parsers.compNames(html))) this.compNames.set(k, n); } catch { /* */ }
    return html;
  }

  async player(path: string, maxAge = 6 * HOUR): Promise<PlayerPage | null> {
    const canonical = Stis.canonicalPlayer(path);
    let page: PlayerPage | null = null;
    try {
      page = Parsers.player(await this.get(canonical, maxAge), canonical);
    } catch (e) {
      if (canonical === path) throw e;
      page = null;
    }
    if (page != null || canonical === path) return page;
    return Parsers.player(await this.get(path, maxAge), path);
  }

  async teamRoster(ref: TeamRef, maxAge = DAY): Promise<TeamRoster> {
    let r: TeamRoster;
    try {
      r = Parsers.teamRoster(await this.get(Stis.druzstvo(ref), maxAge), ref);
    } catch {
      r = { team: ref, name: ref.name, players: [] };
    }
    if (r.players.length) return r;
    const fromSoupisky = (await this.soupisky(ref.svaz, ref.rocnik, ref.soutez, maxAge))
      .find((x) => x.team?.id === ref.id || Stats.fold(x.name) === Stats.fold(ref.name));
    return fromSoupisky ? { ...fromSoupisky, team: ref } : r;
  }

  async soupisky(svaz: string, rocnik: number, soutez: string, maxAge = DAY): Promise<TeamRoster[]> {
    try {
      return Parsers.soupisky(await this.get(Stis.soupisky(svaz, rocnik, soutez), maxAge), svaz, rocnik, soutez);
    } catch {
      return [];
    }
  }

  async los(ref: TeamRef, maxAge = 6 * HOUR): Promise<LosMatch[]> {
    return Parsers.los(await this.get(Stis.losVse(ref), maxAge), ref.svaz, ref.rocnik, ref.soutez);
  }

  async tabulka(svaz: string, rocnik: number, soutez: string, maxAge = 6 * HOUR): Promise<StandingRow[]> {
    return Parsers.tabulka(await this.get(Stis.tabulka(svaz, rocnik, soutez), maxAge));
  }

  async teamInfo(ref: TeamRef, maxAge = DAY): Promise<TeamInfo> {
    return Parsers.teamInfo(await this.get(Stis.druzstvo(ref), maxAge));
  }

  async strLadder(svaz: string, rocnik: number, soutez: string, maxAge = 6 * HOUR): Promise<StrLadder> {
    return Parsers.strLadder(await this.get(Stis.zebricek(svaz, rocnik, soutez), maxAge));
  }

  async zapis(path: string, maxAge = 30 * DAY): Promise<Zapis | null> {
    return Parsers.zapis(await this.get(path, maxAge), path);
  }

  /** Katalog všech svazů a soutěží ročníku (jedna stránka oblasti ČAST). */
  async compTree(rocnik: number, maxAge = DAY): Promise<CompTreeData | null> {
    return CompTree.parse(await this.get(`/oblast/svaz-${CompTree.ROOT}/rocnik-${rocnik}`, maxAge), rocnik);
  }

  async club(path: string, maxAge = DAY): Promise<ClubPage> {
    const id = /\/oddil-(\d+)/.exec(path)?.[1] ?? "";
    return Parsers.club(await this.get(path, maxAge), id);
  }

  myTeams(me: PlayerPage): TeamMembership[] {
    const ts = me.currentSeason?.teams ?? [];
    const a = ts.filter((t) => t.ref != null && !t.notOnRoster);
    return a.length ? a : ts.filter((t) => t.ref != null);
  }

  async clubTeams(me: PlayerPage, clubPath: string | null = me.currentSeason?.clubPath ?? null): Promise<[string, TeamRef[]]> {
    const clubName = me.clubName ?? "";
    if (clubPath != null) {
      const current = Stis.currentRocnik();
      for (const path of Array.from(new Set([Stis.clubForRocnik(clubPath, current), clubPath]))) {
        try {
          const c = await this.club(path);
          if (c.teams.length) {
            const rocnik = Math.max(...c.teams.map((t) => t.rocnik));
            return [clubName || c.name, c.teams.filter((t) => t.rocnik === rocnik)];
          }
        } catch {
          // zkusíme další odkaz / náhradní cestu
        }
      }
    }
    const mine = this.myTeams(me).map((t) => t.ref!).filter((x) => x);
    const found = new Map<string, TeamRef>();
    for (const r of mine) found.set(r.id, r);
    for (const s of distinctBy(mine, (r) => `${r.svaz}|${r.rocnik}|${r.soutez}`)) {
      for (const r of await this.soupisky(s.svaz, s.rocnik, s.soutez)) {
        const ref = r.team;
        if (!ref) continue;
        if (Stats.fold(Clubs.clubName(r.name)) === Stats.fold(Clubs.clubName(clubName)) && !found.has(ref.id)) found.set(ref.id, ref);
      }
    }
    return [clubName, Array.from(found.values())];
  }

  async clubRosters(teams: TeamRef[]): Promise<TeamRoster[]> {
    const out: TeamRoster[] = [];
    for (const t of teams) out.push(await this.teamRoster(t));
    return out;
  }

  async searchPlayers(query: string): Promise<SearchPlayer[]> { return Search.players(await this.get(Search.playersPath(query), HOUR)); }
  async searchClubs(query: string): Promise<SearchClub[]> { return Search.clubs(await this.get(Search.clubsPath(query), HOUR)); }

  /**
   * Probíhající utkání: začátek v okně (now−5 h, now+30 min). STIS do rozpisu zapisuje i průběžný stav
   * (např. „1:0“), proto se výsledek v rozpisu bere jako konečný jen tehdy, když ho [scoreFinal] uzná
   * (dosažený cíl / všechny hry), nebo když je družstvo ve [finishedTeams] (zápis ukázal konec).
   */
  async nextMatches(me: PlayerPage, now: LDT = nowLdt(), finishedTeams: Set<string> = new Set(), scoreFinal: (score: string) => boolean = () => false): Promise<NextMatchContext[]> {
    const out: NextMatchContext[] = [];
    for (const t of this.myTeams(me)) {
      const ref = t.ref;
      if (!ref) continue;
      let los: LosMatch[] = [];
      try { los = await this.los(ref); } catch { los = []; }
      const done = finishedTeams.has(ref.id);
      const liveMatch = done ? null : los.find((m) => (!m.played || !scoreFinal(m.score)) && m.dateTime != null && m.dateTime > now - 5 * 60 && m.dateTime < now + 30) ?? null;
      const next = liveMatch ?? (done
        ? minBy(los.filter((m) => !m.played && (m.dateTime == null || m.dateTime > now)), (m) => m.dateTime ?? LDT_MAX)
        : Stats.nextMatch(los, now));
      if (next == null) {
        out.push({ myTeam: t, los, next: null, home: true, opponentName: "", opponentRef: null, opponentRoster: [], myRoster: [], liveNow: false });
        continue;
      }
      const home = Stats.isHome(next, ref, t.name);
      const oppName = home ? next.away : next.home;
      let oppRef = home ? next.awayRef : next.homeRef;
      if (oppRef == null) oppRef = (await this.soupisky(ref.svaz, ref.rocnik, ref.soutez)).find((x) => Stats.fold(x.name) === Stats.fold(oppName))?.team ?? null;
      const oppRoster = oppRef ? (await this.teamRoster({ ...oppRef, name: oppName })).players : [];
      const myRoster = (await this.teamRoster(ref)).players;
      out.push({ myTeam: t, los, next, home, opponentName: oppName, opponentRef: oppRef, opponentRoster: oppRoster, myRoster, liveNow: liveMatch != null });
    }
    return out.sort((a, b) => (a.next?.dateTime ?? LDT_MAX) - (b.next?.dateTime ?? LDT_MAX));
  }

  async findZapis(ctx: NextMatchContext): Promise<string | null> {
    const ref = ctx.myTeam.ref;
    const m = ctx.next;
    if (!ref || !m) return null;
    if (m.zapisPath) return m.zapisPath;
    const pages = [
      Stis.losVse(ref),
      `/vysledky/svaz-${ref.svaz}/rocnik-${ref.rocnik}/soutez-${ref.soutez}/druzstvo-${ref.id}`,
      Stis.druzstvo(ref),
    ];
    for (const p of pages) {
      let html: string;
      try { html = await this.get(p, 0); } catch { continue; }
      const hit = Parsers.los(html, ref.svaz, ref.rocnik, ref.soutez).find((x) => x.zapisPath && this.sameMatch(x, m));
      if (hit) return hit.zapisPath;
      const l = this.zapisLinkInRows(html, m.home, m.away);
      if (l) return l;
    }
    return null;
  }

  private sameMatch(a: LosMatch, b: LosMatch): boolean {
    const f = Stats.fold;
    return (a.round !== "" && a.round === b.round && (f(a.home) === f(b.home) || f(a.away) === f(b.away))) ||
      (f(a.home) === f(b.home) && f(a.away) === f(b.away));
  }

  zapisLinkInRows(html: string, home: string, away: string): string | null {
    const h = Stats.fold(home), a = Stats.fold(away);
    for (const row of findAll(rx("<tr[^>]*>(.*?)</tr>"), html)) {
      const r = g(row, 1);
      const txt = Stats.fold(Html.text(r));
      if (!txt.includes(h) || !txt.includes(a)) continue;
      const hm = find(rx("href=[\"']([^\"']*utkani-\\d+[^\"']*)[\"']"), r);
      if (!hm) continue;
      return Html.unescape(g(hm, 1)).replace(Stis.BASE, "");
    }
    return null;
  }

  /**
   * Všechna utkání soutěže: nejdřív rozpis celé soutěže, jinak sloučené rozpisy všech jejích družstev.
   * [maxAge] krátké při sledování živých výsledků (rozpis nese průběžný stav).
   */
  async competitionLos(c: { svaz: string; rocnik: number; soutez: string }, maxAge = 5 * 60_000): Promise<LosMatch[]> {
    const key = (m: LosMatch) => `${m.round}|${Stats.fold(m.home)}|${Stats.fold(m.away)}`;
    try {
      const all = Parsers.los(await this.get(`/los-vse/svaz-${c.svaz}/rocnik-${c.rocnik}/soutez-${c.soutez}`, maxAge), c.svaz, c.rocnik, c.soutez);
      const teams = new Set(all.flatMap((m) => [Stats.fold(m.home), Stats.fold(m.away)]));
      if (all.length && teams.size > 2 && all.length > teams.size) return all;
    } catch { /* stránka celé soutěže není – sloučit rozpisy družstev */ }
    const teams = await this.competitionTeams({ id: "", name: "", ...c });
    const out = new Map<string, LosMatch>();
    for (const t of teams) {
      try {
        for (const m of Parsers.los(await this.get(Stis.losVse(t), maxAge), c.svaz, c.rocnik, c.soutez)) if (!out.has(key(m))) out.set(key(m), m);
      } catch { /* družstvo přeskočit */ }
    }
    return Array.from(out.values());
  }

  async competitionTeams(ref: TeamRef): Promise<TeamRef[]> {
    const s = (await this.soupisky(ref.svaz, ref.rocnik, ref.soutez)).map((x) => x.team!).filter((x) => x);
    if (s.length) return s;
    try {
      const los = Parsers.los(await this.get(Stis.losVse(ref), 6 * HOUR), ref.svaz, ref.rocnik, ref.soutez);
      return distinctBy(los.flatMap((x) => [x.homeRef, x.awayRef].filter((y): y is TeamRef => y != null)), (r) => r.id);
    } catch {
      return [];
    }
  }

  async zapisyForSeason(me: PlayerPage, season: number, limit = 40): Promise<Zapis[]> {
    const paths = Array.from(new Set(me.matches.filter((m) => m.season === season && m.zapisPath).map((m) => m.zapisPath))).slice(0, limit);
    const out: Zapis[] = [];
    for (const p of paths) {
      try { const z = await this.zapis(p); if (z) out.push(z); } catch { /* přeskočit */ }
    }
    return out;
  }

  seasonEnd(los: LosMatch[], today: LDate = todayFn()): LDate {
    const ds = los.map((m) => m.dateTime).filter((x): x is number => x != null).map(ldtDate);
    const mx = ds.length ? Math.max(...ds) : null;
    return mx != null && mx > today ? mx : ldOf(Stis.currentRocnik(today) + 1, 4, 30)!;
  }
}

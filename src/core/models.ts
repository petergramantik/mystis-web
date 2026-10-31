// Datové třídy a odkazy na STIS (přepis Models.kt).
import { find, findAll, g } from "./html";
import { type LDate, type LDT, LDATE_MIN, ldMonth, ldYear, today } from "./dates";
import { toIntOrNull } from "./json";

/** Základ datových tříd: copy() jako u Kotlin data class. */
export class Data {
  copy(patch: Partial<this>): this {
    return Object.assign(Object.create(Object.getPrototypeOf(this)), this, patch);
  }
}

export interface TeamRef { id: string; svaz: string; rocnik: number; soutez: string; name: string }
export function teamRef(id: string, svaz: string, rocnik: number, soutez: string, name = ""): TeamRef {
  return { id, svaz, rocnik, soutez, name };
}

export type StisLink =
  | { kind: "player"; path: string; id: string }
  | { kind: "team"; ref: TeamRef }
  | { kind: "club"; id: string; svaz: string | null; rocnik: number | null; path: string };

const TEAM_RX = /\/druzstvo-(\d+)\/svaz-(\d+)\/rocnik-(\d{4})\/soutez-(\d+)/;
const PLAYER_RX = /\/hrac-(\d+)/;
const ODDIL_RX = /\/oddil-(\d+)(?:\/svaz-(\d+))?(?:\/rocnik-(\d{4}))?/;
const SVAZ_RX = /\/svaz-(\d+)/;
const ROCNIK_RX = /\/rocnik-(\d{4})/;

export const Stis = {
  BASE: "https://stis.ping-pong.cz",
  oddil: (id: string, svaz: string, rocnik: number) => `/oddil-${id}/svaz-${svaz}/rocnik-${rocnik}`,
  druzstvo: (t: TeamRef) => `/druzstvo-${t.id}/svaz-${t.svaz}/rocnik-${t.rocnik}/soutez-${t.soutez}`,
  losVse: (t: TeamRef) => `/los-vse/svaz-${t.svaz}/rocnik-${t.rocnik}/soutez-${t.soutez}/druzstvo-${t.id}`,
  soupisky: (svaz: string, rocnik: number, soutez: string) => `/soupisky/svaz-${svaz}/rocnik-${rocnik}/soutez-${soutez}`,
  tabulka: (svaz: string, rocnik: number, soutez: string) => `/tabulka/svaz-${svaz}/rocnik-${rocnik}/soutez-${soutez}`,
  zebricek: (svaz: string, rocnik: number, soutez: string) => `/zebricekstr-soutez/svaz-${svaz}/rocnik-${rocnik}/soutez-${soutez}`,

  teamRef(path: string | null | undefined, name = ""): TeamRef | null {
    if (path == null) return null;
    const m = TEAM_RX.exec(path);
    if (!m) return null;
    return teamRef(m[1], m[2], parseInt(m[3], 10), m[4], name);
  },
  playerId: (path: string | null | undefined) => PLAYER_RX.exec(path ?? "")?.[1] ?? null,
  svaz: (path: string | null | undefined) => SVAZ_RX.exec(path ?? "")?.[1] ?? null,
  rocnik: (path: string | null | undefined) => {
    const v = ROCNIK_RX.exec(path ?? "")?.[1];
    return v ? parseInt(v, 10) : null;
  },

  /** Z libovolného vloženého odkazu nebo čísla udělá cestu na STIS. */
  normalizeInput(input: string): StisLink | null {
    let s = input.trim();
    if (!s) return null;
    s = s.replace(/^https?:\/\/[^/]+/, "");
    const hash = s.indexOf("#");
    if (hash >= 0) s = s.substring(0, hash);
    if (/^\d+$/.test(s)) return { kind: "player", path: `/hrac-${s}`, id: s };
    const t = Stis.teamRef(s);
    if (t) return { kind: "team", ref: t };
    const om = ODDIL_RX.exec(s);
    if (om) return { kind: "club", id: om[1], svaz: om[2] || null, rocnik: om[3] ? parseInt(om[3], 10) : null, path: s };
    const pm = PLAYER_RX.exec(s);
    if (pm) return { kind: "player", path: s, id: pm[1] };
    return null;
  },

  /** Stránka hráče vždy pro aktuální ročník: /hrac-ID/svaz-S/rocnik-R. */
  canonicalPlayer(path: string, rocnik: number = Stis.currentRocnik()): string {
    const id = Stis.playerId(path);
    if (id == null) return path;
    const svaz = Stis.svaz(path);
    return svaz != null ? `/hrac-${id}/svaz-${svaz}/rocnik-${rocnik}` : `/hrac-${id}`;
  },

  clubForRocnik(path: string, rocnik: number = Stis.currentRocnik()): string {
    const m = ODDIL_RX.exec(path);
    if (!m) return path;
    const svaz = m[2] || null;
    return svaz != null ? `/oddil-${m[1]}/svaz-${svaz}/rocnik-${rocnik}` : `/oddil-${m[1]}`;
  },

  /** Aktuální soutěžní ročník (rok začátku sezóny). */
  currentRocnik(d: LDate = today()): number {
    return ldMonth(d) >= 7 ? ldYear(d) : ldYear(d) - 1;
  },
};

// ---------------- Stránka hráče ----------------

export interface TeamMembership {
  name: string; ref: TeamRef | null; category: string | null; competition: string | null;
  singles: string | null; doubles: string | null; notOnRoster: boolean;
}
export interface SeasonCard {
  label: string; year: number; club: string | null; clubPath: string | null;
  singles: string | null; doubles: string | null; teams: TeamMembership[];
}
export interface SeasonBilance {
  year: number; team: string; competition: string; pu: number | null; pz: number | null;
  wins: number | null; losses: number | null; success: string; str: number | null; strChange: number | null;
}
export interface ValuableWin {
  myStr: number; opponentId: string; opponent: string; opponentStr: number; score: string; date: string; competition: string;
}
export interface SterInfo {
  str: number | null; stabil: number | null; min: number | null; max: number | null;
  peak: number | null; peakDate: string | null; valuableWins: ValuableWin[];
}
export interface GraphPoint { date: LDate | null; dateText: string; str: number | null; stabil: number | null; label: string }
export interface GraphSeason { year: number; from: number; to: number }

export class Match extends Data {
  seq = 0;
  season = 0;
  dateText = "";
  date: LDate | null = null;
  myTeam = "";
  opponent = "";
  opponentId = "";
  opponentTeam = "";
  score = "";
  zapisPath = "";
  competition = "";
  strBefore: number | null = null;
  strAfter: number | null = null;
  oppStrBefore: number | null = null;
  oppStrAfter: number | null = null;
  opponentPath = "";
  /** zápas z online zápisu, který STIS ještě oficiálně nezapočítal */
  unofficial = false;

  static of(p: Partial<Match>): Match { return Object.assign(new Match(), p); }

  get setsFor(): number {
    const i = this.score.indexOf(":");
    return toIntOrNull((i >= 0 ? this.score.substring(0, i) : this.score).trim()) ?? 0;
  }
  get setsAgainst(): number {
    const i = this.score.indexOf(":");
    return i < 0 ? 0 : toIntOrNull(this.score.substring(i + 1).trim()) ?? 0;
  }
  get valid() { return this.score.includes(":") && this.setsFor !== this.setsAgainst; }
  get won() { return this.setsFor > this.setsAgainst; }
  get delta(): number | null { return this.strBefore != null && this.strAfter != null ? this.strAfter - this.strBefore : null; }
  get fiveSetter() { return this.setsFor + this.setsAgainst === 5; }
  get opponentKey() { return this.opponentId || "jm:" + this.opponent; }
  get club() { return Clubs.clubName(this.opponentTeam); }
}

export class PlayerPage extends Data {
  constructor(
    public id: string,
    public path: string,
    public name: string,
    public birthYear: number | null,
    public seasons: SeasonCard[],
    public bilance: SeasonBilance[],
    public ster: SterInfo,
    public graph: GraphPoint[],
    public graphSeasons: GraphSeason[],
    public matches: Match[],
  ) { super(); }

  private _chron?: Match[];
  private _chronSrc?: Match[];
  /** Zápasy od nejstaršího po nejnovější. */
  get chronological(): Match[] {
    if (!this._chron || this._chronSrc !== this.matches) {
      this._chronSrc = this.matches;
      this._chron = this.matches.filter((m) => m.valid).sort((a, b) => {
        const da = a.date ?? LDATE_MIN, db = b.date ?? LDATE_MIN;
        if (da !== db) return da - db;
        return -a.seq - -b.seq;
      });
    }
    return this._chron;
  }
  override copy(patch: Partial<this>): this {
    const c = super.copy(patch);
    (c as any)._chron = undefined;
    (c as any)._chronSrc = undefined;
    return c;
  }
  get currentStr(): number | null {
    if (this.ster.str != null) return this.ster.str;
    for (let i = this.graph.length - 1; i >= 0; i--) if (this.graph[i].str != null) return this.graph[i].str;
    const ch = this.chronological;
    return ch.length ? ch[ch.length - 1].strAfter : null;
  }
  get currentSeason(): SeasonCard | null {
    let best: SeasonCard | null = null;
    for (const s of this.seasons) if (!best || s.year > best.year) best = s;
    return best;
  }
  get clubName(): string | null {
    return this.currentSeason?.club ?? this.seasons.find((s) => s.club != null)?.club ?? null;
  }
}

// ---------------- Družstva, soupisky, rozpis ----------------

export class RosterPlayer extends Data {
  constructor(
    public id: string | null,
    public path: string | null,
    public name: string,
    public order: number | null,
    public birthYear: number | null,
    public ranking: string | null,
    public str: number | null,
    public strChange: number | null,
    public bilance: string | null,
    public teamName: string,
    public teamId: string | null,
  ) { super(); }
  get wins(): number | null {
    if (this.bilance == null) return null;
    const i = this.bilance.indexOf(":");
    return toIntOrNull((i >= 0 ? this.bilance.substring(0, i) : this.bilance).trim());
  }
  get losses(): number | null {
    if (this.bilance == null) return null;
    const i = this.bilance.indexOf(":");
    return i < 0 ? toIntOrNull("") : toIntOrNull(this.bilance.substring(i + 1).trim());
  }
  get played() { return (this.wins ?? 0) + (this.losses ?? 0); }
}

export interface TeamRoster { team: TeamRef | null; name: string; players: RosterPlayer[] }

export class LosMatch extends Data {
  constructor(
    public round: string,
    public dateText: string,
    public dateTime: LDT | null,
    public home: string,
    public away: string,
    public homeRef: TeamRef | null,
    public awayRef: TeamRef | null,
    public score: string,
    public zapisPath: string,
  ) { super(); }
  get played() { return /^\d+:\d+$/.test(this.score); }
}

export interface StandingRow {
  position: number; name: string; clubId: string | null; teamId: string | null;
  played: number; wins: number; draws: number; losses: number; score: string; points: number;
}

/** Řádek oficiálního žebříčku STR soutěže (zebricekstr-soutez). */
export interface StrLadderRow {
  rank: number | null; id: string | null; path: string | null; name: string; birthYear: number | null;
  matches: number | null; bilance: string | null; str: number | null; stabil: number | null;
}
export interface StrLadderSection { title: string; rows: StrLadderRow[] }
export interface StrLadder { title: string; sections: StrLadderSection[]; info: string }

/** Údaje ze stránky družstva: herna, vybavení a kontakt. */
export interface TeamInfo {
  herna: string | null; gps: [number, number] | null; gpsText: string | null;
  balls: string | null; tables: string | null;
  contactName: string | null; email: string | null; phones: string[];
}

export interface ClubPage { id: string; name: string; teams: TeamRef[] }

export class ZapisGame extends Data {
  constructor(
    public no: number,
    public homeIds: string[],
    public awayIds: string[],
    public homeNames: string[],
    public awayNames: string[],
    /** kladné = set domácích (hodnota = míčky soupeře), záporné = set hostů */
    public sets: number[],
    public homeSets: number | null,
    public awaySets: number | null,
  ) { super(); }
  get doubles() { return this.homeIds.length > 1 || this.awayIds.length > 1 || this.homeNames.length > 1 || this.awayNames.length > 1; }
  /** 1 = vyhráli domácí, -1 = hosté, null = ještě se nehrálo / hraje se */
  get result(): number | null {
    const h = this.homeSets ?? 0, a = this.awaySets ?? 0;
    if (h >= 3 && h > a) return 1;
    if (a >= 3 && a > h) return -1;
    return null;
  }
}

export class Zapis extends Data {
  constructor(
    public path: string,
    public competition: string,
    public round: string,
    public home: string,
    public away: string,
    public homeTeamId: string | null,
    public awayTeamId: string | null,
    public dateText: string,
    public place: string,
    public points: [number | null, number | null],
    public games: ZapisGame[],
    public online = false,
  ) { super(); }
}

const SUFFIX = /\s+("?[A-HJ-K]"?|[IVX]{1,4}|[A-H]-tým)$/;
export const Clubs = {
  /** "TTC Bystřice B" -> "TTC Bystřice" */
  clubName(team: string): string {
    let t = team.trim();
    for (let i = 0; i < 2; i++) t = t.replace(SUFFIX, "").trim();
    return t;
  },
  teamLetter(team: string): string {
    const c = Clubs.clubName(team);
    let rest = team.trim();
    if (rest.startsWith(c)) rest = rest.substring(c.length);
    rest = rest.trim().replace(/^"+|"+$/g, "");
    return rest || "A";
  },
};

// re-export pro pohodlí
export { find, findAll, g };

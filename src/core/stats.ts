// Statistiky, model STR a predikce (přepis Stats.kt).
import { type LDate, type LDT, LDATE_MIN, LDT_MAX, ldMinusYears, ldOf, today as todayFn, nowLdt } from "./dates";
import { Data, Match, PlayerPage, RosterPlayer, Stis, type LosMatch, type TeamRef, type TeamRoster, type Zapis } from "./models";

/**
 * Model STR podle oficiálního popisu eSTeR (STIS): změna STR je celé číslo a roste s rozdílem lineárně –
 * vítěz-favorit dostane tím méně, čím je silnější (až 0), vítěz-outsider tím víc, čím je slabší.
 * Poražený ztratí tolik, kolik vítěz získá. Parametry jsou doladěné na 5 080 skutečných zápasech
 * (72 % změn přesně, průměrná odchylka 0,30 bodu). Pravděpodobnost výhry STIS neuvádí – zůstává logistická
 * (škála 200), která sedí na skutečné výsledky.
 */
export const StrModel = {
  K: 12.5,
  SCALE: 200.0,
  BASE: 5.9,
  UP: 0.03,
  DOWN: 38,
  winProbability(my: number, opp: number): number { return 1.0 / (1.0 + Math.pow(10.0, (opp - my) / StrModel.SCALE)); },
  /** Zisk vítěze; d = STR poraženého − STR vítěze. */
  winnerGain(d: number): number { return Math.round(d >= 0 ? StrModel.BASE + StrModel.UP * d : Math.max(0, StrModel.BASE + d / StrModel.DOWN)); },
  gainIfWin(my: number, opp: number): number { return StrModel.winnerGain(opp - my); },
  lossIfLose(my: number, opp: number): number { return -StrModel.winnerGain(my - opp); },
  expectedDelta(my: number, opp: number, p: number = StrModel.winProbability(my, opp)): number {
    return p * StrModel.gainIfWin(my, opp) + (1 - p) * StrModel.lossIfLose(my, opp);
  },
};

export interface Forecast {
  current: number; center: number; low: number; high: number; remainingMatches: number; until: LDate;
  formPerMatch: number;
  /** body pro graf: datum → [střed, dolní, horní] */
  path: [LDate, [number, number, number]][];
}
export interface FormInfo { last: Match[]; wins: number; losses: number; overExpected: number; sample: number }

export class Split {
  constructor(readonly label: string, readonly wins: number, readonly losses: number, readonly expectedWins: number) {}
  get total() { return this.wins + this.losses; }
  get success() { return this.total === 0 ? 0 : this.wins / this.total; }
  get overExpected() { return this.wins - this.expectedWins; }
}

export interface Streak { length: number; from: Match | null; to: Match | null }

export interface Badge { title: string; detail: string }

export class SeasonSummary {
  constructor(readonly year: number, readonly wins: number, readonly losses: number, readonly strStart: number | null,
    readonly strEnd: number | null, readonly matches: number) {}
  get label() { return `${this.year}/${(this.year + 1) % 100}`; }
  get success() { return this.matches === 0 ? 0 : this.wins / this.matches; }
  get change(): number | null { return this.strStart != null && this.strEnd != null ? this.strEnd - this.strStart : null; }
}

export class OpponentStat {
  constructor(readonly key: string, readonly id: string, readonly name: string, readonly team: string, readonly club: string, readonly matches: Match[]) {}
  get wins() { return this.matches.filter((m) => m.won).length; }
  get losses() { return this.matches.length - this.wins; }
  get setsFor() { return this.matches.reduce((s, m) => s + m.setsFor, 0); }
  get setsAgainst() { return this.matches.reduce((s, m) => s + m.setsAgainst, 0); }
  get last(): Match | null { return this.matches.length ? this.matches[this.matches.length - 1] : null; }
  get lastStr(): number | null {
    for (let i = this.matches.length - 1; i >= 0; i--) if (this.matches[i].oppStrAfter != null) return this.matches[i].oppStrAfter;
    return null;
  }
  get record() { return `${this.wins}–${this.losses}`; }
}

export class ClubStat {
  constructor(readonly club: string, readonly opponents: OpponentStat[]) {}
  get matches() { return this.opponents.reduce((s, o) => s + o.matches.length, 0); }
  get wins() { return this.opponents.reduce((s, o) => s + o.wins, 0); }
  get losses() { return this.matches - this.wins; }
  get success() { return this.matches === 0 ? 0 : this.wins / this.matches; }
  get lastDate(): LDate | null {
    let best: LDate | null = null;
    for (const o of this.opponents) { const d = o.last?.date; if (d != null && (best == null || d > best)) best = d; }
    return best;
  }
}

export class LadderEntry extends Data {
  constructor(
    public id: string | null,
    public path: string | null,
    public name: string,
    public str: number | null,
    public strChange: number | null,
    public teams: string[],
    public wins: number,
    public losses: number,
    public birthYear: number | null,
    /** true = STR a bilance jsou čerstvé ze stránky hráče */
    public live = false,
  ) { super(); }
  get played() { return this.wins + this.losses; }
}

export interface ScoutEntry { player: RosterPlayer; h2h: OpponentStat | null; winProb: number | null; gain: number | null; loss: number | null }
export interface TeamExpectation { my: number; opp: number; games: number; perPlayer: [string, number][] }
export interface SetStats { sets: number; setsWon: number; close: number; closeWon: number; deuce: number; deuceWon: number; deciding: number; decidingWon: number }

export interface Records {
  totalMatches: number; wins: number; losses: number; longestWin: Streak; longestLoss: Streak; currentStreak: number;
  biggestScalp: Match | null; biggestUpset: Match | null; worstLoss: Match | null;
  peakStr: number | null; peakDate: string | null; lowStr: number | null;
  bestSeason: SeasonSummary | null; mostPlayed: OpponentStat | null; nemesis: OpponentStat | null; favourite: OpponentStat | null;
  badges: Badge[];
}

// ------------------------------------------------------------ pomocné
export function groupBy<T, K>(xs: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) { const k = key(x); const l = m.get(k); if (l) l.push(x); else m.set(k, [x]); }
  return m;
}
export function maxBy<T>(xs: T[], f: (x: T) => number): T | null {
  let best: T | null = null, bv = -Infinity;
  for (const x of xs) { const v = f(x); if (best === null || v > bv) { best = x; bv = v; } }
  return best;
}
export function minBy<T>(xs: T[], f: (x: T) => number): T | null {
  let best: T | null = null, bv = Infinity;
  for (const x of xs) { const v = f(x); if (best === null || v < bv) { best = x; bv = v; } }
  return best;
}
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : NaN);
export const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function distinct<T>(xs: T[]): T[] { return Array.from(new Set(xs)); }
export function distinctBy<T, K>(xs: T[], f: (x: T) => K): T[] {
  const seen = new Set<K>(); const out: T[] = [];
  for (const x of xs) { const k = f(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}
const rated = (l: Match[]) => l.filter((m) => m.strBefore != null && m.oppStrBefore != null);
const wp = (m: Match) => StrModel.winProbability(m.strBefore!, m.oppStrBefore!);

function streak(ch: Match[], win: boolean): Streak {
  let best: Streak = { length: 0, from: null, to: null };
  let len = 0;
  let start: Match | null = null;
  for (const m of ch) {
    if (m.won === win) {
      if (len === 0) start = m;
      len++;
      if (len > best.length) best = { length: len, from: start, to: m };
    } else len = 0;
  }
  return best;
}

export const Stats = {
  // ------------------------------------------------------------ forma a predikce
  /** Forma; výkon (nad/pod očekáváním) z posledních [sampleN] zápasů se známým STR, případně jen v sezóně [season]. */
  /** Výkon nad/pod očekáváním podle STR pro dané zápasy (jen se známým STR obou hráčů). */
  overExpectedOf(ms: Match[]): { over: number; sample: number } {
    const r = rated(ms);
    return { over: sum(r.map((m) => (m.won ? 1 : 0) - wp(m))), sample: r.length };
  },
  form(page: PlayerPage, lastN = 5, sampleN = 20, season: number | null = null): FormInfo {
    const ch = page.chronological;
    const last = ch.slice(Math.max(0, ch.length - lastN)).reverse();
    // posledních sampleN zápasů se známým STR obou hráčů (nejdřív filtr, pak výběr -> stabilní počet)
    const known = ch.filter((m) => m.strBefore != null && m.oppStrBefore != null && (season == null || m.season === season));
    const sample = known.slice(Math.max(0, known.length - sampleN));
    const over = sum(sample.map((m) => (m.won ? 1 : 0) - wp(m)));
    return { last, wins: last.filter((m) => m.won).length, losses: last.filter((m) => !m.won).length, overExpected: over, sample: sample.length };
  },

  singlesPerTeamMatch(page: PlayerPage, season: number): number {
    const m = page.matches.filter((x) => x.season === season && x.valid);
    const utkani = distinct(m.map((x) => x.zapisPath || x.dateText + x.opponentTeam)).length;
    return utkani === 0 ? 3.0 : m.length / utkani;
  },

  estimateRemaining(page: PlayerPage, upcomingTeamMatches: number | null, today: LDate = todayFn()): number {
    const season = Stis.currentRocnik(today);
    if (upcomingTeamMatches != null) return Math.round(upcomingTeamMatches * Stats.singlesPerTeamMatch(page, season));
    const yearAgo = ldMinusYears(today, 1);
    const lastYear = page.matches.filter((m) => m.season === season - 1 && m.valid && (m.date ?? LDATE_MIN) > yearAgo).length;
    if (lastYear > 0) return lastYear;
    const end = ldOf(season + 1, 4, 30)!;
    const months = Math.max(0, (end - today) / 30.0);
    return Math.round(months * 4);
  },

  forecast(page: PlayerPage, remaining: number, until: LDate, today: LDate = todayFn()): Forecast | null {
    const cur = page.currentStr;
    if (cur == null) return null;
    const f = Stats.form(page);
    const perMatch = f.sample === 0 ? 0 : f.overExpected / f.sample;
    const drift = 0.1 * 2 * StrModel.winnerGain(0) * perMatch;
    const n = Math.max(0, remaining);
    const sd = 4.8;
    const path: [LDate, [number, number, number]][] = [];
    const days = Math.max(1, until - today);
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const k = n * frac;
      const c = cur + drift * k;
      const w = 1.2816 * sd * Math.sqrt(k);
      path.push([today + Math.trunc(days * frac), [c, c - w, c + w]]);
    }
    const lst = path[path.length - 1][1];
    return { current: cur, center: lst[0], low: lst[1], high: lst[2], remainingMatches: n, until, formPerMatch: perMatch, path };
  },

  // ------------------------------------------------------------ sezóny, rozdělení, rekordy
  seasons(page: PlayerPage): SeasonSummary[] {
    return Array.from(groupBy(page.chronological, (m) => m.season)).map(([y, ms]) =>
      new SeasonSummary(y, ms.filter((m) => m.won).length, ms.filter((m) => !m.won).length, ms[0].strBefore, ms[ms.length - 1].strAfter, ms.length),
    ).sort((a, b) => b.year - a.year);
  },

  splits(matches: Match[]): Split[] {
    const mk = (label: string, f: (m: Match) => boolean) => {
      const ms = matches.filter(f);
      return new Split(label, ms.filter((m) => m.won).length, ms.filter((m) => !m.won).length, sum(rated(ms).map(wp)));
    };
    const diff = (m: Match) => (m.oppStrBefore ?? 0) - (m.strBefore ?? 0);
    const r = rated(matches);
    const sp = (label: string, f: (d: number) => boolean) => {
      const ms = r.filter((m) => f(diff(m)));
      return new Split(label, ms.filter((m) => m.won).length, ms.filter((m) => !m.won).length, sum(ms.map(wp)));
    };
    return [
      mk("Pětisetové zápasy", (m) => m.fiveSetter),
      sp("Proti silnějším (+50 a víc)", (d) => d > 50),
      sp("Proti vyrovnaným (±50)", (d) => Math.abs(d) <= 50),
      sp("Proti slabším (−50 a míň)", (d) => d < -50),
      mk("Hladké zápasy 3:0 / 0:3", (m) => m.setsFor + m.setsAgainst === 3),
    ];
  },

  setStats(zapisy: Zapis[], myId: string): SetStats {
    let sets = 0, won = 0, close = 0, closeWon = 0, deuce = 0, deuceWon = 0, dec = 0, decWon = 0;
    for (const z of zapisy) for (const gm of z.games) {
      if (gm.doubles) continue;
      const home = gm.homeIds.includes(myId);
      const away = gm.awayIds.includes(myId);
      if (!home && !away) continue;
      gm.sets.forEach((v, idx) => {
        const iWon = home ? v > 0 : v < 0;
        const loserPts = Math.abs(v);
        sets++;
        if (iWon) won++;
        if (loserPts >= 9) { close++; if (iWon) closeWon++; }
        if (loserPts >= 10) { deuce++; if (iWon) deuceWon++; }
        if (idx === 4) { dec++; if (iWon) decWon++; }
      });
    }
    return { sets, setsWon: won, close, closeWon, deuce, deuceWon, deciding: dec, decidingWon: decWon };
  },

  opponents(page: PlayerPage): OpponentStat[] {
    return Stats.opponentsOf(page.chronological);
  },
  opponentsOf(chron: Match[]): OpponentStat[] {
    return Array.from(groupBy(chron, (m) => m.opponentKey)).map(([k, ms]) => {
      const l = ms[ms.length - 1];
      return new OpponentStat(k, l.opponentId, l.opponent, l.opponentTeam, l.club, ms);
    }).sort((a, b) => b.matches.length - a.matches.length || cmpStr(a.name, b.name));
  },

  clubs(page: PlayerPage): ClubStat[] {
    return Stats.clubsOf(Stats.opponents(page));
  },
  clubsOf(opps: OpponentStat[]): ClubStat[] {
    return Array.from(groupBy(opps, (o) => o.club || "Neznámý klub")).map(([c, os]) => new ClubStat(c, os))
      .sort((a, b) => b.matches - a.matches || cmpStr(a.club, b.club));
  },

  searchOpponents(page: PlayerPage, query: string): OpponentStat[] {
    const q = Stats.fold(query);
    if (!q.trim()) return Stats.opponents(page);
    return Stats.opponents(page).filter((o) => Stats.fold(o.name).includes(q));
  },

  searchClubs(page: PlayerPage, query: string): ClubStat[] {
    const q = Stats.fold(query);
    if (!q.trim()) return Stats.clubs(page);
    return Stats.clubs(page).filter((c) => Stats.fold(c.club).includes(q) || c.opponents.some((o) => Stats.fold(o.team).includes(q)));
  },

  /** Odstraní diakritiku a velká písmena – "Bystřice" najde i "bystrice". */
  fold(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "").trim();
  },

  records(page: PlayerPage): Records {
    const ch = page.chronological;
    const wins = ch.filter((m) => m.won);
    const losses = ch.filter((m) => !m.won);
    const d = (m: Match) => (m.oppStrBefore ?? 0) - (m.strBefore ?? 0);
    let cur = 0;
    for (const m of [...ch].reverse()) {
      if (cur === 0) cur = m.won ? 1 : -1;
      else if ((cur > 0) === m.won) cur += m.won ? 1 : -1;
      else break;
    }
    const opps = Stats.opponents(page);
    const seasons = Stats.seasons(page);
    const strs = page.graph.map((p) => p.str).filter((x): x is number => x != null);
    const peak = page.ster.peak ?? (strs.length ? Math.max(...strs) : null);
    const peakDate = page.ster.peakDate ?? page.graph.find((p) => p.str === peak)?.dateText ?? null;
    const badges: Badge[] = [];
    const lw = streak(ch, true);
    if (lw.length >= 5) badges.push({ title: `Série ${lw.length} výher`, detail: `${lw.from?.dateText} – ${lw.to?.dateText}` });
    const up = maxBy(rated(wins), d);
    if (up && d(up) >= 100) badges.push({ title: "Obr zabiják", detail: `výhra nad o ${d(up)} STR silnějším (${up.opponent})` });
    const five = ch.filter((m) => m.fiveSetter);
    const fw = five.filter((m) => m.won).length;
    if (five.length >= 5 && fw * 2 > five.length) badges.push({ title: "Nervy ze železa", detail: `pětisetové zápasy ${fw}–${five.length - fw}` });
    if (ch.length >= 100) badges.push({ title: "Stovkař", detail: `${ch.length} odehraných dvouher` });
    if (ch.length >= 500) badges.push({ title: "Veterán stolů", detail: `${ch.length} dvouher` });
    const s0 = seasons[0];
    if (s0 && (s0.change ?? 0) >= 30) badges.push({ title: "Raketa sezóny", detail: `+${s0.change} STR v sezóně ${s0.label}` });
    const perfect = seasons.find((s) => s.matches >= 8 && s.losses === 0);
    if (perfect) badges.push({ title: "Neporažený", detail: `sezóna ${perfect.label} bez prohry` });
    const multi = opps.filter((o) => o.matches.length >= 3);
    const nem = maxBy(multi, (o) => o.losses - o.wins);
    const fav = maxBy(multi, (o) => o.wins - o.losses);
    const upset = maxBy(rated(wins), d);
    const worst = minBy(rated(losses), d);
    return {
      totalMatches: ch.length, wins: wins.length, losses: losses.length,
      longestWin: lw, longestLoss: streak(ch, false), currentStreak: cur,
      biggestScalp: maxBy(rated(wins), (m) => m.oppStrBefore!),
      biggestUpset: upset && d(upset) > 0 ? upset : null,
      worstLoss: worst && d(worst) < 0 ? worst : null,
      peakStr: peak, peakDate,
      lowStr: strs.length ? Math.min(...strs) : null,
      bestSeason: maxBy(seasons.filter((s) => s.matches >= 10), (s) => s.success),
      mostPlayed: opps[0] ?? null,
      nemesis: nem && nem.losses > nem.wins ? nem : null,
      favourite: fav && fav.wins > fav.losses ? fav : null,
      badges,
    };
  },

  // ------------------------------------------------------------ oddíl, kapitán, příští zápas
  ladder(rosters: TeamRoster[]): LadderEntry[] {
    const map = new Map<string, LadderEntry>();
    for (const r of rosters) for (const p of r.players) {
      const key = p.id ?? "jm:" + p.name;
      const prev = map.get(key);
      if (prev == null) {
        map.set(key, new LadderEntry(p.id, p.path, p.name, p.str, p.strChange, [r.name], p.wins ?? 0, p.losses ?? 0, p.birthYear));
      } else {
        const ss = [prev.str, p.str].filter((x): x is number => x != null);
        map.set(key, prev.copy({
          str: ss.length ? Math.max(...ss) : null,
          strChange: prev.strChange ?? p.strChange,
          teams: distinct([...prev.teams, r.name]),
          wins: prev.wins + (p.wins ?? 0), losses: prev.losses + (p.losses ?? 0),
        }));
      }
    }
    return Stats.sortLadder(Array.from(map.values()));
  },
  sortLadder(xs: LadderEntry[]): LadderEntry[] {
    return [...xs].sort((a, b) => (b.str ?? -1) - (a.str ?? -1) || cmpStr(a.name, b.name));
  },

  refreshLadder(entries: LadderEntry[], pages: Map<string, PlayerPage>, me: PlayerPage | null, season: number): LadderEntry[] {
    const fromPage = (e: LadderEntry, p: PlayerPage): LadderEntry => {
      const sm = p.chronological.filter((m) => m.season === season);
      const start = sm[0]?.strBefore ?? null;
      const cur = p.currentStr ?? e.str;
      return e.copy({
        str: cur,
        strChange: start != null && cur != null ? cur - start : e.strChange,
        wins: sm.filter((m) => m.won).length, losses: sm.filter((m) => !m.won).length, live: true,
      });
    };
    const out = entries.map((e) => { const p = e.id != null ? pages.get(e.id) : undefined; return p ? fromPage(e, p) : e; });
    if (me != null && !out.some((e) => e.id === me.id)) {
      const teams = me.currentSeason?.teams.filter((t) => !t.notOnRoster).map((t) => t.name) ?? [];
      out.push(fromPage(new LadderEntry(me.id, me.path, me.name, me.currentStr, null, teams, 0, 0, me.birthYear), me));
    } else if (me != null) {
      const i = out.findIndex((e) => e.id === me.id);
      out[i] = fromPage(out[i], me);
    }
    return Stats.sortLadder(out);
  },

  suggestLineup(players: RosterPlayer[], size = 4): RosterPlayer[] {
    const score = (p: RosterPlayer) => (p.str ?? 0) + 0.3 * (p.strChange ?? 0) + (p.played > 0 ? 15 : 0);
    return players.filter((p) => p.str != null).sort((a, b) => score(b) - score(a)).slice(0, size);
  },

  expectedTeamScore(my: [string, number][], opp: number[], doubles = 2): TeamExpectation {
    if (!my.length || !opp.length) return { my: 0, opp: 0, games: 0, perPlayer: [] };
    const per: [string, number][] = my.map(([n, s]) => [n, sum(opp.map((o) => StrModel.winProbability(s, o)))]);
    const singles = sum(per.map((x) => x[1]));
    const avgMy = avg(my.map((x) => x[1]));
    const avgOpp = avg(opp);
    const dbl = doubles * StrModel.winProbability(Math.round(avgMy), Math.round(avgOpp));
    const games = my.length * opp.length + doubles;
    return { my: singles + dbl, opp: games - singles - dbl, games, perPlayer: per };
  },

  nextMatch(los: LosMatch[], now: LDT = nowLdt()): LosMatch | null {
    return minBy(los.filter((m) => !m.played).filter((m) => m.dateTime == null || m.dateTime > now - 6 * 60), (m) => m.dateTime ?? LDT_MAX);
  },

  remainingTeamMatches(los: LosMatch[], now: LDT = nowLdt()): number {
    return los.filter((m) => !m.played && (m.dateTime == null || m.dateTime > now)).length;
  },

  isHome(m: LosMatch, myTeam: TeamRef | null, myTeamName: string): boolean {
    const f = Stats.fold;
    return (myTeam != null && m.homeRef?.id === myTeam.id) ||
      (m.homeRef == null && f(m.home) === f(myTeamName)) ||
      (myTeam != null && m.awayRef?.id !== myTeam.id && f(m.home) === f(myTeam.name));
  },

  scout(me: PlayerPage, roster: RosterPlayer[]): ScoutEntry[] {
    const myStr = me.currentStr;
    const opps = Stats.opponents(me);
    return roster.map((p) => {
      const h = opps.find((o) => p.id != null && o.id === p.id) ?? opps.find((o) => Stats.fold(o.name) === Stats.fold(p.name)) ?? null;
      const s = p.str ?? h?.lastStr ?? null;
      const ok = myStr != null && s != null;
      return {
        player: p, h2h: h,
        winProb: ok ? StrModel.winProbability(myStr!, s!) : null,
        gain: ok ? StrModel.gainIfWin(myStr!, s!) : null,
        loss: ok ? StrModel.lossIfLose(myStr!, s!) : null,
      };
    }).sort((a, b) => (b.player.str ?? 0) - (a.player.str ?? 0));
  },

  pct(x: number): string { return `${Math.round(x * 100)} %`; },
  signed(x: number, decimals = 1): string {
    const r = decimals === 0 ? String(Math.round(x)) : Math.abs(x).toFixed(decimals).replace(".", ",");
    if (decimals === 0 && Math.round(x) > 0) return "+" + r;
    if (decimals === 0) return r.replace("-", "−");
    if (x > 0.05) return "+" + r;
    if (x < -0.05) return "−" + r;
    return "0";
  },
};

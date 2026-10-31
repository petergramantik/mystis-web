// Živé utkání: formáty, hry ze zápisu, pravděpodobnosti a průběžné STR (přepis Live.kt).
import { Data, type Zapis } from "./models";
import { StrModel, Stats, avg } from "./stats";

export interface MatchFormat { key: string; label: string; players: number; games: number; doubles: number; target: number | null }

export const MatchFormats = {
  ALL: [
    { key: "18_10", label: "4 hráči · 18 her · do 10 bodů", players: 4, games: 18, doubles: 2, target: 10 },
    { key: "18_all", label: "4 hráči · 18 her · hrají se všechny", players: 4, games: 18, doubles: 2, target: null },
    { key: "10_6", label: "3 hráči · 10 her · do 6 bodů", players: 3, games: 10, doubles: 1, target: 6 },
    { key: "10_all", label: "3 hráči · 10 her · hrají se všechny", players: 3, games: 10, doubles: 1, target: null },
    { key: "5_3", label: "2 hráči · 4 dvouhry + čtyřhra · do 3 bodů", players: 2, games: 5, doubles: 1, target: 3 },
  ] as MatchFormat[],
  get DEFAULT() { return MatchFormats.ALL[0]; },
  of(key: string | null | undefined): MatchFormat { return MatchFormats.ALL.find((f) => f.key === key) ?? MatchFormats.ALL[0]; },
};

export interface ZapisPlayerStat { id: string | null; name: string; home: boolean; singlesWon: number; singlesLost: number; doublesWon: number; doublesLost: number }

/**
 * Hráč v utkání. strMin/strMax = rozpětí STR nového hráče (eSTeR): proti němu se při výhře počítá s jeho STRmin,
 * při prohře s jeho STRmax – nový hráč tak soupeřovo STR téměř neovlivní.
 */
export interface LivePlayer { id: string | null; name: string; str: number | null; strMin?: number | null; strMax?: number | null }
export const lp = (id: string | null, name: string, str: number | null): LivePlayer => ({ id, name, str });

export class LiveGame extends Data {
  constructor(
    public no: number,
    public home: LivePlayer[],
    public away: LivePlayer[],
    /** 1 = vyhráli domácí, -1 = hosté, null = nehráno */
    public result: number | null,
    public sets: number[] = [],
    public homeSets: number | null = null,
    public awaySets: number | null = null,
  ) { super(); }
  get doubles() { return this.home.length > 1 || this.away.length > 1; }
  get inProgress() { return this.result == null && ((this.homeSets ?? 0) + (this.awaySets ?? 0) > 0 || this.sets.length > 0); }
}

export interface PlayerLive {
  name: string; id: string | null; home: boolean; singles: number; played: number; won: number;
  /** očekávané výhry před utkáním */
  expectedBefore: number;
  /** odehrané výhry + očekávané ve zbývajících hrách */
  expectedFinal: number;
  /** změna STR: skutečná za odehrané + očekávaná za zbývající */
  strDelta: number;
}

export interface LiveState {
  games: LiveGame[]; gameProb: number[]; home: number; away: number;
  pHomeWin: number; pDraw: number; pAwayWin: number; expHome: number; expAway: number;
  players: PlayerLive[]; finished: boolean; played: number;
}

const avgStr = (ps: LivePlayer[], fallback: number): number => {
  const s = ps.map((p) => p.str).filter((x): x is number => x != null);
  return s.length ? Math.trunc(avg(s)) : fallback;
};

export const Live = {
  fromZapis(z: Zapis, strOf: (id: string | null, name: string) => number | null,
    rangeOf: (id: string | null, name: string) => [number, number] | null = () => null): LiveGame[] {
    return z.games.map((gm) => {
      const side = (ids: string[], names: string[]) => names.map((n, i) => {
        const id = ids[i] ?? null;
        const r = rangeOf(id, n);
        return { ...lp(id, n, strOf(id, n)), strMin: r?.[0] ?? null, strMax: r?.[1] ?? null };
      });
      return new LiveGame(gm.no, side(gm.homeIds, gm.homeNames), side(gm.awayIds, gm.awayNames), gm.result, gm.sets, gm.homeSets, gm.awaySets);
    });
  },

  manualGames(home: LivePlayer[], away: LivePlayer[], homeD1: LivePlayer[], homeD2: LivePlayer[], awayD1: LivePlayer[], awayD2: LivePlayer[],
    results: Map<number, number>): LiveGame[] {
    const out: LiveGame[] = [];
    let no = 1;
    const r = (n: number) => results.get(n) ?? null;
    if (homeD1.length && awayD1.length) { out.push(new LiveGame(no, homeD1, awayD1, r(no))); no++; }
    if (homeD2.length && awayD2.length) { out.push(new LiveGame(no, homeD2, awayD2, r(no))); no++; }
    const n = Math.min(home.length, 4), m = Math.min(away.length, 4), k = Math.max(n, m);
    for (let rr = 0; rr < k; rr++) for (let i = 0; i < n; i++) {
      const j = (i + rr) % k;
      if (j >= m) continue;
      out.push(new LiveGame(no, [home[i]], [away[j]], r(no))); no++;
    }
    return out;
  },

  manualByPosition(homePos: Map<number, LivePlayer>, awayPos: Map<number, LivePlayer>,
    homeD1: LivePlayer[], homeD2: LivePlayer[], awayD1: LivePlayer[], awayD2: LivePlayer[],
    results: Map<number, number>, teamSize = 4, doublesCount = 2): LiveGame[] {
    const out: LiveGame[] = [];
    const r = (n: number) => results.get(n) ?? null;
    let no = 1;
    if (homeD1.length && awayD1.length) out.push(new LiveGame(no, homeD1, awayD1, r(no)));
    no++;
    if (doublesCount >= 2) {
      if (homeD2.length && awayD2.length) out.push(new LiveGame(no, homeD2, awayD2, r(no)));
      no++;
    }
    const rounds: [number, number][][] =
      teamSize === 2 ? [[[1, 1], [2, 2]], [[1, 2], [2, 1]]]
        : teamSize === 3 ? [[[1, 1], [2, 2], [3, 3]], [[1, 2], [2, 3], [3, 1]], [[1, 3], [2, 1], [3, 2]]]
          : [
            [[1, 1], [2, 2], [3, 3], [4, 4]],
            [[1, 2], [2, 1], [3, 4], [4, 3]],
            [[1, 3], [2, 4], [3, 1], [4, 2]],
            [[1, 4], [2, 3], [3, 2], [4, 1]],
          ];
    for (const rd of rounds) for (const [h, a] of rd) {
      const hp = homePos.get(h), ap = awayPos.get(a);
      if (hp && ap) out.push(new LiveGame(no, [hp], [ap], r(no)));
      no++;
    }
    return out;
  },

  isFinished(games: LiveGame[], format: MatchFormat): boolean {
    if (!games.length) return false;
    const h = games.filter((x) => x.result === 1).length;
    const a = games.filter((x) => x.result === -1).length;
    if (format.target != null && (h >= format.target || a >= format.target)) return true;
    // online zápis obsahuje během utkání jen začaté hry – skončené je až s plným počtem her
    return games.length >= format.games && games.every((x) => x.result != null);
  },

  isZapisFinished(z: Zapis, format: MatchFormat): boolean {
    const [p1, p2] = z.score;
    if (format.target != null && p1 != null && p2 != null && (p1 >= format.target || p2 >= format.target)) return true;
    const h = z.games.filter((x) => x.result === 1).length, a = z.games.filter((x) => x.result === -1).length;
    if (format.target != null && (h >= format.target || a >= format.target)) return true;
    return z.games.length >= format.games && z.games.every((x) => x.result != null);
  },

  playerStats(z: Zapis): ZapisPlayerStat[] {
    const map = new Map<string, ZapisPlayerStat>();
    for (const gm of z.games) {
      const r = gm.result;
      if (r == null) continue;
      for (const home of [true, false]) {
        const ids = home ? gm.homeIds : gm.awayIds;
        const names = home ? gm.homeNames : gm.awayNames;
        const won = (r === 1) === home;
        names.forEach((n, i) => {
          const id = ids[i] ?? null;
          const key = (home ? "H:" : "A:") + (id ?? n);
          const p = map.get(key) ?? { id, name: n, home, singlesWon: 0, singlesLost: 0, doublesWon: 0, doublesLost: 0 };
          const q = { ...p };
          if (gm.doubles) { if (won) q.doublesWon++; else q.doublesLost++; }
          else { if (won) q.singlesWon++; else q.singlesLost++; }
          map.set(key, q);
        });
      }
    }
    return Array.from(map.values());
  },

  /** Šance domácích vyhrát hru na [need] vítězných setů, když jim chybí [nh] a hostům [na] setů a set vyhrávají s pravděpodobností [q]. */
  fromSets(q: number, nh: number, na: number): number {
    if (nh <= 0) return 1;
    if (na <= 0) return 0;
    const memo = new Map<number, number>();
    const f = (h: number, a: number): number => {
      if (h <= 0) return 1;
      if (a <= 0) return 0;
      const key = h * 10 + a;
      const c = memo.get(key);
      if (c != null) return c;
      const v = q * f(h - 1, a) + (1 - q) * f(h, a - 1);
      memo.set(key, v);
      return v;
    };
    return f(nh, na);
  },

  /** Šance vyhrát jeden set, která odpovídá šanci [p] vyhrát celou hru (na 3 vítězné sety). */
  setProb(p: number, need = 3): number {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let lo = 0, hi = 1;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (Live.fromSets(m, need, need) < p) lo = m; else hi = m; }
    return (lo + hi) / 2;
  },

  /** Šance domácích na výhru rozehrané hry podle stavu na sety (dohrané sety ze zápisu). */
  inGame(p: number, g: LiveGame, need = 3): number {
    if (g.result != null) return g.result === 1 ? 1 : 0;
    const hs = g.homeSets ?? g.sets.filter((v) => v > 0).length;
    const as = g.awaySets ?? g.sets.filter((v) => v < 0).length;
    if (hs + as === 0) return p;
    return Live.fromSets(Live.setProb(p, need), need - hs, need - as);
  },

  evaluate(games: LiveGame[], format: MatchFormat = MatchFormats.DEFAULT): LiveState {
    const allHome = games.flatMap((x) => x.home).map((p) => p.str).filter((x): x is number => x != null);
    const allAway = games.flatMap((x) => x.away).map((p) => p.str).filter((x): x is number => x != null);
    const fbHome = allHome.length ? Math.trunc(avg(allHome)) : 1500;
    const fbAway = allAway.length ? Math.trunc(avg(allAway)) : 1500;
    const prior = games.map((x) => StrModel.winProbability(avgStr(x.home, fbHome), avgStr(x.away, fbAway)));
    // rozehrané hry: šance podle stavu na sety
    const probs = games.map((x, i) => (x.result == null ? Live.inGame(prior[i], x) : prior[i]));

    const home = games.filter((x) => x.result === 1).length;
    const away = games.filter((x) => x.result === -1).length;
    const target = format.target;
    const k = (h: number, a: number) => h * 1000 + a;
    let states = new Map<number, number>([[k(home, away), 1.0]]);
    const done = target != null && (home >= target || away >= target);
    if (!done) {
      games.forEach((gm, i) => {
        if (gm.result != null) return;
        const p = probs[i];
        const next = new Map<number, number>();
        for (const [key, pr] of states) {
          const h = Math.floor(key / 1000), a = key % 1000;
          if (target != null && (h >= target || a >= target)) { next.set(key, (next.get(key) ?? 0) + pr); continue; }
          next.set(k(h + 1, a), (next.get(k(h + 1, a)) ?? 0) + pr * p);
          next.set(k(h, a + 1), (next.get(k(h, a + 1)) ?? 0) + pr * (1 - p));
        }
        states = next;
      });
    }
    let pw = 0, pd = 0, pl = 0, eh = 0, ea = 0;
    for (const [key, pr] of states) {
      const h = Math.floor(key / 1000), a = key % 1000;
      if (h > a) pw += pr; else if (h === a) pd += pr; else pl += pr;
      eh += h * pr; ea += a * pr;
    }

    const keys = new Map<string, PlayerLive>();
    games.forEach((gm, i) => {
      if (gm.doubles) return;
      for (const isHome of [true, false]) {
        const me = (isHome ? gm.home : gm.away)[0];
        if (!me) continue;
        const opp = (isHome ? gm.away : gm.home)[0];
        const p = isHome ? probs[i] : 1 - probs[i];
        const key = (isHome ? "H:" : "A:") + (me.id || me.name);
        const prev = keys.get(key) ?? { name: me.name, id: me.id, home: isHome, singles: 0, played: 0, won: 0, expectedBefore: 0, expectedFinal: 0, strDelta: 0 };
        const won = gm.result != null && ((gm.result === 1) === isHome);
        const myStr = me.str ?? (isHome ? fbHome : fbAway);
        const oppStr = opp?.str ?? (isHome ? fbAway : fbHome);
        const gain = StrModel.gainIfWin(myStr, opp?.strMin ?? oppStr);
        const loss = StrModel.lossIfLose(myStr, opp?.strMax ?? oppStr);
        const delta = gm.result == null ? p * gain + (1 - p) * loss : won ? gain : loss;
        keys.set(key, {
          ...prev,
          singles: prev.singles + 1,
          played: prev.played + (gm.result != null ? 1 : 0),
          won: prev.won + (won ? 1 : 0),
          expectedBefore: prev.expectedBefore + (isHome ? prior[i] : 1 - prior[i]),
          expectedFinal: prev.expectedFinal + (gm.result != null ? (won ? 1 : 0) : p),
          strDelta: prev.strDelta + delta,
        });
      }
    });
    return {
      games, gameProb: probs, home, away, pHomeWin: pw, pDraw: pd, pAwayWin: pl, expHome: eh, expAway: ea,
      players: Array.from(keys.values()), finished: done || Live.isFinished(games, format),
      played: games.filter((x) => x.result != null).length,
    };
  },
};

/** Hra aktivního hráče v probíhajícím utkání. */
export interface MyLiveGame {
  game: LiveGame; opponent: LivePlayer; home: boolean; strBefore: number; ifWin: number; ifLoss: number;
  /** null = ještě se nehraje nebo hraje */
  won: boolean | null; strAfter: number | null;
}

export const LiveTimeline = {
  isMe(p: LivePlayer, myId: string | null | undefined, myName: string): boolean {
    return (!!myId && p.id === myId) || Stats.fold(p.name) === Stats.fold(myName);
  },
  timeline(games: LiveGame[], myId: string | null | undefined, myName: string, startStr: number, fallbackOpp: number = startStr): MyLiveGame[] {
    let cur = startStr;
    const out: MyLiveGame[] = [];
    for (const gm of games) {
      if (gm.doubles) continue;
      const h = gm.home[0], a = gm.away[0];
      if (!h || !a) continue;
      let home: boolean;
      if (LiveTimeline.isMe(h, myId, myName)) home = true;
      else if (LiveTimeline.isMe(a, myId, myName)) home = false;
      else continue;
      const opp = home ? a : h;
      const oppStr = opp.str ?? fallbackOpp;
      const my = Math.trunc(cur);
      const win = cur + StrModel.gainIfWin(my, opp.strMin ?? oppStr);
      const loss = cur + StrModel.lossIfLose(my, opp.strMax ?? oppStr);
      const won = gm.result != null ? (gm.result === 1) === home : null;
      const after = won === true ? win : won === false ? loss : null;
      out.push({ game: gm, opponent: opp, home, strBefore: cur, ifWin: win, ifLoss: loss, won, strAfter: after });
      if (after != null) cur = after;
    }
    return out;
  },
};

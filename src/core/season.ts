// Predikce konečné tabulky soutěže: každé zbývající utkání se odhadne podle STR sestav
// (každý s každým + čtyřhry, stejně jako živé utkání) a celá zbytek sezóny se mnohokrát nasimuluje.
import { Live, lp, type MatchFormat } from "./live";
import type { StandingRow } from "./models";

export interface SeasonTeam {
  name: string;
  points: number; played: number; wins: number; draws: number; losses: number;
  /** rozdíl skóre (vyhrané − prohrané body v utkáních) pro rozhodnutí shody bodů */
  diff: number;
  /** STR pravděpodobné sestavy (nejsilnější hráči) */
  lineup: number[];
}
export interface FutureMatch { home: string; away: string }
export interface MatchOdds { home: string; away: string; pHome: number; pDraw: number; pAway: number; expDiff: number }
export interface TeamPrediction {
  name: string; points: number; played: number; remaining: number;
  expPoints: number; expPosition: number;
  /** pravděpodobnost každého umístění (index 0 = 1. místo) */
  posProb: number[];
}
export interface SeasonPrediction { teams: TeamPrediction[]; matches: MatchOdds[]; rule: [number, number, number]; sims: number }

/** Body za výhru, remízu a prohru odvozené ze skutečné tabulky (STIS obvykle 3 / 2 / 1). */
export function pointsRule(rows: StandingRow[]): [number, number, number] {
  const candidates: [number, number, number][] = [[3, 2, 1], [2, 1, 0], [3, 1, 0], [2, 1, 1], [3, 2, 0], [4, 2, 1]];
  const played = rows.filter((r) => r.played > 0);
  for (const c of candidates) if (played.every((r) => r.wins * c[0] + r.draws * c[1] + r.losses * c[2] === r.points)) return c;
  return candidates[0];
}

/** Pravděpodobnost výhry domácích, remízy a výhry hostů v jednom utkání družstev. */
export function matchOdds(home: number[], away: number[], format: MatchFormat): [number, number, number, number] {
  const n = format.players;
  const mk = (strs: number[], prefix: string) => {
    const s = [...strs].sort((a, b) => b - a).slice(0, n);
    while (s.length < n) s.push(s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : 1400);
    return s.map((v, i) => lp(prefix + i, prefix + i, v));
  };
  const h = mk(home, "h"), a = mk(away, "a");
  const pos = (ps: typeof h) => new Map(ps.map((p, i) => [i + 1, p] as [number, typeof p]));
  const d2 = format.doubles >= 2;
  const games = Live.manualByPosition(pos(h), pos(a),
    h.slice(0, 2), d2 ? h.slice(2, 4) : [], a.slice(0, 2), d2 ? a.slice(2, 4) : [], new Map(), n, format.doubles);
  const st = Live.evaluate(games, format);
  return [st.pHomeWin, st.pDraw, st.pAwayWin, st.expHome - st.expAway];
}

/** Jednoduchý deterministický generátor náhodných čísel (stejný vstup = stejný výsledek). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function predictSeason(teams: SeasonTeam[], matches: FutureMatch[], rule: [number, number, number], format: MatchFormat, sims = 5000): SeasonPrediction {
  const idx = new Map(teams.map((t, i) => [t.name, i]));
  const odds: MatchOdds[] = [];
  const games: [number, number, number, number][] = [];
  for (const m of matches) {
    const hi = idx.get(m.home), ai = idx.get(m.away);
    if (hi == null || ai == null) continue;
    const [pH, pD, pA, ed] = matchOdds(teams[hi].lineup, teams[ai].lineup, format);
    odds.push({ home: m.home, away: m.away, pHome: pH, pDraw: pD, pAway: pA, expDiff: ed });
    games.push([hi, ai, pH, pH + pD]);
  }
  const n = teams.length;
  const posCount = teams.map(() => new Array(n).fill(0));
  const ptsSum = new Array(n).fill(0);
  const remaining = new Array(n).fill(0);
  for (const g of games) { remaining[g[0]]++; remaining[g[1]]++; }
  // shoda bodů: rozhoduje rozdíl skóre (aktuální + očekávaný ze zbývajících utkání)
  const tie = teams.map((t) => t.diff);
  for (const o of odds) { tie[idx.get(o.home)!] += o.expDiff; tie[idx.get(o.away)!] -= o.expDiff; }
  const rand = rng(12345);
  const pts = new Array(n);
  const order = teams.map((_, i) => i);
  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < n; i++) pts[i] = teams[i].points;
    for (const [h, a, pH, pHD] of games) {
      const r = rand();
      if (r < pH) { pts[h] += rule[0]; pts[a] += rule[2]; }
      else if (r < pHD) { pts[h] += rule[1]; pts[a] += rule[1]; }
      else { pts[h] += rule[2]; pts[a] += rule[0]; }
    }
    order.sort((x, y) => pts[y] - pts[x] || tie[y] - tie[x]);
    order.forEach((t, p) => { posCount[t][p]++; });
    for (let i = 0; i < n; i++) ptsSum[i] += pts[i];
  }
  const out: TeamPrediction[] = teams.map((t, i) => {
    const posProb = posCount[i].map((c: number) => c / sims);
    return {
      name: t.name, points: t.points, played: t.played, remaining: remaining[i],
      expPoints: ptsSum[i] / sims,
      expPosition: posProb.reduce((a: number, p: number, k: number) => a + p * (k + 1), 0),
      posProb,
    };
  }).sort((a, b) => a.expPosition - b.expPosition);
  return { teams: out, matches: odds, rule, sims };
}

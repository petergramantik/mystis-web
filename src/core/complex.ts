import type { Match } from "./models";
import { StrModel } from "./stats";

/**
 * Komplexní model predikcí (volitelný). Parametry ověřené zpětným testem na 5 020 reálných zápasech (2011–2026):
 * - vzájemné zápasy zlepšily Brier skóre 0,1774 → 0,1764 (log-loss 0,526 → 0,524),
 * - korekce formou (posledních 15 zápasů) predikci zhoršila – STR už reaguje na každý zápas, korekce ho přestřelí,
 * - volatilita hráče (nevyzpytatelnost) nepomohla – STR je dobře kalibrované.
 * Do výpočtu proto jde vzájemná bilance a výhoda domácího prostředí; forma se jen ukazuje.
 */
export const Complex = {
  /** zapnutý komplexní model (nastavuje aplikace) */
  on: false,
  /** vzájemná korekce pro dvojici hráčů (id domácího, id hosta) → posun STR domácího */
  pair: null as null | ((homeId: string, awayId: string) => number),
  /** poločas váhy vzájemného zápasu (dny) – test: delší je lepší, starší zápasy ale nemají převážit */
  H2H_HALF_LIFE: 1460,
  /** pokud se rozdíl STR obou hráčů od té doby změnil o ~250, váha klesne na 1/e */
  H2H_STR_DECAY: 250,
  /** stažení k nule u malého vzorku: ~8 „pseudozápasů“ s výsledkem podle STR (informace 2) */
  H2H_PRIOR: 2,
  H2H_CAP: 40,
  HOME_PRIOR: 30,
  HOME_CAP: 30,
  /** derivace pravděpodobnosti podle STR: dP/dR = ln10/SCALE · P(1−P) */
  slope(): number { return Math.LN10 / StrModel.SCALE; },
};

export interface H2HInfo { adj: number; games: number; weight: number }

/**
 * Vzájemná korekce STR hráče A proti B (kladná = A proti B hraje lépe, než říká STR).
 * ms = zápasy hráče A (chronologicky), aNow/bNow = dnešní STR, today = den (LDate číslo).
 */
export function h2hAdj(ms: Match[], oppId: string, aNow: number | null, bNow: number | null, today: number): H2HInfo {
  let num = 0, info = 0, games = 0, weight = 0;
  for (const x of ms) {
    if (x.opponentId !== oppId || !x.valid || x.strBefore == null || x.oppStrBefore == null) continue;
    const age = x.date != null ? Math.max(0, today - x.date) : 365 * 3;
    const dS = aNow != null && bNow != null ? Math.abs((aNow - x.strBefore) - (bNow - x.oppStrBefore)) : 0;
    const w = Math.pow(0.5, age / Complex.H2H_HALF_LIFE) * Math.exp(-((dS / Complex.H2H_STR_DECAY) ** 2));
    const E = StrModel.winProbability(x.strBefore, x.oppStrBefore);
    num += w * ((x.won ? 1 : 0) - E); info += w * E * (1 - E); games++; weight += w;
  }
  if (!games) return { adj: 0, games: 0, weight: 0 };
  const adj = num / ((info + Complex.H2H_PRIOR) * Complex.slope());
  return { adj: Math.round(Math.max(-Complex.H2H_CAP, Math.min(Complex.H2H_CAP, adj))), games, weight };
}

/** Forma (jen pro zobrazení): výsledky posledních zápasů proti očekávání podle STR, v bodech STR. */
export function formInfo(ms: Match[], today: number, n = 15): { adj: number; games: number; wins: number } {
  const rec = ms.filter((x) => x.valid && x.strBefore != null && x.oppStrBefore != null).slice(-n);
  let num = 0, info = 0;
  for (const x of rec) {
    const age = x.date != null ? Math.max(0, today - x.date) : 365;
    const w = Math.pow(0.5, age / 60);
    const E = StrModel.winProbability(x.strBefore!, x.oppStrBefore!);
    num += w * ((x.won ? 1 : 0) - E); info += w * E * (1 - E);
  }
  const adj = rec.length ? num / ((info + 1.5) * Complex.slope()) : 0;
  return { adj: Math.round(Math.max(-99, Math.min(99, adj))), games: rec.length, wins: rec.filter((x) => x.won).length };
}

/** Výhoda domácích z dvouher (STR domácích a hostů → výsledek), stažená k nule. */
export function homeAdvantage(games: { home: number; away: number; homeWon: boolean }[]): { adj: number; games: number } {
  let num = 0, info = 0;
  for (const g of games) {
    const E = StrModel.winProbability(g.home, g.away);
    num += (g.homeWon ? 1 : 0) - E; info += E * (1 - E);
  }
  if (!games.length) return { adj: 0, games: 0 };
  const adj = num / ((info + Complex.HOME_PRIOR * 0.25) * Complex.slope());
  return { adj: Math.round(Math.max(-Complex.HOME_CAP, Math.min(Complex.HOME_CAP, adj))), games: games.length };
}

/** Zpětný test na zápasech hráčů: Brier a log-loss základního a komplexního modelu (bez znalosti budoucnosti). */
export function backtest(players: Match[][]): { n: number; base: [number, number]; h2h: [number, number]; form: [number, number] } {
  let n = 0;
  const acc = { base: [0, 0], h2h: [0, 0], form: [0, 0] } as Record<string, number[]>;
  const add = (k: string, p: number, s: number) => { acc[k][0] += (p - s) ** 2; acc[k][1] -= Math.log(Math.max(1e-9, s ? p : 1 - p)); };
  for (const all of players) {
    const ms = all.filter((x) => x.valid && x.strBefore != null && x.oppStrBefore != null && x.date != null);
    ms.forEach((m, i) => {
      if (i < 10) return;
      const t = m.date!, prev = ms.slice(0, i), s = m.won ? 1 : 0;
      const h = m.opponentId ? h2hAdj(prev, m.opponentId, m.strBefore, m.oppStrBefore, t).adj : 0;
      const f = formInfo(prev, t).adj;
      add("base", StrModel.winProbability(m.strBefore!, m.oppStrBefore!), s);
      add("h2h", StrModel.winProbability(m.strBefore! + h, m.oppStrBefore!), s);
      add("form", StrModel.winProbability(m.strBefore! + f, m.oppStrBefore!), s);
      n++;
    });
  }
  const r = (k: string): [number, number] => [n ? acc[k][0] / n : 0, n ? acc[k][1] / n : 0];
  return { n, base: r("base"), h2h: r("h2h"), form: r("form") };
}

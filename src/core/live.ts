// Živé utkání: formáty, hry ze zápisu, pravděpodobnosti a průběžné STR (přepis Live.kt).
import { Data, type Zapis } from "./models";
import { StrModel, Stats, avg } from "./stats";

/**
 * Formát utkání družstev. seq = pořadí her: „D“ čtyřhra (číslují se postupně Č1, Č2), dvojice písmen dvouhra
 * (domácí A–D proti hostům X, Y, Z, U podle SŘ). Bez seq: nejdřív čtyřhry, pak dvouhry „každý s každým“ točením.
 */
export interface MatchFormat { key: string; label: string; players: number; games: number; doubles: number; target: number | null; seq?: string }

/** Pozice hry: čtyřhra n (1, 2) nebo dvouhra [domácí, hosté] (1-based). */
export type Slot = { d: number } | { h: number; a: number };

const HL = "ABCD", AL = "XYZU";
const S4 = "AX BY CZ DU BX CY DZ AU CX DY AZ BU DX AY BZ CU"; // SŘ 317.01
const S3 = "AX BY CZ BX AZ CY BZ CX AY"; // SŘ 318.01
const first = (s: string, n: number) => s.split(" ").slice(0, n).join(" ");
const F = (key: string, label: string, players: number, seq: string, target: number | null): MatchFormat => {
  const t = seq.split(" ");
  return { key, label, players, games: t.length, doubles: t.filter((x) => x === "D").length, target, seq };
};

export const MatchFormats = {
  ALL: [
    F("18_10", "4 hráči · 18 her · do 10 bodů (SŘ 317.01)", 4, `D D ${S4}`, 10),
    F("18_all", "4 hráči · 18 her · hrají se všechny (SŘ 317.01)", 4, `D D ${S4}`, null),
    F("14_8", "4 hráči · 14 her · do 8 bodů, remíza 7:7 (1.–3. liga mužů)", 4, `D D ${first(S4, 12)}`, 8),
    F("13_7", "4 hráči · 13 her · do 7 bodů (play-off 1.–3. ligy mužů)", 4, `D ${first(S4, 12)}`, 7),
    F("10_6_4", "4 hráči · 10 her · do 6 bodů (SŘ 317.02)", 4, "D D AY CU BX DZ AX CZ BY DU", 6),
    F("10_all_4", "4 hráči · 10 her · hrají se všechny (SŘ 317.02)", 4, "D D AY CU BX DZ AX CZ BY DU", null),
    F("10_6", "3 hráči · 10 her · do 6 bodů (SŘ 318.01)", 3, `D ${S3}`, 6),
    F("10_all", "3 hráči · 10 her · hrají se všechny (SŘ 318.01, 1.–2. liga žen)", 3, `D ${S3}`, null),
    F("10_6_dl", "3 hráči · 10 her, čtyřhra na konci · do 6 bodů (extraliga žen)", 3, `${S3} D`, 6),
    F("9_5", "3 hráči · 9 dvouher · do 5 bodů (play-off 1.–2. ligy žen)", 3, S3, 5),
    F("7_4", "3 hráči · 7 her · do 4 bodů (SŘ 318.02)", 3, "AY BX CZ D AX CY BZ", 4),
    F("7_all", "3 hráči · 7 her · hrají se všechny (SŘ 318.02)", 3, "AY BX CZ D AX CY BZ", null),
    F("5s_3", "3 hráči · 5 dvouher · do 3 bodů (extraliga)", 3, "AX BY CZ AY BX", 3),
    F("5_3", "2 hráči · čtyřhra + 4 dvouhry · do 3 bodů (SŘ 319 I)", 2, "D AX BY AY BX", 3),
    F("5_3_ii", "2 hráči · 2 dvouhry, čtyřhra, 2 dvouhry · do 3 bodů (SŘ 319 II)", 2, "AX BY D AY BX", 3),
    F("5_all", "2 hráči · čtyřhra + 4 dvouhry · hrají se všechny (SŘ 319 I)", 2, "D AX BY AY BX", null),
  ] as MatchFormat[],
  get DEFAULT() { return MatchFormats.ALL[0]; },
  of(key: string | null | undefined): MatchFormat { return MatchFormats.ALL.find((f) => f.key === key) ?? MatchFormats.ALL[0]; },
  /** Krátký popis formátu („14 her · do 8“). */
  short(f: MatchFormat): string { return `${f.games} her · ${f.target != null ? `do ${f.target}` : "hrají se všechny"}`; },
  /** Předvolba podle názvu soutěže (rozpisy ČAST 2026/27), než se načtou zápisy. */
  byName(name: string | null | undefined): MatchFormat | null {
    const n = Stats.fold(name ?? "").replace(/\s+/g, " ");
    if (!n) return null;
    const women = /zen|zeny|^[12e]l?z\b|^[12]lz|^elz|^exz/.test(n);
    if (/extraliga|^el[mz]|^ex[mz]/.test(n)) return MatchFormats.of(women ? "10_6_dl" : "5s_3");
    if (/^[123]\.? ?liga|^[123]\. ?l\b|^[123]l[mz]/.test(n)) return MatchFormats.of(women ? "10_all" : "14_8");
    return null;
  },
  /** Pozice her formátu; order (z klíče soutěže) nahradí pořadí dvouher, když sedí počet. */
  slots(fmt: MatchFormat, order?: [number, number][] | null): Slot[] {
    const n = MatchFormats.singlesCount(fmt);
    const ord = order && order.length === n && order.every(([h, a]) => h >= 1 && h <= fmt.players && a >= 1 && a <= fmt.players) ? order : null;
    if (fmt.seq) {
      let d = 0, k = 0;
      return fmt.seq.split(" ").map((t) => {
        if (t === "D") return { d: ++d };
        const pr = ord ? ord[k] : ([HL.indexOf(t[0]) + 1, AL.indexOf(t[1]) + 1] as [number, number]);
        k++;
        return { h: pr[0], a: pr[1] };
      });
    }
    const out: Slot[] = Array.from({ length: fmt.doubles }, (_, i) => ({ d: i + 1 }));
    for (const [h, a] of ord ?? MatchFormats.cyclicOrder(fmt.players)) out.push({ h, a });
    return out;
  },
  singlesCount(fmt: MatchFormat): number { return fmt.seq ? fmt.seq.split(" ").filter((t) => t !== "D").length : fmt.players * fmt.players; },
  /** Pořadí dvouher formátu (1-based [domácí, hosté]). */
  defaultOrder(fmt: MatchFormat): [number, number][] {
    return MatchFormats.slots(fmt).filter((x): x is { h: number; a: number } => "h" in x).map((x) => [x.h, x.a] as [number, number]);
  },
  /**
   * Rozpozná formát soutěže z dohraných zápisů: struktura (počet her, čtyřher a jejich pozice, hráčů) se porovná
   * se známými formáty. Hranice: hry se projdou v pořadí; když po dosažení vítězné hranice následovala odehraná hra,
   * jde o „hrají se všechny“, když zbyly jen nehrané hry, o „do hranice“. Utkání, kde hranici nikdo nedosáhl
   * nebo ji dosáhl až poslední hrou, nerozhoduje. certain = aspoň jeden rozhodující zápis a žádný neodporuje.
   */
  detectInfo(zs: Zapis[]): { fmt: MatchFormat | null; certain: boolean; votes: number } {
    const done = zs.filter((z) => z.games.length >= 4 && z.games.some((g) => g.result != null));
    if (!done.length) return { fmt: null, certain: false, votes: 0 };
    const games = Math.max(...done.map((z) => z.games.length));
    const full = done.filter((z) => z.games.length === games);
    const doubles = Math.max(...full.map((z) => z.games.filter((g) => g.doubles).length));
    const ref = full.find((z) => z.games.filter((g) => g.doubles).length === doubles) ?? full[0];
    const sorted = (z: Zapis) => [...z.games].sort((a, b) => a.no - b.no);
    const dpos = sorted(ref).map((g, i) => (g.doubles ? i : -1)).filter((i) => i >= 0).join(",");
    // počet hráčů: nejčastější počet různých hráčů ve dvouhrách (u extraligy může střídat čtvrtý)
    const counts = full.map((z) => {
      const s = z.games.filter((g) => !g.doubles && g.homeNames.length === 1 && g.awayNames.length === 1);
      return Math.max(new Set(s.map((g) => Stats.fold(g.homeNames[0]))).size, new Set(s.map((g) => Stats.fold(g.awayNames[0]))).size);
    }).filter((n) => n > 0);
    const mode = counts.length ? [...counts].sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length || a - b)[0] : 0;
    const dposOf = (f: MatchFormat) => MatchFormats.slots(f).map((x, i) => ("d" in x ? i : -1)).filter((i) => i >= 0).join(",");
    let cands = MatchFormats.ALL.filter((f) => f.games === games && f.doubles === doubles && dposOf(f) === dpos);
    if (!cands.length) {
      // zápisy bez nehraných řádků: každé utkání skončilo přesně na hranici delšího známého formátu
      const pts = done.map((z) => { const h = z.games.filter((g) => g.result === 1).length, a = z.games.filter((g) => g.result === -1).length; return Math.max(h, a); });
      const cut = MatchFormats.ALL.filter((f) => f.target != null && f.games > games && f.doubles === doubles && dposOf(f) === dpos
        && pts.every((x) => x === f.target) && (!mode || f.players === mode));
      if (cut.length) return { fmt: cut[0], certain: true, votes: done.length };
    }
    if (new Set(cands.map((f) => f.players)).size > 1 && mode) {
      const best = Math.min(...cands.map((f) => Math.abs(f.players - mode)));
      cands = cands.filter((f) => Math.abs(f.players - mode) === best);
    }
    const t0 = cands.find((f) => f.target != null)?.target
      ?? (games === 18 ? 10 : games === 10 ? 6 : games === 5 ? 3 : Math.floor(games / 2) + 1);
    // silné důkazy: „do hranice“ = po dosažení hranice zbyly nehrané hry; „všechny“ = vedoucí družstvo hranici přetáhlo
    // (např. 12:6). Slabý důkaz „všechny“: po dosažení hranice se odehrálo pár her, ale vedoucí už nebodoval
    // (občas se dohrávají jednotlivé zápasy i v soutěžích do 10).
    let all = 0, weakAll = 0, upTo = 0;
    for (const z of done) {
      const gs = sorted(z);
      let h = 0, a = 0, reached = -1;
      gs.forEach((g, i) => {
        if (g.result === 1) h++; else if (g.result === -1) a++;
        if (reached < 0 && Math.max(h, a) >= t0) reached = i;
      });
      // oficiální skóre v hlavičce zápisu: zastavené na hranici, i když se dohrávalo = „do hranice“
      const [ph, pa] = z.points;
      if (ph != null && pa != null && ph + pa > 0) {
        if (Math.max(ph, pa) === t0 && ph + pa < h + a) { upTo++; continue; }
        if (Math.max(ph, pa) > t0) { all++; continue; }
      }
      if (Math.max(h, a) > t0) { all++; continue; }
      if (reached < 0 || reached >= gs.length - 1) continue;
      const after = gs.slice(reached + 1);
      if (after.every((g) => g.result == null)) upTo++;
      else weakAll++;
    }
    let target: number | null = upTo > 0 && upTo >= all ? t0 : all > 0 || weakAll > upTo ? null : t0;
    // formát jen „do hranice“ (např. 1.–3. liga) – „všechny“ se nerozpozná, bere se známá varianta
    if (target == null && cands.length && !cands.some((f) => f.target == null)) target = t0;
    const certain = target != null ? upTo > 0 && all === 0 : all > 0 ? upTo === 0 : weakAll >= 2 && upTo === 0;
    const known = cands.find((f) => f.target === target);
    let fmt: MatchFormat;
    if (known) fmt = known;
    else {
      // neznámý formát: pořadí her ze zápisu (písmena podle nástupu hráčů)
      const hs: string[] = [], as: string[] = [];
      const toks = sorted(ref).map((g) => {
        if (g.doubles) return "D";
        if (g.homeNames.length !== 1 || g.awayNames.length !== 1) return "?";
        const h = Stats.fold(g.homeNames[0]), a = Stats.fold(g.awayNames[0]);
        if (!hs.includes(h)) hs.push(h);
        if (!as.includes(a)) as.push(a);
        return `${HL[hs.indexOf(h)] ?? "?"}${AL[as.indexOf(a)] ?? "?"}`;
      });
      const players = Math.max(1, mode || Math.round(Math.sqrt(games - doubles)));
      const seq = toks.every((t) => !t.includes("?")) && hs.length === players && as.length === players ? toks.join(" ") : undefined;
      fmt = { key: `auto_${games}_${target ?? "all"}`, label: `${players} hráči · ${games} her · ${target != null ? `do ${target} bodů` : "hrají se všechny"}`, players, games, doubles, target, ...(seq ? { seq } : {}) };
    }
    return { fmt, certain, votes: all + weakAll + upTo };
  },
  detect(zs: Zapis[]): MatchFormat | null { return MatchFormats.detectInfo(zs).fmt; },
  /**
   * Klíč pořadí dvouher: číslo hry -> [písmeno domácího, písmeno hosta] (A–D proti X–W).
   * Z dohraného zápisu soutěže (pořadí, v jakém hráči nastupují), jinak standardní klíč.
   */
  singlesKey(zs: Zapis[], fmt: MatchFormat): Map<number, [string, string]> {
    const n = MatchFormats.singlesCount(fmt);
    for (const z of zs) {
      const singles = [...z.games].filter((g) => !g.doubles && g.homeNames.length === 1 && g.awayNames.length === 1).sort((a, b) => a.no - b.no);
      if (singles.length < n) continue;
      const hs: string[] = [], as: string[] = [];
      const out = new Map<number, [string, string]>();
      for (const g of singles) {
        const h = Stats.fold(g.homeNames[0]), a = Stats.fold(g.awayNames[0]);
        if (!hs.includes(h)) hs.push(h);
        if (!as.includes(a)) as.push(a);
        out.set(g.no, [HL[hs.indexOf(h)] ?? "?", AL[as.indexOf(a)] ?? "?"]);
      }
      if (hs.length === fmt.players && as.length === fmt.players) return out;
    }
    // pořadí podle SŘ (u 4 hráčů ABCD, BCDA, CDAB, DABC proti XYZU)
    const out = new Map<number, [string, string]>();
    MatchFormats.slots(fmt).forEach((x, i) => { if ("h" in x) out.set(i + 1, [HL[x.h - 1], AL[x.a - 1]]); });
    return out;
  },
  /** Standardní točení dvouher (1-based [domácí, hosté]): v kole r hraje domácí (k+r) proti hostu k. */
  cyclicOrder(p: number): [number, number][] {
    return Array.from({ length: p }, (_, r) => Array.from({ length: p }, (_, k) => [((k + r) % p) + 1, k + 1] as [number, number])).flat();
  },
  /** Pořadí dvouher (1-based [domácí, hosté]) podle klíče ze zápisů soutěže, jinak podle SŘ. */
  singlesOrder(zs: Zapis[], fmt: MatchFormat): [number, number][] {
    const key = MatchFormats.singlesKey(zs, fmt);
    const order = Array.from(key.entries()).sort((a, b) => a[0] - b[0]).map(([, [h, a]]) => [HL.indexOf(h) + 1, AL.indexOf(a) + 1] as [number, number]);
    const ok = order.length === MatchFormats.singlesCount(fmt) && order.every(([h, a]) => h > 0 && a > 0)
      && new Set(order.map(([h, a]) => h * 10 + a)).size === order.length;
    return ok ? order : MatchFormats.defaultOrder(fmt);
  },
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
    /** kontumace (WO): do skóre se počítá, do predikcí, výkonu a STR ne */
    public wo = false,
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
  /** nejpravděpodobnější konečný výsledek [domácí, hosté] a jeho pravděpodobnost (u formátů bez cíle zaokrouhlený součet) */
  likely: [number, number]; likelyP: number;
  players: PlayerLive[]; finished: boolean; played: number;
}

const avgStr = (ps: LivePlayer[], fallback: number): number => {
  const s = ps.map((p) => p.str).filter((x): x is number => x != null);
  return s.length ? Math.trunc(avg(s)) : fallback;
};

/** Rozptyl „formy dne“ družstva v bodech STR (viz Live.evaluate). */
export const FORM_SIGMA = 50;
/** Uzly a váhy normálního rozdělení (Gauss–Hermite, 7 bodů) pro průměrování přes formu dne. */
const FORM_NODES: [number, number][] = (() => {
  const x = [-3.750439717725742, -2.366759410734541, -1.154405394739968, 0, 1.154405394739968, 2.366759410734541, 3.750439717725742];
  const w = [0.000548268855972, 0.030757123967586, 0.240123178605013, 0.457142857142857, 0.240123178605013, 0.030757123967586, 0.000548268855972];
  return x.map((v, i) => [v, w[i]] as [number, number]);
})();

export const Live = {
  fromZapis(z: Zapis, strOf: (id: string | null, name: string) => number | null,
    rangeOf: (id: string | null, name: string) => [number, number] | null = () => null): LiveGame[] {
    return z.games.map((gm) => {
      const side = (ids: string[], names: string[]) => names.map((n, i) => {
        const id = ids[i] ?? null;
        const r = rangeOf(id, n);
        return { ...lp(id, n, strOf(id, n)), strMin: r?.[0] ?? null, strMax: r?.[1] ?? null };
      });
      return new LiveGame(gm.no, side(gm.homeIds, gm.homeNames), side(gm.awayIds, gm.awayNames), gm.result, gm.sets, gm.homeSets, gm.awaySets, gm.wo);
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
    results: Map<number, number>, teamSize = 4, doublesCount = 2, order?: [number, number][] | null, format?: MatchFormat | null): LiveGame[] {
    const out: LiveGame[] = [];
    const r = (n: number) => results.get(n) ?? null;
    const fmt = format ?? MatchFormats.ALL.find((f) => f.players === teamSize && f.doubles === doublesCount && !f.seq?.startsWith("A"))
      ?? { key: "x", label: "", players: teamSize, games: teamSize * teamSize + doublesCount, doubles: doublesCount, target: null };
    // pořadí her podle formátu (SŘ), dvouhry případně podle klíče soutěže
    MatchFormats.slots(fmt, order).forEach((x, i) => {
      const no = i + 1;
      if ("d" in x) {
        const [hd, ad] = x.d === 1 ? [homeD1, awayD1] : [homeD2, awayD2];
        if (hd.length && ad.length) out.push(new LiveGame(no, hd, ad, r(no)));
      } else {
        const hp = homePos.get(x.h), ap = awayPos.get(x.a);
        if (hp && ap) out.push(new LiveGame(no, [hp], [ap], r(no)));
      }
    });
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
      // kontumace: jako na STIS řádek „WO“ za každou stranu
      if (gm.wo) {
        for (const home of [true, false]) {
          const key = (home ? "H:" : "A:") + "WO";
          const p = map.get(key) ?? { id: null, name: "WO", home, singlesWon: 0, singlesLost: 0, doublesWon: 0, doublesLost: 0 };
          const q = { ...p };
          if ((r === 1) === home) q.singlesWon++; else q.singlesLost++;
          map.set(key, q);
        }
        continue;
      }
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
    const strH = games.map((x) => avgStr(x.home, fbHome)), strA = games.map((x) => avgStr(x.away, fbAway));
    const prior = games.map((_, i) => StrModel.winProbability(strH[i], strA[i]));
    // rozehrané hry: šance podle stavu na sety
    const probs = games.map((x, i) => (x.result == null ? Live.inGame(prior[i], x) : prior[i]));

    const home = games.filter((x) => x.result === 1).length;
    const away = games.filter((x) => x.result === -1).length;
    const target = format.target;
    const k = (h: number, a: number) => h * 1000 + a;
    const done = target != null && (home >= target || away >= target);
    // „Forma dne“: hry jednoho utkání nejsou nezávislé – celé družstvo může mít lepší/horší den a STR je jen odhad.
    // Výsledek utkání se proto průměruje přes posun STR domácích o δ ~ N(0, FORM_SIGMA); šance jednotlivých her zůstávají.
    let states = new Map<number, number>();
    for (const [z, wt] of FORM_NODES) {
      const d = z * FORM_SIGMA;
      let st = new Map<number, number>([[k(home, away), 1.0]]);
      if (!done) {
        games.forEach((gm, i) => {
          if (gm.result != null) return;
          const p = d === 0 ? probs[i] : Live.inGame(StrModel.winProbability(strH[i] + d, strA[i]), gm);
          const next = new Map<number, number>();
          for (const [key, pr] of st) {
            const h = Math.floor(key / 1000), a = key % 1000;
            if (target != null && (h >= target || a >= target)) { next.set(key, (next.get(key) ?? 0) + pr); continue; }
            next.set(k(h + 1, a), (next.get(k(h + 1, a)) ?? 0) + pr * p);
            next.set(k(h, a + 1), (next.get(k(h, a + 1)) ?? 0) + pr * (1 - p));
          }
          st = next;
        });
      }
      for (const [key, pr] of st) states.set(key, (states.get(key) ?? 0) + pr * wt);
    }
    let pw = 0, pd = 0, pl = 0, eh = 0, ea = 0;
    for (const [key, pr] of states) {
      const h = Math.floor(key / 1000), a = key % 1000;
      if (h > a) pw += pr; else if (h === a) pd += pr; else pl += pr;
      eh += h * pr; ea += a * pr;
    }
    // nejdřív nejpravděpodobnější výstup (výhra/remíza/prohra domácích), v něm nejpravděpodobnější skóre
    const outcome = pw >= pd && pw >= pl ? 1 : pl >= pd ? -1 : 0;
    let likely: [number, number] = [home, away], likelyP = 0;
    for (const [key, pr] of states) {
      const h = Math.floor(key / 1000), a = key % 1000;
      if (Math.sign(h - a) !== outcome) continue;
      if (pr > likelyP) { likelyP = pr; likely = [h, a]; }
    }
    if (target == null) { const t = Math.round(eh + ea), m = Math.max(0, Math.min(t, Math.round(eh))); likely = [m, t - m]; }

    const keys = new Map<string, PlayerLive>();
    games.forEach((gm, i) => {
      if (gm.doubles || gm.wo) return;
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
      games, gameProb: probs, home, away, pHomeWin: pw, pDraw: pd, pAwayWin: pl, expHome: eh, expAway: ea, likely, likelyP,
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
      if (gm.doubles || gm.wo) continue;
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

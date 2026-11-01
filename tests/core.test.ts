// Přepis tools/CoreTest.kt – stejné kontroly nad stejnými daty. Spuštění: bun tests/core.test.ts <fixtures> <json>
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Html } from "../src/core/html";
import { Json } from "../src/core/json";
import { Parsers } from "../src/core/parsers";
import { Clubs, Match, PlayerPage, Stis, RosterPlayer, Zapis, ZapisGame, teamRef, type TeamMembership } from "../src/core/models";
import { Stats, StrModel, sum } from "../src/core/stats";
import { StisRepository, type Fetcher } from "../src/core/repository";
import { matchForecast } from "../src/core/season";
import { Live, LiveGame, LiveTimeline, MatchFormats, lp } from "../src/core/live";
import { Search, Stability, roundScore } from "../src/core/search";
import { ldOf, ldtOf } from "../src/core/dates";
import { matchOdds, pointsRule, predictSeason } from "../src/core/season";

let failures = 0, passes = 0;
function check(name: string, cond: boolean, detail: () => string = () => "") {
  if (cond) passes++; else { failures++; console.log(`FAIL ${name} ${detail()}`); }
}
const toI = (v: any) => (v == null ? null : Math.trunc(v));
const J = (x: any) => JSON.stringify(x, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v));
const fake = (pages: Record<string, string>): Fetcher => ({ async get(p) { if (p in pages) return pages[p]; throw new Error("404 " + p); } });

const fixtures = process.argv[2] ?? "", jsonDir = process.argv[3] ?? "";
const haveFixtures = !!fixtures && existsSync(fixtures) && !!jsonDir && existsSync(jsonDir);

/** Bez skutečných stránek STIS (např. na GitHubu) použijeme umělého hráče se stejnou strukturou dat. */
function synthPlayer(): PlayerPage {
  const opps = [["17023", "Beneš Milan", "Sokol Skalice"], ["14121", "Petruška Jiří", "Sokol Skalice B"], ["5001", "Kraut Lumír", "ST Kozlovice"],
    ["5002", "Bulawa Jaroslav", "TTC Třinec"], ["5003", "Walek Adrian", "Sokol Dobrá"]];
  const matches: Match[] = [];
  let str = 1440, seq = 0;
  for (let i = 0; i < 60; i++) {
    const o = opps[i % opps.length];
    const oppStr = 1400 + ((i * 37) % 160);
    const won = (i * 7) % 5 < 3;
    const d = won ? StrModel.gainIfWin(str, oppStr) : StrModel.lossIfLose(str, oppStr);
    const after = Math.round(str + d);
    const season = i < 30 ? 2025 : 2026;
    const day = 1 + (i % 28), month = i < 30 ? 1 + Math.floor(i / 6) : 9 + Math.floor((i - 30) / 15);
    const dt = `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${i < 30 ? 2026 : 2026}`;
    matches.push(Match.of({ seq: seq++, season, dateText: dt, date: Parsers.date(dt), myTeam: "TTC Bystřice B", opponent: o[1], opponentId: o[0],
      opponentTeam: o[2], score: won ? (i % 2 ? "3:1" : "3:2") : (i % 2 ? "1:3" : "0:3"), zapisPath: `/zapis/x/utkani-${600000 + Math.floor(i / 3)}`,
      competition: "OS 1", strBefore: str, strAfter: after, oppStrBefore: oppStr, oppStrAfter: oppStr }));
    str = after;
  }
  matches.reverse().forEach((m, i) => (m.seq = i));
  const tm: TeamMembership = { name: "TTC Bystřice B", ref: teamRef("66625", "420802", 2026, "6723", "TTC Bystřice B"), category: "Muži", competition: "OS 1", singles: "5:4", doubles: "0:0", notOnRoster: false };
  return new PlayerPage("43944", "/hrac-43944/svaz-420802/rocnik-2026", "Šedivý Milan", 1968,
    [{ label: "2026/2027", year: 2026, club: "TTC Bystřice", clubPath: "/oddil-420802047/svaz-420802/rocnik-2026", singles: "5:4", doubles: "0:0", teams: [tm] }],
    [], { str, stabil: str, min: 1400, max: 1500, peak: 1500, peakDate: "1.1.2026", valuableWins: [] },
    matches.slice().reverse().map((m) => ({ date: m.date, dateText: m.dateText, str: m.strAfter, stabil: null, label: "" })), [], matches);
}

async function main() {
  let lastPage: PlayerPage | null = null;
  for (const fn of haveFixtures ? readdirSync(fixtures).filter((f) => f.startsWith("hrac-")).sort() : []) {
    const pid = fn.replace(/^hrac-/, "").replace(/\.html$/, "");
    const html = Html.decodeMixed(new Uint8Array(readFileSync(join(fixtures, fn))));
    const page = Parsers.player(html, `/hrac-${pid}/svaz-420802/rocnik-2026`)!;
    const orig = Json.parse(readFileSync(join(jsonDir, `${pid}.json`), "utf8")) as any;
    check(`${pid} jmeno`, page.name === orig.jmeno, () => `'${page.name}' vs '${orig.jmeno}'`);
    check(`${pid} rok`, page.birthYear === toI(orig.rok_narozeni));
    const os = orig.sezony as any[];
    check(`${pid} sezony`, page.seasons.length === os.length);
    page.seasons.forEach((a, i) => {
      const b = os[i];
      if (!b) return;
      check(`${pid} sezona ${a.label}`, a.label === b.sezona && a.club === b.oddil && a.singles === b.dvouhry && a.doubles === b.ctyrhry, () => `${J(a)} / ${J(b)}`);
      const bt = b.druzstva as any[];
      check(`${pid} druzstva ${a.label}`, a.teams.length === bt.length && a.teams.every((x, j) => {
        const y = bt[j];
        return x.name === y.nazev && x.category === y.kategorie && x.competition === y.soutez && x.singles === y.dvouhry && x.notOnRoster === y.neni_na_soupisce;
      }), () => `${J(a.teams)} / ${J(bt)}`);
      check(`${pid} clubPath`, a.clubPath === `/oddil-420802047/svaz-420802/rocnik-${a.year}`, () => `${a.clubPath}`);
      check(`${pid} teamRef`, a.teams.every((x) => x.ref?.id === "66625" && x.ref?.soutez === "6723"));
    });
    const ob = orig.bilance as any[];
    check(`${pid} bilance`, page.bilance.length === ob.length && page.bilance.every((x, j) => {
      const y = ob[j];
      return x.year === toI(y.rok) && x.team === y.druzstvo && x.success === y.uspesnost && x.str === toI(y.str);
    }));
    const st = orig.str;
    check(`${pid} str`, page.ster.str === toI(st.str) && page.ster.max === toI(st.max) && page.ster.peak === toI(st.nejvyssi) && page.ster.peakDate === st.nejvyssi_datum, () => J(page.ster));
    check(`${pid} stabil`, Math.abs((page.ster.stabil ?? 0) - st.stabil) < 0.01);
    const vw = st.nejcennejsi_vyhry as any[];
    check(`${pid} vyhry`, page.ster.valuableWins.length === vw.length && page.ster.valuableWins.every((x, j) => x.opponent === vw[j].souper && x.opponentId === vw[j].souper_id && x.competition === vw[j].soutez),
      () => `${page.ster.valuableWins.length} vs ${vw.length} ${J(page.ster.valuableWins[0])} / ${J(vw[0])}`);
    const og = orig.graf.body as any[][];
    check(`${pid} graf`, page.graph.length === og.length && page.graph.every((x, j) => x.dateText === og[j][0] && x.str === toI(og[j][1]) && x.label === og[j][3]));
    const ogs = orig.graf.sezony as any[];
    check(`${pid} graf sezony`, J(page.graphSeasons.map((s) => [s.year, s.from, s.to])) === J(ogs.map((s) => [toI(s.rok), toI(s.od), toI(s.do)])), () => `${J(page.graphSeasons)} vs ${J(ogs)}`);
    const oz = orig.zapasy as any[][];
    check(`${pid} zapasy pocet`, page.matches.length === oz.length, () => `${page.matches.length} vs ${oz.length}`);
    const bad = page.matches.find((x, j) => {
      const y = oz[j];
      return !(x.season === toI(y[0]) && x.dateText === y[1] && x.myTeam === y[2] && x.opponent === y[3] && x.opponentId === y[4] &&
        x.opponentTeam === y[5] && x.score === y[6] && x.zapisPath === y[7] && x.competition === y[8] &&
        x.strBefore === toI(y[9]) && x.strAfter === toI(y[10]) && x.oppStrBefore === toI(y[11]) && x.oppStrAfter === toI(y[12]));
    });
    check(`${pid} zapasy obsah`, bad == null, () => `${J(bad)} vs ${J(oz[page.matches.indexOf(bad!)])}`);
    lastPage = page;
  }

  // ---------- smíšené kódování
  const enc = new TextEncoder();
  const cp = new Uint8Array([0x44, 0x72, 0x75, 0x9e, 0x73, 0x74, 0x76, 0x61]); // "Družstva" ve windows-1250
  const mixed = new Uint8Array([...enc.encode("Sezóna "), ...cp, ...enc.encode(" Šedivý")]);
  check("decodeMixed", Html.decodeMixed(mixed) === "Sezóna Družstva Šedivý", () => Html.decodeMixed(mixed));

  // ---------- tabulka
  const inner = `{"tables":[{"data":[{"nazev":"TTC Bystřice B","id_oddil":"420802047","pocet":5,"vyhry":3,"remizy":1,"prohry":1,"vyhrbody":50,"prohrbody":40,"body":12},{"nazev":"Sokol Skalice","id_oddil":"1","pocet":5,"vyhry":1,"remizy":0,"prohry":4,"vyhrbody":30,"prohrbody":60,"body":7}]}]}`;
  const escaped = inner.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const tab = Parsers.tabulka(`<script>var initTabData = "${escaped}";</script>`);
  check("tabulka", tab.length === 2 && tab[0].name === "TTC Bystřice B" && tab[0].points === 12 && tab[1].score === "30:60", () => J(tab));

  // ---------- soupisky
  const soup = `<table><tr><th colspan="7" class="head-dru" value="66625">TTC Bystřice B</th></tr>
        <tr class="c-dru"><td>1.</td><td><a href="/hrac-43944/svaz-420802/rocnik-2026">Šedivý Milan</a></td><td>1968</td><td>kraj. muži 130,5</td><td>1445</td></tr>
        <tr class="c-dru"><td>2.</td><td><a href="/hrac-43946/svaz-420802/rocnik-2026">Bruk Tomáš</a></td><td>1975</td><td>nez</td><td>1501</td></tr>
        <tr><th colspan="7" class="head-dru" value="66769">Sokol Skalice</th></tr>
        <tr class="c-dru"><td>1.</td><td><a href="/hrac-14121/svaz-420802/rocnik-2026">Petruška Jiří</a></td><td>1960</td><td>nez</td><td>1568</td></tr></table>`;
  const sp = Parsers.soupisky(soup, "420802", 2026, "6723");
  check("soupisky", sp.length === 2 && sp[0].players.length === 2 && sp[0].players[1].str === 1501 && sp[1].players[0].id === "14121" && sp[1].team?.id === "66769", () => J(sp));

  // ---------- žebříček družstva
  const team = `<h5>Žebříček družstva</h5><table class="table"><thead><tr><th>Pořadí</th><th>Hráč</th><th>Nar.</th><th>Žebříček</th><th>STR</th><th>STR+-</th><th>Bilance</th><th>Zápasy</th></tr></thead>
        <tbody><tr><td>1</td><td><a href="/hrac-1/svaz-420502/rocnik-2020">Neumann Jan</a></td><td>1956</td><td>kraj. muži 130,5</td><td>1598</td><td>-4</td><td>7:3</td><td>0/8/418</td></tr>
        <tr><td>2</td><td><a href="/hrac-2/svaz-420502/rocnik-2020">Phanthe Dung</a></td><td>1963</td><td>kraj. muži 170,5</td><td>1529</td><td>12</td><td>2:5</td><td>0/0/456</td></tr>
        <tr><td>6</td><td>Thanh Mai Van</td><td>1989</td><td>kraj. muži nez</td><td></td><td>0</td><td>0:0</td><td>0/0/0</td></tr></tbody></table>`;
  const tr = Parsers.teamRoster(team, teamRef("43771", "420502", 2020, "4296", "Test A"));
  check("teamRoster", tr.players.length === 3 && tr.players[0].str === 1598 && tr.players[0].strChange === -4 && tr.players[1].wins === 2 && tr.players[2].str == null && tr.players[0].id === "1", () => J(tr.players));

  // ---------- rozpis
  const los = `<table class="table los table-sm"><thead><tr><th>Kolo</th></tr></thead><tbody>
        <tr><td>5.</td><td>23.10.2026 18:00</td><td><a href="/druzstvo-66769/svaz-420802/rocnik-2026/soutez-6723">Sokol Skalice</a></td><td><a href="/druzstvo-66625/svaz-420802/rocnik-2026/soutez-6723">TTC Bystřice B</a></td><td><a class="vysledek" poznamka="&lt;b&gt;Výsledek:&lt;/b&gt; 9:9" href="/zapis/svaz-420802/rocnik-2026/soutez-6723/utkani-672291">9:9</a></td></tr>
        <tr><td>6.</td><td>06.11.2026 17:30</td><td><a href="/druzstvo-66625/svaz-420802/rocnik-2026/soutez-6723">TTC Bystřice B</a></td><td><a href="/druzstvo-66770/svaz-420802/rocnik-2026/soutez-6723">TJ Sokol Dobrá</a></td><td></td></tr>
        </tbody></table>`;
  const lm = Parsers.los(los, "420802", 2026, "6723");
  check("los", lm.length === 2 && lm[0].played && lm[0].score === "9:9" && lm[0].zapisPath.endsWith("utkani-672291") && !lm[1].played && lm[1].awayRef?.id === "66770", () => J(lm));
  const nm = Stats.nextMatch(lm, ldtOf(2026, 10, 30, 12, 0));
  check("nextMatch", nm?.round === "6", () => J(nm));
  check("isHome", Stats.isHome(nm!, teamRef("66625", "420802", 2026, "6723", "TTC Bystřice B"), "TTC Bystřice B"));
  check("dateTime", nm!.dateTime === ldtOf(2026, 11, 6, 17, 30));

  // ---------- oddíl
  const clubHtml = `<title>STIS - oddíl</title><div class="card-header">TTC Bystřice</div>
        <a href="/druzstvo-66623/svaz-420802/rocnik-2026/soutez-6722">TTC Bystřice</a> <a href="/druzstvo-66625/svaz-420802/rocnik-2026/soutez-6723">TTC Bystřice B</a>
        <a href="/druzstvo-66625/svaz-420802/rocnik-2026/soutez-6723"></a>`;
  const club = Parsers.club(clubHtml, "420802047");
  check("club", club.name === "TTC Bystřice" && club.teams.length === 2 && club.teams[1].name === "TTC Bystřice B", () => J(club));

  // ---------- odkazy a kluby
  check("normalize url", J(Stis.normalizeInput("https://stis.ping-pong.cz/hrac-79858/svaz-420705/rocnik-2022/soutez-5077#google_vignette")) ===
    J({ kind: "player", path: "/hrac-79858/svaz-420705/rocnik-2022/soutez-5077", id: "79858" }));
  check("normalize id", J(Stis.normalizeInput("79858")) === J({ kind: "player", path: "/hrac-79858", id: "79858" }));
  const no = Stis.normalizeInput("stis.ping-pong.cz/oddil-420802047/svaz-420802/rocnik-2026");
  check("normalize oddil", no?.kind === "club" && no.id === "420802047");
  const nt = Stis.normalizeInput("/druzstvo-66625/svaz-420802/rocnik-2026/soutez-6723");
  check("normalize team", nt?.kind === "team" && nt.ref.soutez === "6723");
  check("clubName B", Clubs.clubName("TTC Bystřice B") === "TTC Bystřice");
  check("clubName A", Clubs.clubName("Sokol Skalice") === "Sokol Skalice");
  check("clubName C", Clubs.clubName("SKST Frýdek-Místek C") === "SKST Frýdek-Místek");
  check("rocnik", Stis.currentRocnik(ldOf(2026, 10, 30)!) === 2026 && Stis.currentRocnik(ldOf(2027, 3, 1)!) === 2026);
  check("fold", Stats.fold("Bystřice") === "bystrice");

  // ---------- zápis
  const zap = `<table class="zapis_H"><tr><td>Název soutěže: <b><a href="#">OS 1</a></b> Kolo: <b>5</b></td></tr>
      <tr><td>POŘÁDAJÍCÍ</td><td><a href="/druzstvo-66769/x">Sokol Skalice</a></td><td>HOSTUJÍCÍ</td><td><a href="/druzstvo-66625/x">TTC Bystřice B</a></td></tr>
      <tr><td>9</td><td>:</td><td>9</td><td>33</td><td>:</td><td>34</td><td>632</td><td>:</td><td>640</td><td>x</td></tr></table>
      <table class="zapis"><tr><td>5.</td><td><a data-id="17023" href="#">Beneš Milan</a></td><td>-</td><td><a data-id="43944" href="#">Šedivý Milan</a></td><td></td><td>-9</td><td>-10</td><td>7</td><td>12</td><td>8</td><td>3</td><td>2</td><td>2</td><td>3</td></tr></table>`;
  const z = Parsers.zapis(zap, "/zapis/1")!;
  check("zapis", z.home === "Sokol Skalice" && z.awayTeamId === "66625" && J(z.points) === J([9, 9]) && z.games.length === 1 && J(z.games[0].sets) === J([-9, -10, 7, 12, 8]), () => J(z));
  const ss = Stats.setStats([z], "43944");
  check("setStats", ss.sets === 5 && ss.setsWon === 2 && ss.deuce === 2 && ss.deuceWon === 1 && ss.deciding === 1 && ss.decidingWon === 0, () => J(ss));

  // ---------- statistiky na skutečných datech
  if (!haveFixtures) console.log("Bez stránek STIS (fixtures) – parser hráče se netestuje, statistiky běží na umělém hráči.");
  const p = lastPage ?? synthPlayer();
  const rec = Stats.records(p);
  console.log(`Hráč ${p.name}: STR ${p.currentStr}, zápasů ${rec.totalMatches} (${rec.wins}–${rec.losses})`);
  console.log(`  nejdelší série výher ${rec.longestWin.length}, proher ${rec.longestLoss.length}, aktuální ${rec.currentStreak}`);
  console.log(`  největší skalp ${rec.biggestScalp?.opponent} ${rec.biggestScalp?.oppStrBefore}, překvapení ${rec.biggestUpset?.opponent}`);
  console.log(`  nejlepší sezóna ${rec.bestSeason?.label} ${rec.bestSeason ? Stats.pct(rec.bestSeason.success) : ""}, odznaky ${rec.badges.map((b) => b.title)}`);
  console.log(`  nejčastější soupeř ${rec.mostPlayed?.name} ${rec.mostPlayed?.record}, postrach ${rec.nemesis?.name} ${rec.nemesis?.record}`);
  check("records", rec.totalMatches === p.chronological.length && rec.wins + rec.losses === rec.totalMatches);
  const clubs = Stats.clubs(p);
  console.log(`  kluby soupeřů: ${clubs.length}, top: ${clubs.slice(0, 3).map((c) => `${c.club} ${c.wins}–${c.losses} (${c.opponents.length} hráčů)`)}`);
  check("clubs sum", sum(clubs.map((c) => c.matches)) === p.chronological.length);
  check("search diacritics", Stats.searchClubs(p, "skalice").length > 0);
  const today = ldOf(2026, 10, 30)!;
  const n = Stats.estimateRemaining(p, 13, today);
  const fc = Stats.forecast(p, n, ldOf(2027, 4, 30)!, today)!;
  console.log(`  predikce: dnes ${fc.current}, konec sezóny ${fc.center.toFixed(0)} (80 %: ${fc.low.toFixed(0)}–${fc.high.toFixed(0)}), zbývá ~${fc.remainingMatches} zápasů`);
  check("forecast band", fc.low < fc.current && fc.high > fc.current && fc.path.length === 7);
  for (const s of Stats.splits(p.chronological)) console.log(`  ${s.label}: ${s.wins}–${s.losses}, oproti očekávání ${Stats.signed(s.overExpected)}`);
  const f = Stats.form(p);
  console.log(`  forma ${f.last.map((m) => (m.won ? "V" : "P"))}, výkon nad očekávání ${Stats.signed(f.overExpected)} z ${f.sample}`);

  // ---------- model STR
  let err = 0, cnt = 0;
  for (const m of p.chronological) {
    if (m.strBefore == null || m.oppStrBefore == null || m.delta == null || Math.abs(m.delta) > 40) continue;
    const pred = m.won ? StrModel.gainIfWin(m.strBefore, m.oppStrBefore) : StrModel.lossIfLose(m.strBefore, m.oppStrBefore);
    err += Math.abs(pred - m.delta); cnt++;
  }
  console.log(`  model STR: průměrná odchylka ${(err / cnt).toFixed(2)} bodu na ${cnt} zápasech`);
  check("model accuracy", err / cnt < 1.5);

  // ---------- odhad změny STR za celé utkání (postupně hra po hře, se skutečným STR soupeřů) proti oficiální změně
  {
    const byZ = new Map<string, Match[]>();
    for (const m of p.chronological) if (m.zapisPath) { const l = byZ.get(m.zapisPath) ?? []; l.push(m); byZ.set(m.zapisPath, l); }
    let zn = 0, zexact = 0, zerr = 0;
    for (const ms of byZ.values()) {
      if (ms.some((m) => m.strBefore == null || m.strAfter == null || m.oppStrBefore == null || Math.abs(m.strAfter - m.strBefore) > 40)) continue;
      const start = ms[0].strBefore!, official = ms[ms.length - 1].strAfter! - start;
      const games = ms.map((m, i) => new LiveGame(i + 1, [lp(p.id, p.name, null)], [lp(m.opponentId, m.opponent, m.oppStrBefore)], m.won ? 1 : -1));
      const tl = LiveTimeline.timeline(games, p.id, p.name, start);
      const est = Math.round(tl[tl.length - 1].strAfter!) - start;
      zn++; if (est === official) zexact++; zerr += Math.abs(est - official);
    }
    console.log(`  odhad STR za utkání: ${zexact}/${zn} přesně, průměrná odchylka ${(zerr / Math.max(1, zn)).toFixed(2)} bodu`);
    check("utkání STR estimate", zn === 0 || zerr / zn < 2);
  }

  // ---------- kapitán
  const exp = Stats.expectedTeamScore([["A", 1500], ["B", 1450], ["C", 1400], ["D", 1350]], [1500, 1450, 1400, 1350]);
  check("team expectation symmetric", Math.abs(exp.my - 9.0) < 0.01 && exp.games === 18, () => J(exp));
  const lineup = Stats.suggestLineup(tr.players, 2);
  check("lineup", J(lineup.map((x) => x.name)) === J(["Neumann Jan", "Phanthe Dung"]));
  const lad = Stats.ladder([tr, sp[0]]);
  check("ladder", lad[0].name === "Neumann Jan" && lad.length === 5);

  // ---------- repository s falešným zdrojem
  const pages: Record<string, string> = {
    "/druzstvo-66625/svaz-420802/rocnik-2026/soutez-6723": team,
    "/los-vse/svaz-420802/rocnik-2026/soutez-6723/druzstvo-66625": los,
    "/druzstvo-66770/svaz-420802/rocnik-2026/soutez-6723": "<html>" + " ".repeat(3000) + "</html>",
    "/soupisky/svaz-420802/rocnik-2026/soutez-6723": soup.replace('66769">Sokol Skalice', '66770">TJ Sokol Dobrá'),
  };
  const repo = new StisRepository(fake(pages));
  const tm: TeamMembership = { name: "TTC Bystřice B", ref: teamRef("66625", "420802", 2026, "6723", "TTC Bystřice B"), category: "Muži", competition: "OS 1", singles: "1:1", doubles: "0:0", notOnRoster: false };
  const fakeMe = p.copy({ seasons: [{ ...p.seasons[0], year: 2026, teams: [tm] }] });
  const ctx = await repo.nextMatches(fakeMe, ldtOf(2026, 10, 30, 12, 0));
  check("repo next", ctx.length === 1 && ctx[0].next?.round === "6" && ctx[0].home && ctx[0].opponentName === "TJ Sokol Dobrá" && ctx[0].opponentRoster.length === 1 && ctx[0].myRoster.length === 3,
    () => J(ctx.map((c) => [c.next?.round, c.home, c.opponentName, c.opponentRoster.length, c.myRoster.length])));
  const sc = Stats.scout(p, ctx[0].opponentRoster);
  check("scout", sc.length === 1 && sc[0].winProb != null);

  // ---------- aktuální ročník v odkazech
  check("canonical player", Stis.canonicalPlayer("/hrac-79858/svaz-420705/rocnik-2022/soutez-5077", 2026) === "/hrac-79858/svaz-420705/rocnik-2026");
  check("canonical bare", Stis.canonicalPlayer("/hrac-79858", 2026) === "/hrac-79858");
  check("club rocnik", Stis.clubForRocnik("/oddil-420802047/svaz-420802/rocnik-2022", 2026) === "/oddil-420802047/svaz-420802/rocnik-2026");
  const asked: string[] = [];
  const fx = haveFixtures ? Html.decodeMixed(new Uint8Array(readFileSync(join(fixtures, "hrac-43944.html"))))
    : `<title>Šedivý Milan - STIS</title><div id="cardsbox"></div>` + " ".repeat(2100);
  const prepo = new StisRepository({ async get(path) { asked.push(path); if (path.includes("rocnik-2026")) throw new Error("x"); return fx; } });
  const pp = await prepo.player("/hrac-43944/svaz-420802/rocnik-2022/soutez-1");
  check("repo canonical fallback", pp != null && asked[0].endsWith("rocnik-" + Stis.currentRocnik()) && asked[asked.length - 1].endsWith("soutez-1"), () => J(asked));

  // ---------- zpřesnění žebříčku
  const ladRaw = Stats.ladder([tr]);
  const pagesById = new Map([["1", p.copy({ id: "1" })]]);
  const fresh = Stats.refreshLadder(ladRaw, pagesById, p, 2026);
  check("refresh ladder live", fresh.find((e) => e.id === "1")!.live && fresh.find((e) => e.id === "1")!.str === p.currentStr);
  check("refresh ladder adds me", fresh.some((e) => e.id === p.id) && fresh.length === ladRaw.length + 1, () => J(fresh.map((e) => e.name)));

  // ---------- živé utkání
  const hp = [lp("h1", "H1", 1500), lp("h2", "H2", 1450), lp("h3", "H3", 1400), lp("h4", "H4", 1350)];
  const ap = [lp("a1", "A1", 1500), lp("a2", "A2", 1450), lp("a3", "A3", 1400), lp("a4", "A4", 1350)];
  const E = new Map<number, number>();
  const games = Live.manualGames(hp, ap, hp.slice(0, 2), hp.slice(2), ap.slice(0, 2), ap.slice(2), E);
  check("manual 18 games", games.length === 18 && games.filter((x) => !x.doubles).length === 16, () => `${games.length}`);
  check("each pair once", new Set(games.filter((x) => !x.doubles).map((x) => x.home[0].id! + x.away[0].id)).size === 16);
  const st0 = Live.evaluate(games);
  check("live symmetric", Math.abs(st0.pHomeWin - st0.pAwayWin) < 1e-9 && st0.pDraw > 0.1 && Math.abs(st0.pHomeWin + st0.pDraw + st0.pAwayWin - 1) < 1e-9, () => `${st0.pHomeWin} ${st0.pDraw}`);
  const res = new Map(Array.from({ length: 10 }, (_, i) => [i + 1, 1] as [number, number]));
  const st1 = Live.evaluate(Live.manualGames(hp, ap, hp.slice(0, 2), hp.slice(2), ap.slice(0, 2), ap.slice(2), res));
  check("live decided", st1.home === 10 && st1.pHomeWin > 0.999, () => `${st1.home} ${st1.pHomeWin}`);
  check("live players", st0.players.length === 8 && st0.players.every((x) => x.singles === 4));
  const zl = Parsers.zapis(zap.replace("Kolo:", "online Kolo:"), "/z")!;
  check("zapis online flag", zl.online);
  const zn = Parsers.zapis('<table class="zapis_H"><tr><td>x</td></tr></table><table class="zapis"><tr><td>6.</td><td>Novák Jan</td><td>-</td><td>Dvořák Petr</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>', "/z")!;
  check("zapis no links", zn.games.length === 1 && J(zn.games[0].homeNames) === J(["Novák Jan"]) && zn.games[0].result == null, () => J(zn.games));
  const lg = Live.fromZapis(z, (id) => (id === "43944" ? 1445 : 1434));
  check("fromZapis", lg.length === 1 && lg[0].result === 1 && lg[0].away[0].str === 1445, () => J(lg));

  // ---------- automatické nalezení zápisu
  const losLive = los.replace("<td></td></tr>", '<td><a href="/zapis/svaz-420802/rocnik-2026/soutez-6723/utkani-700001" title="online">online</a></td></tr>');
  const zrepo = new StisRepository({ async get(path) { if (path.startsWith("/los-vse")) return losLive; throw new Error("404"); } });
  const lctx = { ...ctx[0], next: ctx[0].next!.copy({ zapisPath: "" }) };
  const fz = await zrepo.findZapis(lctx);
  check("findZapis los", fz === "/zapis/svaz-420802/rocnik-2026/soutez-6723/utkani-700001", () => `${fz}`);
  const other = "<table><tr><td>6.</td><td>TTC Bystřice B - TJ Sokol Dobrá</td><td><a href='https://stis.ping-pong.cz/zapis/x/utkani-700002'>zápis</a></td></tr></table>";
  check("zapis in rows", zrepo.zapisLinkInRows(other, "TTC Bystřice B", "TJ Sokol Dobrá") === "/zapis/x/utkani-700002");

  // ---------- průběžné STR
  const tgames = Live.manualGames(hp, ap, hp.slice(0, 2), hp.slice(2), ap.slice(0, 2), ap.slice(2), new Map([[3, 1], [7, -1]]));
  const tl = LiveTimeline.timeline(tgames, "h1", "H1", 1500);
  check("timeline count", tl.length === 4, () => `${tl.length}`);
  const firstDone = tl.find((x) => x.won != null)!;
  check("timeline first", firstDone.won === true && Math.abs(firstDone.strAfter! - firstDone.ifWin) < 1e-9 && firstDone.strBefore === 1500);
  check("timeline chain", tl.slice(1).every((y, i) => y.strBefore === (tl[i].strAfter ?? tl[i].strBefore)), () => J(tl.map((x) => [x.strBefore, x.strAfter])));
  check("timeline by name", LiveTimeline.timeline(tgames, null, "h1", 1500).length === 4);

  // ---------- ruční sestavy podle pozic
  const pos = (xs: typeof hp) => new Map(xs.map((x, i) => [i + 1, x] as [number, typeof x]));
  const pg = Live.manualByPosition(pos(hp), pos(ap), [hp[0], hp[1]], [hp[2], hp[3]], [ap[0], ap[1]], [ap[2], ap[3]], new Map([[3, 1]]));
  check("pos 18 games", pg.length === 18 && J(pg.map((x) => x.no)) === J(Array.from({ length: 18 }, (_, i) => i + 1)));
  check("pos pairs unique", new Set(pg.filter((x) => !x.doubles).map((x) => x.home[0].id! + x.away[0].id)).size === 16);
  check("pos first singles", pg[2].home[0].id === "h1" && pg[2].away[0].id === "a1" && pg[2].result === 1 && pg[6].home[0].id === "h1" && pg[6].away[0].id === "a2");
  const partial = Live.manualByPosition(new Map([[1, hp[0]], [2, hp[1]]]), pos(ap), [], [], [], [], E);
  check("pos partial keeps numbers", partial.length === 8 && partial[0].no === 3, () => J(partial.map((x) => x.no)));

  // ---------- formáty
  const f18 = MatchFormats.of("18_10");
  const win10 = new Map(Array.from({ length: 10 }, (_, i) => [i + 3, 1] as [number, number]));
  const g10 = Live.manualByPosition(pos(hp), pos(ap), [hp[0], hp[1]], [hp[2], hp[3]], [ap[0], ap[1]], [ap[2], ap[3]], win10);
  const s10 = Live.evaluate(g10, f18);
  check("finished at 10", s10.finished && s10.home === 10 && s10.pHomeWin > 0.999 && Math.abs(s10.expHome - 10.0) < 1e-9, () => `${s10.finished} ${s10.expHome}`);
  const sAll = Live.evaluate(g10, MatchFormats.of("18_all"));
  check("all games not finished", !sAll.finished && sAll.expHome > 10.0);
  const s0 = Live.evaluate(Live.manualByPosition(pos(hp), pos(ap), [hp[0], hp[1]], [hp[2], hp[3]], [ap[0], ap[1]], [ap[2], ap[3]], E), f18);
  check("target keeps symmetry", Math.abs(s0.pHomeWin - s0.pAwayWin) < 1e-9 && s0.expHome < 9.0 + 1e-9, () => `${s0.pHomeWin} ${s0.pAwayWin} ${s0.expHome}`);
  const g3 = Live.manualByPosition(pos(hp.slice(0, 3)), pos(ap.slice(0, 3)), [hp[0], hp[1]], [], [ap[0], ap[1]], [], E, 3, 1);
  check("3-player format", g3.length === 10 && g3.filter((x) => x.doubles).length === 1 && new Set(g3.filter((x) => !x.doubles).map((x) => x.home[0].id! + x.away[0].id)).size === 9, () => `${g3.length}`);
  const ps = Live.playerStats(z);
  check("zapis player stats", ps.length === 2 && ps.find((x) => !x.home)!.singlesLost === 1 && ps.find((x) => x.home)!.singlesWon === 1, () => J(ps));
  const z18 = z.copy({ games: Array.from({ length: 18 }, (_, i) => z.games[0].copy({ no: i + 1 })) });
  check("rozehraný zápis není konec", !Live.isZapisFinished(z.copy({ points: [1, 0] }), MatchFormats.of("18_all")) && !Live.isZapisFinished(z.copy({ points: [1, 0] }), f18));
  check("zapis finished", Live.isZapisFinished(z18, MatchFormats.of("18_all")) &&
    !Live.isZapisFinished(z.copy({ points: [9, 8], games: [...z.games, z.games[0].copy({ homeSets: null, awaySets: null })] }), f18));

  // ---------- vyhledávání
  const hled = `<h2>VÝSLEDKY HLEDÁNÍ</h2><h3>HRÁČI:</h3>
      <a href="/hrac-111/svaz-420305/rocnik-2026"><b>Novák Zdeněk</b>(1963)</a>, TTC Libín Prachatice z.s. ( <b>STR</b> : 1417, <b>STR</b><sub>stabil</sub> : 1420,4 ) <a href="/graf/111">g</a><br>
      <a href="/hrac-222/svaz-420305/rocnik-2026"><b>Novák Václav</b></a>(1978), SPORT PRO VŠECHNY Strunkovice nad Blanicí ( STR : 1159, STRstabil : 1160,5 )<br>
      <a href="/hrac-333"><b>Novák Václav</b>(2016)</a>, TJ Sokol Hospříz, z.s. ( STR : 0, STRstabil : 0,0 )<br>
      <h3>ODDÍLY:</h3><a href="/oddil-420104012/svaz-420104/rocnik-2026">TJ Vlast Ježov</a><br>`;
  const sp1 = Search.players(hled);
  check("search players", sp1.length === 3 && sp1[0].name === "Novák Zdeněk" && sp1[0].birthYear === 1963 && sp1[0].club === "TTC Libín Prachatice z.s." && sp1[0].str === 1417, () => J(sp1));
  check("search players 2", sp1[1].birthYear === 1978 && sp1[1].club === "SPORT PRO VŠECHNY Strunkovice nad Blanicí" && sp1[1].str === 1159 && sp1[2].club === "TJ Sokol Hospříz, z.s.", () => J(sp1.slice(1)));
  check("search label", sp1[2].label === "Novák Václav (2016) · TJ Sokol Hospříz, z.s.", () => sp1[2].label);
  const sc1 = Search.clubs(hled);
  check("search clubs", sc1.length === 1 && sc1[0].name === "TJ Vlast Ježov" && sc1[0].id === "420104012");
  check("search path", Search.playersPath("Novák Jan") === "/hledat?soso=on&s=Novak+Jan" && Search.clubsPath("Ježov") === "/hledat?sklu=on&s=Jezov", () => Search.playersPath("Novák Jan"));

  // ---------- stabilní sestava
  check("stable", Stability.isStable(3, 9, 0, 0) && !Stability.isStable(2, 9, 0, 0) && Stability.isStable(1, 2, 0, 0) && !Stability.isStable(0, 2, 5, 18) && Stability.isStable(0, 2, 6, 18));
  const rp = ([["A", 1600], ["B", 1500], ["C", 1400], ["D", 1300], ["E", 1700]] as [string, number][]).map(([nm, s]) => new RosterPlayer(nm, null, nm, null, null, null, s, 0, null, "T", null));
  const ut: Record<string, number> = { A: 2, D: 5, E: 1 };
  const lu = Stability.lineup(rp, 4, (x) => x.name === "B" || x.name === "C", (x) => ut[x.name] ?? 0);
  check("stable lineup", J(lu.map((x) => x[0].name)) === J(["B", "C", "D", "A"]) && J(lu.map((x) => x[1])) === J([false, false, true, true]), () => J(lu.map((x) => [x[0].name, x[1]])));
  check("round score", J(roundScore(9.5, 8.5)) === J([10, 8]) && J(roundScore(10.2, 7.8)) === J([10, 8]) && J(roundScore(4.4, 4.6)) === J([4, 5]));
  check("utkani", Stability.utkani(p, p.matches[0].myTeam, p.matches[0].season) >= 1);

  // ---------- skóre zápisu z her (souhrn STIS zaostává)
  const zg = (no: number, home: boolean) => new ZapisGame(no, ["1"], ["2"], ["A"], ["B"], [], home ? 3 : 0, home ? 0 : 3);
  const games18 = Array.from({ length: 18 }, (_, i) => zg(i + 1, i < 8));
  const zs = new Zapis("/z", "", "", "H", "A", null, null, "", "", [7, 10], games18);
  const zk = new Zapis("/z", "", "", "H", "A", null, null, "", "", [10, 0], [zg(1, true)]);
  check("zapis score", J(zs.score) === J([8, 10]) && J(zk.score) === J([10, 0]), () => J(zs.score));
  // ---------- nejpravděpodobnější výsledek je platný konečný stav (do 10)
  {
    const f = matchForecast([1500, 1480, 1450, 1400], [1550, 1530, 1500, 1460], MatchFormats.DEFAULT);
    const [h, a] = f.likely;
    check("likely platný", (h === 10 && a < 10) || (a === 10 && h < 10) || (h === 9 && a === 9), () => `${h}:${a}`);
    const out = f.pWin >= f.pDraw && f.pWin >= f.pLoss ? 1 : f.pLoss >= f.pDraw ? -1 : 0;
    check("likely v nejpravděpodobnějším výstupu", Math.sign(h - a) === out, () => `${h}:${a} ${f.pWin} ${f.pDraw} ${f.pLoss}`);
    const fe = matchForecast([1500, 1500, 1500, 1500], [1510, 1505, 1500, 1495], MatchFormats.DEFAULT);
    const oe = fe.pWin >= fe.pDraw && fe.pWin >= fe.pLoss ? 1 : fe.pLoss >= fe.pDraw ? -1 : 0;
    check("vyrovnané: skóre podle výstupu", Math.sign(fe.likely[0] - fe.likely[1]) === oe, () => J(fe));
    const fa = matchForecast([1500, 1480, 1450, 1400], [1550, 1530, 1500, 1460], MatchFormats.of("18_all"));
    check("likely všechny hry", fa.likely[0] + fa.likely[1] === 18, () => J(fa.likely));
  }
  // ---------- rozpoznání formátu ze zápisů
  {
    const gm = (no: number, home: boolean | null, dbl = false) => new ZapisGame(no, dbl ? ["1", "2"] : ["1"], dbl ? ["3", "4"] : ["3"], dbl ? ["A", "B"] : ["A"], dbl ? ["C", "D"] : ["C"],
      home == null ? [] : [5, 5, 5], home == null ? null : home ? 3 : 0, home == null ? null : home ? 0 : 3);
    const mk = (res: (boolean | null)[]) => new Zapis("/zapis/svaz-1/rocnik-2026/soutez-9/utkani-1", "", "", "H", "A", null, null, "", "", [null, null], res.map((r, i) => gm(i + 1, r, i < 2)));
    const early = mk([...Array(6).fill(false), ...Array(10).fill(true), null, null]); // 10:6, 10. bod 16. hrou, zbytek nehrán
    check("detect do 10", MatchFormats.detect([early])?.key === "18_10", () => J(MatchFormats.detect([early])));
    const all = mk([...Array(12).fill(true), ...Array(6).fill(false)]); // 12:6 – hrají se všechny
    check("detect všechny", MatchFormats.detect([all])?.key === "18_all", () => J(MatchFormats.detect([all])));
    const ten = new Zapis("/z", "", "", "H", "A", null, null, "", "", [null, null], [true, false, true, true, true, true, false, true, null, null].map((r, i) => gm(i + 1, r as boolean | null, i < 1)));
    const late = mk([...Array(8).fill(false), ...Array(10).fill(true)]); // 10:8 až poslední hrou – nerozhoduje
    const allFmt = mk([...Array(10).fill(true), ...Array(4).fill(false), true, false, true, false]); // po 10. bodu se hrálo dál
    const iLate = MatchFormats.detectInfo([late]), iAll = MatchFormats.detectInfo([late, allFmt]);
    check("detect nerozhodné / všechny", !iLate.certain && iAll.certain && iAll.fmt?.key === "18_all", () => J([iLate, iAll]));
    // jedno dohrání po 10. bodu (vedoucí už nebodoval) nesmí přebít soutěž do 10
    const weak = mk([...Array(6).fill(false), ...Array(10).fill(true), false, false]); // 10:8, po 10. bodu dohrány 2 hry
    const r1 = MatchFormats.detectInfo([early, weak]);
    check("detect slabé dohrání", r1.fmt?.key === "18_10" && r1.certain, () => J(r1));
    const capped = new Zapis("/z", "", "", "H", "A", null, null, "", "", [10, 6], [...Array(10).fill(true), ...Array(8).fill(false)].map((r, i) => gm(i + 1, r, i < 2)));
    check("detect hlavička 10:6 při dohrání", MatchFormats.detectInfo([capped]).fmt?.key === "18_10", () => J(MatchFormats.detectInfo([capped])));
    const strongAll = mk([...Array(12).fill(true), ...Array(6).fill(false)]);
    check("detect silné všechny", MatchFormats.detectInfo([strongAll, late]).fmt?.key === "18_all" && MatchFormats.detectInfo([strongAll]).certain);
    check("detect 10 her", MatchFormats.detect([ten])?.key === "10_6", () => J(MatchFormats.detect([ten])));
  }
  // ---------- šance rozehrané hry podle setů
  const q61 = Live.setProb(0.61);
  check("setProb", Math.abs(Live.fromSets(q61, 3, 3) - 0.61) < 1e-6 && Math.abs(Live.setProb(0.5) - 0.5) < 1e-6, () => String(q61));
  const g20 = new LiveGame(9, [], [], null, [5, 7], 2, 0), g02 = new LiveGame(9, [], [], null, [-5, -7], 0, 2);
  const p20 = Live.inGame(0.61, g20), p02 = Live.inGame(0.61, g02);
  check("inGame sety", p20 > 0.85 && p20 < 0.95 && p02 > 0.15 && p02 < 0.3 && Live.inGame(0.61, new LiveGame(9, [], [], null)) === 0.61, () => `${p20} ${p02}`);
  // ---------- přeskočení dohraného utkání
  const losToday = los.replace("06.11.2026 17:30", "30.10.2026 17:30").replace("</tbody>", '<tr><td>7.</td><td>13.11.2026 17:30</td><td><a href="/druzstvo-66771/svaz-420802/rocnik-2026/soutez-6723">TJ Další</a></td><td><a href="/druzstvo-66625/svaz-420802/rocnik-2026/soutez-6723">TTC Bystřice B</a></td><td></td></tr></tbody>');
  const frepo = new StisRepository({ async get(path) { if (path.startsWith("/los-vse")) return losToday; if (path in pages) return pages[path]; throw new Error("404"); } });
  const nowL = ldtOf(2026, 10, 30, 19, 0);
  const liveC = await frepo.nextMatches(fakeMe, nowL);
  const doneC = await frepo.nextMatches(fakeMe, nowL, new Set(["66625"]));
  const losScore = losToday.replace('TJ Sokol Dobrá</a></td><td></td>', 'TJ Sokol Dobrá</a></td><td>1:0</td>');
  const srepo = new StisRepository({ async get(path) { if (path.startsWith("/los-vse")) return losScore; if (path in pages) return pages[path]; throw new Error("404"); } });
  const final18 = (sc: string) => { const [h, a] = sc.split(":").map(Number); return h >= 10 || a >= 10 || h + a >= 18; };
  const runC = await srepo.nextMatches(fakeMe, nowL, new Set(), final18);
  check("live s průběžným stavem", runC[0].liveNow && runC[0].next?.round === "6" && runC[0].next?.played === true, () => `${runC[0].liveNow} ${runC[0].next?.round}`);
  const finC = await new StisRepository({ async get(path) { if (path.startsWith("/los-vse")) return losScore.replace(">1:0<", ">10:4<"); if (path in pages) return pages[path]; throw new Error("404"); } }).nextMatches(fakeMe, nowL, new Set(), final18);
  check("konečný výsledek v rozpisu = dohráno", !finC[0].liveNow && finC[0].next?.round === "7", () => `${finC[0].liveNow} ${finC[0].next?.round}`);
  check("live then next", liveC[0].liveNow && liveC[0].next?.round === "6" && !doneC[0].liveNow && doneC[0].next?.round === "7", () => `${liveC[0].next?.round} ${doneC[0].next?.round}`);

  // ---------- oficiální žebříček STR soutěže (dvě možné podoby stránky)
  const zr = (n: number, id: string, nm: string, z: string, str: number) =>
    `<tr><td>${n}.</td><td><a href="/hrac-${id}/svaz-420104/rocnik-2026">${nm}</a></td><td>1985</td><td>${z}</td><td>${str}</td><td>${str},4</td><td>+3</td></tr>`;
  const zh = `<tr><th>#</th><th>Hráč</th><th>Nar.</th><th>Zápasy</th><th><i class="x"></i>STR</th><th>STR<sub>stabil</sub></th><th>STR<sub>±</sub></th></tr>`;
  const zeb1 = `<h4>POŘADÍ STR - KSST JIHOMORAVSKÝ - K2C - 2026-2027</h4><table class="table">${zh}${zr(1, "1", "Horák Aleš", "11 (10:1)", 1808)}${zr(23, "79858", "Gramantik Peter (E)", "13 (5:8)", 1559)}</table>
    <h5>Hráči, kteří odehráli méně než 8 zápasů</h5><table class="table">${zh}${zr(1, "3", "Prchlík Filip", "4 (4:0)", 1858)}</table>
    <h5>Hráči, kteří odehráli méně než 4 zápasy</h5><table class="table">${zh}${zr(1, "4", "Konečný Filip", "3 (3:0)", 1721)}</table>`;
  const sl1 = Parsers.strLadder(zeb1);
  check("strLadder sekce", sl1.sections.length === 3 && sl1.sections[0].rows.length === 2 && sl1.sections[1].title.startsWith("Hráči, kteří odehráli méně než 8") && sl1.title.startsWith("POŘADÍ STR"), () => J(sl1));
  const g1 = sl1.sections[0].rows[1];
  check("strLadder řádek", g1.rank === 23 && g1.id === "79858" && g1.name === "Gramantik Peter" && g1.matches === 13 && g1.bilance === "5:8" && g1.str === 1559 && Math.abs((g1.stabil ?? 0) - 1559.4) < 1e-9 && g1.birthYear === 1985, () => J(g1));
  const zeb2 = `<table>${zh}${zr(1, "1", "Horák Aleš", "11 (10:1)", 1808)}<tr><th colspan="7">Hráči, kteří odehráli méně než 8 zápasů</th></tr>${zr(1, "3", "Prchlík Filip", "4 (4:0)", 1858)}</table>`;
  const sl2 = Parsers.strLadder(zeb2);
  check("strLadder v jedné tabulce", sl2.sections.length === 2 && sl2.sections[1].rows[0].str === 1858 && sl2.sections[0].title === "", () => J(sl2));

  // ---------- oficiální model změn STR (tabulka z popisu eSTeR)
  check("STR stejné", StrModel.gainIfWin(1500, 1500) === 6 && StrModel.lossIfLose(1500, 1500) === -6);
  check("STR favorit", StrModel.gainIfWin(1700, 1500) === 1 && StrModel.gainIfWin(1750, 1500) === 0 && StrModel.gainIfWin(1540, 1500) === 5 && StrModel.lossIfLose(1500, 1540) === -5);
  check("STR outsider", StrModel.gainIfWin(1500, 1700) === 12 && StrModel.lossIfLose(1700, 1500) === -12);

  // ---------- herna, vybavení a kontakt ze stránky družstva
  const dru = `<div class="card-body"><img src="x.png"><br><br><strong>Organizační pracovník:</strong><br>Kůřil Pavel ml.<br>
    <i class="fa fa-envelope"></i> koura <i class="fa fa-at"></i> email.cz<br><i class="fa fa-phone"></i> +420 722 210765<br><i class="fa fa-phone"></i> +420 722 210765<br><br>
    <strong>Kategorie:</strong> Muži<br><strong>Soutěž:</strong> Krajská soutěž II. třídy C<br><strong>Oddíl:</strong> TJ Vlast Ježov z.s.<br>
    <strong>Míčky:</strong><br>Joola Flash, plast, Bílá<br><strong>Stoly:</strong><br>Donic, Donic 25, Modrá<br><strong>Herna:</strong><br>Ježov 50,Tělocvična ZŠ<br>
    <strong>GPS herny:</strong> 49°1'29.956"N, 17°12'48.679"E</div>`;
  const ti = Parsers.teamInfo(dru);
  check("herna", ti.herna === "Ježov 50,Tělocvična ZŠ" && ti.balls === "Joola Flash, plast, Bílá" && ti.tables === "Donic, Donic 25, Modrá", () => J(ti));
  check("kontakt", ti.contactName === "Kůřil Pavel ml." && ti.email === "koura@email.cz" && ti.phones.length === 1 && ti.phones[0] === "+420 722 210765", () => J(ti));
  const ti2 = Parsers.teamInfo(dru.replace('koura <i class="fa fa-at"></i> email.cz', "koura (a) email.cz"));
  check("e-mail (a)", ti2.email === "koura@email.cz", () => J(ti2.email));
  check("e-mail [at]", Parsers.teamInfo(dru.replace('koura <i class="fa fa-at"></i> email.cz', "koura [at] email.cz")).email === "koura@email.cz");
  check("gps", !!ti.gps && Math.abs(ti.gps[0] - 49.02499) < 1e-4 && Math.abs(ti.gps[1] - 17.21352) < 1e-4, () => J(ti.gps));

  // ---------- predikce konečné tabulky
  const trows = Parsers.tabulka(`<script>var initTabData = "${escaped}";</script>`);
  check("body 3/2/1", J(pointsRule(trows)) === J([3, 2, 1]), () => J(pointsRule(trows)));
  const f18b = MatchFormats.of("18_10");
  const [pH, pD, pA] = matchOdds([1500, 1500, 1500, 1500], [1500, 1500, 1500, 1500], f18b);
  check("stejná družstva", Math.abs(pH - pA) < 1e-9 && Math.abs(pH + pD + pA - 1) < 1e-9);
  const strong = matchOdds([1700, 1650, 1600, 1600], [1400, 1380, 1350, 1300], f18b);
  check("silnější vyhraje", strong[0] > 0.95, () => J(strong));
  const steams = [
    { name: "A", points: 10, played: 4, wins: 3, draws: 1, losses: 0, diff: 20, lineup: [1600, 1580, 1550, 1500] },
    { name: "B", points: 9, played: 4, wins: 2, draws: 1, losses: 1, diff: 5, lineup: [1450, 1430, 1400, 1380] },
    { name: "C", points: 6, played: 4, wins: 0, draws: 2, losses: 2, diff: -25, lineup: [1300, 1280, 1250, 1200] },
  ];
  const pred = predictSeason(steams, [{ home: "A", away: "B" }, { home: "B", away: "C" }, { home: "C", away: "A" }], [3, 2, 1], f18b, 2000);
  check("predikce pořadí", pred.teams[0].name === "A" && pred.teams[2].name === "C" && Math.abs(pred.teams[0].posProb.reduce((a, b) => a + b, 0) - 1) < 1e-9 && pred.teams[0].remaining === 2, () => J(pred.teams));

  console.log(`\nTESTY: ${passes} OK, ${failures} chyb`);
  if (failures > 0) process.exit(1);
}
main();

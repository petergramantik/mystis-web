// Parsery stránek STIS (přepis Parsers.kt).
import { Html, rx, find, findAll, g, last, toIntLoose } from "./html";
import { Json, asList, asMap, asInt, asDouble, asStr, toIntOrNull, toDoubleOrNull } from "./json";
import { type LDate, type LDT, ldOf, ldAtTime } from "./dates";
import {
  Clubs, LosMatch, Match, PlayerPage, RosterPlayer, Stis, Zapis, ZapisGame, teamRef,
  type ClubPage, type GraphPoint, type TeamInfo, type StrLadder, type StrLadderRow, type StrLadderSection, type GraphSeason, type SeasonBilance, type SeasonCard, type StandingRow,
  type SterInfo, type TeamMembership, type TeamRef, type TeamRoster, type ValuableWin,
} from "./models";

const t = (s: string | null | undefined) => Html.text(s);
function num(s: string | null | undefined): number | null {
  if (s == null) return null;
  const x = s.replace(/,/g, ".").replace(/%/g, "").trim();
  const i = toIntOrNull(x);
  if (i != null) return i;
  const d = toDoubleOrNull(x);
  return d != null ? Math.trunc(d) : null;
}
const coerce = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const DATE_RX = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/;
const TIME_RX = /(\d{1,2}):(\d{2})/;

function jsVar(html: string, name: string): unknown {
  const m = find(rx(`var\\s+${name}\\s*=\\s*(\\[.*?\\]);`), html);
  if (!m) return undefined;
  return Json.parseOrNull(g(m, 1));
}

function bilanceIn(body: string, co: string): string | null {
  const m = find(rx(`Celková bilance ${co}:</strong>\\s*(?:<a[^>]*>)?\\s*(\\d+:\\d+)`), body);
  return m ? g(m, 1) : null;
}

function teamsIn(body: string): TeamMembership[] {
  const m = find(rx("Družstva \\(kat\\., soutěž - bil\\. dvouher, čtyřher\\):</strong><br\\s*/?>(.*?)</div>"), body);
  if (!m) return [];
  const out: TeamMembership[] = [];
  for (const item of g(m, 1).split(/<br\s*\/?>/)) {
    if (!item.trim()) continue;
    const nazev = find(rx('<a href="(/druzstvo-[^"]*)">(.*?)</a>'), item);
    const soutez = find(rx('<a href="/tabulka/[^"]*">(.*?)</a>'), item);
    const plain = item.replace(/<[^>]+>/g, "");
    const bil = Array.from(plain.matchAll(/(\d+:\d+)/g)).map((x) => x[0]);
    const name = nazev ? t(g(nazev, 2)) : t(item);
    const cat = /\(([^,]+),/.exec(t(item));
    out.push({
      name,
      ref: Stis.teamRef(nazev ? g(nazev, 1) : null, name),
      category: cat ? cat[1] : null,
      competition: soutez ? t(g(soutez, 1)) : null,
      singles: bil[0] ?? null,
      doubles: bil[1] ?? null,
      notOnRoster: item.includes("již není na soupisce"),
    });
  }
  return out;
}

const SCORE_RX = /^\d+\s*:\s*\d+$/;
function extractScore(cell: string): string {
  const segments = Array.from((">" + cell).matchAll(/>([^<>]*)(?=<|$)/g))
    .map((x) => Html.unescape(x[1]).trim()).filter((x) => x.length > 0);
  if (segments.length && SCORE_RX.test(segments[segments.length - 1])) return segments[segments.length - 1].replace(/\s+/g, "");
  const text = t(cell);
  if (text.length <= 12) return text;
  const src = segments.length ? segments[segments.length - 1] : text;
  const scores = Array.from(src.matchAll(/\d+\s*:\s*\d+/g)).map((x) => x[0]);
  return scores.length ? scores[scores.length - 1].replace(/\s+/g, "") : "";
}

export const Parsers = {
  date(s: string | null | undefined): LDate | null {
    if (s == null) return null;
    const m = DATE_RX.exec(s);
    if (!m) return null;
    return ldOf(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10));
  },

  dateTime(s: string | null | undefined): LDT | null {
    const d = Parsers.date(s);
    if (d == null) return null;
    const m = DATE_RX.exec(s!)!;
    const afterDate = s!.substring(m.index + m[0].length);
    const tm = TIME_RX.exec(afterDate);
    return tm ? ldAtTime(d, coerce(parseInt(tm[1], 10), 0, 23), coerce(parseInt(tm[2], 10), 0, 59)) : ldAtTime(d, 0, 0);
  },

  /** Krátká "brána" bez obsahu (STIS ji vrací bez ověřené session). */
  isGate(html: string): boolean { return html.length < 2000; },

  // ------------------------------------------------------------ hráč
  player(html: string, path: string): PlayerPage | null {
    if (!html.includes("cardsbox")) return null;
    const id = Stis.playerId(path) ?? "";
    const nm = find(rx('<div id="cardsbox">\\s*<div class="card mb-3">\\s*<div class="card-header">\\s*(.*?)\\s*</div>'), html);
    const name = nm ? t(g(nm, 1)) : (() => {
      const tt = t(Html.group(html, "<title>(.*?)</title>"));
      const i = tt.indexOf(" - ");
      return i >= 0 ? tt.substring(0, i) : tt;
    })();

    let birth: number | null = null;
    const seasons: SeasonCard[] = [];
    for (const m of findAll(rx('<div class="card-header">\\s*Sezóna (\\d{4}) - (\\d{4})\\s*</div>\\s*<div class="card-body">(.*?)<!--Karty hrace-->'), html)) {
      const body = g(m, 3);
      const bm = find(rx("<strong>Rok narození:</strong>\\s*(\\d{4})"), body);
      if (bm) birth = parseInt(g(bm, 1), 10);
      const oddil = find(rx("<strong>Oddíl:</strong>\\s*(?:<a\\b([^>]*)>)?(.*?)(?:</a>|<br)"), body);
      const hrefM = oddil ? /href=["']([^"']*)["']/.exec(g(oddil, 1)) : null;
      const oddilHref = hrefM ? hrefM[1] : null;
      const club = oddil ? t(g(oddil, 2)) : null;
      const cp = oddilHref != null ? Html.unescape(oddilHref).replace(Stis.BASE, "") : null;
      seasons.push({
        label: `${g(m, 1)}/${g(m, 2)}`,
        year: parseInt(g(m, 1), 10),
        club: club ? club : null,
        clubPath: cp ? cp : null,
        singles: bilanceIn(body, "dvouher"),
        doubles: bilanceIn(body, "čtyřher"),
        teams: teamsIn(body),
      });
    }

    const bilance: SeasonBilance[] = [];
    const tm = find(rx('<table class="bilance">(.*?)</table>'), html);
    if (tm) {
      for (const row of findAll(rx("<tr[^>]*>(.*?)</tr>"), g(tm, 1))) {
        const tds = findAll(rx("<td[^>]*>(.*?)</td>"), g(row, 1)).map((x) => t(g(x, 1)));
        if (tds.length !== 10 || toIntOrNull(tds[0]) == null) continue;
        bilance.push({
          year: toIntOrNull(tds[0])!, team: tds[1], competition: tds[2], pu: num(tds[3]), pz: num(tds[4]),
          wins: num(tds[5]), losses: num(tds[6]), success: tds[7], str: num(tds[8]), strChange: num(tds[9]),
        });
      }
    }

    let ster: SterInfo = { str: null, stabil: null, min: null, max: null, peak: null, peakDate: null, valuableWins: [] };
    const sm = find(rx("<div class='elostat_detail'>(.*?)</div>\\s*</div>\\s*</div>"), html);
    if (sm) {
      const b = g(sm, 1);
      const mm = find(rx("STR\\(min\\)\\.\\.\\.STR\\(max\\):\\s*(\\d+)\\.\\.\\.(\\d+)"), b);
      const pk = find(rx("Nejvyšší dosažené STR:\\s*(\\d+),\\s*([\\d.]+)"), b);
      const wins: ValuableWin[] = findAll(rx(
        'STR hráče:\\s*(\\d+), Soupeř: <strong><a href="/hrac-(\\d+)[^"]*">(.*?)</a></strong>, STR: <strong>(\\d+)</strong>, ' +
        "Výsledek:\\s*([\\d:]+),\\s*([\\d.]+),\\s*Soutěž:\\s*([^<]*?)\\s*(?=<|$)",
      ), b).map((x) => ({
        myStr: parseInt(g(x, 1), 10), opponentId: g(x, 2), opponent: t(g(x, 3)), opponentStr: parseInt(g(x, 4), 10),
        score: g(x, 5), date: g(x, 6), competition: t(g(x, 7)),
      }));
      const sv = find(rx("<b>STR:\\s*(\\d+)</b>"), b);
      const st = find(rx("STR\\(stabil\\):\\s*([\\d,]+)"), b);
      ster = {
        str: sv ? parseInt(g(sv, 1), 10) : null,
        stabil: st ? toDoubleOrNull(g(st, 1).replace(/,/g, ".")) : null,
        min: mm ? parseInt(g(mm, 1), 10) : null, max: mm ? parseInt(g(mm, 2), 10) : null,
        peak: pk ? parseInt(g(pk, 1), 10) : null, peakDate: pk ? g(pk, 2) : null,
        valuableWins: wins,
      };
    }

    const mydata = asList(jsVar(html, "mydata")) ?? [];
    const labels = asList(jsVar(html, "points_label")) ?? [];
    const graph: GraphPoint[] = mydata.map((d, i) => {
      const m = asMap(d) ?? {};
      const x = asStr(m["x"]) ?? "";
      return { date: Parsers.date(x), dateText: x, str: asInt(m["el"]), stabil: asDouble(m["st"]), label: asStr(labels[i]) ?? "" };
    });
    const graphSeasons: GraphSeason[] = [];
    for (const s of asList(jsVar(html, "seasons")) ?? []) {
      const m = asMap(s);
      if (!m) continue;
      const rok = asInt(m["rok"]);
      if (rok == null) continue;
      const end = m["end"];
      graphSeasons.push({ year: rok, from: asInt(m["start"]) ?? 0, to: typeof end === "number" ? Math.trunc(end) : graph.length });
    }

    const matches: Match[] = [];
    const z = find(rx('<table id="tbl_zapasy"(.*?)</table>'), html);
    if (z) {
      let seq = 0;
      for (const tb of findAll(rx('<tbody id="page_(\\d{4})"[^>]*>(.*?)</tbody>'), g(z, 1))) {
        const rok = parseInt(g(tb, 1), 10);
        for (const row of findAll(rx("<tr>(.*?)</tr>"), g(tb, 2))) {
          const tds = findAll(rx("<td[^>]*>(.*?)</td>"), g(row, 1)).map((x) => g(x, 1));
          if (tds.length < 5) continue;
          const dr = find(rx("<span class='smaller'>(.*?)</span>"), tds[0]);
          const sp = find(rx('<a href="(/hrac-(\\d+)[^"]*)">(.*?)</a>'), tds[1]);
          const spd = find(rx("<span class='smaller'>(.*?)(?:</span>|$)"), tds[1]);
          const vy = find(rx('<a href="(/zapis/[^"]*)">([^<]*)</a>'), tds[2]);
          const vyText = vy ? g(vy, 2) : t(tds[2].split("<br")[0]);
          const info = find(rx("<span class='smaller'>(.*?)<br>(.*?)</span>"), tds[2]);
          const strh = find(rx("(\\d+)->\\s*</span>\\s*(\\d+)"), tds[3]);
          const strs = find(rx("(\\d+)->\\s*</span>\\s*(\\d+)"), tds[4]);
          const dText = info ? t(g(info, 1)) : "";
          matches.push(Match.of({
            seq: seq++, season: rok, dateText: dText, date: Parsers.date(dText),
            myTeam: dr ? t(g(dr, 1)) : "",
            opponent: sp ? t(g(sp, 3)) : t(tds[1].split("<br")[0]),
            opponentId: sp ? g(sp, 2) : "",
            opponentPath: sp ? Html.unescape(g(sp, 1)) : "",
            opponentTeam: spd ? t(g(spd, 1)) : "",
            score: t(vyText).replace(/ /g, ""),
            zapisPath: vy ? g(vy, 1) : "",
            competition: info ? t(g(info, 2)) : "",
            strBefore: strh ? parseInt(g(strh, 1), 10) : null, strAfter: strh ? parseInt(g(strh, 2), 10) : null,
            oppStrBefore: strs ? parseInt(g(strs, 1), 10) : null, oppStrAfter: strs ? parseInt(g(strs, 2), 10) : null,
          }));
        }
      }
    }
    return new PlayerPage(id, path, name, birth, seasons, bilance, ster, graph, graphSeasons, matches);
  },

  // ------------------------------------------------------------ družstvo
  teamRoster(html: string, ref: TeamRef | null): TeamRoster {
    const teamName = (ref?.name || null) ?? (t(Html.group(html, "<h\\d[^>]*>(.*?)</h\\d>")) || "Družstvo");
    const players: RosterPlayer[] = [];
    for (const tab of Html.tables(html)) {
      const iName = tab.col("Hráč", "Jméno");
      const iStr = tab.col("STR");
      if (iName < 0 || iStr < 0) continue;
      const iOrder = tab.col("Pořadí", "#");
      const iBirth = tab.col("Nar.", "Narozen", "Rok");
      const iRank = tab.col("Žebříček");
      const iChange = tab.col("STR+-", "STR +-", "STR±");
      const iBil = tab.col("Bilance");
      const at = (cells: string[], i: number) => (i >= 0 && i < cells.length ? cells[i] : undefined);
      for (const cells of tab.rows) {
        const nameCell = at(cells, iName);
        if (nameCell == null) continue;
        const link = find(rx('<a[^>]*href="([^"]*/hrac-(\\d+)[^"]*)"'), nameCell);
        const name = t(nameCell);
        if (!name) continue;
        const bil = at(cells, iBil);
        const bilT = bil != null ? t(bil) : null;
        players.push(new RosterPlayer(
          link ? g(link, 2) : null, link ? g(link, 1) : null, name,
          at(cells, iOrder) != null ? toIntLoose(t(at(cells, iOrder))) : null,
          at(cells, iBirth) != null ? toIntLoose(t(at(cells, iBirth))) : null,
          at(cells, iRank) != null ? t(at(cells, iRank)) : null,
          at(cells, iStr) != null ? toIntLoose(t(at(cells, iStr))) : null,
          iChange >= 0 && iChange !== iStr && at(cells, iChange) != null ? toIntLoose(t(at(cells, iChange))) : null,
          bilT != null && bilT.includes(":") ? bilT : null,
          teamName, ref?.id ?? null,
        ));
      }
      if (players.length) break;
    }
    return { team: ref, name: teamName, players };
  },

  // ------------------------------------------------------------ soupisky soutěže
  soupisky(html: string, svaz: string, rocnik: number, soutez: string): TeamRoster[] {
    const out: TeamRoster[] = [];
    const head = rx('<tr>\\s*<th colspan="\\d+" class="head-dru" value="(\\d+)">(.*?)</th>\\s*</tr>(.*?)(?=<tr>\\s*<th colspan="\\d+" class="head-dru"|</table>|$)');
    for (const m of findAll(head, html)) {
      const teamId = g(m, 1);
      const teamName = t(g(m, 2)).replace(/\s*\(.*$/, "").trim();
      const ref = teamRef(teamId, svaz, rocnik, soutez, teamName);
      const players: RosterPlayer[] = [];
      for (const row of findAll(rx('<tr[^>]*class="[^"]*c-dru[^"]*"[^>]*>(.*?)</tr>'), g(m, 3))) {
        const rowHtml = g(row, 1);
        let texts = Html.cells(rowHtml).map((c) => t(c)).filter((x) => x.length > 0);
        if (!texts.length) texts = rowHtml.split("<td>").map((c) => t(c)).filter((x) => x.length > 0);
        if (texts.length < 4) continue;
        const link = find(rx('<a href="(/hrac-(\\d+)/[^"]*)"'), rowHtml);
        players.push(new RosterPlayer(
          link ? g(link, 2) : null, link ? g(link, 1) : null,
          texts[1], toIntLoose(texts[0]), toIntLoose(texts[2]), texts[3],
          texts[4] != null ? toIntLoose(texts[4]) : null, null, null, teamName, teamId,
        ));
      }
      out.push({ team: ref, name: teamName, players });
    }
    return out;
  },

  // ------------------------------------------------------------ rozpis (los-vse)
  los(html: string, svaz: string | null = null, rocnik: number | null = null, soutez: string | null = null): LosMatch[] {
    if (html.includes("Žádná utkání!")) return [];
    const tb = find(rx('<table class="table los.*?<tbody>(.*?)</tbody>'), html);
    if (!tb) return [];
    const out: LosMatch[] = [];
    for (const row of findAll(rx("<tr>(.*?)</tr>"), g(tb, 1))) {
      const rowHtml = g(row, 1);
      const cells = findAll(rx("<td\\b[^>]*>(.*?)</td>"), rowHtml).map((x) => g(x, 1));
      if (cells.length < 4) continue;
      const ref = (c: string): TeamRef | null => {
        const hm = find(rx('href="([^"]*druzstvo-[^"]*)"'), c);
        if (!hm) return null;
        const href = g(hm, 1);
        const r = Stis.teamRef(href, t(c));
        if (r) return r;
        const im = /druzstvo-(\d+)/.exec(href);
        if (!im) return null;
        return svaz != null && rocnik != null && soutez != null ? teamRef(im[1], svaz, rocnik, soutez, t(c)) : null;
      };
      const score = cells.length > 4 ? extractScore(cells[4]) : "";
      let zapis: string | null = null;
      if (cells.length > 4) {
        const zm = find(rx('href="([^"]*(?:utkani|zapis)[^"]*)"'), cells[4]);
        if (zm) zapis = g(zm, 1);
      }
      if (zapis == null) {
        const zm = find(rx('href="([^"]*(?:utkani-|/zapis/)[^"]*)"'), rowHtml);
        zapis = zm ? g(zm, 1) : "";
      }
      zapis = Html.unescape(zapis).replace(Stis.BASE, "");
      const dateText = t(cells[1]);
      out.push(new LosMatch(
        t(cells[0]).replace(/\.+$/, "").trim(), dateText, Parsers.dateTime(dateText),
        t(cells[2]), t(cells[3]), ref(cells[2]), ref(cells[3]), score, zapis,
      ));
    }
    return out;
  },

  // ------------------------------------------------------------ tabulka soutěže
  tabulka(html: string): StandingRow[] {
    const m = find(rx('var initTabData\\s*=\\s*"(.*?)";'), html);
    if (!m) return [];
    const inner = Json.parseOrNull('"' + g(m, 1) + '"');
    if (typeof inner !== "string") return [];
    const data = asMap(Json.parseOrNull(inner));
    if (!data) return [];
    const tables = asList(data["tables"]);
    if (!tables) return [];
    const rows = asList(asMap(tables[0])?.["data"]);
    if (!rows) return [];
    const out: StandingRow[] = [];
    rows.forEach((r, i) => {
      const x = asMap(r);
      if (!x) return;
      out.push({
        position: i + 1, name: asStr(x["nazev"]) ?? "",
        clubId: asStr(x["id_oddil"]),
        teamId: asStr(x["id_druzstvo"] ?? x["id_dru"] ?? x["druzstvo"] ?? x["id"]),
        played: asInt(x["pocet"]) ?? 0, wins: asInt(x["vyhry"]) ?? 0, draws: asInt(x["remizy"]) ?? 0,
        losses: asInt(x["prohry"]) ?? 0,
        score: `${asInt(x["vyhrbody"]) ?? 0}:${asInt(x["prohrbody"]) ?? 0}`,
        points: asInt(x["body"]) ?? 0,
      });
    });
    return out;
  },

  // ------------------------------------------------------------ oficiální žebříček STR soutěže
  /**
   * Stránka zebricekstr-soutez: tabulka (pořadí, hráč, rok narození, zápasy "11 (10:1)", STR, STR stabil…),
   * pod ní skupiny "Hráči, kteří odehráli méně než … zápasů". Sloupce hledáme podle hlaviček,
   * skupiny podle nadpisů mezi řádky (ať jsou v tabulce nebo mimo ni).
   */
  strLadder(html: string): StrLadder {
    const titleM = find(rx("(POŘADÍ STR[^<]*)"), html);
    const title = titleM ? t(g(titleM, 1)) : "";
    const heads = findAll(rx("(Hráči,\\s*kteří[^<]{0,120})"), html).map((m) => ({ pos: m.index, text: t(g(m, 1)) }));
    const rows = findAll(rx("<tr\\b[^>]*>(.*?)</tr>"), html);
    let cols = { rank: 0, name: 1, birth: 2, matches: 3, str: 4, stabil: 5 };
    const norm = (x: string) => t(x).replace(/[^\p{L}0-9.]/gu, "").toLowerCase();
    const sections: StrLadderSection[] = [];
    let cur: StrLadderSection | null = null;
    let headerRows = 0;
    const sectionFor = (pos: number) => {
      let h: string | null = null;
      for (const x of heads) if (x.pos < pos) h = x.text;
      return h ?? "";
    };
    for (const r of rows) {
      const body = g(r, 1);
      const cells = Html.cells(body);
      if (/<th\b/.test(body) && !/href=["'][^"']*\/hrac-/.test(body)) {
        const hs = cells.map(norm);
        const iName = hs.findIndex((h) => h.startsWith("hráč") || h.startsWith("jméno"));
        if (iName >= 0 && hs.length >= 3) {
          headerRows++;
          const at = (f: (h: string) => boolean, d: number) => { const i = hs.findIndex(f); return i >= 0 ? i : d; };
          cols = {
            rank: iName > 0 ? 0 : -1,
            name: iName,
            birth: at((h) => h.startsWith("nar") || h.startsWith("rok"), iName + 1),
            matches: at((h) => h.startsWith("zápas") || h.startsWith("utk"), iName + 2),
            str: at((h) => h === "str", iName + 3),
            stabil: at((h) => h.startsWith("strstab") || h.startsWith("stabil"), iName + 4),
          };
        }
        continue;
      }
      const link = find(rx("href=[\"']([^\"']*/hrac-(\\d+)[^\"']*)[\"']"), body);
      if (!link || cells.length < 4) continue;
      const c = (i: number) => (i >= 0 && i < cells.length ? t(cells[i]) : "");
      // jméno: buňka s odkazem na hráče (sloupce se mohou lišit)
      let nameIdx = cells.findIndex((x) => /\/hrac-\d+/.test(x));
      if (nameIdx < 0) nameIdx = cols.name;
      const shift = nameIdx - cols.name;
      const mt = c(cols.matches + shift);
      const mm = /^(\d+)\s*(?:\((\d+:\d+)\))?/.exec(mt);
      const row: StrLadderRow = {
        rank: toIntLoose(c(cols.rank >= 0 ? cols.rank + shift : -1)),
        id: g(link, 2), path: Html.unescape(g(link, 1)).replace(Stis.BASE, ""),
        name: t(cells[nameIdx]).replace(/\s*\((E|e)\)\s*$/, "").replace(/\s+E$/, "").trim(),
        birthYear: toIntLoose(c(cols.birth + shift)),
        matches: mm ? parseInt(mm[1], 10) : null, bilance: mm?.[2] ?? null,
        str: toIntLoose(c(cols.str + shift)),
        stabil: toDoubleOrNull(c(cols.stabil + shift).replace(",", ".")),
      };
      const sec = sectionFor(r.index);
      if (!cur || cur.title !== sec) { cur = { title: sec, rows: [] }; sections.push(cur); }
      cur.rows.push(row);
    }
    const n = sections.reduce((a, s) => a + s.rows.length, 0);
    return { title, sections, info: `stránka ${Math.round(html.length / 1024)} kB, hlaviček ${headerRows}, řádků ${rows.length}, hráčů ${n}, skupin ${heads.length}` };
  },

  // ------------------------------------------------------------ družstvo: herna, vybavení, kontakt
  /** Souřadnice "49°1'29.956"N, 17°12'48.679"E" nebo "49.0249, 17.2135" na desetinné stupně. */
  gps(s: string | null): [number, number] | null {
    if (!s) return null;
    const dms = /(\d+)\s*°\s*(\d+)\s*['’]\s*([\d.,]+)\s*(?:"|''|”)?\s*([NS])[\s,;]+(\d+)\s*°\s*(\d+)\s*['’]\s*([\d.,]+)\s*(?:"|''|”)?\s*([EW])/i.exec(s);
    if (dms) {
      const v = (d: string, m: string, x: string, h: string) => (parseInt(d, 10) + parseInt(m, 10) / 60 + parseFloat(x.replace(",", ".")) / 3600) * (/[SW]/i.test(h) ? -1 : 1);
      return [v(dms[1], dms[2], dms[3], dms[4]), v(dms[5], dms[6], dms[7], dms[8])];
    }
    const dec = /(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/.exec(s);
    return dec ? [parseFloat(dec[1]), parseFloat(dec[2])] : null;
  },

  teamInfo(html: string): TeamInfo {
    const prepared = html
      .replace(/<i\b[^>]*fa-at[^>]*>\s*<\/i>/gi, "@")
      .replace(/<i\b[^>]*>\s*<\/i>/gi, " ")
      .replace(/<br\s*\/?>|<\/(div|p|li|tr|h\d)>/gi, "\n");
    const lines = prepared.split("\n").map((l) => Html.text(l)).filter((l) => l.length > 0);
    const LABELS = ["Organizační pracovník:", "Kategorie:", "Soutěž:", "Oddíl:", "Míčky:", "Stoly:", "Herna:", "GPS herny:", "Soupiska", "Žebříček družstva"];
    const isLabel = (l: string) => LABELS.some((x) => l.startsWith(x));
    const value = (label: string): string | null => {
      const i = lines.findIndex((l) => l.startsWith(label));
      if (i < 0) return null;
      const rest = lines[i].substring(label.length).trim();
      if (rest) return rest;
      const next = lines[i + 1];
      return next && !isLabel(next) ? next : null;
    };
    let contactName: string | null = null, email: string | null = null;
    const phones: string[] = [];
    const oi = lines.findIndex((l) => l.startsWith("Organizační pracovník:"));
    if (oi >= 0) {
      const first = lines[oi].substring("Organizační pracovník:".length).trim();
      const block = [...(first ? [first] : []), ...lines.slice(oi + 1)];
      for (const l of block) {
        if (isLabel(l)) break;
        const at = l.replace(/\s*(\(a\)|\(at\)|\[at\]|\[a\]|\{at\}|@)\s*/i, "@");
        if (at.includes("@") && /\S+@\S+\.\S+/.test(at.replace(/\s+/g, ""))) { email ??= at.replace(/\s+/g, ""); continue; }
        const ph = l.replace(/[^\d+]/g, "");
        if (/^\+?\d{9,13}$/.test(ph)) { if (!phones.includes(l.trim())) phones.push(l.trim()); continue; }
        if (!contactName) contactName = l;
      }
    }
    const mail = /href=["']mailto:([^"'?]+)/i.exec(html);
    if (mail) email = Html.unescape(mail[1]);
    const gpsText = value("GPS herny:");
    return { herna: value("Herna:"), gps: Parsers.gps(gpsText), gpsText, balls: value("Míčky:"), tables: value("Stoly:"), contactName, email, phones };
  },

  // ------------------------------------------------------------ oddíl
  /** Názvy soutěží z odkazů na tabulky (<a href="/tabulka/svaz-S/rocnik-R/soutez-X">OS 1</a>). */
  compNames(html: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of html.matchAll(/<a[^>]*href="[^"]*\/tabulka\/svaz-(\d+)\/rocnik-(\d{4})\/soutez-(\d+)[^"]*"[^>]*>(.*?)<\/a>/gs)) {
      const name = t(m[4].replace(/<[^>]+>/g, ""));
      // obecné texty odkazů („Tabulka“, „zobrazit“, čísla, ikony) nejsou názvy soutěží
      if (!name || name.length > 60 || /^(tabulka|tabulky|zobrazit|detail|více|vice|»|›|>|\d+\.?)$/i.test(name)) continue;
      out[`${m[1]}|${m[2]}|${m[3]}`] = name;
    }
    return out;
  },
  club(html: string, id: string): ClubPage {
    const teams = new Map<string, TeamRef>();
    for (const [href, text] of Html.hrefs(html)) {
      const ref = Stis.teamRef(href, text);
      if (!ref) continue;
      if (!text.trim()) continue;
      const prev = teams.get(ref.id);
      if (prev == null || prev.name.length < text.length) teams.set(ref.id, { ...ref, name: text });
    }
    const title = t(Html.group(html, "<title>(.*?)</title>"));
    const cardHeader = t(Html.group(html, '<div class="card-header">\\s*(.*?)\\s*</div>'));
    const counts = new Map<string, number>();
    for (const r of teams.values()) { const c = Clubs.clubName(r.name); counts.set(c, (counts.get(c) ?? 0) + 1); }
    let fromTeams: string | null = null, best = -1;
    for (const [k, v] of counts) if (v > best) { best = v; fromTeams = k; }
    const strip = (s: string, p: string) => (s.startsWith(p) ? s.substring(p.length) : s);
    const name = [cardHeader, fromTeams ?? "", strip(strip(title, "STIS - "), "STIS")]
      .find((x) => x.trim().length > 0 && !x.startsWith("Sezóna")) ?? `Oddíl ${id}`;
    return { id, name: name.trim(), teams: Array.from(teams.values()), comps: Parsers.compNames(html) };
  },

  // ------------------------------------------------------------ zápis o utkání
  zapis(html: string, path: string): Zapis | null {
    const hm = find(rx('<table class="zapis_H">(.*?)</table>'), html);
    if (!hm) return null;
    const h = g(hm, 1);
    const rows = findAll(rx("<tr>(.*?)</tr>"), h).map((r) => findAll(rx("<t[dh][^>]*>(.*?)</t[dh]>"), g(r, 1)).map((x) => g(x, 1)));
    const after = (label: string): string => {
      for (const row of rows) for (let i = 0; i < row.length; i++) if (t(row[i]).startsWith(label) && i + 1 < row.length) return row[i + 1];
      return "";
    };
    const team = (cell: string): [string | null, string] => {
      const m = find(rx('<a href="/druzstvo-(\\d+)/[^"]*">(.*?)</a>'), cell);
      return m ? [g(m, 1), t(g(m, 2))] : [null, t(cell)];
    };
    const home = team(after("POŘÁDAJÍCÍ"));
    const away = team(after("HOSTUJÍCÍ"));
    let points: [number | null, number | null] = [null, null];
    for (const row of rows) {
      const tt = row.map((c) => t(c));
      if (tt.length >= 9 && tt[1] === ":" && tt[4] === ":" && tt[7] === ":") { points = [toIntOrNull(tt[0]), toIntOrNull(tt[2])]; break; }
    }
    const ids = (cell: string): [string, string][] => {
      const linked = findAll(rx('<a data-id="(\\d+)"[^>]*>(.*?)</a>'), cell).map((x) => [g(x, 1), t(g(x, 2))] as [string, string]);
      if (linked.length) return linked;
      return cell.split(/<br\s*\/?>/).map((x) => t(x)).filter((x) => x.length > 0 && x !== "-").map((x) => ["", x] as [string, string]);
    };
    const games: ZapisGame[] = [];
    const zm = find(rx('<table class="zapis">(.*?)</table>'), html);
    if (zm) {
      for (const r of findAll(rx("<tr>(.*?)</tr>"), g(zm, 1))) {
        const tds = findAll(rx("<td[^>]*>(.*?)</td\\s*>"), g(r, 1)).map((x) => g(x, 1));
        if (tds.length < 14 || !/^\s*\d+\./.test(t(tds[0]))) continue;
        const hp = ids(tds[1]), ap = ids(tds[3]);
        games.push(new ZapisGame(
          toIntOrNull(t(tds[0]).replace(/\.+$/, "")) ?? 0,
          hp.map((x) => x[0]).filter((x) => x), ap.map((x) => x[0]).filter((x) => x),
          hp.map((x) => x[1]), ap.map((x) => x[1]),
          tds.slice(5, 10).map((x) => toIntOrNull(t(x))).filter((x): x is number => x != null),
          toIntOrNull(t(tds[10])), toIntOrNull(t(tds[11])),
          tds.slice(5, 10).some((x) => /^\s*w\.?\s*o\.?\s*$/i.test(t(x))),
          tds.length > 13 ? toIntOrNull(t(tds[12])) : null, tds.length > 13 ? toIntOrNull(t(tds[13])) : null,
        ));
      }
    }
    const comp = find(rx("Název soutěže:\\s*<b>\\s*(?:<a[^>]*>)?(.*?)(?:</a>)?</b>"), h);
    const kolo = find(rx("Kolo:\\s*<b>\\s*(.*?)</b>"), h);
    return new Zapis(
      path, t(comp ? g(comp, 1) : null), t(kolo ? g(kolo, 1) : null),
      home[1], away[1], home[0], away[0],
      t(after("Datum dle rozpisu")), t(after("Hráno v místnosti")),
      points, games, h.toLowerCase().includes("online"),
    );
  },
};

export { last };

// Vyhledávání STIS, stabilní sestava a zaokrouhlení (přepis Search.kt).
import { Html, findAll, g, last } from "./html";
import { Stis, type PlayerPage, type RosterPlayer } from "./models";
import { Stats, distinct } from "./stats";

export class SearchPlayer {
  constructor(readonly id: string, readonly path: string, readonly name: string, readonly birthYear: number | null,
    readonly club: string, readonly str: number | null) {}
  get label(): string {
    return [
      this.name + (this.birthYear != null ? ` (${this.birthYear})` : ""),
      this.club.trim() ? this.club : null,
      this.str != null && this.str > 0 ? `STR ${this.str}` : null,
    ].filter((x) => x != null).join(" · ");
  }
}
export interface SearchClub { id: string; path: string; name: string }

const PLAYER_LINK = /<a\b[^>]*href=["']([^"']*\/hrac-(\d+)[^"']*)["'][^>]*>(.*?)<\/a>/gs;
const CLUB_LINK = /<a\b[^>]*href=["']([^"']*\/oddil-(\d+)[^"']*)["'][^>]*>(.*?)<\/a>/gs;

function encode(q: string): string {
  const plain = q.trim().normalize("NFD").replace(/\p{M}+/gu, "");
  // jako java.net.URLEncoder (mezera = +)
  return encodeURIComponent(plain).replace(/%20/g, "+").replace(/[!'()~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

const trimChars = (s: string, chars: string, start: boolean, end: boolean) => {
  let a = 0, b = s.length;
  if (start) while (a < b && chars.includes(s[a])) a++;
  if (end) while (b > a && chars.includes(s[b - 1])) b--;
  return s.substring(a, b);
};
const before = (s: string, d: string) => { const i = s.indexOf(d); return i >= 0 ? s.substring(0, i) : s; };

export const Search = {
  playersPath: (query: string) => "/hledat?soso=on&s=" + encode(query),
  clubsPath: (query: string) => "/hledat?sklu=on&s=" + encode(query),

  players(html: string): SearchPlayer[] {
    const links = findAll(PLAYER_LINK, html);
    const out = new Map<string, SearchPlayer>();
    links.forEach((m, i) => {
      const id = g(m, 2);
      if (out.has(id)) return;
      const end = i + 1 < links.length ? links[i + 1].index : Math.min(html.length, last(m) + 600);
      const after = html.substring(last(m) + 1, Math.max(last(m) + 1, end));
      const linkText = Html.text(g(m, 3));
      const window = Html.text(linkText + " " + before(after, "<a ").substring(0, 600));
      const ym = /\((\d{4})\)/.exec(window);
      const year = ym ? parseInt(ym[1], 10) : null;
      const name = linkText.replace(/\s*\(\d{4}\).*$/s, "").trim();
      if (!name) return;
      const ci = window.indexOf(")");
      const afterYear = trimChars(ci >= 0 ? window.substring(ci + 1) : "", ", ", true, false);
      const club = trimChars(before(before(afterYear, "( STR"), "(STR").trim(), ", ", false, true);
      const sm = /STR\s*:\s*(-?\d+)/.exec(window);
      const str = sm ? parseInt(sm[1], 10) : null;
      out.set(id, new SearchPlayer(id, Html.unescape(g(m, 1)).replace(Stis.BASE, ""), name, year, club, str));
    });
    return Array.from(out.values());
  },

  clubs(html: string): SearchClub[] {
    const out = new Map<string, SearchClub>();
    for (const m of findAll(CLUB_LINK, html)) {
      const name = Html.text(g(m, 3));
      if (!name.trim() || out.has(g(m, 2))) continue;
      out.set(g(m, 2), { id: g(m, 2), path: Html.unescape(g(m, 1)).replace(Stis.BASE, ""), name });
    }
    return Array.from(out.values());
  },
};

/** Účast hráče na utkáních družstva a "stabilní sestava". */
export const Stability = {
  utkani(page: PlayerPage, teamName: string, season: number): number {
    return distinct(page.matches.filter((m) => m.season === season && Stats.fold(m.myTeam) === Stats.fold(teamName))
      .map((m) => m.zapisPath || m.dateText)).length;
  },

  isStable(played: number, teamPlayed: number, lastPlayed: number, lastTeamPlayed: number): boolean {
    if (teamPlayed >= 3) return played * 3 >= teamPlayed;
    if (lastTeamPlayed >= 3) return lastPlayed * 3 >= lastTeamPlayed || (played >= 1 && played * 3 >= Math.max(1, teamPlayed));
    return played >= 1;
  },

  lineup(roster: RosterPlayer[], size: number, stable: (p: RosterPlayer) => boolean, utkani: (p: RosterPlayer) => number): [RosterPlayer, boolean][] {
    const sc = (p: RosterPlayer) => (p.str ?? 0) + 0.3 * (p.strChange ?? 0);
    const core: [RosterPlayer, boolean][] = roster.filter(stable).sort((a, b) => sc(b) - sc(a)).slice(0, size).map((p) => [p, false]);
    if (core.length >= size) return core;
    const subs: [RosterPlayer, boolean][] = roster.filter((p) => !core.some((c) => c[0] === p))
      .sort((a, b) => utkani(b) - utkani(a) || (b.str ?? 0) - (a.str ?? 0))
      .slice(0, size - core.length).map((p) => [p, true]);
    return [...core, ...subs];
  },
};

/** Zaokrouhlení očekávaného výsledku na celé body tak, aby součet seděl. */
export function roundScore(my: number, opp: number): [number, number] {
  const total = Math.round(my + opp);
  const m = Math.max(0, Math.min(total, Math.round(my)));
  return [m, total - m];
}

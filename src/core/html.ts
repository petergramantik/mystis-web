// Pomocné funkce pro HTML ze STIS (přepis Html.kt).

export type M = RegExpExecArray;

const cache = new Map<string, RegExp>();
/** Regex s DOT_MATCHES_ALL (jako Html.rx v Kotlinu). */
export function rx(pattern: string, flags = "s"): RegExp {
  const k = flags + "\u0000" + pattern;
  let r = cache.get(k);
  if (!r) { r = new RegExp(pattern, flags.includes("g") ? flags : flags + "g"); cache.set(k, r); }
  return r;
}
export function find(re: RegExp, s: string, from = 0): M | null {
  const r = re.global ? re : new RegExp(re.source, re.flags + "g");
  r.lastIndex = from;
  return r.exec(s);
}
export function findAll(re: RegExp, s: string): M[] {
  const r = re.global ? re : new RegExp(re.source, re.flags + "g");
  r.lastIndex = 0;
  const out: M[] = [];
  let m: M | null;
  while ((m = r.exec(s)) !== null) {
    out.push(m);
    if (m[0].length === 0) r.lastIndex++;
  }
  return out;
}
/** Hodnota skupiny jako v Kotlinu (nezachycená = ""). */
export function g(m: M | null | undefined, i: number): string {
  return (m && m[i]) ?? "";
}
export function last(m: M): number { return m.index + m[0].length - 1; }

const TAG = /<[^>]+>/g;
const BR = /<br\s*\/?>/gi;
const WS = /\s+/g;
const ENTITY = /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g;
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: " ", ndash: "–", mdash: "—", hellip: "…",
  raquo: "»", laquo: "«", bdquo: "„", ldquo: "“", rdquo: "”",
  times: "×", middot: "·", copy: "©",
};

export class HtmlTable {
  constructor(readonly attrs: string, readonly headers: string[], readonly rows: string[][], readonly position: number) {}
  col(...names: string[]): number {
    for (const n of names) {
      const idx = this.headers.findIndex((h) => h.toLowerCase() === n.toLowerCase());
      if (idx >= 0) return idx;
    }
    for (const n of names) {
      const idx = this.headers.findIndex((h) => h.toLowerCase().startsWith(n.toLowerCase()));
      if (idx >= 0) return idx;
    }
    return -1;
  }
}

let utf8: TextDecoder | null = null;
let cp1250: TextDecoder | null = null;

export const Html = {
  unescape(s: string): string {
    return s.replace(ENTITY, (whole, e: string) => {
      if (e.startsWith("#x")) {
        const n = parseInt(e.substring(2), 16);
        return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
      }
      if (e.startsWith("#")) {
        const n = parseInt(e.substring(1), 10);
        return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
      }
      return NAMED[e] ?? whole;
    });
  },

  /** Čitelný text z kusu HTML (bez značek, se sloučenými mezerami). */
  text(s: string | null | undefined): string {
    if (s == null) return "";
    const noBr = s.replace(BR, " ");
    return Html.unescape(noBr.replace(TAG, " ")).replace(WS, " ").trim();
  },

  group(html: string, pattern: string, gi = 1): string | null {
    const m = find(rx(pattern), html);
    return m ? g(m, gi) : null;
  },

  rows(tableHtml: string): string[] {
    return findAll(rx("<tr[^>]*>(.*?)</tr>"), tableHtml).map((m) => g(m, 1));
  },

  cells(rowHtml: string): string[] {
    return findAll(rx("<t[dh]\\b[^>]*>(.*?)</t[dh]\\s*>"), rowHtml).map((m) => g(m, 1));
  },

  hrefs(html: string): [string, string][] {
    return findAll(rx("<a\\b[^>]*href=[\"']([^\"']*)[\"'][^>]*>(.*?)</a>"), html)
      .map((m) => [Html.unescape(g(m, 1)), Html.text(g(m, 2))] as [string, string]);
  },

  tables(html: string): HtmlTable[] {
    return findAll(rx("<table\\b([^>]*)>(.*?)</table>"), html).map((m) => {
      const body = g(m, 2);
      const headers: string[] = [];
      const rows: string[][] = [];
      for (const r of Html.rows(body)) {
        if (/<th\b/.test(r) && !/<td\b/.test(r)) {
          if (headers.length === 0) headers.push(...Html.cells(r).map((c) => Html.text(c)));
        } else {
          const c = Html.cells(r);
          if (c.length) rows.push(c);
        }
      }
      return new HtmlTable(g(m, 1), headers, rows, m.index);
    });
  },

  /**
   * STIS míchá kódování: statické části jsou Windows-1250, data z databáze UTF-8.
   * Kde je platná UTF-8 sekvence (zkouší se 4, 3, 2 bajty), použije se, jinak cp1250 po bajtu.
   */
  decodeMixed(raw: Uint8Array): string {
    utf8 ??= new TextDecoder("utf-8", { fatal: true });
    cp1250 ??= new TextDecoder("windows-1250");
    const parts: string[] = [];
    let ascii = "";
    let i = 0;
    const n = raw.length;
    while (i < n) {
      const b = raw[i];
      if (b < 0x80) {
        // rychlá cesta pro ASCII úseky
        let j = i;
        while (j < n && raw[j] < 0x80) j++;
        for (let k = i; k < j; k += 8192) {
          ascii = String.fromCharCode.apply(null, Array.from(raw.subarray(k, Math.min(j, k + 8192))) as any);
          parts.push(ascii);
        }
        i = j;
        continue;
      }
      let matched = false;
      for (const len of [4, 3, 2]) {
        if (i + len <= n) {
          try {
            parts.push(utf8.decode(raw.subarray(i, i + len)));
            i += len;
            matched = true;
            break;
          } catch {
            // zkusíme kratší sekvenci
          }
        }
      }
      if (!matched) {
        parts.push(cp1250.decode(raw.subarray(i, i + 1)));
        i++;
      }
    }
    return parts.join("");
  },
};

export function toIntLoose(s: string): number | null {
  const t = s.replace(/[^0-9-]/g, "");
  if (!/^-?\d+$/.test(t)) return null;
  return parseInt(t, 10);
}

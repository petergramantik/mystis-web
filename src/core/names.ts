// Zkracování názvů družstev a jmen hráčů (hlavičky, seznamy, notifikace).

/** Zkrácený název družstva: TJ / SK / KST, „n. Mor.“, bez „z.s.“ a uvozovek. */
export function shortTeam(name: string): string {
  return name
    .replace(/Tělovýchovná jednota/gi, "TJ").replace(/Tělocvičná jednota/gi, "TJ")
    .replace(/Sportovní klub/gi, "SK").replace(/Klub stolního tenisu/gi, "KST")
    .replace(/\bnad Moravou\b/g, "n. Mor.").replace(/\bnad Labem\b/g, "n. L.").replace(/\bnad Vltavou\b/g, "n. Vlt.")
    .replace(/\bnad Odrou\b/g, "n. O.").replace(/\bpod Radhoštěm\b/g, "p. R.")
    .replace(/,?\s*z\.\s?s\.?/gi, "").replace(/["„“]/g, "")
    .replace(/\s{2,}/g, " ").trim();
}

/** Příjmení hráče (první slovo jména bez poznámek v závorce). */
export function surname(name: string): string {
  return name.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0] ?? name;
}

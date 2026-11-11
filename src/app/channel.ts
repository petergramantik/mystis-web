// Kanál sestavení: produkce (/) nebo vývojová verze (/dev/). Doplní build.sh (CHANNEL=dev ./build.sh).
declare const __CHANNEL__: string;
export const CHANNEL: "prod" | "dev" = typeof __CHANNEL__ !== "undefined" && __CHANNEL__ === "dev" ? "dev" : "prod";
export const IS_DEV = CHANNEL === "dev";
/** Předpona klíčů v localStorage / sessionStorage – dev a produkce běží na stejné doméně a nesmí si data přepisovat. */
export const SP = IS_DEV ? "mystis-dev." : "mystis.";
/** Název IndexedDB s mezipamětí stránek STIS. */
export const IDB = IS_DEV ? "mystis-dev" : "mystis";

/** Dev: převezme nastavení produkční verze (profil, oddíl, proxy, sledované…); vrací počet převzatých položek. */
export function copyProdSettings(): number {
  if (!IS_DEV) return 0;
  let n = 0;
  try {
    // nejdřív seznam klíčů – zápisem se mění pořadí localStorage.key(i)
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const k of keys) {
      if (!k || !k.startsWith("mystis.") || /^mystis\.(anon_|stats_key)/.test(k)) continue;
      localStorage.setItem(SP + k.slice("mystis.".length), localStorage.getItem(k) ?? "");
      n++;
    }
  } catch { /* soukromý režim */ }
  return n;
}
/** Má produkční verze v tomto prohlížeči uložený profil? */
export function prodHasProfile(): boolean { try { return IS_DEV && !!localStorage.getItem("mystis.player_path"); } catch { return false; } }

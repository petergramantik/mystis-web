// Přepínání běžné (produkční) a vývojové verze. Obě leží na stejné doméně (…/mystis-web/ a …/mystis-web/dev/),
// nainstalovaná aplikace se proto vrací na stránku, kde naposledy skončila. Volba se pamatuje (společný klíč)
// a aplikace spuštěná z plochy otevře zvolenou verzi.
const KEY = "mystis-channel";

function bases(): { prod: string; dev: string; inDev: boolean } {
  const p = location.pathname;
  const i = p.indexOf("/dev/");
  const prodPath = i >= 0 ? p.slice(0, i + 1) : p.replace(/[^/]*$/, "");
  return { prod: location.origin + prodPath, dev: location.origin + prodPath + "dev/", inDev: i >= 0 };
}

export function inDevBuild(): boolean { return bases().inDev; }

/** Přejde na druhou verzi a zapamatuje si volbu. */
export function switchChannel(to: "prod" | "dev") {
  try { localStorage.setItem(KEY, to); } catch { /* soukromý režim */ }
  const b = bases();
  location.href = to === "dev" ? b.dev : b.prod;
}

/** Při spuštění z plochy: otevřít naposledy zvolenou verzi. Vrací true, když se přesměrovává. */
export function followChannelChoice(): boolean {
  try {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return false;
    const want = localStorage.getItem(KEY);
    const b = bases();
    if (want === "dev" && !b.inDev) { location.replace(b.dev + location.search); return true; }
    if (want === "prod" && b.inDev) { location.replace(b.prod + location.search); return true; }
  } catch { /* */ }
  return false;
}

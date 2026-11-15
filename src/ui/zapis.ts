import { useEffect } from "react";
import { vm } from "../app/vm";

/**
 * Načte zápis; dokud se může měnit (utkání běží nebo ho STIS ještě nepotvrdil), stahuje ho znovu
 * po vm.livePeriod (3 min) – jen když je aplikace na obrazovce. Po návratu do aplikace hned.
 */
export function useZapisRefresh(path: string) {
  useEffect(() => {
    if (!path) return;
    vm.loadZapis(path);
    const tick = () => {
      if (!vm.appVisible || !vm.zapisNeedsPolling(path) || vm.zapisBusy(path)) return;
      if (Date.now() - vm.zapisAttemptAt(path) >= vm.livePeriod) vm.loadZapis(path, false, true);
    };
    const t = setInterval(tick, 10_000);
    const vis = () => tick();
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [path]);
}

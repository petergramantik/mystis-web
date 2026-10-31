import { useEffect } from "react";
import { vm } from "../app/vm";

/** Načte zápis; dokud utkání není dohrané, stahuje ho znovu každé 2 minuty. */
export function useZapisRefresh(path: string) {
  useEffect(() => {
    if (!path) return;
    vm.loadZapis(path);
    const t = setInterval(() => { if (vm.zapisRunning(path)) vm.loadZapis(path, false, true); }, 120_000);
    return () => clearInterval(t);
  }, [path]);
}

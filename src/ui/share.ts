// Sdílení: odkazy do aplikace (deep linky), systémová nabídka sdílení, obrázky.
import { vm } from "../app/vm";

/** Adresa aplikace (bez parametrů). */
export function appBase(): string { return location.origin + location.pathname.replace(/index\.html$/, ""); }

/** Odkaz do aplikace s parametry (z = zápis, h = hráč, d = vzájemné zápasy). */
export function appLink(params: Record<string, string> = {}): string {
  const q = new URLSearchParams(params).toString();
  return appBase() + (q ? "?" + q : "");
}
export const matchLink = (zapisPath: string) => appLink({ z: zapisPath });
export const playerLink = (playerPath: string) => appLink({ h: playerPath });
export const duelLink = (aPath: string, aName: string, bPath: string, bName: string) => appLink({ d: [aPath, aName, bPath, bName].join("~") });

function toast(text: string) { vm.toast(text); }

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* starší prohlížeč */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

/** Sdílí text s odkazem (mobil: nabídka sdílení, jinak zkopíruje do schránky). */
export async function shareLink(title: string, text: string, url?: string): Promise<void> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    try { await nav.share({ title, text, url }); return; } catch (e) { if ((e as Error)?.name === "AbortError") return; }
  }
  const all = url ? `${text}\n${url}` : text;
  toast((await copy(all)) ? "Zkopírováno do schránky" : "Kopírování se nepovedlo");
}

/** Sdílí obrázek (mobil: nabídka sdílení se souborem, jinak stažení). */
export async function shareImage(blob: Blob, fileName: string, title: string, text: string, url?: string): Promise<void> {
  const file = new File([blob], fileName, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title, text: url ? `${text}\n${url}` : text }); return; } catch (e) { if ((e as Error)?.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  toast("Obrázek uložen do Stažených souborů");
}

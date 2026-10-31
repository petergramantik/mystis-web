// Instalace webové aplikace do telefonu (PWA): Android přes systémové okno prohlížeče, iPhone návodem.
import { useState } from "react";
import { vm } from "../app/vm";
import { AppCard, C, Dialog, Muted, OButton, PrimaryButton, T } from "./components";

let deferred: any = null;
let installed = false;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; vm.emit(); });
  window.addEventListener("appinstalled", () => { installed = true; deferred = null; vm.emit(); });
}

export function isStandalone(): boolean {
  return installed || (typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true));
}
export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}
const canPrompt = () => deferred != null;
const DISMISS = "mystis.install_dismissed";

/** Spustí instalaci; když prohlížeč systémové okno nenabízí, vrátí false (ukáže se návod). */
async function install(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  ev.prompt();
  try { const r = await ev.userChoice; if (r?.outcome === "accepted") installed = true; } catch { /* zrušeno */ }
  vm.emit();
  return true;
}

function Instructions({ onClose }: { onClose: () => void }) {
  const ios = isIOS();
  return (
    <Dialog title="Přidat na plochu" onClose={onClose} actions={<button className="textbtn" onClick={onClose}>Rozumím</button>}>
      {ios ? (
        <div className="col g8">
          <T size={15}>1. Dole v Safari klepněte na tlačítko <b>Sdílet</b> (čtvereček se šipkou nahoru).</T>
          <T size={15}>2. Vyberte <b>Přidat na plochu</b>.</T>
          <T size={15}>3. Potvrďte <b>Přidat</b>. MySTIS se pak spouští z plochy jako aplikace.</T>
          <Muted text="Na iPhonu jde aplikaci přidat jen ze Safari." size={13} />
        </div>
      ) : (
        <div className="col g8">
          <T size={15}>1. Otevřete menu prohlížeče (⋮ vpravo nahoře).</T>
          <T size={15}>2. Zvolte <b>Nainstalovat aplikaci</b> nebo <b>Přidat na plochu</b>.</T>
          <Muted text="Pokud volbu nevidíte, otevřete MySTIS v Chrome." size={13} />
        </div>
      )}
    </Dialog>
  );
}

function useInstall() {
  const [help, setHelp] = useState(false);
  const run = async () => { if (!(await install())) setHelp(true); };
  return { run, dialog: help ? <Instructions onClose={() => setHelp(false)} /> : null };
}

/** Proužek na Přehledu (jde zavřít, pak se už neukáže). */
export function InstallBanner() {
  const { run, dialog } = useInstall();
  const [, force] = useState(0);
  let dismissed = false;
  try { dismissed = localStorage.getItem(DISMISS) === "1"; } catch { /* */ }
  if (isStandalone() || dismissed || !(canPrompt() || isIOS())) return dialog;
  return (
    <div className="installbar" style={{ margin: "0 16px" }}>
      {dialog}
      <span style={{ fontSize: 20 }}>📲</span>
      <div className="clickable" style={{ flex: 1, minWidth: 0 }} onClick={run}>
        <T bold size={14} color={C.Blue}>Nainstalovat MySTIS do telefonu</T>
        <Muted text="Spouštění z plochy jako běžná aplikace" size={12} maxLines={1} />
      </div>
      <button className="iconbtn" aria-label="Zavřít" style={{ color: C.Muted, width: 36, height: 36 }}
        onClick={() => { try { localStorage.setItem(DISMISS, "1"); } catch { /* */ } force((x) => x + 1); }}>✕</button>
    </div>
  );
}

/** Karta v Nastavení. */
export function InstallCard() {
  const { run, dialog } = useInstall();
  if (isStandalone()) return null;
  return (
    <AppCard>
      {dialog}
      <T bold>Aplikace v telefonu</T>
      <Muted size={13} maxLines={4} text={canPrompt() ? "MySTIS jde nainstalovat na plochu – pak se spouští jako běžná aplikace, bez lišty prohlížeče."
        : isIOS() ? "Na iPhonu se aplikace přidává ze Safari přes Sdílet → Přidat na plochu."
          : "Aplikaci přidáte na plochu přes menu prohlížeče (Nainstalovat aplikaci / Přidat na plochu)."} />
      <div><PrimaryButton text={canPrompt() ? "Nainstalovat" : "Jak nainstalovat"} onClick={run} /></div>
    </AppCard>
  );
}

/** Tlačítko na první obrazovce. */
export function InstallButton() {
  const { run, dialog } = useInstall();
  if (isStandalone()) return null;
  return (
    <>
      {dialog}
      <OButton text="📲 Nainstalovat aplikaci do telefonu" onClick={run} style={{ color: "#fff", borderColor: "rgba(255,255,255,.5)" }} />
    </>
  );
}

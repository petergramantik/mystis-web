// Pruh „Klepněte pro zapnutí zvuků“: prohlížeč pustí zvuk až po klepnutí na stránku.
import { vm } from "../app/vm";
import { soundUnlocked, unlockSound } from "../app/sound";
import { C, T } from "./components";

/** Ukáže se, když se hraje (moje nebo sledované utkání), zvuky jsou zapnuté a stránka je ještě nesmí hrát. */
export function SoundUnlockBar() {
  const playing = vm.next.some((c) => vm.liveRunning(c)) || vm.watchedRunning().length > 0;
  if (!vm.prefs.liveSounds || vm.prefs.liveMode === "off" || !playing || soundUnlocked()) return null;
  return (
    <div className="row clickable" onClick={() => { unlockSound(); vm.emit(); }}
      style={{ background: "#FFF4E5", border: "1px solid #F5C77A", borderRadius: 12, padding: "8px 12px" }}>
      <T bold size={14} color={C.Ink} style={{ flex: 1 }}>🔊 Klepněte pro zapnutí zvuků</T>
      <T size={12} color={C.Muted}>prohlížeč je pustí až po klepnutí</T>
    </div>
  );
}

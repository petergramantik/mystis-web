import { useEffect, useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { vm, S, type Screen } from "./app/vm";
import { Icon } from "./ui/components";
import { OnboardingScreen, OverviewScreen } from "./ui/screens/Overview";
import { LadderScreen } from "./ui/screens/Ladder";
import { StrScreen } from "./ui/screens/StrScreen";
import { MatchesScreen } from "./ui/screens/Matches";
import { ClubScreen, H2HScreen, OpponentsScreen } from "./ui/screens/Opponents";
import { FixtureScreen, NextMatchScreen } from "./ui/screens/NextMatch";
import { LiveScreen, LiveTopRing } from "./ui/screens/LiveMatch";
import { TeamScreen } from "./ui/screens/Team";
import { ProfileScreen } from "./ui/screens/Profile";
import { PairScreen, ZapisDetailScreen } from "./ui/screens/Duel";
import { CaptainScreen, CompareScreen } from "./ui/screens/Captain";
import { RecordsScreen, SettingsScreen } from "./ui/screens/Records";
import "./ui/app.css";

const TABS: [Screen, string, string][] = [
  [S.Overview, "Přehled", "home"],
  [S.Ladder, "Žebříčky", "leaderboard"],
  [S.Str, "STR", "chart"],
  [S.Matches, "Utkání", "list"],
  [S.Opponents, "Soupeři", "search"],
];

function title(s: Screen): string {
  switch (s.t) {
    case "Overview": return "MySTIS";
    case "Ladder": return "Žebříčky";
    case "Str": return "Vývoj STR";
    case "Matches": return "Utkání";
    case "Opponents": return "Soupeři";
    case "Club": return s.name;
    case "H2H": return "Vzájemné zápasy";
    case "NextMatch": return "Příští zápas";
    case "Captain": return "Pro kapitána";
    case "Compare": return "Porovnání hráčů";
    case "Records": return "Rekordy a statistiky";
    case "Settings": return "Nastavení";
    case "Player": return "Profil hráče";
    case "Team": return "Družstvo";
    case "Live": return "Živé utkání";
    case "Duel": return "Vzájemné zápasy";
    case "ZapisDetail": return "Zápis o utkání";
    case "Fixture": return "Další utkání";
  }
}

function Body({ s }: { s: Screen }) {
  switch (s.t) {
    case "Overview": return <OverviewScreen />;
    case "Ladder": return <LadderScreen />;
    case "Str": return <StrScreen />;
    case "Matches": return <MatchesScreen />;
    case "Opponents": return <OpponentsScreen />;
    case "Club": return <ClubScreen club={s.name} />;
    case "H2H": return <H2HScreen oppKey={s.key} />;
    case "NextMatch": return <NextMatchScreen />;
    case "Captain": return <CaptainScreen />;
    case "Compare": return <CompareScreen a0={s.a} b0={s.b} />;
    case "Records": return <RecordsScreen />;
    case "Settings": return <SettingsScreen />;
    case "Player": return <ProfileScreen path={s.path} />;
    case "Team": return <TeamScreen team={s.team} />;
    case "Live": return <LiveScreen team={s.team} />;
    case "Duel": return <PairScreen aId0={s.aId} aName0={s.aName} bId0={s.bId} bName0={s.bName} pA0={s.pA} />;
    case "ZapisDetail": return <ZapisDetailScreen path={s.path} myTeam={s.myTeam} />;
    case "Fixture": return <FixtureScreen team={s.team} round={s.round} home={s.home} away={s.away} />;
  }
}

const canBack = () => vm.stack.length > 1 || vm.current.t !== "Overview";
const goBack = () => { if (!vm.back()) vm.resetTo(S.Overview); };

/** Tlačítko Zpět prohlížeče / telefonu se chová jako šipka zpět (jako BackHandler v Android verzi). */
function useBackHandler() {
  useEffect(() => {
    let guard = false;
    const sync = () => {
      if (canBack() && !guard) { history.pushState({ mystis: 1 }, ""); guard = true; }
    };
    const onPop = () => {
      guard = false;
      if (canBack()) goBack();
      setTimeout(sync, 0);
    };
    window.addEventListener("popstate", onPop);
    const unsub = vm.subscribe(sync);
    sync();
    return () => { window.removeEventListener("popstate", onPop); unsub(); };
  }, []);
}

function Root() {
  useSyncExternalStore(vm.subscribe, vm.getVersion);
  useBackHandler();
  const [menu, setMenu] = useState(false);
  if (vm.onboarding) return <OnboardingScreen />;
  const screen = vm.current;
  const dark = ["Overview", "Club", "H2H", "Player", "Live", "Duel", "ZapisDetail", "Team"].includes(screen.t);
  const item = (text: string, icon: string, s: Screen) => (
    <button onClick={() => { setMenu(false); vm.go(s); }}><Icon name={icon} />{text}</button>
  );
  return (
    <>
      <div className={"topbar" + (dark ? " dark" : "")}>
        {canBack() ? <button className="iconbtn" onClick={goBack} aria-label="Zpět"><Icon name="back" /></button> : <div className="spacer44" />}
        <div className="spacer44" />
        <div className="title">{title(screen)}</div>
        {(() => {
          const refresh = <button className="iconbtn" onClick={() => vm.refreshAll()} aria-label="Obnovit data"><Icon name="refresh" /></button>;
          return screen.t === "Live" ? <LiveTopRing team={screen.team} fallback={refresh} /> : refresh;
        })()}
        <button className="iconbtn" onClick={() => setMenu(true)} aria-label="Další funkce"><Icon name="more" /></button>
        {menu && (
          <>
            <div className="scrim" onClick={() => setMenu(false)} />
            <div className="menu">
              {item("Příští zápas", "event", S.NextMatch)}
              {item("Pro kapitána", "groups", S.Captain)}
              {item("Porovnání hráčů", "compare", { t: "Compare", a: null, b: null })}
              {item("Rekordy a statistiky", "trophy", S.Records)}
              {item("Nastavení", "settings", S.Settings)}
            </div>
          </>
        )}
      </div>
      <div className="content" key={JSON.stringify(screen)}>
        <Body s={screen} />
      </div>
      <nav className="bottombar">
        <div className="inner">
          {TABS.map(([s, label, icon]) => (
            <button key={label} className={"navitem" + (screen.t === s.t ? " on" : "")} onClick={() => vm.tab(s)}>
              <div className="pill"><Icon name={icon} /></div>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

createRoot(document.getElementById("app")!).render(<Root />);

if ("serviceWorker" in navigator && location.protocol === "https:") {
  // nová verze aplikace převezme řízení -> jednou obnovit stránku, aby běžel nový kód
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((r) => r.update()).catch(() => {});
  });
}
// klepnutí na notifikaci z probíhajícího utkání -> otevřít Živé utkání
navigator.serviceWorker?.addEventListener("message", (e: MessageEvent) => {
  const d = e.data;
  if (d?.type === "notification" && d.data) vm.openLiveNotification(d.data);
});
// aplikace spuštěná klepnutím na notifikaci: ?n={…} -> po načtení utkání otevřít zápis / živé utkání
(() => {
  try {
    const q = new URLSearchParams(location.search).get("n");
    if (!q) return;
    const data = JSON.parse(q);
    history.replaceState(history.state, "", location.pathname);
    const t0 = Date.now();
    const wait = setInterval(() => {
      if ((vm.next.length && !vm.loadingNext) || Date.now() - t0 > 30_000) { clearInterval(wait); if (vm.next.length || data.path) vm.openLiveNotification(data); }
    }, 300);
  } catch { /* neplatný parametr */ }
})();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
});
// při návratu do aplikace (z pozadí) dočíst čerstvá data, jako při spuštění Android aplikace
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && vm.me && Date.now() - vm.prefs.lastSync > 30 * 60_000) vm.loadMe(false);
});

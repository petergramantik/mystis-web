import { useEffect, useState } from "react";
import { vm, S } from "../../app/vm";
import { Stats, maxBy } from "../../core/stats";
import { MatchFormats } from "../../core/live";
import { WebFetcher } from "../../data/fetcher";
import {
  AppCard, C, Icon, KeyValue, ListCard, Loading, MatchRow, Muted, OButton, PrimaryButton, SectionTitle,
  StatTile, T, TextField, TileRow, dec1, signedInt, Segmented, Spinner,
} from "../components";
import { DevCard, ProfileInput } from "./Overview";
import { IS_DEV } from "../../app/channel";
import { InstallCard } from "../install";
import { APP_VERSION } from "../../app/version";
import { statsKey } from "./AdminStats";

/** "1 výhra", "3 výhry", "5 výher" / "1 prohra", "2 prohry", "6 proher" */
function streakText(s: number): string {
  const n = Math.abs(s);
  if (n === 0) return "–";
  const forms = s > 0 ? ["výhra", "výhry", "výher"] : ["prohra", "prohry", "proher"];
  return `${n} ${n === 1 ? forms[0] : n <= 4 ? forms[1] : forms[2]}`;
}

const signedD = (x: number) => (x >= 0 ? "+" : "−") + dec1(Math.abs(x));

export function RecordsScreen() {
  useEffect(() => {
    if (!vm.scrollTarget) return;
    const id = vm.scrollTarget;
    vm.scrollTarget = null;
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 64, behavior: "smooth" });
    }, 80);
  }, []);
  const me = vm.meWithLive();
  if (!me) return <Loading />;
  const r = Stats.records(me);
  const splits = Stats.splits(me.chronological);
  const season = me.matches.length ? Math.max(...me.matches.map((m) => m.season)) : null;
  const seasonSplits = Stats.splits(me.chronological.filter((m) => m.season === season));
  const st = vm.setStats;
  const ladder = vm.club.ladder;
  const jumper = maxBy(ladder.filter((e) => e.strChange != null), (e) => e.strChange!);
  const busiest = maxBy(ladder, (e) => e.played);
  const best = maxBy(ladder.filter((e) => e.played >= 6), (e) => e.wins / e.played);
  const pos = ladder.findIndex((e) => e.id === me.id);
  return (
    <div className="col g12 px16">
      <TileRow>
        <StatTile label="Dvouher celkem" value={`${r.totalMatches}`} sub={`${r.wins}–${r.losses}`} />
        <StatTile label="Nejvyšší STR" value={`${r.peakStr ?? "–"}`} sub={r.peakDate} valueColor={C.Win} />
        <StatTile label="Aktuální série" value={streakText(r.currentStreak)} valueColor={r.currentStreak > 0 ? C.Win : C.OrangeText} />
      </TileRow>
      {r.badges.length > 0 && (
        <>
          <SectionTitle text="Ocenění" />
          <AppCard>
            {r.badges.map((b, i) => (
              <div className="row g12" key={i}>
                <Icon name="trophy" color={C.Orange} />
                <div className="col"><T bold>{b.title}</T><Muted text={b.detail} size={13} /></div>
              </div>
            ))}
          </AppCard>
        </>
      )}
      <SectionTitle text="Rekordy" />
      <AppCard>
        <KeyValue label="Nejdelší série výher" value={`${r.longestWin.length} (${r.longestWin.from?.dateText ?? ""} – ${r.longestWin.to?.dateText ?? ""})`} valueColor={C.Win} />
        <KeyValue label="Nejdelší série proher" value={`${r.longestLoss.length}`} valueColor={C.OrangeText} />
        {r.biggestScalp && <KeyValue label="Největší skalp" onClick={vm.playerClick(r.biggestScalp.opponentId, r.biggestScalp.opponent)} value={`${r.biggestScalp.opponent} (STR ${r.biggestScalp.oppStrBefore})`} />}
        {r.biggestUpset && <KeyValue label="Největší překvapení" onClick={vm.playerClick(r.biggestUpset.opponentId, r.biggestUpset.opponent)} value={`+${(r.biggestUpset.oppStrBefore ?? 0) - (r.biggestUpset.strBefore ?? 0)} STR · ${r.biggestUpset.opponent}`} />}
        {r.worstLoss && <KeyValue label="Nejbolestivější prohra" onClick={vm.playerClick(r.worstLoss.opponentId, r.worstLoss.opponent)} value={`${(r.worstLoss.oppStrBefore ?? 0) - (r.worstLoss.strBefore ?? 0)} STR · ${r.worstLoss.opponent}`} />}
        {r.bestSeason && <KeyValue label="Nejlepší sezóna" value={`${r.bestSeason.label} · ${Stats.pct(r.bestSeason.success)} (${r.bestSeason.wins}–${r.bestSeason.losses})`} />}
        {r.mostPlayed && <KeyValue label="Nejčastější soupeř" onClick={vm.playerClick(r.mostPlayed.id, r.mostPlayed.name)} value={`${r.mostPlayed.name} ${r.mostPlayed.record}`} />}
        {r.favourite && <KeyValue label="Oblíbený soupeř" onClick={vm.playerClick(r.favourite.id, r.favourite.name)} value={`${r.favourite.name} ${r.favourite.record}`} valueColor={C.Win} />}
        {r.nemesis && <KeyValue label="Postrach" onClick={vm.playerClick(r.nemesis.id, r.nemesis.name)} value={`${r.nemesis.name} ${r.nemesis.record}`} valueColor={C.OrangeText} />}
      </AppCard>
      <div id="klutch"><SectionTitle text="Klutch statistiky" /></div>
      <AppCard>
        <Muted text="Kladné číslo = vyhráváte víc, než by odpovídalo STR soupeřů." size={12} />
        <div className="row">
          <div style={{ flex: 1 }} />
          <Muted text="SEZÓNA" size={12} style={{ paddingRight: 18 }} />
          <Muted text="KARIÉRA" size={12} />
        </div>
        {splits.map((s, i) => {
          const ss = seasonSplits[i];
          return (
            <div className="row" key={i} style={{ padding: "3px 0" }}>
              <T size={14} style={{ flex: 1 }}>{s.label}</T>
              <div className="col" style={{ alignItems: "flex-end", paddingRight: 16 }}>
                <T semi size={14}>{`${ss.wins}–${ss.losses}`}</T>
                <Muted text={ss.total === 0 ? "" : signedD(ss.overExpected)} size={11} />
              </div>
              <div className="col" style={{ alignItems: "flex-end" }}>
                <T semi size={14}>{`${s.wins}–${s.losses}`}</T>
                <T size={11} color={C.delta(s.overExpected)}>{signedD(s.overExpected)}</T>
              </div>
            </div>
          );
        })}
      </AppCard>
      <AppCard>
        <T bold>Sety v této sezóně</T>
        {st != null && st.sets > 0 ? (
          <>
            <KeyValue label="Sety celkem" value={`${st.setsWon}:${st.sets - st.setsWon}`} />
            <KeyValue label="Těsné sety (soupeř 9+)" value={`${st.closeWon}:${st.close - st.closeWon}`} valueColor={st.closeWon * 2 >= st.close ? C.Win : C.OrangeText} />
            <KeyValue label="Prodloužení (10:10+)" value={`${st.deuceWon}:${st.deuce - st.deuceWon}`} valueColor={st.deuceWon * 2 >= st.deuce ? C.Win : C.OrangeText} />
            <KeyValue label="Pátý set" value={`${st.decidingWon}:${st.deciding - st.decidingWon}`} />
          </>
        ) : vm.loadingSets ? <Loading text="Stahuji zápisy o utkání…" /> : (
          <>
            <Muted size={13} maxLines={4} text="Podrobné sety jsou jen v zápisech o utkání. Stáhnu je pro letošní sezónu (jednou, pak jsou v mezipaměti)." />
            <div><OButton text="Načíst sety ze zápisů" onClick={() => vm.loadSetStats()} /></div>
          </>
        )}
      </AppCard>
      {ladder.length > 0 && (
        <>
          <SectionTitle text={`Oddíl ${vm.club.name}`} />
          <AppCard>
            {jumper && <KeyValue label="Skokan sezóny" onClick={vm.playerClick(jumper.id, jumper.name)} value={`${jumper.name} ${signedInt(jumper.strChange)}`} valueColor={C.Win} />}
            {ladder[0] && <KeyValue label="Jednička oddílu" onClick={vm.playerClick(ladder[0].id, ladder[0].name)} value={`${ladder[0].name} (${ladder[0].str})`} />}
            {busiest && busiest.played > 0 && <KeyValue label="Nejvytíženější" onClick={vm.playerClick(busiest.id, busiest.name)} value={`${busiest.name} · ${busiest.played} dvouher`} />}
            {best && <KeyValue label="Nejúspěšnější (6+ dvouher)" onClick={vm.playerClick(best.id, best.name)} value={`${best.name} · ${Stats.pct(best.wins / best.played)}`} />}
            {pos >= 0 && <KeyValue label="Vaše pozice" value={`${pos + 1}. z ${ladder.length}`} valueColor={C.Blue} />}
          </AppCard>
        </>
      )}
      {r.biggestScalp && (
        <>
          <SectionTitle text="Výhra kariéry" />
          <ListCard><MatchRow m={r.biggestScalp} onClick={() => vm.go({ t: "H2H", key: r.biggestScalp!.opponentKey })} /></ListCard>
        </>
      )}
      <div style={{ height: 8 }} />
    </div>
  );
}

/** Adresa proxy, přes kterou web čte STIS (Cloudflare Worker). */
export function ProxySetup({ onSaved }: { onSaved?: () => void }) {
  const [url, setUrl] = useState(vm.prefs.proxyUrl);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [testing, setTesting] = useState(false);
  const test = async () => {
    const u = url.trim();
    if (!/^https?:\/\//.test(u)) { setOk(false); setMsg("Adresa musí začínat https://"); return; }
    setTesting(true);
    const e = await WebFetcher.ping(u);
    setTesting(false);
    if (e) { setOk(false); setMsg(e); return; }
    vm.prefs.proxyUrl = u;
    setOk(true); setMsg("Proxy funguje, adresa je uložená.");
    vm.emit();
    onSaved?.();
  };
  return (
    <AppCard>
      <T bold>Připojení ke STIS</T>
      <Muted size={13} maxLines={6} text="Prohlížeč nesmí číst stránky STIS přímo, proto je stahuje malá proxy (Cloudflare Worker). Vložte její adresu, např. https://mystis-proxy.jmeno.workers.dev" />
      <TextField value={url} onChange={(v) => { setUrl(v); setMsg(null); }} label="Adresa proxy" placeholder="https://mystis-proxy.….workers.dev" onEnter={test} />
      <div className="row g10">
        <PrimaryButton text={testing ? "Ověřuji…" : "Ověřit a uložit"} onClick={test} enabled={!!url.trim() && !testing} />
      </div>
      {msg && <Muted text={msg} color={ok ? C.Win : C.OrangeText} size={13} maxLines={3} />}
    </AppCard>
  );
}

export function SettingsScreen() {
  const [club, setClub] = useState(vm.prefs.clubPath ?? vm.me?.currentSeason?.clubPath ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [cache, setCache] = useState<number | null>(null);
  useEffect(() => { vm.cacheSize().then(setCache); }, []);
  const notif = vm.prefs.notifications;
  const standalone = typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches;
  return (
    <div className="col g12 px16">
      <AppCard>
        <T bold>Můj profil na STIS</T>
        <Muted text={`Aktuálně: ${vm.me?.name ?? "–"}`} size={13} />
        <ProfileInput dark={false} buttonText="Najít a načíst" onDone={() => setMsg("Profil načten.")} />
      </AppCard>
      {IS_DEV && <DevCard dark={false} />}
      <InstallCard />
      {!vm.prefs.proxyUrl && <ProxySetup />}
      <AppCard>
        <T bold>Oddíl</T>
        <Muted size={13} maxLines={4} text="Obvykle se zjistí sám ze stránky hráče. Pokud žebříček chybí, vložte odkaz na stránku oddílu (…/oddil-…)." />
        <TextField value={club} onChange={setClub} label="Odkaz na oddíl" />
        <div><OButton text="Použít" onClick={() => setMsg(vm.setClubPath(club) ? "Načítám oddíl…" : "Odkaz nevypadá jako stránka oddílu.")} /></div>
      </AppCard>
      <AppCard>
        <T bold>Formát utkání</T>
        <Muted size={13} maxLines={3} text="Podle formátu se sestavují ruční sestavy, počítá šance na výhru a pozná konec utkání." />
        <div className="radio" onClick={() => vm.changeFormat(null)}>
          <div className={"c" + (vm.formatAuto ? " on" : "")} />
          <span>{`Automaticky podle soutěže${vm.formatAuto && (() => { const r = vm.next[vm.nextSelected]?.myTeam.ref; return !r || vm.compFormatState(r) !== "loading"; })() ? ` (teď: ${MatchFormats.short(vm.format)})` : ""}`}</span>
          {vm.formatAuto && (() => { const r = vm.next[vm.nextSelected]?.myTeam.ref; return !!r && vm.compFormatState(r) === "loading"; })() && <Spinner size={14} width={2} />}
        </div>
        {MatchFormats.ALL.map((f) => (
          <div key={f.key} className="radio" onClick={() => vm.changeFormat(f)}>
            <div className={"c" + (!vm.formatAuto && vm.format.key === f.key ? " on" : "")} />
            <span>{f.label}</span>
          </div>
        ))}
      </AppCard>
      <AppCard>
        <div className="row g12">
          <div className="col w1">
            <T bold>Komplexní model predikcí</T>
            <Muted size={13} maxLines={6} text="Kromě STR započítá vzájemné zápasy hráčů (novější a při podobném STR mají větší váhu) a výhodu domácího prostředí v soutěži. Načítá navíc profily spoluhráčů, proto je ve výchozím stavu vypnutý." />
          </div>
          <div className={"switch" + (vm.complexOn ? " on" : "")} role="switch" aria-checked={vm.complexOn} onClick={() => vm.setComplex(!vm.complexOn)} />
        </div>
        <div className="row clickable" onClick={() => vm.go({ t: "Model", section: "complex" })}><T size={13} color={C.Blue}>Jak komplexní model funguje a jak je přesný ›</T></div>
      </AppCard>
      <AppCard>
        <div className="row g12">
          <div className="col w1">
            <T bold>Upozornění</T>
            <Muted size={13} maxLines={4} text="Nové výsledky a změna STR, připomínka den před utkáním. Na webu se kontroluje při otevření aplikace (prohlížeč neumí STIS hlídat na pozadí)." />
          </div>
          <div className={"switch" + (notif ? " on" : "")} role="switch" aria-checked={notif} onClick={async () => { const e = await vm.setNotifications(!notif); if (e) setMsg(e); }} />
        </div>
      </AppCard>
      <AppCard>
        <T bold>Upozornění na živé utkání</T>
        <Muted size={13} maxLines={5} text="Při probíhajícím utkání se každou minutu obnoví zápis. Hry: každá dohraná hra (✅/❌ a stav) a konec utkání. Sety: navíc každý dohraný set. Funguje jen při otevřené aplikaci." />
        <LiveModeSwitch onError={setMsg} />
      </AppCard>
      <AppCard>
        <div className="row g12">
          <div className="col w1">
            <T bold>Zvuky živého utkání</T>
            <Muted size={13} maxLines={5} text="Zajásání davu při vyhrané hře (nebo setu podle volby výše), zahučení při prohrané a potlesk na konci vítězného utkání. Hraje, když je aplikace na obrazovce." />
          </div>
          <div className={"switch" + (vm.prefs.liveSounds ? " on" : "")} role="switch" aria-checked={vm.prefs.liveSounds} onClick={() => vm.setLiveSounds(!vm.prefs.liveSounds)} />
        </div>
      </AppCard>
      <AppCard>
        <T bold>Data a offline režim</T>
        <Muted size={13} maxLines={3} text={`Stažené stránky STIS: ${cache == null ? "…" : Math.floor(cache / 1024)} kB. Bez internetu aplikace ukáže poslední uložená data.`} />
        <div className="row g8" style={{ flexWrap: "wrap" }}>
          <OButton text="Vymazat mezipaměť" onClick={async () => { await vm.clearCache(); setCache(await vm.cacheSize()); setMsg("Mezipaměť vymazána."); }} />
          <OButton text="Odhlásit profil" onClick={() => vm.logout()} />
        </div>
      </AppCard>
      {msg && <AppCard><Muted text={msg} color={C.Ink} size={14} maxLines={4} /></AppCard>}
      <AppCard>
        <div className="row clickable" onClick={() => vm.go({ t: "About" })}>
          <div className="col w1">
            <T bold>O aplikaci</T>
            <Muted size={13} maxLines={4} text={`Verze ${APP_VERSION} · autor, novinky, zdroj dat. ` + (standalone ? "Aplikace běží z plochy." : "Na plochu ji přidáte v menu prohlížeče → Přidat na plochu.")} />
          </div>
          <T bold color={C.Blue}>›</T>
        </div>
      </AppCard>
      {statsKey() && (
        <AppCard>
          <div className="row clickable" onClick={() => vm.go({ t: "AdminStats" })}>
            <div className="col w1">
              <T bold>Statistiky (správce)</T>
              <Muted size={13} text="Počet zařízení, aktivita a verze aplikace" />
            </div>
            <T bold color={C.Blue}>›</T>
          </div>
        </AppCard>
      )}
      {vm.prefs.proxyUrl && <ProxyRow />}
      <div style={{ height: 8 }} />
    </div>
  );
}

/** Adresa proxy dole v Nastavení: jen ke čtení, změna po klepnutí na „Změnit“. */
function ProxyRow() {
  const [edit, setEdit] = useState(false);
  if (edit) return (
    <div className="col g8">
      <ProxySetup onSaved={() => setEdit(false)} />
      <div><button className="textbtn" onClick={() => setEdit(false)}>Zrušit</button></div>
    </div>
  );
  return (
    <div className="row g8" style={{ padding: "0 4px" }}>
      <Muted text={`Připojení ke STIS: ${vm.prefs.proxyUrl.replace(/^https?:\/\//, "")}`} size={12} maxLines={2} style={{ flex: 1 }} />
      <button className="textbtn" style={{ fontSize: 12, padding: "6px 8px" }} onClick={() => setEdit(true)}>Změnit</button>
    </div>
  );
}

export { S };

/** Přepínač rozsahu upozornění na živé utkání: Vypnuto / Hry / Sety. */
export function LiveModeSwitch({ onError }: { onError?: (e: string) => void }) {
  return (
    <Segmented options={[["off", "🔕 Vypnuto"], ["games", "Hry"], ["sets", "Sety"]]} selected={vm.prefs.liveMode}
      onSelect={async (k) => { const e = await vm.setLiveMode(k as "off" | "games" | "sets"); if (e) onError?.(e); }} />
  );
}

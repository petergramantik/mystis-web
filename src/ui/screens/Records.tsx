import { useEffect, useState } from "react";
import { vm, S } from "../../app/vm";
import type { Match } from "../../core/models";
import { Stats, maxBy } from "../../core/stats";
import { MatchFormats } from "../../core/live";
import { WebFetcher } from "../../data/fetcher";
import {
  AppCard, BigNumber, C, Empty, Icon, KeyValue, ListCard, Loading, MatchRow, Muted, NavyHeader, OButton, PrimaryButton, SectionTitle,
  StatTile, StrChart, T, TextField, TileRow, Avatar, dec1, signedInt,
} from "../components";
import { ProfileInput } from "./Overview";
import { strPoints } from "./StrScreen";

const signedD = (x: number) => (x >= 0 ? "+" : "−") + dec1(Math.abs(x));

export function RecordsScreen() {
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
        <StatTile label="Aktuální série" value={r.currentStreak > 0 ? `${r.currentStreak} V` : `${-r.currentStreak} P`} valueColor={r.currentStreak > 0 ? C.Win : C.OrangeText} />
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
        {r.biggestScalp && <KeyValue label="Největší skalp" value={`${r.biggestScalp.opponent} (STR ${r.biggestScalp.oppStrBefore})`} />}
        {r.biggestUpset && <KeyValue label="Největší překvapení" value={`+${(r.biggestUpset.oppStrBefore ?? 0) - (r.biggestUpset.strBefore ?? 0)} STR · ${r.biggestUpset.opponent}`} />}
        {r.worstLoss && <KeyValue label="Nejbolestivější prohra" value={`${(r.worstLoss.oppStrBefore ?? 0) - (r.worstLoss.strBefore ?? 0)} STR · ${r.worstLoss.opponent}`} />}
        {r.bestSeason && <KeyValue label="Nejlepší sezóna" value={`${r.bestSeason.label} · ${Stats.pct(r.bestSeason.success)} (${r.bestSeason.wins}–${r.bestSeason.losses})`} />}
        {r.mostPlayed && <KeyValue label="Nejčastější soupeř" value={`${r.mostPlayed.name} ${r.mostPlayed.record}`} />}
        {r.favourite && <KeyValue label="Oblíbený soupeř" value={`${r.favourite.name} ${r.favourite.record}`} valueColor={C.Win} />}
        {r.nemesis && <KeyValue label="Postrach" value={`${r.nemesis.name} ${r.nemesis.record}`} valueColor={C.OrangeText} />}
      </AppCard>
      <SectionTitle text="Klutch statistiky" />
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
            {jumper && <KeyValue label="Skokan sezóny" value={`${jumper.name} ${signedInt(jumper.strChange)}`} valueColor={C.Win} />}
            {ladder[0] && <KeyValue label="Jednička oddílu" value={`${ladder[0].name} (${ladder[0].str})`} />}
            {busiest && busiest.played > 0 && <KeyValue label="Nejvytíženější" value={`${busiest.name} · ${busiest.played} dvouher`} />}
            {best && <KeyValue label="Nejúspěšnější (6+ dvouher)" value={`${best.name} · ${Stats.pct(best.wins / best.played)}`} />}
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
      <ProxySetup />
      <AppCard>
        <T bold>Oddíl</T>
        <Muted size={13} maxLines={4} text="Obvykle se zjistí sám ze stránky hráče. Pokud žebříček chybí, vložte odkaz na stránku oddílu (…/oddil-…)." />
        <TextField value={club} onChange={setClub} label="Odkaz na oddíl" />
        <div><OButton text="Použít" onClick={() => setMsg(vm.setClubPath(club) ? "Načítám oddíl…" : "Odkaz nevypadá jako stránka oddílu.")} /></div>
      </AppCard>
      <AppCard>
        <T bold>Formát utkání</T>
        <Muted size={13} maxLines={3} text="Podle formátu se sestavují ruční sestavy, počítá šance na výhru a pozná konec utkání." />
        {MatchFormats.ALL.map((f) => (
          <div key={f.key} className="radio" onClick={() => vm.changeFormat(f)}>
            <div className={"c" + (vm.format.key === f.key ? " on" : "")} />
            <span>{f.label}</span>
          </div>
        ))}
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
        <T bold>Data a offline režim</T>
        <Muted size={13} maxLines={3} text={`Stažené stránky STIS: ${cache == null ? "…" : Math.floor(cache / 1024)} kB. Bez internetu aplikace ukáže poslední uložená data.`} />
        <div className="row g8" style={{ flexWrap: "wrap" }}>
          <OButton text="Vymazat mezipaměť" onClick={async () => { await vm.clearCache(); setCache(await vm.cacheSize()); setMsg("Mezipaměť vymazána."); }} />
          <OButton text="Odhlásit profil" onClick={() => vm.logout()} />
        </div>
      </AppCard>
      {msg && <AppCard><Muted text={msg} color={C.Ink} size={14} maxLines={4} /></AppCard>}
      <AppCard>
        <T bold>O aplikaci</T>
        <Muted size={13} maxLines={10} text={"MySTIS čte veřejné stránky stis.ping-pong.cz. Model STR (K = 12,5, škála 200) a predikce byly ověřeny na 15 195 skutečných zápasech. " +
          (standalone ? "Aplikace běží z plochy." : "Na plochu telefonu ji přidáte v menu prohlížeče → Přidat na plochu (Chrome) nebo Sdílet → Přidat na plochu (Safari).")} />
      </AppCard>
      <div style={{ height: 8 }} />
    </div>
  );
}

export function PlayerScreen({ path }: { path: string }) {
  useEffect(() => { vm.loadPlayer(path); }, [path]);
  const p = vm.players.get(path);
  const me = vm.me;
  if (!p) return <div style={{ padding: 16 }}>{vm.loadingPlayers.get(path) ? <Loading /> : <Empty text="Profil hráče se nepodařilo načíst." />}</div>;
  const season = p.matches.length ? Math.max(...p.matches.map((m) => m.season)) : null;
  const sm = p.chronological.filter((m) => m.season === season);
  const f = Stats.form(p);
  const mutual: Match[] = p.id ? vm.meWithLive()?.chronological.filter((m) => m.opponentId === p.id) ?? [] : [];
  const w = sm.filter((m) => m.won).length;
  return (
    <div className="col g12">
      <NavyHeader>
        <div className="row g12">
          <Avatar text={p.name} color={C.Orange} size={48} />
          <div className="col w1">
            <T size={20} bold color="#fff">{p.name}</T>
            <Muted text={[p.clubName, p.birthYear != null ? `nar. ${p.birthYear}` : null].filter((x) => x).join(" · ")} color={C.MutedOnNavy} size={14} />
          </div>
        </div>
        <div className="rowb">
          <BigNumber text={`${p.currentStr ?? "–"}`} color="#fff" size={56} />
          <Muted text="  STR" color={C.MutedOnNavy} size={16} style={{ whiteSpace: "pre", paddingBottom: 8 }} />
        </div>
        <TileRow>
          <StatTile label="Sezóna" value={`${w}–${sm.length - w}`} dark />
          <StatTile label="Forma" value={`${f.wins}–${f.losses}`} dark />
          <StatTile label="Nejvyšší" value={`${p.ster.peak ?? "–"}`} dark />
        </TileRow>
      </NavyHeader>
      <div className="col g12 px16">
        <AppCard><StrChart series={[{ color: C.Orange, points: strPoints(p, "1r") }]} /></AppCard>
        {me && (
          <>
            <div className="row g8">
              {mutual.length > 0 && <OButton text={`Vzájemně ${mutual.filter((m) => m.won).length}–${mutual.filter((m) => !m.won).length}`} onClick={() => vm.go({ t: "H2H", key: mutual[mutual.length - 1].opponentKey })} style={{ flex: 1 }} />}
              <OButton text="Porovnat se mnou" onClick={() => vm.go({ t: "Compare", a: me.path, b: path })} style={{ flex: 1 }} />
            </div>
            <OButton full enabled={!vm.loadingMe} text={vm.loadingMe ? "Přepínám…" : "Přepnout aplikaci na tohoto hráče"} onClick={() => vm.setProfile(p.path, () => {})} />
          </>
        )}
        <SectionTitle text="Poslední zápasy" />
        <ListCard>{p.chronological.slice(-10).reverse().map((m, i) => <MatchRow key={i} m={m} onClick={() => {}} />)}</ListCard>
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

export { S };

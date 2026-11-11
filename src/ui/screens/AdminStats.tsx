import { SP } from "../../app/channel";
import { useEffect, useState } from "react";
import { vm } from "../../app/vm";
import { AppCard, C, Empty, Loading, Muted, OButton, T, TextField } from "../components";

/** Klíč ke statistikám uživatelů (STATS_KEY workeru) – uložený jen v tomto zařízení. */
const KEY = SP + "stats_key";
export function statsKey(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }
function setStatsKey(k: string | null) { try { if (k) localStorage.setItem(KEY, k); else localStorage.removeItem(KEY); } catch { /* soukromý režim */ } }

interface StatsData { total: number; today: number; d7: number; d30: number; days: [string, number, number][]; versions: Record<string, number> }

async function loadStats(key: string): Promise<StatsData> {
  const proxy = vm.prefs.proxyUrl;
  if (!proxy) throw new Error("Není nastavená adresa proxy.");
  let r: Response;
  // odpověď 403 workeru nemá CORS hlavičky -> prohlížeč ji ohlásí jako síťovou chybu
  try { r = await fetch(`${proxy}/__stats?key=${encodeURIComponent(key)}&format=json`, { cache: "no-store" }); }
  catch { throw new Error("Klíč nesedí, nebo je worker nedostupný."); }
  if (r.status === 403) throw new Error("Klíč nesedí (403).");
  if (!r.ok) throw new Error(`Worker vrátil chybu ${r.status}: ${(await r.text()).slice(0, 80)}`);
  return r.json();
}

/** Odemčení v O aplikaci (po 5 klepnutích na verzi). */
export function StatsUnlock({ onDone }: { onDone: () => void }) {
  const [k, setK] = useState(statsKey() ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setMsg(null);
    try { await loadStats(k.trim()); setStatsKey(k.trim()); onDone(); vm.go({ t: "AdminStats" }); }
    catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  return (
    <AppCard>
      <T bold>Statistiky (správce)</T>
      <Muted size={13} maxLines={3} text="Zadejte klíč STATS_KEY z Cloudflare. Uloží se jen v tomto zařízení." />
      <TextField value={k} onChange={setK} label="Klíč" onEnter={go} />
      <div className="row g8">
        <OButton text={busy ? "Ověřuji…" : "Odemknout"} onClick={go} style={{ flex: 1 }} />
        {statsKey() && <OButton text="Zapomenout klíč" onClick={() => { setStatsKey(null); setK(""); onDone(); vm.emit(); }} style={{ flex: 1 }} />}
      </div>
      {msg && <Muted text={msg} size={13} color={C.OrangeText} maxLines={3} />}
    </AppCard>
  );
}

function Num({ label, value }: { label: string; value: number }) {
  return (
    <div className="col" style={{ flex: 1, minWidth: 0, background: C.Tint, borderRadius: 14, padding: "10px 12px" }}>
      <Muted size={12} text={label} maxLines={1} />
      <T bold size={26}>{String(value)}</T>
    </div>
  );
}

export function AdminStatsScreen() {
  const [data, setData] = useState<StatsData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const key = statsKey();
  useEffect(() => {
    if (!key) return;
    setErr(null);
    loadStats(key).then(setData, (e) => setErr((e as Error).message));
  }, [tick]);
  if (!key) return <div className="px16"><Empty text="Statistiky nejsou odemčené (O aplikaci → 5× klepnout na verzi)." /></div>;
  if (err) return <div className="col g12 px16"><Empty text={err} /><OButton text="Zkusit znovu" onClick={() => setTick(tick + 1)} /></div>;
  if (!data) return <Loading />;
  const days = [...data.days].reverse(); // nejstarší vlevo
  const max = Math.max(1, ...days.map((d) => Math.max(d[1], d[2])));
  const W = 320, H = 120, bw = W / days.length;
  const vers = Object.entries(data.versions).sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
  const vmax = Math.max(1, ...vers.map((v) => v[1]));
  return (
    <div className="col g12 px16" style={{ paddingTop: 4 }}>
      <AppCard>
        <div className="row g8"><Num label="Celkem" value={data.total} /><Num label="24 h" value={data.today} /></div>
        <div className="row g8"><Num label="7 dní" value={data.d7} /><Num label="30 dní" value={data.d30} /></div>
        <Muted size={12} maxLines={2} text="Jedno zařízení = jedna instalace / prohlížeč. Aplikace se ozve jednou denně." />
      </AppCard>
      <AppCard>
        <T bold>Posledních 14 dní</T>
        <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: "100%", height: "auto" }}>
          {days.map(([d, n, a], i) => {
            const x = i * bw;
            const ha = (a / max) * H, hn = (n / max) * H;
            return (
              <g key={d}>
                <rect x={x + bw * 0.12} y={H - ha} width={bw * 0.38} height={ha} rx={2} fill={C.Blue} />
                <rect x={x + bw * 0.5} y={H - hn} width={bw * 0.38} height={hn} rx={2} fill={C.Win} />
                {(i % 2 === 1 || i === days.length - 1) && <text x={x + bw / 2} y={H + 13} fontSize={9} textAnchor="middle" fill={C.Muted}>{d.slice(8, 10) + "." + d.slice(5, 7)}</text>}
              </g>
            );
          })}
        </svg>
        <div className="row g12">
          <div className="row g6"><div style={{ width: 10, height: 10, borderRadius: 2, background: C.Blue }} /><Muted size={12} text="naposledy aktivní" /></div>
          <div className="row g6"><div style={{ width: 10, height: 10, borderRadius: 2, background: C.Win }} /><Muted size={12} text="nová zařízení" /></div>
        </div>
        {[...days].reverse().map(([d, n, a]) => (
          <div className="row" key={d}>
            <Muted size={13} text={`${+d.slice(8, 10)}. ${+d.slice(5, 7)}.`} style={{ flex: 1 }} />
            <T size={13}>{`nová ${n} · aktivní ${a}`}</T>
          </div>
        ))}
      </AppCard>
      <AppCard>
        <T bold>Verze aplikace (30 dní)</T>
        {vers.length === 0 && <Muted size={13} text="Zatím žádná data." />}
        {vers.map(([v, n]) => (
          <div className="row g8" key={v}>
            <T size={13} style={{ width: 56 }}>{v}</T>
            <div style={{ flex: 1, height: 10, background: C.Tint, borderRadius: 5 }}><div style={{ width: `${(n / vmax) * 100}%`, height: 10, background: C.Blue, borderRadius: 5 }} /></div>
            <T semi size={13} style={{ width: 28, textAlign: "right" }}>{String(n)}</T>
          </div>
        ))}
      </AppCard>
      <OButton text="Obnovit" onClick={() => { setData(null); setTick(tick + 1); }} />
    </div>
  );
}

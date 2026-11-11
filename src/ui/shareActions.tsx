// Co se dá na které obrazovce sdílet + obrázky (výsledek utkání, shrnutí sezóny) + nabídka sdílení aplikace.
import { useState, type ReactNode } from "react";
import { vm, type Screen } from "../app/vm";
import { Live } from "../core/live";
import { Stis, type Match, type PlayerPage, type Zapis } from "../core/models";
import { Stats } from "../core/stats";
import { C, Muted, T, Icon, PrimaryButton, OButton } from "./components";
import { appBase, appLink, duelLink, matchLink, playerLink, shareImage, shareLink } from "./share";
import { qrSvg } from "./qr";
import { zapisStrInfo } from "./screens/Duel";
import { strPoints } from "./screens/StrScreen";
import { seasonRanges } from "./screens/Profile";
import { selectedComp } from "./screens/Ladder";

export interface ShareOpt { label: string; sub: string; icon: string; run: () => void | Promise<void> }

const seasonLabel = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;

/** Možnosti sdílení pro obrazovku (prázdné = nic ke sdílení). */
export function shareOptions(s: Screen): ShareOpt[] {
  switch (s.t) {
    case "Live": {
      const ctx = vm.next[s.team];
      const path = ctx ? vm.liveLinks.get(vm.teamKey(ctx)) : undefined;
      return path ? matchOpts(path) : [];
    }
    case "Watch": {
      const f = vm.boardMatch(s.key), w = vm.watchOf(s.key);
      const path = f?.m.zapisPath || w?.zapisPath;
      return path ? matchOpts(path) : [];
    }
    case "Shared": case "ZapisDetail": return matchOpts(s.path);
    case "Model": return [{ label: "Odkaz na popis modelu", sub: "Jak MySTIS počítá predikce – otevře ho kdokoli", icon: "share", run: () => shareLink("Jak MySTIS počítá predikce", "Jak MySTIS počítá predikce", appLink(s.section ? { m: s.section } : { m: "" })) }];
    case "Prediction": return [{ label: "Odkaz na predikci", sub: "Otevře ji i člověk bez nastavené aplikace", icon: "share", run: () => shareLink("Predikce utkání", "Predikce utkání (MySTIS)", appLink({ pr: s.data })) }];
    case "Player": {
      const p = vm.me?.path === s.path ? vm.meWithLive() : vm.players.get(s.path);
      return p ? playerOpts(p) : [];
    }
    case "Duel": {
      const ap = s.aId ? (vm.me?.id === s.aId ? vm.me.path : vm.playerPathById(s.aId)) : null;
      const bp = s.bId ? (vm.me?.id === s.bId ? vm.me.path : vm.playerPathById(s.bId)) : null;
      if (!ap || !bp) return [];
      return [{
        label: "Odkaz na vzájemné zápasy", sub: "Šance podle STR a historie zápasů", icon: "compare",
        run: () => shareLink(`${s.aName} vs. ${s.bName}`, `${s.aName} vs. ${s.bName} – vzájemné zápasy a šance podle STR`, duelLink(ap, s.aName, bp, s.bName)),
      }];
    }
    case "Ladder": {
      if (vm.ladderTab === "interni") return [];
      const c = selectedComp();
      if (!c) return [];
      const table = vm.ladderTab === "tabulka";
      const url = Stis.BASE + (table ? Stis.tabulka(c.svaz, c.rocnik, c.soutez) : Stis.zebricek(c.svaz, c.rocnik, c.soutez));
      return [{
        label: table ? "Odkaz na tabulku soutěže" : "Odkaz na žebříček soutěže", sub: `${c.label} · ${seasonLabel(c.rocnik)} (stránka STIS)`, icon: "leaderboard",
        run: () => shareLink(c.label, `${table ? "Tabulka" : "Žebříček STR"} – ${c.label} (${seasonLabel(c.rocnik)})`, url),
      }];
    }
    case "Overview": {
      const me = vm.me;
      return me ? [
        { label: "Můj aktuální stav (obrázek)", sub: "STR, graf, úspěšnost, bilance, výkon a forma", icon: "chart", run: async () => shareImage(await statusImage(me, true), "stav.png", me.name, `${me.name} – aktuální stav (MySTIS)`, playerLink(me.path)) },
        { label: "Odkaz na můj profil", sub: "STR, forma, bilance a graf", icon: "share", run: () => shareLink(me.name, `${me.name} – STR ${me.currentStr ?? "–"} (MySTIS)`, playerLink(me.path)) },
      ] : [];
    }
    default: return [];
  }
}

function matchOpts(path: string): ShareOpt[] {
  const z = vm.zapisy.get(path);
  const title = z ? `${z.home} – ${z.away}` : "Utkání";
  const text = () => {
    const zz = vm.zapisy.get(path);
    if (!zz) return "Utkání v MySTIS";
    const [h, a] = vm.scoreOf(zz);
    return vm.finished(zz) ? `${zz.home} ${h}:${a} ${zz.away} – zápis o utkání` : `Živě: ${zz.home} ${h}:${a} ${zz.away}`;
  };
  const opts: ShareOpt[] = [{
    label: "Odkaz na utkání", sub: "Během utkání živý stav, po konci celý zápis", icon: "list",
    run: () => shareLink(title, text(), matchLink(path)),
  }];
  if (z && z.games.some((g) => g.result != null)) opts.push({
    label: "Obrázek výsledku", sub: "Skóre, hry a změny STR – pro skupinu družstva", icon: "trophy",
    run: async () => {
      const zz = vm.zapisy.get(path)!;
      const blob = await matchImage(zz);
      await shareImage(blob, "utkani.png", title, text(), matchLink(path));
    },
  });
  return opts;
}

function playerOpts(p: PlayerPage): ShareOpt[] {
  const isMe = vm.me?.path === p.path;
  return [
    { label: isMe ? "Můj aktuální stav (obrázek)" : "Aktuální stav (obrázek)", sub: "STR, graf, úspěšnost, bilance, výkon a forma", icon: "trophy", run: async () => shareImage(await statusImage(p, isMe), "stav.png", p.name, `${p.name} – aktuální stav (MySTIS)`, playerLink(p.path)) },
    { label: "Odkaz na profil", sub: "STR, forma, bilance a graf", icon: "chart", run: () => shareLink(p.name, `${p.name} – STR ${p.currentStr ?? "–"} (MySTIS)`, playerLink(p.path)) },
    {
      label: "Shrnutí sezóny (obrázek)", sub: "STR, bilance, forma a nejcennější výhra", icon: "event",
      run: async () => shareImage(await seasonImage(p), "sezona.png", p.name, `${p.name} – sezóna v číslech`, playerLink(p.path)),
    },
  ];
}

// ---------------------------------------------------------------- kreslení
const FONT = "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const W = 1080;
function canvas(h: number) {
  const c = document.createElement("canvas");
  c.width = W; c.height = h;
  const g = c.getContext("2d")!;
  g.textBaseline = "alphabetic";
  return { c, g };
}
const font = (g: CanvasRenderingContext2D, size: number, weight = 400) => { g.font = `${weight} ${size}px ${FONT}`; };
function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t.trimEnd() + "…";
}
function txt(g: CanvasRenderingContext2D, text: string, x: number, y: number, o: { size: number; weight?: number; color: string; align?: CanvasTextAlign; max?: number }) {
  font(g, o.size, o.weight ?? 400);
  g.fillStyle = o.color; g.textAlign = o.align ?? "left";
  g.fillText(o.max ? fit(g, text, o.max) : text, x, y);
}
function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  g.fillStyle = color; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill();
}
function footer(g: CanvasRenderingContext2D, y: number, dark: boolean) {
  txt(g, `MySTIS · ${appBase().replace(/^https?:\/\//, "").replace(/\/$/, "")}`, W / 2, y, { size: 26, color: dark ? C.MutedOnNavy : C.Muted, align: "center" });
}
const toBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Obrázek se nepodařilo vytvořit"))), "image/png"));
const short = (n: string) => n.replace(/\(.*?\)/g, "").trim();

/** Obrázek výsledku utkání: skóre, hry a bilance / změny STR hráčů. */
export async function matchImage(z: Zapis): Promise<Blob> {
  await document.fonts?.ready;
  const fin = vm.finished(z);
  const [hs, as_] = vm.scoreOf(z);
  const strs = zapisStrInfo(z.path);
  const games = z.games.filter((g) => g.result != null || g.homeNames.length || g.awayNames.length);
  const lg = Live.fromZapis(z, strs.strOf, (id, n) => vm.rangeOf(id, n));
  const st = Live.evaluate(lg, vm.fmtOf(z));
  const homeP = st.players.filter((p) => p.home && p.played > 0), awayP = st.players.filter((p) => !p.home && p.played > 0);
  const rowH = 62, headH = 400, pRows = Math.max(homeP.length, awayP.length);
  const H = headH + 40 + games.length * rowH + 40 + (pRows ? 90 + pRows * 56 : 0) + 110;
  const { c, g } = canvas(H);
  g.fillStyle = C.Ground; g.fillRect(0, 0, W, H);
  // hlavička
  g.fillStyle = C.Navy; g.fillRect(0, 0, W, headH);
  const info = [z.competition, z.round.trim() ? `${z.round.trim()}. kolo` : null, z.dateText.split(" ")[0] || null].filter((x) => x).join(" · ");
  txt(g, info, 60, 84, { size: 30, color: C.MutedOnNavy, max: W - 120 });
  txt(g, z.home, 60, 190, { size: 40, weight: 700, color: "#fff", max: 330 });
  txt(g, z.away, W - 60, 190, { size: 40, weight: 700, color: "#fff", align: "right", max: 330 });
  txt(g, `${hs} : ${as_}`, W / 2, 210, { size: 112, weight: 800, color: "#fff", align: "center" });
  const status = fin ? (hs > as_ ? `Vítězství ${z.home}` : hs < as_ ? `Vítězství ${z.away}` : "Remíza") : `Průběžný stav · ${st.played}/${z.games.length} her`;
  rrect(g, W / 2 - 280, 270, 560, 64, 32, fin ? C.Navy2 : C.Live);
  txt(g, status, W / 2, 313, { size: 28, weight: 600, color: "#fff", align: "center", max: 520 });
  // hry
  let y = headH + 40;
  rrect(g, 30, y - 10, W - 60, games.length * rowH + 20, 24, "#fff");
  for (const gm of games) {
    const r = gm.result;
    txt(g, `${gm.no}.`, 60, y + 40, { size: 26, color: C.Muted });
    const hn = gm.homeNames.map(short).join(" + ") || (gm.wo ? "nenastoupil(a) · WO" : "—"), an = gm.awayNames.map(short).join(" + ") || (gm.wo ? "nenastoupil(a) · WO" : "—");
    txt(g, hn, 120, y + 40, { size: 27, weight: r === 1 ? 700 : 400, color: C.Ink, max: 360 });
    txt(g, "–", 500, y + 40, { size: 27, color: C.Muted, align: "center" });
    txt(g, an, 530, y + 40, { size: 27, weight: r === -1 ? 700 : 400, color: C.Ink, max: 360 });
    if (r != null) {
      rrect(g, W - 160, y + 10, 100, 44, 12, r === 1 ? C.Win : C.OrangeText);
      txt(g, `${gm.homeSets ?? 0}:${gm.awaySets ?? 0}`, W - 110, y + 42, { size: 26, weight: 700, color: "#fff", align: "center" });
    } else txt(g, "nehráno", W - 60, y + 40, { size: 22, color: C.Muted, align: "right" });
    y += rowH;
  }
  y += 40;
  // hráči: bilance dvouher a změna STR (odhad)
  if (pRows) {
    txt(g, "Dvouhry hráčů", 60, y + 40, { size: 32, weight: 700, color: C.Ink });
    txt(g, strs.ready ? "změna STR (odhad)" : "", W - 60, y + 40, { size: 22, color: C.Muted, align: "right" });
    y += 70;
    rrect(g, 30, y - 10, W - 60, pRows * 56 + 20, 24, "#fff");
    const col = (ps: typeof homeP, x0: number) => ps.forEach((p, i) => {
      const yy = y + 38 + i * 56;
      txt(g, short(p.name), x0, yy, { size: 26, weight: 600, color: C.Ink, max: 270 });
      txt(g, `${p.won}:${p.played - p.won}`, x0 + 350, yy, { size: 26, weight: 700, color: p.won * 2 >= p.played ? C.Win : C.OrangeText, align: "right" });
      if (strs.ready) {
        const d = Math.round(p.strDelta);
        txt(g, d > 0 ? `+${d}` : `${d}`, x0 + 450, yy, { size: 26, weight: 700, color: C.delta(d), align: "right" });
      }
    });
    col(homeP, 60); col(awayP, W / 2 + 20);
    y += pRows * 56 + 30;
  }
  footer(g, H - 44, false);
  return toBlob(c);
}

/** Obrázek „aktuální stav“: modrý panel z Přehledu (STR, graf, dlaždice) + forma z posledních 8 (bez soupeřů). */
export async function statusImage(p: PlayerPage, isMe: boolean): Promise<Blob> {
  await document.fonts?.ready;
  const pl = isMe ? vm.meWithLive() ?? p : vm.withLive(p);
  const ch = pl.chronological;
  const season = p.matches.length ? Math.max(...p.matches.map((m) => m.season)) : Stis.currentRocnik();
  const sm = ch.filter((m) => m.season === season);
  const cur = p.currentStr;
  let provisional: number | null = null;
  if (isMe) { const live = vm.myLiveGames(); for (let i = live.length - 1; i >= 0; i--) if (live[i].strAfter != null) { provisional = Math.round(live[i].strAfter!); break; } }
  const shown = provisional ?? cur;
  const start = sm[0]?.strBefore ?? null;
  const change = shown != null && start != null ? shown - start : null;
  // dlaždice: na Přehledu podle zobrazené soutěže, jinak celá sezóna
  const scopeTeam = isMe ? vm.ovScopeTeam : null;
  const scope = scopeTeam ? sm.filter((m) => Stats.fold(m.myTeam) === Stats.fold(scopeTeam)) : sm;
  const scopeLabel = isMe && vm.ovScopeComp ? vm.ovScopeComp : "celá sezóna";
  const w = scope.filter((m) => m.won).length, l = scope.length - w;
  const perf = Stats.overExpectedOf(scope);
  const form = Stats.form(pl, 8, 1e9, season).last.map((m) => m.won).reverse();
  const unofficial = ch.slice(-8).some((m) => m.unofficial) || provisional != null;
  const teams = (p.currentSeason?.teams ?? []).filter((t) => !t.notOnRoster).map((t) => t.name).join(", ");
  const vals = p.graph.map((x) => x.str).filter((x): x is number => x != null).slice(-40);
  if (provisional != null) vals.push(provisional);

  const H = 1230;
  const { c, g } = canvas(H);
  g.fillStyle = C.Ground; g.fillRect(0, 0, W, H);
  // modrý panel
  g.fillStyle = C.Navy; g.beginPath(); g.roundRect(0, 0, W, 760, [0, 0, 56, 56]); g.fill();
  rrect(g, 60, 60, 96, 96, 48, C.Blue);
  const ini = p.name.split(" ").map((x) => x[0] ?? "").join("").slice(0, 2).toUpperCase();
  txt(g, ini, 108, 122, { size: 38, weight: 700, color: "#fff", align: "center" });
  txt(g, p.name, 186, 100, { size: 44, weight: 800, color: "#fff", max: W - 246 });
  txt(g, [p.clubName, teams].filter((x) => x).join(" · "), 186, 146, { size: 26, color: C.MutedOnNavy, max: W - 246 });
  txt(g, unofficial ? "STR · ODHAD · NEOFICIÁLNÍ VÝSLEDKY" : "STR", 60, 228, { size: 26, weight: 600, color: C.MutedOnNavy });
  txt(g, shown != null ? String(shown) : "–", 52, 390, { size: 170, weight: 800, color: "#fff" });
  if (change != null) txt(g, `${change > 0 ? "▲ +" : change < 0 ? "▼ −" : "± "}${Math.abs(change)} za sezónu`, 60, 450, { size: 34, weight: 700, color: change > 0 ? C.WinLight : change < 0 ? C.Peach : C.MutedOnNavy });
  if (provisional != null && cur != null) txt(g, `oficiálně ${cur} · ≈ odhad, zatím neoficiální`, 60, 494, { size: 24, color: C.MutedOnNavy });
  // graf
  if (vals.length >= 2) {
    const gx = 560, gy = 250, gw = 460, gh = 220;
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const px = (i: number) => gx + (gw * i) / (vals.length - 1), py = (v: number) => (mx === mn ? gy + gh / 2 : gy + gh - (gh * (v - mn)) / (mx - mn));
    g.strokeStyle = C.BlueLight; g.lineWidth = 5; g.lineJoin = "round"; g.lineCap = "round"; g.beginPath();
    vals.forEach((v, i) => (i ? g.lineTo(px(i), py(v)) : g.moveTo(px(i), py(v))));
    g.stroke();
    const ex = px(vals.length - 1), ey = py(vals[vals.length - 1]);
    const last = ch.length ? ch[ch.length - 1] : null;
    const key = (x: Match) => x.zapisPath || x.dateText + "|" + x.myTeam;
    const first = last ? ch.find((x) => key(x) === key(last) && x.strBefore != null) : null;
    const d = provisional != null && cur != null ? provisional - cur : first && cur != null ? cur - first.strBefore! : 0;
    g.fillStyle = d > 0 ? C.WinLight : d < 0 ? "#FF7A45" : C.Grey; g.beginPath();
    if (d > 0) { g.moveTo(ex - 14, ey + 9); g.lineTo(ex + 14, ey + 9); g.lineTo(ex, ey - 15); }
    else if (d < 0) { g.moveTo(ex - 14, ey - 9); g.lineTo(ex + 14, ey - 9); g.lineTo(ex, ey + 15); }
    else g.arc(ex, ey, 9, 0, Math.PI * 2);
    g.fill();
  }
  // dlaždice
  const tile = (x: number, label: string, value: string, sub: string, color: string) => {
    rrect(g, x, 540, 300, 180, 28, C.Navy2);
    txt(g, label, x + 30, 590, { size: 26, color: C.MutedOnNavy });
    txt(g, value, x + 30, 662, { size: 60, weight: 800, color, max: 250 });
    txt(g, sub, x + 30, 702, { size: 22, color: C.MutedOnNavy, max: 250 });
  };
  tile(60, "Úspěšnost", scope.length ? Stats.pct(w / scope.length).replace(" ", "") : "–", scopeLabel, "#fff");
  tile(390, "Bilance", `${w}–${l}`, scopeLabel, "#fff");
  const pv = perf.sample ? perf.over : null;
  tile(720, "Výkon", pv == null ? "–" : `${pv > 0 ? "+" : pv < 0 ? "−" : ""}${Math.abs(pv).toFixed(1).replace(".", ",")}`, `${perf.sample} zápasů`, pv == null ? "#fff" : pv >= 0 ? C.WinLight : C.Peach);
  // forma
  rrect(g, 30, 800, W - 60, 290, 32, "#fff");
  txt(g, "Forma · posledních 8", 70, 868, { size: 32, weight: 700, color: C.Ink });
  txt(g, `${form.filter((x) => x).length} výher · ${form.filter((x) => !x).length} proher`, W - 70, 868, { size: 26, color: C.Muted, align: "right" });
  const sz = 104, gap = (W - 140 - 8 * sz) / 7;
  form.forEach((won, i) => {
    const x = 70 + i * (sz + gap), y = 910;
    if (i === form.length - 1) { g.strokeStyle = won ? C.Win : C.OrangeText; g.lineWidth = 5; g.beginPath(); g.roundRect(x - 8, y - 8, sz + 16, sz + 16, 34); g.stroke(); }
    rrect(g, x, y, sz, sz, 28, won ? C.Win : C.OrangeText);
    txt(g, won ? "V" : "P", x + sz / 2, y + 70, { size: 44, weight: 800, color: "#fff", align: "center" });
  });
  txt(g, `nejnovější vpravo${unofficial ? " · ≈ vč. neoficiálních výsledků" : ""}`, W / 2, 1060, { size: 22, color: C.Muted, align: "center" });
  const d = new Date();
  txt(g, `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`, W / 2, H - 80, { size: 24, color: C.Muted, align: "center" });
  footer(g, H - 40, false);
  return toBlob(c);
}

/** Obrázek „sezóna v číslech“ hráče. */
export async function seasonImage(p: PlayerPage): Promise<Blob> {
  await document.fonts?.ready;
  const ch = p.chronological;
  const season = ch.length ? Math.max(...ch.map((m) => m.season)) : Stis.currentRocnik();
  const ms = ch.filter((m) => m.season === season);
  const w = ms.filter((m) => m.won).length, l = ms.length - w;
  const range = seasonRanges(strPoints(p, "vse")).get(season) ?? null;
  // stejně jako Přehled: aktuální STR − STR před prvním zápasem sezóny
  const delta = vm.seasonStrChange(p) ?? (range ? range[1] - range[0] : null);
  const best = ms.filter((m) => m.won && m.oppStrBefore != null && m.strBefore != null)
    .sort((a, b) => (b.oppStrBefore! - b.strBefore!) - (a.oppStrBefore! - a.strBefore!))[0] ?? null;
  const form = ch.slice(-8).map((m) => m.won);
  const pts = strPoints(p, "sez");
  const H = 1350;
  const { c, g } = canvas(H);
  g.fillStyle = C.Navy; g.fillRect(0, 0, W, H);
  txt(g, `Sezóna ${seasonLabel(season)}`, 70, 110, { size: 34, weight: 600, color: C.Peach });
  txt(g, p.name, 70, 190, { size: 64, weight: 800, color: "#fff", max: W - 140 });
  txt(g, [p.clubName, p.birthYear ? `nar. ${p.birthYear}` : null].filter((x) => x).join(" · "), 70, 245, { size: 30, color: C.MutedOnNavy, max: W - 140 });
  // dlaždice
  const tile = (x: number, label: string, value: string, sub: string, color: string) => {
    rrect(g, x, 300, 300, 210, 28, C.Navy2);
    txt(g, label, x + 30, 352, { size: 26, color: C.MutedOnNavy });
    txt(g, value, x + 30, 438, { size: 72, weight: 800, color, max: 250 });
    txt(g, sub, x + 30, 482, { size: 24, color: C.MutedOnNavy, max: 250 });
  };
  tile(70, "STR", `${p.currentStr ?? "–"}`, delta != null ? `za sezónu ${delta >= 0 ? "+" : "−"}${Math.abs(delta)}` : "", "#fff");
  tile(390, "Bilance", `${w}–${l}`, `${ms.length} zápasů`, "#fff");
  tile(710, "Úspěšnost", ms.length ? Stats.pct(w / ms.length).replace(" ", "") : "–", "všechny zápasy", ms.length && w * 2 >= ms.length ? C.WinLight : C.Peach);
  // graf STR v sezóně
  const gx = 70, gy = 560, gw = W - 140, gh = 330;
  rrect(g, gx, gy, gw, gh, 28, C.Navy2);
  txt(g, "Vývoj STR", gx + 30, gy + 52, { size: 26, color: C.MutedOnNavy });
  if (pts.length >= 2) {
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 10, y1 = Math.max(...ys) + 10;
    const px = (v: number) => gx + 40 + ((v - x0) / Math.max(1, x1 - x0)) * (gw - 80);
    const py = (v: number) => gy + gh - 40 - ((v - y0) / Math.max(1, y1 - y0)) * (gh - 120);
    g.strokeStyle = C.BlueLight; g.lineWidth = 6; g.lineJoin = "round"; g.beginPath();
    pts.forEach((q, i) => (i ? g.lineTo(px(q[0]), py(q[1])) : g.moveTo(px(q[0]), py(q[1]))));
    g.stroke();
    txt(g, `začátek ${ys[0]}`, gx + 30, gy + gh - 22, { size: 24, color: C.MutedOnNavy });
    txt(g, `${ys[ys.length - 1]}`, gx + gw - 40, gy + 52, { size: 30, weight: 700, color: "#fff", align: "right" });
  } else txt(g, "málo dat", gx + gw / 2, gy + gh / 2, { size: 26, color: C.MutedOnNavy, align: "center" });
  // forma
  txt(g, "Forma (posledních 8)", 70, 960, { size: 26, color: C.MutedOnNavy });
  form.forEach((won, i) => {
    rrect(g, 70 + i * 82, 985, 66, 66, 33, won ? C.Win : C.OrangeText);
    txt(g, won ? "V" : "P", 70 + i * 82 + 33, 1030, { size: 30, weight: 800, color: "#fff", align: "center" });
  });
  // nejcennější výhra
  if (best) {
    rrect(g, 70, 1090, W - 140, 140, 28, C.Navy2);
    txt(g, "Nejcennější výhra", 100, 1140, { size: 26, color: C.MutedOnNavy });
    const d = best.oppStrBefore! - best.strBefore!;
    txt(g, `${best.opponent} · STR ${best.oppStrBefore}${d > 0 ? ` (o ${d} víc)` : ""} · ${best.score}`, 100, 1195, { size: 32, weight: 700, color: "#fff", max: W - 200 });
  }
  footer(g, H - 50, true);
  return toBlob(c);
}

// ---------------------------------------------------------------- spodní nabídky
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(10,20,40,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div className="col g12" onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", width: "100%", maxWidth: 560, borderRadius: "20px 20px 0 0", padding: "18px 16px calc(18px + env(safe-area-inset-bottom))", maxHeight: "85vh", overflowY: "auto" }}>
        <div className="row"><T bold size={18} style={{ flex: 1 }}>{title}</T><span className="clickable" style={{ fontSize: 22, color: C.Muted, padding: "0 4px" }} onClick={onClose}>✕</span></div>
        {children}
      </div>
    </div>
  );
}

export function ShareSheet({ opts, onClose }: { opts: ShareOpt[]; onClose: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  return (
    <Sheet title="Sdílet" onClose={onClose}>
      {opts.map((o, i) => (
        <div key={i} className="row g12 clickable" style={{ padding: "10px 4px", opacity: busy != null && busy !== i ? 0.5 : 1 }}
          onClick={async () => {
            if (busy != null) return;
            setBusy(i);
            try { await o.run(); onClose(); } catch (e) { vm.toast((e as Error).message || "Sdílení se nepovedlo"); setBusy(null); }
          }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: C.Tint, color: C.Blue, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name={o.icon} size={22} /></div>
          <div className="col w1">
            <T semi size={15}>{busy === i ? "Připravuji…" : o.label}</T>
            <Muted size={12} text={o.sub} />
          </div>
        </div>
      ))}
    </Sheet>
  );
}

/** QR kód s odkazem na aplikaci + tlačítko sdílet. */
export function AppShareCard({ dark = false }: { dark?: boolean }) {
  const url = appBase();
  return (
    <div className="col g12" style={{ alignItems: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 6, lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: qrSvg(url, 200) }} />
      <Muted size={13} maxLines={3} color={dark ? C.MutedOnNavy : C.Muted} style={{ textAlign: "center" }}
        text="Ukažte QR kód spoluhráči – načte ho fotoaparátem telefonu a aplikaci si otevře a nainstaluje." />
      <div className="row g8" style={{ width: "100%" }}>
        <div style={{ flex: 1 }}><PrimaryButton full text="Sdílet odkaz" onClick={() => shareLink("MySTIS", "MySTIS – statistiky, žebříčky a predikce STR ze STIS pro stolní tenis", url)} /></div>
      </div>
      <T size={12} color={dark ? C.MutedOnNavy : C.Muted}>{url.replace(/^https?:\/\//, "")}</T>
    </div>
  );
}

export function AppShareSheet({ onClose }: { onClose: () => void }) {
  return <Sheet title="Sdílet aplikaci" onClose={onClose}><AppShareCard /></Sheet>;
}

/** Spodní pruh pro hosta (otevřel sdílený odkaz bez vlastního profilu). */
export function GuestBar() {
  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 25, background: C.Navy, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))" }}>
      <div className="row g12" style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="col w1">
          <T semi size={14} color="#fff">MySTIS</T>
          <Muted size={12} color={C.MutedOnNavy} text="Statistiky a predikce STR ze STIS" />
        </div>
        <OButton text="Vytvořit vlastní statistiky" onClick={() => vm.leaveGuest()} style={{ flex: "none", background: "#fff" }} />
      </div>
    </div>
  );
}

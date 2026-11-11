// „Jak počítáme predikce“ – srozumitelný popis modelu (odkazuje se na něj u každé predikce).
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { vm } from "../../app/vm";
import { StrModel } from "../../core/stats";
import { AppCard, C, Muted, T } from "../components";

export type ModelSection = "hra" | "utkani" | "sestavy" | "zive" | "sezona" | "str" | "vykon";

/** Malý odkaz „Jak se to počítá? ›“ u predikce. */
export function ModelLink({ section, dark = false, style }: { section: ModelSection; dark?: boolean; style?: CSSProperties }) {
  return (
    <span className="clickable" onClick={(e) => { e.stopPropagation(); vm.go({ t: "Model", section }); }}
      style={{ fontSize: 12, fontWeight: 600, color: dark ? "#C7D2FE" : C.Blue, alignSelf: "flex-start", ...style }}>Jak se to počítá? ›</span>
  );
}

function Sec({ id, title, children }: { id: ModelSection; title: string; children: ReactNode }) {
  return (
    <AppCard>
      <div id={`model-${id}`} style={{ scrollMarginTop: 70 }} />
      <T bold size={16}>{title}</T>
      {children}
    </AppCard>
  );
}
const P = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 14, lineHeight: 1.5, color: C.Ink }}>{children}</div>;

/** Graf: šance silnějšího hráče podle rozdílu STR. */
function WinCurve() {
  const W = 320, H = 150, x0 = 36, y0 = 12, w = W - x0 - 12, h = H - y0 - 30;
  const X = (d: number) => x0 + (d / 400) * w, Y = (p: number) => y0 + (1 - (p - 0.5) / 0.5) * h;
  const pts = Array.from({ length: 41 }, (_, i) => i * 10).map((d) => `${X(d)},${Y(StrModel.winProbability(1500 + d, 1500))}`).join(" ");
  const marks = [0, 50, 100, 200, 300];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 420 }} role="img" aria-label="Šance silnějšího hráče podle rozdílu STR">
      {[0.5, 0.75, 1].map((p) => <g key={p}><line x1={x0} x2={x0 + w} y1={Y(p)} y2={Y(p)} stroke="#E3E7EF" /><text x={x0 - 6} y={Y(p) + 4} fontSize="10" textAnchor="end" fill={C.Muted}>{Math.round(p * 100)} %</text></g>)}
      <polyline points={pts} fill="none" stroke={C.Blue} strokeWidth="2.5" />
      {marks.map((d) => { const p = StrModel.winProbability(1500 + d, 1500); return <g key={d}><circle cx={X(d)} cy={Y(p)} r="3.5" fill={C.Blue} /><text x={X(d)} y={Y(p) - 8} fontSize="10" textAnchor="middle" fill={C.Ink}>{Math.round(p * 100)}</text><text x={X(d)} y={H - 12} fontSize="10" textAnchor="middle" fill={C.Muted}>{d}</text></g>; })}
      <text x={x0 + w / 2} y={H} fontSize="10" textAnchor="middle" fill={C.Muted}>rozdíl STR</text>
    </svg>
  );
}

export function ModelScreen({ section }: { section?: string | null }) {
  useEffect(() => {
    if (!section) return;
    const t = setTimeout(() => document.getElementById(`model-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    return () => clearTimeout(t);
  }, [section]);
  return (
    <div className="col g12 px16" style={{ paddingTop: 12 }}>
      <Muted size={14} maxLines={6} color={C.Ink} text="Všechny predikce v MySTIS vycházejí jen z STR hráčů (systém eSTeR na STIS). Jsou to odhady, ne jistoty – model neví o nemoci, únavě, absencích ani o tom, komu kdo „sedí“." />
      <Sec id="hra" title="1. Šance v jedné hře">
        <P>Šance na výhru ve dvouhře se počítá jen z rozdílu STR obou hráčů. Je to stejná křivka jako u šachového Elo: každých 200 bodů rozdílu znamená zhruba desetkrát lepší poměr výher.</P>
        <WinCurve />
        <Muted size={12} maxLines={3} text="Rozdíl 0 = 50 %, 50 = 64 %, 100 = 76 %, 200 = 91 %, 300 = 97 % pro silnějšího. Ve čtyřhře se počítá s průměrným STR dvojice." />
      </Sec>
      <Sec id="utkani" title="2. Utkání družstev">
        <P>Spočítají se šance všech her utkání podle formátu soutěže (např. 4 hráči, 18 her, do 10 bodů – formát aplikace pozná ze zápisů soutěže). Z nich vyjde pravděpodobnost každého konečného výsledku: odtud výhra / remíza / prohra a nejpravděpodobnější skóre.</P>
        <P><b>Forma dne:</b> hry jednoho utkání spolu souvisí – celé družstvo může mít lepší nebo horší den. Výpočet proto počítá s tím, že výkon družstva v utkání kolísá zhruba o ±50 STR. Díky tomu ani velký favorit nikdy nemá jistotu; aplikace před koncem utkání ukazuje nejvýš „&gt;99 %“.</P>
      </Sec>
      <Sec id="sestavy" title="3. Sestavy příštího utkání">
        <P>Do sestavy jdou hráči, kteří za družstvo nastoupili aspoň v ⅓ jeho utkání, seřazení podle STR a trendu. Chybějící místa doplní ti, kdo nastupovali nejčastěji (označení jako náhradníci). Na začátku sezóny se vychází z minulé sezóny. Svou sestavu i sestavu soupeře lze ručně upravit.</P>
      </Sec>
      <Sec id="zive" title="4. Živé utkání">
        <P>Odehrané hry jsou dané. U rozehrané hry se šance přepočítá podle stavu na sety, zbytek se počítá jako v bodě 2. Dokud nejsou zapsané sestavy dvouher, predikce se neukazuje. Kontumace (WO) se do predikcí nepočítají.</P>
      </Sec>
      <Sec id="sezona" title="5. Predikce konce sezóny">
        <P>Každé zbývající utkání soutěže dostane šance podle bodu 2. Sestava každého družstva = hráči, kteří za něj opravdu nastupují (podle bilance na soupisce STIS); na úplném začátku sezóny nejsilnější hráči soupisky. Celý zbytek sezóny se pak 5 000× náhodně „odehraje“ a z výsledků vznikne pravděpodobnost každého umístění. Body za výhru / remízu / prohru aplikace pozná z tabulky.</P>
      </Sec>
      <Sec id="str" title="6. Predikce STR na konci sezóny">
        <P>Vychází z aktuálního STR, z výkonu proti očekávání v posledních zápasech (trend) a z počtu zbývajících zápasů. Pásmo ukazuje rozsah, do kterého se STR s 80% pravděpodobností vejde – čím víc zápasů zbývá, tím je širší.</P>
      </Sec>
      <Sec id="vykon" title="7. Odhad změny STR a výkon">
        <P>Změna STR se počítá podle pravidel eSTeR: výhra nad stejně silným soupeřem +6, proti silnějšímu víc, proti slabšímu méně (až 0); poražený ztratí tolik, kolik vítěz získá. Ověřeno na 5 080 skutečných zápasech: 72 % změn přesně, průměrná odchylka 0,3 bodu. Neoficiální výsledky jsou odhad, dokud je STIS nepřepočítá.</P>
        <P><b>Výkon</b> = o kolik zápasů hráč vyhrál víc (nebo méně), než odpovídá šancím podle STR. Kladné číslo znamená, že hraje nad své STR.</P>
      </Sec>
      <Muted size={12} maxLines={3} text="Neoficiální aplikace; oficiální výsledky, body a STR platí vždy podle STIS." />
      <div style={{ height: 8 }} />
    </div>
  );
}

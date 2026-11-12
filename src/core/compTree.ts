// Katalog svazů a soutěží ČAST (STIS stránka /oblast/svaz-420000/rocnik-R, proměnná menu_settings).
// Celá republika v jedné stránce: ČAST → krajské svazy → okresní/regionální svazy, u každého soutěže s plným názvem.
import seed2026 from "./compCatalog2026.json";

export interface TreeComp { id_soutez: string; nazev: string; kat: string }
export interface TreeSvaz { id: string; nazev: string; typ: string; souteze: TreeComp[]; svazy?: Record<string, TreeSvaz> }
export interface CompTreeData { rocnik: number; svazy: Record<string, TreeSvaz> }

/** Plochý záznam soutěže pro hledání a názvy. */
export interface CompEntry { svaz: string; rocnik: number; soutez: string; name: string; kat: string; svazName: string; kraj: string | null }

export const CompTree = {
  ROOT: "420000",
  /** vestavěný katalog (aplikace ho nemusí stahovat) */
  seed(rocnik: number): CompTreeData | null { return (seed2026 as CompTreeData).rocnik === rocnik ? (seed2026 as CompTreeData) : null; },
  /** Vytáhne menu_settings ze stránky oblasti. */
  parse(html: string, rocnik: number): CompTreeData | null {
    const m = /var\s+menu_settings\s*=\s*(\{[\s\S]*?\})\s*;\s*(?:\n|<\/script>)/.exec(html);
    if (!m) return null;
    try {
      const d = JSON.parse(m[1]) as { svazy?: Record<string, TreeSvaz> };
      return d.svazy && Object.keys(d.svazy).length ? { rocnik, svazy: d.svazy } : null;
    } catch { return null; }
  },
  /** Všechny soutěže stromu (svaz → soutěže, i podřízené svazy). */
  entries(t: CompTreeData): CompEntry[] {
    const out: CompEntry[] = [];
    const walk = (s: TreeSvaz, kraj: string | null) => {
      for (const c of s.souteze ?? []) out.push({ svaz: s.id, rocnik: t.rocnik, soutez: c.id_soutez, name: c.nazev.trim(), kat: c.kat, svazName: s.nazev, kraj });
      for (const sub of Object.values(s.svazy ?? {})) walk(sub, kraj ?? s.id);
    };
    for (const s of Object.values(t.svazy)) walk(s, null);
    return out;
  },
  /** Svaz podle id (a jeho nadřízený kraj). */
  find(t: CompTreeData, id: string): { svaz: TreeSvaz; parent: TreeSvaz | null } | null {
    for (const s of Object.values(t.svazy)) {
      if (s.id === id) return { svaz: s, parent: null };
      for (const sub of Object.values(s.svazy ?? {})) if (sub.id === id) return { svaz: sub, parent: s };
    }
    return null;
  },
  /** Kategorie soutěže česky. */
  katLabel(k: string): string {
    if (k === "male") return "Muži";
    if (k === "female") return "Ženy";
    const m = /^([MF])(\d+)$/.exec(k);
    return m ? `Mládež U${m[2]}${m[1] === "F" ? " – dívky" : ""}` : k;
  },
};

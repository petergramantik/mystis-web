import type { CSSProperties } from "react";
import { vm } from "../app/vm";
import { C } from "./components";
import type { ModelSection } from "./screens/Model";

/** Klepnutí na už zvolený model otevře vysvětlení v „Jak počítáme“. Přepínač modelu u predikcí: STR (základní) | STR+ (komplexní – vzájemné zápasy, výhoda domácích). Platí všude. */
export function ModelToggle({ dark = false, style, help = "hra" }: { dark?: boolean; style?: CSSProperties; help?: ModelSection }) {
  const on = vm.complexOn;
  const seg = (label: string, active: boolean, v: boolean) => (
    <span className="clickable" onClick={(e) => { e.stopPropagation(); if (on !== v) vm.setComplex(v); else vm.go({ t: "Model", section: v ? "complex" : help }); }}
      style={{ padding: "2px 9px", borderRadius: 10, fontSize: 12, fontWeight: 700, background: active ? (dark ? "#fff" : C.Blue) : "transparent", color: active ? (dark ? C.Navy : "#fff") : dark ? C.MutedOnNavy : C.Muted }}>{label}</span>
  );
  return (
    <span title="STR = jen STR hráčů · STR+ = navíc vzájemné zápasy a výhoda domácích"
      style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: 2, borderRadius: 12, border: `1px solid ${dark ? "rgba(255,255,255,.3)" : C.Line}`, flex: "none", ...style }}>
      {seg("STR", !on, false)}{seg("STR+", on, true)}
    </span>
  );
}

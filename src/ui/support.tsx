// Dobrovolná podpora vývoje: nenápadná karta (Přehled, živé utkání, zápis) + QR Platba.
import { useState } from "react";
import { vm } from "../app/vm";
import { AUTHOR } from "../app/version";
import { C, Muted, T, OButton, TextField } from "./components";
import { qrSvg } from "./qr";

export const SUPPORT_ACCOUNT = "2205499019/3030";
export const SUPPORT_IBAN = "CZ0930300000002205499019";
const YEAR = 365 * 24 * 3600_000;

/** Řetězec QR Platby (Short Payment Descriptor, český standard). */
export function spd(amount: number | null): string {
  return ["SPD*1.0", `ACC:${SUPPORT_IBAN}`, amount ? `AM:${amount.toFixed(2)}` : null, "CC:CZK", "MSG:MYSTIS PODPORA"].filter((x) => x).join("*");
}

export const supportHidden = () => Date.now() < vm.prefs.supportHiddenUntil;

/** Karta „Podpořit vývoj“ se třemi tlačítky; [always] = i když ji uživatel skryl (O aplikaci). */
export function SupportStrip({ always = false, dark = false }: { always?: boolean; dark?: boolean }) {
  const [amount, setAmount] = useState<number | "custom" | null>(null);
  if (!always && supportHidden()) return null;
  const btn = (label: string, v: number | "custom") => (
    <button className="chip" style={{ flex: 1, height: 36, justifyContent: "center" }} onClick={() => setAmount(v)}>{label}</button>
  );
  return (
    <>
      <div className="col g8" style={{ padding: "12px 14px", borderRadius: 16, border: `1px solid ${dark ? "rgba(255,255,255,.15)" : C.Line}` }}>
        <div className="col">
          <T semi size={14} color={dark ? "#fff" : C.Ink}>☕ Podpořit vývoj</T>
          <Muted size={12} color={dark ? C.MutedOnNavy : C.Muted} text="Aplikace je zdarma a vzniká ve volném čase. Dobrovolný příspěvek pomůže." />
        </div>
        <div className="row g8">{btn("50 Kč", 50)}{btn("200 Kč", 200)}{btn("Vlastní", "custom")}</div>
      </div>
      {amount != null && <SupportSheet initial={amount} onClose={() => setAmount(null)} />}
    </>
  );
}

function SupportSheet({ initial, onClose }: { initial: number | "custom"; onClose: () => void }) {
  const [custom, setCustom] = useState("");
  const amount = initial === "custom" ? (parseInt(custom.replace(/\D/g, ""), 10) || null) : initial;
  const copy = async () => {
    try { await navigator.clipboard.writeText(SUPPORT_ACCOUNT); vm.toast("Číslo účtu zkopírováno"); } catch { vm.toast(SUPPORT_ACCOUNT); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(10,20,40,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div className="col g12" onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", width: "100%", maxWidth: 560, borderRadius: "20px 20px 0 0", padding: "18px 16px calc(18px + env(safe-area-inset-bottom))", maxHeight: "90vh", overflowY: "auto", color: C.Ink }}>
        <div className="row"><T bold size={18} style={{ flex: 1 }}>{`Podpořit vývoj${amount ? ` · ${amount} Kč` : ""}`}</T><span className="clickable" style={{ fontSize: 22, color: C.Muted, padding: "0 4px" }} onClick={onClose}>✕</span></div>
        {initial === "custom" && <TextField value={custom} onChange={setCustom} label="Částka v Kč" placeholder="např. 100" numeric />}
        {(initial !== "custom" || amount) && (
          <div className="col g8" style={{ alignItems: "center" }}>
            <div style={{ background: "#fff", lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: qrSvg(spd(amount), 210) }} />
            <Muted size={12} text="QR Platba – naskenujte v aplikaci své banky (účet, částka i zpráva se vyplní)." style={{ textAlign: "center" }} />
          </div>
        )}
        <div className="row g8" style={{ alignItems: "center" }}>
          <div className="col w1">
            <Muted size={12} text="Číslo účtu" />
            <T semi size={16}>{SUPPORT_ACCOUNT}</T>
            <Muted size={11} text={`${AUTHOR.name} · zpráva: MySTIS podpora`} />
          </div>
          <OButton text="Kopírovat" onClick={copy} style={{ flex: "none" }} />
        </div>
        <div style={{ background: C.Ground, borderRadius: 12, padding: 12 }}>
          <Muted size={12} color={C.Ink} maxLines={12} text="Na aplikaci pracuji ve svém volném čase s pomocí placené AI služby. Aplikace je a zůstane zdarma; příspěvek je dobrovolný a nic neodemyká. Funkčnost nemohu zaručit – pokud STIS zamezí přístup nebo změní strukturu dat, aplikace může přestat fungovat. Díky!" />
        </div>
        {!supportHidden() && <button className="textbtn" style={{ alignSelf: "center" }} onClick={() => { vm.prefs.supportHiddenUntil = Date.now() + YEAR; vm.emit(); onClose(); vm.toast("Děkuji! Karta se na rok skryje."); }}>Už jsem podpořil – skrýt na rok</button>}
      </div>
    </div>
  );
}

// O aplikaci: verze, autor, novinky po verzích, zdroj dat, soukromí, zvuky, kontrola aktualizace.
import { SupportStrip } from "../support";
import { useState } from "react";
import { APP_VERSION, AUTHOR, RELEASES } from "../../app/version";
import { AppCard, C, Muted, OButton, SectionTitle, T } from "../components";
import { AppShareCard } from "../shareActions";

declare const __BUILD__: string;
const buildText = () => (typeof __BUILD__ !== "undefined" ? __BUILD__.replace(/^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d).*/, "$3. $2. $1 $4:$5 UTC") : "vývojová");

async function checkUpdate(set: (m: string) => void) {
  set("Kontroluji…");
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) { location.reload(); return; }
    await reg.update();
    await new Promise((r) => setTimeout(r, 1500));
    if (reg.installing || reg.waiting) { set("Načítám novou verzi…"); setTimeout(() => location.reload(), 1500); return; }
    // nová verze bez service workeru: porovnat číslo sestavení v index.html
    const html = await (await fetch("index.html?check=" + Date.now(), { cache: "no-store" })).text();
    const v = /main\.js\?v=(\d+)/.exec(html)?.[1];
    if (v && typeof __BUILD__ !== "undefined" && v !== __BUILD__) { set("Načítám novou verzi…"); setTimeout(() => location.reload(), 800); return; }
    set("Máte nejnovější verzi.");
  } catch {
    set("Kontrola se nepodařila – zkuste to později.");
  }
}

export function AboutScreen() {
  const [open, setOpen] = useState<string>(RELEASES[0].version);
  const [msg, setMsg] = useState<string | null>(null);
  const mail = `mailto:${AUTHOR.email}?subject=${encodeURIComponent(`MySTIS ${APP_VERSION}`)}&body=${encodeURIComponent(`\n\n---\nVerze ${APP_VERSION} (${buildText()})\n${navigator.userAgent}`)}`;
  return (
    <div className="col g12 px16" style={{ paddingTop: 4 }}>
      <AppCard>
        <div className="row g12">
          <img src="icons/icon-192.png" alt="" width={56} height={56} style={{ borderRadius: 14 }} />
          <div className="col w1">
            <T bold size={22}>MySTIS</T>
            <Muted size={13} text={`Verze ${APP_VERSION} · sestavení ${buildText()}`} />
          </div>
        </div>
        <div className="row g8">
          <OButton text="Zkontrolovat aktualizaci" onClick={() => checkUpdate(setMsg)} style={{ flex: 1 }} />
        </div>
        {msg && <Muted text={msg} size={13} color={C.Ink} />}
      </AppCard>

      <SupportStrip always />

      <AppCard>
        <T bold>Sdílet aplikaci</T>
        <AppShareCard />
      </AppCard>

      <AppCard>
        <T bold>Autor</T>
        <T size={15} semi>{AUTHOR.name}</T>
        <Muted size={13} text={AUTHOR.club} />
        <a href={`mailto:${AUTHOR.email}`} style={{ color: C.Blue, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>{AUTHOR.email}</a>
        <div><a className="btn" href={mail} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", height: 40 }}>Napsat autorovi</a></div>
        <Muted size={11} text="E-mail se předvyplní verzí aplikace a telefonu – hodí se při hlášení chyby." />
      </AppCard>

      <SectionTitle text="Co je nového" />
      {RELEASES.map((r) => {
        const isOpen = open === r.version;
        return (
          <AppCard key={r.version} padding={0}>
            <div className="row clickable" style={{ padding: "12px 14px" }} onClick={() => setOpen(isOpen ? "" : r.version)}>
              <div className="col w1">
                <T bold size={15}>{`${r.version} · ${r.title}`}</T>
                <Muted size={12} text={r.date} />
              </div>
              <span style={{ color: C.Muted, fontSize: 20, transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform .15s" }}>⌄</span>
            </div>
            {isOpen && (
              <ul style={{ margin: 0, padding: "0 16px 12px 32px", color: C.Ink, fontSize: 14, lineHeight: 1.45 }}>
                {r.items.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            )}
          </AppCard>
        );
      })}

      <AppCard>
        <T bold>Zdroj dat</T>
        <Muted size={13} maxLines={6} text="Neoficiální aplikace. Data jsou z veřejných stránek stis.ping-pong.cz, změny STR se počítají podle popisu systému eSTeR. Oficiální výsledky, body a STR platí vždy podle STIS." />
        <T bold style={{ paddingTop: 6 }}>Soukromí</T>
        <Muted size={13} maxLines={6} text="Data se ukládají jen v tomto telefonu (v prohlížeči). Požadavky na STIS jdou přes vlastní proxy (Cloudflare Worker), nic dalšího se nikam neodesílá." />
        <T bold style={{ paddingTop: 6 }}>Zvuky</T>
        <Muted size={13} text="Zvuky: generováno AI." />
      </AppCard>
      <div style={{ height: 8 }} />
    </div>
  );
}

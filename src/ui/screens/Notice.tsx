// Vysvětlení omezení přístupu ze strany STIS (HotFix). Otevírá se z upozornění na Přehledu.
import type { CSSProperties } from "react";
import { AppCard, C, Icon, T } from "../components";

const P: CSSProperties = { fontSize: 15, lineHeight: 1.5, color: C.Ink, margin: "0 0 12px" };

export function NoticeScreen() {
  return (
    <div className="col g12 px16" style={{ paddingTop: 12, paddingBottom: 24 }}>
      <AppCard bg={C.LossTint} style={{ border: `1px solid ${C.Peach}` }}>
        <div className="row g8" style={{ alignItems: "center" }}>
          <Icon name="info" size={22} color={C.Orange} />
          <T bold size={17} color={C.OrangeText}>STIS omezuje přístup k datům</T>
        </div>
      </AppCard>

      <AppCard>
        <p style={P}>
          Omlouvám se všem uživatelům za problémy s připojením. Přes mé nejlepší úmysly – podporu hráčů,
          moderní pojetí práce s <strong>veřejně dostupnými</strong> daty a usnadnění přehledu i plánování
          budoucích zápasů – se správci STIS pokoušejí mou aplikaci blokovat. I přesto, že se snažím o co
          nejšetrnější načítání dat a o co nejmenší zatížení samotného STIS, je má aplikace aktivně blokována.
        </p>
        <p style={P}>
          Pokusím se tento problém vyřešit oficiální cestou a samozřejmě budu pracovat na možnostech fungování
          i ze své strany. Prosím kohokoli, kdo by mohl mít vliv na rozhodování správců STIS, aby zkusil takové
          jednání zvrátit a posunul komunitu stolního tenisu v ČR směrem k moderním trendům.
        </p>
        <p style={{ ...P, marginBottom: 0 }}>
          Aplikaci nabízím zdarma, strávil jsem jejím vývojem nespočet hodin po práci i po nocích a jednání
          správců STIS považuji za zlovůli. Děkuji <strong>oběma</strong> přispěvatelům za podporu – pokud se
          aplikaci nepodaří rozběhnout, peníze jim samozřejmě vrátím.
        </p>
      </AppCard>

      <T size={13} color={C.Muted} center>Peter Gramantik</T>
    </div>
  );
}

// Vysvětlení omezení přístupu ze strany STIS (HotFix). Otevírá se z upozornění na Přehledu.
import type { CSSProperties } from "react";
import { AppCard, C, Icon, T } from "../components";

const P: CSSProperties = { fontSize: 15, lineHeight: 1.5, color: C.Ink, margin: "0 0 12px" };
const PM: CSSProperties = { ...P, fontSize: 14, color: C.Ink };

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
          budoucích zápasů – se automatický přístup aplikace ke STIS v posledních dnech nedaří. I přesto,
          že se snažím o co nejšetrnější načítání dat a o co nejmenší zatížení samotného STIS, je má aplikace
          blokována.
        </p>
        <p style={P}>
          Pokusím se tento problém vyřešit oficiální cestou a samozřejmě budu pracovat na možnostech fungování
          i ze své strany. Prosím kohokoli, kdo by mohl mít vliv na rozhodování správců STIS, aby zkusil takové
          omezení zvrátit a posunul komunitu stolního tenisu v ČR směrem k moderním trendům.
        </p>
        <p style={{ ...P, marginBottom: 0 }}>
          Aplikaci nabízím zdarma a strávil jsem jejím vývojem nespočet hodin po práci i po nocích. Děkuji
          <strong> oběma</strong> přispěvatelům za podporu – pokud se aplikaci nepodaří rozběhnout, peníze jim
          samozřejmě vrátím.
        </p>
      </AppCard>

      <AppCard bg={C.Ground}>
        <T semi size={12} color={C.Muted} style={{ marginBottom: 10, letterSpacing: 0.4 }}>MŮJ DOPIS SPRÁVCŮM STIS</T>
        <p style={{ ...PM, fontWeight: 600 }}>Předmět: Žádost o spolupráci a přístup k datům pro komunitní aplikaci MySTIS</p>
        <p style={PM}>Dobrý den,</p>
        <p style={PM}>
          jmenuji se Peter Gramantik, jsem aktivní hráč stolního tenisu (TJ Vlast Ježov) a ve volném čase jsem
          vyvinul bezplatnou aplikaci MySTIS, která hráčům pomáhá sledovat vlastní statistiky, vývoj STR, výsledky
          družstev a plánovat nadcházející zápasy. Aplikace je zcela zdarma, neobsahuje žádné sázky ani placený
          obsah a je zaměřená výhradně na podporu hráčské komunity.
        </p>
        <p style={PM}>
          Data čte z veřejně dostupných stránek STIS. Záměrně jsem ji navrhl co nejšetrněji – používá sdílenou
          mezipaměť a minimum dotazů, aby zátěž pro STIS byla co nejmenší. V posledních dnech ale automatický
          přístup naráží na ochranu proti robotům a aplikace pro uživatele přestává fungovat.
        </p>
        <p style={{ ...PM, marginBottom: 6 }}>Rád bych se proto zeptal, zda by bylo možné:</p>
        <p style={{ ...PM, margin: "0 0 6px", paddingLeft: 14 }}>• zpřístupnit oficiální (byť jen read-only) API nebo jinou dohodnutou formu přístupu k datům pro tuto aplikaci;</p>
        <p style={{ ...PM, margin: "0 0 12px", paddingLeft: 14 }}>• případně nastavit podmínky, které vám vyhovují – jakékoli limity dotazů, jednoznačnou identifikaci aplikace v požadavcích apod. rád dodržím.</p>
        <p style={PM}>
          Nabízím i protihodnotu: v aplikaci mohu zobrazovat vaše reklamy/bannery, které se zobrazují i na
          stránkách STIS, nebo se domluvit na jiné formě spolupráce. Mým jediným cílem je přinést hráčské komunitě
          moderní nástroj postavený nad veřejně dostupnými daty.
        </p>
        <p style={PM}>Děkuji za zvážení a budu vděčný za jakoukoli odpověď.</p>
        <p style={{ ...PM, marginBottom: 0 }}>
          S pozdravem<br />Peter Gramantik<br />peter@gramantik.cz
        </p>
      </AppCard>

      <T size={13} color={C.Muted} center>Peter Gramantik</T>
    </div>
  );
}

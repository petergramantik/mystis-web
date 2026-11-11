// Verze aplikace a „Co je nového“. Produkce: PROD_VERSION; vývojová verze (/dev/): DEV_VERSION (např. 2.15-dev.3).
import { IS_DEV } from "./channel";

export const PROD_VERSION = "2.14";
export const DEV_VERSION = "2.15-dev.2";
export const APP_VERSION = IS_DEV ? DEV_VERSION : PROD_VERSION;

export interface Release { version: string; date: string; title: string; items: string[] }

export const RELEASES: Release[] = [
  {
    version: "2.15-dev.2", date: "11. 11. 2026", title: "Audit a vyčištění",
    items: [
      "Odstraněný nepoužívaný kód (stará obrazovka hráče, nepoužité komponenty, importy a styly)",
      "Paměť: počet profilů hráčů a stránek v paměti je omezený, mezipaměť stránek se jednou denně čistí od záznamů starších 60 dní",
      "Stejná stránka STIS požadovaná víckrát najednou se stahuje jen jednou",
    ],
  },
  {
    version: "2.15-dev.1", date: "11. 11. 2026", title: "Vývojová verze",
    items: [
      "Nová vývojová verze na adrese …/dev/ se štítkem DEV – nové funkce se nejdřív zkouší tady",
      "Oddělená data a nastavení od běžné verze; v Nastavení lze převzít nastavení z běžné verze",
      "Vlastní ikona „MySTIS DEV“, takže jdou mít na ploše obě verze",
    ],
  },
  {
    version: "2.14", date: "11. 11. 2026", title: "Komplexní model predikcí",
    items: [
      "Nastavení → Komplexní model predikcí (výchozí vypnuto): k STR přidá vzájemné zápasy hráčů a výhodu domácího prostředí v soutěži",
      "Vzájemné zápasy: novější a při podobném rozdílu STR mají větší váhu, malý vzorek se stáhne k nule, nejvýš ±40 STR",
      "Platí pro šanci v jedné hře, soupeře, příští zápas, predikci utkání, sezóny i živé utkání",
      "Ověřeno zpětným testem na 5 020 skutečných zápasech: vzájemné zápasy predikci zlepšují, korekce formou ji zhoršovala, proto se nepoužívá",
      "Stránka „Jak počítáme predikce“: popis komplexního modelu a ověření na načtených hráčích",
    ],
  },
  {
    version: "2.13.3", date: "11. 11. 2026", title: "Oprava horní lišty na iPhonu",
    items: ["iPhone (aplikace z plochy): horní lišta už není schovaná pod stavovým řádkem; totéž pro menu ⋮, živý pruh utkání a úvodní obrazovku"],
  },
  {
    version: "2.13.2", date: "11. 11. 2026", title: "Sdílet aplikaci z nabídky sdílení",
    items: ["Nabídka sdílení v horní liště nabízí i „Sdílet aplikaci“ (odkaz a QR kód)"],
  },
  {
    version: "2.13.1", date: "11. 11. 2026", title: "Statistiky uživatelů pro správce",
    items: [
      "Skrytá obrazovka se statistikami anonymních zařízení (celkem, aktivní 24 h / 7 / 30 dní, posledních 14 dní, verze)",
      "Odemčení: O aplikaci → 5× klepnout na verzi a zadat klíč; pak je položka v Nastavení",
    ],
  },
  {
    version: "2.13", date: "11. 11. 2026", title: "Všechny formáty soutěží ČAST",
    items: [
      "Formáty utkání podle Soutěžního řádu ČAST a rozpisů 2026/27 včetně pořadí her: 317.01, 317.02, 318.01, 318.02, 319",
      "1.–3. liga mužů: 4 hráči, 14 her, do 8 bodů nebo remíza 7:7 (dřív chybně 3 hráči); play-off 13 her do 7",
      "Extraliga mužů (5 dvouher do 3), extraliga žen (čtyřhra na konci, do 6), 1.–2. liga žen a jejich play-off",
      "Formát se rozpozná ze zápisů podle počtu her, čtyřher, jejich pozice a hráčů; ligy se předvolí podle názvu soutěže",
      "Karta Predikce ukazuje použitý formát – klepnutím ho lze změnit",
      "Opraveno pořadí dvouher tříčlenných družstev podle SŘ 318.01; u hráče se ukazuje skutečný počet dvouher (např. 2 z 3)",
    ],
  },
  {
    version: "2.12.1", date: "11. 11. 2026", title: "Aktuální STR soupeře ve vzájemných zápasech",
    items: [
      "Vzájemné zápasy a seznam Soupeři počítají šanci s aktuálním STR soupeře (profil, žebříček, soupiska) místo STR po posledním vzájemném zápase",
      "Profil soupeře se načítá z aktuálního ročníku; dokud není načtený, je u šance poznámka",
    ],
  },
  {
    version: "2.12", date: "11. 11. 2026", title: "Sdílení aktuálního stavu jako obrázek",
    items: [
      "Přehled: tlačítko sdílení nabízí „Můj aktuální stav (obrázek)“ – STR, změna za sezónu, graf, úspěšnost, bilance, výkon a forma z posledních 8 (bez soupeřů)",
      "Neoficiální výsledky jsou v obrázku zahrnuté a označené jako odhad",
      "Stejný obrázek lze sdílet i z profilu jiného hráče",
      "Logo aplikace vlevo nahoře na Přehledu – klepnutím otevře O aplikaci",
    ],
  },
  {
    version: "2.11.2", date: "11. 11. 2026", title: "Pořadí dvouher a sdílená predikce",
    items: [
      "Pořadí dvouher podle klíče ze zápisů soutěže, jinak standardní točení (ABCD, BCDA, CDAB, DABC proti hostům) – v predikcích i ruční predikci",
      "Predikce příštího zápasu se počítá se skutečnými domácími – shoduje se se sdílenou predikcí",
    ],
  },
  {
    version: "2.11.1", date: "11. 11. 2026", title: "Karty utkání",
    items: ["Přehled: „Moje poslední utkání“ s datem, kolem a soutěží pod výsledkem; u předchozího utkání datum a kolo na střed"],
  },
  {
    version: "2.11", date: "11. 11. 2026", title: "Jak počítáme predikce",
    items: [
      "Nová obrazovka „Jak počítáme predikce“ (menu ⋮ a O aplikaci) se srozumitelným popisem modelu; u každé predikce odkaz „Jak se to počítá? ›“; popis lze sdílet odkazem",
      "Predikce konce sezóny počítá s hráči, kteří za družstvo opravdu nastupují (na začátku sezóny s nejsilnějšími); sestava je vidět po klepnutí na družstvo",
    ],
  },
  {
    version: "2.10", date: "10. 11. 2026", title: "Sdílená predikce",
    items: [
      "Sdílet predikci: volba Text, nebo Odkaz – odkaz otevře predikci utkání i člověk bez nastavené aplikace",
      "Sdílená predikce se přepočítá podle aktuálního STR; když se už hraje nebo je dohráno, nabídne živé utkání nebo zápis",
    ],
  },
  {
    version: "2.9.1", date: "10. 11. 2026", title: "Anonymní počítadlo",
    items: ["Aplikace jednou denně anonymně ohlásí své spuštění (náhodné číslo instalace, bez osobních údajů) – kvůli počtu uživatelů"],
  },
  {
    version: "2.9", date: "2. 11. 2026", title: "Porovnání hráčů a Soupeři",
    items: [
      "Porovnání libovolných dvou hráčů – hledání kohokoli ze STIS, rychlá volba „Já“, hráči oddílu a nejčastější soupeři, prohození hráčů",
      "Soupeři: tlačítko Porovnat, výchozí je vaše hlavní soutěž (Všichni zůstává), rozložení jako na kartě Utkání",
    ],
  },
  {
    version: "2.8.6", date: "2. 11. 2026", title: "Nová ikona",
    items: ["Nová ikona aplikace (plocha, Android, iPhone, záložka prohlížeče, notifikace)"],
  },
  {
    version: "2.8.5", date: "2. 11. 2026", title: "Pořadí formy",
    items: ["Forma: vlevo nejstarší, vpravo nejnovější zápas (zvýrazněný rámečkem) – na Přehledu i u soupeřů"],
  },
  {
    version: "2.8.4", date: "2. 11. 2026", title: "Kontumace (WO)",
    items: [
      "Kontumované hry (WO) v zápisu i živém utkání: „nenastoupil(a)“, nepočítají se do predikcí, výkonu ani odhadu STR; v bilanci hráčů řádek WO jako na STIS",
      "Průběžný stav u her v zápisu podle sloupce Body ze STIS (nezapočtená hra = „čeká na započtení“)",
    ],
  },
  {
    version: "2.8.3", date: "2. 11. 2026", title: "Poslední utkání a tlačítko Zpět",
    items: [
      "Karta Poslední utkání: vaše družstvo – výsledek – soupeř se soutěží, dole celková změna STR za utkání; při více soutěžích posouvání prstem",
      "Tlačítko Zpět na mobilu prochází všechny otevřené obrazovky (dřív se aplikace na druhý stisk zavřela)",
    ],
  },
  {
    version: "2.8.2", date: "1. 11. 2026", title: "Drobnosti",
    items: [
      "Sledovaná utkání a přidané soutěže se ukládají ke každému hráči zvlášť (po přepnutí hráče se nemíchají)",
      "Přehled: hráč v jediné soutěži nemá u dlaždic přepínání na „Všechny soutěže“",
      "Interní žebříček: řazení STR | % | +/-",
    ],
  },
  {
    version: "2.8.1", date: "1. 11. 2026", title: "Oprava pruhu Živě",
    items: ["Dohrané sledované utkání se už nepočítá jako živé (i když jeho zápis nebyl načtený)"],
  },
  {
    version: "2.8", date: "1. 11. 2026", title: "Profil družstva",
    items: [
      "Družstva v tabulce soutěže, soupeř v příštím zápase i družstva v zápisu jsou klikatelná – otevřou profil družstva (výsledky, vývoj STR, soupiska, statistiky)",
      "U cizího družstva: utkání proti vašemu družstvu a vaše bilance proti jeho hráčům; statistiky ze zápisů na klepnutí",
      "Obrazovka Družstvo ukazuje průběh načítání (kroužek s procenty)",
      "Přehled: na konci grafu STR šipka podle změny v posledním utkání",
      "Vývoj STR: predikce zeleně / oranžově podle směru, u konce sezóny rozdíl proti aktuálnímu STR",
      "Utkání: filtr Vše / Příští / Odehrané; Zápasy: filtry v pořadí sezóna, družstvo, výsledek; žebříček STIS: přepínač STR | %",
    ],
  },
  {
    version: "2.7", date: "1. 11. 2026", title: "Klikatelní hráči",
    items: [
      "Jména hráčů otevírají jejich profil: bilance a Výkon proti predikci v zápisu, Vaši hráči / Soupeři v živém utkání, hlavička vzájemných zápasů, porovnání, rekordy",
      "Profil: tlačítko Sdílet profil (u jiného hráče dál Porovnat se mnou a Vzájemně)",
      "Změna STR za sezónu v profilu a na obrázku sezóny počítaná stejně jako na Přehledu",
      "Vzájemné zápasy ze sdíleného odkazu fungují i bez nastavené aplikace",
    ],
  },
  {
    version: "2.6.1", date: "1. 11. 2026", title: "Oprava soupisky družstva",
    items: ["Soupiska družstva: vaše aktuální STR a změna za sezónu počítaná stejně jako na Přehledu"],
  },
  {
    version: "2.6", date: "1. 11. 2026", title: "Přesnější odhad STR",
    items: [
      "Odhad STR po neoficiálním utkání počítá se skutečným STR soupeřů – jejich stránky se načtou automaticky (dřív se při neznámém STR počítalo se stejně silným soupeřem)",
      "Dokud se STR soupeřů načítá, Přehled ukazuje „počítám odhad…“",
    ],
  },
  {
    version: "2.5.1", date: "1. 11. 2026", title: "Oprava sdílených odkazů",
    items: ["Sdílený odkaz otevře zápis i ve chvíli, kdy se aplikace zrovna aktualizuje (dřív se mohla ukázat úvodní obrazovka)"],
  },
  {
    version: "2.5", date: "1. 11. 2026", title: "Bliknutí změn",
    items: [
      "V živém utkání krátce blikne hra, ve které se něco změnilo (set, konec hry, doplněná sestava) – zeleně / oranžově podle fandění",
      "Konec utkání blikne v hlavičce; změna mimo obrazovku blikne v horní liště se skóre",
      "Zvuk se zkusí povolit hned při spuštění (kde to telefon dovolí, lišta „Povolit zvuk“ se neukáže)",
    ],
  },
  {
    version: "2.4.3", date: "1. 11. 2026", title: "Drobnosti",
    items: ["Šipka › za skóre živých a dohraných utkání na přehledu Živě", "Podpořit vývoj vždy i v menu ⋮"],
  },
  {
    version: "2.4.2", date: "1. 11. 2026", title: "Ikony u podpory",
    items: ["Částky podpory s ikonami: 🍺 50 Kč, 🍛 200 Kč, 💰 vlastní"],
  },
  {
    version: "2.4.1", date: "1. 11. 2026", title: "Kratší pruh Živě",
    items: ["Pruh na Přehledu: „Živě: X · Dohráno: Y · Sledováno: Z“"],
  },
  {
    version: "2.4", date: "1. 11. 2026", title: "Výsledky dne",
    items: [
      "Tlačítko Živě ukazuje počet právě probíhajících utkání (stejně jako pruh na Přehledu)",
      "Dohraná utkání dne zůstávají: pruh na Přehledu ukazuje „dohráno N“ a po skončení všech „Dnes dohráno N utkání · výsledky“",
    ],
  },
  {
    version: "2.3.1", date: "1. 11. 2026", title: "Oprava horní lišty",
    items: ["Na obrazovkách se sdílením je nadpis zarovnaný doleva, aby se nezkracoval"],
  },
  {
    version: "2.3", date: "1. 11. 2026", title: "Podpora vývoje",
    items: [
      "Nenápadná karta „Podpořit vývoj“ dole na Přehledu, u živého utkání a zápisu (50 Kč, 200 Kč, vlastní částka)",
      "QR Platba pro bankovní aplikaci a číslo účtu ke zkopírování; karta jde na rok skrýt",
    ],
  },
  {
    version: "2.2", date: "1. 11. 2026", title: "Sdílení",
    items: [
      "Tlačítko Sdílet v horní liště: utkání (odkaz – během hry živý stav, po konci zápis), profil hráče, vzájemné zápasy, tabulka a žebříček soutěže",
      "Odkaz otevře i člověk bez nastavené aplikace – uvidí jen sdílené utkání nebo hráče",
      "Obrázek výsledku utkání (skóre, hry, bilance a změny STR) a shrnutí sezóny hráče",
      "Sdílení predikce příštího utkání (sestavy a odhad výsledku)",
      "Sdílet aplikaci s QR kódem (menu ⋮ i O aplikaci)",
      "Predikce utkání počítá s formou dne – méně přehnaná jistota; před koncem nikdy 100 %, nejvýš >99 %",
    ],
  },
  {
    version: "2.1", date: "1. 11. 2026", title: "Živý zápis",
    items: [
      "Soutěž, kolo a formát v hlavičce živého utkání (klepnutím tabulka)",
      "Než jsou zapsané sestavy dvouher, ukáže se jen klíč (A – X…) odvozený z odehraných zápisů a predikce počká",
      "Při posouvání dolů zůstává nahoře kompaktní hlavička se skóre",
    ],
  },
  {
    version: "2.0", date: "1. 11. 2026", title: "Dlaždice podle soutěží",
    items: [
      "Úspěšnost, Bilance a Výkon na Přehledu jdou posunout přes všechny vaše soutěže (i „Všechny soutěže“)",
      "Šipka změny STR u hráčů v kartách předchozích utkání (skutečná nebo ~odhad)",
      "Poslední utkání: STR soupeře a rozdíl na řádku se sety",
    ],
  },
  {
    version: "1.9", date: "1. 11. 2026", title: "Úpravy zápasů",
    items: [
      "STR soupeře a rozdíl na samostatném řádku (vždy celé)",
      "STR soupeře i u neoficiálních zápasů z online zápisu",
      "Ikonky formy vždy v jednom řádku podle šířky displeje",
    ],
  },
  {
    version: "1.8", date: "1. 11. 2026", title: "Zápasy a forma",
    items: [
      "U zápasů STR soupeře v době zápasu a rozdíl proti vašemu STR",
      "Forma z posledních 8 zápasů na Přehledu i v profilu",
      "Pruh „Dnes živě“ pro nadcházející utkání",
    ],
  },
  {
    version: "1.7", date: "1. 11. 2026", title: "Dnešní utkání",
    items: ["Modrý pruh na Přehledu upozorní na dnešní nadcházející utkání (s odpočtem hodinu před začátkem), přednostně vaše nebo sledované"],
  },
  {
    version: "1.6", date: "1. 11. 2026", title: "O aplikaci",
    items: [
      "Obrazovka O aplikaci s autorem, verzí a přehledem novinek",
      "Kontrola aktualizace na jedno klepnutí",
      "Živě: počet odehraných her u všech živých utkání",
      "Notifikace potichu, když hraje zvuk davu v aplikaci; pruh pro zapnutí zvuků",
    ],
  },
  {
    version: "1.5", date: "1. 11. 2026", title: "Živě",
    items: [
      "Utkání všech soutěží podle dne (včera / dnes / zítra) a tlačítko Živě v záložce Utkání",
      "Sledování až 5 utkání s vlastním upozorněním (hry / sety) a volbou, komu fandíte",
      "Přidávání soutěží hledáním oddílu nebo odkazem, volič soutěží, odkaz na tabulku",
      "Formát utkání podle soutěže (rozpoznání ze zápisů nebo ruční volba)",
      "Zvuky davu z MP3, příjmení hráčů v notifikacích, pruh Živě na Přehledu",
    ],
  },
  {
    version: "1.4", date: "1. 11. 2026", title: "Družstvo a profil hráče",
    items: [
      "Obrazovka Družstvo: výsledky po kolech, vývoj STR, soupiska a statistiky sezóny",
      "Profil hráče: kariéra v číslech, nejcennější výhry, forma, soupeři, přehled sezón a rekordy",
      "Predikce na kartách příštích utkání a nejpravděpodobnější výsledek",
      "Úspěšnost, bilance a výkon na Přehledu podle soutěže aktivního družstva",
    ],
  },
  {
    version: "1.3", date: "31. 10. 2026", title: "Zápis o utkání",
    items: [
      "Výkon proti predikci a překvapení utkání",
      "Vzájemné zápasy se sety a šancí podle stran",
      "Zvýraznění vás v zápisu, sety barevně",
      "Skóre utkání z jednotlivých her",
    ],
  },
  {
    version: "1.2", date: "31. 10. 2026", title: "Živé utkání",
    items: [
      "Probíhající utkání s průběžným stavem a automatickou obnovou každou minutu",
      "Notifikace o hrách, setech a konci utkání",
      "Predikce podle stavu setů, favorit každé hry",
      "Po konci utkání celý zápis",
    ],
  },
  {
    version: "1.1", date: "31. 10. 2026", title: "Žebříčky a predikce",
    items: [
      "Tabulka soutěže s predikcí konečného pořadí, žebříček STR soutěže, interní žebříček",
      "Kalkulačka STR s hledáním soupeře",
      "Herna a vybavení, instalace do telefonu",
    ],
  },
  {
    version: "1.0", date: "31. 10. 2026", title: "První webová verze",
    items: ["Převod Android aplikace na web: Přehled, STR, Utkání, Soupeři, offline režim"],
  },
];

export const AUTHOR = { name: "Peter Gramantik", club: "TJ Vlast Ježov", email: "peter@gramantik.cz" };

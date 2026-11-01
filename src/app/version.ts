// Verze aplikace a „Co je nového“. Při každé implementaci zvýšit APP_VERSION a přidat verzi nahoru.

export const APP_VERSION = "2.5";

export interface Release { version: string; date: string; title: string; items: string[] }

export const RELEASES: Release[] = [
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

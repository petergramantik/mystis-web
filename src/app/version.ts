// Verze aplikace a „Co je nového“. Při každé implementaci zvýšit APP_VERSION a přidat verzi nahoru.

export const APP_VERSION = "1.9";

export interface Release { version: string; date: string; title: string; items: string[] }

export const RELEASES: Release[] = [
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

// Zkušební prostředí bez internetu: falešný STIS (:9001), skutečný kód proxy Workeru (:8787) a web z dist (:8080).
// Spuštění: bun tools/mock.ts <fixtures>
import { readFileSync, existsSync } from "node:fs";
import worker from "../proxy/worker.js";
import { Html } from "../src/core/html";

const FIX = process.argv[2] ?? "/home/claude/topspin/build-test/fixtures";
const pad = (s: string) => s + "<!--" + " ".repeat(2100) + "-->";
const PLAYERS: [string, string, number][] = [
  ["43940", "Adamczyk Martin", 1612], ["11358", "Sýkora Pavel", 1544], ["43939", "Matloch Tadeusz", 1495],
  ["43944", "Šedivý Milan", 1445], ["43941", "Telecký Jaroslav", 1281], ["33363", "Buda Boleslav", 1229],
];
const TEAMS = [
  { id: "66623", name: "TTC Bystřice", soutez: "6722", players: ["43940", "11358", "43939", "43944"] },
  { id: "66625", name: "TTC Bystřice B", soutez: "6723", players: ["43939", "43944", "43941", "33363"] },
];
const OPP = { id: "66770", name: "TJ Sokol Dobrá", players: [["90001", "Novák Jan", 1480], ["90002", "Dvořák Petr", 1430], ["90003", "Král Josef", 1395], ["90004", "Malý Ivo", 1350], ["90005", "Horák Jiří", 1300]] as [string, string, number][] };
const OPP2 = { id: "66769", name: "Sokol Skalice" };
const name = (id: string) => PLAYERS.find((p) => p[0] === id)?.[1] ?? OPP.players.find((p) => p[0] === id)?.[1] ?? "Hráč " + id;
const strOf = (id: string) => PLAYERS.find((p) => p[0] === id)?.[2] ?? OPP.players.find((p) => p[0] === id)?.[2] ?? 1400;

function clubPage() {
  return pad(`<html><head><title>STIS - oddíl</title></head><body><div class="card-header">TTC Bystřice</div>` +
    TEAMS.map((t) => `<a href="/druzstvo-${t.id}/svaz-420802/rocnik-2026/soutez-${t.soutez}">${t.name}</a>`).join(" ") + `</body></html>`);
}
function teamPage(id: string) {
  const t = TEAMS.find((x) => x.id === id);
  const rows = t ? t.players.map((pid, i) => [pid, name(pid), strOf(pid) - 6, i]) : id === OPP.id || id === OPP2.id ? OPP.players.map((p, i) => [p[0], p[1], p[2] - 5, i]) : [];
  const hall = `<div class="card-body"><strong>Organizační pracovník:</strong><br>Kůřil Pavel ml.<br><i class="fa fa-envelope"></i> koura <i class="fa fa-at"></i> email.cz<br><i class="fa fa-phone"></i> +420 722 210765<br>
    <strong>Kategorie:</strong> Muži<br><strong>Míčky:</strong><br>Joola Flash, plast, Bílá<br><strong>Stoly:</strong><br>Donic, Donic 25, Modrá<br><strong>Herna:</strong><br>${t ? "Bystřice 12, sokolovna" : "Dobrá 50, Tělocvična ZŠ"}<br><strong>GPS herny:</strong> 49°1'29.956"N, 17°12'48.679"E</div>`;
  return pad(hall + `<h5>Žebříček družstva</h5><table class="table"><thead><tr><th>Pořadí</th><th>Hráč</th><th>Nar.</th><th>Žebříček</th><th>STR</th><th>STR+-</th><th>Bilance</th><th>Zápasy</th></tr></thead><tbody>` +
    rows.map(([pid, n, s, i]) => `<tr><td>${(i as number) + 1}</td><td><a href="/hrac-${pid}/svaz-420802/rocnik-2026">${n}</a></td><td>1970</td><td>kraj. muži</td><td>${s}</td><td>${(i as number) % 2 ? 4 : -3}</td><td>${5 - (i as number)}:${2 + (i as number)}</td><td>0/0/1</td></tr>`).join("") + `</tbody></table>`);
}
function losPage(id: string) {
  const t = TEAMS.find((x) => x.id === id) ?? TEAMS[1];
  const me = `<a href="/druzstvo-${t.id}/svaz-420802/rocnik-2026/soutez-${t.soutez}">${t.name}</a>`;
  const o1 = `<a href="/druzstvo-${OPP2.id}/svaz-420802/rocnik-2026/soutez-${t.soutez}">${OPP2.name}</a>`;
  const o2 = `<a href="/druzstvo-${OPP.id}/svaz-420802/rocnik-2026/soutez-${t.soutez}">${OPP.name}</a>`;
  const rows = [
    `<tr><td>5.</td><td>23.10.2026 18:00</td><td>${o1}</td><td>${me}</td><td><a href="/zapis/svaz-420802/rocnik-2026/soutez-${t.soutez}/utkani-672291">9:9</a></td></tr>`,
    `<tr><td>6.</td><td>30.10.2026 17:30</td><td>${me}</td><td>${o1}</td><td><a href="/zapis/svaz-420802/rocnik-2026/soutez-${t.soutez}/utkani-700001">10:6</a></td></tr>`,
    `<tr><td>7.</td><td>06.11.2026 18:00</td><td>${o2}</td><td>${me}</td><td></td></tr>`,
    `<tr><td>8.</td><td>13.11.2026 17:30</td><td>${me}</td><td>${o1}</td><td></td></tr>`,
    `<tr><td>9.</td><td>20.11.2026 18:00</td><td>${o2}</td><td>${me}</td><td></td></tr>`,
    `<tr><td>10.</td><td>27.11.2026 17:30</td><td>${me}</td><td>${o2}</td><td></td></tr>`,
  ];
  return pad(`<table class="table los table-sm"><thead><tr><th>Kolo</th></tr></thead><tbody>${rows.join("\n")}</tbody></table>`);
}
function zapisPage(no: string) {
  // 700001: TTC Bystřice B (domácí) – Sokol Skalice, Šedivý hraje 4 dvouhry (3 výhry); STIS ho zatím nezapočítal
  const home = no === "700001" ? ["43939", "43944", "43941", "33363"] : ["90001", "90002", "90003", "90004"];
  const away = no === "700001" ? ["80001", "80002", "80003", "80004"] : ["43939", "43944", "43941", "33363"];
  const nm = (id: string) => (id.startsWith("8") ? ["Beneš Milan", "Kos Tomáš", "Vrba Aleš", "Lis Pavel"][parseInt(id.slice(-1)) - 1] : name(id));
  const cell = (ids: string[]) => ids.map((i) => `<a data-id="${i}" href="#">${nm(i)}</a>`).join("<br>");
  const order: [number, number][] = [[0, 0], [1, 1], [2, 2], [3, 3], [0, 1], [1, 0], [2, 3], [3, 2], [0, 2], [1, 3], [2, 0], [3, 1], [0, 3], [1, 2], [2, 1], [3, 0]];
  const rows: string[] = [];
  let n = 1, h = 0, a = 0;
  const game = (hc: string, ac: string, win: boolean) => {
    const sets = win ? [7, -9, 8, 6] : [-5, 9, -8, -11];
    if (win) h++; else a++;
    rows.push(`<tr><td>${n++}.</td><td>${hc}</td><td>-</td><td>${ac}</td><td></td>${[...sets, ""].map((s) => `<td>${s}</td>`).join("")}<td>${win ? 3 : 1}</td><td>${win ? 1 : 3}</td><td></td><td></td></tr>`);
  };
  game(cell(home.slice(0, 2)), cell(away.slice(0, 2)), true);
  game(cell(home.slice(2)), cell(away.slice(2)), false);
  order.forEach(([i, j], k) => { if (h < 10 && a < 10) game(cell([home[i]]), cell([away[j]]), k % 3 !== 2); });
  const hn = no === "700001" ? "TTC Bystřice B" : OPP2.name, an = no === "700001" ? OPP2.name : "TTC Bystřice B";
  const hid = no === "700001" ? "66625" : OPP2.id, aid = no === "700001" ? OPP2.id : "66625";
  return pad(`<table class="zapis_H"><tr><td>Název soutěže: <b><a href="#">OS 1</a></b> Kolo: <b>${no === "700001" ? 6 : 5}</b> online</td></tr>
    <tr><td>POŘÁDAJÍCÍ</td><td><a href="/druzstvo-${hid}/x">${hn}</a></td><td>HOSTUJÍCÍ</td><td><a href="/druzstvo-${aid}/x">${an}</a></td></tr>
    <tr><td>Datum dle rozpisu</td><td>${no === "700001" ? "30.10.2026 17:30" : "23.10.2026 18:00"}</td><td>Hráno v místnosti</td><td>Bystřice, sokolovna</td></tr>
    <tr><td>${h}</td><td>:</td><td>${a}</td><td>33</td><td>:</td><td>34</td><td>632</td><td>:</td><td>640</td><td>x</td></tr></table>
    <table class="zapis">${rows.join("\n")}</table>`);
}
function tabulkaPage() {
  const rows = [["TTC Bystřice B", "66625", 6, 4, 1, 1, 60, 40, 15], ["Sokol Skalice", "66769", 6, 3, 1, 2, 52, 48, 13], ["TJ Sokol Dobrá", "66770", 6, 2, 0, 4, 45, 55, 10], ["TTC Bystřice C", "66627", 6, 1, 0, 5, 40, 60, 8]];
  const inner = JSON.stringify({ tables: [{ data: rows.map((r) => ({ nazev: r[0], id_druzstvo: r[1], id_oddil: "1", pocet: r[2], vyhry: r[3], remizy: r[4], prohry: r[5], vyhrbody: r[6], prohrbody: r[7], body: r[8] })) }] });
  return pad(`<script>var initTabData = "${inner.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}";</script>`);
}
function zebricekPage() {
  const hdr = `<tr><th>#</th><th>Hráč</th><th>Nar.</th><th>Zápasy</th><th><i class="fa fa-sort"></i>STR</th><th>STR<sub>stabil</sub></th><th>STR<sub>±</sub></th></tr>`;
  const row = (n: number, id: string, nm: string, z: string, str: number) => `<tr><td>${n}.</td><td><a href="/hrac-${id}/svaz-420802/rocnik-2026">${nm}</a></td><td>1980</td><td>${z}</td><td>${str}</td><td>${str},2</td><td>+1</td></tr>`;
  const main = [["90001", "Novák Jan", "11 (8:3)", 1480], ["43939", "Matloch Tadeusz", "10 (6:4)", 1495], ["90002", "Dvořák Petr", "12 (6:6)", 1430], ["43944", "Šedivý Milan", "13 (5:8)", 1445], ["43941", "Telecký Jaroslav", "9 (4:5)", 1281]];
  return pad(`<h4>POŘADÍ STR - KSST TEST - OS1 - 2026-2027</h4><table class="table">${hdr}${main.map((r, i) => row(i + 1, r[0] as string, r[1] as string, r[2] as string, r[3] as number)).join("")}</table>
    <h5>Hráči, kteří odehráli méně než 8 zápasů</h5><table class="table">${hdr}${row(1, "33363", "Buda Boleslav", "5 (2:3)", 1229)}${row(2, "90004", "Malý Ivo", "4 (1:3)", 1350)}</table>`);
}
function searchPage(q: string) {
  const qq = q.toLowerCase();
  const hits = [...PLAYERS, ...OPP.players].filter((p) => p[1].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().includes(qq));
  return pad(`<h2>VÝSLEDKY HLEDÁNÍ</h2><h3>HRÁČI:</h3>` + hits.map((p) => `<a href="/hrac-${p[0]}/svaz-420802/rocnik-2026"><b>${p[1]}</b>(1970)</a>, TTC Bystřice ( <b>STR</b> : ${p[2]}, <b>STR</b><sub>stabil</sub> : ${p[2]},0 )<br>`).join("\n") +
    (qq.includes("bystr") || qq.includes("jezov") ? `<h3>ODDÍLY:</h3><a href="/oddil-420802047/svaz-420802/rocnik-2026">TTC Bystřice</a><br><a href="/oddil-420104012/svaz-420104/rocnik-2026">TJ Vlast Ježov</a>` : ""));
}

const enc = new TextEncoder();
// ---------------------------------------------------------------- falešný STIS
Bun.serve({
  port: 9001,
  async fetch(req) {
    const u = new URL(req.url);
    const p = u.pathname;
    const cookie = req.headers.get("cookie") ?? "";
    const html = (s: string, extra: Record<string, string> = {}) => new Response(enc.encode(s), { headers: { "Content-Type": "text/html", ...extra } });
    if (p === "/") return html(pad("<html>STIS hlavní stránka</html>"), u.searchParams.get("nuser") ? { "Set-Cookie": "PHPSESSID=abc123; path=/" } : {});
    if (p === "/hledat") {
      if (!cookie.includes("PHPSESSID")) return new Response(null, { status: 302, headers: { Location: "/" } });
      let q = u.searchParams.get("s") ?? "";
      if (req.method === "POST") q = new URLSearchParams(await req.text()).get("s") ?? q;
      return html(searchPage(q));
    }
    const hm = /^\/hrac-(\d+)/.exec(p);
    if (hm) {
      const f = `${FIX}/hrac-${hm[1]}.html`;
      if (existsSync(f)) return new Response(readFileSync(f), { headers: { "Content-Type": "text/html" } });
      const pl = OPP.players.find((x) => x[0] === hm[1]);
      if (pl) {
        // soupeř: použijeme stránku jiného hráče s přepsaným jménem
        const base = Html.decodeMixed(new Uint8Array(readFileSync(`${FIX}/hrac-43941.html`))).replace(/Telecký Jaroslav/g, pl[1]);
        return html(base);
      }
      return html("<html>brána</html>");
    }
    if (p.startsWith("/oddil-")) return html(clubPage());
    const dm = /^\/druzstvo-(\d+)/.exec(p);
    if (dm) return html(teamPage(dm[1]));
    const lm = /\/druzstvo-(\d+)$/.exec(p);
    if (p.startsWith("/los-vse")) return html(losPage(lm?.[1] ?? "66625"));
    if (p.startsWith("/tabulka")) return html(tabulkaPage());
    if (p.startsWith("/zebricekstr-soutez")) return html(zebricekPage());
    if (p.startsWith("/soupisky")) return html(pad("<table></table>"));
    const zm = /utkani-(\d+)/.exec(p);
    if (zm) return html(zapisPage(zm[1]));
    return html(pad("<html>nic</html>"));
  },
});

// ---------------------------------------------------------------- skutečný Worker, jen fetch míří na falešný STIS
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init?: any) => {
  const url = typeof input === "string" ? input : input.url;
  return realFetch(url.replace("https://stis.ping-pong.cz", "http://localhost:9001"), init);
}) as typeof fetch;
Bun.serve({ port: 8787, fetch: (req) => (worker as any).fetch(req) });

// ---------------------------------------------------------------- web
const DIST = new URL("../dist/", import.meta.url).pathname;
Bun.serve({
  port: 8080,
  fetch(req) {
    let p = new URL(req.url).pathname;
    if (p === "/") p = "/index.html";
    if (p === "/config.js") return new Response(`window.MYSTIS_PROXY = "http://localhost:8787";`, { headers: { "Content-Type": "text/javascript" } });
    const f = DIST + p.slice(1);
    if (existsSync(f)) return new Response(Bun.file(f));
    return new Response("404", { status: 404 });
  },
});
console.log("mock ready");

// Prohlídka webu v mobilním zobrazení proti zkušebnímu prostředí (tools/mock.ts). Uloží snímky do /tmp/shots.
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  fs.mkdirSync("/tmp/shots", { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, locale: "cs-CZ", timezoneId: "Europe/Prague" });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const shot = async (n) => { await p.waitForTimeout(400); await p.screenshot({ path: `/tmp/shots/${n}.png`, fullPage: true }); };
  await p.goto("http://localhost:8080/");
  await shot("00-onboarding");
  await p.fill("input", "sedivy");
  await p.click("text=Načíst moje statistiky");
  await p.waitForTimeout(1500);
  await shot("01-firstload");
  await p.waitForFunction(() => !document.body.innerText.includes(" %") || document.body.innerText.includes("Pořadí"), null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(9000);
  await shot("02-overview");
  const tabs = [["Žebříček", "03-ladder"], ["STR", "04-str"], ["Zápasy", "05-matches"], ["Soupeři", "06-opponents"]];
  for (const [t, n] of tabs) { await p.click(`.navitem:has-text("${t}")`); await shot(n); }
  await p.click(`.navitem:has-text("Soupeři")`);
  await p.click(".listcard .clickable >> nth=0");
  await p.waitForTimeout(1500);
  await shot("07-h2h");
  await p.goBack();
  await p.waitForTimeout(300);
  await shot("07b-after-back");
  for (const [item, n] of [["Příští zápas", "08-next"], ["Pro kapitána", "09-captain"], ["Porovnání hráčů", "10-compare"], ["Rekordy a statistiky", "11-records"], ["Nastavení", "12-settings"]]) {
    await p.click('button[aria-label="Další funkce"]');
    await p.click(`.menu button:has-text("${item}")`);
    await p.waitForTimeout(2500);
    await shot(n);
  }
  await p.click('button[aria-label="Další funkce"]');
  await p.click(`.menu button:has-text("Příští zápas")`);
  await p.waitForTimeout(800);
  await p.click("text=Zápas začíná – zadat sestavy");
  await p.waitForTimeout(1500);
  await shot("13-live");
  await p.click(".seg button:has-text('Ruční sestavy')");
  await p.waitForTimeout(500);
  await shot("14-live-manual");
  await p.click(`.navitem:has-text("Přehled")`);
  await p.waitForTimeout(500);
  await p.click("text=Zápis ›");
  await p.waitForTimeout(1500);
  await shot("15-zapis");
  fs.writeFileSync("/tmp/shots/errors.txt", errors.join("\n"));
  console.log("errors:", errors.length, errors.slice(0, 10).join("\n"));
  await b.close();
})();

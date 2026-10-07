// v3 proof: a prayer opened with one section expanded in place (390px).
//   node scripts/proof-sections.mjs <base URL of a running site>   (writes to $JL_PROOF_DIR/movements/v3, or proof/…)
import { chromium } from "@playwright/test";
const base = process.argv[2] || process.env.JL_BASE;
if (!base) throw new Error("usage: node scripts/proof-sections.mjs <base URL>");
const out = `${process.env.JL_PROOF_DIR || "proof"}/movements/v3`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const shots = [
  ["weekday-shacharit-tachanun-falling-on-the-face", "/weekday/shacharit/tachanun", "#section-tachanun", [".toc-toggle[data-section=falling-on-the-face]"]],
  ["weekday-shacharit-shema-first-paragraph", "/weekday/shacharit/shema-and-its-blessings", "#section-shema-and-its-blessings", [".toc-group", ".toc-toggle[data-section=first-paragraph-veahavta]"]],
];
for (const [name, path, card, clicks] of shots) {
  await page.goto(base + path);
  for (const selector of clicks) await page.locator(`${card} ${selector}`).click();
  await page.locator(`${card} .reader-section`).first().waitFor();
  await page.waitForTimeout(800);
  await page.locator(card).evaluate(el => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}-screen.png` });
  await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
}
await browser.close();

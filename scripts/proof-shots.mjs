// Phone screenshots for design proof: node scripts/proof-shots.mjs <baseUrl> <prefix> <path> [<path> ...]
// Each path is saved as <prefix>-<slug>-first.png (390x844 first screen) and -full.png (full page).
import { chromium } from "@playwright/test";

const [base, prefix, ...paths] = process.argv.slice(2);
const out = process.env.OUT || `${process.env.JL_PROOF_DIR || "proof"}/movements`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
for (const entry of paths) {
  const [path, mode = "both"] = entry.split("@");
  const slug = path.replace(/^\//, "").replace(/\//g, "-");
  await page.goto(base + "/");
  await page.evaluate(m => localStorage.setItem("weekday-shacharit-language", m), mode);
  await page.goto(base + path);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${prefix}-${slug}${mode === "both" ? "" : "-" + mode}-first.png` });
  await page.screenshot({ path: `${out}/${prefix}-${slug}${mode === "both" ? "" : "-" + mode}-full.png`, fullPage: true });
}
await browser.close();

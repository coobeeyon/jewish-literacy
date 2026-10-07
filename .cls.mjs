import { chromium } from "@playwright/test";
const browser = await chromium.launch();
for (const lang of ["both", "en", "he"]) {
const page = await browser.newPage({ viewport: { width: 320, height: 844 } });
await page.clock.setFixedTime(new Date("2026-10-07T12:00:00"));
await page.addInitScript(l => localStorage.setItem("weekday-shacharit-language", l), lang);
await page.route("**/_astro/*.js", async route => { await new Promise(r => setTimeout(r, 300)); await route.fallback(); });
await page.addInitScript(() => { window.shifts = []; new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.shifts.push({ v: e.value.toFixed(5), src: e.sources.map(s => (s.node?.nodeName || "?") + "." + (s.node?.className || s.node?.parentElement?.className || "") + " x" + Math.round(s.previousRect.x) + "→" + Math.round(s.currentRect.x) + " y" + Math.round(s.previousRect.y) + "→" + Math.round(s.currentRect.y) + " h" + Math.round(s.previousRect.height) + "→" + Math.round(s.currentRect.height)) }); }).observe({ type: "layout-shift", buffered: true }); });
await page.goto("http://127.0.0.1:4398/weekday/shacharit/half-kaddish-2?date=2026-11-23"); await page.waitForTimeout(800);
console.log(lang, JSON.stringify(await page.evaluate(() => window.shifts)));
await page.close();
}
await browser.close();

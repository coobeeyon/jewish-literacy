// Speed check: Lighthouse (mobile, simulated slow 4G) on the site's canonical URLs, failing if any
// page is slower or larger than the budgets below, or if a canonical URL redirects.
//   npm run perf                      a local build (dist/), served by server.mjs on 127.0.0.1
//   npm run perf -- <base URL>        a deployed site, e.g. the Netlify one
// Lighthouse runs through npx (lighthouse@12) with Playwright's Chromium unless CHROME_PATH is set.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import * as cheerio from "cheerio";
import { serve } from "./proof-lib.mjs";

// Every page has the same budgets. A page that opens on prayer text carries that text in its HTML
// (src/texts.ts), so its size budget applies to the page without the text: the text is what the
// reader asked for, and the longest sections run to tens of kilobytes on their own.
const budget = { lcp: 1500, fcp: 1200, cls: 0.02, tbt: 50, pageGzip: 50 * 1024 };
// Map pages, and deep links to a movement, a prayer and a section. PATHS=/a,/b checks others.
const paths = process.env.PATHS ? process.env.PATHS.split(",") : ["/weekday/maariv", "/shabbat/musaf", "/weekday/shacharit/closing", "/weekday/mincha/ashrei", "/weekday/shacharit/tachanun/falling-on-the-face"];

const target = process.argv[2];
const site = target ? { base: target.replace(/\/$/, ""), stop() {} } : await serve(new URL("..", import.meta.url).pathname);
/** Playwright's Chromium, or its headless shell where only that is installed. */
function playwrightChrome() {
  const full = chromium.executablePath();
  if (existsSync(full)) return full;
  const browsers = dirname(dirname(dirname(full)));
  for (const dir of readdirSync(browsers).filter(d => d.startsWith("chromium_headless_shell-")).sort().reverse()) {
    const shell = join(browsers, dir, "chrome-headless-shell-linux64", "chrome-headless-shell");
    if (existsSync(shell)) return shell;
  }
  throw new Error("No Chromium found: run `npx playwright install chromium` or set CHROME_PATH");
}
const chrome = process.env.CHROME_PATH || playwrightChrome();
const out = mkdtempSync(join(tmpdir(), "jl-perf-"));
const failures = [];
const fail = (path, message) => failures.push(`${path}: ${message}`);

try {
  for (const path of paths) {
    const url = site.base + path;
    // Canonical URLs answer directly: no redirect, not even to a trailing slash.
    const direct = await fetch(url, { redirect: "manual" });
    if (direct.status !== 200) fail(path, `answered ${direct.status}${direct.headers.get("location") ? ` → ${direct.headers.get("location")}` : ""}`);
    const html = Buffer.from(await direct.arrayBuffer());
    const gzip = gzipSync(html, { level: 9 }).length;
    const opensOnText = html.includes("data-filled");
    const $ = cheerio.load(html);
    $(".reader-text").remove();
    const withoutText = opensOnText ? gzipSync($.html(), { level: 9 }).length : gzip;
    if (withoutText > budget.pageGzip) fail(path, `page${opensOnText ? " without its text" : ""} is ${(withoutText / 1024).toFixed(1)} KB gzipped (budget ${budget.pageGzip / 1024} KB)`);

    const report = join(out, `${path.replace(/\W+/g, "-")}.json`);
    const run = spawnSync("npx", ["-y", "lighthouse@12", url, "--chrome-flags=--headless=new --no-sandbox", "--only-categories=performance", "--output=json", `--output-path=${report}`, "--quiet"], { env: { ...process.env, CHROME_PATH: chrome }, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
    if (run.status !== 0) { fail(path, `Lighthouse failed: ${run.stderr.trim().split("\n").pop()}`); continue; }
    const { audits, categories } = JSON.parse(readFileSync(report, "utf8"));
    const value = id => audits[id].numericValue;
    const m = { fcp: value("first-contentful-paint"), lcp: value("largest-contentful-paint"), cls: value("cumulative-layout-shift"), tbt: value("total-blocking-time"), si: value("speed-index") };
    console.log(`${path}${opensOnText ? " (opens on prayer text)" : ""}  score ${Math.round(categories.performance.score * 100)}  FCP ${(m.fcp / 1000).toFixed(2)} s  LCP ${(m.lcp / 1000).toFixed(2)} s  CLS ${m.cls.toFixed(3)}  TBT ${Math.round(m.tbt)} ms  SI ${(m.si / 1000).toFixed(2)} s  page ${(gzip / 1024).toFixed(1)} KB gz${opensOnText ? ` (${((gzip - withoutText) / 1024).toFixed(1)} KB of it text)` : ""}`);
    if (m.fcp > budget.fcp) fail(path, `FCP ${Math.round(m.fcp)} ms > ${budget.fcp} ms`);
    if (m.lcp > budget.lcp) fail(path, `LCP ${Math.round(m.lcp)} ms > ${budget.lcp} ms`);
    if (m.cls > budget.cls) fail(path, `CLS ${m.cls.toFixed(3)} > ${budget.cls}`);
    if (m.tbt > budget.tbt) fail(path, `TBT ${Math.round(m.tbt)} ms > ${budget.tbt} ms`);
    if (audits.redirects?.details?.items?.length) fail(path, "Lighthouse saw a redirect");
  }
} finally {
  site.stop();
}
if (failures.length) {
  console.error(`\nOver budget:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`\nAll within budget (FCP ≤ ${budget.fcp} ms, LCP ≤ ${budget.lcp} ms, CLS ≤ ${budget.cls}, TBT ≤ ${budget.tbt} ms, pages ≤ ${budget.pageGzip / 1024} KB gzipped without their prayer text, no redirects).`);

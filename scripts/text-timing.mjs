// Tap-to-text time on a slow link like Mike's when travelling (300 ms round trip, 1.5 Mbps down),
// and what the idle prefetch of prayer texts costs:
//   - a tap on a prayer, and on a section of a prayer of several, right after the page has loaded
//     ("cold": before the idle prefetch) and once it has been idle a few seconds ("after idle");
//   - a deep link's first paint of its text, from the start of navigation;
//   - for each map and nusach, the bytes its idle prefetch fetches (gzip and brotli, from dist/).
// Times run from the tap until the text is in the page and painted; "loading" says whether a
// loading line showed first.
//   node scripts/text-timing.mjs [<site base URL>]      (default: this checkout's dist/, served locally)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import * as cheerio from "cheerio";
import { serve } from "./proof-lib.mjs";

const RUNS = Number(process.env.RUNS || 5);
const here = new URL("..", import.meta.url).pathname;
const target = process.argv[2];
const site = target ? { base: target.replace(/\/$/, ""), stop() {} } : await serve(here);
const slow = { offline: false, latency: 300, downloadThroughput: 1.5e6 / 8, uploadThroughput: 0.75e6 / 8 };
const browser = await chromium.launch();

async function phone() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.loadingSeen = false;
    new MutationObserver(records => { for (const r of records) for (const n of r.addedNodes) if (n instanceof Element && (n.matches(".reader-status") || n.querySelector(".reader-status"))) window.loadingSeen = true; }).observe(document, { childList: true, subtree: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", slow);
  return { context, page };
}

/** Milliseconds from a tap on `button` until `text` shows prayer text, painted. */
async function tapToText(page, button, text) {
  await page.evaluate(() => { window.loadingSeen = false; });
  const box = await page.locator(button).boundingBox();
  const start = Date.now();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(selector => [...document.querySelectorAll(selector)].some(el => el.checkVisibility() && el.textContent.trim()), text, { polling: "raf", timeout: 30000 });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const ms = Date.now() - start;
  return `${ms}${await page.evaluate(() => window.loadingSeen) ? " (loading)" : ""}`;
}

/** Wait until the page's idle prefetch has fetched every prayer text of its map. */
async function prefetched(page) {
  await page.waitForFunction(() => {
    const main = document.querySelector("main");
    const nusach = document.documentElement.dataset.nusach;
    const urls = new Set();
    const walk = root => { for (const el of root.querySelectorAll("[data-reader]")) { const t = JSON.parse(el.dataset.reader).texts; urls.add(t[nusach] || t.ashkenaz); } for (const t of root.querySelectorAll("template")) walk(t.content); };
    walk(document.querySelector(`template[data-map="${main.dataset.day}/${main.dataset.service}"]`).content);
    return [...urls].every(url => performance.getEntriesByName(new URL(url, location.href).href).length);
  }, null, { timeout: 60000, polling: 250 });
}

const scenarios = {
  "Rabbis' Kaddish (whole prayer), cold": async () => {
    const { context, page } = await phone();
    await page.goto(`${site.base}/weekday/shacharit`, { waitUntil: "load" });
    const ms = await tapToText(page, "#section-rabbis-kaddish .landmark-toggle", "#section-rabbis-kaddish .reader-he p");
    await context.close();
    return ms;
  },
  "Rabbis' Kaddish (whole prayer), after idle": async () => {
    const { context, page } = await phone();
    await page.goto(`${site.base}/weekday/shacharit`, { waitUntil: "load" });
    await prefetched(page);
    const ms = await tapToText(page, "#section-rabbis-kaddish .landmark-toggle", "#section-rabbis-kaddish .reader-he p");
    await context.close();
    return ms;
  },
  "Tachanun, Falling on the face (a section), cold": async () => {
    const { context, page } = await phone();
    await page.goto(`${site.base}/weekday/shacharit/tachanun`, { waitUntil: "load" });
    const ms = await tapToText(page, '#section-tachanun .toc-toggle[data-section="falling-on-the-face"]', "#text-tachanun-falling-on-the-face .reader-he p");
    await context.close();
    return ms;
  },
  "Tachanun, Falling on the face (a section), after idle": async () => {
    const { context, page } = await phone();
    await page.goto(`${site.base}/weekday/shacharit/tachanun`, { waitUntil: "load" });
    await prefetched(page);
    const ms = await tapToText(page, '#section-tachanun .toc-toggle[data-section="falling-on-the-face"]', "#text-tachanun-falling-on-the-face .reader-he p");
    await context.close();
    return ms;
  },
  "deep link /weekday/shacharit/tachanun/falling-on-the-face, navigation to text painted": async () => {
    const { context, page } = await phone();
    const start = Date.now();
    await page.goto(`${site.base}/weekday/shacharit/tachanun/falling-on-the-face`, { waitUntil: "commit" });
    await page.waitForFunction(() => [...document.querySelectorAll("#text-tachanun-falling-on-the-face .reader-he p")].some(el => el.checkVisibility({ visibilityProperty: true })), null, { polling: "raf", timeout: 30000 });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const ms = Date.now() - start;
    const seen = await page.evaluate(() => window.loadingSeen);
    await context.close();
    return `${ms}${seen ? " (loading)" : ""}`;
  },
};

const median = values => [...values].sort((a, b) => parseInt(a) - parseInt(b))[Math.floor(values.length / 2)];
console.log(`${site.base} (300 ms RTT, 1.5 Mbps down; ${RUNS} runs each)`);
for (const [name, run] of Object.entries(scenarios)) {
  const times = [];
  for (let i = 0; i < RUNS; i++) times.push(await run());
  console.log(`  ${name}: median ${median(times)} ms  [${times.join(", ")}]`);
}
await browser.close();
site.stop();

// What each map's idle prefetch fetches, per nusach, as the built files' compressed sizes.
const dist = join(here, "dist");
const size = file => { try { return statSync(file).size; } catch { return 0; } };
console.log("\nIdle prefetch per map (prayer text files; gzip / brotli):");
for (const day of ["weekday", "shabbat"]) for (const service of readdirSync(join(dist, day)).filter(f => f.endsWith(".html")).map(f => f.slice(0, -5))) {
  const $ = cheerio.load(readFileSync(join(dist, day, `${service}.html`), "utf8"));
  const store = cheerio.load($(`template[data-map="${day}/${service}"]`).html());
  const readers = [];
  const walk = html => { const $$ = cheerio.load(html); $$("[data-reader]").each((_, el) => readers.push(JSON.parse($$(el).attr("data-reader")).texts)); $$("template").each((_, t) => walk($$(t).html())); };
  walk(store.html());
  const line = ["ashkenaz", "sefard"].map(nusach => {
    const urls = [...new Set(readers.map(t => t[nusach] || t.ashkenaz))];
    const gz = urls.reduce((n, url) => n + size(join(dist, `${url}.gz`)), 0), br = urls.reduce((n, url) => n + size(join(dist, `${url}.br`)), 0);
    return `${nusach} ${urls.length} files ${(gz / 1024).toFixed(0)} / ${(br / 1024).toFixed(0)} KB`;
  });
  console.log(`  ${day}/${service}: ${line.join("; ")}`);
}

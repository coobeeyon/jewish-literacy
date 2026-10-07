// Tap-to-new-map time on a slow link like Mike's when travelling (300 ms round trip, 1.5 Mbps down),
// for one or more built checkouts side by side:
//   - a service switch (Weekday Shacharit → Mincha) and a day switch (Weekday → Shabbat), each
//     tapped once the page has settled;
//   - a reload of a page already in the HTTP cache (a 304 where the server revalidates);
//   - a cold first load of /weekday/shacharit (empty cache).
// Times run from the tap (or reload) until the new map's heading is in the page and painted (and,
// where the switch animates, until the animation is done).
//   node scripts/switch-timing.mjs <checkout with a built dist> [<another> …]
import { chromium } from "@playwright/test";
import { serve, settle } from "./proof-lib.mjs";

const checkouts = process.argv.slice(2);
if (!checkouts.length) throw new Error("usage: node scripts/switch-timing.mjs <checkout> […]");
const RUNS = Number(process.env.RUNS || 5);
// Chromium offers Brotli to 127.0.0.1 but not to a plain-http address elsewhere; ACCEPT=gzip
// measures what a phone gets over plain http.
const headers = process.env.ACCEPT ? { "Accept-Encoding": process.env.ACCEPT } : {};
const slow = { offline: false, latency: 300, downloadThroughput: 1.5e6 / 8, uploadThroughput: 0.75e6 / 8 };
const browser = await chromium.launch();

/**
 * A fresh, throttled phone-sized page with an empty HTTP cache. No request routing (Playwright's
 * routing turns the HTTP cache off); these pages ask Sefaria for nothing until a prayer opens.
 */
async function phone() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: headers });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", slow);
  return { context, page };
}

/** Milliseconds until `/day/service`'s heading shows, measured from just before `act` runs. */
async function timeTo(page, day, service, act) {
  const start = Date.now();
  await act();
  await page.waitForFunction(([day, service]) => {
    const main = document.querySelector("main");
    const heading = document.getElementById("service-heading");
    return main?.dataset.day === day && main.dataset.service === service && heading?.checkVisibility() && document.readyState !== "loading";
  }, [day, service], { polling: "raf", timeout: 30000 });
  // One more frame, so the new map has been painted.
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const shown = Date.now() - start;
  // Where a switch animates, also when the animation has finished.
  await page.waitForFunction(() => !document.documentElement.dataset.switch, null, { polling: "raf" });
  const settled = Date.now() - start;
  return settled - shown > 50 ? `${shown} (animation done ${settled})` : shown;
}

/** Tap a day or service choice where it is, without Playwright's actionability waits. */
async function tap(page, selector) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

const scenarios = {
  "service switch, Weekday Shacharit → Mincha": async base => {
    const { context, page } = await phone();
    await page.goto(`${base}/weekday/shacharit`);
    await settle(page);
    const ms = await timeTo(page, "weekday", "mincha", () => tap(page, '[data-service-choice="mincha"]'));
    await context.close();
    return ms;
  },
  "day switch, Weekday → Shabbat": async base => {
    const { context, page } = await phone();
    await page.goto(`${base}/weekday/shacharit`);
    await settle(page);
    const ms = await timeTo(page, "shabbat", "shacharit", () => tap(page, '[data-day-choice="shabbat"]'));
    await context.close();
    return ms;
  },
  "reload, page already cached (revalidation)": async base => {
    const { context, page } = await phone();
    await page.goto(`${base}/weekday/shacharit`);
    await settle(page);
    const ms = await timeTo(page, "weekday", "shacharit", () => page.reload({ waitUntil: "commit" }));
    // A revalidated page arrives as headers only (a 304); otherwise the whole page comes again.
    const { transferSize, encodedBodySize } = await page.evaluate(() => performance.getEntriesByType("navigation")[0].toJSON());
    await context.close();
    return `${ms} (${transferSize < encodedBodySize ? "304" : "200"}, ${transferSize} B)`;
  },
  "cold first load of /weekday/shacharit": async base => {
    const { context, page } = await phone();
    const ms = await timeTo(page, "weekday", "shacharit", () => page.goto(`${base}/weekday/shacharit`, { waitUntil: "commit" }));
    const { transferSize } = await page.evaluate(() => performance.getEntriesByType("navigation")[0].toJSON());
    await context.close();
    return `${ms} (page ${transferSize} B)`;
  },
};

const median = values => { const sorted = [...values].sort((a, b) => parseInt(a) - parseInt(b)); return sorted[Math.floor(sorted.length / 2)]; };
for (const dir of checkouts) {
  const site = await serve(dir);
  console.log(`\n${dir}`);
  for (const [name, run] of Object.entries(scenarios)) {
    const times = [];
    for (let i = 0; i < RUNS; i++) times.push(await run(site.base));
    console.log(`  ${name}: median ${median(times)} ms  [${times.join(", ")}]`);
  }
  site.stop();
}
await browser.close();

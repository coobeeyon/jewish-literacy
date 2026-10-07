// A filmstrip of a cold load on a phone over slow 4G (150 ms round trip, 1.6 Mbps down, CPU 4x
// slower), as Lighthouse simulates it: one PNG per painted frame, named by milliseconds since
// navigation, plus a contact sheet (sheet.png) of them. Sefaria is answered offline after `DELAY`
// ms (default 600), as a real round trip to it would take.
//   node scripts/filmstrip.mjs <checkout with a built dist, or a site's base URL> <path> <out dir>
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { sefariaResponse, serve } from "./proof-lib.mjs";

const [target, path, out] = process.argv.slice(2);
if (!out) throw new Error("usage: node scripts/filmstrip.mjs <checkout or base URL> <path> <out dir>");
const delay = Number(process.env.DELAY || 600);
mkdirSync(out, { recursive: true });
const site = /^https?:/.test(target) ? { base: target.replace(/\/$/, ""), stop() {} } : await serve(target);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await context.route("https://www.sefaria.org/api/**", async route => {
  await new Promise(resolve => setTimeout(resolve, delay));
  const body = sefariaResponse(route.request().url());
  return body ? route.fulfill({ contentType: "application/json", body: JSON.stringify(body) }) : route.fulfill({ status: 404, body: "not pinned" });
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 });
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const frames = [];
let start;
cdp.on("Page.screencastFrame", async ({ data, sessionId, metadata }) => {
  frames.push({ t: Math.round(metadata.timestamp * 1000), data: Buffer.from(data, "base64") });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await page.goto("about:blank");
await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
start = Date.now();
await page.goto(site.base + path, { waitUntil: "load" });
await page.waitForTimeout(3000);
await cdp.send("Page.stopScreencast");
// Time each frame from the start of the navigation (frames before it are about:blank).
const kept = frames.filter(f => f.t >= start).map(f => ({ ...f, ms: f.t - start }));
for (const f of kept) writeFileSync(`${out}/${String(f.ms).padStart(5, "0")}.png`, f.data);
// Contact sheet: up to 12 frames side by side (the first, the last, and evenly between), at half size.
const picked = kept.length <= 12 ? kept : [...new Set(Array.from({ length: 12 }, (_, i) => Math.round(i * (kept.length - 1) / 11)))].map(i => kept[i]);
console.log(`sheet: ${picked.map(f => f.ms).join(", ")} ms`);
const pngs = picked.map(f => PNG.sync.read(f.data));
if (pngs.length) {
  const w = Math.floor(pngs[0].width / 2), h = Math.floor(pngs[0].height / 2);
  const sheet = new PNG({ width: w * pngs.length, height: h });
  pngs.forEach((png, i) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const from = ((y * 2) * png.width + x * 2) * 4, to = (y * sheet.width + i * w + x) * 4;
      png.data.copy(sheet.data, to, from, from + 4);
    }
  });
  writeFileSync(`${out}/sheet.png`, PNG.sync.write(sheet));
}
console.log(`${kept.length} frames: ${kept.map(f => f.ms).join(", ")} ms (wall ${Date.now() - start} ms)`);
await browser.close();
site.stop();

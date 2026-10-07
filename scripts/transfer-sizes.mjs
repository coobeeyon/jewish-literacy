// Transfer sizes, two builds side by side: what a browser fetches from the site (not Sefaria) for
//   1. a cold load of /weekday/shacharit,
//   2. a cold load of a deep link to a section, with its text,
//   3. opening one prayer on a loaded map (Ashrei at Weekday Mincha, which shows its text at once).
// Each same-origin URL the browser requested is fetched again with gzip and with brotli, and the
// compressed bodies are summed by kind.
//   node scripts/transfer-sizes.mjs <other checkout with a built dist, e.g. /tmp/jl-main>
import { chromium } from "@playwright/test";
import { mockSefaria, serve, settle } from "./proof-lib.mjs";

const [other] = process.argv.slice(2);
if (!other) throw new Error("usage: node scripts/transfer-sizes.mjs <other checkout>");
const here = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const sites = { main: await serve(other), astro: await serve(here) };
const browser = await chromium.launch();

const kindOf = url => /\.(woff2?)$/.test(url) ? "fonts" : /\.js$/.test(url) ? "js" : /\.css$/.test(url) ? "css" : /\.json$/.test(url) ? "json" : "html";

async function measure(base, urls) {
  const out = {};
  for (const url of urls) {
    for (const encoding of ["gzip", "br"]) {
      const response = await fetch(url, { headers: { "Accept-Encoding": encoding } });
      const bytes = (await response.arrayBuffer()).byteLength;
      // The wire size is the compressed body server.mjs sends (fetch hands back the decoded one).
      const wire = Number(response.headers.get("content-length")) || bytes;
      const key = `${kindOf(new URL(url).pathname)}`;
      out[encoding] ||= {};
      out[encoding][key] = (out[encoding][key] || 0) + wire;
      out[encoding].total = (out[encoding].total || 0) + wire;
    }
  }
  return out;
}

async function scenario(base, steps) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockSefaria(context);
  const page = await context.newPage();
  let urls = [];
  page.on("request", request => { if (request.url().startsWith(base)) urls.push(request.url()); });
  await steps(page, () => { urls = []; });
  await settle(page);
  await context.close();
  return measure(base, [...new Set(urls)]);
}

const scenarios = {
  "cold /weekday/shacharit": base => scenario(base, async page => { await page.goto(`${base}/weekday/shacharit`); }),
  "cold deep link to a section (/weekday/shacharit/tachanun/falling-on-the-face)": base => scenario(base, async page => { await page.goto(`${base}/weekday/shacharit/tachanun/falling-on-the-face`); }),
  "opening one prayer (Ashrei, on a loaded /weekday/mincha)": base => scenario(base, async (page, reset) => {
    await page.goto(`${base}/weekday/mincha`);
    await settle(page);
    reset();
    await page.locator("#section-ashrei>button").click();
    await page.locator("#section-ashrei .reader-section").first().waitFor();
  }),
};

const rows = [];
try {
  for (const [name, run] of Object.entries(scenarios)) {
    const result = {};
    for (const [site, { base }] of Object.entries(sites)) result[site] = await run(base);
    rows.push({ name, ...result });
    const kb = n => `${((n || 0) / 1024).toFixed(1)} KB`;
    console.log(`\n${name}`);
    for (const encoding of ["gzip", "br"]) {
      for (const site of ["main", "astro"]) {
        const r = result[site][encoding] || {};
        console.log(`  ${encoding.padEnd(4)} ${site.padEnd(5)} total ${kb(r.total).padStart(9)} | html ${kb(r.html)} js ${kb(r.js)} css ${kb(r.css)} json ${kb(r.json)} fonts ${kb(r.fonts)}`);
      }
    }
  }
} finally {
  await browser.close();
  for (const site of Object.values(sites)) site.stop();
}
console.log(`\n${JSON.stringify(rows)}`);

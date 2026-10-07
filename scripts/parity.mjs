// Visual parity: screenshot the same views from two builds and diff them.
//   node scripts/parity.mjs <other checkout with a built dist, e.g. /tmp/jl-main> [out dir]
// Both sites are served by their own server.mjs on private 127.0.0.1 ports, with Sefaria answered
// offline from the pinned plans. Writes <name>-main.png, <name>-astro.png, <name>-diff.png and
// results.json under the out dir (default /workspace/mybuddy-data/jewish-literacy/proof/astro).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { corpus, mockSefaria, serve, settle } from "./proof-lib.mjs";

const [other, out = "/workspace/mybuddy-data/jewish-literacy/proof/astro"] = process.argv.slice(2);
if (!other) throw new Error("usage: node scripts/parity.mjs <other checkout> [out dir]");
const here = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
/** Pixels that may differ (anti-aliasing aside) before a pair counts as different: 0.05%. */
const tolerance = 0.0005;

const maps = [["weekday", "shacharit"], ["weekday", "mincha"], ["weekday", "maariv"], ["shabbat", "maariv"], ["shabbat", "shacharit"], ["shabbat", "musaf"], ["shabbat", "mincha"]];
const firstSlug = (day, service, id) => corpus.services.find(s => s.day === day && s.id === service).nodes.find(n => n.id === id).text.slugs.ashkenaz[0];
// Deep links on all seven maps: movements, prayers, sections, seams and the Torah block.
const deepLinks = [
  "/weekday/shacharit/pesukei-dzimra/barukh-sheamar",
  "/weekday/shacharit/torah",
  "/weekday/shacharit/half-kaddish",
  "/weekday/shacharit/tachanun/falling-on-the-face",
  "/weekday/mincha/chazzans-repetition",
  "/weekday/mincha/ashrei",
  `/weekday/maariv/evening-shema-and-its-blessings/${firstSlug("weekday", "maariv", "evening-shema-and-its-blessings")}`,
  "/weekday/maariv/mourners-kaddish",
  "/shabbat/maariv/kabbalat-shabbat",
  "/shabbat/maariv/barkhu-call-to-prayer",
  "/shabbat/shacharit/torah-service",
  "/shabbat/shacharit/torah-service/seven-aliyot-from-the-weekly-portion",
  "/shabbat/musaf/closing",
  "/shabbat/musaf/rabbis-kaddish",
  "/shabbat/mincha/half-kaddish-2",
  `/shabbat/mincha/silent-shabbat-amidah/${firstSlug("shabbat", "mincha", "silent-shabbat-amidah")}`,
  "/weekday/mincha/amidah/heicha-kedushah",
  "/shabbat/mincha/amidah/heicha-kedushah/kedushah-in-the-repetition-in-place-of-gods-holiness",
];

const shots = [];
for (const [day, service] of maps) for (const width of [390, 320]) for (const language of ["en", "he", "both"]) shots.push({ group: "maps", path: `/${day}/${service}`, width, language, nusach: "ashkenaz" });
for (const path of deepLinks) for (const nusach of ["ashkenaz", "sefard"]) shots.push({ group: "deep", path, width: 390, language: "both", nusach });
for (const language of ["en", "he", "both"]) shots.push({ group: "other", path: "/about", width: 390, language, nusach: "ashkenaz" });
shots.push({ group: "other", path: "/weekday/no-such-view", width: 390, language: "both", nusach: "ashkenaz" });

const sites = { main: await serve(other), astro: await serve(here) };
const browser = await chromium.launch();
const results = [];
try {
  for (const shot of shots) {
    const name = `${shot.path.slice(1).replace(/\//g, "-")}-${shot.width}-${shot.language}${shot.group === "deep" ? `-${shot.nusach}` : ""}`;
    mkdirSync(`${out}/${shot.group}`, { recursive: true });
    const images = {};
    for (const [site, { base }] of Object.entries(sites)) {
      const context = await browser.newContext({ viewport: { width: shot.width, height: 844 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
      await mockSefaria(context);
      await context.addInitScript(({ language, nusach }) => { localStorage.setItem("weekday-shacharit-language", language); localStorage.setItem("weekday-shacharit-nusach", nusach); }, shot);
      const page = await context.newPage();
      await page.goto(base + shot.path);
      await settle(page);
      for (const kind of ["first", "full"]) {
        const file = `${out}/${shot.group}/${name}-${kind}-${site}.png`;
        await page.screenshot({ path: file, fullPage: kind === "full" });
        (images[kind] ||= {})[site] = file;
      }
      await context.close();
    }
    for (const kind of ["first", "full"]) results.push(compare(`${shot.group}/${name}-${kind}`, images[kind].main, images[kind].astro));
  }
} finally {
  await browser.close();
  for (const site of Object.values(sites)) site.stop();
}

function compare(name, mainFile, astroFile) {
  const a = PNG.sync.read(readFileSync(mainFile)), b = PNG.sync.read(readFileSync(astroFile));
  const width = Math.max(a.width, b.width), height = Math.max(a.height, b.height);
  const pad = img => {
    if (img.width === width && img.height === height) return img.data;
    const padded = new PNG({ width, height });
    padded.data.fill(255);
    PNG.bitblt(img, padded, 0, 0, img.width, img.height, 0, 0);
    return padded.data;
  };
  const diff = new PNG({ width, height });
  const pixels = pixelmatch(pad(a), pad(b), diff.data, width, height, { threshold: 0.1 });
  writeFileSync(`${out}/${name}-diff.png`, PNG.sync.write(diff));
  const ratio = pixels / (width * height);
  const sameSize = a.width === b.width && a.height === b.height;
  const verdict = pixels === 0 && sameSize ? "identical" : ratio <= tolerance && sameSize ? "within threshold" : "different";
  const result = { name, verdict, pixels, ratio: Number(ratio.toFixed(6)), main: [a.width, a.height], astro: [b.width, b.height] };
  console.log(`${verdict.padEnd(16)} ${String(pixels).padStart(7)} px ${sameSize ? "" : `size ${a.width}x${a.height} vs ${b.width}x${b.height} `}${name}`);
  return result;
}

const counts = results.reduce((acc, r) => ({ ...acc, [r.verdict]: (acc[r.verdict] || 0) + 1 }), {});
writeFileSync(`${out}/results.json`, `${JSON.stringify({ tolerance, counts, results }, null, 1)}\n`);
console.log(counts);

// Shared by the proof scripts (parity.mjs, transfer-sizes.mjs): start a site's server.mjs on a
// private 127.0.0.1 port, and stand in for Sefaria offline (as tests/sefaria-mock.ts does).
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";

const read = file => JSON.parse(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"));
const corpus = read("corpus.generated.json");
const sections = new Map();
for (const source of Object.values(read("text-sources.generated.json"))) for (const part of source.parts) for (const section of part.sections) sections.set(decodeURIComponent(section.url), section);

export { corpus };

/** A free port on 127.0.0.1, chosen by the OS. */
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer().listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); }).on("error", reject);
});

/** Run <dir>/server.mjs (which serves <dir>/dist) on 127.0.0.1 only; resolves to its base URL and a stop(). */
export async function serve(dir) {
  const port = await freePort();
  const child = spawn(process.execPath, [`${dir}/server.mjs`], { env: { ...process.env, JL_HOST: "127.0.0.1", JL_PORT: String(port) }, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; ; i++) {
    try { await fetch(`${base}/weekday/shacharit`); break; } catch { if (i > 100) throw new Error(`${dir}/server.mjs did not start`); await new Promise(r => setTimeout(r, 100)); }
  }
  return { base, stop: () => child.kill() };
}

export function sefariaResponse(url) {
  const section = sections.get(decodeURIComponent(url));
  if (!section) return undefined;
  const edition = corpus.editions[section.edition];
  const version = lang => ({
    language: lang, versionTitle: edition[lang].title, license: edition[lang].license, versionSource: edition[lang].source,
    actualLanguage: edition[lang].language, direction: edition[lang].direction,
    text: Array.from({ length: section.count[lang] }, (_, i) => lang === "he" ? `טֶקְסְט ${i + 1} ${section.ref}` : `English segment ${i + 1} of ${section.ref}`),
  });
  return { ref: section.ref, warnings: [], versions: [version("he"), version("en")] };
}

const calendar = {
  date: "2026-10-01",
  calendar_items: [
    { title: { en: "Parashat Hashavua", he: "פרשת השבוע" }, displayValue: { en: "Bereshit", he: "בראשית" }, url: "Genesis.1.1-6.8", ref: "Genesis 1:1-6:8" },
    { title: { en: "Haftarah", he: "הפטרה" }, displayValue: { en: "Isaiah 42:5-43:10", he: "ישעיהו" }, url: "Isaiah.42.5-43.10", ref: "Isaiah 42:5-43:10" },
  ],
};

/** Answer Sefaria's API from the pinned plans, so both sites show the same text. */
export async function mockSefaria(context) {
  await context.route("https://www.sefaria.org/api/**", route => {
    const url = route.request().url();
    if (url.includes("/api/calendars")) return route.fulfill({ contentType: "application/json", body: JSON.stringify(calendar) });
    const body = sefariaResponse(url);
    return body ? route.fulfill({ contentType: "application/json", body: JSON.stringify(body) }) : route.fulfill({ status: 404, body: "not pinned" });
  });
}

/** Wait until a page is still: network quiet, fonts in, no loading text, scrolling done. */
export async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], .reader-status, .reader-calendar [role=status]'), null, { timeout: 15000 });
  for (let last = -1, i = 0; i < 50; i++) {
    const y = await page.evaluate(() => scrollY);
    if (y === last) break;
    last = y;
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(150);
}

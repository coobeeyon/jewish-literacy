// Live check: fetch every pinned Sefaria URL exactly as the app does and confirm the
// ref, editions, licenses, segment counts and every planned segment are still there.
//   node scripts/verify-sefaria.mjs
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = file => JSON.parse(readFileSync(resolve(here, "../src", file), "utf8"));
const corpus = read("corpus.generated.json");
const sources = read("text-sources.generated.json");

const sectionsByUrl = new Map();
for (const source of Object.values(sources)) {
  for (const section of source.parts.flatMap(part => part.sections)) {
    const list = sectionsByUrl.get(section.url) || [];
    list.push({ source: source.id, section });
    sectionsByUrl.set(section.url, list);
  }
}

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!(response.headers.get("content-type") || "").includes("application/json")) throw new Error("not JSON");
      return await response.json();
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

const problems = [];
let checkedSegments = 0, checkedUrls = 0;
const licenses = new Map();
const queue = [...sectionsByUrl.entries()];
async function worker() {
  while (queue.length) {
    const [url, uses] = queue.shift();
    const { section } = uses[0];
    const edition = corpus.editions[section.edition];
    const label = `${section.ref} [${section.edition}]`;
    try {
      const data = await getJson(url);
      if (data.ref !== section.ref) throw new Error(`ref is ${data.ref}`);
      if (!Array.isArray(data.warnings) || data.warnings.length) throw new Error(`warnings ${JSON.stringify(data.warnings)}`);
      if (!Array.isArray(data.versions) || data.versions.length !== 2) throw new Error(`${data.versions?.length} versions`);
      const texts = {};
      for (const version of data.versions) {
        const pin = edition[version.language];
        if (!pin) throw new Error(`unexpected language ${version.language}`);
        for (const [field, expected] of [["versionTitle", pin.title], ["license", pin.license], ["versionSource", pin.source], ["actualLanguage", pin.language], ["direction", pin.direction]]) {
          if (version[field] !== expected) throw new Error(`${version.language} ${field} is ${version[field]}, pinned ${expected}`);
        }
        licenses.set(`${version.language}: ${version.versionTitle}`, version.license);
        texts[version.language] = typeof version.text === "string" ? [version.text] : version.text;
        if (texts[version.language].length !== section.count[version.language]) throw new Error(`${version.language} has ${texts[version.language].length} segments, pinned ${section.count[version.language]}`);
      }
      for (const { section: use } of uses) {
        for (const item of use.items.split(",")) {
          const [, a, b, kind] = item.match(/^(\d+)(?:-(\d+))?(\w+)$/);
          const langs = kind === "t" || kind === "r" ? ["he", "en"] : kind === "h" || kind === "rh" ? ["he"] : ["en"];
          for (const lang of langs) for (let n = Number(a); n <= Number(b || a); n++) {
            const segment = texts[lang][n - 1];
            if (typeof segment !== "string" || !segment.replace(/<[^>]*>/g, "").trim()) throw new Error(`${lang} segment ${n} is empty`);
            checkedSegments++;
          }
        }
      }
      checkedUrls++;
    } catch (error) {
      problems.push(`${label}: ${error.message} (used by ${uses.map(u => u.source).join(", ")})`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

// The Torah cards also read Sefaria's calendar.
for (const [label, date] of [["today", new Date()], ["next Shabbat + 1", (() => { const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7) + 1); return d; })()]]) {
  try {
    const data = await getJson(`https://www.sefaria.org/api/calendars?diaspora=1&year=${date.getFullYear()}&month=${date.getMonth() + 1}&day=${date.getDate()}`);
    const parasha = data.calendar_items?.find(item => item?.title?.en === "Parashat Hashavua");
    if (!parasha?.displayValue?.en || !parasha?.url) throw new Error("no Parashat Hashavua item");
    console.log(`Calendar (${label}): ${parasha.displayValue.en} — ${parasha.ref}`);
  } catch (error) {
    problems.push(`calendar ${label}: ${error.message}`);
  }
}

const partCount = Object.values(sources).reduce((n, s) => n + s.parts.length, 0);
const sectionCount = Object.values(sources).reduce((n, s) => n + s.parts.reduce((m, p) => m + p.sections.length, 0), 0);
console.log(`Checked ${checkedUrls}/${sectionsByUrl.size} Sefaria URLs covering ${sectionCount} sections in ${partCount} parts of ${Object.keys(sources).length} text sources; ${checkedSegments} planned segments non-empty.`);
console.log("Editions and licenses reported by Sefaria:");
for (const [edition, license] of [...licenses].sort()) console.log(`  ${license.padEnd(14)} ${edition}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("All pinned Sefaria texts verified.");

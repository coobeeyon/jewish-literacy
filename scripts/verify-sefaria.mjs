// Live check: fetch every pinned Sefaria URL and confirm the ref, editions, licenses, sources and
// segment counts are still as pinned, and that the snapshot the site serves (content/texts) still
// matches what Sefaria has now. Any drift is reported segment by segment; take it in with
// `npm run snapshot-texts` once it has been read.
//   npm run verify-sefaria
import { existsSync, readFileSync } from "node:fs";
import { checkSection, getJson, sectionsByUrl, snapshotOf, snapshotPath, sources, usedSegments } from "./sefaria-texts.mjs";

const byUrl = sectionsByUrl();
const problems = [];
const texts = new Map();
const licenses = new Map();
let checkedSegments = 0;
const queue = [...byUrl.entries()];
async function worker() {
  while (queue.length) {
    const [url, uses] = queue.shift();
    const { section } = uses[0];
    try {
      const found = checkSection(await getJson(url), section, licenses);
      for (const { section: use } of uses) {
        const used = usedSegments(use);
        for (const lang of ["he", "en"]) for (const n of used[lang]) {
          if (!found[lang][n - 1]?.replace(/<[^>]*>/g, "").trim()) throw new Error(`${lang} segment ${n} is empty`);
          checkedSegments++;
        }
      }
      texts.set(url, found);
    } catch (error) {
      problems.push(`${section.ref} [${section.edition}]: ${error.message} (used by ${uses.map(u => u.source).join(", ")})`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

// The snapshot against live Sefaria, for every prayer whose sections all came back as pinned.
const drift = [];
const short = text => (text ?? "(none)").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 90);
for (const source of Object.values(sources)) {
  if (!source.parts.every(part => part.sections.every(section => texts.has(section.url)))) continue;
  const file = snapshotPath(source.id);
  if (!existsSync(file)) { drift.push(`${source.id}: no snapshot`); continue; }
  const kept = JSON.parse(readFileSync(file, "utf8"));
  const live = snapshotOf(source, texts);
  for (const [ref, now] of Object.entries(live.refs)) {
    for (const lang of ["he", "en"]) for (const [n, text] of Object.entries(now[lang])) {
      const before = kept.refs[ref]?.[lang]?.[n];
      if (before !== text) drift.push(`${source.id}: ${ref} ${lang} ${n}\n    snapshot: ${short(before)}\n    Sefaria:  ${short(text)}`);
    }
  }
  const extra = Object.keys(kept.refs).filter(ref => !live.refs[ref]);
  if (extra.length) drift.push(`${source.id}: snapshot has refs no longer pinned: ${extra.join(", ")}`);
}

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
console.log(`Checked ${texts.size}/${byUrl.size} Sefaria URLs covering ${sectionCount} sections in ${partCount} parts of ${Object.keys(sources).length} text sources; ${checkedSegments} planned segments non-empty.`);
console.log("Editions and licenses reported by Sefaria:");
for (const [edition, license] of [...licenses].sort()) console.log(`  ${license.padEnd(14)} ${edition}`);
if (drift.length) console.error(`\nThe snapshot differs from live Sefaria in ${drift.length} place(s) (npm run snapshot-texts takes Sefaria's version):\n${drift.join("\n")}`);
else console.log("The snapshot in content/texts matches live Sefaria.");
if (problems.length) console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`);
if (problems.length || drift.length) process.exit(1);
console.log("All pinned Sefaria texts verified.");

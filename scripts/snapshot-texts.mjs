// Snapshot every pinned prayer text from Sefaria into content/texts, so the site serves the texts
// itself and builds with no Sefaria access. Each section is accepted only if it is exactly the
// pinned ref, editions, licenses, sources and segment count (as scripts/verify-sefaria.mjs checks);
// any problem writes nothing. Run after re-pinning (npm run pin-sefaria, npm run extract).
//   npm run snapshot-texts
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { checkSection, getJson, sectionsByUrl, snapshotJson, snapshotOf, snapshotPath, sources, textsDir } from "./sefaria-texts.mjs";

const byUrl = sectionsByUrl();
const texts = new Map();
const problems = [];
const queue = [...byUrl.entries()];
async function worker() {
  while (queue.length) {
    const [url, uses] = queue.shift();
    const { section } = uses[0];
    try {
      texts.set(url, checkSection(await getJson(url), section));
    } catch (error) {
      problems.push(`${section.ref} [${section.edition}]: ${error.message} (used by ${uses.map(u => u.source).join(", ")})`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
if (problems.length) {
  console.error(`${problems.length} problem(s); nothing written:\n${problems.join("\n")}`);
  process.exit(1);
}

const snapshots = Object.values(sources).map(source => snapshotOf(source, texts));
const written = new Set();
let bytes = 0;
for (const snapshot of snapshots) {
  const file = snapshotPath(snapshot.id);
  mkdirSync(dirname(file), { recursive: true });
  const body = snapshotJson(snapshot);
  writeFileSync(file, body);
  written.add(file);
  bytes += Buffer.byteLength(body);
}
// Prayers no longer pinned lose their snapshot.
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
for (const file of walk(textsDir)) if (file.endsWith(".json") && !written.has(file)) { rmSync(file); console.log(`Removed ${relative(textsDir, file)}`); }
console.log(`Snapshot ${byUrl.size} Sefaria sections into ${snapshots.length} files under content/texts (${(bytes / 1024).toFixed(0)} KB).`);

// Mike's standing rule: the site never says "Orthodox" and never mentions denominations.
// Scans everything we write (UI, content, notes); prayer text snapshots in content/texts are excluded.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const banned = [
  /\borthodox/i, /\bdenomination/i, /\breform\s+(jud|jew|movement|congregation|temple|synagogue)/i,
  /\bconservative\s+(jud|jew|movement|congregation|synagogue)/i, /\breconstructionis/i, /\bultra-?orthodox/i,
  /אורתודוקס/, /רפורמ/, /קונסרבטיב/, /\bזרם\b/, /\bזרמים\b/, /\bזרמי\b/,
];
const roots = ["src", "content/roadmap.html", "README.md"];
const skip = new Set(["node_modules", "dist"]);
const files = [];
const walk = path => {
  const stat = statSync(path);
  if (stat.isDirectory()) { for (const name of readdirSync(path)) if (!skip.has(name)) walk(join(path, name)); }
  else if (/\.(tsx?|astro|html|md|json|mjs|css)$/.test(path)) files.push(path);
};
roots.forEach(walk);
const hits = [];
for (const file of files) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    for (const re of banned) if (re.test(line)) hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
  });
}
if (hits.length) { console.error("Wording rule: the site never says \"Orthodox\" or names denominations.\n" + hits.join("\n")); process.exit(1); }
console.log(`Wording check passed (${files.length} files).`);

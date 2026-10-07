// The prayer texts the site serves are a snapshot of Sefaria, kept in content/texts (one file per
// prayer and nusach). Shared by scripts/snapshot-texts.mjs, which writes the snapshot, and
// scripts/verify-sefaria.mjs, which compares it with live Sefaria. Both fetch every pinned section
// and accept it only if it is exactly the pinned ref, editions, licenses, sources and segment count.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMarkup } from "../src/format.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = file => JSON.parse(readFileSync(resolve(here, "../src", file), "utf8"));
export const corpus = read("corpus.generated.json");
export const sources = read("text-sources.generated.json");
export const textsDir = resolve(here, "../content/texts");

/** Where a prayer's text in one nusach is kept: "weekday/shacharit/ashrei:sefard" → content/texts/weekday/shacharit/ashrei.sefard.json. */
export const snapshotPath = id => resolve(textsDir, `${id.replace(":", ".")}.json`);

/** The 1-based segment numbers, per language, that a section's reading plan uses. */
export function usedSegments(section) {
  const used = { he: new Set(), en: new Set() };
  for (const item of section.items.split(",")) {
    const [, a, b, kind] = item.match(/^(\d+)(?:-(\d+))?(t|h|r|rh|re)$/);
    const langs = kind === "t" || kind === "r" ? ["he", "en"] : kind === "h" || kind === "rh" ? ["he"] : ["en"];
    for (const lang of langs) for (let n = Number(a); n <= Number(b || a); n++) used[lang].add(n);
  }
  return used;
}

/** Every pinned Sefaria URL, with the sections (and their text sources) that read it. */
export function sectionsByUrl() {
  const byUrl = new Map();
  for (const source of Object.values(sources)) {
    for (const section of source.parts.flatMap(part => part.sections)) {
      const list = byUrl.get(section.url) || [];
      list.push({ source: source.id, section });
      byUrl.set(section.url, list);
    }
  }
  return byUrl;
}

export async function getJson(url) {
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

/**
 * Accept a Sefaria response only if it is exactly the pinned ref, editions, licenses, sources and
 * segment counts; returns each language's segments. `licenses` (optional) collects what Sefaria reports.
 */
export function checkSection(data, section, licenses) {
  const edition = corpus.editions[section.edition];
  if (data.ref !== section.ref) throw new Error(`ref is ${data.ref}`);
  if (!Array.isArray(data.warnings) || data.warnings.length) throw new Error(`warnings ${JSON.stringify(data.warnings)}`);
  if (!Array.isArray(data.versions) || data.versions.length !== 2) throw new Error(`${data.versions?.length} versions`);
  const texts = {};
  for (const version of data.versions) {
    const pin = edition[version.language];
    if (!pin || texts[version.language]) throw new Error(`unexpected language ${version.language}`);
    for (const [field, expected] of [["versionTitle", pin.title], ["license", pin.license], ["versionSource", pin.source], ["actualLanguage", pin.language], ["direction", pin.direction]]) {
      if (version[field] !== expected) throw new Error(`${version.language} ${field} is ${version[field]}, pinned ${expected}`);
    }
    licenses?.set(`${version.language}: ${version.versionTitle}`, version.license);
    const segments = typeof version.text === "string" ? [version.text] : version.text;
    if (!Array.isArray(segments) || segments.some(s => typeof s !== "string")) throw new Error(`${version.language} text shape changed`);
    if (segments.length !== section.count[version.language]) throw new Error(`${version.language} has ${segments.length} segments, pinned ${section.count[version.language]}`);
    texts[version.language] = segments;
  }
  if (!texts.he || !texts.en) throw new Error("missing language");
  return texts;
}

const escape = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const serialize = nodes => nodes.map(node => typeof node === "string" ? escape(node) : "br" in node ? "<br>" : `<${node.tag}>${serialize(node.children)}</${node.tag}>`).join("");

/**
 * A segment as kept in the snapshot: Sefaria's markup reduced to the tags the reader keeps (line
 * breaks, bold, italics, small, big, superscript), with footnotes, attributes and every other tag
 * gone. src/format.ts reads it at build time exactly as it would read Sefaria's own markup.
 */
export const sanitize = raw => serialize(parseMarkup(raw));

/** A prayer's snapshot: for each Sefaria ref it reads, the sanitized segments its plan uses. */
export function snapshotOf(source, textsByUrl) {
  const refs = {};
  for (const section of source.parts.flatMap(part => part.sections)) {
    const texts = textsByUrl.get(section.url);
    const entry = refs[section.ref] ??= { edition: section.edition, he: {}, en: {} };
    const used = usedSegments(section);
    for (const lang of ["he", "en"]) for (const n of used[lang]) {
      const segment = sanitize(texts[lang][n - 1]);
      if (!segment.replace(/<[^>]*>/g, "").trim()) throw new Error(`${section.ref} [${section.edition}] ${lang} segment ${n} is empty`);
      entry[lang][n] = segment;
    }
  }
  return { id: source.id, refs };
}

/** The snapshot file's text: one segment per line, so a change in Sefaria shows as a small diff. */
export const snapshotJson = snapshot => `${JSON.stringify(snapshot, null, 1)}\n`;

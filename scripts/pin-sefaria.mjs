// Resolve scripts/sefaria-spec.mjs against the live Sefaria API and pin the result.
//
//   node scripts/pin-sefaria.mjs              write scripts/sefaria-pins.json
//   node scripts/pin-sefaria.mjs --preview weekday/shacharit/barkhu-call-to-prayer [sefard]
//
// For every section this records the canonical ref, the exact edition metadata Sefaria
// reports, the segment counts, and which segments are prayer text versus short rubrics.
// Responses are cached under node_modules/.cache/sefaria so reruns are cheap.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptedLicenses, cards, editions, unfilled } from "./sefaria-spec.mjs";
import { apiUrl, pageUrl } from "./sefaria-url.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cacheDir = resolve(here, "../node_modules/.cache/sefaria");
const target = resolve(here, "sefaria-pins.json");
mkdirSync(cacheDir, { recursive: true });

async function getJson(url, { fresh = false } = {}) {
  const file = resolve(cacheDir, createHash("sha1").update(url).digest("hex") + ".json");
  if (!fresh && existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      writeFileSync(file, JSON.stringify(data));
      return data;
    } catch (error) {
      if (attempt >= 4) throw new Error(`${url}: ${error.message}`);
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
}

const letters = s => (s.match(/[א-ת]/g) || []).length;
const points = s => (s.match(/[ְ-ׇּׁׂ]/g) || []).length;
export const isPointed = s => letters(s) > 0 && points(s) / letters(s) > 0.3;
const plain = s => (typeof s === "string" ? s : "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const norm = s => plain(s).replace(/[֑-ׇ]/g, "").replace(/[^א-ת ]/g, " ").replace(/\s+/g, " ").trim();
// Rubrics are short stage directions ("The Chazzan says:", "On Rosh Chodesh add:") or
// headings. Anything else in an unpointed segment is editorial commentary and is dropped.
const rubricStart = /^[\s(\[*]*(the (chazzan|congregation|reader|kohein|kohen|leader|ark|torah|phrase|following (three|two|line|lines|verse|verses|paragraph|psalm|prayer|prayers|is|are|blessing|berach|supplication|three paragraphs))|congregation|chazzan|cong\.|leader|all\b|mourners?|on |during|from (the|rosh|shemini)|when|after|before|upon|while|cover|place|wrap|then |with the|some |a woman|recite|say |continue|to be said|refrain|bow|stand|as the|in israel|if yom tov|between|at the|kohein|in some|many congregations|it is customary|\*?during|\d+\)|mishnah|psalm \d|(exodus|leviticus|numbers|deuteronomy|genesis|isaiah|psalms?|nehemiah|i+ chronicles|1 chronicles|ii samuel) \d)/i;
const isHeading = en => /^[A-Z][A-Z’'‘,;:&.\- ]{2,}$/.test(en) && !/[a-z]/.test(en);
const isRubric = en => en.length <= 170 && (rubricStart.test(en) || isHeading(en));

function locate(he, anchor, after, label) {
  const chain = Array.isArray(anchor) ? anchor : [anchor];
  let position = after;
  for (const step of chain) {
    if (typeof step === "number") { position = step; continue; }
    const wanted = norm(step);
    const found = he.findIndex((seg, i) => i + 1 > position && norm(seg).replace(/^(חזן|קהל וחזן|קהל וש ץ|קהל ש ץ|קהל ואבל|קהל|שליח ציבור|ש ץ|אבל|קורא|עולה) /, "").startsWith(wanted));
    if (found < 0) throw new Error(`${label}: anchor "${step}" not found after segment ${position}`);
    position = found + 1;
  }
  return position;
}

function plan(section, heText, enText, layout, label) {
  const count = Math.max(heText.length, enText.length);
  let from = section.from === undefined ? 1 : locate(heText, section.from, 0, label);
  // A part that starts at the siddur's own heading line gets our heading instead.
  if (section.dropHeading && !isPointed(plain(heText[from - 1]))) from += 1;
  // A single incipit is searched after `from`; a chain is resolved from the top of the leaf.
  const until = section.until === undefined ? count + 1 : locate(heText, section.until, Array.isArray(section.until) ? 0 : from, label);
  if (until <= from) throw new Error(`${label}: empty range ${from}-${until}`);
  const skipped = new Set();
  for (const [a, b] of section.skip || []) {
    const start = locate(heText, a, 0, label), end = locate(heText, b, Array.isArray(b) ? 0 : start, label);
    for (let i = start; i < end; i++) skipped.add(i);
  }
  const kinds = [];
  for (let n = from; n < until; n++) {
    if (skipped.has(n)) continue;
    const he = plain(heText[n - 1]), en = plain(enText[n - 1]);
    let kind = null;
    if (he && isPointed(he)) {
      // An English segment far longer than its Hebrew is editorial commentary in the slot
      // where a translation belongs (e.g. the first Lekha Dodi refrain); show the Hebrew only.
      const commentary = en.length > 4 * he.length + 200;
      if (commentary) console.warn(`  note: ${label} segment ${n}: English looks like commentary; showing Hebrew only`);
      kind = en && !commentary ? "t" : "h";
    }
    // Some Koren Hebrew rubrics are half English ("On ראש חודש and…"); show those in English only.
    else if (en && isRubric(en)) kind = he && he.length <= 70 && !/[A-Za-z]/.test(he) ? "r" : "re";
    else if (!en && he && he.length <= 70) kind = "rh";
    if (kind) kinds.push([n, kind, he]);
  }
  // Group into paragraphs: linear editions join phrases until a verse ends (":" / "׃").
  const items = [];
  for (const [n, kind, he] of kinds) {
    const last = items[items.length - 1];
    const joinable = layout === "linear" && last && last[2] === kind && last[1] === n - 1 && kind.startsWith("t") === true && !last.closed;
    if (joinable) { last[1] = n; last.closed = /[:׃]\s*$/.test(he); }
    else items.push(Object.assign([n, n, kind], { closed: layout !== "linear" || /[:׃]\s*$/.test(he) }));
  }
  const text = kinds.filter(([, k]) => k === "t" || k === "h").length;
  if (!text) throw new Error(`${label}: no prayer text selected`);
  return { from, until, items: items.map(([a, b, k]) => [a, b, k]) };
}

export async function resolveSection(section, { fresh = false } = {}) {
  const edition = editions[section.ed];
  if (!edition) throw new Error(`Unknown edition ${section.ed}`);
  const url = apiUrl(section.ref, edition);
  const data = await getJson(url, { fresh });
  if (data.error) throw new Error(`${section.ref}: ${data.error}`);
  if (!Array.isArray(data.warnings) || data.warnings.length) throw new Error(`${section.ref}: warnings ${JSON.stringify(data.warnings)}`);
  const pins = {};
  const texts = {};
  for (const lang of ["he", "en"]) {
    const version = (data.versions || []).find(v => v.language === lang);
    if (!version) throw new Error(`${section.ref}: missing ${lang}`);
    if (version.versionTitle !== edition[lang]) throw new Error(`${section.ref}: ${lang} edition is ${version.versionTitle}`);
    if (!acceptedLicenses.includes(version.license)) throw new Error(`${section.ref}: unacceptable license ${version.license}`);
    pins[lang] = { title: version.versionTitle, license: version.license, source: version.versionSource, direction: version.direction, language: version.actualLanguage };
    texts[lang] = [version.text].flat();
  }
  if ((data.versions || []).length !== 2) throw new Error(`${section.ref}: expected two versions`);
  return { data, pins, texts, url };
}

async function build() {
  const out = { generatedFrom: "scripts/sefaria-spec.mjs", editions: {}, sources: {}, cards: {}, unfilled };
  const refCache = new Map();
  for (const [key, spec] of Object.entries(cards)) {
    out.cards[key] = { ...(spec.calendar ? { calendar: spec.calendar } : {}) };
    for (const nusach of ["ashkenaz", "sefard"]) {
      if (!spec[nusach]) continue;
      const parts = [];
      for (const [partIndex, part] of spec[nusach].entries()) {
        const sections = [];
        for (const [index, section] of part.sections.entries()) {
          const label = `${key} ${nusach} part ${partIndex + 1} #${index + 1} ${section.ref}`;
          const cacheKey = section.ed + "|" + section.ref;
          if (!refCache.has(cacheKey)) refCache.set(cacheKey, await resolveSection(section));
          const { data, pins, texts } = refCache.get(cacheKey);
          const edition = editions[section.ed];
          const known = out.editions[section.ed];
          if (known && JSON.stringify({ he: known.he, en: known.en }) !== JSON.stringify(pins)) throw new Error(`${label}: edition metadata differs between refs`);
          out.editions[section.ed] = { id: section.ed, layout: edition.layout, cite: edition.cite, sourceLabel: edition.sourceLabel, he: pins.he, en: pins.en };
          const { items } = plan(section, texts.he, texts.en, edition.layout, label);
          sections.push({ ref: data.ref, edition: section.ed, count: { he: texts.he.length, en: texts.en.length }, items });
        }
        parts.push({ toc: part.toc, ...(part.h ? { heading: { en: part.h[0], he: part.h[1] } } : {}), sections });
      }
      const id = `${key}:${nusach}`;
      out.sources[id] = { id, nusach, parts, fallbackUrl: pageUrl(parts[0].sections[0].ref) };
      out.cards[key][nusach] = id;
    }
  }
  return out;
}

export function render(section, texts) {
  const joiner = section.layout === "linear" ? " " : "\n";
  const pick = (lang, a, b) => texts[lang].slice(a - 1, b).map(plain).filter(Boolean).join(joiner);
  const out = { he: [], en: [] };
  for (const [a, b, kind] of section.items) {
    if (kind === "t" || kind === "h" || kind === "r" || kind === "rh") out.he.push((kind.startsWith("r") ? "  [" : "") + pick("he", a, b) + (kind.startsWith("r") ? "]" : ""));
    if (kind === "t" || kind === "r" || kind === "re") out.en.push((kind.startsWith("r") ? "  [" : "") + pick("en", a, b) + (kind.startsWith("r") ? "]" : ""));
  }
  return out;
}

const args = process.argv.slice(2);
if (args[0] === "--preview") {
  const [, key, nusach = "ashkenaz", width = "160"] = args;
  const pins = await build();
  const source = pins.sources[`${key}:${nusach}`];
  if (!source) throw new Error(`No source for ${key}:${nusach}`);
  for (const part of source.parts) {
    console.log(`\n=== ${part.heading?.en || "(no heading)"} [toc: ${part.toc.join(" | ")}]`);
    for (const section of part.sections) {
      const edition = editions[section.edition];
      const { texts } = await resolveSection({ ed: section.edition, ref: section.ref });
      const rendered = render({ ...section, layout: edition.layout }, texts);
      console.log(`--- ${section.ref} [${section.items.length} items]`);
      for (const lang of ["he", "en"]) for (const line of rendered[lang]) console.log(lang, "|", line.slice(0, +width));
    }
  }
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const pins = await build();
  writeFileSync(target, `${JSON.stringify(pins, null, 1)}\n`);
  const partCount = Object.values(pins.sources).reduce((n, s) => n + s.parts.length, 0);
  const sectionCount = Object.values(pins.sources).reduce((n, s) => n + s.parts.reduce((m, p) => m + p.sections.length, 0), 0);
  console.log(`Pinned ${Object.keys(pins.cards).length} cards, ${Object.keys(pins.sources).length} sources, ${partCount} parts, ${sectionCount} sections, ${Object.keys(pins.editions).length} editions`);
}

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { formatSegment, plainOf, type Inline } from "../src/format";

/** Inline nodes with adjacent text joined. */
const joined = (nodes: Inline[]): Inline[] => nodes.reduce<Inline[]>((out, node) => {
  const last = out[out.length - 1];
  if (typeof node === "string" && typeof last === "string") out[out.length - 1] = last + node;
  else out.push(typeof node === "string" || "br" in node ? node : { ...node, children: joined(node.children) });
  return out;
}, []);
import { checkSection, corpus, sanitize, snapshotPath, sources, usedSegments } from "../scripts/sefaria-texts.mjs";

// The prayer texts are a snapshot of Sefaria in content/texts (scripts/snapshot-texts.mjs). These
// check the snapshot itself and the rules it was taken under; no test talks to the real Sefaria.
test.beforeEach(() => { test.skip(test.info().project.name !== "phone-390", "no browser needed"); });

type Section = { ref: string; edition: string; url: string; count: { he: number; en: number }; items: string };
type Source = { id: string; parts: Array<{ sections: Section[] }> };
const allSources = Object.values(sources) as Source[];
const snapshot = (id: string) => JSON.parse(readFileSync(snapshotPath(id), "utf8"));

test("the snapshot has every segment every prayer's plan reads, sanitized", () => {
  let segments = 0;
  for (const source of allSources) {
    const kept = snapshot(source.id);
    expect(kept.id).toBe(source.id);
    for (const section of source.parts.flatMap(part => part.sections)) {
      const ref = kept.refs[section.ref];
      expect(ref?.edition, `${source.id} ${section.ref}`).toBe(section.edition);
      const used = usedSegments(section);
      for (const lang of ["he", "en"] as const) for (const n of used[lang]) {
        const text: string = ref[lang][n];
        expect(text?.replace(/<[^>]*>/g, "").trim(), `${source.id} ${section.ref} ${lang} ${n}`).toBeTruthy();
        // Only the kept tags, bare.
        expect(text.match(/<[^>]*>/g)?.filter(tag => !/^<\/?(b|i|small|big|sup)>$|^<br>$/.test(tag)) || [], `${source.id} ${lang} ${n}`).toEqual([]);
        segments++;
      }
    }
  }
  expect(allSources.length).toBe(144);
  expect(segments).toBeGreaterThan(3000);
});

/** A response as Sefaria gives it for a section, exactly as pinned. */
function response(section: Section) {
  const edition = corpus.editions[section.edition];
  const version = (lang: "he" | "en") => ({
    language: lang, versionTitle: edition[lang].title, license: edition[lang].license, versionSource: edition[lang].source,
    actualLanguage: edition[lang].language, direction: edition[lang].direction,
    text: Array.from({ length: section.count[lang] }, (_, i) => `${lang} ${i + 1}`),
  });
  return { ref: section.ref, warnings: [] as unknown[], versions: [version("he"), version("en")] };
}

test("a Sefaria response is taken only if it is exactly the pinned ref, editions, licenses, sources and shape", () => {
  const section = allSources.find(s => s.id === "weekday/mincha/ashrei:ashkenaz")!.parts[0].sections[0];
  expect(checkSection(response(section), section).he).toHaveLength(section.count.he);
  const changes: Array<[string, (r: ReturnType<typeof response>) => void]> = [
    ["ref", r => { r.ref = "Psalms 145"; }],
    ["warnings", r => { r.warnings.push("version not found"); }],
    ["license", r => { r.versions[1].license = "All rights reserved"; }],
    ["edition", r => { r.versions[0].versionTitle = "Another edition"; }],
    ["source", r => { r.versions[0].versionSource = "https://example.com"; }],
    ["direction", r => { r.versions[0].direction = "ltr"; }],
    ["segment count", r => { r.versions[1].text.pop(); }],
    ["a missing language", r => { r.versions.pop(); }],
  ];
  for (const [what, change] of changes) {
    const changed = response(section);
    change(changed);
    expect(() => checkSection(changed, section), what).toThrow();
  }
});

test("sanitizing keeps each edition's formatting and nothing else, and the reader reads it as it would Sefaria's", () => {
  const he = "<b>אַשְׁרֵי</b> יוֹשְׁבֵי<br>בָּרוּךְ<script>bad()</script> <i class=\"instruction\">Quietly:</i> &amp; עוֹד";
  const en = "<i class=\"instruction\" style=\"color:red\" onclick=\"alert(1)\">Leader:</i> <small><i class=\"instruction\">Leader:</i></small>אַשְׁרֵי Happy13 are those<br>whose God is the <small>LORD</small>. Adonoy <span data-x=\"1\">kept</span><sup class=\"footnote-marker\">1</sup><i class=\"footnote\">NOTE BODY</i> &lt;sic&gt;";
  const cleanHe = sanitize(he), cleanEn = sanitize(en);
  expect(cleanHe).toBe("<b>אַשְׁרֵי</b> יוֹשְׁבֵי<br>בָּרוּךְ <i>Quietly:</i> &amp; עוֹד");
  expect(cleanEn).not.toMatch(/script|style|onclick|class|span|data-x|footnote|NOTE BODY|<sup>/);
  // The same reading, from the snapshot as from Sefaria: formatting kept, glitches fixed (adjacent
  // pieces of text may be joined differently, which renders the same).
  for (const [raw, clean, lang] of [[he, cleanHe, "he"], [en, cleanEn, "en"]] as const) {
    for (const rubric of [false, true]) expect(joined(formatSegment(clean, lang, rubric))).toEqual(joined(formatSegment(raw, lang, rubric)));
  }
  expect(plainOf(formatSegment(cleanEn, "en", false))).toBe("Leader: Happy are those\nwhose God is the LORD. LORD kept sic");
});

test("Metsudah's English in the snapshot has the transliterated Name the reader replaces", () => {
  // So the browser test that the English shows "LORD" instead is a real check.
  expect(JSON.stringify(snapshot("weekday/mincha/ashrei:sefard"))).toMatch(/\bAdonoy\b/);
});

test("TEXT-LICENSES.md names every edition with its license as Sefaria reports it", () => {
  const licenses = readFileSync(new URL("../TEXT-LICENSES.md", import.meta.url), "utf8");
  const label: Record<string, string> = { "CC-BY-NC": "CC BY-NC", "CC-BY": "CC BY", "Public Domain": "public domain" };
  for (const edition of Object.values(corpus.editions) as Array<{ cite: { en: string }; he: { license: string; source: string }; en: { license: string; source: string } }>) {
    expect(licenses).toContain(edition.cite.en);
    for (const source of new Set([edition.he.source, edition.en.source])) expect(licenses).toContain(source);
    for (const license of new Set([edition.he.license, edition.en.license])) expect(licenses).toContain(label[license]);
  }
  expect(licenses).toMatch(/non-commercial/);
});

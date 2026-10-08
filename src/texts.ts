// Build time: the prayer texts, from the Sefaria snapshot in content/texts (written by
// scripts/snapshot-texts.mjs; no Sefaria access at build time). Each prayer's text in each nusach
// is rendered once, in each edition's own formatting, and is used two ways: written into a page
// that opens on it, and as its own small content-hashed file (/texts/…json) that the browser
// fetches, or prefetches while idle, to open the prayer in place.
import { createHash } from "node:crypto";
import { renderToString } from "preact-render-to-string";
import sourcesJson from "./text-sources.generated.json";
import { renderSection, type RenderedPart, type Texts } from "./sefaria";
import type { Localized, TextSource, TextSources } from "./types";
import { Credit, PartBody } from "./view/reader";

const sources = sourcesJson as TextSources;

type Snapshot = { id: string; refs: Record<string, { edition: string; he: Record<string, string>; en: Record<string, string> }> };
const snapshots = new Map(Object.values(import.meta.glob<Snapshot>("../content/texts/**/*.json", { eager: true, import: "default" })).map(s => [s.id, s]));

/** What the browser fetches for one prayer in one nusach: each part's heading and text, and the credit (with and without the note that Sefard isn't available). */
export type TextFile = Readonly<{ parts: ReadonlyArray<{ heading?: Localized; html: string }>; credit: string; fellBack: string }>;

export const sourceOf = (id: string): TextSource => {
  const source = sources[id];
  if (!source) throw new Error(`No text source ${id}`);
  return source;
};

const rendered = new Map<string, RenderedPart[]>();

/** A prayer's parts, rendered from the snapshot; the build fails if the snapshot lacks a planned segment. */
export function partsOf(id: string): RenderedPart[] {
  let parts = rendered.get(id);
  if (parts) return parts;
  const source = sourceOf(id);
  const snapshot = snapshots.get(id);
  if (!snapshot) throw new Error(`No snapshot of ${id} in content/texts: run npm run snapshot-texts`);
  parts = source.parts.map(part => {
    const out: RenderedPart = { heading: part.heading, en: [], he: [] };
    for (const section of part.sections) {
      const kept = snapshot.refs[section.ref];
      if (!kept || kept.edition !== section.edition) throw new Error(`The snapshot of ${id} lacks ${section.ref} [${section.edition}]: run npm run snapshot-texts`);
      const texts: Texts = {
        he: Array.from({ length: section.count.he }, (_, i) => kept.he[i + 1] ?? ""),
        en: Array.from({ length: section.count.en }, (_, i) => kept.en[i + 1] ?? ""),
      };
      try { renderSection(section, texts, out); } catch (error) { throw new Error(`${id}, ${section.ref}: ${(error as Error).message} (run npm run snapshot-texts)`); }
    }
    if (!out.he.some(p => !p.rubric && !p.note)) throw new Error(`${id}: a part has no prayer text`);
    return out;
  });
  rendered.set(id, parts);
  return parts;
}

const files = new Map<string, { name: string; body: string }>();

function file(id: string) {
  let found = files.get(id);
  if (found) return found;
  const source = sourceOf(id);
  const body = JSON.stringify({
    parts: partsOf(id).map(part => ({ heading: part.heading, html: renderToString(PartBody(part)) })),
    credit: renderToString(Credit(source, false)),
    fellBack: renderToString(Credit(source, true)),
  } satisfies TextFile);
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 10);
  found = { name: `${id.replace(/[^a-z0-9-]+/gi, "-")}-${hash}.json`, body };
  files.set(id, found);
  return found;
}

export const textUrl = (id: string) => `/texts/${file(id).name}`;

export const allTextFiles = () => Object.keys(sources).map(id => file(id));

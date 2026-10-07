// Build time: each prayer's Sefaria reading plan becomes its own small JSON file, fetched the
// first time that prayer opens. The content hash in the name lets the files be cached forever.
import { createHash } from "node:crypto";
import sourcesJson from "./text-sources.generated.json";
import { corpus } from "./routes";
import type { Edition, TextSource, TextSources } from "./types";

const sources = sourcesJson as TextSources;

/** What the browser fetches for one prayer in one nusach: its plan and the editions it cites. */
export type Plan = Readonly<{ source: TextSource; editions: Record<string, Edition> }>;

const files = new Map<string, { name: string; body: string }>();

function file(id: string) {
  let found = files.get(id);
  if (found) return found;
  const source = sources[id];
  if (!source) throw new Error(`No reading plan ${id}`);
  const editions = Object.fromEntries([...new Set(source.parts.flatMap(p => p.sections.map(s => s.edition)))].map(e => [e, corpus.editions[e]]));
  const body = JSON.stringify({ source, editions } satisfies Plan);
  const hash = createHash("sha256").update(body).digest("hex").slice(0, 10);
  found = { name: `${id.replace(/[^a-z0-9-]+/gi, "-")}-${hash}.json`, body };
  files.set(id, found);
  return found;
}

export const planUrl = (id: string) => `/plans/${file(id).name}`;

export const allPlans = () => Object.keys(sources).map(id => file(id));

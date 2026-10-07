import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tocEntries } from "./toc.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(resolve(here, "../src/corpus.generated.json"), "utf8"));
corpus.textSources = JSON.parse(readFileSync(resolve(here, "../src/text-sources.generated.json"), "utf8"));
const allowed = { weekday: new Set(["shacharit", "mincha", "maariv"]), shabbat: new Set(["maariv", "shacharit", "musaf", "mincha"]) };
const licenses = new Set(["Public Domain", "CC0", "CC-BY", "CC-BY-SA", "CC-BY-NC"]);
const fail = message => { throw new Error(message); };

for (const [id, edition] of Object.entries(corpus.editions)) {
  for (const lang of ["he", "en"]) {
    const pin = edition[lang];
    if (!pin?.title || !pin.source || !licenses.has(pin.license)) fail(`Edition ${id} ${lang} lacks an acceptable pinned license`);
  }
  if (!edition.cite?.en || !edition.cite?.he) fail(`Edition ${id} lacks a citation`);
}

const itemPattern = /^(\d+)(?:-(\d+))?(t|h|r|rh|re)$/;
for (const [id, source] of Object.entries(corpus.textSources)) {
  if (source.id !== id || !source.parts?.length) fail(`Text source ${id} has no parts`);
  if (!source.fallbackUrl?.startsWith("https://www.sefaria.org/")) fail(`Text source ${id} lacks a Sefaria fallback link`);
  source.parts.forEach((part, index) => {
    if (source.parts.length > 1 && (!part.heading?.en || !part.heading?.he)) fail(`Text source ${id} part ${index + 1} has no heading`);
    if (!part.sections?.length) fail(`Text source ${id} part ${index + 1} has no sections`);
    for (const section of part.sections) {
      if (!corpus.editions[section.edition]) fail(`Text source ${id} uses unknown edition ${section.edition}`);
      if (!section.url?.startsWith("https://www.sefaria.org/api/v3/texts/")) fail(`Text source ${id} has a non-Sefaria URL`);
      const max = Math.max(section.count.he, section.count.en);
      let text = 0;
      for (const item of section.items.split(",")) {
        const match = item.match(itemPattern);
        if (!match) fail(`Text source ${id} has a malformed item ${item}`);
        const from = Number(match[1]), to = Number(match[2] || match[1]);
        if (from < 1 || to < from || to > max) fail(`Text source ${id} item ${item} is outside ${max} segments`);
        if (match[3] === "t" || match[3] === "h") text++;
      }
      if (!text) fail(`Text source ${id} section ${section.ref} has no prayer text`);
    }
  });
}

const services = new Set();
let withText = 0, prayerNodes = 0;
for (const service of corpus.services) {
  if (!allowed[service.day]?.has(service.id)) fail(`Invalid service ${service.day}/${service.id}`);
  const key = `${service.day}/${service.id}`;
  if (services.has(key)) fail(`Duplicate service ${key}`);
  services.add(key);
  const nodes = new Set();
  for (const node of service.nodes) {
    if (nodes.has(node.id)) fail(`Duplicate node ${key}/${node.id}`);
    nodes.add(node.id);
    if (node.routable && node.kind === "transition") fail(`Transition route ${key}/${node.id}`);
    if (!node.title?.en || !node.title?.he) fail(`Missing translation ${key}/${node.id}`);
    if (node.weight && (node.weight.ashkenaz <= 0 || node.weight.sefard <= 0)) fail(`Bad weight ${key}/${node.id}`);
    if (node.kind === "transition") continue;
    prayerNodes++;
    const nodeKey = `${key}/${node.id}`;
    if (!node.text) {
      if (!corpus.unfilledText?.[nodeKey]) fail(`Prayer node ${nodeKey} has neither Sefaria text nor a recorded reason`);
      continue;
    }
    withText++;
    for (const nusach of ["ashkenaz", "sefard"]) {
      const id = node.text[nusach];
      if (!id) continue;
      if (corpus.textSources[id]?.nusach !== nusach) fail(`Node ${nodeKey} points ${nusach} at ${id}`);
    }
    if (!node.text.ashkenaz) fail(`Node ${nodeKey} lacks the Ashkenaz text every card falls back to`);
    for (const nusach of ["ashkenaz", "sefard"]) {
      const sourceId = node.text[nusach];
      if (!sourceId) continue;
      const source = corpus.textSources[sourceId];
      if (node.text.links?.[nusach] !== source.fallbackUrl) fail(`Node ${nodeKey} has a stale ${nusach} Sefaria link`);
      // The breakdown shown when the card opens must link every entry to a part and cover every part.
      const toc = node.text.toc?.[nusach] || {};
      const entries = tocEntries(node, nusach).map(e => e.key);
      for (const key of entries) if (!(key in toc)) fail(`Node ${nodeKey} (${nusach}): breakdown entry "${key}" has no linked text`);
      for (const [key, index] of Object.entries(toc)) {
        if (!entries.includes(key)) fail(`Node ${nodeKey} (${nusach}): link "${key}" is not a breakdown entry`);
        if (!source.parts[index]) fail(`Node ${nodeKey} (${nusach}): link "${key}" points past the last part`);
      }
      // Several sections open one at a time, each at /…/<prayer>/<slug>; a single section opens whole.
      const slugs = node.text.slugs?.[nusach];
      if (source.parts.length > 1 && (slugs?.length !== source.parts.length || new Set(slugs).size !== slugs.length || slugs.some(s => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)))) fail(`Node ${nodeKey} (${nusach}): sections lack distinct slugs`);
      if (source.parts.length === 1 && slugs) fail(`Node ${nodeKey} (${nusach}): a single-section prayer has section slugs`);
      if (source.parts.length > 1) source.parts.forEach((_, index) => {
        if (!Object.values(toc).includes(index)) fail(`Node ${nodeKey} (${nusach}): part ${index + 1} is not linked from the breakdown`);
      });
      else if (entries.length && !Object.values(toc).every(index => index === 0)) fail(`Node ${nodeKey} (${nusach}): bad single-part links`);
    }
  }
}
if (services.size !== 7) fail(`Expected 7 services, got ${services.size}`);
console.log(`Corpus validation passed: ${withText} of ${prayerNodes} prayer cards have pinned Sefaria text`);

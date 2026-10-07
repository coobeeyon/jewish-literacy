import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { apiUrl } from "./sefaria-url.mjs";
import { linkParts, tocEntries } from "./toc.mjs";

const here = dirname(fileURLToPath(import.meta.url));
// content/roadmap.html is this app's canonical content source: edit the service maps there.
// (The older shared jewish-literacy/roadmap.html is no longer read by the app.)
const source = resolve(here, "../content/roadmap.html");
const target = resolve(here, "../src/corpus.generated.json");
const textTarget = resolve(here, "../src/text-sources.generated.json");
// Pinned by scripts/pin-sefaria.mjs from scripts/sefaria-spec.mjs (network step, run separately).
const pins = JSON.parse(readFileSync(resolve(here, "sefaria-pins.json"), "utf8"));
const usedTextKeys = new Set();
const $ = cheerio.load(readFileSync(source, "utf8"));

const localized = (root, selector = "") => {
  const scope = selector ? $(root).find(selector) : $(root);
  return {
    en: scope.find('[data-lang="en"]').first().text().trim(),
    he: scope.find('[data-lang="he"]').first().text().trim(),
  };
};

const ast = (node) => {
  if (node.type === "text") {
    const value = node.data;
    return value.trim() ? { type: "text", value } : null;
  }
  if (node.type !== "tag") return null;
  if ($(node).is("section.reader")) return null;
  const allowed = new Set(["ul", "li", "div", "span", "small", "details", "summary", "p", "strong", "em"]);
  if (!allowed.has(node.tagName)) return null;
  const attrs = {};
  for (const key of ["class", "data-lang", "lang", "dir"]) {
    if (node.attribs?.[key]) attrs[key] = node.attribs[key];
  }
  return {
    type: "element",
    tag: node.tagName,
    attrs,
    children: (node.children || []).map(ast).filter(Boolean),
  };
};

function textFor(key, node) {
  if (node.kind === "transition") return undefined;
  const pinned = pins.cards[key];
  if (!pinned) {
    if (pins.unfilled[key]) return undefined;
    throw new Error(`No Sefaria text or unfilled reason for ${key}`);
  }
  usedTextKeys.add(key);
  const text = { ...pinned, links: {}, toc: {}, slugs: {} };
  for (const nusach of ["ashkenaz", "sefard"]) {
    if (!pinned[nusach]) continue;
    const source = pins.sources[pinned[nusach]];
    // Sefaria page links live with the card so the error fallback works before the plans load.
    text.links[nusach] = source.fallbackUrl;
    const entries = tocEntries(node, nusach);
    text.toc[nusach] = linkParts(`${key} (${nusach})`, entries, source.parts);
    // Parts without their own heading take the label of the breakdown entry that links to them.
    if (source.parts.length > 1) for (const part of source.parts) {
      if (part.heading) continue;
      const entry = entries.find(e => e.key === part.toc[0]);
      if (!entry?.label) throw new Error(`${key} (${nusach}): part linked from "${part.toc[0]}" needs a heading`);
      part.heading = entry.label;
    }
    // A prayer of several sections opens section by section. Each section's route is the slug of the
    // breakdown entry that opens it (what the reader taps), or of its heading for Amidah blessings.
    if (source.parts.length > 1) {
      const slugs = source.parts.map(part => slug(entries.find(e => e.key === part.toc[0])?.label?.en || part.heading.en));
      if (slugs.some(s => !s) || new Set(slugs).size !== slugs.length) throw new Error(`${key} (${nusach}): section headings must give distinct slugs: ${slugs.join(", ")}`);
      text.slugs[nusach] = slugs;
    }
  }
  return text;
}

const slug = (value) => value.toLowerCase()
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const services = [];
$("ol.service-map").each((_, map) => {
  const match = ($(map).attr("class") || "").match(/map-(weekday|shabbat)-(shacharit|mincha|maariv|musaf)/);
  if (!match) return;
  const [, day, id] = match;
  const nodes = [];
  const used = new Set();
  $(map).children("li").each((index, item) => {
    const className = $(item).attr("class") || "";
    const isCard = className.split(/\s+/).includes("card");
    const isBoundary = className.split(/\s+/).includes("boundary");
    const kind = isCard ? "card" : isBoundary ? "boundary" : "transition";
    const title = isCard ? localized(item, ":scope > button h2") : localized(item);
    let nodeId = slug(title.en || `transition-${index + 1}`);
    if (day === "weekday" && id === "mincha" && title.en === "Ashrei") nodeId = "ashrei";
    let candidate = nodeId;
    let suffix = 2;
    while (used.has(candidate)) candidate = `${nodeId}-${suffix++}`;
    used.add(candidate);
    const classes = className.split(/\s+/).filter(Boolean);
    const role = ["opening", "praise", "shema", "amidah", "tachanun", "torah", "closing"].find(x => classes.includes(x));
    const section = $(item).attr("data-section") || undefined;
    const variant = $(item).attr("data-variant") || undefined;
    const details = isCard
      ? $(item).children(".details").first().contents().toArray().map(ast).filter(Boolean)
      : [];
    const raw = $(item).clone();
    raw.find('small [data-lang="en"]').each((_, x) => $(x).text($(x).text().replace(/^communal prayer only(?: · )?/i, "")));
    raw.find('small [data-lang="he"]').each((_, x) => $(x).text($(x).text().replace(/^רק בתפילת ציבור(?: · )?/, "")));
    const communal = classes.includes("communal") || classes.includes("barkhu") || classes.includes("torah") || section === "repetition" || (isBoundary && /Kaddish|קדיש/.test($(item).text()));
    nodes.push({
      id: candidate,
      kind,
      title,
      role,
      classes,
      communal,
      routable: kind !== "transition",
      weight: isCard ? { ashkenaz: Number($(item).attr("data-a")), sefard: Number($(item).attr("data-s")) } : undefined,
      section,
      variant,
      summary: isCard ? $(item).children("button").find(".copy").contents().toArray().filter(x => !(x.type === "tag" && x.tagName === "h2")).map(ast).filter(Boolean) : [],
      details: section ? [] : details,
      detailKind: section ? (classes.includes("shabbat-amidah-section") ? "shabbat-amidah" : "weekday-amidah") : undefined,
      boundary: !isCard ? raw.contents().toArray().map(ast).filter(Boolean) : [],
    });
    const node = nodes[nodes.length - 1];
    node.text = textFor(`${day}/${id}/${candidate}`, node);
  });
  const titles = {
    "weekday-shacharit": { en: "Weekday Shacharit", he: "תפילת שחרית של חול" },
    "weekday-mincha": { en: "Weekday Mincha", he: "תפילת מנחה של חול" },
    "weekday-maariv": { en: "Weekday Maariv / Arvit", he: "תפילת ערבית של חול" },
    "shabbat-maariv": { en: "Shabbat Maariv", he: "ערבית של שבת" },
    "shabbat-shacharit": { en: "Shabbat Shacharit", he: "שחרית של שבת" },
    "shabbat-musaf": { en: "Shabbat Musaf", he: "מוסף של שבת" },
    "shabbat-mincha": { en: "Shabbat Mincha", he: "מנחה של שבת" },
  };
  services.push({ day, id, title: titles[`${day}-${id}`], nodes });
});

const unknownText = Object.keys(pins.cards).filter(key => !usedTextKeys.has(key));
if (unknownText.length) throw new Error(`Sefaria pins for cards that do not exist: ${unknownText.join(", ")}`);

// Compact "from-to kind" items keep the bundle small; the reader expands them.
const compactItems = items => items.map(([from, to, kind]) => `${from}${to === from ? "" : `-${to}`}${kind}`).join(",");
const corpus = { services, editions: pins.editions, unfilledText: pins.unfilled };
// Loaded lazily when a card is first opened, so the map itself stays light.
const textSources = Object.fromEntries(Object.entries(pins.sources).map(([id, source]) => [id, {
  ...source,
  parts: source.parts.map(({ toc, ...part }) => ({
    ...part,
    sections: part.sections.map(section => ({ ...section, url: apiUrl(section.ref, { he: pins.editions[section.edition].he.title, en: pins.editions[section.edition].en.title }), items: compactItems(section.items) })),
  })),
}]));

if (services.length !== 7) throw new Error(`Expected 7 services, found ${services.length}`);
writeFileSync(target, `${JSON.stringify(corpus, null, 2)}\n`);
writeFileSync(textTarget, `${JSON.stringify(textSources)}\n`);
console.log(`Extracted ${services.length} services and ${services.reduce((n, s) => n + s.nodes.length, 0)} nodes`);

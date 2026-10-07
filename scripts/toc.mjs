// Which breakdown entries a card shows when it opens, per nusach. Shared by extract-corpus.mjs
// (to link entries to text parts) and validate-corpus.mjs (to prove nothing is orphaned).
// Keep in step with how App.tsx renders details: chips are the <li> items of the details list
// (rite-specific ones only for their nusach); Amidah cards list their blessings instead.
const text = node => node.type === "text" ? node.value : node.children.map(text).join("");

export function chipEntries(details, nusach) {
  const out = [];
  const walk = node => {
    if (node.type !== "element") return;
    const classes = (node.attrs.class || "").split(/\s+/);
    if (classes.includes("rite") && !classes.includes(nusach[0])) return;
    if (node.tag === "li") {
      const en = node.children.find(child => child.type === "element" && child.attrs["data-lang"] === "en");
      const he = node.children.find(child => child.type === "element" && child.attrs["data-lang"] === "he");
      out.push({ key: text(en || node).trim(), label: { en: text(en || node).trim(), he: he ? text(he).trim() : text(en || node).trim() } });
      return;
    }
    node.children.forEach(walk);
  };
  details.forEach(walk);
  return out;
}

export function amidahEntries(node) {
  const repetition = node.section === "repetition";
  const count = node.detailKind === "weekday-amidah" ? 19 : 7;
  const keys = Array.from({ length: count }, (_, i) => `amidah:${i + 1}`);
  if (!repetition) keys.push("amidah:conclusion");
  if (repetition && node.detailKind === "weekday-amidah") keys.push("amidah:kohanim");
  return keys.map(key => ({ key }));
}

export const tocEntries = (node, nusach) => node.detailKind ? amidahEntries(node) : chipEntries(node.details, nusach);

/** Map entry keys to part indexes; throws unless every entry has a part and every part an entry. */
export function linkParts(label, entries, parts) {
  const keys = new Set(entries.map(e => e.key));
  const map = {};
  parts.forEach((part, index) => {
    for (const key of part.toc) {
      if (!keys.has(key)) throw new Error(`${label}: part ${index + 1} is linked from "${key}", which the card does not show`);
      if (key in map) throw new Error(`${label}: "${key}" links to two parts`);
      map[key] = index;
    }
  });
  const missing = entries.filter(e => !(e.key in map)).map(e => e.key);
  if (missing.length) throw new Error(`${label}: breakdown entries without text: ${missing.join(", ")}`);
  if (parts.length > 1) parts.forEach((part, index) => { if (!part.toc.length) throw new Error(`${label}: part ${index + 1} has no breakdown entry`); });
  if (parts.length === 1 && !entries.length && parts[0].toc.length) throw new Error(`${label}: single part names entries the card lacks`);
  return map;
}

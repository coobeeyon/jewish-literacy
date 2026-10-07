/**
 * An edition's own formatting, kept: Sefaria's markup for a segment becomes a small tree of safe
 * inline nodes (line breaks, bold, italics, small, big, superscript). Every attribute and every other
 * tag is dropped, keeping its text; footnote markers and bodies are dropped whole. The edition glitch
 * fixes run on text nodes only, never across tags. Nothing here produces HTML: the reader renders the
 * tree as React elements.
 */

export type Lang = "en" | "he";
export type InlineTag = "b" | "i" | "small" | "big" | "sup";
export type Inline = string | { br: true } | { tag: InlineTag; children: Inline[] };

/** Tags kept, by Sefaria's name; everything else is unwrapped to its text. */
const kept: Record<string, InlineTag> = { b: "b", strong: "b", i: "i", em: "i", small: "small", big: "big", sup: "sup" };
/** Footnotes (and anything that isn't text at all), dropped with everything inside them. */
const dropped = (tag: string, attrs: string) => ["script", "style", "template"].includes(tag) || (tag === "sup" || tag === "i") && /class\s*=\s*["'][^"']*\bfootnote(-marker)?\b/.test(attrs);
/** Tags that end a block of text: unwrapped with a space so words don't run together. */
const blockish = new Set(["p", "div", "li", "td", "th", "tr", "h1", "h2", "h3", "h4", "h5", "h6"]);

const entities: Record<string, string> = { nbsp: " ", amp: "&", quot: "\"", apos: "'", lt: "<", gt: ">", thinsp: " " };
const decode = (text: string) => text
  .replace(/&(nbsp|amp|quot|apos|lt|gt|thinsp);/g, (_, name: string) => entities[name])
  .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));

/** Parse a segment's markup into inline nodes (text not yet cleaned). */
export function parseMarkup(raw: string): Inline[] {
  const root: Inline[] = [];
  const stack: Array<{ name: string; children: Inline[] }> = [{ name: "", children: root }];
  let skip: { name: string; depth: number } | undefined;
  const tagPattern = /<(\/?)([a-zA-Z][\w-]*)([^<>]*?)(\/?)>/g;
  let last = 0;
  const text = (value: string) => { if (!skip && value) stack[stack.length - 1].children.push(decode(value)); };
  for (const match of raw.matchAll(tagPattern)) {
    text(raw.slice(last, match.index));
    last = match.index! + match[0].length;
    const [, closing, rawName, attrs, selfClosing] = match;
    const name = rawName.toLowerCase();
    if (skip) {
      if (name === skip.name && !selfClosing) skip.depth += closing ? -1 : 1;
      if (skip.depth === 0) skip = undefined;
      continue;
    }
    if (name === "br") { stack[stack.length - 1].children.push({ br: true }); continue; }
    if (selfClosing) continue;
    if (!closing) {
      if (dropped(name, attrs)) { skip = { name, depth: 1 }; continue; }
      if (blockish.has(name)) text(" ");
      stack.push({ name, children: [] });
      continue;
    }
    // A closing tag: close back to its opener, if it is open; a stray one is ignored.
    const at = stack.map(open => open.name).lastIndexOf(name);
    if (at < 1) continue;
    while (stack.length > at) {
      const open = stack.pop()!;
      const parent = stack[stack.length - 1].children;
      const tag = kept[open.name];
      // A bare superscript number or mark is a footnote marker too.
      if (tag === "sup" && /^\s*[\d*†‡]+\s*$/.test(plainOf(open.children))) continue;
      if (tag) parent.push({ tag, children: open.children });
      else parent.push(...open.children);
      if (blockish.has(open.name)) text(" ");
    }
  }
  text(raw.slice(last));
  // Unclosed tags keep their text.
  while (stack.length > 1) {
    const open = stack.pop()!;
    const tag = kept[open.name];
    const parent = stack[stack.length - 1].children;
    if (tag) parent.push({ tag, children: open.children });
    else parent.push(...open.children);
  }
  return root;
}

const isBreak = (node: Inline) => typeof node !== "string" && "br" in node;
const mapText = (nodes: Inline[], fn: (text: string) => string): Inline[] => nodes.map(node => typeof node === "string" ? fn(node) : "br" in node ? node : { ...node, children: mapText(node.children, fn) });
export const plainOf = (nodes: Inline[]): string => nodes.map(node => typeof node === "string" ? node : "br" in node ? "\n" : plainOf(node.children)).join("");

const hebrewRun = /[֐-׿][֐-׿\s״׳"'־]*(?=\s|$)/g;

/** The edition glitch fixes, one text node at a time. */
function fixText(text: string, lang: Lang, rubric: boolean, dropHebrew: boolean): string {
  text = text.replace(/\{[פס]\}/g, "").replace(/[◂▸▾▴°❖]/g, "");
  if (lang === "he") {
    // Koren's Hebrew on Sefaria carries a few English stage words.
    text = text.replace(/\bQuietly:\s*/g, "בלחש: ").replace(/\s+then\s+/g, " ואחריו ");
  } else {
    text = text
      .replace(/[<>]/g, "") // stray markup characters in Koren's English
      .replace(/([a-z\]])\d{1,3}(?=[\s,.;:!?)]|$)/g, "$1") // stray footnote numbers ("Blessed13")
      .replace(/\b(Leader:)(?:\s*Leader:)+/g, "$1"); // "Leader:Leader:" in Koren's Kedushah
    // Koren prints the Hebrew opening words inside its translation; the Hebrew is already shown above.
    if (dropHebrew) text = text.replace(hebrewRun, " ");
    // Metsudah's English transliterates the Name in old Ashkenazi pronunciation; Mike prefers "LORD", as Koren prints it.
    text = text.replace(/\bAdonoy\b/g, "LORD");
  }
  if (rubric) text = text // drop printed-page cross references, which mean nothing here
    .replace(/\s*\(?\s*see laws? [\d–-]+\s*\)?\.?/gi, "")
    .replace(/,?\s*\(?\s*(?:(?:found|see|turn to|is)\s+)?(?:on\s+)?(?:(?:the\s+)?(?:next|previous|following)\s+)?(?:pp?\.|pages?)(?:\s*[\d–-]+)?\s*\)?/gi, "")
    .replace(/\s*\(\s*\)/g, "").replace(/\s+([.,;:])/g, "$1");
  return text.replace(/\s+/g, " ");
}

/**
 * Collapse whitespace across nodes as the old plain-text cleaning did: no space at the start or end
 * of a line, none doubled across tags; drop the copies of "Leader:" Koren's Kedushah repeats in
 * separate tags; drop elements left empty.
 */
function tidy(nodes: Inline[]): Inline[] {
  let lineStart = true, spaceBefore = false, lastText = "";
  const walk = (list: Inline[]): Inline[] => {
    const out: Inline[] = [];
    for (const node of list) {
      if (typeof node === "string") {
        let text = node;
        if (lastText.trimEnd().endsWith("Leader:") && text.trim() === "Leader:") continue;
        if (lineStart || spaceBefore) text = text.replace(/^ /, "");
        if (!text) continue;
        out.push(text);
        lineStart = false;
        spaceBefore = text.endsWith(" ");
        if (text.trim()) lastText = text;
      } else if ("br" in node) {
        // A line ends: no trailing space before it.
        trimEnd(out);
        out.push(node);
        lineStart = true; spaceBefore = false; lastText = "";
      } else {
        const children = walk(node.children);
        if (plainOf(children).trim() || children.some(isBreak)) out.push({ ...node, children });
      }
    }
    return out;
  };
  const out = walk(nodes);
  trimEnd(out);
  // No line breaks at the very start or end of a paragraph.
  while (out.length && isBreak(out[0])) out.shift();
  while (out.length && isBreak(out[out.length - 1])) out.pop();
  return out;
}

function trimEnd(nodes: Inline[]) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (typeof node === "string") {
      const trimmed = node.replace(/ $/, "");
      if (trimmed) { nodes[i] = trimmed; return; }
      nodes.splice(i, 1);
      continue;
    }
    if ("br" in node) return;
    trimEnd(node.children);
    if (plainOf(node.children).trim()) return;
    nodes.splice(i, 1);
  }
}

/** One segment of an edition, its own formatting kept and its glitches fixed. */
export function formatSegment(raw: string, lang: Lang, rubric: boolean): Inline[] {
  const parsed = parseMarkup(raw);
  // Hebrew words inside Koren's English translation go, unless nothing English would be left (a rubric keeps them).
  const dropHebrew = lang === "en" && !rubric && /[A-Za-z]/.test(plainOf(parsed).replace(hebrewRun, " "));
  return tidy(mapText(parsed, text => fixText(text, lang, rubric, dropHebrew)));
}

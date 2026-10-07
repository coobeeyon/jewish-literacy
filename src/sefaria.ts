// Pure Sefaria logic: reading-plan rendering (src/format.ts keeps each edition's formatting and
// fixes its glitches), and licenses. Sefaria responses are checked against the
// pins when the texts are snapshot (scripts/sefaria-texts.mjs); no DOM and no fetching here.
import { formatSegment, plainOf, type Inline, type Lang } from "./format";
import type { Edition, Localized, Nusach, TextSection } from "./types";

export type { Lang };
export type Texts = Record<Lang, string[]>;
export type Paragraph = { nodes: Inline[]; rubric: boolean };
export type RenderedPart = { heading?: Localized; en: Paragraph[]; he: Paragraph[] };

export function renderSection(section: TextSection, texts: Texts, out: RenderedPart) {
  for (const item of section.items.split(",")) {
    const match = item.match(/^(\d+)(?:-(\d+))?(t|h|r|rh|re)$/);
    if (!match) throw new Error("Bad reading plan");
    const from = Number(match[1]), to = Number(match[2] || match[1]), kind = match[3];
    const rubric = kind.startsWith("r");
    const langs: Lang[] = kind === "t" || kind === "r" ? ["en", "he"] : kind === "h" || kind === "rh" ? ["he"] : ["en"];
    for (const lang of langs) {
      const pieces = texts[lang].slice(from - 1, to).map(segment => formatSegment(segment, lang, rubric));
      if (pieces.length !== to - from + 1 || pieces.some(piece => !plainOf(piece).trim())) throw new Error("Pinned Sefaria text is missing");
      out[lang].push({ nodes: pieces.flatMap((piece, i) => i ? [" ", ...piece] : piece), rubric });
    }
  }
}

/** The id of a part's anchor inside an open card. */
export const partAnchor = (nodeId: string, index: number) => `${nodeId}-part-${index + 1}`;

const licenseLabel: Record<string, Localized> = {
  "CC-BY": { en: "CC BY", he: "CC BY" },
  "CC-BY-SA": { en: "CC BY-SA", he: "CC BY-SA" },
  "CC-BY-NC": { en: "CC BY-NC", he: "CC BY-NC" },
  "CC0": { en: "CC0", he: "CC0" },
  "Public Domain": { en: "public domain", he: "נחלת הכלל" },
};
export const licenseOf = (edition: Edition): Localized => {
  const he = licenseLabel[edition.he.license], en = licenseLabel[edition.en.license];
  if (edition.he.license === edition.en.license) return he;
  return { en: `Hebrew ${he.en}, English ${en.en}`, he: `עברית ${he.he}, אנגלית ${en.he}` };
};

/** Which nusach's text a prayer shows: Sefard when Sefaria has it, otherwise Ashkenaz. */
export const textNusach = <T>(sources: Readonly<{ ashkenaz: T; sefard?: T }>, nusach: Nusach): Nusach => sources[nusach] ? nusach : "ashkenaz";

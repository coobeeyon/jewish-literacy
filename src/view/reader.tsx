// Build time: prayer text as HTML, in each edition's own formatting (src/format.ts), with its
// Sefaria credit. Used for pages that open on text and for the text files the browser fetches
// (src/texts.ts); src/client/reader.ts only places what this renders.
import type { VNode } from "preact";
import type { Inline } from "../format";
import { licenseOf, partAnchor, type Paragraph, type RenderedPart } from "../sefaria";
import { corpus } from "../routes";
import type { Localized, TextSource } from "../types";
import { LocalizedText } from "./common";

/** An edition's own formatting, as elements: line breaks, bold, italics, small, big, superscript. */
const Formatted = (nodes: Inline[]): Array<VNode | string> => nodes.map(node => typeof node === "string" ? node : "br" in node ? <br /> : (() => { const Tag = node.tag; return <Tag>{Formatted(node.children)}</Tag>; })());

const Paragraphs = (paragraphs: Paragraph[]) => paragraphs.map(p => <p className={p.rubric ? "rubric" : undefined}>{Formatted(p.nodes)}</p>);

/** One section's text: Hebrew, then English. */
export function PartBody(part: RenderedPart): VNode {
  return <>
    <div className="reader-text reader-he" data-lang="he" lang="he" dir="rtl">{Paragraphs(part.he)}</div>
    {part.en.length > 0 && <div className="reader-text reader-en" data-lang="en" lang="en" dir="ltr">{Paragraphs(part.en)}</div>}
  </>;
}

/** One section of a prayer, under its heading when the prayer has several (or the entry gives its own). */
export function PartText(nodeId: string, index: number, part: RenderedPart, showHeading: boolean, heading?: Localized): VNode {
  const title = heading || part.heading;
  return <div className="reader-section" id={partAnchor(nodeId, index)} tabIndex={-1}>
    {showHeading && title && <h3 className="reader-heading">{LocalizedText(title)}</h3>}
    {PartBody(part)}
  </div>;
}

/** The Sefaria credit: editions, their sources and licenses as Sefaria reports them, and the notes on the Name and on nusach. */
export function Credit(source: TextSource, fellBack: boolean): VNode {
  const used = [...new Set(source.parts.flatMap(p => p.sections.map(s => s.edition)))].map(id => corpus.editions[id]);
  const renamesName = used.some(edition => edition.id.startsWith("metsudah"));
  return <p className="reader-credit">
    <span data-lang="en">Text from <a href={source.fallbackUrl}>Sefaria</a>. {used.map((edition, i) => <span>{i > 0 && "; "}<cite>{edition.cite.en}</cite> (<a href={edition.he.source}>{edition.sourceLabel.en}</a>), license reported by Sefaria: {licenseOf(edition).en}</span>)}.{renamesName && " The English shows the Name as “LORD”."}{fellBack && " Nusach Sefard text for this prayer isn’t available on Sefaria, so the Ashkenaz text is shown."}</span>
    <span className="he" data-lang="he">הטקסט מתוך <a href={source.fallbackUrl}>ספריא</a>. {used.map((edition, i) => <span>{i > 0 && "; "}<cite>{edition.cite.he}</cite> (<a href={edition.he.source}>{edition.sourceLabel.he}</a>), הרישיון המדווח בספריא: {licenseOf(edition).he}</span>)}.{renamesName && " באנגלית השם מוצג כ־LORD."}{fellBack && " נוסח ספרד של תפילה זו אינו זמין בספריא, ולכן מוצג נוסח אשכנז."}</span>
  </p>;
}

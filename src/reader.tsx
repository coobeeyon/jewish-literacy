import { createElement, useEffect, useState, type ReactNode } from "react";
import corpusJson from "./corpus.generated.json";
import { formatSegment, plainOf, type Inline, type Lang } from "./format";
import { usePreferences } from "./preferences";
import type { CalendarKind, ContentNode, Corpus, Edition, Localized, TextPart, TextSection, TextSource, TextSources } from "./types";

const corpus = corpusJson as Corpus;
// The reading plans are a separate chunk, fetched the first time any card is opened.
let sourcesPromise: Promise<TextSources> | undefined;
const loadSources = () => {
  sourcesPromise ??= import("./text-sources.generated.json").then(module => module.default as TextSources);
  sourcesPromise.catch(() => { sourcesPromise = undefined; });
  return sourcesPromise;
};
type Texts = Record<Lang, string[]>;
type Paragraph = { nodes: Inline[]; rubric: boolean };
type RenderedPart = { heading?: Localized; en: Paragraph[]; he: Paragraph[] };

function Bi({ value }: { value: Localized }) {
  return <><span data-lang="en">{value.en}</span><span className="he" data-lang="he">{value.he}</span></>;
}

// One request per Sefaria ref+edition, shared by every card that shows it. A failed request
// is forgotten so "Try again" really refetches.
const segmentCache = new Map<string, Promise<Texts>>();

function loadSection(section: TextSection, edition: Edition): Promise<Texts> {
  const cached = segmentCache.get(section.url);
  if (cached) return cached;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const request = fetch(section.url, { signal: controller.signal, headers: { Accept: "application/json" } })
    .then(response => {
      if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) throw new Error("Sefaria request failed");
      return response.json();
    })
    .then(data => validateSection(data, section, edition))
    .finally(() => clearTimeout(timer));
  request.catch(() => segmentCache.delete(section.url));
  segmentCache.set(section.url, request);
  return request;
}

/** Accept a response only if it is exactly the pinned ref, editions, licenses and shape. */
function validateSection(data: unknown, section: TextSection, edition: Edition): Texts {
  const result = data as { ref?: unknown; warnings?: unknown; versions?: unknown };
  if (result?.ref !== section.ref || !Array.isArray(result.warnings) || result.warnings.length || !Array.isArray(result.versions) || result.versions.length !== 2) throw new Error("Unexpected Sefaria response");
  const out: Partial<Texts> = {};
  for (const version of result.versions as Array<Record<string, unknown>>) {
    const language = version.language as Lang;
    const expected = edition[language];
    if (!expected || out[language]) throw new Error("Unexpected Sefaria edition");
    if (version.versionTitle !== expected.title || version.license !== expected.license || version.versionSource !== expected.source || version.actualLanguage !== expected.language || version.direction !== expected.direction) throw new Error("Sefaria metadata changed");
    const segments = typeof version.text === "string" ? [version.text] : version.text;
    if (!Array.isArray(segments) || segments.length !== section.count[language] || segments.some(s => typeof s !== "string")) throw new Error("Sefaria text shape changed");
    out[language] = segments as string[];
  }
  if (!out.en || !out.he) throw new Error("Missing language");
  return out as Texts;
}

function renderSection(section: TextSection, texts: Texts, out: RenderedPart) {
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

function loadPart(part: TextPart): Promise<RenderedPart> {
  return Promise.all(part.sections.map(section => loadSection(section, corpus.editions[section.edition]))).then(all => {
    const out: RenderedPart = { heading: part.heading, en: [], he: [] };
    part.sections.forEach((section, i) => renderSection(section, all[i], out));
    if (!out.he.some(p => !p.rubric)) throw new Error("No prayer text");
    return out;
  });
}

/** An edition's own formatting, as React elements: line breaks, bold, italics, small, big, superscript. */
function Formatted({ nodes }: { nodes: Inline[] }): ReactNode {
  return nodes.map((node, i) => typeof node === "string" ? node : "br" in node ? <br key={i} /> : createElement(node.tag, { key: i }, <Formatted nodes={node.children} />));
}

/** The id of a part's anchor inside an open card; the card's breakdown links point here. */
export const partAnchor = (node: ContentNode, index: number) => `${node.id}-part-${index + 1}`;

const licenseLabel: Record<string, Localized> = {
  "CC-BY": { en: "CC BY", he: "CC BY" },
  "CC-BY-SA": { en: "CC BY-SA", he: "CC BY-SA" },
  "CC-BY-NC": { en: "CC BY-NC", he: "CC BY-NC" },
  "CC0": { en: "CC0", he: "CC0" },
  "Public Domain": { en: "public domain", he: "נחלת הכלל" },
};
const licenseOf = (edition: Edition): Localized => {
  const he = licenseLabel[edition.he.license], en = licenseLabel[edition.en.license];
  if (edition.he.license === edition.en.license) return he;
  return { en: `Hebrew ${he.en}, English ${en.en}`, he: `עברית ${he.he}, אנגלית ${en.he}` };
};

function Credit({ source, fellBack }: { source: TextSource; fellBack: boolean }) {
  const editions = [...new Set(source.parts.flatMap(p => p.sections.map(s => s.edition)))].map(id => corpus.editions[id]);
  const renamesName = editions.some(edition => edition.id.startsWith("metsudah"));
  return <p className="reader-credit">
    <span data-lang="en">Text from <a href={source.fallbackUrl}>Sefaria</a>. {editions.map((edition, i) => <span key={edition.id}>{i > 0 && "; "}<cite>{edition.cite.en}</cite> (<a href={edition.he.source}>{edition.sourceLabel.en}</a>), license reported by Sefaria: {licenseOf(edition).en}</span>)}.{renamesName && " The English shows the Name as “LORD”."}{fellBack && " Nusach Sefard text for this prayer isn’t available on Sefaria, so the Ashkenaz text is shown."}</span>
    <span className="he" data-lang="he">הטקסט מתוך <a href={source.fallbackUrl}>ספריא</a>. {editions.map((edition, i) => <span key={edition.id}>{i > 0 && "; "}<cite>{edition.cite.he}</cite> (<a href={edition.he.source}>{edition.sourceLabel.he}</a>), הרישיון המדווח בספריא: {licenseOf(edition).he}</span>)}.{renamesName && " באנגלית השם מוצג כ־LORD."}{fellBack && " נוסח ספרד של תפילה זו אינו זמין בספריא, ולכן מוצג נוסח אשכנז."}</span>
  </p>;
}

/** One section of a prayer: heading (when the prayer has several), then Hebrew, then English. */
function PartText({ node, index, part, heading }: { node: ContentNode; index: number; part: RenderedPart; heading: boolean }) {
  return <div className="reader-section" id={partAnchor(node, index)} tabIndex={-1}>
    {heading && part.heading && <h3 className="reader-heading"><Bi value={part.heading} /></h3>}
    <div className="reader-text reader-he" data-lang="he" lang="he" dir="rtl">{part.he.map((p, j) => <p key={j} className={p.rubric ? "rubric" : undefined}><Formatted nodes={p.nodes} /></p>)}</div>
    {part.en.length > 0 && <div className="reader-text reader-en" data-lang="en" lang="en" dir="ltr">{part.en.map((p, j) => <p key={j} className={p.rubric ? "rubric" : undefined}><Formatted nodes={p.nodes} /></p>)}</div>}
  </div>;
}

function Status({ status, timeout }: { status: "loading" | "ready" | "error"; timeout?: boolean }) {
  if (status === "ready") return null;
  return <div className="reader-status" role="status" aria-live="polite"><Bi value={status === "loading" ? { en: "Loading prayer text…", he: "נוסח התפילה נטען…" } : timeout ? { en: "The request timed out.", he: "תם הזמן שהוקצב לבקשה." } : { en: "Prayer text unavailable.", he: "נוסח התפילה אינו זמין." }} /></div>;
}

function Failure({ node, retry }: { node: ContentNode; retry: () => void }) {
  const { nusach } = usePreferences();
  const fallbackUrl = node.text!.links[nusach] || node.text!.links.ashkenaz;
  return <div className="reader-failure"><p><Bi value={{ en: "The prayer text could not be loaded.", he: "לא ניתן לטעון את נוסח התפילה." }} /></p><button type="button" className="reader-action" onClick={retry}><Bi value={{ en: "Try again", he: "לנסות שוב" }} /></button> <a href={fallbackUrl}><Bi value={{ en: `Read ${node.title.en} on Sefaria`, he: `לקריאת ${node.title.he} בספריא` }} /></a></div>;
}

/** The nusach whose text a prayer shows: Sefard when Sefaria has it, otherwise Ashkenaz. */
export const textNusach = (node: ContentNode, nusach: "ashkenaz" | "sefard") => node.text![nusach] ? nusach : "ashkenaz";

/**
 * One section of a prayer of several, shown where its breakdown entry is. The reading plans and the
 * section's Sefaria text are fetched the first time it opens and cached; loading, failure and retry
 * show here, in the section.
 */
export function SectionText({ node, index, heading }: { node: ContentNode; index: number; heading?: Localized }) {
  const { nusach } = usePreferences();
  const sourceId = node.text![textNusach(node, nusach)]!;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; status: "loading" | "ready" | "error"; part?: RenderedPart; timeout?: boolean }>({ key: "", status: "loading" });
  const key = `${sourceId}#${index}#${attempt}`;
  useEffect(() => {
    let live = true;
    setState({ key, status: "loading" });
    loadSources().then(sources => {
      const part = sources[sourceId]?.parts[index];
      if (!part) throw new Error("Unknown text section");
      return loadPart(part).then(rendered => { if (live) setState({ key, status: "ready", part: rendered }); });
    }).catch(error => { if (live) setState({ key, status: "error", timeout: error?.name === "AbortError" }); });
    return () => { live = false; };
  }, [key, sourceId, index]);
  const current = state.key === key ? state : { status: "loading" as const, part: undefined, timeout: false };
  return <div className="reader section-reader" aria-busy={current.status === "loading" || undefined}>
    <Status status={current.status} timeout={current.timeout} />
    {current.status === "ready" && current.part && <PartText node={node} index={index} part={heading ? { ...current.part, heading } : current.part} heading />}
    {current.status === "error" && <Failure node={node} retry={() => setAttempt(n => n + 1)} />}
  </div>;
}

/** The Sefaria credit for a prayer read section by section, shown once any section is open. */
export function SourceCredit({ node }: { node: ContentNode }) {
  const { nusach } = usePreferences();
  const sourceId = node.text![textNusach(node, nusach)]!;
  const [source, setSource] = useState<TextSource>();
  useEffect(() => {
    let live = true;
    loadSources().then(sources => { if (live) setSource(sources[sourceId]); }).catch(() => undefined);
    return () => { live = false; };
  }, [sourceId]);
  return source?.id === sourceId ? <div className="reader"><Credit source={source} fellBack={nusach === "sefard" && !node.text!.sefard} /></div> : null;
}

/** A prayer shown whole: one with a single section, or with no breakdown (Kaddish, Barkhu). */
export function PrayerReader({ node }: { node: ContentNode }) {
  const { nusach } = usePreferences();
  const text = node.text!;
  const sourceId = text[nusach] || text.ashkenaz;
  const fellBack = nusach === "sefard" && !text.sefard;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; status: "loading" | "ready" | "error"; source?: TextSource; parts?: RenderedPart[]; timeout?: boolean }>({ key: "", status: "loading" });
  const key = `${sourceId}#${attempt}`;
  useEffect(() => {
    let live = true;
    setState({ key, status: "loading" });
    loadSources().then(sources => {
      const source = sources[sourceId];
      if (!source) throw new Error("Unknown text source");
      return Promise.all(source.parts.map(loadPart)).then(parts => { if (live) setState({ key, status: "ready", source, parts }); });
    }).catch(error => { if (live) setState({ key, status: "error", timeout: error?.name === "AbortError" }); });
    return () => { live = false; };
  }, [key, sourceId]);
  const current = state.key === key ? state : { status: "loading" as const, source: undefined, parts: undefined, timeout: false };
  const multi = (current.parts?.length || 0) > 1;
  return <section className="reader" aria-busy={current.status === "loading" || undefined} aria-label={`${node.title.en} prayer text`}>
    {text.calendar && <TorahCalendar kind={text.calendar} />}
    <Status status={current.status} timeout={current.timeout} />
    {current.status === "ready" && current.parts && <div className="reader-texts">{current.parts.map((part, i) => <PartText key={i} node={node} index={i} part={part} heading={multi} />)}</div>}
    {current.status === "error" && <Failure node={node} retry={() => setAttempt(n => n + 1)} />}
    {current.status === "ready" && current.source && <Credit source={current.source} fellBack={fellBack} />}
  </section>;
}

// ───────────── This week's Torah reading, from Sefaria's calendar ─────────────

type Reading = { name: Localized; ref: string; url: string; haftarah?: { ref: string; url: string } };
const calendarCache = new Map<string, Promise<Reading>>();

function calendarDate(kind: CalendarKind, now = new Date()): Date {
  if (kind !== "mincha") return now;
  // Shabbat afternoon reads from the following week's portion: ask for the Shabbat after this one.
  const date = new Date(now);
  date.setDate(date.getDate() + ((6 - date.getDay() + 7) % 7) + 1);
  return date;
}

function loadReading(kind: CalendarKind): Promise<Reading> {
  const date = calendarDate(kind);
  const url = `https://www.sefaria.org/api/calendars?diaspora=1&year=${date.getFullYear()}&month=${date.getMonth() + 1}&day=${date.getDate()}`;
  const cached = calendarCache.get(url);
  if (cached) return cached;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const request = fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } }).then(response => {
    if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) throw new Error("Calendar request failed");
    return response.json();
  }).then((data: { calendar_items?: Array<Record<string, any>> }) => {
    const items = Array.isArray(data?.calendar_items) ? data.calendar_items : [];
    const pick = (title: string) => items.find(item => item?.title?.en === title);
    const safe = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_.,:\-]+$/.test(value);
    const parasha = pick("Parashat Hashavua");
    if (!parasha || typeof parasha.displayValue?.en !== "string" || typeof parasha.displayValue?.he !== "string" || typeof parasha.ref !== "string" || !safe(parasha.url)) throw new Error("Unexpected calendar");
    const haftarah = pick("Haftarah");
    return {
      name: { en: parasha.displayValue.en, he: parasha.displayValue.he },
      ref: parasha.ref,
      url: `https://www.sefaria.org/${parasha.url}`,
      haftarah: haftarah && typeof haftarah.ref === "string" && safe(haftarah.url) ? { ref: haftarah.ref, url: `https://www.sefaria.org/${haftarah.url}` } : undefined,
    };
  }).finally(() => clearTimeout(timer));
  request.catch(() => calendarCache.delete(url));
  calendarCache.set(url, request);
  return request;
}

export function TorahCalendar({ kind }: { kind: CalendarKind }) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; reading?: Reading }>({ status: "loading" });
  useEffect(() => {
    let live = true;
    loadReading(kind).then(reading => { if (live) setState({ status: "ready", reading }); }).catch(() => { if (live) setState({ status: "error" }); });
    return () => { live = false; };
  }, [kind]);
  const reading = state.reading;
  const intro: Localized = {
    weekday: { en: "Monday and Thursday mornings read the opening of the coming Shabbat’s portion; holidays, fast days and Rosh Chodesh have their own readings. Coming Shabbat or holiday reading (Sefaria calendar, outside Israel):", he: "בבוקר ימי שני וחמישי קוראים את תחילת פרשת השבת הקרובה; לחגים, לתעניות ולראש חודש יש קריאות משלהם. הקריאה של השבת או החג הקרובים (לוח ספריא, חוץ לארץ):" },
    shabbat: { en: "This Shabbat’s reading (Sefaria calendar, outside Israel):", he: "הקריאה של שבת זו (לוח ספריא, חוץ לארץ):" },
    mincha: { en: "Shabbat afternoon reads the opening of the following week’s portion (Sefaria calendar, outside Israel):", he: "במנחה של שבת קוראים את תחילת פרשת השבוע הבא (לוח ספריא, חוץ לארץ):" },
  }[kind];
  return <div className="reader-calendar" data-calendar={kind}>
    {state.status === "loading" && <p role="status"><Bi value={{ en: "Loading this week’s Torah reading…", he: "קריאת התורה של השבוע נטענת…" }} /></p>}
    {state.status === "error" && <p><Bi value={{ en: "This week’s reading could not be loaded.", he: "לא ניתן לטעון את קריאת השבוע." }} /> <a href="https://www.sefaria.org/calendars"><Bi value={{ en: "See Sefaria’s calendar", he: "ללוח של ספריא" }} /></a></p>}
    {state.status === "ready" && reading && <>
      <p data-lang="en" lang="en">{intro.en} <a href={reading.url}>{reading.name.en}</a> ({reading.ref}){kind === "shabbat" && reading.haftarah && <>. Haftarah: <a href={reading.haftarah.url}>{reading.haftarah.ref}</a></>}.</p>
      <p className="he" data-lang="he" lang="he" dir="rtl">{intro.he} <a href={reading.url}>{reading.name.he}</a>{kind === "shabbat" && reading.haftarah && <>. הפטרה: <a href={reading.haftarah.url} dir="ltr">{reading.haftarah.ref}</a></>}.</p>
    </>}
  </div>;
}

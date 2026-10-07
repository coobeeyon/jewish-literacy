// Pure Sefaria logic: response validation, reading-plan rendering (src/format.ts keeps each
// edition's formatting and fixes its glitches), licenses and the
// Torah calendar. No DOM and no fetching here; src/client/reader.ts does both, using these.
import { formatSegment, plainOf, type Inline, type Lang } from "./format";
import type { CalendarKind, Edition, Localized, Nusach, TextSection } from "./types";

export type { Lang };
export type Texts = Record<Lang, string[]>;
export type Paragraph = { nodes: Inline[]; rubric: boolean };
export type RenderedPart = { heading?: Localized; en: Paragraph[]; he: Paragraph[] };

/** Accept a response only if it is exactly the pinned ref, editions, licenses and shape. */
export function validateSection(data: unknown, section: TextSection, edition: Edition): Texts {
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

// ───────────── This week's Torah reading, from Sefaria's calendar ─────────────

export type Reading = { name: Localized; ref: string; url: string; haftarah?: { ref: string; url: string } };

function calendarDate(kind: CalendarKind, now = new Date()): Date {
  if (kind !== "mincha") return now;
  // Shabbat afternoon reads from the following week's portion: ask for the Shabbat after this one.
  const date = new Date(now);
  date.setDate(date.getDate() + ((6 - date.getDay() + 7) % 7) + 1);
  return date;
}

export function calendarUrl(kind: CalendarKind, now = new Date()): string {
  const date = calendarDate(kind, now);
  return `https://www.sefaria.org/api/calendars?diaspora=1&year=${date.getFullYear()}&month=${date.getMonth() + 1}&day=${date.getDate()}`;
}

/** Accept a calendar only if it names this week's portion with safe Sefaria links. */
export function parseCalendar(data: { calendar_items?: Array<Record<string, any>> }): Reading {
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
}

export const calendarIntro: Record<CalendarKind, Localized> = {
  weekday: { en: "Monday and Thursday mornings read the opening of the coming Shabbat’s portion; holidays, fast days and Rosh Chodesh have their own readings. Coming Shabbat or holiday reading (Sefaria calendar, outside Israel):", he: "בבוקר ימי שני וחמישי קוראים את תחילת פרשת השבת הקרובה; לחגים, לתעניות ולראש חודש יש קריאות משלהם. הקריאה של השבת או החג הקרובים (לוח ספריא, חוץ לארץ):" },
  shabbat: { en: "This Shabbat’s reading (Sefaria calendar, outside Israel):", he: "הקריאה של שבת זו (לוח ספריא, חוץ לארץ):" },
  mincha: { en: "Shabbat afternoon reads the opening of the following week’s portion (Sefaria calendar, outside Israel):", he: "במנחה של שבת קוראים את תחילת פרשת השבוע הבא (לוח ספריא, חוץ לארץ):" },
};

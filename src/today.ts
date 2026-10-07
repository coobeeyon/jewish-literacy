// The date notes: for the date being prayed (today, or one dialled in with ?date=YYYY-MM-DD), what
// a calendar rule means: "Today: not said — Rosh Chodesh", "Tonight: day 23 of the Omer". The rules
// themselves are applied at build time (scripts/calendar.mjs writes src/calendar.generated.json, one
// code per day); this only reads the table and words the result. Shacharit and Mincha read the day
// itself; Maariv reads the evening, which belongs to the next Hebrew day; the Shabbat maps read the
// coming (or current) Shabbat.
//

export type CalendarTable = Readonly<{
  from: string; to: string;
  /** Each Hebrew month: its first civil day, English name, Hebrew name, year, year in Hebrew letters. */
  months: ReadonlyArray<readonly [string, string, string, number, string]>;
  numerals: readonly string[];
  omer: readonly string[];
  /** Each Shabbat's reading: date, English, Hebrew, Torah ref, haftarah ref, 1 if a weekly portion. */
  shabbatot: ReadonlyArray<readonly [string, string, string, string, string, number]>;
  k: string; t: string; m: string; z: string; r: string; p: string;
}>;
type Words = { en: string; he: string };

// ───────────── Civil dates, as "YYYY-MM-DD" ─────────────

const pad = (n: number) => String(n).padStart(2, "0");
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d, 12); };
export const localToday = () => toIso(new Date());
export const addDays = (iso: string, n: number) => { const d = fromIso(iso); d.setDate(d.getDate() + n); return toIso(d); };
const dayIndex = (table: CalendarTable, iso: string) => Math.round((fromIso(iso).getTime() - fromIso(table.from).getTime()) / 864e5);
export const covered = (table: CalendarTable, iso: string) => iso >= table.from && iso <= table.to;

/** A real date written as YYYY-MM-DD, or undefined. */
export function parseDate(value: string | null | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return toIso(fromIso(value)) === value ? value : undefined;
}
/** The date a URL's ?date= names, if any. */
export const dateFromSearch = (search: string) => parseDate(new URLSearchParams(search).get("date"));

const weekdaysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Shabbat"];
const shortWeekdaysEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Shabbat"];
const weekdaysHe = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבת"];
const shortWeekdaysHe = ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "שבת"];
const monthsEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekday = (iso: string) => fromIso(iso).getDay();

/** "Wed 21 Oct 2026" / "יום ד׳ 21.10.2026" (the year only where asked). */
export function civilDate(iso: string, year = false): Words {
  const d = fromIso(iso);
  return {
    en: `${shortWeekdaysEn[d.getDay()]} ${d.getDate()} ${monthsEn[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ""}`,
    he: `${shortWeekdaysHe[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}${year ? `.${d.getFullYear()}` : ""}`,
  };
}

/** The Hebrew date of a civil day's daytime: "26 Tishrei 5787" / "כ״ו בתשרי תשפ״ז". */
export function hebrewDate(table: CalendarTable, iso: string): Words | undefined {
  if (!covered(table, iso)) return undefined;
  let month = table.months[0];
  for (const m of table.months) if (m[0] <= iso) month = m;
  const day = Math.round((fromIso(iso).getTime() - fromIso(month[0]).getTime()) / 864e5) + 1;
  return { en: `${day} ${month[1]} ${month[3]}`, he: `${table.numerals[day - 1]} ב${month[2]} ${month[4]}` };
}

// ───────────── The notes ─────────────
// Every status is one short line, "Today: none—Rosh Chodesh"; the rule beside it (src/notes.ts)
// explains. Each fits one line of fine print at the narrowest width in each language
// (tests/date.spec.ts checks), so the room kept for it is exactly enough and nothing moves.

/** Why a prayer is not said, by the codes scripts/calendar.mjs writes. */
const reasons: Record<string, Words> = {
  R: { en: "Rosh Chodesh", he: "ראש חודש" },
  C: { en: "Chanukah", he: "חנוכה" },
  P: { en: "Purim", he: "פורים" },
  Q: { en: "Shushan Purim", he: "שושן פורים" },
  K: { en: "Purim Katan", he: "פורים קטן" },
  B: { en: "Tu BiShvat", he: "ט״ו בשבט" },
  V: { en: "Tu B’Av", he: "ט״ו באב" },
  A: { en: "Tisha B’Av", he: "תשעה באב" },
  N: { en: "Nisan", he: "ניסן" },
  G: { en: "Pesach Sheni", he: "פסח שני" },
  L: { en: "Lag BaOmer", he: "ל״ג בעומר" },
  W: { en: "early Sivan", he: "תחילת סיוון" },
  E: { en: "Erev Rosh Hashana", he: "ערב ראש השנה" },
  X: { en: "Erev Yom Kippur", he: "ערב יום כיפור" },
  T: { en: "after Yom Kippur", he: "אחרי יום כיפור" },
  H: { en: "Chol HaMoed", he: "חול המועד" },
  F: { en: "Erev Shabbat", he: "ערב שבת" },
  O: { en: "Erev Yom Tov", he: "ערב יום טוב" },
};
/** A reason; a lower-case code is the afternoon before that day ("Erev Rosh Chodesh"). */
const reasonOf = (code: string): Words => {
  const own = reasons[code];
  if (own) return own;
  const day = reasons[code.toUpperCase()];
  return { en: `Erev ${day.en}`, he: `ערב ${day.he}` };
};

const join = (when: Words, what: Words): Words => ({ en: `${when.en}: ${what.en}`, he: `${when.he}: ${what.he}` });
const said = (feminine = false): Words => ({ en: "said", he: feminine ? "נאמרת" : "נאמר" });
/** "none—Rosh Chodesh" (short enough for the narrowest card); Tzidkatcha is feminine in Hebrew. */
const notSaid = (code: string, feminine = false): Words => { const r = reasonOf(code); return { en: `none—${r.en}`, he: `${feminine ? "אינה נאמרת" : "אינו נאמר"} — ${r.he}` }; };
/** Shabbat and festivals, where a weekday map does not apply, and days whose custom varies (U 9-12 Sivan, I Yom HaAtzmaut, J Yom Yerushalayim). */
const notHere = (code: string): Words | undefined =>
  code === "S" ? { en: "it’s Shabbat", he: "שבת" }
  : code === "Y" ? { en: "it’s a festival", he: "יום טוב" }
  : "UIJ".includes(code) ? { en: "customs vary", he: "המנהג משתנה" }
  : undefined;

const psalmOfDay = [24, 48, 82, 94, 81, 93, 92];
const psalmOfDayHe = ["כ״ד", "מ״ח", "פ״ב", "צ״ד", "פ״א", "צ״ג", "צ״ב"];

/** Which day a note reads: the date's daytime, its evening (Maariv), or its Shabbat. */
export type NoteTime = "day" | "evening" | "shabbat";
export const noteTimes: Record<string, NoteTime> = {
  "tachanun-shacharit": "day", "tachanun-mincha": "day", "kaddish-after-tachanun": "day", "torah-weekday": "day", "daily-psalms": "day",
  omer: "evening", tzidkatcha: "shabbat", "kaddish-after-tzidkatcha": "shabbat",
};

/** The Shabbat a date belongs to on the Shabbat maps: the date itself if it is Shabbat, otherwise the coming one. */
export const shabbatOf = (iso: string) => addDays(iso, (6 - weekday(iso) + 7) % 7);

/** "Today", "Tonight", or the date ("12 Oct", "12 Oct, eve"; on the Shabbat maps, the Shabbat's). */
function whenOf(time: NoteTime, iso: string, today: string): Words {
  const short = (day: string): Words => { const d = fromIso(day); return { en: `${d.getDate()} ${monthsEn[d.getMonth()]}`, he: `${d.getDate()}.${d.getMonth() + 1}` }; };
  if (time === "evening") { if (iso === today) return { en: "Tonight", he: "הלילה" }; const d = short(iso); return { en: `${d.en}, eve`, he: `ערב ${d.he}` }; }
  // On the Shabbat maps, the Shabbat itself: "Today" on the day, otherwise its date.
  if (time === "shabbat") return shabbatOf(iso) === today ? { en: "Today", he: "היום" } : short(shabbatOf(iso));
  return iso === today ? { en: "Today", he: "היום" } : short(iso);
}

const readings: Record<string, Words> = {
  "-": { en: "no reading", he: "אין קריאה" },
  M: { en: "Torah reading, 3 aliyot", he: "קריאת התורה, 3 עליות" },
  R: { en: "Rosh Chodesh, 4 aliyot", he: "ראש חודש, 4 עליות" },
  C: { en: "Chanukah, 3 aliyot", he: "חנוכה, 3 עליות" },
  D: { en: "2 scrolls, 4 aliyot", he: "2 ספרי תורה, 4 עליות" },
  P: { en: "Purim, 3 aliyot", he: "פורים, 3 עליות" },
  F: { en: "fast day, 3 aliyot", he: "תענית, 3 עליות" },
  A: { en: "Tisha B’Av, 3 aliyot", he: "תשעה באב, 3 עליות" },
  H: { en: "Chol HaMoed, 4 aliyot", he: "חול המועד, 4 עליות" },
};

const notCovered: Words = { en: "not in the calendar", he: "אינו בלוח" };

/** What a note says for a date: one short line, or that the calendar does not reach it. */
export function noteStatus(table: CalendarTable, note: string, iso: string, today: string): Words {
  const time = noteTimes[note] || "day";
  const when = whenOf(time, iso, today);
  const day = time === "evening" ? addDays(iso, 1) : time === "shabbat" ? shabbatOf(iso) : iso;
  if (!covered(table, day)) return join(when, notCovered);
  const i = dayIndex(table, day);
  switch (note) {
    case "tachanun-shacharit": {
      const code = table.t[i];
      if (code !== "-") return join(when, notHere(code) || notSaid(code));
      return join(when, weekday(day) === 1 || weekday(day) === 4 ? { en: "said, the long form", he: "נאמר, בנוסח הארוך" } : said());
    }
    case "tachanun-mincha": {
      const code = table.m[i];
      return join(when, code === "-" ? said() : notHere(code) || notSaid(code));
    }
    case "kaddish-after-tachanun": {
      const code = table.t[i];
      if (code === "-") return join(when, { en: "after Tachanun", he: "אחרי התחנון" });
      const special = notHere(code);
      if (special) return join(when, special);
      if (code === "R" || code === "H") return join(when, { en: "after Hallel, as Full Kaddish", he: "אחרי ההלל, כקדיש שלם" });
      if (code === "C") return join(when, { en: "after Hallel", he: "אחרי ההלל" });
      return join(when, { en: "after the repetition", he: "אחרי החזרה" });
    }
    case "torah-weekday":
      return join(when, readings[table.r[i]] || notHere(table.r[i])!);
    case "daily-psalms": {
      if (table.k[i] === "S" || table.k[i] === "Y") return join(when, notHere(table.k[i])!);
      const flags = Number(table.p[i]), n = weekday(day);
      // The day's psalm, then 104 (Rosh Chodesh) and 27 (Elul to Sukkot); the rule says why.
      const en = [String(psalmOfDay[n]), flags & 1 && "104", flags & 2 && "27"].filter(Boolean) as string[];
      const he = [psalmOfDayHe[n], flags & 1 && "ק״ד", flags & 2 && "כ״ז"].filter(Boolean) as string[];
      const list = (items: string[], and: string) => items.length > 1 ? `${items.slice(0, -1).join(", ")}${and}${items[items.length - 1]}` : items[0];
      return join(when, { en: `${en.length > 1 ? "Psalms" : "Psalm"} ${list(en, " and ")}`, he: `תהילים ${list(he, " ו")}` });
    }
    case "omer": {
      // The count begins on the evening of each year's `omer` day (the second night of Pesach).
      const n = Math.max(0, ...table.omer.map(first => { const k = Math.round((fromIso(iso).getTime() - fromIso(first).getTime()) / 864e5) + 1; return k >= 1 && k <= 49 ? k : 0; }));
      return join(when, n ? { en: `Omer day ${n}`, he: `יום ${n} לעומר` } : { en: "no Omer count", he: "אין ספירת העומר" });
    }
    case "tzidkatcha": {
      const code = table.z[i];
      return join(when, code === "-" ? said(true) : notHere(code) || notSaid(code, true));
    }
    case "kaddish-after-tzidkatcha": {
      const code = table.z[i];
      if (code === "-") return join(when, { en: "after Tzidkatcha", he: "אחרי צדקתך" });
      return join(when, notHere(code) || { en: "after the repetition", he: "אחרי החזרה" });
    }
  }
  return when;
}

// ───────────── The week's Torah reading ─────────────

/** Which reading a Torah card shows: the coming Shabbat's portion (weekday), this Shabbat's reading, or (Shabbat afternoon) the next week's portion. */
export type ReadingKind = "weekday" | "shabbat" | "mincha";
export type Reading = Readonly<{ name: Words; torah: string; haftarah?: string }>;

/** A reading for the date, from the table's Shabbat readings, or undefined past the table. */
export function readingFor(table: CalendarTable, kind: ReadingKind, iso: string): Reading | undefined {
  const shabbat = shabbatOf(iso);
  const found = kind === "shabbat" ? table.shabbatot.find(s => s[0] === shabbat)
    : table.shabbatot.find(s => s[5] === 1 && (kind === "mincha" ? s[0] > shabbat : s[0] >= shabbat));
  if (!found || (kind === "shabbat" && !covered(table, shabbat))) return undefined;
  return { name: { en: found[1], he: found[2] }, torah: found[3], haftarah: kind === "shabbat" ? found[4] || undefined : undefined };
}

/** A ref as Sefaria writes it in a link: "I Samuel 20:18-42" → https://www.sefaria.org/I_Samuel.20.18-42. */
export const sefariaUrl = (ref: string) => `https://www.sefaria.org/${ref.replace(/ (?=\d+:)/, ".").replace(/ /g, "_").replace(/:/g, ".")}`;
/** A ref for reading: an en dash in ranges. */
export const showRef = (ref: string) => ref.replace(/-/g, "–");

/** Word every date note under `root` for the date `iso` (the reader's today is `today`). */
export function fillNotes(table: CalendarTable, root: ParentNode, iso: string, today: string) {
  for (const el of root.querySelectorAll<HTMLElement>("[data-note]")) {
    const status = el.querySelector<HTMLElement>("[data-note-status]");
    if (!status) continue;
    const words = noteStatus(table, el.dataset.note!, iso, today);
    const key = `${iso}|${today}`;
    if (status.dataset.for === key) continue;
    status.dataset.for = key;
    const en = document.createElement("span"), he = document.createElement("span");
    en.dataset.lang = "en"; en.textContent = words.en;
    he.dataset.lang = "he"; he.className = "he"; he.textContent = words.he;
    status.replaceChildren(en, he);
  }
}

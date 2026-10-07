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
// Every status fits two lines of fine print at the narrowest width (tests/date.spec.ts checks), so
// the room kept for it is enough and nothing moves when it is written in.

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
  N: { en: "the month of Nisan", he: "חודש ניסן" },
  G: { en: "Pesach Sheni", he: "פסח שני" },
  L: { en: "Lag BaOmer", he: "ל״ג בעומר" },
  W: { en: "the days of Shavuot", he: "ימי חג השבועות" },
  E: { en: "Erev Rosh Hashanah", he: "ערב ראש השנה" },
  X: { en: "Erev Yom Kippur", he: "ערב יום כיפור" },
  T: { en: "Yom Kippur to Sukkot", he: "מיום כיפור עד סוכות" },
  H: { en: "Chol HaMoed", he: "חול המועד" },
  F: { en: "Erev Shabbat", he: "ערב שבת" },
  O: { en: "Erev Yom Tov", he: "ערב יום טוב" },
};
/** Days whose practice varies between communities. */
const varies: Record<string, Words> = {
  U: { en: "many omit it to 12 Sivan", he: "רבים עד י״ב בסיוון" },
  I: { en: "Yom HaAtzmaut", he: "יום העצמאות" },
  J: { en: "Yom Yerushalayim", he: "יום ירושלים" },
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
/** "not said — Rosh Chodesh"; Tzidkatcha is feminine in Hebrew. */
const notSaid = (code: string, feminine = false): Words => { const r = reasonOf(code); return { en: `not said — ${r.en}`, he: `${feminine ? "אינה נאמרת" : "אינו נאמר"} — ${r.he}` }; };
/** Shabbat and festivals, where a weekday map does not apply, and days whose practice varies. */
const notHere = (code: string): Words | undefined =>
  code === "S" ? { en: "Shabbat — see the Shabbat maps", he: "שבת — ראו את מפות השבת" }
  : code === "Y" ? { en: "a festival — its service differs", he: "יום טוב — התפילה בו שונה" }
  : varies[code] ? { en: `customs vary — ${varies[code].en}`, he: `המנהג משתנה — ${varies[code].he}` }
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

/** "Today", "Tonight", "This Shabbat", or the date itself when another date is dialled in; `named` adds the weekday to "Today". */
function whenOf(time: NoteTime, iso: string, today: string, named = false): Words {
  if (time === "evening") return iso === today ? { en: "Tonight", he: "הלילה" } : { en: `${civilDate(iso).en}, evening`, he: `${civilDate(iso).he} בערב` };
  if (time === "shabbat") {
    const s = shabbatOf(iso), d = fromIso(s);
    return s === shabbatOf(today) ? { en: "This Shabbat", he: "בשבת זו" } : { en: `Shabbat ${d.getDate()} ${monthsEn[d.getMonth()]}`, he: `בשבת ${d.getDate()}.${d.getMonth() + 1}` };
  }
  if (iso !== today) return civilDate(iso);
  return named ? { en: `Today (${weekdaysEn[weekday(iso)]})`, he: `היום (${weekdaysHe[weekday(iso)]})` } : { en: "Today", he: "היום" };
}

const readings: Record<string, Words> = {
  "-": { en: "no Torah reading", he: "אין קריאת התורה" },
  M: { en: "Torah reading, three aliyot", he: "קריאת התורה, שלוש עליות" },
  R: { en: "Rosh Chodesh reading, four aliyot", he: "קריאת ראש חודש, ארבע עליות" },
  C: { en: "Chanukah reading, three aliyot", he: "קריאת חנוכה, שלוש עליות" },
  D: { en: "Rosh Chodesh and Chanukah, two scrolls", he: "ראש חודש וחנוכה, שני ספרי תורה" },
  P: { en: "Purim reading, three aliyot", he: "קריאת פורים, שלוש עליות" },
  F: { en: "fast-day reading, three aliyot", he: "קריאת תענית, שלוש עליות" },
  A: { en: "Tisha B’Av reading, three aliyot", he: "קריאת תשעה באב, שלוש עליות" },
  H: { en: "Chol HaMoed reading, four aliyot", he: "קריאת חול המועד, ארבע עליות" },
};

/** What a note says for a date: its status, or that the calendar does not reach it. */
export function noteStatus(table: CalendarTable, note: string, iso: string, today: string): Words {
  const time = noteTimes[note] || "day";
  const named = note === "torah-weekday" || note === "daily-psalms";
  const when = whenOf(time, iso, today, named);
  const day = time === "evening" ? addDays(iso, 1) : time === "shabbat" ? shabbatOf(iso) : iso;
  if (!covered(table, day)) {
    const last = fromIso(table.to);
    return join(when, { en: `not in the calendar (to ${last.getDate()} ${monthsEn[last.getMonth()]} ${last.getFullYear()})`, he: `אינו בלוח (עד ${last.getDate()}.${last.getMonth() + 1}.${last.getFullYear()})` });
  }
  const i = dayIndex(table, day);
  switch (note) {
    case "tachanun-shacharit": {
      const code = table.t[i];
      if (code !== "-") return join(when, notHere(code) || notSaid(code));
      return join(when, weekday(day) === 1 || weekday(day) === 4 ? { en: "said, with the Monday–Thursday additions", he: "נאמר, עם התוספות של שני וחמישי" } : said());
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
      if (code === "R" || code === "H") return join(when, { en: "after Hallel, as a Full Kaddish", he: "אחרי ההלל, כקדיש שלם" });
      if (code === "C") return join(when, { en: "after Hallel", he: "אחרי ההלל" });
      return join(when, { en: "right after the repetition — no Tachanun", he: "מיד אחרי החזרה — אין תחנון" });
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
      if (!n) return join(when, { en: "no Omer count", he: "אין ספירת העומר" });
      return join(when, { en: `count day ${n} of the Omer`, he: `סופרים יום ${n} לעומר` });
    }
    case "tzidkatcha": {
      const code = table.z[i];
      return join(when, code === "-" ? said(true) : notHere(code) || notSaid(code, true));
    }
    case "kaddish-after-tzidkatcha": {
      const code = table.z[i];
      if (code === "-") return join(when, { en: "after Tzidkatcha", he: "אחרי צדקתך" });
      const special = notHere(code);
      if (special) return join(when, special);
      return join(when, { en: "right after the repetition — no Tzidkatcha", he: "מיד אחרי החזרה — אין צדקתך" });
    }
  }
  return when;
}

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

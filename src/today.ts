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
  /** Each Shabbat's reading: date, English, Hebrew, Torah ref, haftarah ref, 1 if a weekly portion, special Shabbat (English, Hebrew), 1 if the new month is blessed. */
  shabbatot: ReadonlyArray<readonly [string, string, string, string, string, number, string, string, number]>;
  k: string; t: string; m: string; z: string; r: string; p: string; f: string;
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
const reasonOrDay = (code: string): Words => code === "S" ? { en: "Shabbat", he: "שבת" } : code === "Y" ? { en: "a festival", he: "יום טוב" } : reasonOf(code);
/** "Not today—Rosh Chodesh", "Not on 12 Oct—Erev Shabbat": short enough for the narrowest card. */
const notOn = (when: Words, code: string): Words => {
  const r = reasonOrDay(code), today = when.en === "Today" || when.en === "Tonight";
  return { en: `Not ${today ? when.en.toLowerCase() : `on ${when.en}`}—${r.en}`, he: `לא ${today ? when.he : `ב־${when.he}`} — ${r.he}` };
};
/** Days whose custom genuinely splits (U 9-12 Sivan, I Yom HaAtzmaut, J Yom Yerushalayim): said in some synagogues, not in others. */
const splits = (code: string) => "UIJ".includes(code);
const often: Record<string, Words> = {
  U: { en: "often omitted to 12 Sivan", he: "רבים אינם אומרים עד י״ב בסיוון" },
  // The day's line names the day (Yom HaAtzmaut, Yom Yerushalayim).
  I: { en: "often omitted", he: "רבים אינם אומרים" },
  J: { en: "often omitted", he: "רבים אינם אומרים" },
};

const psalmOfDay = [24, 48, 82, 94, 81, 93, 92];
const psalmOfDayHe = ["כ״ד", "מ״ח", "פ״ב", "צ״ד", "פ״א", "צ״ג", "צ״ב"];

/** Which day a note reads: the date's daytime, its evening (Maariv), or its Shabbat. */
export type NoteTime = "day" | "evening" | "shabbat";
export const noteTimes: Record<string, NoteTime> = {
  "tachanun-shacharit": "day", "tachanun-mincha": "day", "kaddish-after-tachanun": "day", "torah-weekday": "day", "daily-psalms": "day",
  omer: "evening", tzidkatcha: "shabbat", "kaddish-after-tzidkatcha": "shabbat",
  // A mark only (the Monday–Thursday additions in Tachanun's breakdown), with no note of its own.
  "monday-thursday": "day",
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

/** Whether a note's prayer applies on the date: "on" (only on such days, and today is one), "off" (not said), or "" (as usual). */
export type Mark = "on" | "off" | "";

/** What a note says for a date: one short line, or that the calendar does not reach it; and whether its prayer is on or off. */
export function noteState(table: CalendarTable, note: string, iso: string, today: string): { words: Words; mark: Mark } {
  const time = noteTimes[note] || "day";
  const when = whenOf(time, iso, today);
  const day = time === "evening" ? addDays(iso, 1) : time === "shabbat" ? shabbatOf(iso) : iso;
  const plain = (words: Words, mark: Mark = "") => ({ words, mark });
  if (!covered(table, day)) return plain(join(when, notCovered));
  const i = dayIndex(table, day);
  switch (note) {
    case "tachanun-shacharit": case "tachanun-mincha": {
      const code = note === "tachanun-shacharit" ? table.t[i] : table.m[i];
      if (splits(code)) return plain(join(when, often[code]));
      if (code !== "-") return plain(notOn(when, code), "off");
      return plain(join(when, note === "tachanun-shacharit" && (weekday(day) === 1 || weekday(day) === 4) ? { en: "said, the long form", he: "נאמר, בנוסח הארוך" } : said()));
    }
    case "kaddish-after-tachanun": {
      const code = table.t[i];
      if (code === "S" || code === "Y") return plain(notOn(when, code), "off");
      if (code === "-" || splits(code)) return plain(join(when, { en: "after Tachanun", he: "אחרי התחנון" }));
      if (code === "R" || code === "H") return plain(join(when, { en: "after Hallel, as Full Kaddish", he: "אחרי ההלל, כקדיש שלם" }));
      if (code === "C") return plain(join(when, { en: "after Hallel", he: "אחרי ההלל" }));
      return plain(join(when, { en: "after the repetition", he: "אחרי החזרה" }));
    }
    case "torah-weekday": {
      const code = table.r[i];
      if (code === "S" || code === "Y") return plain(notOn(when, code), "off");
      if (code === "-") return plain(join(when, { en: "no reading", he: "אין קריאה" }), "off");
      return plain(join(when, readings[code]), "on");
    }
    case "daily-psalms": {
      if (table.k[i] === "S" || table.k[i] === "Y") return plain(notOn(when, table.k[i]), "off");
      const flags = Number(table.p[i]), n = weekday(day);
      // The day's psalm, then 104 (Rosh Chodesh) and 27 (Elul to Sukkot); the rule says why.
      const en = [String(psalmOfDay[n]), flags & 1 && "104", flags & 2 && "27"].filter(Boolean) as string[];
      const he = [psalmOfDayHe[n], flags & 1 && "ק״ד", flags & 2 && "כ״ז"].filter(Boolean) as string[];
      const list = (items: string[], and: string) => items.length > 1 ? `${items.slice(0, -1).join(", ")}${and}${items[items.length - 1]}` : items[0];
      return plain(join(when, { en: `${en.length > 1 ? "Psalms" : "Psalm"} ${list(en, " and ")}`, he: `תהילים ${list(he, " ו")}` }));
    }
    case "omer": {
      const n = omerDay(table, iso);
      return n ? plain(join(when, { en: `Omer day ${n}`, he: `יום ${n} לעומר` }), "on") : plain(join(when, { en: "no Omer count", he: "אין ספירת העומר" }), "off");
    }
    case "monday-thursday": {
      const longer = table.t[i] === "-" && (weekday(day) === 1 || weekday(day) === 4);
      return plain(join(when, longer ? said() : { en: "not said", he: "אינו נאמר" }), longer ? "on" : "off");
    }
    case "tzidkatcha": {
      const code = table.z[i];
      if (splits(code)) return plain(join(when, often[code]));
      return code === "-" ? plain(join(when, said(true))) : plain(notOn(when, code), "off");
    }
    case "kaddish-after-tzidkatcha": {
      const code = table.z[i];
      if (code === "-" || splits(code)) return plain(join(when, { en: "after Tzidkatcha", he: "אחרי צדקתך" }));
      if (code === "Y") return plain(notOn(when, code), "off");
      return plain(join(when, { en: "after the repetition", he: "אחרי החזרה" }));
    }
  }
  return plain(when);
}

/** What a note says for a date (see noteState). */
export const noteStatus = (table: CalendarTable, note: string, iso: string, today: string): Words => noteState(table, note, iso, today).words;

/** The Omer day counted on the evening of a civil date (from the second night of Pesach), or 0. */
export function omerDay(table: CalendarTable, iso: string): number {
  return Math.max(0, ...table.omer.map(first => { const k = Math.round((fromIso(iso).getTime() - fromIso(first).getTime()) / 864e5) + 1; return k >= 1 && k <= 49 ? k : 0; }));
}

// ───────────── The day in one line ─────────────

const fasts: Record<string, Words> = {
  G: { en: "Fast of Gedaliah", he: "צום גדליה" }, T: { en: "Fast of 10 Tevet", he: "עשרה בטבת" },
  E: { en: "Fast of Esther", he: "תענית אסתר" }, Z: { en: "Fast of 17 Tammuz", he: "שבעה עשר בתמוז" },
};
const line = (en: string, he: string): Words => ({ en, he });

/**
 * What is special about the date for a map's service, in one line ("Rosh Chodesh: Ya’aleh Veyavo,
 * Hallel, Musaf"; "Monday: Torah reading, longer Tachanun"), or what kind of day it is. Shacharit
 * and Mincha read the day; Maariv its evening (the next Hebrew day); the Shabbat maps their Shabbat.
 * Hallel, Musaf and the like are named here only: the maps do not show them.
 */
export function daySummary(table: CalendarTable, day: string, service: string, iso: string, today: string): Words {
  if (day === "shabbat") return shabbatSummary(table, service, shabbatOf(iso));
  const evening = service === "maariv", d = evening ? addDays(iso, 1) : iso;
  if (!covered(table, d)) return line("This date is not in the calendar", "התאריך אינו בלוח");
  const i = dayIndex(table, d), k = table.k[i], t = table.t[i], r = table.r[i], f = table.f[i];
  const name = { en: weekdaysEn[weekday(d)], he: weekdaysHe[weekday(d)] };
  if (evening) {
    const tonight = iso === today ? { en: "Tonight", he: "הלילה" } : { en: "That evening", he: "באותו ערב" };
    if (k === "S") return line("Shabbat begins: see Shabbat Maariv", "שבת נכנסת: ראו ערבית של שבת");
    if (k === "Y") return line("A festival begins: its own service", "יום טוב נכנס: תפילה משלו");
    const n = omerDay(table, iso), omer = n ? { en: `day ${n} of the Omer`, he: `יום ${n} לעומר` } : undefined;
    const event: Words | undefined = k === "H" ? line("Chol HaMoed: Ya’aleh Veyavo", "חול המועד: יעלה ויבוא")
      : t === "R" ? line("Rosh Chodesh: Ya’aleh Veyavo", "ראש חודש: יעלה ויבוא")
      : t === "P" ? line("Purim: the Megillah, Al HaNisim", "פורים: מגילה, על הניסים")
      : t === "C" ? line("Chanukah: Al HaNisim", "חנוכה: על הניסים")
      : f === "A" ? line("Tisha B’Av begins: Eicha", "תשעה באב: מגילת איכה")
      : weekday(iso) === 6 ? line("After Shabbat: Atah Chonantanu", "מוצאי שבת: אתה חוננתנו")
      : undefined;
    if (event && omer) return line(`${event.en.split(":")[0]} · ${omer.en}`, `${event.he.split(":")[0]} · ${omer.he}`);
    if (event) return event;
    if (omer) return line(`${tonight.en}: ${omer.en}`, `${tonight.he}: ${omer.he}`);
    return line("An ordinary weekday evening", "ערב של יום חול רגיל");
  }
  if (k === "S") return line("Shabbat: see the Shabbat maps", "שבת: ראו את מפות השבת");
  if (k === "Y") return line("A festival: it has its own service", "יום טוב: יש לו תפילה משלו");
  const mincha = service === "mincha";
  const hebrew = hebrewDate(table, d)!, tishrei = /^\d+ Tishrei/.test(hebrew.en), dom = Number(hebrew.en.split(" ")[0]);
  if (k === "H") return mincha ? line("Chol HaMoed: Ya’aleh Veyavo", "חול המועד: יעלה ויבוא") : line("Chol HaMoed: Ya’aleh Veyavo, Hallel, Musaf", "חול המועד: יעלה ויבוא, הלל, מוסף");
  if (f === "A") return mincha ? line("Tisha B’Av: Torah reading, Aneinu, Nachem", "תשעה באב: קריאה, עננו, נחם") : line("Tisha B’Av: Kinot, Torah reading", "תשעה באב: קינות, קריאת התורה");
  if (fasts[f]) return mincha ? line(`${fasts[f].en}: Torah reading, Aneinu`, `${fasts[f].he}: קריאה, עננו`) : line(`${fasts[f].en}: Selichot, Avinu Malkeinu`, `${fasts[f].he}: סליחות, אבינו מלכנו`);
  if (r === "D") return mincha ? line("Rosh Chodesh, Chanukah: Al HaNisim", "ראש חודש וחנוכה: על הניסים") : line("Rosh Chodesh, Chanukah: Hallel, Musaf", "ראש חודש וחנוכה: הלל, מוסף");
  if (t === "R") return mincha ? line("Rosh Chodesh: Ya’aleh Veyavo", "ראש חודש: יעלה ויבוא") : line("Rosh Chodesh: Ya’aleh Veyavo, Hallel, Musaf", "ראש חודש: יעלה ויבוא, הלל, מוסף");
  if (t === "C") return mincha ? line("Chanukah: Al HaNisim", "חנוכה: על הניסים") : line("Chanukah: Al HaNisim, Hallel, Torah reading", "חנוכה: על הניסים, הלל, קריאת התורה");
  if (t === "P") return mincha ? line("Purim: Al HaNisim", "פורים: על הניסים") : line("Purim: Al HaNisim, the Megillah", "פורים: על הניסים, מגילה");
  if (tishrei && dom >= 3 && dom <= 8 && !(mincha && weekday(d) === 5)) return line("Ten Days of Repentance: Avinu Malkeinu", "עשרת ימי תשובה: אבינו מלכנו");
  const code = mincha ? table.m[i] : t;
  if (splits(code)) return line(`${code === "U" ? "Early Sivan" : varyingDays[code].en}: Tachanun often omitted`, `${code === "U" ? "תחילת סיוון" : varyingDays[code].he}: רבים אינם אומרים תחנון`);
  if (code === "F") return line("Friday: no Tachanun before Shabbat", "יום שישי: אין תחנון לפני שבת");
  if (code !== "-") { const why = reasonOf(code); return line(`${why.en[0].toUpperCase()}${why.en.slice(1)}: no Tachanun`, `${why.he}: אין תחנון`); }
  if (!mincha && (weekday(d) === 1 || weekday(d) === 4)) return line(`${name.en}: Torah reading, longer Tachanun`, `${name.he}: קריאת התורה, תחנון ארוך`);
  return line(`${name.en}: an ordinary weekday`, `${name.he}: יום חול רגיל`);
}
const varyingDays: Record<string, Words> = { I: { en: "Yom HaAtzmaut", he: "יום העצמאות" }, J: { en: "Yom Yerushalayim", he: "יום ירושלים" } };

/** A Shabbat map's line: the portion and what is added that Shabbat. */
function shabbatSummary(table: CalendarTable, service: string, s: string): Words {
  if (!covered(table, s)) return line("This date is not in the calendar", "התאריך אינו בלוח");
  const i = dayIndex(table, s), entry = table.shabbatot.find(e => e[0] === s);
  if (table.k[i] === "Y") return line(`${entry ? entry[1] : "A festival"}: its own service`, `${entry ? entry[2] : "יום טוב"}: תפילה משלו`);
  const rc = Number(table.p[i]) & 1, z = table.z[i], chanukah = z === "C";
  const named = entry ? (entry[6] ? line(entry[6], entry[7]) : entry[5] ? line(`Shabbat ${entry[1]}`, `שבת ${entry[2]}`) : line(entry[1], entry[2])) : line("Shabbat", "שבת");
  if (table.k[i] === "H" || (entry && !entry[5])) return line(`${named.en}: Ya’aleh Veyavo`, `${named.he}: יעלה ויבוא`);
  if (service === "mincha") {
    if (z !== "-" && !splits(z)) { const why = reasonOf(z); return line(`No Tzidkatcha: ${why.en}`, `אין צדקתך: ${why.he}`); }
    const next = table.shabbatot.find(e => e[5] === 1 && e[0] > s);
    return next ? line(`Torah: the opening of ${next[1]}`, `קריאה: תחילת פרשת ${next[2]}`) : named;
  }
  if (rc && chanukah) return line("Rosh Chodesh, Chanukah: Hallel, Al HaNisim", "ראש חודש וחנוכה: הלל, על הניסים");
  if (rc) return service === "musaf" ? line("Rosh Chodesh: Musaf of Atah Yatzarta", "ראש חודש: מוסף ״אתה יצרת״") : service === "shacharit" ? line("Rosh Chodesh: Hallel, Ya’aleh Veyavo", "ראש חודש: הלל, יעלה ויבוא") : line("Rosh Chodesh: Ya’aleh Veyavo", "ראש חודש: יעלה ויבוא");
  if (chanukah) return service === "shacharit" ? line("Chanukah: Hallel, Al HaNisim", "חנוכה: הלל, על הניסים") : line("Chanukah: Al HaNisim", "חנוכה: על הניסים");
  if (service === "shacharit" && entry?.[8]) return line(`${entry[6] || entry[1]} · the new month is blessed`, `${entry[7] || entry[2]} · ברכת החודש`);
  return named;
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

/**
 * Word every date note under `root` for the date `iso` (the reader's today is `today`), and mark
 * every item whose prayer the date turns on or off: [data-mark] gets data-today="on" or "off", and
 * its label (.today-mark, if it has one) the note's line.
 */
export function fillNotes(table: CalendarTable, root: ParentNode, iso: string, today: string) {
  const key = `${iso}|${today}`;
  const write = (el: HTMLElement, words: Words) => {
    const en = document.createElement("span"), he = document.createElement("span");
    en.dataset.lang = "en"; en.textContent = words.en;
    he.dataset.lang = "he"; he.className = "he"; he.textContent = words.he;
    el.replaceChildren(en, he);
  };
  for (const el of root.querySelectorAll<HTMLElement>("[data-note], [data-mark]")) {
    if (el.dataset.for === key) continue;
    el.dataset.for = key;
    const state = noteState(table, el.dataset.note || el.dataset.mark!, iso, today);
    const status = el.dataset.note ? el.querySelector<HTMLElement>(":scope .note-status") : el.querySelector<HTMLElement>(":scope > button .today-mark, :scope > .today-mark");
    if (status) write(status, state.words);
    if (el.dataset.mark) { if (state.mark) el.dataset.today = state.mark; else delete el.dataset.today; }
  }
}

/** The day's line on the map (`root`'s .day-summary) for its service and date. */
export function fillSummary(table: CalendarTable, root: ParentNode, day: string, service: string, iso: string, today: string) {
  const el = root.querySelector<HTMLElement>(".day-summary");
  if (!el) return;
  const words = daySummary(table, day, service, iso, today);
  const [en, he] = [document.createElement("span"), document.createElement("span")];
  en.dataset.lang = "en"; en.textContent = words.en;
  he.dataset.lang = "he"; he.className = "he"; he.textContent = words.he;
  el.replaceChildren(en, he);
}

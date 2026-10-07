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
// Each date-dependent item gets a calendar box when opened: its rule, then the verdict for the date
// with the reason, as a sentence ("Mon 12 Oct (1 Cheshvan): **not said** — it’s Rosh Chodesh."). On
// the map, the item carries one short tag ("Not today—Rosh Chodesh") and is marked on or off.

/** Why a prayer is not said: the name of the day, by the codes scripts/calendar.mjs writes. */
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
  S: { en: "Shabbat", he: "שבת" },
  Y: { en: "a festival", he: "יום טוב" },
};
/** A reason; a lower-case code is the afternoon before that day ("Erev Rosh Chodesh"). */
const reasonOf = (code: string): Words => {
  const own = reasons[code];
  if (own) return own;
  const day = reasons[code.toUpperCase()];
  return { en: `Erev ${day.en}`, he: `ערב ${day.he}` };
};
/** The same reason as a clause: "it’s Rosh Chodesh", "it’s the afternoon before Rosh Chodesh". */
const because: Record<string, Words> = {
  N: { en: "it’s the month of Nisan", he: "חודש ניסן" },
  W: { en: "it’s Sivan, through the day after Shavuot", he: "סיוון, עד אחרי שבועות" },
  T: { en: "it’s between Yom Kippur and the end of Sukkot", he: "בין יום כיפור לסוף סוכות" },
  F: { en: "it’s Friday afternoon, before Shabbat", he: "יום שישי אחר הצהריים, לפני שבת" },
  O: { en: "it’s the eve of a festival", he: "ערב יום טוב" },
  S: { en: "it’s Shabbat; see the Shabbat maps", he: "שבת; ראו את מפות השבת" },
  Y: { en: "it’s a festival, with its own service", he: "יום טוב, ולו תפילה משלו" },
};
const clauseOf = (code: string, shabbat = false): Words => {
  if (because[code]) return because[code];
  if (code !== code.toUpperCase()) {
    const day = reasons[code.toUpperCase()];
    return shabbat ? { en: `the next day is ${day.en}`, he: `למחרת ${day.he}` } : { en: `it’s the afternoon before ${day.en}`, he: `ערב ${day.he}` };
  }
  return { en: `it’s ${reasons[code].en}`, he: reasons[code].he };
};
/** Days whose custom genuinely splits (U 9-12 Sivan, I Yom HaAtzmaut, J Yom Yerushalayim). */
const splits = (code: string) => "UIJ".includes(code);
const splitWhy: Record<string, Words> = {
  U: { en: "many omit it until 12 Sivan", he: "רבים אינם אומרים אותו עד י״ב בסיוון" },
  I: { en: "it’s Yom HaAtzmaut, and many omit it", he: "יום העצמאות, ורבים אינם אומרים אותו" },
  J: { en: "it’s Yom Yerushalayim, and many omit it", he: "יום ירושלים, ורבים אינם אומרים אותו" },
};

const psalmOfDay = [24, 48, 82, 94, 81, 93, 92];
const psalmOfDayHe = ["כ״ד", "מ״ח", "פ״ב", "צ״ד", "פ״א", "צ״ג", "צ״ב"];

/** Which day a note reads: the date's daytime, its evening (Maariv), or its Shabbat. */
export type NoteTime = "day" | "evening" | "shabbat";
export const noteTimes: Record<string, NoteTime> = {
  "tachanun-shacharit": "day", "tachanun-mincha": "day", "kaddish-after-tachanun": "day", "torah-weekday": "day", "daily-psalms": "day",
  omer: "evening", tzidkatcha: "shabbat", "kaddish-after-tzidkatcha": "shabbat",
  // A mark only (the Monday–Thursday additions in Tachanun's breakdown), with no box of its own.
  "monday-thursday": "day",
};

/** The Shabbat a date belongs to on the Shabbat maps: the date itself if it is Shabbat, otherwise the coming one. */
export const shabbatOf = (iso: string) => addDays(iso, (6 - weekday(iso) + 7) % 7);

/** A day and month of the Hebrew calendar: "1 Cheshvan" / "א׳ בחשוון". */
export function hebrewDay(table: CalendarTable, iso: string): Words | undefined {
  if (!covered(table, iso)) return undefined;
  let month = table.months[0];
  for (const m of table.months) if (m[0] <= iso) month = m;
  const day = Math.round((fromIso(iso).getTime() - fromIso(month[0]).getTime()) / 864e5) + 1;
  return { en: `${day} ${month[1]}`, he: `${table.numerals[day - 1]} ב${month[2]}` };
}

/** When a box's verdict is for: "Today, Wed 7 Oct (26 Tishrei)", "The evening of Wed 13 May (7 Iyyar begins)", "This Shabbat, 10 Oct (29 Tishrei)". */
function longWhen(table: CalendarTable, time: NoteTime, iso: string, today: string): Words {
  const c = civilDate(iso);
  if (time === "evening") {
    const h = hebrewDay(table, addDays(iso, 1));
    const begins = h ? { en: ` (${h.en} begins)`, he: `ליל ${h.he}` } : { en: "", he: "בערב" };
    return iso === today ? { en: `Tonight, ${c.en}${begins.en}`, he: `הלילה, ${begins.he}` } : { en: `The evening of ${c.en}${begins.en}`, he: begins.he };
  }
  const day = time === "shabbat" ? shabbatOf(iso) : iso, d = fromIso(day), h = hebrewDay(table, day);
  const date = `${d.getDate()} ${monthsEn[d.getMonth()]}`;
  if (time === "shabbat") {
    const here = shabbatOf(today) === day;
    return { en: `${here ? "This Shabbat" : "Shabbat"}, ${date}${h ? ` (${h.en})` : ""}`, he: `${here ? "בשבת זו" : "בשבת"}${h ? `, ${h.he}` : ""}` };
  }
  return iso === today ? { en: `Today, ${civilDate(day).en}${h ? ` (${h.en})` : ""}`, he: `היום${h ? `, ${h.he}` : ""}` } : { en: `${civilDate(day).en}${h ? ` (${h.en})` : ""}`, he: `${shortWeekdaysHe[d.getDay()]}${h ? `, ${h.he}` : ""}` };
}

/** When a tag on the map is for: "today", "tonight", "on 12 Oct" / "היום", "בא׳ בחשוון". */
function shortWhen(table: CalendarTable, time: NoteTime, iso: string, today: string): Words {
  const day = time === "shabbat" ? shabbatOf(iso) : time === "evening" ? addDays(iso, 1) : iso;
  const isToday = time === "shabbat" ? day === today : iso === today;
  if (isToday) return time === "evening" ? { en: "tonight", he: "הלילה" } : { en: "today", he: "היום" };
  const d = fromIso(time === "evening" ? iso : day), h = hebrewDay(table, day);
  return { en: `${time === "evening" ? "the evening of " : "on "}${d.getDate()} ${monthsEn[d.getMonth()]}`, he: h ? `ב${h.he}` : `ב־${d.getDate()}.${d.getMonth() + 1}` };
}
const cap = (text: string) => text[0].toUpperCase() + text.slice(1);

/** Whether a note's prayer applies on the date: "on" (only on such days, and this is one), "off" (not said), or "" (as usual). */
export type Mark = "on" | "off" | "";
/** A verdict as a sentence: when, the verdict (bold), and why. */
export type Verdict = Readonly<{ when: Words; verdict: Words; reason: Words }>;
/** A note's reading of a date: the map's tag, whether the item is on or off, and the box's verdict. */
export type Judgment = Readonly<{ tag: Words; mark: Mark; verdict: Verdict }>;

const w = (en: string, he: string): Words => ({ en, he });
const noException = w("none of the exceptions applies", "אף אחד מהחריגים אינו חל");
const fastNames: Record<string, Words> = {
  G: w("the Fast of Gedaliah", "צום גדליה"), T: w("the Fast of 10 Tevet", "עשרה בטבת"), E: w("the Fast of Esther", "תענית אסתר"), Z: w("the Fast of 17 Tammuz", "שבעה עשר בתמוז"),
};

/** What a note says about a date: its tag on the map, on or off, and the box's verdict with its reason. */
export function judge(table: CalendarTable, note: string, iso: string, today: string): Judgment {
  const time = noteTimes[note] || "day";
  const day = time === "evening" ? addDays(iso, 1) : time === "shabbat" ? shabbatOf(iso) : iso;
  const when = longWhen(table, time, iso, today), at = shortWhen(table, time, iso, today);
  const out = (tag: Words, mark: Mark, verdict: Words, reason: Words): Judgment => ({ tag, mark, verdict: { when, verdict, reason } });
  /** "Not today—Rosh Chodesh" / "לא היום — ראש חודש". */
  const notTag = (code: string) => { const r = reasonOf(code); return w(`Not ${at.en}—${r.en}`, `לא ${at.he} — ${r.he}`); };
  if (!covered(table, day)) {
    const last = civilDate(table.to, true);
    return out(w("Date not in the calendar", "התאריך אינו בלוח"), "", w("not in the calendar", "אינו בלוח"), w(`the calendar runs to ${last.en.slice(4)}`, `הלוח מגיע עד ${table.to.split("-").reverse().join(".")}`));
  }
  const i = dayIndex(table, day), name = w(weekdaysEn[weekday(day)], weekdaysHe[weekday(day)]);
  const monThu = weekday(day) === 1 || weekday(day) === 4;
  switch (note) {
    case "tachanun-shacharit": case "tachanun-mincha": {
      const code = note === "tachanun-shacharit" ? table.t[i] : table.m[i];
      if (splits(code)) return out(w(`Often omitted ${at.en}`, `רבים אינם אומרים ${at.he}`), "", w("said in some synagogues", "נאמר בחלק מבתי הכנסת"), splitWhy[code]);
      if (code !== "-") return out(notTag(code), "off", w("not said", "אינו נאמר"), clauseOf(code));
      if (note === "tachanun-shacharit" && monThu) return out(w(`Said ${at.en}—longer form`, `נאמר ${at.he} — בנוסח הארוך`), "", w("said, with the longer Monday–Thursday additions", "נאמר, עם התוספות הארוכות של שני וחמישי"), w(`it’s ${name.en}`, name.he));
      return out(w(`Said ${at.en}—no exception`, `נאמר ${at.he} — אין חריג`), "", w("said", "נאמר"), noException);
    }
    case "monday-thursday": {
      const longer = table.t[i] === "-" && monThu;
      return out(w("", ""), longer ? "on" : "off", w(longer ? "said" : "not said", longer ? "נאמר" : "אינו נאמר"), longer ? w(`it’s ${name.en}`, name.he) : w("only on Mondays and Thursdays with Tachanun", "רק בשני ובחמישי שאומרים בהם תחנון"));
    }
    case "kaddish-after-tachanun": {
      const code = table.t[i];
      if (code === "S" || code === "Y") return out(notTag(code), "off", w("not in this order", "לא בסדר הזה"), clauseOf(code));
      if (code === "-" || splits(code)) return out(w(`After Tachanun ${at.en}`, `אחרי התחנון ${at.he}`), "", w("after Tachanun", "אחרי התחנון"), w("Tachanun is said", "אומרים תחנון"));
      if (code === "R" || code === "H") return out(w(`After Hallel ${at.en}`, `אחרי ההלל ${at.he}`), "", w("after Hallel, as a Full Kaddish", "אחרי ההלל, כקדיש שלם"), w(`${clauseOf(code).en}: Hallel, and no Tachanun`, `${clauseOf(code).he}: הלל, ואין תחנון`));
      if (code === "C") return out(w(`After Hallel ${at.en}`, `אחרי ההלל ${at.he}`), "", w("after Hallel", "אחרי ההלל"), w("it’s Chanukah: Hallel, and no Tachanun", "חנוכה: הלל, ואין תחנון"));
      return out(w(`After the repetition ${at.en}`, `אחרי החזרה ${at.he}`), "", w("straight after the repetition", "מיד אחרי החזרה"), w(`there is no Tachanun: ${clauseOf(code).en}`, `אין תחנון: ${clauseOf(code).he}`));
    }
    case "torah-weekday": {
      const code = table.r[i];
      if (code === "S" || code === "Y") return out(notTag(code), "off", w("not the weekday reading", "לא הקריאה של חול"), clauseOf(code));
      if (code === "-") return out(w(`Not ${at.en}—only Mon and Thu`, `לא ${at.he} — רק בשני ובחמישי`), "off", w("no Torah reading", "אין קריאת התורה"), w(`it’s ${name.en}; the weekday reading is on Mondays, Thursdays and special days`, `${name.he}; קוראים בשני, בחמישי ובימים מיוחדים`));
      const fast = fastNames[table.f[i]];
      const readings: Record<string, [Words, Words, Words]> = {
        M: [w("3 aliyot", "3 עליות"), w("Torah reading, three aliyot from the coming Shabbat’s portion", "קריאת התורה, שלוש עליות מפרשת השבת הקרובה"), w(`it’s ${name.en}`, name.he)],
        R: [w("Rosh Chodesh, 4 aliyot", "ראש חודש, 4 עליות"), w("the Rosh Chodesh reading, four aliyot", "קריאת ראש חודש, ארבע עליות"), w("it’s Rosh Chodesh", "ראש חודש")],
        C: [w("Chanukah, 3 aliyot", "חנוכה, 3 עליות"), w("the Chanukah reading, three aliyot", "קריאת חנוכה, שלוש עליות"), w("it’s Chanukah", "חנוכה")],
        D: [w("2 scrolls, 4 aliyot", "2 ספרי תורה, 4 עליות"), w("Rosh Chodesh and Chanukah, from two scrolls", "ראש חודש וחנוכה, משני ספרי תורה"), w("Rosh Chodesh falls in Chanukah", "ראש חודש בחנוכה")],
        P: [w("Purim, 3 aliyot", "פורים, 3 עליות"), w("the Purim reading, three aliyot", "קריאת פורים, שלוש עליות"), w("it’s Purim", "פורים")],
        F: [w("fast day, 3 aliyot", "תענית, 3 עליות"), w("the fast-day reading, three aliyot", "קריאת התענית, שלוש עליות"), fast ? w(`it’s ${fast.en}`, fast.he) : w("it’s a fast day", "תענית")],
        A: [w("Tisha B’Av, 3 aliyot", "תשעה באב, 3 עליות"), w("the Tisha B’Av reading, three aliyot", "קריאת תשעה באב, שלוש עליות"), w("it’s Tisha B’Av", "תשעה באב")],
        H: [w("Chol HaMoed, 4 aliyot", "חול המועד, 4 עליות"), w("the Chol HaMoed reading, four aliyot", "קריאת חול המועד, ארבע עליות"), w("it’s Chol HaMoed", "חול המועד")],
      };
      const [tag, verdict, reason] = readings[code];
      return out(w(`${cap(at.en)}: ${tag.en}`, `${at.he}: ${tag.he}`), "on", verdict, reason);
    }
    case "daily-psalms": {
      const k = table.k[i];
      if (k === "S" || k === "Y") return out(notTag(k), "off", w("not this map’s psalms", "לא מזמורי המפה הזו"), clauseOf(k));
      const flags = Number(table.p[i]), n = weekday(day);
      const en = [String(psalmOfDay[n]), flags & 1 && "104", flags & 2 && "27"].filter(Boolean) as string[];
      const he = [psalmOfDayHe[n], flags & 1 && "ק״ד", flags & 2 && "כ״ז"].filter(Boolean) as string[];
      const list = (items: string[], and: string) => items.length > 1 ? `${items.slice(0, -1).join(", ")}${and}${items[items.length - 1]}` : items[0];
      const why = [`it’s ${name.en}`, flags & 1 && "Rosh Chodesh", flags & 2 && "in the season from Elul to Sukkot"].filter(Boolean) as string[];
      const whyHe = [name.he, flags & 1 && "ראש חודש", flags & 2 && "בעונה שמאלול עד סוכות"].filter(Boolean) as string[];
      return out(w("", ""), "", w(`${en.length > 1 ? "Psalms" : "Psalm"} ${list(en, " and ")}`, `תהילים ${list(he, " ו")}`), w(list(why, ", and "), list(whyHe, ", ")));
    }
    case "omer": {
      const n = omerDay(table, iso);
      return n
        ? out(w(`${cap(at.en)}: Omer day ${n}`, `${at.he}: יום ${n} לעומר`), "on", w(`count day ${n} of the Omer`, `סופרים יום ${n} לעומר`), w(n === 49 ? "the last evening before Shavuot" : "the count runs from the second night of Pesach to Shavuot", n === 49 ? "הערב האחרון לפני שבועות" : "סופרים מליל שני של פסח עד שבועות"))
        : out(w(`No Omer count ${at.en}`, `אין ספירת העומר ${at.he}`), "off", w("no Omer count", "אין ספירת העומר"), w("the Omer is counted only from the second night of Pesach to the night before Shavuot", "סופרים את העומר רק מליל שני של פסח עד ערב שבועות"));
    }
    case "tzidkatcha": {
      const code = table.z[i];
      if (splits(code)) return out(w(`Often omitted ${at.en}`, `רבים אינם אומרים ${at.he}`), "", w("said in some synagogues", "נאמרת בחלק מבתי הכנסת"), splitWhy[code]);
      if (code === "-") return out(w(`Said ${at.en}—no exception`, `נאמרת ${at.he} — אין חריג`), "", w("said", "נאמרת"), noException);
      return out(notTag(code), "off", w("not said", "אינה נאמרת"), clauseOf(code, true));
    }
    case "kaddish-after-tzidkatcha": {
      const code = table.z[i];
      if (code === "-" || splits(code)) return out(w(`After Tzidkatcha ${at.en}`, `אחרי צדקתך ${at.he}`), "", w("after Tzidkatcha", "אחרי צדקתך"), w("Tzidkatcha is said", "אומרים צדקתך"));
      if (code === "Y") return out(notTag(code), "off", w("not in this order", "לא בסדר הזה"), clauseOf(code));
      return out(w(`After the repetition ${at.en}`, `אחרי החזרה ${at.he}`), "", w("straight after the repetition", "מיד אחרי החזרה"), w(`Tzidkatcha is not said: ${clauseOf(code, true).en}`, `אין צדקתך: ${clauseOf(code, true).he}`));
    }
  }
  return out(w("", ""), "", w("", ""), w("", ""));
}

/** A note's tag on the map for a date (see judge). */
export const noteStatus = (table: CalendarTable, note: string, iso: string, today: string): Words => judge(table, note, iso, today).tag;

/** A box's verdict as one sentence per language (plain text; the page sets the verdict in bold). */
export const verdictText = (v: Verdict, lang: "en" | "he") => `${v.when[lang]}: ${v.verdict[lang]} — ${v.reason[lang]}.`;

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
 * Fill in every calendar box under `root` for the date `iso` (the reader's today is `today`) and mark
 * every item the date turns on or off: a box ([data-note]) gets its verdict sentence, the verdict in
 * bold; a marked item ([data-mark]) gets data-today="on" or "off" and its tag (.today-mark, if any).
 */
export function fillNotes(table: CalendarTable, root: ParentNode, iso: string, today: string) {
  const key = `${iso}|${today}`;
  const span = (lang: "en" | "he", ...children: Array<Node | string>) => {
    const el = document.createElement("span");
    el.dataset.lang = lang;
    if (lang === "he") el.className = "he";
    el.append(...children);
    return el;
  };
  for (const el of root.querySelectorAll<HTMLElement>("[data-note], [data-mark]")) {
    if (el.dataset.for === key) continue;
    el.dataset.for = key;
    const j = judge(table, el.dataset.note || el.dataset.mark!, iso, today);
    if (el.dataset.note) {
      const sentence = (lang: "en" | "he") => { const b = document.createElement("b"); b.textContent = j.verdict.verdict[lang]; return span(lang, `${j.verdict.when[lang]}: `, b, ` — ${j.verdict.reason[lang]}.`); };
      el.querySelector(".box-verdict")?.replaceChildren(sentence("en"), sentence("he"));
      continue;
    }
    el.querySelector(":scope > button > .today-mark")?.replaceChildren(span("en", j.tag.en), span("he", j.tag.he));
    if (j.mark) el.dataset.today = j.mark; else delete el.dataset.today;
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

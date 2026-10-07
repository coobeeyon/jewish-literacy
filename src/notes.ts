// The date notes' rules, in plain words: each note shows its rule and, under it, what the rule means
// for the date being prayed (src/today.ts). Content marks where a note goes with
// <span class="calendar-note note-<id>"> (content/roadmap.html). The rules follow standard Ashkenaz
// practice outside Israel; the sources are with the codes in scripts/calendar.mjs.
import type { Localized } from "./types";

/** Bootstrap Icons "calendar-event" (the set the people icon comes from), drawn on a 16×16 grid. */
export const calendarIconPaths = [
  "M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5z",
  "M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z",
];

/** The calendar box's header, and the control that shows a rule's full detail. */
export const boxHead = { en: "Depends on the date", he: "תלוי בתאריך" } as const;
export const boxMore = { en: "All the days", he: "כל הימים" } as const;

/**
 * Each calendar box's rule in one short line, read at a glance. Where the full rule (noteRules)
 * says more, the box offers it behind "All the days"; where it does not, the summary is the rule.
 */
export const noteSummaries: Record<string, Localized> = {
  "tachanun-shacharit": { en: "Skipped on Shabbat, Rosh Chodesh and other festive days.", he: "אינו נאמר בשבת, בראש חודש ובשאר ימי חג." },
  "tachanun-mincha": { en: "Skipped on Shabbat, Rosh Chodesh and festive days, and the afternoon before many.", he: "אינו נאמר בשבת, בראש חודש ובימי חג, ובמנחה שלפני רבים מהם." },
  "kaddish-after-tachanun": { en: "After Tachanun; without it, after the repetition or after Hallel.", he: "אחרי התחנון; בלעדיו, אחרי החזרה או אחרי ההלל." },
  "torah-weekday": { en: "Read Mondays and Thursdays, and on Rosh Chodesh, fasts and festive days.", he: "קוראים בשני ובחמישי, ובראש חודש, בתעניות ובימי חג." },
  "daily-psalms": { en: "A psalm for each day; more on Rosh Chodesh and from Elul to Sukkot.", he: "מזמור לכל יום; ועוד בראש חודש ומאלול עד סוכות." },
  omer: { en: "Counted each evening for 49 days, from the second night of Pesach to Shavuot.", he: "סופרים בכל ערב 49 ימים, מליל שני של פסח עד שבועות." },
  tzidkatcha: { en: "Skipped on Rosh Chodesh and festive days, and when the next day is one.", he: "אינה נאמרת בראש חודש ובימי חג, וכשלמחרת יום כזה." },
  "kaddish-after-tzidkatcha": { en: "After Tzidkatcha, or straight after the repetition when it is not said.", he: "אחרי צדקתך, או מיד אחרי החזרה כשאינה נאמרת." },
};

/** Each calendar box's full rule, naming every day ("All the days"); a box whose summary is the whole rule has none. */
export const noteRules: Record<string, Localized> = {
  // SA OC 131:4-7 with the Rema and MB; 429:2; 493:2; 494:3; 559:4; 581:3; 604:2; 697:1 (Rema).
  "tachanun-shacharit": {
    en: "Tachanun is said on weekday mornings, in a longer form on Mondays and Thursdays. It is not said on Shabbat, festivals, Rosh Chodesh, Chanukah, Purim, Shushan Purim, Purim Katan, Tu BiShvat, Tu B’Av, Tisha B’Av, Pesach Sheni or Lag BaOmer; in all of Nisan; in Sivan through the day after Shavuot; on Erev Rosh Hashanah; or from Erev Yom Kippur through the day after Sukkot. Nor is it said in a house of mourning, with a groom, or at a brit. Many also omit it until 12 Sivan and on Yom HaAtzmaut and Yom Yerushalayim.",
    he: "תחנון נאמר בבוקר בימי חול, ובשני ובחמישי בנוסח ארוך. אינו נאמר בשבת, ביום טוב, בראש חודש, בחנוכה, בפורים, בשושן פורים, בפורים קטן, בט״ו בשבט, בט״ו באב, בתשעה באב, בפסח שני ובל״ג בעומר; בכל חודש ניסן; בסיוון עד אחרי שבועות; בערב ראש השנה; ומערב יום כיפור עד אחרי סוכות. גם אינו נאמר בבית אבל, עם חתן או בברית. רבים אינם אומרים אותו גם עד י״ב בסיוון וביום העצמאות וביום ירושלים.",
  },
  // MB 131:33, 131:35; Rema 131:6; MB 493:9; SA 552:12; Koren's Mincha rubric (Friday, festival eves).
  "tachanun-mincha": {
    en: "Tachanun is not said at Mincha on Shabbat, festivals, Rosh Chodesh, Chanukah, Purim, Shushan Purim, Purim Katan, Tu BiShvat, Tu B’Av, Tisha B’Av, Pesach Sheni or Lag BaOmer; in all of Nisan; in Sivan through the day after Shavuot; on Erev Rosh Hashanah; or from Erev Yom Kippur through the day after Sukkot. Nor is it said on the afternoon before Rosh Chodesh, Chanukah, Purim, Purim Katan, Tu BiShvat, Tu B’Av, Tisha B’Av or Lag BaOmer, on Friday afternoon, or on the eve of a festival.",
    he: "תחנון אינו נאמר במנחה בשבת, ביום טוב, בראש חודש, בחנוכה, בפורים, בשושן פורים, בפורים קטן, בט״ו בשבט, בט״ו באב, בתשעה באב, בפסח שני ובל״ג בעומר; בכל חודש ניסן; בסיוון עד אחרי שבועות; בערב ראש השנה; ומערב יום כיפור עד אחרי סוכות. גם אינו נאמר במנחה שלפני ראש חודש, חנוכה, פורים, פורים קטן, ט״ו בשבט, ט״ו באב, תשעה באב ול״ג בעומר, ביום שישי אחר הצהריים, ובערב יום טוב.",
  },
  // Koren's rubrics after the repetition and after Hallel.
  "kaddish-after-tachanun": {
    en: "This Half Kaddish follows Tachanun. When Tachanun is not said, it comes straight after the leader’s repetition; on days with Hallel it comes after Hallel, and on Rosh Chodesh and Chol HaMoed it is a Full Kaddish.",
    he: "חצי קדיש זה נאמר אחרי התחנון. כשאין תחנון, הוא נאמר מיד אחרי חזרת הש״ץ; בימים שאומרים הלל — אחרי ההלל, ובראש חודש ובחול המועד כקדיש שלם.",
  },
  // SA OC 135:1-2; 423:1-2; 559:4 (Rema); 566:1; 663:1; 684:1, 3; 693:4.
  "torah-weekday": {
    en: "The Torah is read on Monday and Thursday mornings: three aliyot from the coming Shabbat’s portion. Rosh Chodesh (four aliyot), Chanukah, Purim, public fast days, Tisha B’Av and Chol HaMoed (four) have readings of their own, whatever the weekday; Rosh Chodesh in Chanukah reads from two scrolls.",
    he: "קוראים בתורה בבוקר ימי שני וחמישי: שלוש עליות מפרשת השבת הקרובה. לראש חודש (ארבע עליות), חנוכה, פורים, תעניות ציבור, תשעה באב וחול המועד (ארבע) יש קריאות משלהם בכל יום בשבוע; בראש חודש שבחנוכה קוראים בשני ספרי תורה.",
  },
  // Mishnah Tamid 7:4; SA OC 423:3; MB 581:2.
  "daily-psalms": {
    en: "Each weekday has its own psalm: Sunday 24, Monday 48, Tuesday 82, Wednesday 94, Thursday 81, Friday 93. Psalm 104 is added on Rosh Chodesh, and Psalm 27 from 1 Elul through Sukkot.",
    he: "לכל יום בשבוע מזמור משלו: ראשון כ״ד, שני מ״ח, שלישי פ״ב, רביעי צ״ד, חמישי פ״א, שישי צ״ג. בראש חודש מוסיפים את תהילים ק״ד, ומא׳ באלול עד אחרי סוכות את תהילים כ״ז.",
  },
  // SA OC 292:2; MB 292:7. (The Omer, SA OC 489:1, and the Kaddish after Tzidkatcha: their summary is the whole rule.)
  tzidkatcha: {
    en: "Tzidkatcha is said at Shabbat Mincha, except when that Shabbat is Rosh Chodesh, in Chanukah, in Nisan, in Sivan through the day after Shavuot, between Yom Kippur and the end of Sukkot, or on Tu BiShvat, Tu B’Av, Purim Katan, Pesach Sheni or Lag BaOmer; and except when the next day is Rosh Chodesh, Chanukah, Purim Katan, Tu BiShvat, Tu B’Av, Lag BaOmer or a festival.",
    he: "צדקתך נאמרת במנחה של שבת, חוץ משבת שהיא ראש חודש, בחנוכה, בניסן, בסיוון עד אחרי שבועות, בין יום כיפור לסוף סוכות, או בט״ו בשבט, בט״ו באב, בפורים קטן, בפסח שני ובל״ג בעומר; וחוץ משבת שלמחרתה ראש חודש, חנוכה, פורים קטן, ט״ו בשבט, ט״ו באב, ל״ג בעומר או יום טוב.",
  },
};

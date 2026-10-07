// The date notes' rules, in plain words: each note shows its rule and, under it, what the rule means
// for the date being prayed (src/today.ts). Content marks where a note goes with
// <span class="calendar-note note-<id>"> (content/roadmap.html). The rules follow standard Ashkenaz
// practice outside Israel; the sources are with the codes in scripts/calendar.mjs.
import type { Localized } from "./types";

export const noteRules: Record<string, Localized> = {
  // SA OC 131:4-7 with the Rema and MB; 429:2; 493:2; 494:3; 559:4; 581:3; 604:2; 697:1 (Rema).
  "tachanun-shacharit": {
    en: "Not said on Shabbat and festivals, Rosh Chodesh, Chanukah, Purim, Tu BiShvat, Tu B’Av, Tisha B’Av, Pesach Sheni, Lag BaOmer, all of Nisan, Sivan through the day after Shavuot, Erev Rosh Hashanah, or from Erev Yom Kippur through Sukkot; nor in a house of mourning, with a groom, or at a brit. Said in a longer form on Mondays and Thursdays. Customs vary, notably to 12 Sivan and on Yom HaAtzmaut and Yom Yerushalayim.",
    he: "אינו נאמר בשבת וביום טוב, בראש חודש, בחנוכה, בפורים, בט״ו בשבט ובט״ו באב, בתשעה באב, בפסח שני, בל״ג בעומר, בכל חודש ניסן, בסיוון עד אחרי שבועות, בערב ראש השנה, ומערב יום כיפור עד אחרי סוכות; וגם לא בבית אבל, עם חתן או בברית. בשני ובחמישי נאמר בנוסח ארוך. המנהגים משתנים, בעיקר עד י״ב בסיוון וביום העצמאות וביום ירושלים.",
  },
  // MB 131:33, 131:35; Rema 131:6; MB 493:9; SA 552:12; Koren's Mincha rubric (Friday, festival eves).
  "tachanun-mincha": {
    en: "Not said on the days it is left out in the morning, nor in the afternoon before most of them (“Erev”: Rosh Chodesh, Chanukah, Purim, Tu BiShvat, Tu B’Av, Tisha B’Av, Lag BaOmer), nor on Friday afternoon or the eve of a festival. Customs vary.",
    he: "אינו נאמר בימים שאין אומרים אותו בבוקר, ולא במנחה שלפני רובם (בערב ראש חודש, חנוכה, פורים, ט״ו בשבט, ט״ו באב, תשעה באב, ל״ג בעומר), ולא בערב שבת או בערב יום טוב. המנהגים משתנים.",
  },
  // Koren's rubrics after the repetition and after Hallel.
  "kaddish-after-tachanun": {
    en: "After Tachanun. Without Tachanun it follows the leader’s repetition, or Hallel on days that have it (on Rosh Chodesh and Chol HaMoed, as a Full Kaddish).",
    he: "אחרי התחנון. כשאין תחנון — מיד אחרי חזרת הש״ץ, או אחרי ההלל בימים שאומרים בהם הלל (בראש חודש ובחול המועד — כקדיש שלם).",
  },
  // SA OC 135:1-2; 423:1-2; 559:4 (Rema); 566:1; 663:1; 684:1, 3; 693:4.
  "torah-weekday": {
    en: "Monday and Thursday mornings: three aliyot from the coming Shabbat’s portion. Rosh Chodesh (four aliyot), Chanukah, Purim, fast days, Tisha B’Av and Chol HaMoed (four) have readings of their own; Rosh Chodesh in Chanukah reads from two Torah scrolls.",
    he: "בבוקר ימי שני וחמישי: שלוש עליות מפרשת השבת הקרובה. לראש חודש (ארבע עליות), חנוכה, פורים, תעניות, תשעה באב וחול המועד (ארבע) יש קריאות משלהם; בראש חודש שבחנוכה קוראים בשני ספרי תורה.",
  },
  // Mishnah Tamid 7:4; SA OC 423:3; MB 581:2.
  "daily-psalms": {
    en: "A psalm for each day of the week. Psalm 104 is added on Rosh Chodesh, and Psalm 27 from 1 Elul through Sukkot.",
    he: "מזמור לכל יום בשבוע. בראש חודש מוסיפים את תהילים ק״ד, ומא׳ באלול עד אחרי סוכות את תהילים כ״ז.",
  },
  // SA OC 489:1.
  omer: {
    en: "Counted each evening from the second night of Pesach to the night before Shavuot: 49 days. The evening begins the next Hebrew day, so the count is that day’s.",
    he: "סופרים בכל ערב מליל שני של פסח עד ערב שבועות: 49 ימים. הערב פותח את היום העברי הבא.",
  },
  // SA OC 292:2; MB 292:7.
  tzidkatcha: {
    en: "Said at Shabbat Mincha, except when Tachanun would be left out at a weekday Mincha: on Rosh Chodesh or the day before it, in Chanukah or Nisan, and the like.",
    he: "נאמרת במנחה של שבת, חוץ מימים שבהם לא היו אומרים תחנון במנחה של חול: בראש חודש או בערבו, בחנוכה, בניסן וכדומה.",
  },
  "kaddish-after-tzidkatcha": {
    en: "After Tzidkatcha; straight after the leader’s repetition when it is not said.",
    he: "אחרי צדקתך; כשאינה נאמרת — מיד אחרי חזרת הש״ץ.",
  },
};

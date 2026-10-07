// The date notes' rules, in plain words: each note shows its rule and, under it, what the rule means
// for the date being prayed (src/today.ts). Content marks where a note goes with
// <span class="calendar-note note-<id>"> (content/roadmap.html). The rules follow standard Ashkenaz
// practice outside Israel; the sources are with the codes in scripts/calendar.mjs.
import type { Localized } from "./types";

export const noteRules: Record<string, Localized> = {
  // SA OC 131:4-7 with the Rema and MB; 429:2; 493:2; 494:3; 559:4; 581:3; 604:2; 697:1 (Rema).
  "tachanun-shacharit": {
    en: "Longer on Mondays and Thursdays. Not said on Shabbat, festivals, Rosh Chodesh, Chanukah, Purim, Tu BiShvat, Tu B’Av, Tisha B’Av, Pesach Sheni, Lag BaOmer, in Nisan, in Sivan until after Shavuot, on Erev Rosh Hashanah, or from Erev Yom Kippur through Sukkot; nor in a house of mourning, with a groom or at a brit. Many also omit it to 12 Sivan and on Yom HaAtzmaut and Yom Yerushalayim.",
    he: "בשני ובחמישי ארוך יותר. אינו נאמר בשבת, ביום טוב, בראש חודש, בחנוכה, בפורים, בט״ו בשבט ובט״ו באב, בתשעה באב, בפסח שני, בל״ג בעומר, בניסן, בסיוון עד אחרי שבועות, בערב ראש השנה, ומערב יום כיפור עד אחרי סוכות; וגם לא בבית אבל, עם חתן או בברית. רבים אינם אומרים אותו גם עד י״ב בסיוון וביום העצמאות וביום ירושלים.",
  },
  // MB 131:33, 131:35; Rema 131:6; MB 493:9; SA 552:12; Koren's Mincha rubric (Friday, festival eves).
  "tachanun-mincha": {
    en: "Not said on the days it is left out in the morning, nor on the afternoon before most of them, nor on Friday afternoon or the eve of a festival.",
    he: "אינו נאמר בימים שאין אומרים אותו בבוקר, ולא במנחה שלפני רובם, ולא בערב שבת או בערב יום טוב.",
  },
  // Koren's rubrics after the repetition and after Hallel.
  "kaddish-after-tachanun": {
    en: "After Tachanun; without it, straight after the repetition, or after Hallel on days with Hallel (a Full Kaddish on Rosh Chodesh and Chol HaMoed).",
    he: "אחרי התחנון; בלעדיו, מיד אחרי החזרה, או אחרי ההלל בימים שאומרים הלל (בראש חודש ובחול המועד — קדיש שלם).",
  },
  // SA OC 135:1-2; 423:1-2; 559:4 (Rema); 566:1; 663:1; 684:1, 3; 693:4.
  "torah-weekday": {
    en: "Monday and Thursday mornings: three aliyot from the coming Shabbat’s portion. Rosh Chodesh, Chanukah, Purim, fast days and Chol HaMoed have readings of their own.",
    he: "בבוקר ימי שני וחמישי: שלוש עליות מפרשת השבת הקרובה. לראש חודש, חנוכה, פורים, תעניות וחול המועד יש קריאות משלהם.",
  },
  // Mishnah Tamid 7:4; SA OC 423:3; MB 581:2.
  "daily-psalms": {
    en: "A psalm for each day of the week; Psalm 104 on Rosh Chodesh, and Psalm 27 from 1 Elul through Sukkot.",
    he: "מזמור לכל יום בשבוע; תהילים ק״ד בראש חודש, ותהילים כ״ז מא׳ באלול עד אחרי סוכות.",
  },
  // SA OC 489:1.
  omer: {
    en: "Counted each evening from the second night of Pesach to the night before Shavuot.",
    he: "סופרים בכל ערב מליל שני של פסח עד ערב שבועות.",
  },
  // SA OC 292:2; MB 292:7.
  tzidkatcha: {
    en: "Said at Shabbat Mincha, unless Tachanun would be left out at a weekday Mincha that day.",
    he: "נאמרת במנחה של שבת, אלא אם לא היו אומרים תחנון במנחה של חול באותו יום.",
  },
  "kaddish-after-tzidkatcha": {
    en: "After Tzidkatcha, or straight after the repetition when it is not said.",
    he: "אחרי צדקתך, או מיד אחרי החזרה כשאינה נאמרת.",
  },
};

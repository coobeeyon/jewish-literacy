// Human-curated map from every service-map card to the Sefaria texts it shows.
// `pin-sefaria.mjs` resolves this against the live API and writes the pinned
// plan to scripts/sefaria-pins.json; extract-corpus.mjs merges that into the corpus.
//
// Each card lists, per nusach, its *parts* in prayer order. A part is one entry of the card's
// breakdown (the chips / Amidah blessings shown when the card opens): `toc` names the breakdown
// entries that link to it (the chip's English text, or "amidah:N" for Amidah blessings), and
// extract-corpus.mjs fails the build if any visible entry has no part or any part has no entry.
// Cards without a breakdown have a single part.
//
// Section options (a part holds one or more sections):
//   from:  first segment (1-based number, or a Hebrew incipit searched without vowels;
//          an array is a chain: each incipit is searched after the previous one)
//   until: first segment NOT included (same rules, searched after `from`)
//   skip:  [[from, until], ...] ranges to leave out (same rules)
//   dropHeading: start after the siddur's own heading line when `from` lands on one
//   note:  [English, Hebrew] note shown after the section, in place of prayers left out
//   omits: the section leaves out prayers the edition prints there; the credit line says so
// Segments whose Hebrew is unpointed or empty are treated as rubrics (kept when short
// stage directions) or editorial notes (dropped); see pin-sefaria.mjs.

export const editions = {
  "metsudah-ashkenaz": {
    layout: "block",
    he: "The Metsudah siddur, 1981",
    en: "Translation based on the Metsudah linear siddur, by Avrohom Davis, 1981",
    cite: { en: "Metsudah Siddur (Nusach Ashkenaz), 1981; English translation by Avrohom Davis", he: "סידור מצודה (נוסח אשכנז), 1981; תרגום לאנגלית: אברהם דייוויס" },
    sourceLabel: { en: "National Library of Israel", he: "הספרייה הלאומית לישראל" },
  },
  "metsudah-sefard-weekday": {
    layout: "linear",
    he: "The Metsudah siddur: a new linear siddur with English translation by Avrohom Davis, 1981",
    en: "The Metsudah siddur: a new linear siddur with English translation by Avrohom Davis, 1981 [en]",
    cite: { en: "Metsudah Linear Siddur (Nusach Sefard, weekday), 1981; English translation by Avrohom Davis", he: "סידור מצודה המילולי (נוסח ספרד, חול), 1981; תרגום לאנגלית: אברהם דייוויס" },
    sourceLabel: { en: "National Library of Israel", he: "הספרייה הלאומית לישראל" },
  },
  "metsudah-sefard-shabbat": {
    layout: "linear",
    he: "The Metsudah Siddur, Metsudah Publications, 1981 - HE",
    en: "The Metsudah Siddur, Metsudah Publications, 1981 - EN",
    cite: { en: "Metsudah Linear Siddur (Nusach Sefard, Shabbat), 1981", he: "סידור מצודה המילולי (נוסח ספרד, שבת), 1981" },
    sourceLabel: { en: "National Library of Israel", he: "הספרייה הלאומית לישראל" },
  },
  "koren-ashkenaz": {
    layout: "block",
    he: "Hebrew Edition; Koren Publishers Jerusalem, 2017",
    en: "English Edition; Koren Publishers Jerusalem, 2017",
    cite: { en: "The Koren Shalem Siddur (Ashkenaz), Koren Publishers Jerusalem, 2017", he: "סידור קורן השלם (אשכנז), הוצאת קורן ירושלים, 2017" },
    sourceLabel: { en: "Koren Publishers", he: "הוצאת קורן" },
  },
  "tanakh": {
    layout: "block",
    he: "Tanach with Nikkud",
    en: "The Holy Scriptures: A New Translation (JPS 1917)",
    cite: { en: "Tanach with Nikkud (tanach.us); The Holy Scriptures, JPS 1917", he: "תנ״ך מנוקד (tanach.us); תרגום JPS משנת 1917" },
    sourceLabel: { en: "tanach.us and Open Siddur", he: "tanach.us ו־Open Siddur" },
  },
};

// Licenses we accept (the project is non-commercial, so CC BY-NC is fine).
export const acceptedLicenses = ["Public Domain", "CC0", "CC-BY", "CC-BY-SA", "CC-BY-NC"];

const s = (ed, ref, opts = {}) => ({ ed, ref, ...opts });
const part = (toc, sections, h) => ({ toc: [].concat(toc || []), sections: [].concat(sections), ...(h ? { h } : {}) });
const one = (...sections) => [part([], sections)];

const KO = "koren-ashkenaz", MW = "metsudah-sefard-weekday", MS = "metsudah-sefard-shabbat", TN = "tanakh";
const KW = "The Koren Shalem Siddur; Ashkenaz, Weekdays, ";
const KS = "The Koren Shalem Siddur; Ashkenaz, Shabbat, ";
const SW = "Weekday Siddur Sefard Linear, ";
const SWM = SW + "The Morning Prayers, ";
const SS = "Shabbat Siddur Sefard Linear, ";
const SSM = SS + "The Morning Prayers, ";
const KMIN = KW + "Minha for Weekdays", KMAA = KW + "Ma'ariv for Weekdays", KCON = KW + "Conclusion of the Service";
const KSMA = KS + "Ma'ariv for Shabbat and Yom Tov", KSMU = KS + "Musaf for Shabbat", KSMI = KS + "Minha for Shabbat and Yom Tov";

// ───────────── Amidah: one part per blessing, split at the siddur's own blessing headings ─────────────
const weekdayLabels = [
  ["Ancestors — Avot", "אבות — אבות"], ["Divine might — Gevurot", "גבורות — גבורות"], ["God’s holiness — Kedushat Hashem", "קדושת השם — קדושת השם"],
  ["Knowledge — Atah Chonen", "דעת — אתה חונן"], ["Return — Hashiveinu", "תשובה — השיבנו"], ["Forgiveness — Selach Lanu", "סליחה — סלח לנו"],
  ["Redemption — Re’eh Na", "גאולה — ראה נא"], ["Healing — Refa’einu", "רפואה — רפאנו"], ["Sustenance and the year — Barekh Aleinu / Barekheinu", "ברכת השנים — ברך עלינו / ברכנו"],
  ["Gathering the exiles — Teka B’Shofar", "קיבוץ גלויות — תקע בשופר"], ["Justice — Hashivah Shofteinu", "משפט — השיבה שופטינו"], ["Against destructive wickedness — V’lamalshinim", "ברכת המינים — ולמלשינים"],
  ["The righteous — Al HaTzadikim", "על הצדיקים — על הצדיקים"], ["Rebuilding Jerusalem — V’liYerushalayim", "בניין ירושלים — ולירושלים"], ["Davidic redemption — Et Tzemach David", "מלכות בית דוד — את צמח דוד"],
  ["Hear our prayer — Shema Koleinu", "שומע תפילה — שמע קולנו"], ["Restore worship — Retzeh", "עבודה — רצה"], ["Thanksgiving — Modim", "הודאה — מודים"], ["Peace — Sim Shalom", "שלום — שים שלום"],
];
const shabbatMiddle = {
  maariv: ["Sanctity of the day — Atah Kidashta", "קדושת היום — אתה קידשת"],
  shacharit: ["Sanctity of the day — Yismach Moshe", "קדושת היום — ישמח משה"],
  musaf: ["Sanctity of the day and Shabbat’s additional offering — Tikanta Shabbat", "קדושת היום וקרבן מוסף של שבת — תכנת שבת"],
  mincha: ["Sanctity of the day — Atah Echad", "קדושת היום — אתה אחד"],
};
const shabbatLabels = variant => [weekdayLabels[0], weekdayLabels[1], weekdayLabels[2], shabbatMiddle[variant], weekdayLabels[16], weekdayLabels[17], ["Peace blessing", "ברכת השלום"]];
const extraLabels = {
  kedushah: ["Kedushah (in the repetition, in place of God’s holiness)", "קדושה (בחזרת הש״ץ, במקום קדושת השם)"],
  kohanim: ["Priestly blessing — said by the prayer leader", "ברכת כהנים — בפי שליח הציבור"],
  conclusion: ["Personal conclusion — Elohai Netzor and steps back", "סיום אישי — אלהי נצור ופסיעות לאחור"],
};

// rows: [tocId, heading anchor, label] in prayer order. Part k runs from row k's heading (the
// heading line itself is dropped; our label replaces it) to row k+1's heading. `start` anchors the
// search inside long leaves; `lead` is where the first part starts when text precedes its heading.
function amidah(ed, ref, { start, lead, end, skip = [] }, rows) {
  const at = k => [...(start !== undefined ? [start] : []), ...rows.slice(0, k + 1).map(r => r[1])];
  return rows.map(([id, , label], k) => {
    const sections = [];
    if (k === 0 && lead !== undefined) sections.push(s(ed, ref, { from: lead, until: at(0), skip }));
    sections.push(s(ed, ref, { from: at(k), until: k + 1 < rows.length ? at(k + 1) : end, dropHeading: true, skip }));
    return part(id, sections, label);
  });
}
const weekdayRows = (anchors, { repetition, kohanim = repetition }) => {
  const rows = anchors.slice(0, 19).map((anchor, i) => [`amidah:${i + 1}`, anchor, i === 2 && repetition ? extraLabels.kedushah : weekdayLabels[i]]);
  if (kohanim) rows.splice(18, 0, ["amidah:kohanim", anchors[19], extraLabels.kohanim]);
  if (!repetition) rows.push(["amidah:conclusion", anchors[20], extraLabels.conclusion]);
  return rows;
};
const shabbatRows = (anchors, variant, { repetition }) => {
  const labels = shabbatLabels(variant);
  const rows = anchors.slice(0, 7).map((anchor, i) => [`amidah:${i + 1}`, anchor, i === 2 && repetition ? extraLabels.kedushah : labels[i]]);
  if (!repetition) rows.push(["amidah:conclusion", anchors[7], extraLabels.conclusion]);
  return rows;
};
// Koren (Ashkenaz) weekday blessing headings; [2] is Kedushat Hashem or Kedushah, [14] varies by service.
const korenWeekday = (third, david) => ["אבות", "גבורות", third, "דעת", "תשובה", "סליחה", "גאולה", "רפואה", "ברכת השנים", "קבוץ גלויות", "השבת המשפט", "ברכת המינים", "על הצדיקים", "בניין ירושלים", david, "שומע תפילה", "עבודה", "הודאה", "ברכת שלום", "אלהינו ואלהי אבותינו ברכנו", "יהיו לרצון"];
const metsudahWeekday = third => ["אבות", "גבורות", third, "בינה", "תשובה", "סליחה", "גאולה", "רפואה", "ברכת השנים", "קיבוץ גליות", "דין", "ברכת המינים", "צדיקים", "בנין ירושלים", "מלכות בית דוד", "קבלת תפלה", "עבודה", "הודאה", "שלום", "ברכת כהנים", "אלהי נצור"];
const korenShabbat = third => ["אבות", "גבורות", third, "קדושת היום", "עבודה", "הודאה", "ברכת שלום", "יהיו לרצון"];
const metsudahShabbat = (third, middle) => ["אבות", "גבורות", third, middle, "עבודה", "הודאה", "שלום", "אלהי נצור"];
// Koren leaves: skip ranges anchored after the Amidah's start.
const korenSkips = start => ({
  kedushah: [[start, "קדושה"], [start, "קדושה", "קדושת השם"]],
  holinessWeekday: [[start, "קדושת השם"], [start, "קדושת השם", "דעת"]],
  holinessShabbat: [[start, "קדושת השם"], [start, "קדושת השם", "קדושת היום"]],
  modimDerabbanan: [[start, "הודאה", "מודים", "מודים"], [start, "הודאה", "מודים", "מודים", "בחנוכה"]],
  kohanim: [[start, "אלהינו ואלהי אבותינו ברכנו"], [start, "אלהינו ואלהי אבותינו ברכנו", "ברכת שלום"]],
});

// After the Shabbat morning Torah reading, congregations add prayers for the needs of the time. The
// site shows Yekum Purkan and the Mi Sheberach for the congregation and, in place of the rest, this
// note. Left out: the prayers for a particular country's government (Koren's American and Canadian
// ones, Metsudah's for the President of the United States) and Koren's prayers for present-day armed
// forces and the modern state ("Prayer for the Welfare of the Government", "Prayer for the State of
// Israel", "Prayer for Israel's Defense Forces"). The credit line says prayers are omitted (`omits`).
// Mike, October 8, 2026 (lb-ict1).
const occasionalPrayers = [
  "Here many congregations add prayers for the needs of the time. You might hear, for example, a prayer for the local government, a prayer for peace, a prayer for those who are ill, or a prayer for the community. Which prayers are said varies by community.",
  "כאן קהילות רבות מוסיפות תפילות לצורכי השעה. אפשר לשמוע למשל תפילה לשלום המלכות, תפילה לשלום, תפילה לרפואת החולים או תפילה לשלום הקהילה. התפילות הנאמרות משתנות מקהילה לקהילה.",
];

export const cards = {
  // ───────────── Weekday Shacharit ─────────────
  "weekday/shacharit/opening-blessings": {
    ashkenaz: [
      part("Modeh Ani", s(KO, KW + "On Waking", { until: 4 })),
      part("Washing and bodily blessings", s(KO, KW + "On Waking", { from: 4 }), ["Washing, bodily blessings and tzitzit", "נטילת ידיים, ברכות הגוף וציצית"]),
      part("Torah blessings and study", s(KO, KW + "Blessings Over the Torah")),
      part("Tallit and tefillin", ["Tallit", "Tefillin", "Preparation for Prayer", "Morning Blessings"].map(l => s(KO, KW + l)), ["Tallit, tefillin, Ma Tovu and the morning blessings", "טלית, תפילין, מה טובו וברכות השחר"]),
      part("Korbanot", ["The Binding of Isaac", "Accepting the Sovereignty of Heaven", "Offerings", "The Interpretive Principles of Rabbi Yishmael"].map(l => s(KO, KW + l)), ["The binding of Isaac, accepting Heaven’s sovereignty and Korbanot", "עקדה, קבלת עול מלכות שמים וקרבנות"]),
    ],
    sefard: [
      part("Modeh Ani", s(MW, SWM + "Upon Arising in the Morning", { until: 6 })),
      part("Washing and bodily blessings", s(MW, SWM + "Upon Arising in the Morning", { from: 6 }), ["Washing the hands and tzitzit", "נטילת ידיים וציצית"]),
      part("Tallit and tefillin", ["Putting On the Tallis", "Putting on the Tefillin", "Ma Tovu", "Adon Olam", "Yigdal", "Blessings Upon Arising"].map(l => s(MW, SWM + l)), ["Tallit, tefillin, Ma Tovu and the bodily blessings", "טלית, תפילין, מה טובו וברכות הגוף"]),
      part("Torah blessings and study", ["Blessings of the Torah", "Morning Blessings"].map(l => s(MW, SWM + l)), ["Torah blessings and the morning blessings", "ברכות התורה וברכות השחר"]),
      part("Korbanot", ["Akeidah (The Binding of Isaac)", "Morning Supplications", "Korbanos (Sacrificial Offerings)", "Korban Tamid (Daily Offering)", "Ketores (Incense Offering)"].map(l => s(MW, SWM + l)), ["The binding of Isaac, accepting Heaven’s sovereignty and Korbanot", "עקדה, קבלת עול מלכות שמים וקרבנות"]),
    ],
  },
  "weekday/shacharit/rabbis-kaddish": { ashkenaz: one(s(KO, KW + "The Rabbis' Kaddish", { until: 9 })), sefard: one(s(MW, SWM + "Kaddish d'Rabanan")) },
  "weekday/shacharit/pesukei-dzimra": {
    ashkenaz: [
      part("Barukh She’amar", s(KO, KW + "Pesukei DeZimra", { until: 6 })),
      part("Hodu", s(KO, KW + "Pesukei DeZimra", { from: 6, until: 14 }), ["Hodu, Psalm 100 and Yehi Khevod", "הודו, מזמור לתודה ויהי כבוד"]),
      part("Ashrei and Hallelujah psalms", s(KO, KW + "Pesukei DeZimra", { from: 14, until: 26 }), ["Ashrei, the Hallelujah psalms and Vayevarekh David", "אשרי, מזמורי הללויה ויברך דוד"]),
      part("Song at the Sea", s(KO, KW + "Pesukei DeZimra", { from: 26, until: 32 })),
      part("Yishtabach", s(KO, KW + "Pesukei DeZimra", { from: 32, until: 33 })),
    ],
    sefard: [
      part("Hodu", ["Hodu", "Mizmor Shir"].map(l => s(MW, SWM + l)), ["Hodu, Psalm 30 and Psalm 67", "הודו, מזמור שיר חנוכת הבית ולמנצח בנגינות"]),
      part("Barukh She’amar", ["Baruch She'amar", "Mizmor Lesodah", "Yehi Chevod"].map(l => s(MW, SWM + l)), ["Barukh She’amar, Psalm 100 and Yehi Khevod", "ברוך שאמר, מזמור לתודה ויהי כבוד"]),
      part("Ashrei and Hallelujah psalms", s(MW, SWM + "Ashrei"), ["Ashrei, the Hallelujah psalms and Vayevarekh David", "אשרי, מזמורי הללויה ויברך דוד"]),
      part("Song at the Sea", s(MW, SWM + "Shiras Hayam")),
      part("Yishtabach", s(MW, SWM + "Yishtabach", { until: 29 })),
    ],
  },
  "weekday/shacharit/half-kaddish": { ashkenaz: one(s(KO, KW + "Pesukei DeZimra", { from: 35, until: 39, dropHeading: true })), sefard: one(s(MW, SWM + "Yishtabach", { from: 53 })) },
  "weekday/shacharit/barkhu-call-to-prayer": { ashkenaz: one(s(KO, KW + "Blessings of the Shema", { until: 5 })), sefard: one(s(MW, SWM + "The Blessings of Shema", { from: 3, until: 8 })) },
  "weekday/shacharit/shema-and-its-blessings": {
    ashkenaz: [
      part("First blessing before — Yotzer Or", s(KO, KW + "Blessings of the Shema", { from: 5, until: 17 })),
      part("Second blessing before — Ahavah Rabbah", s(KO, KW + "Blessings of the Shema", { from: 17, until: 20 })),
      part("Shema Yisrael", s(KO, KW + "Blessings of the Shema", { from: 20, until: 25 })),
      part("First paragraph — Ve’ahavta", s(KO, KW + "Blessings of the Shema", { from: 25, until: 27 })),
      part("Second paragraph — Vehayah im shamoa", s(KO, KW + "Blessings of the Shema", { from: 27, until: 29 })),
      part("Third paragraph — Vayomer", s(KO, KW + "Blessings of the Shema", { from: 29, until: 31 })),
      part("Blessing after — Emet Veyatziv and redemption", s(KO, KW + "Blessings of the Shema", { from: 31 })),
    ],
    sefard: [
      part("First blessing before — Yotzer Or", s(MW, SWM + "The Blessings of Shema", { from: 8, until: "אהבת עולם" })),
      part("Second blessing before — Ahavat Olam", s(MW, SWM + "The Blessings of Shema", { from: "אהבת עולם" })),
      part("Shema Yisrael", s(MW, SWM + "Recitation of Shema", { until: "ואהבת" })),
      part("First paragraph — Ve’ahavta", s(MW, SWM + "Recitation of Shema", { from: "ואהבת", until: ["ואהבת", "והיה"] })),
      part("Second paragraph — Vehayah im shamoa", s(MW, SWM + "Recitation of Shema", { from: ["ואהבת", "והיה"], until: ["ואהבת", "והיה", "ויאמר"] })),
      part("Third paragraph — Vayomer", s(MW, SWM + "Recitation of Shema", { from: ["ואהבת", "והיה", "ויאמר"], until: 103 })),
      part("Blessing after — Emet Veyatziv and redemption", s(MW, SWM + "Recitation of Shema", { from: 103, until: 218 })),
    ],
  },
  "weekday/shacharit/silent-shemoneh-esrei": {
    ashkenaz: amidah(KO, KW + "The Amida", { lead: 1, end: 82, skip: pairs(korenSkips(1), ["kedushah", "modimDerabbanan", "kohanim"]) }, weekdayRows(korenWeekday("קדושת השם", "מלכות בן דוד"), { repetition: false })),
    sefard: amidah(MW, SWM + "Shemoneh Esrei", { lead: 1, skip: [[56, 80], [133, 145], [253, 255], [328, 347], [423, 443]] }, weekdayRows(metsudahWeekday("קדושת השם"), { repetition: false })),
  },
  "weekday/shacharit/chazzans-repetition": {
    ashkenaz: amidah(KO, KW + "The Amida", { lead: 2, end: "אלהי נצר", skip: [[14, 15], ...pairs(korenSkips(1), ["holinessWeekday"])] }, weekdayRows(korenWeekday("קדושה", "מלכות בן דוד"), { repetition: true })),
    sefard: amidah(MW, SWM + "Shemoneh Esrei", { lead: 1, end: "אלהי נצור", skip: [[133, 145], [253, 255]] }, weekdayRows(metsudahWeekday("קדושה"), { repetition: true })),
  },
  "weekday/shacharit/tachanun": {
    ashkenaz: [
      part("Monday–Thursday additions", s(KO, KW + "Tahanun", { until: 10 }), ["Monday and Thursday — Vehu Rachum", "שני וחמישי — והוא רחום"]),
      part("Falling on the face", s(KO, KW + "Tahanun", { from: 10, until: 28, dropHeading: true })),
      part("Supplication", s(KO, KW + "Tahanun", { from: 28, until: 35 }), ["Supplication — Shomer Yisrael and Va’anachnu", "תחנונים — שומר ישראל ואנחנו לא נדע"]),
    ],
    sefard: [
      part("Confession and Thirteen Attributes", s(MW, SWM + "Tachanun", { until: 90 })),
      part("Falling on the face", s(MW, SWM + "Tachanun", { from: 90 })),
      part("Monday–Thursday additions", s(MW, SWM + "Vehu Rachum", { until: 292 }), ["Monday and Thursday — Vehu Rachum", "שני וחמישי — והוא רחום"]),
      part("Supplication", s(MW, SWM + "Vehu Rachum", { from: 292, until: 345 }), ["Supplication — Shomer Yisrael and Va’anachnu", "תחנונים — שומר ישראל ואנחנו לא נדע"]),
    ],
  },
  "weekday/shacharit/half-kaddish-2": { ashkenaz: one(s(KO, KW + "Tahanun", { from: 35, dropHeading: true })), sefard: one(s(MW, SWM + "Vehu Rachum", { from: 345, until: 367 })) },
  "weekday/shacharit/torah-reading": {
    calendar: "weekday",
    ashkenaz: [
      part("Taking out Torah", s(KO, KW + "Reading of the Torah", { until: 21 }), ["Taking out the Torah", "הוצאת ספר תורה"]),
      part("Three aliyot", s(KO, KW + "Reading of the Torah", { from: 21, until: 35 }), ["Three aliyot — the blessings", "שלוש עליות — ברכות העולים"]),
    ],
    sefard: [
      part("Taking out Torah", s(MW, SWM + "Reading of the Torah", { until: 114 }), ["Taking out the Torah", "הוצאת ספר תורה"]),
      part("Three aliyot", [s(MW, SWM + "Reading of the Torah", { from: 114 }), s(MW, SWM + "Birchas Hagomeil")], ["Three aliyot — the blessings", "שלוש עליות — ברכות העולים"]),
    ],
  },
  "weekday/shacharit/half-kaddish-3": { ashkenaz: one(s(KO, KW + "Reading of the Torah", { from: 35, until: 40, dropHeading: true })), sefard: one(s(MW, SWM + "Yishtabach", { from: 53 })) },
  "weekday/shacharit/raise-and-return-the-torah": {
    ashkenaz: [part("Hagbah and returning the Torah", s(KO, KW + "Reading of the Torah", { from: 40, until: 61 }))],
    sefard: [part("Hagbah and returning the Torah", [s(MW, SWM + "Berachah for Father of Bar Mitzvah", { from: 7 }), s(MW, SWM + "Ashrei U'va L'Tzion", { from: 239 })])],
  },
  "weekday/shacharit/ashrei-and-uva-ltzion": {
    ashkenaz: [
      part("Ashrei", s(KO, KCON, { until: 5 })),
      part("Psalm 20", s(KO, KCON, { from: 5, until: 7 })),
      part("Uva L’Tzion", s(KO, KCON, { from: 7, until: 19 })),
    ],
    sefard: [
      part("Ashrei", s(MW, SWM + "Ashrei U'va L'Tzion", { until: 57 })),
      part("Psalm 20", s(MW, SWM + "Ashrei U'va L'Tzion", { from: 57, until: 86 })),
      part("Uva L’Tzion", s(MW, SWM + "Ashrei U'va L'Tzion", { from: 86, until: 201 })),
    ],
  },
  "weekday/shacharit/full-kaddish-titkabel": { ashkenaz: one(s(KO, KCON, { from: 21, until: 30, dropHeading: true })), sefard: one(s(MW, SWM + "Ashrei U'va L'Tzion", { from: 202, until: 239 })) },
  "weekday/shacharit/aleinu-and-closing-psalms": {
    ashkenaz: [
      part("Aleinu", s(KO, KCON, { from: 30, until: 35 })),
      part("Daily and seasonal psalms", s(KO, KW + "The Daily Psalm", { until: 27 }), ["Daily and seasonal psalms — one psalm for each day; Barekhi Nafshi on Rosh Chodesh; Psalm 27 from Elul through Sukkot", "מזמורי היום והעונה — שיר של יום; ברכי נפשי בראש חודש; לדוד ה׳ אורי מאלול עד סוכות"]),
    ],
    sefard: [
      part("Daily and seasonal psalms", [s(MW, SWM + "Psalm of the Day", { from: 105 }), s(MW, SWM + "Psalm from Rosh Chodesh Elul")], ["Daily and seasonal psalms — one psalm for each day; Psalm 27 from Elul through Sukkot", "מזמורי היום והעונה — שיר של יום; לדוד ה׳ אורי מאלול עד סוכות"]),
      part("Aleinu", s(MW, SWM + "Aleinu", { from: 147 })),
    ],
  },
  "weekday/shacharit/mourners-or-rabbis-kaddish": { ashkenaz: one(s(KO, KCON, { from: 35, dropHeading: true })), sefard: one(s(MW, SWM + "Mourner's Kaddish")) },

  // ───────────── Weekday Mincha ─────────────
  "weekday/mincha/ashrei": { ashkenaz: one(s(KO, KMIN, { until: 4 })), sefard: one(s(MW, SW + "Mincha, Ashrei", { until: 58 })) },
  "weekday/mincha/half-kaddish": { ashkenaz: one(s(KO, KMIN, { from: 4, until: 8, dropHeading: true })), sefard: one(s(MW, SW + "Mincha, Ashrei", { from: 58 })) },
  "weekday/mincha/silent-shemoneh-esrei": {
    ashkenaz: amidah(KO, KMIN, { start: 9, lead: 10, end: 94, skip: [[47, 48], ...pairs(korenSkips(9), ["kedushah", "modimDerabbanan", "kohanim"])] }, weekdayRows(korenWeekday("קדושת השם", "מלכות בית דוד"), { repetition: false })),
    sefard: amidah(MW, SW + "Mincha, Shemoneh Esrei", { lead: 1, skip: [[58, 82], [374, 393], [469, 489]] }, weekdayRows(metsudahWeekday("קדושת השם"), { repetition: false })),
  },
  "weekday/mincha/chazzans-repetition": {
    ashkenaz: amidah(KO, KMIN, { start: 9, lead: 11, end: [9, "אלהי נצר"], skip: [[47, 48], [24, 25], ...pairs(korenSkips(9), ["holinessWeekday"])] }, weekdayRows(korenWeekday("קדושה", "מלכות בית דוד"), { repetition: true })),
    sefard: amidah(MW, SW + "Mincha, Shemoneh Esrei", { lead: 1, end: "אלהי נצור" }, weekdayRows(metsudahWeekday("קדושה"), { repetition: true })),
  },
  "weekday/mincha/tachanun": {
    ashkenaz: [part("Supplication and falling on the face", s(KO, KMIN, { from: 96, until: 111, dropHeading: true }))],
    sefard: [
      part("Confession and Thirteen Attributes", s(MW, SW + "Mincha, Tachanun", { until: 90 })),
      part("Supplication and falling on the face", s(MW, SW + "Mincha, Tachanun", { from: 90, until: 179 })),
    ],
  },
  "weekday/mincha/full-kaddish-titkabel": { ashkenaz: one(s(KO, KMIN, { from: 111, until: 119, dropHeading: true })), sefard: one(s(MW, SW + "Mincha, Tachanun", { from: 179 })) },
  "weekday/mincha/aleinu": { ashkenaz: [part("Aleinu L’Shabe’ach", s(KO, KMIN, { from: 119, until: 124 }))], sefard: [part("Aleinu L’Shabe’ach", s(MW, SW + "Mincha, Aleinu", { until: 74 }))] },
  "weekday/mincha/mourners-kaddish": { ashkenaz: one(s(KO, KMIN, { from: 124, dropHeading: true })), sefard: one(s(MW, SW + "Mincha, Aleinu", { from: 74, until: 105 })) },

  // ───────────── Weekday Maariv ─────────────
  "weekday/maariv/opening-maariv": { ashkenaz: [part("Vehu Rachum", s(KO, KMAA, { until: 3 }))], sefard: [part("Vehu Rachum", s(MW, SW + "Maariv, Berachos Preceding Shema", { until: 11 }))] },
  "weekday/maariv/barkhu-call-to-prayer": { ashkenaz: one(s(KO, KMAA, { from: 3, until: 8, dropHeading: true })), sefard: one(s(MW, SW + "Maariv, Berachos Preceding Shema", { from: 11, until: "ברוך אתה" })) },
  "weekday/maariv/evening-shema-and-its-blessings": {
    ashkenaz: [
      part("First blessing before — Maariv Aravim", s(KO, KMAA, { from: 8, until: 9 })),
      part("Second blessing before — Ahavat Olam", s(KO, KMAA, { from: 9, until: 10 })),
      part("Shema Yisrael", s(KO, KMAA, { from: 10, until: 15 })),
      part("First paragraph — Ve’ahavta", s(KO, KMAA, { from: 15, until: 16 })),
      part("Second paragraph — Vehayah im shamoa", s(KO, KMAA, { from: 16, until: 17 })),
      part("Third paragraph — Vayomer", s(KO, KMAA, { from: 17, until: 18 })),
      part("First blessing after — Emet VeEmunah", s(KO, KMAA, { from: 18, until: 26 })),
      part("Second blessing after — Hashkiveinu", s(KO, KMAA, { from: 26, until: 27 })),
      part("Barukh Hashem L’Olam — some Ashkenaz communities", s(KO, KMAA, { from: 27, until: 32 })),
    ],
    sefard: [
      part("First blessing before — Maariv Aravim", s(MW, SW + "Maariv, Berachos Preceding Shema", { from: "ברוך אתה", until: "אהבת עולם" })),
      part("Second blessing before — Ahavat Olam", s(MW, SW + "Maariv, Berachos Preceding Shema", { from: "אהבת עולם" })),
      part("Shema Yisrael", s(MW, SW + "Maariv, Shema", { until: "ואהבת" })),
      part("First paragraph — Ve’ahavta", s(MW, SW + "Maariv, Shema", { from: "ואהבת", until: ["ואהבת", "והיה"] })),
      part("Second paragraph — Vehayah im shamoa", s(MW, SW + "Maariv, Shema", { from: ["ואהבת", "והיה"], until: ["ואהבת", "והיה", "ויאמר"] })),
      part("Third paragraph — Vayomer", s(MW, SW + "Maariv, Shema", { from: ["ואהבת", "והיה", "ויאמר"], until: 101 })),
      part("First blessing after — Emet VeEmunah", [s(MW, SW + "Maariv, Shema", { from: 101 }), s(MW, SW + "Maariv, Berachos Following Shema", { until: 61 })]),
      part("Second blessing after — Hashkiveinu", s(MW, SW + "Maariv, Berachos Following Shema", { from: 61, until: 160 }), ["Second blessing after — Hashkiveinu, and Barukh Hashem L’Olam", "ברכה שנייה לאחריה — השכיבנו, וברוך ה׳ לעולם"]),
    ],
  },
  "weekday/maariv/half-kaddish": { ashkenaz: one(s(KO, KMAA, { from: 32, until: 36, dropHeading: true })), sefard: one(s(MW, SW + "Maariv, Berachos Following Shema", { from: 160 })) },
  "weekday/maariv/silent-shemoneh-esrei": {
    ashkenaz: amidah(KO, KMAA, { start: 36, lead: 37, end: 108 }, weekdayRows(korenWeekday("קדושת השם", "משיח בן דוד"), { repetition: false, kohanim: false })),
    sefard: amidah(MW, SW + "Maariv, Shemoneh Esrei", { lead: 1 }, weekdayRows(metsudahWeekday("קדושת השם"), { repetition: false, kohanim: false })),
  },
  "weekday/maariv/full-kaddish-titkabel": { ashkenaz: one(s(KO, KMAA, { from: 109, until: 117, dropHeading: true })), sefard: one(s(MW, SW + "Maariv, Aleinu", { until: "עלינו לשבח" })) },
  "weekday/maariv/concluding-prayers": {
    ashkenaz: [
      part("Counting the Omer — seasonal", s(KO, KW + "Counting of the Omer", { skip: [[58, 59]] }), ["Counting the Omer — between Pesach and Shavuot", "ספירת העומר — בין פסח לשבועות"]),
      part("Aleinu", s(KO, KMAA, { from: 117, until: 123 })),
    ],
    sefard: [
      part("Counting the Omer — seasonal", s(MW, SW + "Counting the Omer"), ["Counting the Omer — between Pesach and Shavuot", "ספירת העומר — בין פסח לשבועות"]),
      part("Aleinu", s(MW, SW + "Maariv, Aleinu", { from: "עלינו לשבח", until: ["עלינו לשבח", "יתגדל"] })),
    ],
  },
  // Koren's Hebrew for this Maariv Mourner's Kaddish opens with the wrong line on Sefaria, so the
  // identical weekday Mincha Mourner's Kaddish is used instead.
  "weekday/maariv/mourners-kaddish": { ashkenaz: one(s(KO, KMIN, { from: 124, dropHeading: true })), sefard: one(s(MW, SW + "Maariv, Aleinu", { from: ["עלינו לשבח", "יתגדל"] })) },

  // ───────────── Shabbat Maariv ─────────────
  "shabbat/maariv/kabbalat-shabbat": {
    ashkenaz: [
      part("Psalms 95–99 and 29", s(KO, KS + "Kabbalat Shabbat", { until: 12 }), ["Psalms 95–99 and 29, with Ana Bekoach", "תהילים צ״ה–צ״ט וכ״ט, ואנא בכח"]),
      part("Lekha Dodi", s(KO, KS + "Kabbalat Shabbat", { from: 12, until: 35 })),
      part("Psalms 92–93", s(KO, KS + "Kabbalat Shabbat", { from: 35, until: 38 })),
      part("Yedid Nefesh · Ana Bekoach · Bameh Madlikin — community order varies", [s(KO, KS + "Candle Lighting", { from: 13 }), s(KO, KS + "Kabbalat Shabbat", { from: 46, until: 56 })], ["Yedid Nefesh and Bameh Madlikin — community order varies", "ידיד נפש ובמה מדליקין — הסדר משתנה לפי הקהילה"]),
    ],
    sefard: [
      part("Psalms 95–99 and 29", [95, 96, 97, 98, 99, 29].map(n => s(MS, SS + "Kabbalas Shabbos, Psalm " + n)), ["Psalms 95–99 and 29, with Ana Bekoach", "תהילים צ״ה–צ״ט וכ״ט, ואנא בכח"]),
      part("Lekha Dodi", s(MS, SS + "Kabbalas Shabbos, Lecha Dodi")),
      part("Psalms 92–93", [92, 93].map(n => s(MS, SS + "Kabbalas Shabbos, Psalm " + n))),
      part("Yedid Nefesh · Ana Bekoach · Kegavna — community order varies", [s(MS, SS + "Mincha Service for Erev Shabbos, Yedid Nefesh"), s(MS, SS + "Kabbalas Shabbos, Mourner's Kaddish", { from: 32, until: 35 })], ["Yedid Nefesh and Kegavna — community order varies", "ידיד נפש וכגוונא — הסדר משתנה לפי הקהילה"]),
    ],
  },
  "shabbat/maariv/kaddish-after-kabbalat-shabbat": { ashkenaz: one(s(KO, KS + "Kabbalat Shabbat", { from: 38, until: 46, dropHeading: true })), sefard: one(s(MS, SS + "Kabbalas Shabbos, Mourner's Kaddish", { until: 32 })) },
  "shabbat/maariv/barkhu-call-to-prayer": { ashkenaz: one(s(KO, KSMA, { until: 6, dropHeading: true })), sefard: one(s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Borechu", { from: 5, until: "ברוך אתה" })) },
  "shabbat/maariv/evening-shema-and-its-blessings": {
    ashkenaz: [
      part("Maariv Aravim", s(KO, KSMA, { from: 6, until: 7 })),
      part("Ahavat Olam", s(KO, KSMA, { from: 7, until: 8 })),
      part("Shema Yisrael", s(KO, KSMA, { from: 8, until: 13 })),
      part("Ve’ahavta", s(KO, KSMA, { from: 13, until: 14 })),
      part("Vehayah im shamoa", s(KO, KSMA, { from: 14, until: 15 })),
      part("Vayomer", s(KO, KSMA, { from: 15, until: 16 })),
      part("Emet VeEmunah", s(KO, KSMA, { from: 16, until: 23 })),
      part("Hashkiveinu", s(KO, KSMA, { from: 23, until: 24 })),
      part("Veshamru — Shabbat paragraph", s(KO, KSMA, { from: 24, until: 26 })),
    ],
    sefard: [
      part("Maariv Aravim", s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Borechu", { from: "ברוך אתה", until: "אהבת עולם" })),
      part("Ahavat Olam", s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Borechu", { from: "אהבת עולם", until: 50 })),
      part("Shema Yisrael", s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Borechu", { from: 50, until: "ואהבת" })),
      part("Ve’ahavta", s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Borechu", { from: "ואהבת", until: ["ואהבת", "והיה"] })),
      part("Vehayah im shamoa", s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Borechu", { from: ["ואהבת", "והיה"], until: ["ואהבת", "והיה", "ויאמר"] })),
      part("Vayomer", s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Borechu", { from: ["ואהבת", "והיה", "ויאמר"], until: 150 })),
      part("Emet VeEmunah", s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Borechu", { from: 150, until: 213 })),
      part("Hashkiveinu", s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Borechu", { from: 213, until: 240 })),
      part("Veshamru — Shabbat paragraph", s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Borechu", { from: 240, until: 254 })),
    ],
  },
  "shabbat/maariv/half-kaddish": { ashkenaz: one(s(KO, KSMA, { from: 28, until: 32, dropHeading: true })), sefard: one(s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Borechu", { from: 258, until: 280 })) },
  "shabbat/maariv/silent-shabbat-amidah": {
    ashkenaz: amidah(KO, KSMA, { start: 33, lead: 34, end: 84 }, shabbatRows(korenShabbat("קדושת השם"), "maariv", { repetition: false })),
    sefard: amidah(MS, SS + "Maariv Service for Shabbos and Yom Tov, Amidah for Shabbos Eve", { lead: 1 }, shabbatRows(metsudahShabbat("קדושת השם", "אתה קדשת"), "maariv", { repetition: false })),
  },
  "shabbat/maariv/vayechulu": { ashkenaz: [part("The completion of creation", s(KO, KSMA, { from: 84, until: 86 }))], sefard: [part("The completion of creation", s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Vayechulu", { until: 12 }))] },
  "shabbat/maariv/meein-sheva": {
    ashkenaz: one(s(KO, KSMA, { from: 86, until: 93 })),
    sefard: one(s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Vayechulu", { from: 12 }), s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Magein Avos", { until: 39 })),
  },
  "shabbat/maariv/full-kaddish": { ashkenaz: one(s(KO, KSMA, { from: 93, until: 101, dropHeading: true })), sefard: one(s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Magein Avos", { from: 39, until: 76 })) },
  "shabbat/maariv/aleinu": { ashkenaz: [part("Aleinu L’Shabe’ach", s(KO, KSMA, { from: 109, until: 114 }))], sefard: [part("Aleinu L’Shabe’ach", s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Aleinu"))] },
  "shabbat/maariv/mourners-kaddish": { ashkenaz: one(s(KO, KSMA, { from: 114, until: 122, dropHeading: true })), sefard: one(s(MS, SS + "Maariv Service for Shabbos and Yom Tov, Mourner's Kaddish")) },

  // ───────────── Shabbat Shacharit ─────────────
  "shabbat/shacharit/opening-blessings": {
    ashkenaz: [
      part("Morning blessings and Torah study", ["On Waking", "Blessings Over the Torah", "Tallit", "Preparation for Prayer", "Morning Blessings"].map(l => s(KO, KW + l)), ["Waking, tallit, Ma Tovu, the morning blessings and Torah study", "השכמה, טלית, מה טובו, ברכות השחר ולימוד תורה"]),
      part("Tallit · Korbanot and Shabbat additions", ["The Binding of Isaac", "Accepting the Sovereignty of Heaven", "Offerings", "The Interpretive Principles of Rabbi Yishmael"].map(l => s(KO, KW + l)), ["The binding of Isaac, Korbanot and the Shabbat offering", "עקדה, קרבנות וקרבן השבת"]),
    ],
    sefard: [
      part("Morning blessings and Torah study", ["Upon Arising in the Morning", "Putting On the Tallis", "Ma Tovu", "Adon Olam", "Yigdal", "Blessings Upon Arising", "Blessings of the Torah", "Morning Blessings"].map(l => s(MS, SSM + l)), ["Waking, tallit, Ma Tovu, the morning blessings and Torah study", "השכמה, טלית, מה טובו, ברכות השחר ולימוד תורה"]),
      part("Tallit · Korbanot and Shabbat additions", [
        ...["Akeidah (The Binding of Isaac)", "Morning Supplications", "Korbanos (Sacrificial Offerings)", "Korban Tamid (Daily Offering)"].map(l => s(MS, SSM + l)),
        s(TN, "Numbers 28:9-10"), s(MS, SSM + "Ketores (Incense Offering)"),
      ], ["The binding of Isaac, Korbanot and the Shabbat offering (Numbers 28:9–10)", "עקדה, קרבנות וקרבן השבת (במדבר כ״ח:ט–י)"]),
    ],
  },
  "shabbat/shacharit/rabbis-kaddish": { ashkenaz: one(s(KO, KW + "The Rabbis' Kaddish", { until: 9 })), sefard: one(s(MS, SSM + "Kaddish d'Rabanan")) },
  "shabbat/shacharit/shabbat-pesukei-dzimra": {
    ashkenaz: [
      part("Barukh She’amar, then the expanded psalm sequence", s(KO, KS + "Pesukei DeZimra", { until: 42 })),
      part("Nishmat Kol Chai", s(KO, KS + "Nishmat", { until: 5 })),
      part("Shochen Ad · Yishtabach", s(KO, KS + "Nishmat", { from: 5, until: 11 })),
    ],
    sefard: [
      part("Hodu and selected rite ordering of the expanded psalms", ["Hodu", "Mizmor Shir", "Baruch She'amar", "Psalm 92", "Psalm 93", "Yehi Chevod", "Ashrei", "Shiras Hayam"].map(l => s(MS, SSM + l)), ["Hodu, the Shabbat psalms, Barukh She’amar, Ashrei and the Song at the Sea", "הודו, מזמורי השבת, ברוך שאמר, אשרי ושירת הים"]),
      part("Nishmat Kol Chai", s(MS, SSM + "Nishmas", { until: 123 })),
      part("Shochen Ad · Yishtabach", [s(MS, SSM + "Nishmas", { from: 123 }), s(MS, SSM + "Yishtabach", { until: 30 })]),
    ],
  },
  "shabbat/shacharit/half-kaddish": { ashkenaz: one(s(KO, KS + "Nishmat", { from: 13, dropHeading: true })), sefard: one(s(MS, SSM + "Yishtabach", { from: 54, until: 78 })) },
  "shabbat/shacharit/barkhu-call-to-prayer": { ashkenaz: one(s(KO, KS + "Blessings of the Shema", { until: 5 })), sefard: one(s(MS, SSM + "Yishtabach", { from: 80, until: 85 })) },
  "shabbat/shacharit/morning-shema-and-its-blessings": {
    ashkenaz: [
      part("Yotzer Or", s(KO, KS + "Blessings of the Shema", { from: 5, until: 32, skip: [[11, 14]] })),
      part("Ahavah Rabbah", s(KO, KS + "Blessings of the Shema", { from: 32, until: 35 })),
      part("Proclamation and three paragraphs", s(KO, KS + "Blessings of the Shema", { from: 35, until: 44 })),
      part("Emet Veyatziv and redemption · no Kaddish before Amidah", s(KO, KS + "Blessings of the Shema", { from: 44, until: 68 })),
    ],
    sefard: [
      part("Yotzer Or", [s(MS, SSM + "Yishtabach", { from: 85 }), s(MS, SSM + "Eil Adon", { until: "אהבת עולם", skip: [[69, "תתברך"]] })]),
      part("Ahavat Olam", s(MS, SSM + "Eil Adon", { from: "אהבת עולם" })),
      part("Proclamation and three paragraphs", s(MS, SSM + "Recitation of Shema", { until: 104 })),
      part("Emet Veyatziv and redemption · no Kaddish before Amidah", s(MS, SSM + "Recitation of Shema", { from: 104, until: 220 })),
    ],
  },
  "shabbat/shacharit/silent-shabbat-amidah": {
    ashkenaz: amidah(KO, KS + "The Amida for Shabbat", { lead: 1, end: 58, skip: [...pairs(korenSkips(1), ["kedushah", "modimDerabbanan"]), [46, 47], [52, 53]] }, shabbatRows(korenShabbat("קדושת השם"), "shacharit", { repetition: false })),
    sefard: amidah(MS, SSM + "Amidah for Shabbos Morning", { end: 411, skip: [[56, 95], [232, 251], [308, 328]] }, shabbatRows(metsudahShabbat("קדושת השם", "ישמח משה"), "shacharit", { repetition: false })),
  },
  "shabbat/shacharit/chazzans-repetition": {
    ashkenaz: amidah(KO, KS + "The Amida for Shabbat", { lead: 2, end: "אלהי נצר", skip: [[14, 15], ...pairs(korenSkips(1), ["holinessShabbat"])] }, shabbatRows(korenShabbat("קדושה"), "shacharit", { repetition: true })),
    sefard: amidah(MS, SSM + "Amidah for Shabbos Morning", { end: "אלהי נצור" }, shabbatRows(metsudahShabbat("קדושה", "ישמח משה"), "shacharit", { repetition: true })),
  },
  "shabbat/shacharit/full-kaddish": { ashkenaz: one(s(KO, KS + "The Amida for Shabbat", { from: 59, dropHeading: true })), sefard: one(s(MS, SSM + "Amidah for Shabbos Morning", { from: 411, until: 447 })) },
  "shabbat/shacharit/torah-service": {
    calendar: "shabbat",
    ashkenaz: [
      part("Open ark and take out the Torah", s(KO, KS + "Reading of the Torah", { until: 39, skip: [[10, 16]] })),
      part("Seven aliyot from the weekly portion", s(KO, KS + "Reading of the Torah", { from: 39, until: 68 }), ["Seven aliyot — the blessings and prayers for those called up", "שבע עליות — ברכות העולים ותפילות מי שברך"]),
      part("Lift and roll · maftir · Haftarah and blessings", s(KO, KS + "Reading of the Torah", { from: 68, until: 91 })),
      part("Communal prayers · Ashrei · return Torah to ark", [
        s(KO, KS + "Reading of the Torah", { from: 91, note: occasionalPrayers, omits: true }),
        s(KO, KSMU, { until: 18, skip: [[13, 15]] }),
      ]),
    ],
    sefard: [
      part("Open ark and take out the Torah", [s(MS, SS + "Reading of the Torah, Va'yehi Binsoa"), s(MS, SS + "Reading of the Torah, Berich Shemei", { until: 93 })]),
      part("Seven aliyot from the weekly portion", [s(MS, SS + "Reading of the Torah, Berich Shemei", { from: 93 }), s(MS, SS + "Reading of the Torah, Birchas Hagomeil", { until: 16 })], ["Seven aliyot — the blessings for those called up", "שבע עליות — ברכות העולים"]),
      part("Lift and roll · maftir · Haftarah and blessings", [s(MS, SS + "Reading of the Torah, Birchas Hagomeil", { from: 16 }), s(MS, SS + "Reading of the Torah, Berachos for the Haftarah")]),
      part("Communal prayers · Ashrei · return Torah to ark", [
        s(MS, SS + "Reading of the Torah, Yekum Purkon", { note: occasionalPrayers, omits: true }),
        s(MS, SS + "Reading of the Torah, Av Horachamim"),
        s(MS, SS + "Musaf Service, Ashrei", { until: 148 }),
      ]),
    ],
  },

  // ───────────── Shabbat Musaf ─────────────
  "shabbat/musaf/half-kaddish": { ashkenaz: one(s(KO, KSMU, { from: 18, until: 22, dropHeading: true })), sefard: one(s(MS, SS + "Musaf Service, Ashrei", { from: 148 })) },
  "shabbat/musaf/silent-musaf-amidah": {
    ashkenaz: amidah(KO, KSMU, { start: 23, lead: 24, end: 92, skip: [...pairs(korenSkips(23), ["kedushah", "modimDerabbanan"]), [54, 55], [61, 69], [80, 81], [86, 87]] }, shabbatRows(korenShabbat("קדושת השם"), "musaf", { repetition: false })),
    sefard: amidah(MS, SS + "Musaf Service, Amidah", { lead: 2, end: ["אלהי נצור", "יתגדל"], skip: [[59, 121], [204, 311], [346, 365], [422, 442]] }, shabbatRows(metsudahShabbat("קדושת השם", "תכנת שבת"), "musaf", { repetition: false })),
  },
  "shabbat/musaf/chazzans-musaf-repetition": {
    ashkenaz: amidah(KO, KSMU, { start: 23, lead: 25, end: [23, "אלהי נצר"], skip: [[38, 39], [61, 69], ...pairs(korenSkips(23), ["holinessShabbat"])] }, shabbatRows(korenShabbat("קדושה"), "musaf", { repetition: true })),
    sefard: amidah(MS, SS + "Musaf Service, Amidah", { lead: 2, end: "אלהי נצור", skip: [[121, 134], [204, 311]] }, shabbatRows(metsudahShabbat("קדושה", "תכנת שבת"), "musaf", { repetition: true })),
  },
  "shabbat/musaf/full-kaddish": { ashkenaz: one(s(KO, KSMU, { from: 92, until: 100, dropHeading: true })), sefard: one(s(MS, SS + "Musaf Service, Amidah", { from: ["אלהי נצור", "יתגדל"] })) },
  "shabbat/musaf/ein-keloheinu-and-incense-study": {
    ashkenaz: [
      part("Ein Keloheinu", s(KO, KSMU, { from: 100, until: 102 })),
      part("Pitum HaKetoret", s(KO, KSMU, { from: 102, until: 114 }), ["Pitum HaKetoret and closing teachings", "פיטום הקטורת ודברי הסיום"]),
    ],
    sefard: [
      part("Ein Keloheinu", s(MS, SS + "Musaf Service, Ein Keiloheinu", { until: "פטום הקטרת" }), ["Kaveh and Ein Keloheinu", "קוה ואין כאלהינו"]),
      part("Pitum HaKetoret", s(MS, SS + "Musaf Service, Ein Keiloheinu", { from: "פטום הקטרת" }), ["Pitum HaKetoret and closing teachings", "פיטום הקטורת ודברי הסיום"]),
    ],
  },
  "shabbat/musaf/rabbis-kaddish": { ashkenaz: one(s(KO, KSMU, { from: 114, until: 123, dropHeading: true })), sefard: one(s(MS, SS + "Musaf Service, Kaddish d'Rabanan")) },
  "shabbat/musaf/aleinu": { ashkenaz: one(s(KO, KSMU, { from: 123, until: 128 })), sefard: one(s(MS, SS + "Musaf Service, Aleinu")) },
  "shabbat/musaf/mourners-kaddish": { ashkenaz: one(s(KO, KSMU, { from: 128, until: 136, dropHeading: true })), sefard: one(s(MS, SS + "Musaf Service, Mourner's Kaddish", { until: 30 })) },

  // ───────────── Shabbat Mincha ─────────────
  "shabbat/mincha/ashrei-and-uva-ltzion": {
    ashkenaz: [
      part("Ashrei", s(KO, KSMI, { until: 2 })),
      part("Uva L’Tzion", s(KO, KSMI, { from: 2, until: 13 })),
      part("Va’ani Tefilati", s(KO, KSMI, { from: 17, until: 19 })),
    ],
    sefard: [
      part("Ashrei", s(MS, SS + "Mincha Service for Shabbos and Yom Tov, Ashrei")),
      part("Uva L’Tzion", s(MS, SS + "Mincha Service for Shabbos and Yom Tov, Uvah L'tzion", { until: 108 })),
      part("Va’ani Tefilati", s(MS, SS + "Mincha Service for Shabbos and Yom Tov, Reading of the Torah", { until: 7 })),
    ],
  },
  "shabbat/mincha/half-kaddish": { ashkenaz: one(s(KO, KSMI, { from: 13, until: 17, dropHeading: true })), sefard: one(s(MS, SS + "Mincha Service for Shabbos and Yom Tov, Uvah L'tzion", { from: 108, until: 130 })) },
  // After the Torah is returned, before the Shmoneh Esrei: the same Half Kaddish text as before the reading.
  "shabbat/mincha/half-kaddish-2": { ashkenaz: one(s(KO, KSMI, { from: 13, until: 17, dropHeading: true })), sefard: one(s(MS, SS + "Mincha Service for Shabbos and Yom Tov, Uvah L'tzion", { from: 108, until: 130 })) },
  "shabbat/mincha/torah-service": {
    calendar: "mincha",
    ashkenaz: [
      part("Open ark and take out the Torah", s(KO, KSMI, { from: 19, until: 35 })),
      part("Three aliyot · at least ten verses", s(KO, KSMI, { from: 35, until: 42 }), ["Three aliyot — the blessings", "שלוש עליות — ברכות העולים"]),
      part("Lift, roll and return the Torah", s(KO, KSMI, { from: 42, until: 55 })),
    ],
    sefard: [
      part("Open ark and take out the Torah", [s(MS, SS + "Mincha Service for Shabbos and Yom Tov, Reading of the Torah", { from: 7 }), s(MS, SS + "Mincha Service for Shabbos and Yom Tov, Berich Shemei", { until: 90 })]),
      part("Three aliyot · at least ten verses", s(MS, SS + "Mincha Service for Shabbos and Yom Tov, Berich Shemei", { from: 90, until: 110 }), ["Three aliyot — the blessings", "שלוש עליות — ברכות העולים"]),
      part("Lift, roll and return the Torah", s(MS, SS + "Mincha Service for Shabbos and Yom Tov, Berich Shemei", { from: 110, until: 243 })),
    ],
  },
  "shabbat/mincha/silent-shabbat-amidah": {
    ashkenaz: amidah(KO, KSMI, { start: 60, lead: 61, end: 117, skip: [...pairs(korenSkips(60), ["kedushah", "modimDerabbanan"]), [111, 112]] }, shabbatRows(korenShabbat("קדושת השם"), "mincha", { repetition: false })),
    sefard: amidah(MS, SS + "Mincha Service for Shabbos and Yom Tov, Amidah", { lead: 1, end: 349, skip: [[58, 83], [198, 217]] }, shabbatRows(metsudahShabbat("קדושת השם", "אתה אחד"), "mincha", { repetition: false })),
  },
  "shabbat/mincha/chazzans-repetition": {
    ashkenaz: amidah(KO, KSMI, { start: 60, lead: 62, end: [60, "אלהי נצר"], skip: [[75, 76], ...pairs(korenSkips(60), ["holinessShabbat"])] }, shabbatRows(korenShabbat("קדושה"), "mincha", { repetition: true })),
    sefard: amidah(MS, SS + "Mincha Service for Shabbos and Yom Tov, Amidah", { lead: 1, end: "אלהי נצור" }, shabbatRows(metsudahShabbat("קדושה", "אתה אחד"), "mincha", { repetition: true })),
  },
  "shabbat/mincha/tzidkatcha": { ashkenaz: one(s(KO, KSMI, { from: 117, until: 119 })), sefard: one(s(MS, SS + "Mincha Service for Shabbos and Yom Tov, Amidah", { from: 349, until: 360 })) },
  "shabbat/mincha/full-kaddish": { ashkenaz: one(s(KO, KSMI, { from: 119, until: 127, dropHeading: true })), sefard: one(s(MS, SS + "Mincha Service for Shabbos and Yom Tov, Amidah", { from: 360 })) },
  "shabbat/mincha/aleinu": { ashkenaz: [part("Aleinu L’Shabe’ach", s(KO, KSMI, { from: 128, until: 133 }))], sefard: [part("Aleinu L’Shabe’ach", s(MS, SS + "Mincha Service for Shabbos and Yom Tov, Aleinu"))] },
  "shabbat/mincha/mourners-kaddish": { ashkenaz: one(s(KO, KSMI, { from: 133, dropHeading: true })), sefard: one(s(MS, SS + "Mincha Service for Shabbos and Yom Tov, Mourner's Kaddish")) },
};

function pairs(skips, names) { return names.flatMap(name => [skips[name]]); }

// Cards deliberately left without prayer text, with the reason shown in the report.
export const unfilled = {
  "shabbat/shacharit/transition-to-musaf": "Structural pointer card: it has no prayer text of its own. The Half Kaddish it points to opens the Musaf map and is filled there.",
};

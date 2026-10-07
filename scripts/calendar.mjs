// The Hebrew calendar the maps' date notes read (src/client/today.js), computed here with
// @hebcal/core and written to src/calendar.generated.json, which is committed. @hebcal/core is
// GPL-licensed: it is a build-time devDependency only, used by this script; nothing of it is
// shipped to the browser, and the site's build reads only the generated table.
//   npm run calendar      (rerun, and rebuild, before the table's last day: see README.md)
//
// One character per civil day, from `from` to `to`, per field. Each day is the Hebrew day that
// is current in its daytime (Shacharit and Mincha); Maariv reads the next day's entry, since the
// evening belongs to the coming Hebrew day. Outside Israel, standard Ashkenaz practice.
//   k  the day:                  - weekday, S Shabbat, Y festival (Yom Tov), H Chol HaMoed
//   t  Tachanun at Shacharit:    - said, or the reason it is not (see `reasons` in today.js)
//   m  Tachanun at Mincha:       - said, a reason, F Friday (the eve of Shabbat), O the eve of a
//                                festival, or a lower-case reason for "the afternoon before" that day
//   z  Tzidkatcha (Saturdays):   - said, or as m: not said when Tachanun would not be said at Mincha
//   r  Torah reading at Shacharit: - none, M Monday/Thursday, R Rosh Chodesh, C Chanukah,
//                                  D Rosh Chodesh in Chanukah, P Purim, F fast day, A Tisha B'Av,
//                                  H Chol HaMoed, Y festival
//   p  psalms after Shacharit:   bit 1 Psalm 104 (Rosh Chodesh), bit 2 Psalm 27 (Elul season)
//   f  a public fast:            - none, G Gedaliah, T 10 Tevet, E Esther, Z 17 Tammuz, A Tisha B'Av
// `months` gives each Hebrew month's first civil day, name and year (for the Hebrew date), with
// `numerals` for days in Hebrew; `omer` the civil day on whose evening each year's count begins.
import { writeFileSync } from "node:fs";
import { HDate, HebrewCalendar, flags, gematriya, months as M } from "@hebcal/core";
import { getLeyningForHoliday, getLeyningForParshaHaShavua } from "@hebcal/leyning";

const from = "2026-09-01", to = "2028-10-31";

const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const civil = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
const days = [];
for (let d = civil(from); iso(d) <= to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)) days.push(d);
// A day on either side of the range, so "the eve of" and Maariv's next day are known at its edges.
const before = new Date(civil(from).getTime() - 864e5), after = new Date(civil(to).getTime() + 864e5);

const events = new Map();
for (const ev of HebrewCalendar.calendar({ start: before, end: new Date(after.getTime() + 864e5), il: false, shabbatMevarchim: true })) {
  const key = iso(ev.getDate().greg());
  if (!events.has(key)) events.set(key, []);
  events.get(key).push(ev);
}
const has = (date, test) => (events.get(iso(date)) || []).some(test);
const desc = (date, pattern) => has(date, ev => pattern.test(ev.getDesc()));
const flag = (date, f) => has(date, ev => ev.getFlags() & f);

/** The kind of day: a festival (Yom Tov, including Rosh Hashanah and Yom Kippur), Chol HaMoed, Shabbat, or a weekday. */
function kind(date) {
  if (flag(date, flags.CHAG)) return "Y";
  if (flag(date, flags.CHOL_HAMOED)) return "H";
  if (date.getDay() === 6) return "S";
  return "-";
}

/**
 * Why Tachanun is not said at Shacharit (and through the day) on this day, or "-" if it is said.
 * Shulchan Aruch OC 131:6-7 with the Rema and Mishnah Berurah (131:33 Purim's two days and Purim
 * Katan, 131:36 Sivan); 429:2 Nisan; 493:2 Lag BaOmer; 494:3 Sivan to the day after Shavuot;
 * 559:4 Tisha B'Av; 581:3 Erev Rosh Hashanah; 604:2 Erev Yom Kippur; Rema 131:7 Yom Kippur to
 * Sukkot. Where the sources leave it to custom, the Koren Shalem Siddur's rubrics (outside Israel).
 */
function tachanun(date, shabbatAsWeekday = false) {
  const k = kind(date);
  if (k !== "-" && !(k === "S" && shabbatAsWeekday)) return k;
  const h = new HDate(date), day = h.getDate(), month = h.getMonth();
  if (flag(date, flags.ROSH_CHODESH)) return "R";
  if (month === M.KISLEV && day >= 25 || month === M.TEVET && has(date, ev => /^Chanukah/.test(ev.getDesc()))) return "C";
  if (desc(date, /^Purim$/)) return "P";
  if (desc(date, /^Shushan Purim$/)) return "Q";
  if (desc(date, /^(Shushan )?Purim Katan$/)) return "K";
  if (month === M.SHVAT && day === 15) return "B";
  if (month === M.AV && day === 15) return "V";
  if (desc(date, /^Tish'a B'Av$/)) return "A";
  if (month === M.NISAN) return "N";
  if (month === M.IYYAR && day === 14) return "G"; // Pesach Sheni: Koren; Peri Megadim 131 notes places that say it
  if (month === M.IYYAR && day === 18) return "L";
  if (month === M.SIVAN && day <= 8) return "W"; // through the day after Shavuot (Rema 494:3)
  if (month === M.SIVAN && day <= 12) return "U"; // many continue through 12 Sivan (MB 131:36): practice varies
  if (month === M.ELUL && day === 29) return "E";
  if (month === M.TISHREI && day === 9) return "X";
  if (month === M.TISHREI && day >= 11 && day <= 24) return "T"; // Yom Kippur to Sukkot, and the day after Simchat Torah (Koren)
  if (desc(date, /^Yom HaAtzma'ut$/)) return "I"; // Koren omits it; practice varies
  if (desc(date, /^Yom Yerushalayim$/)) return "J";
  return "-";
}

const dayAfter = date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 12);

/**
 * The days whose afternoon before also has no Tachanun (MB 131:35; Rema 131:6 for Chanukah; MB 493:9
 * Lag BaOmer; SA 552:12 Tisha B'Av; Koren's Mincha rubric). Not before Erev Rosh Hashanah and Erev
 * Yom Kippur (MB 131:33), nor, following Koren, before Pesach Sheni.
 */
const eveToo = new Set(["R", "C", "P", "K", "B", "V", "A", "L"]);

/** Tachanun at a Mincha on this day, counting a Shabbat as a weekday (for Tzidkatcha); the eve of Shabbat is mincha()'s. */
function minchaAsWeekday(date) {
  const own = tachanun(date, true);
  if (own !== "-") return own;
  const next = dayAfter(date);
  if (kind(next) === "Y") return "O";
  const coming = tachanun(next, true);
  return eveToo.has(coming) ? coming.toLowerCase() : "-";
}

/** Tachanun at weekday Mincha: as above, and not on Friday afternoon, the eve of Shabbat. */
function mincha(date) {
  if (kind(date) === "S") return "S";
  const own = minchaAsWeekday(date);
  if (own !== "-") return own;
  return kind(dayAfter(date)) === "S" ? "F" : "-";
}

/** Tzidkatcha at Shabbat Mincha: not said when Tachanun would not be said at a weekday Mincha that day (SA OC 292:2, MB 292:7). */
function tzidkatcha(date) {
  if (date.getDay() !== 6) return "-";
  const k = kind(date);
  if (k === "Y" || k === "H") return k;
  return minchaAsWeekday(date);
}

/** The Torah reading at Shacharit (SA OC 135, 423, 559, 566, 684, 693, 663). */
function reading(date) {
  const k = kind(date);
  if (k !== "-") return k;
  const rc = flag(date, flags.ROSH_CHODESH), chanukah = tachanun(date) === "C" || (rc && has(date, ev => /^Chanukah/.test(ev.getDesc())));
  if (rc && chanukah) return "D";
  if (rc) return "R";
  if (chanukah) return "C";
  if (desc(date, /^Purim$/)) return "P";
  if (desc(date, /^Tish'a B'Av$/)) return "A";
  if (flag(date, flags.MINOR_FAST) && !desc(date, /^Ta'anit Bechorot$/)) return "F";
  return date.getDay() === 1 || date.getDay() === 4 ? "M" : "-";
}

/** A public fast: G Gedaliah, T 10 Tevet, E Esther, Z 17 Tammuz, A Tisha B'Av, or "-". */
function fast(date) {
  if (desc(date, /^Tzom Gedaliah$/)) return "G";
  if (desc(date, /^Asara B'Tevet$/)) return "T";
  if (desc(date, /^Ta'anit Esther$/)) return "E";
  if (desc(date, /^Tzom Tammuz$/)) return "Z";
  if (desc(date, /^Tish'a B'Av$/)) return "A";
  return "-";
}

/** The psalms added after Shacharit's psalm of the day: 104 on Rosh Chodesh (SA OC 423:3); 27 from 1 Elul through Shemini Atzeret (MB 581:2, Koren). */
function psalms(date) {
  const h = new HDate(date), month = h.getMonth(), day = h.getDate();
  const elul = month === M.ELUL || (month === M.TISHREI && day <= 22);
  return String((flag(date, flags.ROSH_CHODESH) ? 1 : 0) | (elul ? 2 : 0));
}

const field = fn => days.map(day => fn(day)).join("");
const monthList = [];
for (let d = new HDate(before); ; ) {
  const first = new HDate(1, d.getMonth(), d.getFullYear());
  if (first.greg() > after) break;
  monthList.push([iso(first.greg()), first.getMonthName().replace(/'/g, "’"), first.renderGematriya(true).split(" ").slice(1, -1).join(" ").replace(/^חשון$/, "חשוון").replace(/^סיון$/, "סיוון"), first.getFullYear(), gematriya(first.getFullYear())]);
  d = new HDate(first.abs() + first.daysInMonth());
}
const omer = [];
for (let year = new HDate(before).getFullYear(); year <= new HDate(after).getFullYear(); year++) omer.push(iso(new HDate(15, M.NISAN, year).greg()));

/**
 * Each Shabbat's Torah reading outside Israel (@hebcal/leyning): the weekly portion, or a festival's
 * reading when Shabbat is a festival day, as [date, English, Hebrew, Torah ref, haftarah ref,
 * 1 if a weekly portion, special Shabbat in English and Hebrew or "", 1 if the new month is blessed]. The Torah cards show it (src/today.ts), with a link to it on Sefaria. From
 * the Shabbat before the range to some weeks after it, so "the next portion" is always known.
 */
const plain = text => text.normalize("NFC").replace(/[\u0591-\u05C7]/g, m => m === "\u05BE" ? "־" : "").replace(/^פרשת /, "");
const firstRange = ref => ref.split(/[;,] ?(?=[A-Z])/)[0].split(/, (?=\d)/)[0];
const shabbatot = [];
for (const ev of HebrewCalendar.calendar({ start: new Date(before.getTime() - 7 * 864e5), end: new Date(after.getTime() + 60 * 864e5), il: false, sedrot: true })) {
  if (ev.getDate().greg().getDay() !== 6) continue;
  const parasha = Boolean(ev.getFlags() & flags.PARSHA_HASHAVUA);
  if (!parasha && !(ev.getFlags() & (flags.CHAG | flags.CHOL_HAMOED))) continue;
  const reading = parasha ? getLeyningForParshaHaShavua(ev, false) : getLeyningForHoliday(ev, false);
  if (!reading?.summary) continue;
  const date = iso(ev.getDate().greg());
  if (shabbatot.some(s => s[0] === date)) continue;
  // A festival Shabbat's name, short enough for one line: "Rosh Hashana I", "Chol HaMoed Pesach".
  const en = reading.name.en.replace(/'/g, "’").replace(/ \(on Shabbat\)$/, "").replace(/^(\w+) Shabbat Chol ha-Moed$/, "Chol HaMoed $1");
  const he = plain(reading.name.he).replace(/ \(בשבת\)$/, "").replace(/^שבת חל המועד /, "חול המועד ");
  // The special Shabbat it is, if any (Shabbat Zachor, Shabbat Shuva…), and whether the new month is blessed.
  const special = (events.get(date) || []).find(e => e.getFlags() & flags.SPECIAL_SHABBAT);
  const mevarchim = (events.get(date) || []).some(e => e.getFlags() & flags.SHABBAT_MEVARCHIM);
  shabbatot.push([date, en, he, firstRange(reading.summary), reading.haftara ? firstRange(reading.haftara) : "", parasha ? 1 : 0, special ? special.render("en").replace(/'/g, "’") : "", special ? plain(special.render("he")) : "", mevarchim ? 1 : 0]);
}

const table = { from, to, months: monthList, shabbatot, numerals: Array.from({ length: 30 }, (_, i) => gematriya(i + 1)), omer, k: field(kind), t: field(tachanun), m: field(mincha), z: field(tzidkatcha), r: field(reading), p: field(psalms), f: field(fast) };
writeFileSync(new URL("../src/calendar.generated.json", import.meta.url), `${JSON.stringify(table)}\n`);
console.log(`Calendar ${from} to ${to}: ${days.length} days, ${table.months.length} Hebrew months.`);

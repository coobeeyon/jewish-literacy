import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { HDate, HebrewCalendar, flags } from "@hebcal/core";
import { noteRules } from "../src/notes";
import { daySummary, noteStatus, noteTimes, type CalendarTable } from "../src/today";
import { mockSefaria } from "./sefaria-mock";

// The date notes (src/today.ts, src/client/date.ts) and their calendar (scripts/calendar.mjs).
const table = JSON.parse(readFileSync(new URL("../src/calendar.generated.json", import.meta.url), "utf8")) as CalendarTable;

test.beforeEach(async ({ page }) => { await mockSefaria(page); });

/** Put each set of lines in turn into `el` (one span per line, as the page script does) and return those that do not fit one line each, or overflow the room kept. */
const misfits = (el: Element, all: string[][]) => {
  const out: string[] = [];
  // The room is kept by the element, or (for the day's line) by the date line that holds it.
  const holder = parseFloat(getComputedStyle(el).minHeight) ? el : el.parentElement!;
  const room = parseFloat(getComputedStyle(holder).minHeight);
  for (const lines of all) {
    el.replaceChildren(...lines.map((text, i) => {
      const span = document.createElement("span");
      const he = /[א-ת]/.test(text.replace(/[^א-תA-Za-z]/g, "").slice(0, 1));
      span.dataset.lang = he ? "he" : "en";
      if (he) span.className = "he";
      span.textContent = text;
      return span;
    }));
    const spans = [...el.children].filter(span => (span as HTMLElement).checkVisibility());
    const line = parseFloat(getComputedStyle(el).lineHeight);
    // Each line one line high and no wider than the box; the whole exactly the room kept.
    const box = el.getBoundingClientRect(), held = holder.getBoundingClientRect();
    if (spans.some(span => span.getClientRects().length !== 1 || span.getBoundingClientRect().width > box.width + 0.5) || Math.abs(held.height - room) > 0.5 || line <= 0) out.push(lines.join(" | "));
  }
  return out;
};


/** A calendar box's verdict sentence, in English or Hebrew. */
const verdict = (page: Page, note: string, lang: "en" | "he" = "en") => page.locator(`.calendar-box[data-note="${note}"]:visible .box-verdict [data-lang=${lang}]`).first();
/** An item's tag on the map. */
const tag = (page: Page, id: string, lang: "en" | "he" = "en") => page.locator(`#${id} > button > .today-mark [data-lang=${lang}]`).first();
/** Fix the browser's clock at noon local time on a civil date, so "today" is that date. */
const todayIs = (page: Page, iso: string) => page.clock.setFixedTime(new Date(`${iso}T12:00:00`));

test.describe("the calendar box", () => {
  // Every item whose prayer depends on the date opens with one: [path, note].
  const boxes = [
    ["/weekday/shacharit/tachanun", "tachanun-shacharit"], ["/weekday/shacharit/half-kaddish-2", "kaddish-after-tachanun"], ["/weekday/shacharit/torah-reading", "torah-weekday"],
    ["/weekday/shacharit/aleinu-and-closing-psalms", "daily-psalms"], ["/weekday/mincha/tachanun", "tachanun-mincha"], ["/weekday/maariv/concluding-prayers", "omer"],
    ["/shabbat/mincha/tzidkatcha", "tzidkatcha"], ["/shabbat/mincha/full-kaddish", "kaddish-after-tzidkatcha"],
  ] as const;
  test("opens at the top of each item whose prayer depends on the date, with its icon, header, rule and verdict", async ({ page }) => {
    await todayIs(page, "2026-10-07");
    for (const [path, note] of boxes) {
      await page.goto(path);
      const box = page.locator(`.calendar-box[data-note="${note}"]:visible`);
      await expect(box, path).toHaveCount(1);
      await expect(box.locator("svg.calendar-mark")).toHaveCount(1);
      await expect(box.locator(".box-head [data-lang=en]")).toHaveText("Depends on the date");
      await expect(box.locator(".box-head [data-lang=he]")).toHaveText("תלוי בתאריך");
      await expect(box.locator(".box-rule [data-lang=en]")).not.toBeEmpty();
      await expect(box.locator(".box-verdict b").first()).not.toBeEmpty();
      // At the top of the opened item, before its sections and text.
      const region = box.locator("xpath=..");
      expect(await region.evaluate((el, b) => [...el.children].find(c => (c as HTMLElement).checkVisibility()) === b, await box.elementHandle()), path).toBe(true);
      // Yellow, inscribed: a gold border on a pale yellow fill.
      expect(await box.evaluate(el => [getComputedStyle(el).borderTopColor, getComputedStyle(el).backgroundColor])).toEqual(["rgb(194, 139, 24)", "rgb(255, 246, 214)"]);
    }
  });

  test("its rules name the days: none refers back to another rule", () => {
    for (const [note, rule] of Object.entries(noteRules)) {
      expect(rule.en, note).not.toMatch(/days it is left out|would be left out|would not be said|most of them|the days it|as usual/i);
      expect(rule.he, note).not.toMatch(/בימים שאין אומרים אותו|לא היו אומרים/);
    }
    expect(noteRules["tachanun-mincha"].en).toMatch(/afternoon before Rosh Chodesh, Chanukah, Purim, Purim Katan, Tu BiShvat, Tu B’Av, Tisha B’Av or Lag BaOmer, on Friday afternoon/);
  });

  // [path with ?date=, note, verdict, what it checks]; today is Wednesday 7 October 2026.
  const cases: Array<[string, string, string, string]> = [
    ["/weekday/shacharit/tachanun?date=2026-10-13", "tachanun-shacharit", "Tue 13 Oct (2 Cheshvan): said — none of the exceptions applies.", "an ordinary weekday"],
    ["/weekday/shacharit/tachanun?date=2026-10-19", "tachanun-shacharit", "Mon 19 Oct (8 Cheshvan): said, with the longer Monday–Thursday additions — it’s Monday.", "a Monday"],
    ["/weekday/shacharit/tachanun?date=2026-10-12", "tachanun-shacharit", "Mon 12 Oct (1 Cheshvan): not said — it’s Rosh Chodesh.", "Rosh Chodesh"],
    ["/weekday/mincha/tachanun?date=2026-10-12", "tachanun-mincha", "Mon 12 Oct (1 Cheshvan): not said — it’s Rosh Chodesh.", "Rosh Chodesh, at Mincha"],
    ["/weekday/mincha/tachanun?date=2026-11-09", "tachanun-mincha", "Mon 9 Nov (29 Cheshvan): not said — it’s the afternoon before Rosh Chodesh.", "the afternoon before Rosh Chodesh"],
    ["/weekday/mincha/tachanun?date=2026-10-16", "tachanun-mincha", "Fri 16 Oct (5 Cheshvan): not said — it’s Friday afternoon, before Shabbat.", "Friday Mincha"],
    ["/weekday/mincha/tachanun?date=2027-08-11", "tachanun-mincha", "Wed 11 Aug (8 Av): not said — it’s the afternoon before Tisha B’Av.", "the afternoon before Tisha B'Av"],
    ["/weekday/shacharit/tachanun?date=2026-12-20", "tachanun-shacharit", "Sun 20 Dec (10 Tevet): said — none of the exceptions applies.", "a fast day: Tachanun said"],
    ["/weekday/shacharit/torah-reading?date=2026-12-20", "torah-weekday", "Sun 20 Dec (10 Tevet): the fast-day reading, three aliyot — it’s the Fast of 10 Tevet.", "a fast day: its reading"],
    ["/weekday/shacharit/torah-reading?date=2026-10-13", "torah-weekday", "Tue 13 Oct (2 Cheshvan): no Torah reading — it’s Tuesday; the weekday reading is on Mondays, Thursdays and special days.", "a Tuesday: no reading"],
    ["/weekday/shacharit/torah-reading?date=2026-10-19", "torah-weekday", "Mon 19 Oct (8 Cheshvan): Torah reading, three aliyot from the coming Shabbat’s portion — it’s Monday.", "a Monday: the reading"],
    ["/weekday/shacharit/torah-reading?date=2026-12-10", "torah-weekday", "Thu 10 Dec (30 Kislev): Rosh Chodesh and Chanukah, from two scrolls — Rosh Chodesh falls in Chanukah.", "Rosh Chodesh in Chanukah"],
    ["/weekday/shacharit/half-kaddish-2?date=2026-10-12", "kaddish-after-tachanun", "Mon 12 Oct (1 Cheshvan): after Hallel, as a Full Kaddish — it’s Rosh Chodesh: Hallel, and no Tachanun.", "Rosh Chodesh: after Hallel"],
    ["/weekday/shacharit/half-kaddish-2?date=2026-12-07", "kaddish-after-tachanun", "Mon 7 Dec (27 Kislev): after Hallel — it’s Chanukah: Hallel, and no Tachanun.", "Chanukah: after Hallel"],
    ["/weekday/shacharit/half-kaddish-2?date=2027-05-25", "kaddish-after-tachanun", "Tue 25 May (18 Iyyar): straight after the repetition — there is no Tachanun: it’s Lag BaOmer.", "Lag BaOmer: after the repetition"],
    ["/weekday/shacharit/aleinu-and-closing-psalms?date=2026-10-12", "daily-psalms", "Mon 12 Oct (1 Cheshvan): Psalms 48 and 104 — it’s Monday, and Rosh Chodesh.", "Rosh Chodesh on a Monday: two psalms"],
    ["/weekday/shacharit/tachanun?date=2027-06-16", "tachanun-shacharit", "Wed 16 Jun (11 Sivan): said in some synagogues — many omit it until 12 Sivan.", "11 Sivan: customs split"],
    ["/weekday/maariv/concluding-prayers?date=2027-05-14", "omer", "The evening of Fri 14 May (8 Iyyar begins): count day 23 of the Omer — the count runs from the second night of Pesach to Shavuot.", "an Omer evening"],
    ["/weekday/maariv/concluding-prayers?date=2027-04-21", "omer", "The evening of Wed 21 Apr (15 Nisan begins): no Omer count — the Omer is counted only from the second night of Pesach to the night before Shavuot.", "the first Seder night"],
    ["/weekday/maariv/concluding-prayers?date=2027-06-09", "omer", "The evening of Wed 9 Jun (5 Sivan begins): count day 49 of the Omer — the last evening before Shavuot.", "the night before Shavuot"],
    ["/shabbat/mincha/tzidkatcha?date=2026-10-17", "tzidkatcha", "Shabbat, 17 Oct (6 Cheshvan): said — none of the exceptions applies.", "a Shabbat with Tzidkatcha"],
    ["/shabbat/mincha/tzidkatcha?date=2026-10-10", "tzidkatcha", "This Shabbat, 10 Oct (29 Tishrei): not said — the next day is Rosh Chodesh.", "a Shabbat without Tzidkatcha"],
    ["/shabbat/mincha/full-kaddish?date=2026-10-08", "kaddish-after-tzidkatcha", "This Shabbat, 10 Oct (29 Tishrei): straight after the repetition — Tzidkatcha is not said: the next day is Rosh Chodesh.", "a Thursday reads the coming Shabbat"],
  ];
  for (const [path, note, expected, what] of cases) {
    test(`${what}: ${path}`, async ({ page }) => {
      await todayIs(page, "2026-10-07");
      await page.goto(path);
      await expect(verdict(page, note)).toHaveText(expected);
      // The verdict word is bold, and the Hebrew names the Hebrew date.
      await expect(page.locator(`.calendar-box[data-note="${note}"]:visible .box-verdict [data-lang=en] b`)).toHaveCount(1);
      await expect(verdict(page, note, "he")).toContainText(/ב(תשרי|חשוון|כסלו|טבת|שבט|אדר|ניסן|אייר|סיוון|תמוז|אב|אלול)/);
      await expect(verdict(page, note, "he")).not.toContainText(/\d+\.\d+/);
    });
  }

  test("today's verdicts say Today, Tonight and This Shabbat, and never just “said”", async ({ page }) => {
    await todayIs(page, "2026-10-14");
    await page.goto("/weekday/shacharit/tachanun");
    await expect(verdict(page, "tachanun-shacharit")).toHaveText("Today, Wed 14 Oct (3 Cheshvan): said — none of the exceptions applies.");
    await expect(verdict(page, "tachanun-shacharit", "he")).toHaveText("היום, ג׳ בחשוון: נאמר — אף אחד מהחריגים אינו חל.");
    await todayIs(page, "2026-10-12");
    await page.goto("/weekday/mincha/tachanun");
    await expect(verdict(page, "tachanun-mincha")).toHaveText("Today, Mon 12 Oct (1 Cheshvan): not said — it’s Rosh Chodesh.");
    await expect(verdict(page, "tachanun-mincha", "he")).toHaveText("היום, א׳ בחשוון: אינו נאמר — ראש חודש.");
    await expect(tag(page, "section-tachanun")).toHaveText("Not today—Rosh Chodesh");
    await todayIs(page, "2027-05-13");
    await page.goto("/weekday/maariv/concluding-prayers");
    await expect(verdict(page, "omer")).toHaveText("Tonight, Thu 13 May (7 Iyyar begins): count day 22 of the Omer — the count runs from the second night of Pesach to Shavuot.");
    await expect(verdict(page, "omer", "he")).toHaveText("הלילה, ליל ז׳ באייר: סופרים יום 22 לעומר — סופרים מליל שני של פסח עד שבועות.");
    await todayIs(page, "2026-10-10");
    await page.goto("/shabbat/mincha/tzidkatcha");
    await expect(verdict(page, "tzidkatcha")).toHaveText("This Shabbat, 10 Oct (29 Tishrei): not said — the next day is Rosh Chodesh.");
    // Nowhere on any of these pages does a bare "Today: said" appear.
    for (const path of ["/weekday/shacharit", "/weekday/shacharit/tachanun", "/weekday/mincha/tachanun", "/shabbat/mincha/tzidkatcha"]) {
      await page.goto(path);
      expect(await page.locator("main").innerText(), path).not.toMatch(/Today: said\b/);
    }
  });

  test("a weekday map on Shabbat or a festival says so", async ({ page }) => {
    await todayIs(page, "2026-10-07");
    await page.goto("/weekday/shacharit/tachanun?date=2026-10-10");
    await expect(verdict(page, "tachanun-shacharit")).toHaveText("Shabbat 10 Oct (29 Tishrei): not said — it’s Shabbat; see the Shabbat maps.");
    await page.goto("/weekday/shacharit/tachanun?date=2027-04-22");
    await expect(verdict(page, "tachanun-shacharit")).toHaveText("Thu 22 Apr (15 Nisan): not said — it’s a festival, with its own service.");
  });

  test("an opened item is at full contrast, above the map's spine", async ({ page }) => {
    await todayIs(page, "2026-10-07");
    for (const path of ["/weekday/mincha/tachanun?date=2026-10-12", "/shabbat/mincha/tzidkatcha?date=2026-10-10", "/weekday/shacharit/torah-reading?date=2026-10-13"]) {
      await page.goto(path);
      const id = path.split("/")[3].split("?")[0];
      const item = page.locator(`#section-${id}`);
      // Marked off, but not dimmed while open.
      await expect(page.locator("main [data-today=off]").first()).toBeAttached();
      for (const el of [item, ...(await page.locator("main [data-today=off]").all())]) {
        if (!(await el.evaluate(e => e.querySelector(":scope > button")?.getAttribute("aria-expanded") === "true" || e.hasAttribute("data-open")))) continue;
        expect(await el.evaluate(e => getComputedStyle(e).opacity), path).toBe("1");
      }
      // The spine (the map's center line) is behind the open item: down its middle, the item is on top.
      await item.evaluate(el => el.scrollIntoView({ block: "start", behavior: "instant" }));
      const covered = await item.evaluate(el => {
        const map = el.closest(".service-map")!.getBoundingClientRect(), r = el.getBoundingClientRect(), x = map.left + map.width / 2;
        const out: number[] = [];
        for (let y = Math.max(r.top, 0) + 8; y < Math.min(r.bottom, innerHeight) - 8; y += 24) { const hit = document.elementFromPoint(x, y); out.push(hit && (hit === el || el.contains(hit)) ? 1 : 0); }
        return out;
      });
      expect(covered.length, path).toBeGreaterThan(5);
      expect(covered.every(Boolean), path).toBe(true);
      await page.evaluate(() => scrollTo(0, 0));
    }
  });
});

test.describe("the date line", () => {
  test("shows today with its Hebrew date, steps a day either way, and comes back to today", async ({ page }) => {
    await todayIs(page, "2026-10-07");
    await page.goto("/weekday/shacharit/tachanun");
    const line = page.locator(".date-line");
    await expect(line.locator("[data-date-text] [data-lang=en]")).toHaveText("Today · 26 Tishrei 5787");
    await expect(line.locator("[data-date-today]")).toBeHidden();
    await expect(verdict(page, "tachanun-shacharit")).toHaveText("Today, Wed 7 Oct (26 Tishrei): said — none of the exceptions applies.");
    // Forward five days: Monday 12 October, Rosh Chodesh.
    for (let i = 0; i < 5; i++) await line.getByRole("button", { name: "Next day" }).click();
    await expect(page).toHaveURL(/\/weekday\/shacharit\/tachanun\?date=2026-10-12$/);
    await expect(line.locator("[data-date-text] [data-lang=en]")).toHaveText("Mon 12 Oct · 1 Cheshvan 5787");
    await expect(verdict(page, "tachanun-shacharit")).toHaveText("Mon 12 Oct (1 Cheshvan): not said — it’s Rosh Chodesh.");
    await line.getByRole("button", { name: "Previous day" }).click();
    await expect(page).toHaveURL(/\?date=2026-10-11$/);
    await expect(line.locator("[data-date-text] [data-lang=en]")).toHaveText("Sun 11 Oct · 30 Tishrei 5787");
    await expect(verdict(page, "tachanun-shacharit")).toHaveText("Sun 11 Oct (30 Tishrei): not said — it’s Rosh Chodesh.");
    // Back to today: the URL is clean again.
    await line.locator("[data-date-today]").click();
    await expect(page).toHaveURL(/\/weekday\/shacharit\/tachanun$/);
    await expect(line.locator("[data-date-today]")).toBeHidden();
    await expect(verdict(page, "tachanun-shacharit")).toHaveText("Today, Wed 7 Oct (26 Tishrei): said — none of the exceptions applies.");
  });

  test("the date picker sets the date", async ({ page }) => {
    await todayIs(page, "2026-10-07");
    await page.goto("/weekday/maariv/concluding-prayers");
    await page.locator(".date-input").fill("2027-05-14");
    await expect(page).toHaveURL(/\?date=2027-05-14$/);
    await expect(verdict(page, "omer")).toContainText("The evening of Fri 14 May (8 Iyyar begins): count day 23 of the Omer");
    await expect(page.locator(".date-line [data-date-text] [data-lang=en]")).toHaveText("Fri 14 May · 7 Iyyar 5787");
  });

  test("a ?date= link keeps its date as items open and maps switch; Back and Forward keep each entry's", async ({ page }) => {
    await todayIs(page, "2026-10-07");
    await page.goto("/weekday/shacharit?date=2026-10-12");
    await page.locator("#section-tachanun>button").click();
    await expect(page).toHaveURL(/\/weekday\/shacharit\/tachanun\?date=2026-10-12$/);
    await expect(verdict(page, "tachanun-shacharit")).toHaveText("Mon 12 Oct (1 Cheshvan): not said — it’s Rosh Chodesh.");
    // A box opened from a template is complete at once: icon, header, rule and verdict.
    const tapped = page.locator('.calendar-box[data-note="tachanun-shacharit"]:visible');
    await expect(tapped.locator("svg.calendar-mark")).toHaveCount(1);
    await expect(tapped.locator(".box-head [data-lang=en]")).toHaveText("Depends on the date");
    await expect(tapped.locator(".box-rule [data-lang=en]")).toContainText("It is not said on Shabbat, festivals, Rosh Chodesh");
    await page.locator('[data-service-choice="mincha"]').click();
    await expect(page).toHaveURL(/\/weekday\/mincha\?date=2026-10-12$/);
    await page.locator("#section-tachanun>button").click();
    await expect(page).toHaveURL(/\/weekday\/mincha\/tachanun\?date=2026-10-12$/);
    await expect(verdict(page, "tachanun-mincha")).toHaveText("Mon 12 Oct (1 Cheshvan): not said — it’s Rosh Chodesh.");
    // A new date replaces this entry's; the entries before keep theirs.
    await page.locator(".date-line").getByRole("button", { name: "Next day" }).click();
    await expect(page).toHaveURL(/\/weekday\/mincha\/tachanun\?date=2026-10-13$/);
    await expect(verdict(page, "tachanun-mincha")).toHaveText("Tue 13 Oct (2 Cheshvan): said — none of the exceptions applies.");
    await page.goBack();
    await expect(page).toHaveURL(/\/weekday\/mincha\?date=2026-10-12$/);
    await expect(page.locator(".date-line [data-date-text] [data-lang=en]")).toHaveText("Mon 12 Oct · 1 Cheshvan 5787");
    await page.goForward();
    await expect(page).toHaveURL(/\?date=2026-10-13$/);
    await expect(verdict(page, "tachanun-mincha")).toHaveText("Tue 13 Oct (2 Cheshvan): said — none of the exceptions applies.");
  });

  test("a date outside the calendar shows the rule and says it is not covered; a malformed one means today", async ({ page }) => {
    await todayIs(page, "2026-10-07");
    await page.goto("/weekday/shacharit/tachanun?date=2030-01-01");
    await expect(verdict(page, "tachanun-shacharit")).toHaveText("Tue 1 Jan: not in the calendar — the calendar runs to 31 Oct 2028.");
    await expect(page.locator('.calendar-box[data-note="tachanun-shacharit"]:visible .box-rule [data-lang=en]')).toContainText("It is not said on Shabbat, festivals");
    await expect(page.locator(".date-line [data-date-text] [data-lang=en]")).toHaveText("Tue 1 Jan · not in the calendar");
    await expect(page.locator(".date-line [data-date-today]")).toBeVisible();
    for (const bad of ["2026-02-30", "tomorrow", "2026-1-5"]) {
      await page.goto(`/weekday/shacharit/tachanun?date=${bad}`);
      await expect(verdict(page, "tachanun-shacharit")).toHaveText("Today, Wed 7 Oct (26 Tishrei): said — none of the exceptions applies.");
    }
  });
});

test.describe("no layout shift", () => {
  /** Sum of layout shifts not caused by input, from the start of the page. */
  const watchShifts = (page: Page) => page.addInitScript(() => {
    const w = window as unknown as { shift: number };
    w.shift = 0;
    new PerformanceObserver(list => { for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) w.shift += e.value; }).observe({ type: "layout-shift", buffered: true });
  });

  for (const language of ["both", "en", "he"] as const) {
    test(`deep links with a date note or a Torah reading open, and the date line, do not move as they are filled (${language})`, async ({ page }) => {
      await watchShifts(page);
      await todayIs(page, "2026-10-07");
      await page.addInitScript(l => localStorage.setItem("weekday-shacharit-language", l), language);
      // Hold the page script back a moment, so the page paints before it fills anything in.
      await page.route("**/_astro/*.js", async route => { await new Promise(r => setTimeout(r, 300)); await route.fallback(); });
      for (const path of ["/weekday/shacharit/tachanun?date=2026-12-10", "/weekday/shacharit/half-kaddish-2?date=2026-11-23", "/shabbat/mincha/full-kaddish?date=2026-11-07", "/weekday/maariv/concluding-prayers?date=2027-05-14", "/weekday/shacharit/torah?date=2026-10-12", "/shabbat/mincha/tzidkatcha?date=2026-10-10", "/weekday/shacharit/tachanun?date=2026-10-12", "/shabbat/shacharit/torah-service", "/weekday/shacharit/torah-reading?date=2026-12-10", "/shabbat/mincha/torah-service", "/weekday/shacharit"]) {
        await page.goto(path);
        await expect(page.locator(".date-line [data-date-text]")).toBeVisible();
        await page.waitForTimeout(200);
        expect(await page.evaluate(() => (window as unknown as { shift: number }).shift), path).toBe(0);
      }
    });
  }

  test("every Torah reading in the table is one line in each language, in exactly the room kept", async ({ page }) => {
    test.skip(test.info().project.name !== "phone-320", "the narrowest width");
    const dash = (ref: string) => ref.replace(/-/g, "–");
    for (const [path, haftarah] of [["/weekday/shacharit/torah-reading", false], ["/shabbat/shacharit/torah-service", true], ["/shabbat/mincha/torah-service", false]] as const) {
      const lines = table.shabbatot.map(([, en, he, torah, haft]) => haftarah
        ? [en, dash(torah), `Haftarah: ${dash(haft)}`, he, `הפטרה: ${dash(haft)}`]
        : [en, dash(torah), he]);
      for (const language of ["both", "en", "he"] as const) {
        await page.goto(path);
        await page.evaluate(l => { document.documentElement.dataset.language = l; }, language);
        const out = await page.locator(".reader-calendar:visible .calendar-reading").first().evaluate(misfits, lines);
        expect.soft(out, `${path} (${language})`).toEqual([]);
      }
    }
  });
});

test.describe("the day line and the map", () => {
  const summary = (page: Page, lang: "en" | "he" = "en") => page.locator(`.day-summary [data-lang=${lang}]`);
  /** Each marked item on the map: its id (or mark), on/off, and its label. */
  const marks = (page: Page) => page.locator("main [data-mark]:not(.chips>li)").evaluateAll(els => Object.fromEntries(els.map(e => [e.id, [e.getAttribute("data-today") || "", e.querySelector(".today-mark [data-lang=en]")?.textContent || ""]])));
  const days: Array<[string, string, string, Record<string, [string, string]>]> = [
    ["an ordinary Tuesday", "/weekday/shacharit?date=2026-10-13", "Tuesday: an ordinary weekday",
      { "section-tachanun": ["", "Said on 13 Oct—no exception"], "section-half-kaddish-2": ["", "After Tachanun on 13 Oct"], "movement-torah": ["off", "Not on 13 Oct—only Mon and Thu"] }],
    ["a Monday", "/weekday/shacharit?date=2026-10-19", "Monday: Torah reading, longer Tachanun",
      { "section-tachanun": ["", "Said on 19 Oct—longer form"], "section-half-kaddish-2": ["", "After Tachanun on 19 Oct"], "movement-torah": ["on", "On 19 Oct: 3 aliyot"] }],
    ["Rosh Chodesh", "/weekday/shacharit?date=2026-10-12", "Rosh Chodesh: Ya’aleh Veyavo, Hallel, Musaf",
      { "section-tachanun": ["off", "Not on 12 Oct—Rosh Chodesh"], "section-half-kaddish-2": ["", "After Hallel on 12 Oct"], "movement-torah": ["on", "On 12 Oct: Rosh Chodesh, 4 aliyot"] }],
    ["a fast day, morning", "/weekday/shacharit?date=2026-12-20", "Fast of 10 Tevet: Selichot, Avinu Malkeinu",
      { "section-tachanun": ["", "Said on 20 Dec—no exception"], "section-half-kaddish-2": ["", "After Tachanun on 20 Dec"], "movement-torah": ["on", "On 20 Dec: fast day, 3 aliyot"] }],
    ["a fast day, afternoon", "/weekday/mincha?date=2026-12-20", "Fast of 10 Tevet: Torah reading, Aneinu",
      { "section-tachanun": ["", "Said on 20 Dec—no exception"] }],
    ["Chanukah", "/weekday/shacharit?date=2026-12-07", "Chanukah: Al HaNisim, Hallel, Torah reading",
      { "section-tachanun": ["off", "Not on 7 Dec—Chanukah"], "section-half-kaddish-2": ["", "After Hallel on 7 Dec"], "movement-torah": ["on", "On 7 Dec: Chanukah, 3 aliyot"] }],
    ["an evening in the Omer", "/weekday/maariv?date=2027-05-13", "That evening: day 22 of the Omer",
      { "section-concluding-prayers": ["on", "The evening of 13 May: Omer day 22"] }],
    ["an evening outside the Omer", "/weekday/maariv?date=2026-10-13", "An ordinary weekday evening",
      { "section-concluding-prayers": ["off", "No Omer count the evening of 13 Oct"] }],
    ["a Shabbat with no Tzidkatcha", "/shabbat/mincha?date=2026-10-10", "No Tzidkatcha: Erev Rosh Chodesh",
      { "section-tzidkatcha": ["off", "Not on 10 Oct—Erev Rosh Chodesh"], "section-full-kaddish": ["", "After the repetition on 10 Oct"] }],
    ["an ordinary Shabbat afternoon", "/shabbat/mincha?date=2026-10-17", "Torah: the opening of Lech-Lecha",
      { "section-tzidkatcha": ["", "Said on 17 Oct—no exception"], "section-full-kaddish": ["", "After Tzidkatcha on 17 Oct"] }],
  ];
  for (const [what, path, line, marked] of days) {
    test(`${what}: the day's line and what the map marks on and off`, async ({ page }) => {
      await todayIs(page, "2026-10-07");
      await page.goto(path);
      await expect(summary(page)).toHaveText(line);
      await expect(summary(page, "he")).not.toBeEmpty();
      await expect.poll(() => marks(page)).toEqual(marked);
      // Off is never color alone: dimmed with a dashed edge, and labelled.
      for (const [id, [state]] of Object.entries(marked)) if (state === "off" && id !== "section-concluding-prayers") {
        expect(await page.locator(`#${id}`).evaluate(el => [getComputedStyle(el).opacity, getComputedStyle(el).borderTopStyle])).toEqual(["0.55", "dashed"]);
      }
    });
  }

  test("today's own line, and the breakdown entries the date turns on or off", async ({ page }) => {
    await todayIs(page, "2027-05-13");
    await page.goto("/weekday/maariv/concluding-prayers");
    await expect(summary(page)).toHaveText("Tonight: day 22 of the Omer");
    await expect(page.locator('.chips>li[data-mark="omer"]:visible')).toHaveAttribute("data-today", "on");
    await todayIs(page, "2026-10-19");
    await page.goto("/weekday/shacharit/tachanun");
    await expect(page.locator('.chips>li[data-mark="monday-thursday"]:visible')).toHaveAttribute("data-today", "on");
    await page.goto("/weekday/shacharit/tachanun?date=2026-10-20");
    await expect(page.locator('.chips>li[data-mark="monday-thursday"]:visible')).toHaveAttribute("data-today", "off");
    // The line follows the date line.
    await page.locator(".date-line").getByRole("button", { name: "Previous day" }).click();
    await expect(summary(page)).toHaveText("Monday: Torah reading, longer Tachanun");
  });

  test("the day's line, and every label on the map, is one line in each language at the narrowest width", async ({ page }) => {
    test.skip(test.info().project.name !== "phone-320", "the narrowest width");
    const every = (fn: (iso: string) => string[]) => {
      const out = new Set<string>();
      for (let d = new Date(`${table.from}T12:00:00`); ; d.setDate(d.getDate() + 1)) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (iso > table.to) break;
        out.add(JSON.stringify(fn(iso)));
      }
      return [...out].map(json => JSON.parse(json) as string[]);
    };
    const maps = [["weekday", "shacharit"], ["weekday", "mincha"], ["weekday", "maariv"], ["shabbat", "maariv"], ["shabbat", "shacharit"], ["shabbat", "musaf"], ["shabbat", "mincha"]];
    for (const language of ["both", "en", "he"] as const) {
      for (const [day, service] of maps) {
        await page.goto(`/${day}/${service}`);
        await page.evaluate(l => { document.documentElement.dataset.language = l; }, language);
        const lines = every(iso => { const w = daySummary(table, day, service, iso, "2000-01-01"), t = daySummary(table, day, service, iso, iso); return [w.en, w.he, t.en, t.he]; }).flatMap(([a, b, c, d]) => [[a, b], [c, d]]);
        expect.soft(await page.locator(".day-summary").evaluate(misfits, lines), `${day}/${service} (${language})`).toEqual([]);
        for (const mark of await page.locator("main [data-mark]:not(.chips>li)").all()) {
          const note = (await mark.getAttribute("data-mark"))!;
          const labels = every(iso => { const w = noteStatus(table, note, iso, "2000-01-01"), t = noteStatus(table, note, iso, iso); return [w.en, w.he, t.en, t.he]; }).flatMap(([a, b, c, d]) => [[a, b], [c, d]]);
          expect.soft(await mark.locator(".today-mark").evaluate(misfits, labels), `${day}/${service} ${note} (${language})`).toEqual([]);
        }
      }
    }
  });
});

test.describe("the calendar table", () => {
  test.beforeEach(() => { test.skip(test.info().project.name !== "phone-390", "no browser needed"); });

  /** Each civil day of the table with its hebcal events (outside Israel). */
  function* days() {
    const events = new Map<string, string[]>();
    for (const ev of HebrewCalendar.calendar({ start: new Date(`${table.from}T12:00:00`), end: new Date(`${table.to}T12:00:00`), il: false })) {
      const g = ev.getDate().greg(), key = `${g.getFullYear()}-${String(g.getMonth() + 1).padStart(2, "0")}-${String(g.getDate()).padStart(2, "0")}`;
      events.set(key, [...(events.get(key) || []), `${ev.getDesc()}|${ev.getFlags()}`]);
    }
    let i = 0;
    for (let d = new Date(`${table.from}T12:00:00`); i < table.t.length; d.setDate(d.getDate() + 1), i++) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      yield { iso, i, date: new Date(d), events: events.get(iso) || [] };
    }
  }

  test("every note has its rule and its reading of the calendar, and the content uses them all", () => {
    // Every note reads the calendar; one more reading marks a breakdown entry only (the Monday–Thursday additions).
    expect([...Object.keys(noteRules), "monday-thursday"].sort()).toEqual(Object.keys(noteTimes).sort());
    const content = readFileSync(new URL("../content/roadmap.html", import.meta.url), "utf8");
    expect([...new Set([...content.matchAll(/calendar-note note-([a-z-]+)/g)].map(m => m[1]))].sort()).toEqual(Object.keys(noteRules).sort());
    expect([...content.matchAll(/ mark-([a-z-]+)/g)].map(m => m[1]).sort()).toEqual(["monday-thursday", "omer"]);
  });

  test("covers its range, a day per character in every field", () => {
    const length = Math.round((Date.parse(`${table.to}T12:00:00`) - Date.parse(`${table.from}T12:00:00`)) / 864e5) + 1;
    for (const field of ["k", "t", "m", "z", "r", "p"] as const) expect(table[field], field).toHaveLength(length);
    expect(readFileSync(new URL("../README.md", import.meta.url), "utf8")).toContain("**The table covers 1 September 2026 to 31 October 2028.**");
    expect([table.from, table.to]).toEqual(["2026-09-01", "2028-10-31"]);
  });

  test("agrees with hebcal on Rosh Chodesh, Chanukah, fasts, festivals and Shabbat", () => {
    const has = (events: string[], pattern: RegExp, flag?: number) => events.some(e => { const [desc, f] = e.split("|"); return pattern.test(desc) && (!flag || (Number(f) & flag)); });
    for (const { iso, i, date, events } of days()) {
      const rc = has(events, /^Rosh Chodesh/, flags.ROSH_CHODESH);
      const chag = has(events, /./, flags.CHAG), cholHamoed = has(events, /./, flags.CHOL_HAMOED);
      const kind = chag ? "Y" : cholHamoed ? "H" : date.getDay() === 6 ? "S" : "-";
      expect(table.k[i], iso).toBe(kind);
      if (kind === "-") {
        if (rc) expect(table.t[i], `${iso} Rosh Chodesh`).toBe("R");
        const fast = has(events, /^(Tzom Gedaliah|Asara B'Tevet|Ta'anit Esther|Tzom Tammuz)$/);
        if (fast) { expect(table.r[i], `${iso} fast`).toBe("F"); expect(table.t[i], `${iso} Tachanun on a fast`).toBe("-"); }
        if (has(events, /^Tish'a B'Av$/)) { expect(table.t[i]).toBe("A"); expect(table.r[i]).toBe("A"); }
        if (new HDate(date).getMonth() === 1) expect(table.t[i], `${iso} Nisan`).toMatch(/[NR]/);
        if (date.getDay() === 5) expect(table.m[i], `${iso} Friday`).not.toBe("-");
      }
    }
  });
});

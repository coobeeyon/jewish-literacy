import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { HDate, HebrewCalendar, flags } from "@hebcal/core";
import { noteRules } from "../src/notes";
import { noteStatus, noteTimes, type CalendarTable } from "../src/today";
import { mockSefaria } from "./sefaria-mock";

// The date notes (src/today.ts, src/client/date.ts) and their calendar (scripts/calendar.mjs).
const table = JSON.parse(readFileSync(new URL("../src/calendar.generated.json", import.meta.url), "utf8")) as CalendarTable;

test.beforeEach(async ({ page }) => { await mockSefaria(page); });

const status = (page: Page, note: string) => page.locator(`[data-note="${note}"]:visible [data-note-status] [data-lang=en]`).first();
const statusHe = (page: Page, note: string) => page.locator(`[data-note="${note}"]:visible [data-note-status] [data-lang=he]`).first();
/** Fix the browser's clock at noon local time on a civil date, so "today" is that date. */
const todayIs = (page: Page, iso: string) => page.clock.setFixedTime(new Date(`${iso}T12:00:00`));

test.describe("statuses for fixed dates", () => {
  const cases: Array<[string, string, string, string]> = [
    // [path with ?date=, note, English status, what it checks]; today is Wednesday 7 October 2026.
    ["/weekday/shacharit/tachanun?date=2026-10-12", "tachanun-shacharit", "12 Oct: none—Rosh Chodesh", "Rosh Chodesh (1 Cheshvan)"],
    ["/weekday/shacharit/half-kaddish-2?date=2026-10-12", "kaddish-after-tachanun", "12 Oct: after Hallel, as Full Kaddish", "Rosh Chodesh: Hallel, then Full Kaddish"],
    ["/weekday/shacharit/torah-reading?date=2026-10-12", "torah-weekday", "12 Oct: Rosh Chodesh, 4 aliyot", "Rosh Chodesh reading"],
    ["/weekday/shacharit/aleinu-and-closing-psalms?date=2026-10-12", "daily-psalms", "12 Oct: Psalms 48 and 104", "Monday's psalm and Rosh Chodesh's"],
    ["/weekday/mincha/tachanun?date=2026-11-09", "tachanun-mincha", "9 Nov: none—Erev Rosh Chodesh", "the afternoon before Rosh Chodesh Kislev"],
    ["/weekday/shacharit/tachanun?date=2026-11-09", "tachanun-shacharit", "9 Nov: said, the long form", "that morning, an ordinary Monday"],
    ["/weekday/shacharit/torah-reading?date=2026-10-19", "torah-weekday", "19 Oct: Torah reading, 3 aliyot", "an ordinary Monday"],
    ["/weekday/shacharit/torah-reading?date=2026-10-20", "torah-weekday", "20 Oct: no reading", "an ordinary Tuesday"],
    ["/weekday/shacharit/torah-reading?date=2026-12-20", "torah-weekday", "20 Dec: fast day, 3 aliyot", "the fast of 10 Tevet"],
    ["/weekday/shacharit/tachanun?date=2026-12-20", "tachanun-shacharit", "20 Dec: said", "Tachanun on a fast day"],
    ["/weekday/shacharit/half-kaddish-2?date=2026-12-07", "kaddish-after-tachanun", "7 Dec: after Hallel", "Chanukah: Hallel, then Half Kaddish"],
    ["/weekday/shacharit/half-kaddish-2?date=2027-01-23", "kaddish-after-tachanun", "23 Jan: it’s Shabbat", "Tu BiShvat on Shabbat"],
    ["/weekday/shacharit/half-kaddish-2?date=2027-05-25", "kaddish-after-tachanun", "25 May: after the repetition", "Lag BaOmer: no Tachanun, no Hallel"],
    ["/weekday/shacharit/torah-reading?date=2026-12-10", "torah-weekday", "10 Dec: 2 scrolls, 4 aliyot", "Rosh Chodesh Tevet in Chanukah"],
    ["/weekday/mincha/tachanun?date=2026-10-16", "tachanun-mincha", "16 Oct: none—Erev Shabbat", "Friday afternoon"],
    ["/weekday/mincha/tachanun?date=2027-08-11", "tachanun-mincha", "11 Aug: none—Erev Tisha B’Av", "the afternoon before Tisha B'Av"],
    ["/weekday/shacharit/tachanun?date=2027-06-16", "tachanun-shacharit", "16 Jun: customs vary", "after Shavuot, before 13 Sivan"],
    ["/weekday/shacharit/tachanun?date=2027-05-12", "tachanun-shacharit", "12 May: customs vary", "Yom HaAtzmaut"],
    ["/weekday/maariv/concluding-prayers?date=2027-05-14", "omer", "14 May, eve: Omer day 23", "a day in the Omer"],
    ["/weekday/maariv/concluding-prayers?date=2027-04-21", "omer", "21 Apr, eve: no Omer count", "the first Seder night: no count yet"],
    ["/weekday/maariv/concluding-prayers?date=2027-04-22", "omer", "22 Apr, eve: Omer day 1", "the second night of Pesach"],
    ["/weekday/maariv/concluding-prayers?date=2027-06-09", "omer", "9 Jun, eve: Omer day 49", "the night before Shavuot"],
    ["/shabbat/mincha/tzidkatcha?date=2026-10-17", "tzidkatcha", "17 Oct: said", "an ordinary Shabbat"],
    ["/shabbat/mincha/tzidkatcha?date=2026-10-10", "tzidkatcha", "10 Oct: none—Erev Rosh Chodesh", "a Shabbat before Rosh Chodesh (this week's)"],
    ["/shabbat/mincha/full-kaddish?date=2026-10-08", "kaddish-after-tzidkatcha", "10 Oct: after the repetition", "Thursday's date reads the coming Shabbat"],
    ["/shabbat/mincha/full-kaddish?date=2026-10-15", "kaddish-after-tzidkatcha", "17 Oct: after Tzidkatcha", "next week's Shabbat"],
  ];
  for (const [path, note, expected, what] of cases) {
    test(`${what}: ${path}`, async ({ page }) => {
      await todayIs(page, "2026-10-07");
      await page.goto(path);
      await expect(status(page, note)).toHaveText(expected);
      await expect(statusHe(page, note)).not.toBeEmpty();
    });
  }

  test("today's own words: Today and Tonight", async ({ page }) => {
    // A Monday that is Rosh Chodesh.
    await todayIs(page, "2026-10-12");
    await page.goto("/weekday/shacharit/tachanun");
    await expect(status(page, "tachanun-shacharit")).toHaveText("Today: none—Rosh Chodesh");
    await expect(statusHe(page, "tachanun-shacharit")).toHaveText("היום: אינו נאמר — ראש חודש");
    await page.goto("/weekday/shacharit/torah-reading");
    await expect(status(page, "torah-weekday")).toHaveText("Today: Rosh Chodesh, 4 aliyot");
    // Maariv: the evening of the Thursday before belongs to Friday, a day of the Omer.
    await todayIs(page, "2027-05-13");
    await page.goto("/weekday/maariv/concluding-prayers");
    await expect(status(page, "omer")).toHaveText("Tonight: Omer day 22");
    await todayIs(page, "2026-10-10");
    await page.goto("/shabbat/mincha/tzidkatcha");
    await expect(status(page, "tzidkatcha")).toHaveText("Today: none—Erev Rosh Chodesh");
    await expect(statusHe(page, "tzidkatcha")).toHaveText("היום: אינה נאמרת — ערב ראש חודש");
  });

  test("a weekday map on Shabbat or a festival says so", async ({ page }) => {
    await todayIs(page, "2026-10-07");
    await page.goto("/weekday/shacharit/tachanun?date=2026-10-10");
    await expect(status(page, "tachanun-shacharit")).toHaveText("10 Oct: it’s Shabbat");
    await page.goto("/weekday/shacharit/tachanun?date=2027-04-22");
    await expect(status(page, "tachanun-shacharit")).toHaveText("22 Apr: it’s a festival");
  });
});

test.describe("the date line", () => {
  test("shows today with its Hebrew date, steps a day either way, and comes back to today", async ({ page }) => {
    await todayIs(page, "2026-10-07");
    await page.goto("/weekday/shacharit/tachanun");
    const line = page.locator(".date-line");
    await expect(line.locator("[data-date-text] [data-lang=en]")).toHaveText("Today · 26 Tishrei 5787");
    await expect(line.locator("[data-date-text] [data-lang=he]")).toHaveText("היום · כ״ו בתשרי תשפ״ז");
    await expect(line.locator("[data-date-today]")).toBeHidden();
    await expect(status(page, "tachanun-shacharit")).toHaveText("Today: said");
    // Forward five days: Monday 12 October, Rosh Chodesh.
    for (let i = 0; i < 5; i++) await line.getByRole("button", { name: "Next day" }).click();
    await expect(page).toHaveURL(/\/weekday\/shacharit\/tachanun\?date=2026-10-12$/);
    await expect(line.locator("[data-date-text] [data-lang=en]")).toHaveText("Mon 12 Oct · 1 Cheshvan 5787");
    await expect(status(page, "tachanun-shacharit")).toHaveText("12 Oct: none—Rosh Chodesh");
    await line.getByRole("button", { name: "Previous day" }).click();
    await expect(page).toHaveURL(/\?date=2026-10-11$/);
    await expect(line.locator("[data-date-text] [data-lang=en]")).toHaveText("Sun 11 Oct · 30 Tishrei 5787");
    await expect(status(page, "tachanun-shacharit")).toHaveText("11 Oct: none—Rosh Chodesh");
    await line.getByRole("button", { name: "Previous day" }).click();
    await expect(status(page, "tachanun-shacharit")).toHaveText("10 Oct: it’s Shabbat");
    // Back to today: the URL is clean again.
    await line.locator("[data-date-today]").click();
    await expect(page).toHaveURL(/\/weekday\/shacharit\/tachanun$/);
    await expect(line.locator("[data-date-today]")).toBeHidden();
    await expect(status(page, "tachanun-shacharit")).toHaveText("Today: said");
  });

  test("the date picker sets the date", async ({ page }) => {
    await todayIs(page, "2026-10-07");
    await page.goto("/weekday/maariv/concluding-prayers");
    await page.locator(".date-input").fill("2027-05-14");
    await expect(page).toHaveURL(/\?date=2027-05-14$/);
    await expect(status(page, "omer")).toHaveText("14 May, eve: Omer day 23");
    await expect(page.locator(".date-line [data-date-text] [data-lang=en]")).toHaveText("Fri 14 May · 7 Iyyar 5787");
  });

  test("a ?date= link keeps its date as items open and maps switch; Back and Forward keep each entry's", async ({ page }) => {
    await todayIs(page, "2026-10-07");
    await page.goto("/weekday/shacharit?date=2026-10-12");
    await page.locator("#section-tachanun>button").click();
    await expect(page).toHaveURL(/\/weekday\/shacharit\/tachanun\?date=2026-10-12$/);
    await expect(status(page, "tachanun-shacharit")).toHaveText("12 Oct: none—Rosh Chodesh");
    // A note opened from a template is worded at once.
    await page.locator('[data-service-choice="mincha"]').click();
    await expect(page).toHaveURL(/\/weekday\/mincha\?date=2026-10-12$/);
    await page.locator("#section-tachanun>button").click();
    await expect(page).toHaveURL(/\/weekday\/mincha\/tachanun\?date=2026-10-12$/);
    await expect(status(page, "tachanun-mincha")).toHaveText("12 Oct: none—Rosh Chodesh");
    // A new date replaces this entry's; the entries before keep theirs.
    await page.locator(".date-line").getByRole("button", { name: "Next day" }).click();
    await expect(page).toHaveURL(/\/weekday\/mincha\/tachanun\?date=2026-10-13$/);
    await expect(status(page, "tachanun-mincha")).toHaveText("13 Oct: said");
    await page.goBack();
    await expect(page).toHaveURL(/\/weekday\/mincha\?date=2026-10-12$/);
    await expect(page.locator(".date-line [data-date-text] [data-lang=en]")).toHaveText("Mon 12 Oct · 1 Cheshvan 5787");
    await page.goForward();
    await expect(page).toHaveURL(/\?date=2026-10-13$/);
    await expect(status(page, "tachanun-mincha")).toHaveText("13 Oct: said");
  });

  test("a date outside the calendar shows the rule and says it is not covered; a malformed one means today", async ({ page }) => {
    await todayIs(page, "2026-10-07");
    await page.goto("/weekday/shacharit/tachanun?date=2030-01-01");
    await expect(status(page, "tachanun-shacharit")).toHaveText("1 Jan: not in the calendar");
    await expect(page.locator('[data-note="tachanun-shacharit"]:visible .note-rule [data-lang=en]').first()).toContainText("Not said on Shabbat and festivals");
    await expect(page.locator(".date-line [data-date-text] [data-lang=en]")).toHaveText("Tue 1 Jan · not in the calendar");
    await expect(page.locator(".date-line [data-date-today]")).toBeVisible();
    for (const bad of ["2026-02-30", "tomorrow", "2026-1-5"]) {
      await page.goto(`/weekday/shacharit/tachanun?date=${bad}`);
      await expect(status(page, "tachanun-shacharit")).toHaveText("Today: said");
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
      for (const path of ["/weekday/shacharit/tachanun?date=2026-12-10", "/weekday/shacharit/half-kaddish-2?date=2026-11-23", "/shabbat/mincha/full-kaddish?date=2026-11-07", "/weekday/maariv/concluding-prayers?date=2027-05-14", "/shabbat/shacharit/torah-service", "/weekday/shacharit/torah-reading?date=2026-12-10", "/shabbat/mincha/torah-service", "/weekday/shacharit"]) {
        await page.goto(path);
        await expect(page.locator(".date-line [data-date-text]")).toBeVisible();
        await page.waitForTimeout(200);
        expect(await page.evaluate(() => (window as unknown as { shift: number }).shift), path).toBe(0);
      }
    });
  }

  /** Put each set of lines in turn into `el` (one span per line, as the page script does) and return those that do not fit one line each, or overflow the room kept. */
  const misfits = (el: Element, all: string[][]) => {
    const out: string[] = [];
    const room = parseFloat(getComputedStyle(el).minHeight);
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
      const box = el.getBoundingClientRect();
      if (spans.some(span => span.getClientRects().length !== 1 || span.getBoundingClientRect().width > box.width + 0.5) || Math.abs(box.height - room) > 0.5 || line <= 0) out.push(lines.join(" | "));
    }
    return out;
  };

  test("every status there can be is one line in each language at the narrowest width, in exactly the room kept", async ({ page }) => {
    test.skip(test.info().project.name !== "phone-320", "the narrowest width");
    // Every distinct status each note can show over the whole table, worded for a date dialled in
    // (the date, the longest) and for today.
    const texts = new Map<string, Set<string>>();
    const notes = Object.keys(noteTimes);
    for (let d = new Date(`${table.from}T12:00:00`); ; d.setDate(d.getDate() + 1)) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (iso > table.to) break;
      for (const note of notes) for (const today of ["2000-01-01", iso]) {
        const words = noteStatus(table, note, iso, today);
        if (!texts.has(note)) texts.set(note, new Set());
        texts.get(note)!.add(JSON.stringify([words.en, words.he]));
      }
    }
    const where: Record<string, string> = {
      "tachanun-shacharit": "/weekday/shacharit/tachanun", "kaddish-after-tachanun": "/weekday/shacharit/half-kaddish-2", "torah-weekday": "/weekday/shacharit/torah-reading",
      "daily-psalms": "/weekday/shacharit/aleinu-and-closing-psalms", "tachanun-mincha": "/weekday/mincha/tachanun", omer: "/weekday/maariv/concluding-prayers",
      tzidkatcha: "/shabbat/mincha/tzidkatcha", "kaddish-after-tzidkatcha": "/shabbat/mincha/full-kaddish",
    };
    for (const language of ["both", "en", "he"] as const) {
      for (const note of notes) {
        await page.goto(where[note]);
        await page.evaluate(l => { document.documentElement.dataset.language = l; }, language);
        const lines = [...texts.get(note)!].map(json => JSON.parse(json) as string[]);
        const out = await page.locator(`[data-note="${note}"]:visible [data-note-status]`).first().evaluate(misfits, lines);
        expect.soft(out, `${note} (${language})`).toEqual([]);
      }
    }
  });

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
        const out = await page.locator(".reader-calendar:visible [data-reading]").first().evaluate(misfits, lines);
        expect.soft(out, `${path} (${language})`).toEqual([]);
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
    expect(Object.keys(noteRules).sort()).toEqual(Object.keys(noteTimes).sort());
    const content = readFileSync(new URL("../content/roadmap.html", import.meta.url), "utf8");
    expect([...new Set([...content.matchAll(/calendar-note note-([a-z-]+)/g)].map(m => m[1]))].sort()).toEqual(Object.keys(noteTimes).sort());
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

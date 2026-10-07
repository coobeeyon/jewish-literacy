import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

// Offline stand-in for Sefaria. The site serves its own snapshot of the prayer texts, so the only
// Sefaria request it makes is for this week's Torah reading (the calendar). Anything else is
// refused and recorded in `unexpected`, which tests can check.
const read = (file: string) => JSON.parse(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"));
export const corpus = read("corpus.generated.json");

export const calendarResponse = {
  date: "2026-10-01",
  calendar_items: [
    { title: { en: "Parashat Hashavua", he: "פרשת השבוע" }, displayValue: { en: "Bereshit", he: "בראשית" }, url: "Genesis.1.1-6.8", ref: "Genesis 1:1-6:8" },
    { title: { en: "Haftarah", he: "הפטרה" }, displayValue: { en: "Isaiah 42:5-43:10", he: "ישעיהו" }, url: "Isaiah.42.5-43.10", ref: "Isaiah 42:5-43:10" },
  ],
};

export async function mockSefaria(page: Page, unexpected: string[] = []) {
  await page.route("https://www.sefaria.org/**", async route => {
    const url = route.request().url();
    if (url.includes("/api/calendars")) return route.fulfill({ contentType: "application/json", body: JSON.stringify(calendarResponse) });
    unexpected.push(url);
    return route.fulfill({ status: 404, body: "not expected" });
  });
}

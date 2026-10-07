import { readFileSync } from "node:fs";
import type { Page, Route } from "@playwright/test";

// Offline stand-in for Sefaria built from the pinned plans, so every card can be opened in tests.
const read = (file: string) => JSON.parse(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"));
export const corpus = read("corpus.generated.json");
export const textSources = read("text-sources.generated.json");

type Section = { ref: string; edition: string; url: string; count: { he: number; en: number } };
const sections = new Map<string, Section>();
for (const source of Object.values(textSources) as Array<{ parts: Array<{ sections: Section[] }> }>) {
  for (const part of source.parts) for (const section of part.sections) sections.set(decodeURIComponent(section.url), section);
}

export function sefariaResponse(url: string) {
  const section = sections.get(decodeURIComponent(url));
  if (!section) return undefined;
  const edition = corpus.editions[section.edition];
  const version = (lang: "he" | "en") => ({
    language: lang, versionTitle: edition[lang].title, license: edition[lang].license, versionSource: edition[lang].source,
    actualLanguage: edition[lang].language, direction: edition[lang].direction,
    text: Array.from({ length: section.count[lang] }, (_, i) => lang === "he" ? `טֶקְסְט ${i + 1} ${section.ref}` : `English segment ${i + 1} of ${section.ref}`),
  });
  return { ref: section.ref, warnings: [], versions: [version("he"), version("en")] };
}

export const calendarResponse = {
  date: "2026-10-01",
  calendar_items: [
    { title: { en: "Parashat Hashavua", he: "פרשת השבוע" }, displayValue: { en: "Bereshit", he: "בראשית" }, url: "Genesis.1.1-6.8", ref: "Genesis 1:1-6:8" },
    { title: { en: "Haftarah", he: "הפטרה" }, displayValue: { en: "Isaiah 42:5-43:10", he: "ישעיהו" }, url: "Isaiah.42.5-43.10", ref: "Isaiah 42:5-43:10" },
  ],
};

export async function mockSefaria(page: Page, options: { onText?: (url: string) => void; handle?: (route: Route) => Promise<boolean> | boolean } = {}) {
  await page.route("https://www.sefaria.org/api/**", async route => {
    const url = route.request().url();
    if (options.handle && await options.handle(route)) return;
    if (url.includes("/api/calendars")) return route.fulfill({ contentType: "application/json", body: JSON.stringify(calendarResponse) });
    options.onText?.(url);
    const body = sefariaResponse(url);
    return body ? route.fulfill({ contentType: "application/json", body: JSON.stringify(body) }) : route.fulfill({ status: 404, body: "not pinned" });
  });
}

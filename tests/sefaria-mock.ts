import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";

// The site asks Sefaria for nothing: the prayer texts are its own snapshot (content/texts), and the
// week's Torah reading comes from its calendar table (src/calendar.generated.json). Any Sefaria
// request is refused and recorded in `unexpected`, which tests can check.
const read = (file: string) => JSON.parse(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"));
export const corpus = read("corpus.generated.json");

export async function mockSefaria(page: Page, unexpected: string[] = []) {
  await page.route("https://www.sefaria.org/**", async route => {
    if (route.request().resourceType() === "document") return route.fulfill({ body: "Sefaria" });
    unexpected.push(route.request().url());
    return route.fulfill({ status: 404, body: "not expected" });
  });
}

import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { corpus, mockSefaria } from "./sefaria-mock";

// The site serves its own snapshot of the prayer texts (content/texts); only the Torah calendar
// still comes from Sefaria, and no test talks to the real Sefaria (mockSefaria stands in, and
// fails any text request). scripts/verify-sefaria.mjs checks the live API.
test.beforeEach(async ({ page }) => { await mockSefaria(page); });

/** Text files the page fetched (/texts/…), in order. */
function textRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/texts/")) seen.push(new URL(request.url()).pathname); });
  return seen;
}

/** Count every loading line any reader shows, from the start of the page. */
const watchLoading = (page: Page) => page.addInitScript(() => {
  const w = window as unknown as { loadingFrames: number };
  w.loadingFrames = 0;
  new MutationObserver(records => { for (const r of records) for (const node of r.addedNodes) if (node instanceof Element && (node.matches(".reader-status") || node.querySelector(".reader-status"))) w.loadingFrames++; }).observe(document, { childList: true, subtree: true });
});
const loadingFrames = (page: Page) => page.evaluate(() => (window as unknown as { loadingFrames: number }).loadingFrames);

const services = [
  ["weekday", "shacharit"], ["weekday", "mincha"], ["weekday", "maariv"],
  ["shabbat", "maariv"], ["shabbat", "shacharit"], ["shabbat", "musaf"], ["shabbat", "mincha"],
] as const;

const openSettings = (page: Page) => page.locator(".settings-toggle").click();

/** In an open prayer of several sections, open its first section (opening its group first if needed). */
async function openFirstSection(item: Locator) {
  const toggle = item.locator(".toc-toggle").first();
  if (!(await toggle.count())) return;
  if (!(await toggle.isVisible())) await item.locator(".toc-group").first().click();
  await toggle.click();
}

/** Open every group in an open prayer, so every entry shows. */
async function openAllGroups(item: Locator) {
  for (let closed = item.locator('.toc-group[aria-expanded="false"]'); await closed.count();) await closed.first().click();
}

async function noOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
}

for (const [day, service] of services) {
  for (const language of ["en", "he", "both"] as const) {
    for (const nusach of ["ashkenaz", "sefard"] as const) {
      test(`${day}/${service} ${language} ${nusach} is readable`, async ({ page }) => {
        await page.addInitScript(({ language, nusach }) => { localStorage.setItem("weekday-shacharit-language", language); localStorage.setItem("weekday-shacharit-nusach", nusach); }, { language, nusach });
        await page.goto(`/${day}/${service}`);
        await expect(page.locator("#service-heading")).toBeVisible();
        await expect(page.locator(".service-map>.movement").first()).toBeVisible();
        await expect(page.locator('[data-day-choice="' + day + '"]')).toHaveAttribute("aria-current", "true");
        await expect(page.locator('[data-service-choice="' + service + '"]')).toHaveAttribute("aria-current", "true");
        if (language === "en") await expect(page.locator('[data-lang="he"]:visible')).toHaveCount(0);
        if (language === "he") await expect(page.locator('[data-lang="en"]:visible')).toHaveCount(0);
        if (language === "both") { expect(await page.locator('[data-lang="en"]:visible').count()).toBeGreaterThan(0); expect(await page.locator('[data-lang="he"]:visible').count()).toBeGreaterThan(0); }
        await noOverflow(page);
      });
    }
  }
}

test("routes, history, preferences, and about are addressable", async ({ page }) => {
  await page.goto("/weekday/shacharit");
  await page.getByRole("button", { name: /Pesukei/ }).click();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/pesukei-dzimra$/);
  await expect(page.locator('.card [aria-expanded="true"]')).toHaveCount(1);
  await page.getByRole("link", { name: /Shabbat שבת/ }).click();
  await expect(page).toHaveURL(/\/shabbat\/shacharit$/);
  await page.getByRole("link", { name: /Musaf מוסף/ }).click();
  await expect(page).toHaveURL(/\/shabbat\/musaf$/);
  const before = page.url();
  await openSettings(page);
  await page.getByRole("button", { name: "עברית" }).click();
  await page.getByRole("button", { name: /נוסח ספרד/ }).click();
  expect(page.url()).toBe(before);
  await page.reload();
  await expect(page.locator('[data-language-choice="he"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-nusach-choice="sefard"]')).toHaveAttribute("aria-pressed", "true");
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "על מיזם האוריינות היהודית" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/shabbat\/musaf$/);
});

test("open card deep link, close, keyboard, and focus", async ({ page }) => {
  await page.goto("/weekday/mincha/chazzans-repetition");
  const button = page.locator("#section-chazzans-repetition>button");
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#section-chazzans-repetition .item-title")).toBeFocused();
  // Closing a prayer leaves its movement open, with focus back on the prayer's control.
  await button.press("Enter");
  await expect(page).toHaveURL(/\/weekday\/mincha\/amidah$/);
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(button).toBeFocused();
  // Focus is restored on the next animation frame; let it land before pressing another key.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const movement = page.locator("#movement-amidah>button");
  await expect(movement).toHaveAttribute("aria-expanded", "true");
  await movement.press("Enter");
  await expect(page).toHaveURL(/\/weekday\/mincha$/);
  await expect(movement).toHaveAttribute("aria-expanded", "false");
  await expect(movement).toBeFocused();
  await expect(page.locator("#section-chazzans-repetition")).toHaveCount(0);
});

test("invalid and retired routes do not silently redirect", async ({ page }) => {
  for (const path of ["/weekday/musaf", "/holiday/shacharit", "/shabbat/musaf/no-such-prayer", "/year/5786", "/weekday/mincha/ashrei/extra"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: /Page not found|הדף לא נמצא/ })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
  }
});

test("Ashrei shows the self-hosted siddur text in its typography", async ({ page }) => {
  await page.goto("/weekday/mincha/ashrei");
  await expect(page.locator(".reader-texts")).toBeVisible();
  const snapshot = JSON.parse(readFileSync(new URL("../content/texts/weekday/mincha/ashrei.ashkenaz.json", import.meta.url), "utf8"));
  const opening = (Object.values(snapshot.refs)[0] as { he: Record<string, string> }).he[1].split(",")[0];
  await expect(page.locator(".reader-he").first()).toContainText(opening);
  await expect(page.locator(".reader-en").first()).toContainText("Happy are those who dwell in Your House");
  await expect(page.locator(".reader script")).toHaveCount(0);
  await expect(page.locator("#section-ashrei .copy .hint")).toHaveCount(0);
  expect(await page.locator(".reader-he").first().evaluate(el => ({ family: getComputedStyle(el).fontFamily, weight: getComputedStyle(el).fontWeight }))).toEqual(expect.objectContaining({ family: expect.stringContaining("Noto Serif Hebrew"), weight: "700" }));
  expect(await page.locator(".reader-en").first().evaluate(el => ({ family: getComputedStyle(el).fontFamily, weight: getComputedStyle(el).fontWeight }))).toEqual(expect.objectContaining({ family: expect.stringContaining("Source Serif 4"), weight: "400" }));
  expect(await page.locator("header h1").evaluate(el => getComputedStyle(el).fontFamily)).toContain("system-ui");
  await expect(page.locator(".reader-credit [data-lang=en]")).toContainText("The Koren Shalem Siddur (Ashkenaz)");
  await expect(page.locator(".reader-credit [data-lang=en]")).toContainText("license reported by Sefaria: CC BY-NC.");
  await expect(page.locator(".reader-credit")).not.toContainText("non-commercial");
  await noOverflow(page);
});

test("Ashrei failure retains fallback and retry", async ({ page }) => {
  let attempts = 0;
  let fail = true;
  await page.route("**/texts/weekday-mincha-ashrei-*", route => {
    attempts += 1;
    if (fail) return route.abort();
    return route.fallback();
  });
  // A deep link has its text already; a tap on the map fetches it.
  await page.goto("/weekday/mincha");
  await page.locator("#section-ashrei>button").click();
  await expect(page.getByText("The prayer text could not be loaded.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Read Ashrei on Sefaria" })).toHaveAttribute("href", /^https:\/\/www\.sefaria\.org\/The_Koren_Shalem_Siddur/);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => attempts).toBeGreaterThan(1);
  await expect(page.getByText("The prayer text could not be loaded.")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".reader-texts")).toBeVisible();
  await expect(page.locator(".reader-failure")).toHaveCount(0);
});

test("a text file that is not one is refused rather than shown", async ({ page }) => {
  await page.route("**/texts/shabbat-maariv-vayechulu-*", route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ text: "something else" }) }));
  await page.goto("/shabbat/maariv/amidah");
  await page.locator("#section-vayechulu>button").click();
  await expect(page.getByText("The prayer text could not be loaded.")).toBeVisible();
  await expect(page.locator(".reader-texts")).toHaveCount(0);
});

test("every prayer card and landmark has a pinned Sefaria source", async () => {
  let prayerNodes = 0, filled = 0;
  const unfilled: string[] = [];
  for (const service of corpus.services) {
    for (const node of service.nodes) {
      if (node.kind === "transition") continue;
      prayerNodes++;
      const key = `${service.day}/${service.id}/${node.id}`;
      if (!node.text) { expect(corpus.unfilledText[key], key).toBeTruthy(); unfilled.push(key); continue; }
      filled++;
      expect(node.routable, key).toBe(true);
      expect(node.text.ashkenaz, key).toBeTruthy();
    }
  }
  expect(prayerNodes).toBeGreaterThanOrEqual(70);
  expect(unfilled).toEqual(["shabbat/shacharit/transition-to-musaf"]);
  expect(filled).toBe(prayerNodes - 1);
});

const samples = [
  "weekday/shacharit/opening-blessings", "weekday/shacharit/shema-and-its-blessings", "weekday/shacharit/half-kaddish",
  "weekday/mincha/silent-shemoneh-esrei", "weekday/mincha/tachanun", "weekday/maariv/evening-shema-and-its-blessings", "weekday/maariv/mourners-kaddish",
  "shabbat/maariv/kabbalat-shabbat", "shabbat/maariv/barkhu-call-to-prayer", "shabbat/shacharit/chazzans-repetition", "shabbat/shacharit/torah-service",
  "shabbat/musaf/silent-musaf-amidah", "shabbat/musaf/ein-keloheinu-and-incense-study", "shabbat/mincha/tzidkatcha", "shabbat/mincha/aleinu",
];
for (const nusach of ["ashkenaz", "sefard"] as const) {
  test(`sample cards across all seven maps open with Hebrew and English (${nusach})`, async ({ page }) => {
    await page.addInitScript(nusach => localStorage.setItem("weekday-shacharit-nusach", nusach), nusach);
    for (const path of samples) {
      await page.goto(`/${path}`);
      const id = path.split("/")[2];
      const item = page.locator(`#section-${id}`);
      await expect(item.locator(':scope>[aria-expanded="true"], :scope>.landmark-toggle[aria-expanded="true"]')).toHaveCount(1);
      await openFirstSection(item);
      await expect(item.locator(".reader-section").first()).toBeVisible();
      await expect(item.locator(".reader-en p:not(.rubric)").first()).toContainText(/[A-Za-z]{3}/);
      await expect(item.locator(".reader-he p:not(.rubric)").first()).toContainText(/[א-ת]/);
      await expect(item.locator(".reader-credit [data-lang=en]")).toContainText(nusach === "sefard" ? "Nusach Sefard" : "Sefaria");
      await noOverflow(page);
    }
  });
}

test("nusach switch changes the edition of an open card", async ({ page }) => {
  const requested = textRequests(page);
  await page.goto("/weekday/shacharit/pesukei-dzimra/barukh-sheamar");
  await expect(page.locator(".reader-credit [data-lang=en]")).toContainText("Koren Shalem Siddur (Ashkenaz)");
  const he = await page.locator("#section-pesukei-dzimra .reader-he").first().textContent();
  await openSettings(page);
  await page.getByRole("button", { name: /Nusach Sefard/ }).click();
  await expect(page.locator(".reader-credit [data-lang=en]")).toContainText("Nusach Sefard");
  await expect(page.locator(".reader-credit [data-lang=en]")).toContainText("Metsudah");
  expect(await page.locator("#section-pesukei-dzimra .reader-he").first().textContent()).not.toBe(he);
  expect(requested.some(path => path.startsWith("/texts/weekday-shacharit-pesukei-dzimra-sefard-"))).toBe(true);
  // The open section stays open in the other nusach, under that nusach's entry.
  await expect(page.locator("#section-pesukei-dzimra .card-toc li").first()).toContainText("Hodu");
  await expect(page.locator(".reader-heading")).toHaveCount(1);
  await expect(page.locator(".reader-heading").first()).toContainText("Barukh");
  await expect(page).toHaveURL(/\/weekday\/shacharit\/pesukei-dzimra\/barukh-sheamar$/);
});

// One card with a breakdown on each of the seven maps.
const breakdownSamples = [
  "weekday/shacharit/shema-and-its-blessings", "weekday/mincha/silent-shemoneh-esrei", "weekday/maariv/evening-shema-and-its-blessings",
  "shabbat/maariv/kabbalat-shabbat", "shabbat/shacharit/torah-service", "shabbat/musaf/chazzans-musaf-repetition", "shabbat/mincha/ashrei-and-uva-ltzion",
];
for (const nusach of ["ashkenaz", "sefard"] as const) {
  test(`open cards keep their breakdown, and every entry opens a section of text (${nusach})`, async ({ page }) => {
    await page.addInitScript(nusach => localStorage.setItem("weekday-shacharit-nusach", nusach), nusach);
    for (const path of breakdownSamples) {
      await page.goto(`/${path}`);
      const [day, service, id] = path.split("/");
      const node = corpus.services.find((s: { day: string; id: string }) => s.day === day && s.id === service).nodes.find((n: { id: string }) => n.id === id);
      const slugs: string[] = node.text.slugs[node.text[nusach] ? nusach : "ashkenaz"];
      const item = page.locator(`#section-${id}`);
      await expect(item.locator(".reader-section")).toHaveCount(0);
      await openAllGroups(item);
      const toggles = item.locator(".toc-toggle");
      const reachable = new Set(await toggles.evaluateAll(els => els.map(el => el.getAttribute("data-section")!)));
      // Every section of the text is reachable from the breakdown.
      expect([...reachable].sort(), path).toEqual([...slugs].sort());
      for (const slug of slugs) {
        const toggle = toggles.and(page.locator(`[data-section="${slug}"]`)).first();
        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        const text = item.locator(`#text-${id}-${slug}`);
        await expect(text.locator(".reader-section .reader-heading"), `${path} ${slug}`).toBeVisible();
        await expect(text.locator(".reader-he p:not(.rubric)").first()).toBeVisible();
        await toggle.click();
        await expect(text.locator(".reader-section")).toHaveCount(0);
      }
      await expect(page).toHaveURL(new RegExp(`/${path}$`));
    }
  });
}

test("opening a prayer of several sections shows only its breakdown", async ({ page }) => {
  await page.goto("/weekday/shacharit/tachanun");
  const item = page.locator("#section-tachanun");
  await expect(item.locator(".toc-toggle")).toHaveCount(3);
  await expect(item.locator(".reader-section, .reader-texts")).toHaveCount(0);
  for (const toggle of await item.locator(".toc-toggle").all()) await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("tapping a section shows only that section, directly under its entry; tapping again closes it", async ({ page }) => {
  await page.goto("/weekday/shacharit/tachanun");
  const item = page.locator("#section-tachanun");
  const entry = item.locator(".toc-entry").filter({ hasText: "Falling on the face" });
  const toggle = entry.locator(".toc-toggle");
  await toggle.click();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/tachanun\/falling-on-the-face$/);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(item.locator(".reader-section")).toHaveCount(1);
  const section = entry.locator(".reader-section");
  await expect(section.locator(".reader-heading [data-lang=en]")).toHaveText("Falling on the face");
  expect(await section.evaluate(el => [...el.children].map(c => c.classList.contains("reader-heading") ? "heading" : c.getAttribute("data-lang")).join(">"))).toBe("heading>he>en");
  // Directly under its entry: below the toggle, above the next entry.
  // (Measured in one frame, since the page may still be scrolling.)
  const boxes = await entry.evaluate(el => [el.querySelector(".toc-toggle")!, el.querySelector(".reader-section")!, el.nextElementSibling!].map(e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
  const [toggleBox, sectionBox, next] = boxes;
  expect(sectionBox.top).toBeGreaterThanOrEqual(toggleBox.bottom - 1);
  expect(sectionBox.top - toggleBox.bottom).toBeLessThan(60);
  expect(next.top).toBeGreaterThan(sectionBox.bottom);
  // Several sections can be open at once.
  await item.locator(".toc-entry").filter({ hasText: "Supplication" }).locator(".toc-toggle").click();
  await expect(item.locator(".reader-section")).toHaveCount(2);
  await expect(page).toHaveURL(/\/tachanun\/supplication$/);
  // Collapse, by keyboard: focus stays on the entry.
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(entry.locator(".reader-section")).toHaveCount(0);
  await expect(item.locator(".reader-section")).toHaveCount(1);
  await expect(toggle).toBeFocused();
  await expect(page).toHaveURL(/\/tachanun\/supplication$/);
});

test("group entries open to show their own entries", async ({ page }) => {
  await page.goto("/weekday/shacharit/shema-and-its-blessings");
  const item = page.locator("#section-shema-and-its-blessings");
  const group = item.locator(".toc-group");
  await expect(group).toHaveCount(1);
  await expect(group).toHaveAttribute("aria-expanded", "false");
  const paragraph = item.locator('.toc-toggle[data-section="first-paragraph-veahavta"]');
  await expect(paragraph).toBeHidden();
  await group.click();
  await expect(group).toHaveAttribute("aria-expanded", "true");
  await expect(paragraph).toBeVisible();
  await expect(item.locator(".reader-section")).toHaveCount(0);
  await paragraph.click();
  await expect(item.locator(".reader-section")).toHaveCount(1);
  await expect(item.locator("#text-shema-and-its-blessings-first-paragraph-veahavta .reader-section")).toBeVisible();
  await group.click();
  await expect(paragraph).toBeHidden();
  // Shmoneh Esrei blessing groups work the same way.
  await page.goto("/weekday/mincha/silent-shemoneh-esrei");
  const groups = page.locator("#section-silent-shemoneh-esrei .toc-group");
  await expect(groups).toHaveCount(3);
  await expect(page.locator('#section-silent-shemoneh-esrei .toc-toggle[data-section="healing-refaeinu"]')).toBeHidden();
  await groups.nth(1).click();
  await page.locator('#section-silent-shemoneh-esrei .toc-toggle[data-section="healing-refaeinu"]').click();
  await expect(page).toHaveURL(/\/weekday\/mincha\/silent-shemoneh-esrei\/healing-refaeinu$/);
  await expect(page.locator("#text-silent-shemoneh-esrei-healing-refaeinu .reader-section")).toBeVisible();
});

test("section deep links open movement, prayer and section, and Back/Forward restore them", async ({ page }) => {
  await page.goto("/weekday/shacharit/chazzans-repetition/kedushah-in-the-repetition-in-place-of-gods-holiness");
  await expect(page.locator("#movement-amidah>button")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#section-chazzans-repetition>button")).toHaveAttribute("aria-expanded", "true");
  const toggle = page.locator('#section-chazzans-repetition .toc-toggle[data-section="kedushah-in-the-repetition-in-place-of-gods-holiness"]');
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toBeFocused();
  await expect(page.locator("#text-chazzans-repetition-kedushah-in-the-repetition-in-place-of-gods-holiness .reader-section")).toBeInViewport();
  await expect(page.locator("#section-chazzans-repetition .reader-section")).toHaveCount(1);
  // History: open two sections, then step back and forward through them.
  await page.goto("/weekday/shacharit/tachanun");
  const item = page.locator("#section-tachanun");
  const falling = item.locator('.toc-toggle[data-section="falling-on-the-face"]'), supplication = item.locator('.toc-toggle[data-section="supplication"]');
  await falling.click();
  await expect(page).toHaveURL(/\/tachanun\/falling-on-the-face$/);
  await supplication.click();
  await expect(page).toHaveURL(/\/tachanun\/supplication$/);
  await expect(item.locator(".reader-section")).toHaveCount(2);
  await page.goBack();
  await expect(page).toHaveURL(/\/tachanun\/falling-on-the-face$/);
  await expect(supplication).toHaveAttribute("aria-expanded", "false");
  await expect(falling).toHaveAttribute("aria-expanded", "true");
  await page.goBack();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/tachanun$/);
  await expect(item.locator(".reader-section")).toHaveCount(0);
  await page.goForward();
  await page.goForward();
  await expect(page).toHaveURL(/\/tachanun\/supplication$/);
  await expect(item.locator(".reader-section")).toHaveCount(2);
  // A section of the other nusach still opens the prayer; an unknown one is not found.
  await page.goto("/weekday/shacharit/tachanun/confession-and-thirteen-attributes");
  await expect(page.locator("#section-tachanun>button")).toHaveAttribute("aria-expanded", "true");
  for (const path of ["/weekday/shacharit/tachanun/no-such-section", "/weekday/mincha/ashrei/ashrei", "/weekday/shacharit/amidah/ancestors-avot"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: /Page not found/ })).toBeVisible();
  }
});

test("prayers of one section, and Kaddish, open straight into their text", async ({ page }) => {
  await page.goto("/weekday/mincha/ashrei");
  await expect(page.locator("#section-ashrei .reader-section")).toBeVisible();
  await expect(page.locator("#section-ashrei .toc-toggle")).toHaveCount(0);
  await page.goto("/shabbat/maariv/vayechulu");
  await expect(page.locator("#section-vayechulu .reader-section")).toBeVisible();
  await page.goto("/weekday/maariv/half-kaddish");
  await expect(page.locator("#section-half-kaddish .reader-section")).toBeVisible();
});

test("both languages are shown section by section, Hebrew then English", async ({ page }) => {
  await page.goto("/weekday/maariv/evening-shema-and-its-blessings");
  const item = page.locator("#section-evening-shema-and-its-blessings");
  await openAllGroups(item);
  for (const toggle of await item.locator(".toc-toggle").all()) await toggle.click();
  const sections = item.locator(".reader-section");
  await expect(sections).toHaveCount(await item.locator(".toc-toggle").count());
  await expect(sections.last().locator(".reader-he")).toBeVisible();
  const order = await sections.evaluateAll(els => els.map(el => [...el.children].map(child => child.classList.contains("reader-heading") ? "heading" : child.getAttribute("data-lang")).join(">")));
  expect(order.length).toBeGreaterThan(5);
  for (const sequence of order) expect(sequence).toBe("heading>he>en");
  await openSettings(page);
  await page.getByRole("button", { name: "English" }).click();
  await expect(sections.first().locator(".reader-he")).toBeHidden();
  await expect(sections.first().locator(".reader-en")).toBeVisible();
});

test("Kaddish landmark deep link opens in place and keeps its bubble", async ({ page }) => {
  await page.goto("/weekday/shacharit/half-kaddish");
  const item = page.locator("#section-half-kaddish");
  const toggle = item.locator(".landmark-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(item.locator(".landmark-title")).toBeFocused();
  await expect(item.locator(".reader-he p:not(.rubric)").first()).toBeVisible();
  expect(await item.evaluate(el => getComputedStyle(el).borderTopStyle)).toBe("double");
  await expect(item.locator(":scope > .communal-mark")).toHaveCount(1);
  await toggle.click();
  await expect(page).toHaveURL(/\/weekday\/shacharit$/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(item.locator(".reader")).toHaveCount(0);
  await page.goto("/shabbat/maariv/barkhu-call-to-prayer");
  await expect(page.locator("#section-barkhu-call-to-prayer .reader-section")).toBeVisible();
});

test("Torah cards show the week's reading from the site's own calendar, with links to Sefaria, and never wait for it", async ({ page }) => {
  const unexpected: string[] = [];
  await mockSefaria(page, unexpected);
  await page.clock.setFixedTime(new Date("2026-10-07T12:00:00"));
  await watchLoading(page);
  const reading = (lang: "en" | "he") => page.locator(`.reader-calendar:visible .calendar-reading [data-lang=${lang}]`);
  // Shabbat morning: this Shabbat's portion and haftarah (10 October 2026, Bereshit; Shabbat before Rosh Chodesh).
  await page.goto("/shabbat/shacharit/torah-service");
  await expect(reading("en")).toHaveText(["Bereshit", "Genesis 1:1–6:8", "Haftarah: I Samuel 20:18–42"]);
  await expect(reading("en").first().getByRole("link", { name: "Bereshit" })).toHaveAttribute("href", "https://www.sefaria.org/Genesis.1.1-6.8");
  await expect(reading("en").nth(2).getByRole("link")).toHaveAttribute("href", "https://www.sefaria.org/I_Samuel.20.18-42");
  await expect(reading("he").first()).toHaveText("בראשית");
  // Shabbat afternoon reads the next week's portion; a weekday card, the coming Shabbat's.
  await page.goto("/shabbat/mincha/torah-service");
  await expect(reading("en")).toHaveText(["Noach", "Genesis 6:9–11:32"]);
  await page.goto("/weekday/shacharit/torah-reading");
  await expect(reading("en")).toHaveText(["Bereshit", "Genesis 1:1–6:8"]);
  await expect(page.locator('#section-torah-reading [data-note="torah-weekday"] .box-summary [data-lang=en]')).toContainText("Read Mondays and Thursdays");
  // A festival Shabbat has its own reading; the Monday before it reads the next portion.
  await page.goto("/shabbat/shacharit/torah-service?date=2027-04-24");
  await expect(reading("en")).toHaveText(["Chol HaMoed Pesach", "Exodus 33:12–34:26", "Haftarah: Ezekiel 37:1–14"]);
  await page.goto("/weekday/shacharit/torah-reading?date=2027-04-19");
  await expect(reading("en")).toHaveText(["Achrei Mot", "Leviticus 16:1–18:30"]);
  // The date line moves it along.
  await page.locator(".date-line").getByRole("button", { name: "Next day" }).click();
  await expect(reading("en")).toHaveText(["Achrei Mot", "Leviticus 16:1–18:30"]);
  await page.goto("/weekday/shacharit/torah-reading?date=2030-01-06");
  await expect(reading("en")).toHaveText(["Not in the calendar", "\u00a0"]);
  // No line ever waited on a request for the reading.
  expect(await page.evaluate(() => document.body.textContent!.includes("Loading this week"))).toBe(false);
  expect(await loadingFrames(page)).toBe(0);
  await openFirstSection(page.locator("#section-torah-reading"));
  await expect(page.locator(".reader-section").first()).toBeVisible();
  expect(unexpected).toEqual([]);
});

test("two hundred percent text reflows", async ({ page }) => {
  await page.goto("/shabbat/shacharit/torah-service");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await noOverflow(page);
});

// ---- Movements: the top level is a handful of movements joined by Kaddish/Barkhu seams. ----

const movementTitles: Record<string, string[]> = {
  "weekday/shacharit": ["Morning blessings", "Pesukei D’Zimra", "Shema and its blessings", "Shmoneh Esrei (“Amidah”)", "Tachanun", "Torah reading", "Closing"],
  "weekday/mincha": ["Ashrei", "Shmoneh Esrei (“Amidah”)", "Tachanun", "Closing"],
  "weekday/maariv": ["Opening", "Shema and its blessings", "Shmoneh Esrei (“Amidah”)", "Closing"],
  "shabbat/maariv": ["Kabbalat Shabbat", "Shema and its blessings", "Shmoneh Esrei (“Amidah”)", "Closing"],
  "shabbat/shacharit": ["Morning blessings", "Pesukei D’Zimra", "Shema and its blessings", "Shmoneh Esrei (“Amidah”)", "Torah service", "Transition to Musaf"],
  "shabbat/musaf": ["Musaf Shmoneh Esrei (“Amidah”)", "Closing"],
  "shabbat/mincha": ["Ashrei and Uva L’Tzion", "Torah reading", "Shmoneh Esrei (“Amidah”)", "Tzidkatcha", "Closing"],
};

const englishOnly = (page: Page) => page.addInitScript(() => localStorage.setItem("weekday-shacharit-language", "en"));

for (const [day, service] of services) {
  test(`${day}/${service} top level is a handful of movements, the Amidah the peak`, async ({ page }) => {
    await englishOnly(page);
    await page.goto(`/${day}/${service}`);
    const movements = page.locator(".service-map>.movement");
    await expect(movements.locator(":scope>button .item-title [data-lang=en]")).toHaveText(movementTitles[`${day}/${service}`]);
    // Everything else at the top level is a seam: Kaddish or Barkhu.
    const seams = page.locator(".service-map>.seam");
    expect(await page.locator(".service-map>li").count()).toBe(await movements.count() + await seams.count());
    await expect(seams.locator(".landmark-title [data-lang=en]")).toHaveText(Array(await seams.count()).fill(/Kaddish|Barkhu/));
    // The peaks: the Shema and the Shmoneh Esrei in Shacharit and Maariv, the Shmoneh Esrei alone in Mincha and Musaf.
    const peaks = page.locator(".service-map>.movement.peak");
    const pillars = service === "shacharit" || service === "maariv" ? ["Shema and its blessings", movementTitles[`${day}/${service}`].find(t => t.includes("Shmoneh Esrei"))!] : [movementTitles[`${day}/${service}`].find(t => t.includes("Shmoneh Esrei"))!];
    await expect(peaks.locator(":scope>button .item-title [data-lang=en]")).toHaveText(pillars);
    const boxes = await movements.evaluateAll(els => els.map(el => ({ peak: el.classList.contains("peak"), height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width })));
    const tops = boxes.filter(b => b.peak);
    // Two pillars are drawn as equals.
    for (const other of tops) { expect(other.width).toBe(tops[0].width); if (page.viewportSize()!.width >= 390) expect(Math.abs(other.height - tops[0].height)).toBeLessThan(2); }
    for (const box of boxes.filter(b => !b.peak)) for (const top of tops) { expect(top.height).toBeGreaterThan(box.height); expect(top.width).toBeGreaterThan(box.width); }
    const fontSize = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
    expect(await peaks.first().locator(":scope>button .item-title").evaluate(fontSize)).toBeGreaterThan(await movements.filter({ hasNot: page.locator(".stages") }).and(page.locator(":not(.peak)")).first().locator(":scope>button .item-title").evaluate(fontSize));
  });
}

test("seams are slim double-bordered bubbles with the minyan mark, title only", async ({ page }) => {
  await page.goto("/weekday/shacharit");
  const seams = page.locator(".service-map>.seam");
  expect(await seams.count()).toBe(5);
  for (let i = 0; i < await seams.count(); i++) {
    const seam = seams.nth(i);
    await expect(seam.locator(":scope>.communal-mark")).toBeVisible();
    expect(await seam.evaluate(el => getComputedStyle(el).borderTopStyle)).toBe("double");
    const box = (await seam.boundingBox())!;
    expect(box.height).toBeLessThan(56);
    await expect(seam.locator("small, .seam-note")).toHaveCount(0);
    await expect(seam.locator(".landmark-toggle")).toHaveAttribute("aria-expanded", "false");
  }
  // Still opens into its Sefaria text, with its fine print inside.
  await page.locator("#section-rabbis-kaddish .landmark-toggle").click();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/rabbis-kaddish$/);
  await expect(page.locator("#section-rabbis-kaddish .seam-note")).toContainText("community practice");
  await expect(page.locator("#section-rabbis-kaddish .reader-section").first()).toBeVisible();
});

test("caveats and conditions stay off the top level and appear when opened", async ({ page }) => {
  await page.goto("/weekday/shacharit");
  // (The map's date labels, "Today: said", are meant for the top level; the rules behind them are not.)
  const caveats = ["community practice", "Depends on the date", "is not said", "community order varies", "Monday and Thursday mornings"];
  for (const caveat of caveats) await expect(page.locator(".service-map").getByText(caveat)).toHaveCount(0);
  // Top-level movements carry a title and at most one short line per language.
  for (const blurb of await page.locator(".service-map>.movement>button .blurb [data-lang=en]").all()) {
    const box = (await blurb.boundingBox())!;
    expect(box.height).toBeLessThan(48);
  }
  await page.locator("#movement-torah>button").click();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/torah$/);
  await expect(page.locator("#movement-torah").getByText("Monday and Thursday · three aliyot")).toBeVisible();
  await page.locator("#section-half-kaddish-2 .landmark-toggle").click();
  // Its calendar box: the rule, then the verdict for the date with its reason.
  await expect(page.locator("#section-half-kaddish-2 .calendar-box .box-summary")).toContainText("without it, after the repetition or after Hallel");
  await expect(page.locator("#section-half-kaddish-2 .calendar-box .box-verdict [data-lang=en]")).toContainText("Today, ");
});

test("a movement opens into its prayers, each of which opens into its text", async ({ page }) => {
  await page.goto("/weekday/shacharit");
  const closing = page.locator("#movement-closing");
  await closing.locator(":scope>button").click();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/closing$/);
  await expect(closing.locator(":scope>button")).toHaveAttribute("aria-expanded", "true");
  await expect(closing.locator(".members>li")).toHaveCount(3);
  await expect(closing.locator(".members>.seam")).toHaveCount(1);
  await closing.locator("#section-aleinu-and-closing-psalms>button").click();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/aleinu-and-closing-psalms$/);
  await expect(closing.locator("#section-aleinu-and-closing-psalms .toc-toggle")).toHaveCount(2);
  // Back and Forward restore each level.
  await page.goBack();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/closing$/);
  await expect(closing.locator("#section-aleinu-and-closing-psalms>button")).toHaveAttribute("aria-expanded", "false");
  await expect(closing.locator(":scope>button")).toHaveAttribute("aria-expanded", "true");
  await page.goBack();
  await expect(page).toHaveURL(/\/weekday\/shacharit$/);
  await expect(closing.locator(":scope>button")).toHaveAttribute("aria-expanded", "false");
  await page.goForward();
  await page.goForward();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/aleinu-and-closing-psalms$/);
  await expect(closing.locator("#section-aleinu-and-closing-psalms>button")).toHaveAttribute("aria-expanded", "true");
});

test("deep links to prayers open their parent movement and scroll to it", async ({ page }) => {
  const cases = [
    ["/weekday/shacharit/ashrei-and-uva-ltzion", "closing"], ["/weekday/shacharit/half-kaddish-3", "torah"],
    ["/shabbat/musaf/silent-musaf-amidah", "amidah"], ["/shabbat/musaf/rabbis-kaddish", "closing"],
    ["/shabbat/maariv/vayechulu", "amidah"], ["/weekday/maariv/silent-shemoneh-esrei", null], ["/weekday/mincha/half-kaddish", null],
  ] as const;
  for (const [path, movement] of cases) {
    await page.goto(path);
    const id = path.split("/")[3];
    const item = page.locator(`#section-${id}`);
    await expect(item.locator(":scope>button")).toHaveAttribute("aria-expanded", "true");
    await expect(item.locator(".item-title, .landmark-title").first()).toBeFocused();
    if (movement) {
      const parent = page.locator(`#movement-${movement}`);
      await expect(parent.locator(":scope>button")).toHaveAttribute("aria-expanded", "true");
      await expect(parent.locator(":scope>button .item-title")).toBeInViewport();
    }
    await expect(item.locator(":scope>button")).toBeInViewport();
  }
  // Movement routes are addressable too; unknown sections stay not-found.
  await page.goto("/shabbat/musaf/amidah");
  await expect(page.locator("#movement-amidah>button")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#movement-amidah .members>li")).toHaveCount(3);
});

for (const language of ["both", "en", "he"] as const) {
  test(`first phone screen shows the service title and the first two movements (${language})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(language => localStorage.setItem("weekday-shacharit-language", language), language);
    for (const [day, service] of services) {
      await page.goto(`/${day}/${service}`);
      await expect(page.locator("#service-heading")).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => scrollY)).toBe(0);
      const movements = page.locator(".service-map>.movement");
      for (const i of [0, 1]) {
        const box = (await movements.nth(i).boundingBox())!;
        expect(box.y + box.height, `${day}/${service} movement ${i + 1}`).toBeLessThanOrEqual(844);
      }
    }
  });
}

test("language and nusach sit behind one settings control", async ({ page }) => {
  await page.goto("/weekday/shacharit");
  const toggle = page.locator(".settings-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#display-settings")).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('[data-nusach-choice="sefard"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#display-settings")).toBeHidden();
  await expect(toggle).toBeFocused();
  // About still sits directly under the project title; the service heading below the controls.
  const order = await page.locator("header > *").evaluateAll(els => els.map(el => el.tagName.toLowerCase() + (el.className ? "." + el.className.split(" ")[0] : "")));
  expect(order.slice(0, 4)).toEqual(["h1", "a.about-link", "div.controls", "h2.service-title"]);
});

test("the Torah reading is its own kind of block: an event with its stages, not a prayer card", async ({ page }) => {
  await englishOnly(page);
  const cases = [["weekday/shacharit", "movement-torah", 4], ["shabbat/shacharit", "section-torah-service", 5], ["shabbat/mincha", "section-torah-service", 3]] as const;
  for (const [path, id, stages] of cases) {
    await page.goto(`/${path}`);
    await expect(page.locator(".service-map>.event")).toHaveCount(1);
    const block = page.locator(`#${id}`);
    await expect(block).toHaveClass(/\bevent\b/);
    await expect(block).not.toHaveClass(/\bpeak\b/);
    // Its own frame: square corners, ruled top and bottom, unlike the rounded prayer cards.
    const frame = (el: Element) => { const s = getComputedStyle(el); return { radius: parseFloat(s.borderTopLeftRadius), top: parseFloat(s.borderTopWidth), side: parseFloat(s.borderLeftWidth) }; };
    const own = await block.evaluate(frame);
    const card = await page.locator(".service-map>.movement:not(.event):not(.peak)").first().evaluate(frame);
    expect(own.radius).toBeLessThan(8);
    expect(card.radius).toBeGreaterThan(15);
    expect(own.top).toBeGreaterThan(own.side);
    // The sequence of what happens is visible without opening it.
    await expect(block.locator(".stages .stage")).toHaveCount(stages);
    await expect(block.locator(".stage [data-lang=en]").first()).toHaveText("Take out");
    // Secondary to the peaks.
    const height = (await block.boundingBox())!.height;
    for (const peak of await page.locator(".service-map>.peak").all()) expect((await peak.boundingBox())!.height).toBeGreaterThan(height);
    // The minyan mark is inset inside the block, clear of the title.
    const mark = (await block.locator(":scope>button>.communal-mark").boundingBox())!;
    const box = (await block.boundingBox())!;
    const title = (await block.locator(":scope>button .item-title").boundingBox())!;
    expect(mark.x - box.x).toBeGreaterThan(6);
    expect(mark.y - box.y).toBeGreaterThan(6);
    expect(Math.abs((mark.x - box.x) - (mark.y - box.y))).toBeLessThan(3);
    expect(mark.x + mark.width).toBeLessThanOrEqual(title.x);
  }
  // It still opens into its parts and their text.
  await page.goto("/weekday/shacharit");
  await page.locator("#movement-torah>button").click();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/torah$/);
  await expect(page.locator("#movement-torah .members>li")).toHaveCount(3);
  await page.goto("/shabbat/shacharit/torah-service/seven-aliyot-from-the-weekly-portion");
  await expect(page.locator("#section-torah-service .reader-section")).toHaveCount(1);
});

// Mike, October 8, 2026 (lb-ict1): after the Shabbat morning Torah reading, the prayers for particular
// present-day circumstances are left out, and a quiet note in their place says congregations add
// prayers here. Nothing of them may show, in either language, in either nusach.
for (const nusach of ["ashkenaz", "sefard"] as const) {
  test(`Shabbat morning communal prayers: the traditional prayers and a note, nothing tied to the modern state (${nusach})`, async ({ page }) => {
    await page.addInitScript(nusach => localStorage.setItem("weekday-shacharit-nusach", nusach), nusach);
    await page.goto("/shabbat/shacharit/torah-service/communal-prayers-ashrei-return-torah-to-ark");
    const card = page.locator("#section-torah-service");
    const section = card.locator(".reader-section");
    await expect(section).toHaveCount(1);
    await expect(card.locator(".reader-credit [data-lang=en]")).toContainText(nusach === "sefard" ? "Nusach Sefard" : "Koren");
    const notes = section.locator("p.reader-note");
    await expect(notes).toHaveCount(2);
    await expect(section.locator(".reader-en p.reader-note")).toHaveText("Here many congregations add prayers for particular needs of the time: for the community, for the government of the country, for those who are ill, and for other present concerns. Which prayers are said varies by community.");
    await expect(section.locator(".reader-he p.reader-note")).toHaveText("כאן קהילות רבות מוסיפות תפילות לצורכי השעה: לשלום הקהילה, לשלום המלכות, לרפואת החולים ולעניינים נוספים של אותה עת. התפילות הנאמרות משתנות מקהילה לקהילה.");
    expect(await notes.first().evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/system-ui/);
    // The note sits where the left-out prayers were: after the prayer for the government, before Av HaRachamim.
    const unpointed = (el: Locator) => el.evaluate(el => (el.textContent || "").replace(/[\u0591-\u05C7]/g, ""));
    const plain = await unpointed(section), hebrew = await unpointed(section.locator(".reader-he"));
    const at = (text: string) => { const i = hebrew.indexOf(text); expect(i, text).toBeGreaterThanOrEqual(0); return i; };
    expect(at("יקום פרקן")).toBeLessThan(at("הנותן תשועה"));
    expect(at("הנותן תשועה")).toBeLessThan(at("כאן קהילות רבות"));
    expect(at("כאן קהילות רבות")).toBeLessThan(at("אב הרחמים"));
    for (const removed of [/state of israel/i, /defense forces/i, /\bmilitary\b/i, /\bsoldiers?\b/i, /\bcaptiv/i, /flowering of our redemption/i, /defenders of our holy land/i, /canadian forces/i,
      /מדינת ישראל/, /צבא ה?הגנה/, /חיילי/, /אדיר במרום/, /לשבויים/, /צור ישראל וגואלו/, /ראשית צמיחת גאולתנו/, /מגיני ארץ קדשנו/]) expect(plain).not.toMatch(removed);
    const credit = card.locator(".reader-credit");
    if (nusach === "ashkenaz") {
      await expect(credit.locator("[data-lang=en]")).toContainText("Some prayers the edition prints here are omitted; a note marks the place.");
      await expect(credit.locator("[data-lang=he]")).toContainText("כמה תפילות שהמהדורה מביאה כאן הושמטו");
    } else await expect(credit).not.toContainText("omitted");
  });
}

test("prayer titles use the spelling Shmoneh Esrei", async ({ page }) => {
  await englishOnly(page);
  await page.goto("/weekday/mincha/amidah");
  await expect(page.locator("#section-silent-shemoneh-esrei .item-title [data-lang=en]")).toHaveText("Silent Shmoneh Esrei");
  await expect(page.locator(".service-map")).not.toContainText("Shemoneh");
});

for (const nusach of ["ashkenaz", "sefard"] as const) {
  test(`Shabbat Mincha: Half Kaddish after the Torah is returned, before the Shmoneh Esrei (${nusach})`, async ({ page }) => {
    await englishOnly(page);
    await page.addInitScript(nusach => localStorage.setItem("weekday-shacharit-nusach", nusach), nusach);
    await page.goto("/shabbat/mincha");
    const order = await page.locator(".service-map>li").evaluateAll(els => els.map(el => el.id));
    expect(order).toEqual(["section-ashrei-and-uva-ltzion", "section-half-kaddish", "section-torah-service", "section-half-kaddish-2", "movement-amidah", "section-tzidkatcha", "section-full-kaddish", "section-aleinu", "section-mourners-kaddish"]);
    const seam = page.locator("#section-half-kaddish-2");
    await expect(seam.locator(".landmark-title [data-lang=en]")).toHaveText("Half Kaddish");
    await expect(seam.locator(":scope>.communal-mark")).toBeVisible();
    expect(await seam.evaluate(el => getComputedStyle(el).borderTopStyle)).toBe("double");
    await seam.locator(".landmark-toggle").click();
    await expect(page).toHaveURL(/\/shabbat\/mincha\/half-kaddish-2$/);
    await expect(seam.locator(".seam-note")).toContainText("after the Torah is returned to the ark");
    await expect(seam.locator(".reader-he p:not(.rubric)").first()).toContainText(/[א-ת]/);
    await expect(seam.locator(".reader-credit [data-lang=en]")).toContainText(nusach === "sefard" ? "Nusach Sefard" : "Koren");
  });
}

test("Hebrew text is bold everywhere", async ({ page }) => {
  /** Every visible text node containing Hebrew letters, with its computed weight. */
  const hebrewWeights = () => page.evaluate(() => {
    const out: Array<{ text: string; weight: string }> = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement!;
      if (!/[֐-׿]/.test(node.textContent || "") || !parent.checkVisibility()) continue;
      out.push({ text: node.textContent!.trim().slice(0, 30), weight: getComputedStyle(parent).fontWeight });
    }
    return out;
  });
  const check = async (where: string) => {
    const found = await hebrewWeights();
    expect(found.length, where).toBeGreaterThan(5);
    expect(found.filter(f => f.weight !== "700"), where).toEqual([]);
  };
  await page.goto("/weekday/shacharit/tachanun/falling-on-the-face");
  await expect(page.locator("#text-tachanun-falling-on-the-face .reader-he p").first()).toBeVisible();
  await expect(page.locator(".reader-credit")).toBeVisible();
  await openSettings(page);
  await check("service map, controls, open prayer, section text and credit");
  expect(await page.locator(".reader-he").first().evaluate(el => getComputedStyle(el).fontFamily)).toContain("Noto Serif Hebrew");
  await page.goto("/shabbat/musaf/chazzans-musaf-repetition");
  await openAllGroups(page.locator("#section-chazzans-musaf-repetition"));
  await check("Shmoneh Esrei blessing groups");
  await page.goto("/about");
  await check("About page");
  await page.goto("/weekday/shacharit");
  await page.getByRole("button", { name: /Language/ }).click();
  await page.getByRole("button", { name: "עברית" }).click();
  await check("Hebrew-only mode");
});

test("Hebrew body text is flush right; centered Hebrew titles stay centered", async ({ page }) => {
  /** Visible block-level Hebrew inside body text, with its computed alignment. */
  const bodyHebrew = () => page.evaluate(() => {
    const containers = ".reader, .details, .landmark-details, .members>.card>button, .about-section, .about .lead, .not-found";
    const out: Array<{ text: string; align: string }> = [];
    for (const el of document.querySelectorAll<HTMLElement>("[data-lang=he], .reader-he p")) {
      const style = getComputedStyle(el);
      if (!el.checkVisibility() || style.display === "inline" || !el.closest(containers) || el.closest(".boundary")) continue;
      out.push({ text: (el.textContent || "").trim().slice(0, 30), align: style.textAlign });
    }
    return out;
  });
  const check = async (where: string) => {
    const found = await bodyHebrew();
    expect(found.length, where).toBeGreaterThan(0);
    expect(found.filter(f => f.align !== "right"), where).toEqual([]);
  };
  // Prayer text, whole and section by section.
  await page.goto("/weekday/mincha/ashrei");
  await expect(page.locator(".reader-he p").first()).toBeVisible();
  for (const selector of [".reader-he", ".reader-he p"]) expect(await page.locator(selector).first().evaluate(el => getComputedStyle(el).textAlign), selector).toBe("right");
  await check("a prayer of one section");
  await page.goto("/weekday/shacharit/tachanun/falling-on-the-face");
  await expect(page.locator("#text-tachanun-falling-on-the-face .reader-he p").first()).toBeVisible();
  await expect(page.locator(".reader-credit")).toBeVisible();
  expect(await page.locator("#text-tachanun-falling-on-the-face .reader-he p").first().evaluate(el => getComputedStyle(el).textAlign)).toBe("right");
  await check("section text, breakdown and credit");
  // Member prayer titles and summaries, and a seam's fine print.
  await page.goto("/weekday/shacharit/closing");
  await check("an open movement's prayers");
  await page.goto("/weekday/shacharit/rabbis-kaddish");
  await expect(page.locator("#section-rabbis-kaddish .reader-he p").first()).toBeVisible();
  await check("an open Kaddish");
  // Centered Hebrew stays centered: the header, the service title, seam labels, the footer.
  for (const selector of ["header h1 [data-lang=he]", ".service-title [data-lang=he]", ".service-map>.seam .landmark-title [data-lang=he]", "main>footer [data-lang=he]"]) {
    expect(await page.locator(selector).first().evaluate(el => getComputedStyle(el).textAlign), selector).toBe("center");
  }
  // Hebrew-only mode, on a map and on About.
  await page.evaluate(() => localStorage.setItem("weekday-shacharit-language", "he"));
  await page.goto("/shabbat/musaf/chazzans-musaf-repetition");
  await openAllGroups(page.locator("#section-chazzans-musaf-repetition"));
  await check("Hebrew-only mode, an open Shmoneh Esrei");
  await page.goto("/about");
  await check("About in Hebrew");
  expect(await page.locator(".about-section p [data-lang=he]").first().evaluate(el => getComputedStyle(el).textAlign)).toBe("right");
});

test("Sefard English shows the Name as LORD, and the credit says so", async ({ page }) => {
  // Metsudah's English transliterates the Name (tests/texts.spec.ts checks the snapshot has it).
  const transliteration = /Adonoy/;
  await page.addInitScript(() => localStorage.setItem("weekday-shacharit-nusach", "sefard"));
  for (const path of ["/weekday/mincha/ashrei", "/weekday/shacharit/tachanun/falling-on-the-face", "/shabbat/maariv/barkhu-call-to-prayer"]) {
    await page.goto(path);
    await expect(page.locator(".reader-en:visible").first()).toContainText(/\bLORD\b/);
    for (const text of await page.locator(".reader-en").allTextContents()) expect(text, path).not.toMatch(transliteration);
    await expect(page.locator(".reader-credit [data-lang=en]")).toContainText("The English shows the Name as “LORD”.");
    await expect(page.locator(".reader-credit [data-lang=he]")).toContainText("באנגלית השם מוצג כ־LORD.");
  }
  // Koren prints LORD itself: its credit has no note.
  await openSettings(page);
  await page.getByRole("button", { name: /Nusach Ashkenaz/ }).click();
  await expect(page.locator(".reader-credit [data-lang=en]")).toContainText("Koren");
  await expect(page.locator(".reader-credit [data-lang=en]")).not.toContainText("LORD");
});

// Heicha Kedushah: when time is short, the leader says the first three blessings aloud and everyone finishes silently.
const heichaKedushah = "kedushah-in-the-repetition-in-place-of-gods-holiness";

test("Heicha Kedushah is offered at Mincha only, never at Maariv, and the usual pattern is the default", async ({ page }) => {
  const offered = ["weekday/mincha", "shabbat/mincha"];
  for (const [day, service] of services) {
    // Weekday Maariv's Shmoneh Esrei is a single silent prayer, so its movement is that card.
    const id = `${day}/${service}` === "weekday/maariv" ? "silent-shemoneh-esrei" : "amidah";
    await page.goto(`/${day}/${service}/${id}`);
    const amidah = page.locator(id === "amidah" ? "#movement-amidah" : `#section-${id}`);
    await expect(amidah.locator(":scope>button")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".pattern-switch")).toHaveCount(offered.includes(`${day}/${service}`) ? 1 : 0);
    const has = offered.includes(`${day}/${service}`);
    await expect(amidah.locator(".pattern-switch")).toHaveCount(has ? 1 : 0);
    if (has) {
      await expect(amidah.locator('[data-pattern-choice="usual"]')).toHaveAttribute("aria-pressed", "true");
      await expect(amidah.locator(".pattern-note")).toHaveCount(0);
      await expect(amidah.locator("#section-chazzans-repetition>button")).toBeVisible();
    }
  }
  // Not a route where it isn't offered; the usual routes are unchanged.
  for (const path of ["/weekday/maariv/amidah/heicha-kedushah", "/weekday/shacharit/amidah/heicha-kedushah", "/shabbat/musaf/amidah/heicha-kedushah", `/weekday/mincha/amidah/heicha-kedushah/no-such-section`, "/weekday/mincha/chazzans-repetition/heicha-kedushah"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: /Page not found/ })).toBeVisible();
  }
  // The note is fine print: never on the top level.
  await page.goto("/weekday/mincha");
  await expect(page.locator(".service-map").getByText("time is short")).toHaveCount(0);
});

test("switching to Heicha Kedushah changes which parts show", async ({ page }) => {
  await page.goto("/weekday/mincha/amidah");
  const amidah = page.locator("#movement-amidah");
  await amidah.locator('[data-pattern-choice="heicha"]').click();
  await expect(page).toHaveURL(/\/weekday\/mincha\/amidah\/heicha-kedushah$/);
  await expect(amidah.locator('[data-pattern-choice="heicha"]')).toHaveAttribute("aria-pressed", "true");
  await expect(amidah.locator('[data-pattern-choice="heicha"]')).toBeFocused();
  await expect(amidah.locator(".pattern-note")).toContainText("time is short");
  await expect(amidah.locator(".pattern-note")).toContainText("Practice varies");
  await expect(amidah.locator(":scope>button .blurb")).toContainText("Kedushah aloud, then silent");
  // No repetition card and no silent-prayer card: one pass, aloud then silent.
  await expect(amidah.locator(".members>.card>button")).toHaveCount(0);
  await expect(amidah.getByText("Chazzan’s repetition")).toHaveCount(0);
  const aloud = amidah.locator('[data-heicha-part="aloud"]'), silent = amidah.locator('[data-heicha-part="silent"]');
  await expect(aloud.locator(".toc-toggle")).toHaveCount(3);
  await expect(aloud.locator(".toc-toggle").nth(2)).toContainText("Holiness of the Name");
  await expect(aloud.locator(".overlay")).toContainText("Kedushah");
  await expect(aloud.locator('.toc-toggle[data-section="' + heichaKedushah + '"]')).toHaveCount(1);
  await expect(silent.locator('.toc-toggle[data-section="ancestors-avot"]')).toHaveCount(0);
  await expect(silent.locator('.toc-toggle[data-section="knowledge-atah-chonen"]')).toHaveCount(1);
  await expect(silent.locator('.toc-toggle[data-section="personal-conclusion-elohai-netzor-and-steps-back"]')).toBeVisible();
  await expect(amidah.locator('[data-section="priestly-blessing-said-by-the-prayer-leader"]')).toHaveCount(0);
  // Kedushah opens in place, from the repetition's text; a silent blessing opens from the silent prayer's.
  await aloud.locator('.toc-toggle[data-section="' + heichaKedushah + '"]').click();
  await expect(page).toHaveURL(new RegExp(`/weekday/mincha/amidah/heicha-kedushah/${heichaKedushah}$`));
  await expect(aloud.locator(".reader-section")).toHaveCount(1);
  await expect(aloud.locator(".reader-heading")).toContainText("Kedushah and Holiness of the Name");
  await expect(aloud.locator(".reader-credit")).toBeVisible();
  await silent.locator(".toc-group").first().click();
  await silent.locator('.toc-toggle[data-section="healing-refaeinu"]').click();
  await expect(page).toHaveURL(/\/weekday\/mincha\/amidah\/heicha-kedushah\/healing-refaeinu$/);
  await expect(silent.locator("#text-silent-shemoneh-esrei-healing-refaeinu .reader-section")).toBeVisible();
  await expect(amidah.locator(".reader-section")).toHaveCount(2);
  // Back to the usual pattern: both cards return, the note goes.
  await amidah.locator('[data-pattern-choice="usual"]').click();
  await expect(page).toHaveURL(/\/weekday\/mincha\/amidah$/);
  await expect(amidah.locator("#section-silent-shemoneh-esrei>button")).toBeVisible();
  await expect(amidah.locator("#section-chazzans-repetition>button")).toBeVisible();
  await expect(amidah.locator(".pattern-note")).toHaveCount(0);
  await expect(amidah.locator(":scope>button .blurb")).toContainText("Silent, then repeated aloud");
});

test("Heicha Kedushah deep links work, and Back/Forward step through the patterns", async ({ page }) => {
  await page.goto(`/shabbat/mincha/amidah/heicha-kedushah/${heichaKedushah}`);
  const amidah = page.locator("#movement-amidah");
  await expect(amidah.locator(":scope>button")).toHaveAttribute("aria-expanded", "true");
  await expect(amidah.locator('[data-pattern-choice="heicha"]')).toHaveAttribute("aria-pressed", "true");
  const toggle = amidah.locator(`.toc-toggle[data-section="${heichaKedushah}"]`);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(toggle).toBeFocused();
  await expect(amidah.locator(".reader-section")).toBeInViewport();
  await expect(amidah.locator('[data-heicha-part="silent"] .toc-toggle[data-section="sanctity-of-the-day-atah-echad"]')).toHaveCount(1);
  // History: usual → Heicha Kedushah → a section, then back and forward again.
  await page.goto("/weekday/mincha/amidah");
  await amidah.locator('[data-pattern-choice="heicha"]').click();
  await expect(page).toHaveURL(/\/amidah\/heicha-kedushah$/);
  await amidah.locator('[data-heicha-part="aloud"] .toc-toggle[data-section="ancestors-avot"]').click();
  await expect(page).toHaveURL(/\/amidah\/heicha-kedushah\/ancestors-avot$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/amidah\/heicha-kedushah$/);
  await expect(amidah.locator(".reader-section")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/weekday\/mincha\/amidah$/);
  await expect(amidah.locator('[data-pattern-choice="usual"]')).toHaveAttribute("aria-pressed", "true");
  await expect(amidah.locator("#section-chazzans-repetition>button")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/amidah\/heicha-kedushah$/);
  await expect(amidah.locator('[data-heicha-part="aloud"]')).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/amidah\/heicha-kedushah\/ancestors-avot$/);
  await expect(amidah.locator('[data-heicha-part="aloud"] .reader-section')).toHaveCount(1);
  // Closing the section stays in Heicha Kedushah.
  await amidah.locator('.toc-toggle[data-section="ancestors-avot"]').click();
  await expect(page).toHaveURL(/\/amidah\/heicha-kedushah$/);
  await expect(amidah.locator('.toc-toggle[data-section="ancestors-avot"]')).toBeFocused();
});

test("each edition's own formatting is kept: Koren's line breaks and small caps, safely, with the glitch fixes", async ({ page }) => {
  // Koren's Ashrei as the snapshot has it (tests/texts.spec.ts checks the sanitizing itself).
  const snapshot = JSON.parse(readFileSync(new URL("../content/texts/weekday/mincha/ashrei.ashkenaz.json", import.meta.url), "utf8"));
  const psalm: string = (Object.values(snapshot.refs)[0] as { he: Record<string, string> }).he[2];
  const lines = psalm.split("<br>").map(line => line.replace(/[◂▸]/g, "").trim());
  await page.goto("/weekday/mincha/ashrei");
  const he = page.locator("#section-ashrei .reader-he>p"), en = page.locator("#section-ashrei .reader-en>p");
  await expect(he).toHaveCount(3);
  // One line per <br>: the opening line and the verses after it.
  await expect(he.nth(1).locator("br")).toHaveCount(lines.length - 1);
  expect(lines.length).toBeGreaterThan(20);
  expect((await he.nth(1).innerText()).split("\n").map(line => line.trim())).toEqual(lines);
  expect(await he.nth(0).evaluate(p => getComputedStyle(p).textAlign)).toBe("right");
  // Koren's small "LORD" renders small.
  const small = en.nth(0).locator("small", { hasText: "LORD" });
  await expect(small).toHaveCount(1);
  const sizes = await small.evaluate(el => [parseFloat(getComputedStyle(el).fontSize), parseFloat(getComputedStyle(el.parentElement!).fontSize)]);
  expect(sizes[0]).toBeLessThan(sizes[1]);
  // Only the kept formatting reaches the page.
  const text = page.locator("#section-ashrei .reader-texts");
  await expect(text.locator("script, span, sup, [style], [onclick], p [class], [data-x]")).toHaveCount(0);
  for (const p of await text.locator("p").all()) expect(await p.textContent()).not.toMatch(/[<>◂▸]/);
  // The glitch fixes apply: Koren's English starts with the Hebrew opening word, already shown above.
  expect((await en.nth(0).innerText()).split("\n")[0]).toBe("Happy are those who dwell in Your House;");
  // Bold, where an edition has it, is bold.
  await page.goto("/weekday/mincha/half-kaddish");
  await page.evaluate(() => { localStorage.setItem("weekday-shacharit-nusach", "sefard"); });
  await page.reload();
  const bold = page.locator("#section-half-kaddish .reader-he b").first();
  await expect(bold).toBeVisible();
  expect(await bold.evaluate(b => getComputedStyle(b).fontWeight)).toBe("700");
});

// ---- Self-hosted text: no Sefaria request for prayer text, and no loading line in normal use. ----

test("prayer text never comes from Sefaria", async ({ page }) => {
  const unexpected: string[] = [];
  await mockSefaria(page, unexpected);
  await page.goto("/weekday/shacharit/tachanun/falling-on-the-face");
  await expect(page.locator("#text-tachanun-falling-on-the-face .reader-he p").first()).toBeVisible();
  await page.locator('.toc-toggle[data-section="supplication"]').click();
  await expect(page.locator("#text-tachanun-supplication .reader-he p").first()).toBeVisible();
  await page.goto("/shabbat/maariv");
  await page.locator("#section-barkhu-call-to-prayer .landmark-toggle").click();
  await expect(page.locator("#section-barkhu-call-to-prayer .reader-he p").first()).toBeVisible();
  expect(unexpected).toEqual([]);
});

/** Wait until every prayer text of the map on the page has arrived (prefetched once the page is idle). */
async function prefetched(page: Page) {
  const expected = await page.evaluate(() => {
    const nusach = document.documentElement.dataset.nusach as "ashkenaz" | "sefard";
    const main = document.querySelector("main")!;
    const urls = new Set<string>();
    const walk = (root: ParentNode) => {
      for (const el of root.querySelectorAll<HTMLElement>("[data-reader]")) { const texts = JSON.parse(el.dataset.reader!).texts; urls.add(texts[nusach] || texts.ashkenaz); }
      for (const t of root.querySelectorAll("template")) walk(t.content);
    };
    walk(document.querySelector(`template[data-map="${main.dataset.day}/${main.dataset.service}"]`)!.content);
    return [...urls];
  });
  expect(expected.length).toBeGreaterThan(5);
  await expect.poll(() => page.evaluate(urls => urls.filter(url => !performance.getEntriesByName(new URL(url, location.href).href).length).length, expected), { timeout: 10000 }).toBe(0);
}

for (const nusach of ["ashkenaz", "sefard"] as const) {
  test(`once the page has been idle a moment, every prayer and section opens on its text, with no loading line (${nusach})`, async ({ page }) => {
    await watchLoading(page);
    await page.addInitScript(nusach => localStorage.setItem("weekday-shacharit-nusach", nusach), nusach);
    const requested = textRequests(page);
    await page.goto("/weekday/shacharit");
    // Nothing is fetched before the page has loaded and settled.
    expect(requested).toEqual([]);
    await prefetched(page);
    const before = requested.length;
    // Prayers and Kaddish at the top level and inside movements; a prayer of several opens its first section.
    const cases = [[null, "opening-blessings"], [null, "rabbis-kaddish"], [null, "pesukei-dzimra"], [null, "shema-and-its-blessings"], ["amidah", "chazzans-repetition"], [null, "tachanun"], ["torah", "half-kaddish-3"], ["closing", "aleinu-and-closing-psalms"]] as const;
    for (const [movement, id] of cases) {
      if (movement) await page.locator(`#movement-${movement}>button`).click();
      const item = page.locator(`#section-${id}`);
      await item.locator(":scope>button").click();
      await openFirstSection(item);
      await expect(item.locator(".reader-he p").first(), id).toBeVisible();
    }
    expect(await loadingFrames(page)).toBe(0);
    // Each text came once, from the prefetch.
    expect(requested.length).toBe(before);
  });
}

test("after a switch to another map, its texts are prefetched too", async ({ page }) => {
  await watchLoading(page);
  await page.goto("/weekday/shacharit");
  await prefetched(page);
  await page.locator('[data-day-choice="shabbat"]').click();
  await expect(page.locator("main")).toHaveAttribute("data-day", "shabbat");
  await prefetched(page);
  await page.locator("#section-barkhu-call-to-prayer .landmark-toggle").click();
  await expect(page.locator("#section-barkhu-call-to-prayer .reader-he p").first()).toBeVisible();
  expect(await loadingFrames(page)).toBe(0);
});

test("a tap before the text has arrived shows the loading line, then the text", async ({ page }) => {
  await watchLoading(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/texts/weekday-shacharit-rabbis-kaddish-ashkenaz-*", async route => { await held; await route.fallback(); });
  await page.goto("/weekday/shacharit");
  await page.locator("#section-rabbis-kaddish .landmark-toggle").click();
  await expect(page.locator("#section-rabbis-kaddish .reader-status")).toBeVisible();
  await expect(page.locator("#section-rabbis-kaddish section[data-prayer]")).toHaveAttribute("aria-busy", "true");
  release();
  await expect(page.locator("#section-rabbis-kaddish .reader-he p").first()).toBeVisible();
  await expect(page.locator("#section-rabbis-kaddish .reader-status")).toHaveCount(0);
  await expect(page.locator("#section-rabbis-kaddish .reader-credit")).toBeVisible();
});

test("a deep link's text is in the page itself, for both nusachs, and the script keeps it", async ({ page, request }) => {
  const html = await (await request.get("/weekday/shacharit/tachanun/falling-on-the-face")).text();
  // Both nusachs' text and credit, one shown from <html data-nusach> before any script.
  expect(html.match(/data-nusach-only="(ashkenaz|sefard)"/g)?.length).toBe(2);
  expect(html).toContain("Koren Shalem Siddur (Ashkenaz)");
  expect(html).toContain("Metsudah Linear Siddur (Nusach Sefard, weekday)");
  expect(html).not.toContain("sefaria.org/api");
  await watchLoading(page);
  await page.goto("/weekday/shacharit/tachanun/falling-on-the-face");
  const text = page.locator("#text-tachanun-falling-on-the-face .reader-section");
  await expect(text.locator(".reader-he p").first()).toBeVisible();
  // The very element the page arrived with: not replaced by the script.
  await page.evaluate(() => { (document.querySelector("#text-tachanun-falling-on-the-face .reader-section") as HTMLElement & { original?: boolean }).original = true; });
  await page.waitForTimeout(300);
  expect(await text.evaluate(el => (el as HTMLElement & { original?: boolean }).original)).toBe(true);
  await expect(page.locator(".reader-credit")).toHaveCount(1);
  expect(await loadingFrames(page)).toBe(0);
});

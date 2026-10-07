import { expect, test, type Page } from "@playwright/test";
import { mockSefaria } from "./sefaria-mock";

// Day and service switches happen in place: every map page carries every map, so a switch makes no
// request, steps history, retitles the page and moves focus to the new heading.
test.beforeEach(async ({ page }) => { await mockSefaria(page); });

const movementCounts: Record<string, number> = { "weekday/shacharit": 7, "weekday/mincha": 4, "weekday/maariv": 4, "shabbat/maariv": 4, "shabbat/shacharit": 6, "shabbat/musaf": 2, "shabbat/mincha": 5 };

/** The map showing: its day and service, title, heading, controls and movements all agree. */
async function showing(page: Page, day: string, service: string, title: string) {
  await expect(page).toHaveURL(new RegExp(`/${day}/${service}(/|$)`));
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("main")).toHaveAttribute("data-service", service);
  await expect(page.locator("main")).toHaveAttribute("data-day", day);
  await expect(page).toHaveTitle(`${title} — Jewish Literacy Project`);
  await expect(page.locator("#service-heading [data-lang=en]")).toHaveText(title);
  await expect(page.locator('[aria-current="true"]')).toHaveCount(2);
  await expect(page.locator(`[data-day-choice="${day}"]`)).toHaveAttribute("aria-current", "true");
  await expect(page.locator(`[data-service-choice="${service}"]`)).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".service-map>.movement")).toHaveCount(movementCounts[`${day}/${service}`]);
}

/** Every same-origin request from here on (Sefaria is mocked and not counted). */
function requests(page: Page) {
  const seen: Array<{ url: string; type: string }> = [];
  page.on("request", request => { if (new URL(request.url()).hostname === "127.0.0.1") seen.push({ url: request.url(), type: request.resourceType() }); });
  return seen;
}

test("every map page carries every map, closed, and stays under 50 KB gzipped", async ({ request }) => {
  test.skip(test.info().project.name !== "phone-390", "sizes do not depend on the viewport");
  for (const path of ["/weekday/shacharit", "/shabbat/musaf", "/weekday/mincha/amidah/heicha-kedushah/healing-refaeinu", "/weekday/shacharit/tachanun/falling-on-the-face"]) {
    const response = await request.get(path, { headers: { "Accept-Encoding": "gzip" } });
    expect(Number(response.headers()["content-length"]), path).toBeLessThan(50 * 1024);
    const html = await response.text();
    expect(html.match(/<template data-map="/g), path).toHaveLength(7);
  }
});

test("day and service switch in place: no request, the title, heading and focus follow", async ({ page }) => {
  await page.goto("/weekday/shacharit");
  await page.evaluate(() => { (window as unknown as { marker: number }).marker = 42; });
  await page.waitForLoadState("networkidle");
  const seen = requests(page);
  await page.locator('[data-service-choice="mincha"]').click();
  await showing(page, "weekday", "mincha", "Weekday Mincha");
  await expect(page.locator("#service-heading")).toBeFocused();
  await page.locator('[data-day-choice="shabbat"]').click();
  await showing(page, "shabbat", "shacharit", "Shabbat Shacharit");
  await expect(page.locator("#service-heading")).toBeFocused();
  // Shabbat's own services now: Musaf among them.
  await expect(page.locator("[data-service-choice]")).toHaveCount(4);
  await page.locator('[data-service-choice="musaf"]').click();
  await showing(page, "shabbat", "musaf", "Shabbat Musaf");
  // Each day remembers its last service.
  await page.locator('[data-day-choice="weekday"]').click();
  await showing(page, "weekday", "mincha", "Weekday Mincha");
  await page.locator('[data-day-choice="shabbat"]').click();
  await showing(page, "shabbat", "musaf", "Shabbat Musaf");
  expect(seen).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { marker: number }).marker)).toBe(42);
  // What opens on a switched-in map opens in place, from its own templates, with its text.
  await page.locator('[data-day-choice="weekday"]').click();
  await page.locator("#section-ashrei>button").click();
  await expect(page).toHaveURL(/\/weekday\/mincha\/ashrei$/);
  await expect(page.locator("#section-ashrei .reader-he").first()).toBeVisible();
  expect(seen.filter(r => r.type === "document")).toEqual([]);
});

test("Back and Forward step across switches and in-place opens alike", async ({ page }) => {
  const documents: string[] = [];
  page.on("request", request => { if (request.resourceType() === "document") documents.push(request.url()); });
  await page.goto("/weekday/shacharit");
  await page.locator("#movement-closing>button").click();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/closing$/);
  await page.locator('[data-service-choice="mincha"]').click();
  await showing(page, "weekday", "mincha", "Weekday Mincha");
  await page.locator("#movement-amidah>button").click();
  await expect(page).toHaveURL(/\/weekday\/mincha\/amidah$/);
  await page.locator('[data-day-choice="shabbat"]').click();
  await showing(page, "shabbat", "shacharit", "Shabbat Shacharit");

  await page.goBack();
  await showing(page, "weekday", "mincha", "Weekday Mincha");
  await expect(page).toHaveURL(/\/weekday\/mincha\/amidah$/);
  await expect(page.locator("#movement-amidah>button")).toHaveAttribute("aria-expanded", "true");
  await page.goBack();
  await expect(page).toHaveURL(/\/weekday\/mincha$/);
  await expect(page.locator("#movement-amidah>button")).toHaveAttribute("aria-expanded", "false");
  await page.goBack();
  await showing(page, "weekday", "shacharit", "Weekday Shacharit");
  await expect(page).toHaveURL(/\/weekday\/shacharit\/closing$/);
  await expect(page.locator("#movement-closing>button")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#movement-closing .members>li")).toHaveCount(3);
  await page.goBack();
  await expect(page).toHaveURL(/\/weekday\/shacharit$/);
  await expect(page.locator("#movement-closing>button")).toHaveAttribute("aria-expanded", "false");

  await page.goForward();
  await page.goForward();
  await showing(page, "weekday", "mincha", "Weekday Mincha");
  await expect(page.locator("#service-heading")).toBeFocused();
  await page.goForward();
  await page.goForward();
  await showing(page, "shabbat", "shacharit", "Shabbat Shacharit");
  expect(documents).toHaveLength(1);
  // Back from a switch puts the page back where it was scrolled (within a few pixels: the browser's
  // own restoration may re-anchor it).
  await page.evaluate(() => scrollTo({ top: 400, behavior: "instant" }));
  const y = await page.evaluate(() => scrollY);
  expect(y).toBe(400);
  await page.locator('[data-service-choice="musaf"]').evaluate(link => (link as HTMLElement).click());
  await showing(page, "shabbat", "musaf", "Shabbat Musaf");
  await page.goBack();
  await showing(page, "shabbat", "shacharit", "Shabbat Shacharit");
  await expect.poll(() => page.evaluate(() => Math.abs(scrollY - 400))).toBeLessThan(10);
});

test("switches keep the language, nusach and open settings", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("weekday-shacharit-language", "he"); localStorage.setItem("weekday-shacharit-nusach", "sefard"); });
  await page.goto("/weekday/shacharit");
  await page.locator(".settings-toggle").click();
  await page.locator('[data-service-choice="maariv"]').click();
  await expect(page.locator("main")).toHaveAttribute("data-service", "maariv");
  await expect(page.locator(".settings-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#display-settings")).toBeVisible();
  await expect(page.locator('[data-language-choice="he"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-nusach-choice="sefard"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-lang=en]:visible")).toHaveCount(0);
  // The nusach switch still refills what is open on a switched-in map.
  await page.locator('[data-service-choice="shacharit"]').click();
  await page.locator("#section-tachanun>button").click();
  await expect(page.locator("#section-tachanun .toc-toggle:visible")).toHaveCount(4);
  await page.locator('[data-nusach-choice="ashkenaz"]').click();
  await expect(page.locator("#section-tachanun .toc-toggle:visible")).toHaveCount(3);
});

test("a switch animates toward the chosen day or service, and not under reduced motion", async ({ page }) => {
  const record = () => page.evaluate(() => {
    const calls: string[] = [];
    (window as unknown as { calls: string[] }).calls = calls;
    const start = document.startViewTransition?.bind(document);
    if (start) document.startViewTransition = ((update: () => void) => { calls.push(document.documentElement.dataset.switch || ""); return start(update); }) as typeof document.startViewTransition;
  });
  const calls = () => page.evaluate(() => (window as unknown as { calls: string[] }).calls);
  await page.goto("/weekday/mincha");
  await record();
  await page.locator('[data-service-choice="maariv"]').click();
  await expect(page.locator("main")).toHaveAttribute("data-service", "maariv");
  await page.locator('[data-service-choice="shacharit"]').click();
  await expect(page.locator("main")).toHaveAttribute("data-service", "shacharit");
  await page.locator('[data-day-choice="shabbat"]').click();
  await expect(page.locator("main")).toHaveAttribute("data-day", "shabbat");
  await page.goBack();
  await expect(page.locator("main")).toHaveAttribute("data-day", "weekday");
  expect(await calls()).toEqual(["forward", "back", "forward", "back"]);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.switch)).toBeUndefined();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/weekday/mincha");
  await record();
  await page.locator('[data-service-choice="maariv"]').click();
  await expect(page.locator("main")).toHaveAttribute("data-service", "maariv");
  await expect(page.locator("#service-heading")).toBeFocused();
  expect(await calls()).toEqual([]);
});

test("without the View Transitions API the new map still slides in, and the switch is the same", async ({ page }) => {
  await page.addInitScript(() => { delete (Document.prototype as { startViewTransition?: unknown }).startViewTransition; });
  await page.goto("/shabbat/musaf");
  await page.locator('[data-service-choice="shacharit"]').click();
  await showing(page, "shabbat", "shacharit", "Shabbat Shacharit");
  await expect(page.locator("html")).toHaveAttribute("data-switch", "back");
  expect(await page.locator(".service-map").evaluate(el => el.getAnimations().map(a => (a as CSSAnimation).animationName))).toEqual(["jl-switch-in"]);
  await expect(page.locator("#service-heading")).toBeFocused();
  await expect(page.locator("html")).not.toHaveAttribute("data-switch-in");
  await expect(page.locator("html")).not.toHaveAttribute("data-switch");
});

test.describe("with JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });

  test("day and service choices are plain links to their maps", async ({ page }) => {
    await page.goto("/weekday/shacharit");
    await page.locator('[data-service-choice="mincha"]').click();
    await expect(page).toHaveURL(/\/weekday\/mincha$/);
    await expect(page.locator('[data-service-choice="mincha"]')).toHaveAttribute("aria-current", "true");
    await expect(page.locator(".service-map>.movement")).toHaveCount(4);
    // The current day keeps the current service; the other day opens on Shacharit.
    await expect(page.locator('[data-day-choice="weekday"]')).toHaveAttribute("href", "/weekday/mincha");
    await page.locator('[data-day-choice="shabbat"]').click();
    await expect(page).toHaveURL(/\/shabbat\/shacharit$/);
    await expect(page.locator(".service-map>.movement")).toHaveCount(6);
    await page.locator('[data-service-choice="musaf"]').click();
    await expect(page).toHaveURL(/\/shabbat\/musaf$/);
    await expect(page.locator("#service-heading [data-lang=en]")).toHaveText("Shabbat Musaf");
  });
});

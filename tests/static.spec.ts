import { gzipSync, brotliCompressSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { mockSefaria } from "./sefaria-mock";

// The prebuilt site: state in the HTML before any script, little script, and no reloads.
test.beforeEach(async ({ page }) => { await mockSefaria(page); });

const services = [
  ["weekday", "shacharit"], ["weekday", "mincha"], ["weekday", "maariv"],
  ["shabbat", "maariv"], ["shabbat", "shacharit"], ["shabbat", "musaf"], ["shabbat", "mincha"],
] as const;
const movementCounts: Record<string, number> = { "weekday/shacharit": 7, "weekday/mincha": 4, "weekday/maariv": 4, "shabbat/maariv": 4, "shabbat/shacharit": 6, "shabbat/musaf": 2, "shabbat/mincha": 5 };

const expanded = (page: Page, selector: string) => page.locator(`${selector}:visible`);

test.describe("with JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });

  test("every map is readable", async ({ page }) => {
    for (const [day, service] of services) {
      const response = await page.goto(`/${day}/${service}`);
      expect(response!.status()).toBe(200);
      await expect(page.locator("#service-heading")).toBeVisible();
      const movements = page.locator(".service-map>.movement");
      await expect(movements).toHaveCount(movementCounts[`${day}/${service}`]);
      for (const movement of await movements.all()) {
        await expect(movement.locator(":scope>button .item-title")).toBeVisible();
        await expect(movement.locator(":scope>button")).toHaveAttribute("aria-expanded", "false");
      }
      for (const seam of await page.locator(".service-map>.seam").all()) await expect(seam.locator(".landmark-title")).toBeVisible();
      // Both languages, the default, with the peaks drawn largest.
      expect(await page.locator('[data-lang="en"]:visible').count()).toBeGreaterThan(5);
      expect(await page.locator('[data-lang="he"]:visible').count()).toBeGreaterThan(5);
      const heights = await movements.evaluateAll(els => els.map(el => ({ peak: el.classList.contains("peak"), height: el.getBoundingClientRect().height })));
      const peak = Math.min(...heights.filter(h => h.peak).map(h => h.height));
      for (const other of heights.filter(h => !h.peak)) expect(peak).toBeGreaterThan(other.height);
      await expect(page.locator("main>footer")).toBeVisible();
      const sizes = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
    }
  });

  test("deep links arrive with their movement, prayer and section open", async ({ page }) => {
    // A prayer inside a movement: both open; the prayer's breakdown shows; nothing else is open.
    await page.goto("/weekday/mincha/chazzans-repetition");
    await expect(page.locator("#movement-amidah>button")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#section-chazzans-repetition>button")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#section-chazzans-repetition .card-toc")).toBeVisible();
    await expect(page.locator('.service-map button[data-route][aria-expanded="true"]:visible')).toHaveCount(2);
    // A movement.
    await page.goto("/weekday/shacharit/closing");
    await expect(page.locator("#movement-closing>button")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#movement-closing .members>li")).toHaveCount(3);
    for (const item of await page.locator("#movement-closing .members>li").all()) await expect(item).toBeVisible();
    // A section: its prayer open, its entry expanded, its group open; the other entries closed.
    await page.goto("/weekday/shacharit/shema-and-its-blessings/first-paragraph-veahavta");
    await expect(page.locator("#section-shema-and-its-blessings>button")).toHaveAttribute("aria-expanded", "true");
    await expect(expanded(page, '#section-shema-and-its-blessings .toc-group')).toHaveAttribute("aria-expanded", "true");
    await expect(expanded(page, '.toc-toggle[data-section="first-paragraph-veahavta"]')).toHaveAttribute("aria-expanded", "true");
    await expect(expanded(page, "#text-shema-and-its-blessings-first-paragraph-veahavta")).toBeVisible();
    expect(await page.locator('#section-shema-and-its-blessings .toc-toggle[aria-expanded="true"]:visible').count()).toBe(1);
    // A section of a prayer whose breakdown differs by nusach: the default (Ashkenaz) version shows.
    await page.goto("/weekday/shacharit/tachanun/falling-on-the-face");
    await expect(page.locator("#section-tachanun>button")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#section-tachanun .toc-toggle:visible")).toHaveCount(3);
    await expect(expanded(page, '#section-tachanun .toc-toggle[data-section="falling-on-the-face"]')).toHaveAttribute("aria-expanded", "true");
    // A Kaddish seam, with its fine print, inside its movement.
    await page.goto("/shabbat/musaf/rabbis-kaddish");
    await expect(page.locator("#movement-closing>button")).toHaveAttribute("aria-expanded", "true");
    // (Its movement's body is in the HTML once per nusach, one hidden by CSS: hence :visible.)
    await expect(expanded(page, "#section-rabbis-kaddish")).toHaveAttribute("data-open", "true");
    await expect(expanded(page, "#section-rabbis-kaddish .landmark-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(expanded(page, "#section-rabbis-kaddish .seam-note")).toBeVisible();
    // Without a script the text is there too, with its credit and the way to Sefaria.
    await expect(expanded(page, "#section-rabbis-kaddish .reader-he p").first()).toBeVisible();
    await expect(expanded(page, "#section-rabbis-kaddish .reader-credit a[href^='https://www.sefaria.org/']").first()).toBeVisible();
    await page.goto("/weekday/shacharit/torah");
    await expect(page.locator("#movement-torah>button")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#movement-torah .stages .stage")).toHaveCount(4);
    // Heicha Kedushah with a section open: the pattern, its line, its note, and the section.
    await page.goto("/weekday/mincha/amidah/heicha-kedushah/healing-refaeinu");
    const amidah = page.locator("#movement-amidah");
    await expect(amidah.locator(":scope>button")).toHaveAttribute("aria-expanded", "true");
    await expect(amidah.locator(":scope>button .blurb")).toContainText("Kedushah aloud, then silent");
    await expect(amidah.locator('[data-pattern-choice="heicha"]:visible')).toHaveAttribute("aria-pressed", "true");
    await expect(amidah.locator(".pattern-note:visible")).toBeVisible();
    await expect(expanded(page, '[data-heicha-part="silent"] .toc-toggle[data-section="healing-refaeinu"]')).toHaveAttribute("aria-expanded", "true");
    await expect(expanded(page, "#text-silent-shemoneh-esrei-healing-refaeinu")).toBeVisible();
    await expect(expanded(page, "#text-silent-shemoneh-esrei-healing-refaeinu .reader-he p").first()).toBeVisible();
    // A section's text, in the saved nusach only.
    await page.goto("/weekday/shacharit/tachanun/falling-on-the-face");
    await expect(page.locator("#text-tachanun-falling-on-the-face .reader-he p:visible").first()).toBeVisible();
    await expect(page.locator(".reader-credit:visible")).toHaveCount(1);
    await expect(page.locator(".reader-credit:visible")).toContainText("Koren");
  });
});

test("taps open and close in place: one page load, the URL in step, Back and Forward restore", async ({ page }) => {
  const documents: string[] = [];
  page.on("request", request => { if (request.resourceType() === "document") documents.push(request.url()); });
  await page.goto("/weekday/shacharit");
  await page.evaluate(() => { (window as unknown as { marker: number }).marker = 42; });
  await page.locator("#movement-closing>button").click();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/closing$/);
  await page.locator("#section-aleinu-and-closing-psalms>button").click();
  await expect(page).toHaveURL(/\/aleinu-and-closing-psalms$/);
  await page.locator("#section-aleinu-and-closing-psalms .toc-toggle").first().click();
  await expect(page.locator("#section-aleinu-and-closing-psalms .reader-section")).toHaveCount(1);
  await page.locator("#section-rabbis-kaddish .landmark-toggle").click();
  await expect(page.locator("#section-rabbis-kaddish .reader-section").first()).toBeVisible();
  await page.goBack();
  await expect(page.locator("#section-aleinu-and-closing-psalms .reader-section")).toHaveCount(1);
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/closing$/);
  await page.goForward();
  await expect(page.locator("#section-aleinu-and-closing-psalms>button")).toHaveAttribute("aria-expanded", "true");
  await page.locator(".settings-toggle").click();
  await page.getByRole("button", { name: /Nusach Sefard/ }).click();
  await page.getByRole("button", { name: "English" }).click();
  await page.locator("#section-aleinu-and-closing-psalms>button").click();
  await expect(page).toHaveURL(/\/weekday\/shacharit\/closing$/);
  expect(documents).toHaveLength(1);
  expect(await page.evaluate(() => (window as unknown as { marker: number }).marker)).toBe(42);
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
  // The Shmoneh Esrei's pattern switch, too.
  await page.goto("/weekday/mincha/amidah");
  await page.evaluate(() => { (window as unknown as { marker: number }).marker = 43; });
  await page.locator('[data-pattern-choice="heicha"]').click();
  await expect(page).toHaveURL(/\/amidah\/heicha-kedushah$/);
  await page.locator('[data-heicha-part="aloud"] .toc-toggle').first().click();
  await expect(page.locator('[data-heicha-part="aloud"] .reader-section')).toHaveCount(1);
  await page.goBack();
  await page.goBack();
  await expect(page.locator('[data-pattern-choice="usual"]')).toHaveAttribute("aria-pressed", "true");
  expect(documents).toHaveLength(2);
  expect(await page.evaluate(() => (window as unknown as { marker: number }).marker)).toBe(43);
});

for (const [language, hidden] of [["en", "he"], ["he", "en"]] as const) {
  test(`the saved language (${language}) is in place before first paint, script or no script`, async ({ page }) => {
    await page.addInitScript(language => {
      localStorage.setItem("weekday-shacharit-language", language);
      // Record <html data-language> the moment <body> starts, before anything in it can paint,
      // and whether the other language ever shows on any frame while loading.
      const seen = { atBody: null as string | null, flashes: 0 };
      (window as unknown as { seen: typeof seen }).seen = seen;
      new MutationObserver((_, observer) => {
        if (!document.body) return;
        seen.atBody = document.documentElement.getAttribute("data-language");
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
      const other = language === "en" ? "he" : "en";
      const frame = () => {
        if ([...document.querySelectorAll(`body [data-lang=${other}]`)].some(el => el.checkVisibility())) seen.flashes++;
        if (document.readyState !== "complete") requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }, language);
    for (const blockScript of [false, true]) {
      // Without the bundle the page still shows, in the saved language: nothing waits on it.
      if (blockScript) await page.route("**/_astro/*.js", route => route.abort());
      await page.goto("/weekday/shacharit/closing");
      await expect(page.locator(".service-map")).toBeVisible();
      const seen = await page.evaluate(() => (window as unknown as { seen: { atBody: string; flashes: number } }).seen);
      expect(seen.atBody).toBe(language);
      expect(seen.flashes).toBe(0);
      await expect(page.locator(`[data-lang=${hidden}]:visible`)).toHaveCount(0);
      await expect(page.locator(`[data-language-choice=${language}]`)).toHaveCSS("background-color", "rgb(23, 50, 77)");
    }
  });
}

test("the saved nusach's version of an open prayer is the only one shown, script or no script", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("weekday-shacharit-nusach", "sefard"));
  for (const blockScript of [false, true]) {
    if (blockScript) await page.route("**/_astro/*.js", route => route.abort());
    await page.goto("/weekday/shacharit/tachanun");
    // Sefard's Tachanun has a fourth entry, the confession and thirteen attributes.
    await expect(page.locator("#section-tachanun .toc-toggle:visible")).toHaveCount(4);
    await expect(page.locator("#section-tachanun").getByText("Confession and Thirteen Attributes")).toBeVisible();
  }
});

/** The compressed size of every script a cold load of `path` runs, external and inline. */
async function scriptBytes(page: Page, path: string) {
  const external: string[] = [];
  page.on("response", response => { if (response.request().resourceType() === "script" && new URL(response.url()).hostname === "127.0.0.1") external.push(response.url()); });
  await page.goto(path);
  await expect(page.locator(".service-map")).toBeVisible();
  await page.waitForLoadState("networkidle");
  const inline = await page.locator("script:not([src])").evaluateAll(els => els.map(el => el.textContent || "").join(""));
  let gzip = gzipSync(inline).length, br = brotliCompressSync(inline).length;
  for (const url of new Set(external)) {
    for (const [encoding, add] of [["gzip", (n: number) => { gzip += n; }], ["br", (n: number) => { br += n; }]] as const) {
      const response = await page.request.get(url, { headers: { "Accept-Encoding": encoding } });
      expect(response.headers()["content-encoding"]).toBe(encoding);
      add(Number(response.headers()["content-length"]));
    }
  }
  return { gzip, br, files: new Set(external).size };
}

// The goal is well under 30 KB of compressed script for a cold load; the budget here is 20 KB for the
// page script, so a framework (or a data file bundled into the script) creeping back in fails the
// build. A page that opens on a calendar box also carries, inline, the small script that writes its
// verdict before the first paint (src/notes-script.ts): 25 KB in all.
test("a cold load runs well under 30 KB of compressed script, and opening a prayer adds none", async ({ page }) => {
  test.skip(test.info().project.name !== "phone-390", "sizes do not depend on the viewport");
  for (const [path, files, budget] of [["/weekday/shacharit", 1, 20], ["/weekday/shacharit/pesukei-dzimra/hodu", 1, 20], ["/weekday/shacharit/tachanun/falling-on-the-face", 1, 25]] as const) {
    const size = await scriptBytes(page, path);
    expect(size.files, path).toBe(files);
    expect(size.gzip, path).toBeLessThan(budget * 1024);
    expect(size.br, path).toBeLessThan(budget * 1024);
  }
  const scripts: string[] = [];
  page.on("request", request => { if (request.resourceType() === "script") scripts.push(request.url()); });
  await page.locator("#section-pesukei-dzimra>button").click();
  await page.locator("#section-pesukei-dzimra .toc-toggle").first().click();
  await expect(page.locator("#section-pesukei-dzimra .reader-section")).toHaveCount(1);
  expect(scripts).toEqual([]);
});

test("a deep link near the end of the page still lands on its target once the text arrives", async ({ page }) => {
  for (const [path, selector] of [["/weekday/maariv/mourners-kaddish", "#section-mourners-kaddish"], ["/shabbat/musaf/rabbis-kaddish", "#movement-closing"]] as const) {
    await page.goto(path);
    await expect(page.locator(`${selector} .reader-he p`).first()).toBeVisible();
    await expect.poll(() => page.locator(selector).evaluate(el => Math.abs(el.getBoundingClientRect().top))).toBeLessThan(1);
  }
  // Once the reader scrolls, the page stays where they put it.
  await page.mouse.wheel(0, -300);
  await expect.poll(() => page.locator("#movement-closing").evaluate(el => Math.round(el.getBoundingClientRect().top))).toBeGreaterThan(100);
});

test("a first load paints with the page alone: styles inlined, text in the page, fonts preloaded only where text shows", async ({ page, request }) => {
  test.skip(test.info().project.name !== "phone-390", "markup does not depend on the viewport");
  const map = await (await request.get("/weekday/maariv")).text();
  expect(map).not.toMatch(/<link[^>]+rel="stylesheet"/);
  expect(map).toContain("<style>");
  expect(map).not.toContain('rel="preload"');
  for (const path of ["/weekday/shacharit/tachanun/falling-on-the-face", "/weekday/mincha/ashrei"]) {
    const section = await (await request.get(path)).text();
    const fonts = [...section.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map(m => m[1]);
    expect(fonts, path).toHaveLength(3);
    // The very files the styles use, so nothing loads twice.
    for (const font of fonts) expect(section).toContain(`url(${font})`);
    // The text is in the page; nothing is asked of Sefaria.
    expect(section).toContain('class="reader-text reader-he"');
    expect(section).not.toContain("sefaria.org/api");
    expect(section).not.toContain('rel="preconnect"');
  }
  await page.goto("/weekday/maariv");
  await expect(page.locator("#service-heading")).toBeVisible();
});

// A deep link lands on its target before the page script arrives (a small inline script does it),
// and the page script keeps it exactly there: no jump once it runs.
test("deep links land before the script runs, where the script would put them", async ({ page }) => {
  for (const path of ["/weekday/shacharit/tachanun/falling-on-the-face", "/weekday/mincha/amidah/heicha-kedushah/healing-refaeinu", "/weekday/mincha/chazzans-repetition", "/weekday/shacharit/closing", "/weekday/mincha/ashrei", "/shabbat/musaf/rabbis-kaddish", "/weekday/maariv/barkhu-call-to-prayer"]) {
    await page.route("**/_astro/*.js", route => route.abort());
    await page.goto(path);
    const before = await page.evaluate(() => scrollY);
    await page.unroute("**/_astro/*.js");
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => scrollY);
    expect(before, path).toBeGreaterThan(0);
    expect(Math.abs(after - before), path).toBeLessThanOrEqual(2);
  }
});

test("a deep link's text shows without shifting the page, even when its fonts arrive late", async ({ page }) => {
  await page.route("**/_astro/*.woff2", async route => { await new Promise(r => setTimeout(r, 400)); await route.fallback(); });
  await page.addInitScript(() => {
    (window as unknown as { shift: number }).shift = 0;
    new PerformanceObserver(list => { for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!entry.hadRecentInput) (window as unknown as { shift: number }).shift += entry.value; }).observe({ type: "layout-shift", buffered: true });
  });
  for (const path of ["/weekday/shacharit/tachanun/falling-on-the-face", "/weekday/mincha/ashrei"]) {
    await page.goto(path);
    await expect(page.locator(".reader-text").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { shift: number }).shift), path).toBeLessThan(0.02);
  }
});

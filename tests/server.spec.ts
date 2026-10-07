import { expect, test } from "@playwright/test";

// server.mjs is the test web server (see playwright.config.ts); these check its encodings directly.
test.describe("server.mjs", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "phone-390", "server behavior does not depend on the viewport"));

  test("sends Brotli, then gzip, then raw, with the original type, and keeps caching rules", async ({ request }) => {
    const html = await request.get("/weekday/shacharit", { headers: { "Accept-Encoding": "gzip, deflate, br" } });
    expect(html.status()).toBe(200);
    expect(html.headers()["content-encoding"]).toBe("br");
    expect(html.headers()["content-type"]).toBe("text/html; charset=utf-8");
    expect(html.headers()["vary"]).toBe("Accept-Encoding");
    expect(html.headers()["cache-control"]).toBe("no-cache");
    // The page is prebuilt: the map itself is in the HTML.
    expect(await html.text()).toContain('<ol class="service-map">');
    const script = (await html.text()).match(/src="(\/_astro\/[^"]+\.js)"/)![1];
    for (const [accept, encoding] of [["br", "br"], ["gzip", "gzip"], ["br;q=0, gzip", "gzip"], ["identity", undefined]] as const) {
      const response = await request.get(script, { headers: { "Accept-Encoding": accept } });
      expect(response.status(), accept).toBe(200);
      expect(response.headers()["content-encoding"], accept).toBe(encoding);
      expect(response.headers()["content-type"], accept).toBe("text/javascript; charset=utf-8");
      expect(response.headers()["cache-control"], accept).toBe("public, max-age=31536000, immutable");
      expect((await response.text()).length, accept).toBeGreaterThan(1000);
    }
    // Deep links are their own compressed pages, with the same script and their state open.
    const deep = await request.get("/weekday/shacharit/tachanun/falling-on-the-face", { headers: { "Accept-Encoding": "gzip" } });
    expect(deep.status()).toBe(200);
    expect(deep.headers()["content-encoding"]).toBe("gzip");
    expect(deep.headers()["cache-control"]).toBe("no-cache");
    const body = await deep.text();
    expect(body).toContain(script);
    expect(body).toMatch(/<button type="button" class="toc-toggle" aria-expanded="true" aria-controls="text-tachanun-falling-on-the-face"/);
    // A trailing slash names the same page.
    expect((await request.get("/weekday/shacharit/tachanun/")).status()).toBe(200);
  });

  test("reading plans are small, compressed and cached for good", async ({ request }) => {
    const html = await (await request.get("/weekday/mincha/ashrei")).text();
    const plan = html.match(/&quot;ashkenaz&quot;:&quot;(\/plans\/[^&]+\.json)&quot;/)![1];
    const response = await request.get(plan, { headers: { "Accept-Encoding": "br" } });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/json");
    expect(response.headers()["content-encoding"]).toBe("br");
    expect(response.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(Number(response.headers()["content-length"])).toBeLessThan(2000);
    expect((await response.json()).source.id).toBe("weekday/mincha/ashrei:ashkenaz");
  });

  test("old URLs redirect, and unknown paths are a real 404 with the not-found page", async ({ request }) => {
    for (const [from, to, status] of [["/roadmap.html", "/weekday/shacharit", 301], ["/weekday-shacharit.html", "/weekday/shacharit", 301], ["/about.html", "/about", 301], ["/", "/weekday/shacharit", 302]] as const) {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status(), from).toBe(status);
      expect(response.headers()["location"], from).toBe(to);
    }
    for (const path of ["/weekday/musaf", "/weekday/shacharit/tachanun/no-such-section", "/nope", "/../server.mjs", "/%E0%A4%A"]) {
      const response = await request.get(path, { headers: { "Accept-Encoding": "gzip" } });
      expect(response.status(), path).toBe(404);
      expect(response.headers()["content-type"], path).toBe("text/html; charset=utf-8");
      expect(await response.text(), path).toContain("Page not found");
    }
  });
});

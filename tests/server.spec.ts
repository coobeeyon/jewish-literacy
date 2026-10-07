import { expect, test } from "@playwright/test";

// server.mjs is the test web server (see playwright.config.ts); these check its encodings directly.
test.describe("server.mjs", () => {
  test("sends Brotli, then gzip, then raw, with the original type, and keeps caching rules", async ({ request }) => {
    test.skip(test.info().project.name !== "phone-390", "server behavior does not depend on the viewport");
    const html = await request.get("/weekday/shacharit", { headers: { "Accept-Encoding": "gzip, deflate, br" } });
    expect(html.status()).toBe(200);
    expect(html.headers()["content-encoding"]).toBe("br");
    expect(html.headers()["content-type"]).toBe("text/html; charset=utf-8");
    expect(html.headers()["vary"]).toBe("Accept-Encoding");
    expect(html.headers()["cache-control"]).toBe("no-cache");
    expect(await html.text()).toContain('<div id="root">');
    const script = (await html.text()).match(/src="(\/assets\/[^"]+\.js)"/)![1];
    for (const [accept, encoding] of [["br", "br"], ["gzip", "gzip"], ["br;q=0, gzip", "gzip"], ["identity", undefined]] as const) {
      const response = await request.get(script, { headers: { "Accept-Encoding": accept } });
      expect(response.status(), accept).toBe(200);
      expect(response.headers()["content-encoding"], accept).toBe(encoding);
      expect(response.headers()["content-type"], accept).toBe("text/javascript; charset=utf-8");
      expect(response.headers()["cache-control"], accept).toBe("public, max-age=31536000, immutable");
      expect((await response.text()).length, accept).toBeGreaterThan(1000);
    }
    // Deep links (app routes) get the compressed index.html too.
    const deep = await request.get("/weekday/shacharit/tachanun/falling-on-the-face", { headers: { "Accept-Encoding": "gzip" } });
    expect(deep.headers()["content-encoding"]).toBe("gzip");
    expect(await deep.text()).toContain(script);
  });
});

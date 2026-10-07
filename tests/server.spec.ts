import { request as httpRequest, Agent } from "node:http";
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
    // Pages are files (weekday/shacharit.html), so a host serves the slashless URLs the app uses
    // without a redirect; a trailing slash names the same page here.
    for (const path of ["/weekday/maariv", "/weekday/maariv/", "/weekday/shacharit/tachanun", "/weekday/shacharit/tachanun/", "/weekday/shacharit/tachanun/falling-on-the-face"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
      expect(await response.text(), path).toContain('<ol class="service-map">');
    }
    // About is the page itself, not a stand-in that redirects.
    const about = await request.get("/about", { maxRedirects: 0 });
    expect(about.status()).toBe(200);
    expect(await about.text()).toContain('id="about-heading"');
  });

  test("prayer texts are small, compressed and cached for good", async ({ request }) => {
    const html = await (await request.get("/weekday/mincha/ashrei")).text();
    const url = html.match(/&quot;ashkenaz&quot;:&quot;(\/texts\/[^&]+\.json)&quot;/)![1];
    const response = await request.get(url, { headers: { "Accept-Encoding": "br" } });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/json");
    expect(response.headers()["content-encoding"]).toBe("br");
    expect(response.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(Number(response.headers()["content-length"])).toBeLessThan(4000);
    const file = await response.json();
    expect(file.parts).toHaveLength(1);
    expect(file.parts[0].html).toMatch(/<div class="reader-text reader-he"[^>]*><p>[א-ת]/);
    expect(file.parts[0].html).toContain("Happy are those who dwell in Your House");
    expect(file.credit).toContain("Koren Shalem Siddur (Ashkenaz)");
    expect(file.fellBack).toContain("isn’t available on Sefaria");
  });

  test("every file has a strong ETag and Last-Modified, and an unchanged one is a bodiless 304", async ({ request }) => {
    const html = await request.get("/weekday/shacharit", { headers: { "Accept-Encoding": "gzip" } });
    const etag = html.headers()["etag"], modified = html.headers()["last-modified"];
    expect(etag).toMatch(/^"[\w-]{20,}"$/);
    expect(new Date(modified).getTime()).toBeGreaterThan(0);
    // Pages are still revalidated every time, so a new build shows at once; it just costs a 304.
    expect(html.headers()["cache-control"]).toBe("no-cache");
    for (const headers of [{ "If-None-Match": etag }, { "If-None-Match": `"other", W/${etag}` }, { "If-Modified-Since": modified }]) {
      const again = await request.get("/weekday/shacharit", { headers: { "Accept-Encoding": "gzip", ...headers } });
      expect(again.status(), JSON.stringify(headers)).toBe(304);
      expect(again.headers()["etag"]).toBe(etag);
      expect(again.headers()["cache-control"]).toBe("no-cache");
      expect((await again.body()).length).toBe(0);
    }
    // Each encoding is its own representation, with its own tag; a changed page is sent whole.
    const br = await request.get("/weekday/shacharit", { headers: { "Accept-Encoding": "br" } });
    expect(br.headers()["etag"]).not.toBe(etag);
    expect((await request.get("/weekday/shacharit", { headers: { "Accept-Encoding": "br", "If-None-Match": etag } })).status()).toBe(200);
    expect((await request.get("/weekday/shacharit", { headers: { "Accept-Encoding": "gzip", "If-Modified-Since": new Date(Date.parse(modified) - 1000).toUTCString() } })).status()).toBe(200);
    // Hashed assets: tagged too, and still cached for good.
    const script = (await html.text()).match(/src="(\/_astro\/[^"]+\.js)"/)![1];
    const js = await request.get(script, { headers: { "Accept-Encoding": "br" } });
    expect(js.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect((await request.get(script, { headers: { "Accept-Encoding": "br", "If-None-Match": js.headers()["etag"] } })).status()).toBe(304);
    // Not-found pages are never a 304.
    const missing = await request.get("/nope");
    expect(missing.status()).toBe(404);
    expect(missing.headers()["etag"]).toBeUndefined();
  });

  test("an idle connection stays open, so a request after a pause needs no new connection", async ({ baseURL }) => {
    test.setTimeout(30_000);
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    const get = () => new Promise<{ reused: boolean; keepAlive?: string }>((resolve, reject) => {
      const request = httpRequest(`${baseURL}/weekday/shacharit`, { agent, headers: { "Accept-Encoding": "gzip" } }, response => {
        response.resume();
        response.on("end", () => resolve({ reused: request.reusedSocket, keepAlive: response.headers["keep-alive"] }));
      }).on("error", reject);
      request.end();
    });
    const first = await get();
    expect(first.reused).toBe(false);
    expect(first.keepAlive).toBe("timeout=120");
    await new Promise(resolve => setTimeout(resolve, 10_000));
    expect((await get()).reused).toBe(true);
    agent.destroy();
  });

  test("every page links the site icon set, served with its type and cached for good", async ({ request }) => {
    const types: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png" };
    for (const path of ["/weekday/maariv", "/weekday/shacharit/tachanun/falling-on-the-face", "/about", "/nope"]) {
      const html = await (await request.get(path)).text();
      const icons = [...html.matchAll(/<link rel="(icon|apple-touch-icon)" href="([^"]+)"/g)].map(m => m[2]);
      expect(icons, path).toHaveLength(4);
      expect(html, path).toContain('<link rel="manifest" href="/manifest.webmanifest">');
      for (const icon of icons) {
        const response = await request.get(icon);
        expect(response.status(), icon).toBe(200);
        expect(response.headers()["content-type"], icon).toBe(types[icon.slice(icon.lastIndexOf("."))]);
        expect(response.headers()["cache-control"], icon).toBe("public, max-age=31536000, immutable");
      }
    }
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.headers()["content-type"]).toBe("application/manifest+json");
    expect(manifest.headers()["cache-control"]).toBe("no-cache");
    const { name, short_name, theme_color, icons } = await manifest.json();
    expect([name, short_name, theme_color]).toEqual(["Jewish Literacy Project", "Jewish Literacy", "#f7fafc"]);
    for (const icon of icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200);
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

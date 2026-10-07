// Old and bare URLs. server.mjs and netlify.toml answer these with real redirects; the static
// pages written for them (src/pages/[redirect].ts, src/pages/index.astro) are only a fallback.
export const redirects: ReadonlyArray<readonly [from: string, to: string, status: 301 | 302]> = [
  ["/roadmap.html", "/weekday/shacharit", 301],
  ["/weekday-shacharit.html", "/weekday/shacharit", 301],
  ["/about.html", "/about", 301],
  ["/", "/weekday/shacharit", 302],
];

export const redirectPage = (to: string) => `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0; url=${to}"><link rel="canonical" href="${to}"><title>Jewish Literacy Project</title><script>location.replace(${JSON.stringify(to)} + location.search)</script></head><body><a href="${to}">Jewish Literacy Project</a></body></html>`;

import { defineConfig } from "astro/config";

// Static output: every view is a prebuilt page (dist/<day>/<service>/….html), so a host serves
// /weekday/shacharit from weekday/shacharit.html with no redirect to a trailing slash. The styles are
// inlined in each page, so the first paint needs the page alone, one round trip. The markup
// is written as Preact JSX (src/view) and rendered to HTML at build time; no framework code is
// shipped, so no Astro renderer integration is needed, only the JSX transform.
export default defineConfig({
  output: "static",
  build: { format: "file", inlineStylesheets: "always" },
  trailingSlash: "ignore",
  vite: { esbuild: { jsx: "automatic", jsxImportSource: "preact" } },
});

import { defineConfig } from "astro/config";

// Static output: every view is a prebuilt page (dist/<day>/<service>/…/index.html). The markup
// is written as Preact JSX (src/view) and rendered to HTML at build time; no framework code is
// shipped, so no Astro renderer integration is needed, only the JSX transform.
export default defineConfig({
  output: "static",
  build: { format: "directory" },
  trailingSlash: "ignore",
  vite: { esbuild: { jsx: "automatic", jsxImportSource: "preact" } },
});

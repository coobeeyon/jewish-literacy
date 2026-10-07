// Build time: the script a page that arrives with a calendar box open loads right after its map,
// before the first paint, so the box opens with its verdict written and nothing moves when the page
// script arrives. It is src/today.ts itself (which imports nothing, for this reason), minified, with
// the parts of the calendar table the boxes read, and one call. Content-hashed, so browsers keep it for good; pages
// without a box open never load it.
import { createHash } from "node:crypto";
import { buildSync } from "esbuild";
import calendar from "./calendar.generated.json";
import source from "./today.ts?raw";

let file: { name: string; body: string } | undefined;

export function notesScript() {
  if (file) return file;
  // The boxes need neither the week's readings nor the daily psalms' Shabbat names.
  const { shabbatot: _readings, ...table } = calendar;
  // Bundled from the source alone, so whatever the boxes do not use is left out.
  const body = buildSync({
    stdin: { contents: `${source.replace(/^export /gm, "")}\nconst d = localToday();\nfillNotes(${JSON.stringify({ ...table, shabbatot: [] })}, document.querySelector("main"), dateFromSearch(location.search) || d, d);`, loader: "ts" },
    bundle: true, write: false, minify: true, treeShaking: true, format: "iife", target: "es2020",
  }).outputFiles[0].text;
  return file = { name: `notes-${createHash("sha256").update(body).digest("hex").slice(0, 10)}.js`, body };
}

export const notesScriptUrl = () => `/notes/${notesScript().name}`;

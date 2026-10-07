// Build time: the script a page that arrives with a calendar box open runs right after its map, so
// the box opens with its verdict written and nothing moves when the page script arrives. Each box's
// verdict and reason are worked out here for every date the calendar covers (src/today.ts judge):
// the script carries the distinct sentences and one character per date choosing among them, plus
// the few lines of src/today.ts that word the date itself ("Mon 12 Oct (1 Cheshvan)").
import { buildSync } from "esbuild";
import calendar from "./calendar.generated.json";
import { addDays, judge, noteTimes, type CalendarTable } from "./today";
import source from "./today.ts?raw";

const table = calendar as unknown as CalendarTable;
const scripts = new Map<string, string>();

/** A box's verdicts: the distinct [verdict, reason] sentences (English and Hebrew), and for each date from the table's first, which one. */
function verdicts(note: string) {
  const sentences: string[][] = [], index = new Map<string, number>();
  let days = "";
  for (let iso = table.from; iso <= table.to; iso = addDays(iso, 1)) {
    const v = judge(table, note, iso, "").verdict, row = [v.verdict.en, v.verdict.he, v.reason.en, v.reason.he], key = row.join("|");
    if (!index.has(key)) { index.set(key, sentences.length); sentences.push(row); }
    days += String.fromCharCode(48 + index.get(key)!);
  }
  return { sentences, days };
}

/** The script for a page whose map (`main`) has calendar boxes open. */
export function notesScript(main: string): string {
  const notes = [...new Set([...main.matchAll(/data-note="([^"]+)"/g)].map(m => m[1]))].sort();
  const key = notes.join(" ");
  const known = scripts.get(key);
  if (known) return known;
  const data = Object.fromEntries(notes.map(note => [note, { time: noteTimes[note], ...verdicts(note) }]));
  // A date past the table: the same words judge() gives.
  const past = judge(table, notes[0], addDays(table.to, 400), "").verdict, beyond = [past.verdict.en, past.verdict.he, past.reason.en, past.reason.he];
  const dates = { from: table.from, to: table.to, months: table.months, numerals: table.numerals };
  const code = buildSync({
    stdin: {
      contents: `${source.replace(/^export /gm, "")}
const N = ${JSON.stringify(data)}, T = ${JSON.stringify(dates)} as unknown as CalendarTable, today = localToday(), iso = dateFromSearch(location.search) || today;
const i = Math.round((fromIso(iso).getTime() - fromIso(T.from).getTime()) / 864e5);
for (const box of document.querySelector("main")!.querySelectorAll<HTMLElement>(".calendar-box[data-note]")) {
  const n = N[box.dataset.note!], when = longWhen(T, n.time as NoteTime, iso, today), row = i >= 0 && i < n.days.length ? n.sentences[n.days.charCodeAt(i) - 48] : ${JSON.stringify(beyond)};
  const line = (lang: "en" | "he", k: number) => { const s = document.createElement("span"), b = document.createElement("b"); s.dataset.lang = lang; if (lang === "he") s.className = "he"; b.textContent = row[k]; s.append(when[lang] + ": ", b, " — " + row[k + 2] + "."); return s; };
  box.querySelector(".box-verdict")!.replaceChildren(line("en", 0), line("he", 1));
  box.dataset.for = iso + "|" + today;
}`, loader: "ts",
    },
    bundle: true, write: false, minify: true, treeShaking: true, format: "iife", target: "es2020",
  }).outputFiles[0].text.trim();
  scripts.set(key, code);
  return code;
}

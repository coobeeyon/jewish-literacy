// The date the maps' notes speak of: today, unless another is dialled in. A chosen date lives in the
// URL (?date=YYYY-MM-DD), so a link reproduces it; it rides along as items open and maps switch, and
// each history entry keeps its own. Changing the date replaces the current entry rather than adding
// one, so Back still steps through what was opened. The date line under the service heading shows
// the date and its Hebrew date, steps a day back or forward, opens the browser's date picker, and
// returns to today.
import table from "../calendar.generated.json";
import { addDays, civilDate, covered, dateFromSearch, fillNotes, fillSummary, hebrewDate, localToday, readingFor, sefariaUrl, showRef, type CalendarTable, type ReadingKind } from "../today";
import { boxHead, calendarIconPaths, noteRules } from "../notes";
import { bi, h } from "./dom";

/** A calendar box opened from a template arrives empty: its icon, header and rule, as the build writes them (CalendarBox in src/view/map.tsx). */
function buildBoxes(root: ParentNode) {
  for (const box of root.querySelectorAll<HTMLElement>(".calendar-box:empty")) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "calendar-mark"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("viewBox", "0 0 16 16");
    for (const d of calendarIconPaths) { const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("fill", "currentColor"); path.setAttribute("d", d); svg.append(path); }
    box.append(h("p", { class: "box-head" }, svg, bi(boxHead)), h("p", { class: "box-rule" }, bi(noteRules[box.dataset.note!])), h("p", { class: "box-verdict" }));
  }
}

const calendar = table as unknown as CalendarTable;

/** The date being prayed: ?date=, or today. */
export const selectedDate = () => dateFromSearch(location.search) ?? localToday();

/** A path in the app, keeping the chosen date. */
export function withDate(path: string): string {
  const date = dateFromSearch(location.search);
  return date ? `${path}?date=${date}` : path;
}

/** The week's Torah reading on each Torah card under `root`, for the date: the portion with a link to it on Sefaria, and on Shabbat morning the haftarah. */
function showReadings(root: ParentNode, date: string) {
  for (const el of root.querySelectorAll<HTMLElement>(".reader-calendar .calendar-reading")) {
    if (el.dataset.for === date) continue;
    el.dataset.for = date;
    const reading = readingFor(calendar, el.closest<HTMLElement>("[data-calendar]")!.dataset.calendar as ReadingKind, date);
    if (!reading) { el.replaceChildren(h("span", { "data-lang": "en" }, "Not in the calendar"), h("span", { "data-lang": "en" }, "\u00a0"), h("span", { class: "he", "data-lang": "he" }, "אינו בלוח")); continue; }
    const link = (name: string, lang: string) => h("a", { href: sefariaUrl(reading.torah), lang }, name);
    const haftarah = reading.haftarah;
    el.replaceChildren(
      h("span", { "data-lang": "en" }, link(reading.name.en, "en")),
      h("span", { "data-lang": "en" }, showRef(reading.torah)),
      haftarah ? h("span", { "data-lang": "en" }, "Haftarah: ", h("a", { href: sefariaUrl(haftarah) }, showRef(haftarah))) : "",
      h("span", { class: "he", "data-lang": "he" }, link(reading.name.he, "he")),
      haftarah ? h("span", { class: "he", "data-lang": "he" }, "הפטרה: ", h("a", { href: sefariaUrl(haftarah), dir: "ltr" }, showRef(haftarah))) : "",
    );
  }
}

/** Word the notes and Torah readings under `root`, and the date line, for the date being prayed. */
export function showDate(root: ParentNode) {
  const date = selectedDate(), today = localToday();
  buildBoxes(root);
  fillNotes(calendar, root, date, today);
  showReadings(root, date);
  // The date line, once initDateLine has built it.
  const line = root.querySelector<HTMLElement>(".date-line");
  if (!line?.firstChild) return;
  const main = line.closest("main")!;
  fillSummary(calendar, line, main.dataset.day!, main.dataset.service!, date, today);
  const hebrew = hebrewDate(calendar, date);
  // The Hebrew year tells the year; the full date is in the picker and the title.
  const civil = civilDate(date);
  line.title = `${civilDate(date, true).en}${hebrew ? ` · ${hebrew.en}` : ""}`;
  const isToday = date === today;
  const [en, he] = line.querySelectorAll<HTMLElement>("[data-date-text] > span");
  en.textContent = `${isToday ? "Today" : civil.en} · ${hebrew?.en ?? "not in the calendar"}`;
  he.textContent = `${isToday ? "היום" : civil.he} · ${hebrew?.he ?? "אינו בלוח"}`;
  const input = line.querySelector<HTMLInputElement>(".date-input")!;
  input.value = date;
  line.querySelector<HTMLElement>("[data-date-today]")!.toggleAttribute("data-off", isToday);
  line.querySelector<HTMLButtonElement>('[data-date-step="-1"]')!.disabled = date <= calendar.from;
  line.querySelector<HTMLButtonElement>('[data-date-step="1"]')!.disabled = date >= calendar.to;
}

/** Make `date` the date being prayed (today, if undefined or today), in place. */
function choose(date: string | undefined, main: HTMLElement) {
  const url = new URL(location.href);
  if (!date || date === localToday()) url.searchParams.delete("date");
  else url.searchParams.set("date", date);
  history.replaceState(history.state, "", url);
  showDate(main);
}

/** The date line's controls, for a map brought into play (the page keeps an empty line of fixed height for them). */
export function initDateLine(main: HTMLElement) {
  const line = main.querySelector<HTMLElement>(".date-line");
  if (!line) return;
  const input = h("input", { type: "date", class: "date-input", "aria-label": "Date of the prayers", min: calendar.from, max: calendar.to }) as HTMLInputElement;
  // The date's row, then the day's line (see daySummary in src/today.ts).
  line.replaceChildren(h("div", { class: "date-row" },
    h("button", { type: "button", class: "date-step", "data-date-step": "-1", "aria-label": "Previous day" }, "‹"),
    h("span", { class: "date-pick" }, h("span", { class: "date-text", "data-date-text": "" }, h("span", { "data-lang": "en" }), h("span", { class: "he", "data-lang": "he" })), input),
    h("button", { type: "button", class: "date-step", "data-date-step": "1", "aria-label": "Next day" }, "›"),
    h("button", { type: "button", class: "date-today", "data-date-today": "", "data-off": "" }, bi({ en: "Today", he: "היום" })),
  ), h("p", { class: "day-summary" }));
  line.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button");
    if (button?.dataset.dateStep) {
      const next = addDays(selectedDate(), Number(button.dataset.dateStep));
      choose(covered(calendar, next) ? next : selectedDate(), main);
    } else if (button?.hasAttribute("data-date-today")) choose(undefined, main);
    else if ((event.target as Element).closest(".date-pick")) {
      // Tapping the date opens the browser's picker where it can (the input itself is see-through).
      try { input.showPicker(); } catch { input.focus(); }
    }
  });
  input.addEventListener("change", () => { if (input.value) choose(input.value, main); });
  showDate(main);
}

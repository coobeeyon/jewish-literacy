// Prayer text from Sefaria, shown in place: fetched the first time it opens, validated against the
// pinned editions, cached, with loading, failure, retry and attribution. Ported from the React
// app's reader.tsx; the pure parts live in src/sefaria.ts.
import { calendarIntro, calendarUrl, licenseOf, parseCalendar, partAnchor, renderSection, textNusach, validateSection, type Reading, type RenderedPart, type Texts } from "../sefaria";
import type { Inline } from "../format";
import type { CalendarKind, Edition, Localized, Nusach, TextPart, TextSection, TextSource } from "../types";
import { bi, h } from "./dom";

/** What a prayer card or landmark carries in its data-reader attribute (see readerData in src/view/map.tsx). */
export type ReaderInfo = Readonly<{
  id: string;
  title: Localized;
  plans: Readonly<{ ashkenaz: string; sefard?: string }>;
  links: Readonly<{ ashkenaz: string; sefard?: string }>;
}>;

type Plan = { source: TextSource; editions: Record<string, Edition> };

/** Fetch JSON with the app's rules: a timeout, and only a JSON answer counts. */
function getJson(url: string, timeout?: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;
  return fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
    .then(response => {
      if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) throw new Error(`Request failed: ${url}`);
      return response.json();
    })
    .finally(() => clearTimeout(timer));
}

/** One request per URL, shared by everything that shows it. A failure is forgotten so "Try again" really refetches. */
function cached<T>(cache: Map<string, Promise<T>>, url: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(url);
  if (hit) return hit;
  const request = load();
  request.catch(() => cache.delete(url));
  cache.set(url, request);
  return request;
}

const plans = new Map<string, Promise<Plan>>();
const segments = new Map<string, Promise<Texts>>();
const readings = new Map<string, Promise<Reading>>();

/** A prayer's reading plan, one small file per prayer and nusach. */
const loadPlan = (url: string) => cached(plans, url, () => getJson(url) as Promise<Plan>);

const loadSection = (section: TextSection, edition: Edition) =>
  cached(segments, section.url, () => getJson(section.url, 15000).then(data => validateSection(data, section, edition)));

function loadPart(part: TextPart, editions: Plan["editions"]): Promise<RenderedPart> {
  return Promise.all(part.sections.map(section => loadSection(section, editions[section.edition]))).then(all => {
    const out: RenderedPart = { heading: part.heading, en: [], he: [] };
    part.sections.forEach((section, i) => renderSection(section, all[i], out));
    if (!out.he.some(p => !p.rubric)) throw new Error("No prayer text");
    return out;
  });
}

// ───────────── Rendering ─────────────

function Credit(plan: Plan, fellBack: boolean): HTMLElement {
  const { source } = plan;
  const editions = [...new Set(source.parts.flatMap(p => p.sections.map(s => s.edition)))].map(id => plan.editions[id]);
  const renamesName = editions.some(edition => edition.id.startsWith("metsudah"));
  return h("p", { class: "reader-credit" },
    h("span", { "data-lang": "en" }, "Text from ", h("a", { href: source.fallbackUrl }, "Sefaria"), ". ", editions.map((edition, i) => h("span", {}, i > 0 && "; ", h("cite", {}, edition.cite.en), " (", h("a", { href: edition.he.source }, edition.sourceLabel.en), "), license reported by Sefaria: ", licenseOf(edition).en)), ".", renamesName && " The English shows the Name as “LORD”.", fellBack && " Nusach Sefard text for this prayer isn’t available on Sefaria, so the Ashkenaz text is shown."),
    h("span", { class: "he", "data-lang": "he" }, "הטקסט מתוך ", h("a", { href: source.fallbackUrl }, "ספריא"), ". ", editions.map((edition, i) => h("span", {}, i > 0 && "; ", h("cite", {}, edition.cite.he), " (", h("a", { href: edition.he.source }, edition.sourceLabel.he), "), הרישיון המדווח בספריא: ", licenseOf(edition).he)), ".", renamesName && " באנגלית השם מוצג כ־LORD.", fellBack && " נוסח ספרד של תפילה זו אינו זמין בספריא, ולכן מוצג נוסח אשכנז."),
  );
}

/** An edition's own formatting, as elements: line breaks, bold, italics, small, big, superscript. */
const formatted = (nodes: Inline[]): Array<Node | string> => nodes.map(node => typeof node === "string" ? node : "br" in node ? h("br") : h(node.tag, {}, formatted(node.children)));

/** One section of a prayer: heading (when the prayer has several), then Hebrew, then English. */
function PartText(info: ReaderInfo, index: number, part: RenderedPart, heading: boolean): HTMLElement {
  return h("div", { class: "reader-section", id: partAnchor(info.id, index), tabindex: "-1" },
    heading && part.heading && h("h3", { class: "reader-heading" }, bi(part.heading)),
    h("div", { class: "reader-text reader-he", "data-lang": "he", lang: "he", dir: "rtl" }, part.he.map(p => h("p", { class: p.rubric ? "rubric" : undefined }, formatted(p.nodes)))),
    part.en.length > 0 && h("div", { class: "reader-text reader-en", "data-lang": "en", lang: "en", dir: "ltr" }, part.en.map(p => h("p", { class: p.rubric ? "rubric" : undefined }, formatted(p.nodes)))),
  );
}

const Status = (status: "loading" | "error", timeout?: boolean) =>
  h("div", { class: "reader-status", role: "status", "aria-live": "polite" }, bi(status === "loading" ? { en: "Loading prayer text…", he: "נוסח התפילה נטען…" } : timeout ? { en: "The request timed out.", he: "תם הזמן שהוקצב לבקשה." } : { en: "Prayer text unavailable.", he: "נוסח התפילה אינו זמין." }));

function Failure(info: ReaderInfo, nusach: Nusach, retry: () => void): HTMLElement {
  const fallbackUrl = info.links[nusach] || info.links.ashkenaz;
  const button = h("button", { type: "button", class: "reader-action" }, bi({ en: "Try again", he: "לנסות שוב" }));
  button.addEventListener("click", retry);
  return h("div", { class: "reader-failure" }, h("p", {}, bi({ en: "The prayer text could not be loaded.", he: "לא ניתן לטעון את נוסח התפילה." })), button, " ", h("a", { href: fallbackUrl }, bi({ en: `Read ${info.title.en} on Sefaria`, he: `לקריאת ${info.title.he} בספריא` })));
}

// Each render claims its element; a later render (or the element leaving the page) makes an
// earlier, still-loading one drop its result.
const claims = new WeakMap<Element, object>();
function claim(el: Element): () => boolean {
  const token = {};
  claims.set(el, token);
  return () => claims.get(el) === token && el.isConnected;
}
export const release = (el: Element) => { claims.delete(el); };

const failed = (error: unknown) => (error as Error | undefined)?.name === "AbortError";
const planFor = (info: ReaderInfo, nusach: Nusach) => info.plans[textNusach(info.plans, nusach)]!;

/**
 * A prayer shown whole (one with a single section, or with no breakdown: Kaddish, Barkhu), in its
 * <section class="reader">. The Torah calendar, if any, stays first (map.ts fills it once).
 */
export function showPrayer(section: HTMLElement, info: ReaderInfo, nusach: Nusach) {
  const calendar = section.querySelector<HTMLElement>(":scope > .reader-calendar");
  const show = (...nodes: Node[]) => { for (const child of [...section.childNodes]) if (child !== calendar) child.remove(); section.append(...nodes); };
  const run = () => {
    const live = claim(section);
    section.setAttribute("aria-busy", "true");
    show(Status("loading"));
    loadPlan(planFor(info, nusach))
      .then(plan => Promise.all(plan.source.parts.map(part => loadPart(part, plan.editions))).then(parts => {
        if (!live()) return;
        section.removeAttribute("aria-busy");
        show(h("div", { class: "reader-texts" }, parts.map((part, i) => PartText(info, i, part, parts.length > 1))), Credit(plan, nusach === "sefard" && !info.plans.sefard));
      }))
      .catch(error => {
        if (!live()) return;
        section.removeAttribute("aria-busy");
        show(Status("error", failed(error)), Failure(info, nusach, run));
      });
  };
  run();
}

/** One section of a prayer of several, shown where its breakdown entry is (in its .section-text), under its entry's heading if it has its own. */
export function showSection(box: HTMLElement, info: ReaderInfo, index: number, nusach: Nusach, heading?: Localized) {
  const run = () => {
    const live = claim(box);
    const reader = h("div", { class: "reader section-reader", "aria-busy": "true" }, Status("loading"));
    box.replaceChildren(reader);
    loadPlan(planFor(info, nusach))
      .then(plan => {
        const part = plan.source.parts[index];
        if (!part) throw new Error("Unknown text section");
        return loadPart(part, plan.editions);
      })
      .then(part => {
        if (!live()) return;
        reader.removeAttribute("aria-busy");
        reader.replaceChildren(PartText(info, index, heading ? { ...part, heading } : part, true));
      })
      .catch(error => {
        if (!live()) return;
        reader.removeAttribute("aria-busy");
        reader.replaceChildren(Status("error", failed(error)), Failure(info, nusach, run));
      });
  };
  run();
}

/** The Sefaria credit for a prayer read section by section, at the end of its open card. */
export function showCredit(details: HTMLElement, info: ReaderInfo, nusach: Nusach) {
  const live = claim(details);
  details.querySelector(":scope > [data-credit]")?.remove();
  loadPlan(planFor(info, nusach)).then(plan => {
    if (!live()) return;
    details.append(h("div", { class: "reader", "data-credit": "" }, Credit(plan, nusach === "sefard" && !info.plans.sefard)));
  }).catch(() => undefined);
}

export function hideCredit(details: HTMLElement) {
  release(details);
  details.querySelector(":scope > [data-credit]")?.remove();
}

// ───────────── This week's Torah reading, from Sefaria's calendar ─────────────

const loadReading = (kind: CalendarKind) => {
  const url = calendarUrl(kind);
  return cached(readings, url, () => getJson(url, 15000).then(data => parseCalendar(data as Parameters<typeof parseCalendar>[0])));
};

export function showCalendar(el: HTMLElement) {
  const kind = el.dataset.calendar as CalendarKind;
  const live = claim(el);
  el.replaceChildren(h("p", { role: "status" }, bi({ en: "Loading this week’s Torah reading…", he: "קריאת התורה של השבוע נטענת…" })));
  loadReading(kind).then(reading => {
    if (!live()) return;
    const intro = calendarIntro[kind];
    const haftarah = kind === "shabbat" && reading.haftarah;
    el.replaceChildren(
      h("p", { "data-lang": "en", lang: "en" }, intro.en, " ", h("a", { href: reading.url }, reading.name.en), " (", reading.ref, ")", haftarah && [". Haftarah: ", h("a", { href: haftarah.url }, haftarah.ref)], "."),
      h("p", { class: "he", "data-lang": "he", lang: "he", dir: "rtl" }, intro.he, " ", h("a", { href: reading.url }, reading.name.he), haftarah && [". הפטרה: ", h("a", { href: haftarah.url, dir: "ltr" }, haftarah.ref)], "."),
    );
  }).catch(() => {
    if (!live()) return;
    el.replaceChildren(h("p", {}, bi({ en: "This week’s reading could not be loaded.", he: "לא ניתן לטעון את קריאת השבוע." }), " ", h("a", { href: "https://www.sefaria.org/calendars" }, bi({ en: "See Sefaria’s calendar", he: "ללוח של ספריא" }))));
  });
}

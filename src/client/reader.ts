// Prayer text shown in place. The build renders each prayer's text (src/texts.ts): a page that opens
// on text has it already; anything opened later comes from the prayer's small text file, fetched on
// the first open or, usually, prefetched for the whole map once the page is idle, and then shown at
// once. A loading line, failure, retry and the Sefaria link remain for a slow or failed fetch.
import { partAnchor, textNusach } from "../sefaria";
import type { TextFile } from "../texts";
import type { Localized, Nusach } from "../types";
import { bi, h } from "./dom";

/** What a prayer card or landmark carries in its data-reader attribute (see readerData in src/view/map.tsx). */
export type ReaderInfo = Readonly<{
  id: string;
  title: Localized;
  texts: Readonly<{ ashkenaz: string; sefard?: string }>;
  links: Readonly<{ ashkenaz: string; sefard?: string }>;
}>;

/** Fetch JSON with the app's rules: a timeout, and only a JSON answer counts. */
function getJson(url: string, timeout?: number, priority?: "low"): Promise<unknown> {
  const controller = new AbortController();
  const timer = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;
  return fetch(url, { signal: controller.signal, headers: { Accept: "application/json" }, priority })
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

const files = new Map<string, Promise<TextFile>>();
/** Text files that have arrived, for showing at once. */
const arrived = new Map<string, TextFile>();

const loadText = (url: string, priority?: "low") => cached(files, url, () => getJson(url, 15000, priority).then(data => {
  const file = data as TextFile;
  if (!Array.isArray(file?.parts) || typeof file.credit !== "string") throw new Error("Unexpected text file");
  arrived.set(url, file);
  return file;
}));

/**
 * The reader's fonts, loaded before any text is placed, so text never appears in a stand-in font
 * and re-flows when they land (pages that open on text preload them; see Page.astro). Gives up
 * after three seconds and shows the text anyway.
 */
let fonts: Promise<unknown> | undefined, fontsIn = false;
const readerFonts = () => fonts ??= Promise.race([
  Promise.all([document.fonts.load('700 1em "Noto Serif Hebrew"', "אa"), document.fonts.load('1em "Source Serif 4"', "a")]),
  new Promise(resolve => setTimeout(resolve, 3000)),
]).catch(() => undefined).then(() => { fontsIn = true; });

/** A prayer's text, now if it has arrived (and the fonts with it), or once it does. */
const textNow = (url: string) => fontsIn ? arrived.get(url) : undefined;
const textSoon = (url: string) => Promise.all([loadText(url), readerFonts()]).then(([file]) => file);

/**
 * Prefetch a map's prayer texts (and the reader's fonts) a moment after the page has loaded, when
 * the browser is idle, a few at a time and at low priority, so that nothing competes with the
 * first paint and a later open shows its text at once. A new call replaces whatever an earlier one
 * still had waiting (a switch to another map, or the other nusach).
 */
let waiting: string[] = [];
const settleDelay = 1000;
export function prefetchTexts(urls: string[]) {
  waiting = [...new Set(urls)].filter(url => !files.has(url));
  const next = (): unknown => { const url = waiting.shift(); return url && loadText(url, "low").catch(() => undefined).then(next); };
  const start = () => { readerFonts(); for (let i = 0; i < 3; i++) next(); };
  const idle = () => setTimeout(() => "requestIdleCallback" in window ? requestIdleCallback(start, { timeout: 1000 }) : start(), settleDelay);
  if (document.readyState === "complete") idle(); else addEventListener("load", idle, { once: true });
}

/** Every prayer text a map's markup refers to (looking inside its templates too), in one nusach. */
export function textsIn(root: ParentNode, nusach: Nusach, out: string[] = []): string[] {
  for (const el of root.querySelectorAll<HTMLElement>("[data-reader]")) out.push(urlFor(JSON.parse(el.dataset.reader!), nusach));
  for (const template of root.querySelectorAll("template")) textsIn(template.content, nusach, out);
  return out;
}

// ───────────── Rendering ─────────────

/** Markup the build rendered (src/view/reader.tsx), as nodes. */
function built(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

const credit = (file: TextFile, fellBack: boolean) => built(fellBack ? file.fellBack : file.credit);

/** One section of a prayer: heading (when the prayer has several, or the entry gives its own), then Hebrew, then English. */
function PartText(info: ReaderInfo, index: number, part: TextFile["parts"][number], showHeading: boolean, heading?: Localized): HTMLElement {
  const title = heading || part.heading;
  return h("div", { class: "reader-section", id: partAnchor(info.id, index), tabindex: "-1" },
    showHeading && title && h("h3", { class: "reader-heading" }, bi(title)),
    built(part.html),
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
const urlFor = (info: ReaderInfo, nusach: Nusach) => info.texts[textNusach(info.texts, nusach)]!;
const fellBackFor = (info: ReaderInfo, nusach: Nusach) => nusach === "sefard" && !info.texts.sefard;

/**
 * Show a prayer's text in `el`: at once if it is here; otherwise a loading line (marked busy), then
 * the text, or the failure with "Try again".
 */
function present(el: HTMLElement, info: ReaderInfo, nusach: Nusach, render: (file: TextFile) => void, show: (...nodes: Node[]) => void) {
  const url = urlFor(info, nusach);
  const run = () => {
    const live = claim(el);
    const file = textNow(url);
    if (file) { render(file); return; }
    el.setAttribute("aria-busy", "true");
    show(Status("loading"));
    textSoon(url)
      .then(file => { if (!live()) return; el.removeAttribute("aria-busy"); render(file); })
      .catch(error => {
        if (!live()) return;
        el.removeAttribute("aria-busy");
        show(Status("error", failed(error)), Failure(info, nusach, run));
      });
  };
  run();
}

/**
 * A prayer shown whole (one with a single section, or with no breakdown: Kaddish, Barkhu), in its
 * <section class="reader">. The Torah calendar, if any, stays first (map.ts fills it once).
 */
export function showPrayer(section: HTMLElement, info: ReaderInfo, nusach: Nusach) {
  const calendar = section.querySelector<HTMLElement>(":scope > .reader-calendar");
  const show = (...nodes: Node[]) => { for (const child of [...section.childNodes]) if (child !== calendar) child.remove(); section.append(...nodes); };
  present(section, info, nusach, file => show(h("div", { class: "reader-texts" }, file.parts.map((part, i) => PartText(info, i, part, file.parts.length > 1))), credit(file, fellBackFor(info, nusach))), show);
}

/** One section of a prayer of several, shown where its breakdown entry is (in its .section-text), under its entry's heading if it has its own. */
export function showSection(box: HTMLElement, info: ReaderInfo, index: number, nusach: Nusach, heading?: Localized) {
  const reader = h("div", { class: "reader section-reader" });
  box.replaceChildren(reader);
  present(reader, info, nusach, file => {
    const part = file.parts[index];
    reader.replaceChildren(part ? PartText(info, index, part, true, heading) : Status("error"));
  }, (...nodes) => reader.replaceChildren(...nodes));
}

/** The Sefaria credit for a prayer read section by section, at the end of its open card. */
export function showCredit(details: HTMLElement, info: ReaderInfo, nusach: Nusach) {
  const live = claim(details);
  details.querySelector(":scope > [data-credit]")?.remove();
  const url = urlFor(info, nusach);
  const add = (file: TextFile) => details.append(h("div", { class: "reader", "data-credit": "" }, credit(file, fellBackFor(info, nusach))));
  const file = arrived.get(url);
  if (file) add(file);
  else loadText(url).then(file => { if (live()) add(file); }).catch(() => undefined);
}

export function hideCredit(details: HTMLElement) {
  release(details);
  details.querySelector(":scope > [data-credit]")?.remove();
}

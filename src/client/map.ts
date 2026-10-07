// A service map in the browser. The page arrives with its route's state already in the HTML; this
// opens and closes movements, prayers and sections in place, keeps the URL in step with
// history.pushState, and lets Back and Forward restore each state, as the React app's router did.
//
// The DOM contract with src/view/map.tsx:
// - an openable item's button has data-route (its route segment), data-parent (its movement, if a
//   member) and aria-controls (its region: a container that is empty while closed);
// - each region's content is in <template id="t:<region id>"> (or "t:<id>:<nusach>" where the
//   nusach changes it), inside the map's own <template data-map="<day>/<service>">, which also holds
//   the closed map that day and service switches show (see src/client/switch.ts); a member
//   prayer's summary is in "t:summary-<prayer id>";
// - a section toggle has data-section (its slug) and its text box (.section-text, data-part) beside it;
//   a group toggle has data-group and data-sections (the slugs of the sections it holds);
// - a multi-prayer movement lists its members in data-members; a prayer with text has data-reader.
import { nusach } from "./preferences";
import { HEICHA } from "../paths";
import { hideCredit, release, showCalendar, showCredit, showPrayer, showSection, type ReaderInfo } from "./reader";

/** A history entry's state; `y` is where the page was scrolled when a switch left it for another map. */
export type NavState = { sections?: string[]; closed?: string; closedSection?: string; switched?: boolean; y?: number };
export type Navigation = "initial" | "push" | "replace" | "pop";
/** A map on the page: `pop` follows Back or Forward within it; `dispose` lets it go when another map replaces it. */
export type MapView = { pop: () => void; dispose: () => void };

/** Bring a map into play: on load ("initial"), or swapped in by a switch ("push") or Back/Forward ("pop"). */
export function initMap(main: HTMLElement, arrival: Navigation = "initial"): MapView {
  const key = `${main.dataset.day}/${main.dataset.service}`;
  const base = `/${key}`;
  const store = document.querySelector<HTMLTemplateElement>(`template[data-map="${key}"]`)!.content;
  const listening = new AbortController();
  /** Ends the initial deep link's hold on its target (see holdInView). */
  let stopHolding: (() => void) | undefined;
  /** Groups opened or closed by hand, per open prayer (by its item's id); forgotten when the prayer closes. */
  const groups = new Map<string, Record<string, boolean>>();
  /** The nusach each reader element was last filled for. */
  const filled = new WeakMap<Element, string>();

  const byId = (id: string) => document.getElementById(id);
  const routeFor = (...segments: Array<string | undefined>) => [base, ...segments].filter(Boolean).join("/");
  const infoFor = (el: Element): ReaderInfo => JSON.parse(el.closest<HTMLElement>("[data-reader]")!.dataset.reader!);
  const parentOf = (id: string) => main.querySelector<HTMLElement>(`.service-map > [data-members~="${CSS.escape(id)}"]`)?.id.slice("movement-".length);

  /**
   * The state the URL and history entry name: the open movement and prayer, its open sections, and
   * whether a Shmoneh Esrei shows as Heicha Kedushah (/<movement>/heicha-kedushah[/<section>]).
   */
  function route() {
    const [section, part, sub] = location.pathname.slice(base.length).split("/").filter(Boolean);
    const state = history.state as NavState | null;
    const heicha = part === HEICHA && Boolean(byId(`movement-${section}`)?.hasAttribute("data-heicha"));
    const latest = heicha ? sub : part;
    // Open sections ride in history state, so Back and Forward restore them; the URL names the latest.
    const sections = [...(state?.sections || []).filter(s => s !== latest), ...(latest ? [latest] : [])];
    const open = new Set<string>();
    if (section) {
      const parent = byId(`movement-${section}`) ? undefined : parentOf(section);
      if (parent) open.add(parent);
      open.add(section);
    }
    return { section, part: heicha ? undefined : part, sub: heicha ? sub : undefined, heicha, sections, open, state };
  }

  /** Which form an open region should hold: Heicha Kedushah, for the movement the route shows that way. */
  const modeFor = (button: HTMLElement) => {
    const { heicha, section } = route();
    return heicha && button.dataset.route === section ? "heicha" : undefined;
  };
  const templateKey = (region: HTMLElement) => region.dataset.mode ? `${region.id}~${region.dataset.mode}` : region.id;

  const stored = (id: string) => store.getElementById(id) as HTMLTemplateElement | null;
  function template(key: string): DocumentFragment | undefined {
    const found = stored(`t:${key}:${nusach()}`) || stored(`t:${key}`);
    return found?.content.cloneNode(true) as DocumentFragment | undefined;
  }

  /**
   * Open or close an item: fill or empty its region (in the form the route asks for), swap a member
   * prayer's summary out or back, and a Shmoneh Esrei's line for its pattern.
   */
  function setOpen(button: HTMLElement, open: boolean, keepGroups = false) {
    const item = button.parentElement!;
    const region = byId(button.getAttribute("aria-controls")!)!;
    // Prayers leaving the page forget the groups opened in them by hand.
    if (!keepGroups) for (const gone of [item, ...region.querySelectorAll("[data-reader]")]) groups.delete(gone.id);
    const mode = open ? modeFor(button) : undefined;
    button.setAttribute("aria-expanded", String(open));
    region.hidden = !open;
    if (mode) region.dataset.mode = mode; else delete region.dataset.mode;
    region.replaceChildren(...(open ? [template(templateKey(region))!] : []));
    if (item.matches(".landmark-reader, .movement:not(.card)")) item.toggleAttribute("data-open", open);
    hideCredit(region);
    filled.delete(region);
    const blurb = template(`blurb-${button.dataset.route}${mode ? `~${mode}` : ""}`);
    if (blurb) button.querySelector(".blurb")!.replaceWith(blurb);
    const summary = template(`summary-${button.dataset.route}`);
    if (summary) {
      const copy = button.querySelector(".copy")!;
      while (copy.lastChild && copy.lastChild !== copy.firstChild) copy.lastChild.remove();
      if (!open) copy.append(summary);
    }
  }

  /** Make the page match the route: open what it names, close the rest, then the open prayer's sections. */
  function sync() {
    const { open, sections, section, heicha } = route();
    for (let changed = true; changed;) {
      changed = false;
      for (const button of main.querySelectorAll<HTMLElement>("button[data-route]")) {
        if (!button.isConnected) continue;
        const want = open.has(button.dataset.route!);
        const isOpen = button.getAttribute("aria-expanded") === "true";
        const region = byId(button.getAttribute("aria-controls")!)!;
        if (isOpen !== want) setOpen(button, want);
        // Open, but in the other pattern: refill it in the one the route names.
        else if (want && region.dataset.mode !== modeFor(button)) { setOpen(button, false); setOpen(button, true); }
        else continue;
        changed = true;
      }
    }
    // The prayers whose sections the route names: the open prayer, or Heicha Kedushah's two parts.
    const prayers = heicha ? [...main.querySelectorAll<HTMLElement>(`#movement-${CSS.escape(section!)} [data-heicha-part]`)] : [section && byId(`section-${section}`)];
    for (const item of prayers) if (item && item.querySelector(":scope > .details .toc-toggle")) syncSections(item, sections);
    fillReaders();
  }

  /** In an open prayer: each entry's section, each group, and the credit once any of its sections is open. */
  function syncSections(item: HTMLElement, sections: string[]) {
    const toggles = [...item.querySelectorAll<HTMLElement>(".toc-toggle[data-section]")];
    const slugs = new Set(toggles.map(t => t.dataset.section!));
    const open = sections.filter(slug => slugs.has(slug));
    for (const toggle of toggles) {
      const want = open.includes(toggle.dataset.section!);
      toggle.setAttribute("aria-expanded", String(want));
      const box = toggle.parentElement!.querySelector<HTMLElement>(":scope > .section-text")!;
      if (box.hidden === !want) continue;
      box.hidden = !want;
      if (!want) { release(box); filled.delete(box); box.replaceChildren(); }
    }
    const chosen = groups.get(item.id) || {};
    for (const group of item.querySelectorAll<HTMLElement>(".toc-group")) {
      const want = chosen[group.dataset.group!] ?? group.dataset.sections!.split(" ").some(slug => open.includes(slug));
      group.setAttribute("aria-expanded", String(want));
      byId(group.getAttribute("aria-controls")!)!.hidden = !want;
    }
    const details = item.querySelector<HTMLElement>(":scope > .details")!;
    if (!open.length) { hideCredit(details); filled.delete(details); }
    else if (filled.get(details) !== nusach()) { filled.set(details, nusach()); showCredit(details, infoFor(item), nusach()); }
  }

  /** Start (or, after a nusach change, redo) every prayer text and open section on the page. */
  function fillReaders() {
    const now = nusach();
    const fill = (el: HTMLElement, show: () => void) => { if (filled.get(el) !== now) { filled.set(el, now); show(); } };
    for (const section of main.querySelectorAll<HTMLElement>("section[data-prayer]")) fill(section, () => showPrayer(section, infoFor(section), now));
    for (const box of main.querySelectorAll<HTMLElement>(".section-text:not([hidden])")) fill(box, () => showSection(box, infoFor(box), Number(box.dataset.part), now, box.dataset.heading ? JSON.parse(box.dataset.heading) : undefined));
    // This week's Torah reading does not depend on the nusach: fetched once per element.
    for (const calendar of main.querySelectorAll<HTMLElement>(".reader-calendar")) if (!filled.has(calendar)) { filled.set(calendar, ""); showCalendar(calendar); }
  }

  /** Bring the right thing into view and focus, as the React app did after each navigation. */
  function settle(navigation: Navigation) {
    const { section, part, sub, heicha, state } = route();
    // The React router counted the first entry of a visit (no history state) as the initial load.
    const initial = navigation === "initial" || state === null;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scrollTo: HTMLElement | null = null, focus: HTMLElement | null = null, block: ScrollLogicalPosition = "start";
    const entryToggle = (nodeId: string, slug: string) => document.querySelector<HTMLElement>(`#section-${CSS.escape(nodeId)} .toc-toggle[data-section="${CSS.escape(slug)}"]`);
    if (state?.closedSection) {
      // Closing a section leaves focus on its entry.
      const [nodeId, slug] = state.closedSection.split("/");
      scrollTo = focus = entryToggle(nodeId, slug);
      block = "nearest";
    } else if (section && part) {
      // A section: a deep link brings it into view; a tap keeps the entry where it is.
      scrollTo = focus = entryToggle(section, part);
      if (!initial) block = "nearest";
    } else if (heicha && sub) {
      scrollTo = focus = document.querySelector<HTMLElement>(`#movement-${CSS.escape(section!)} .toc-toggle[data-section="${CSS.escape(sub)}"]`);
      if (!initial) block = "nearest";
    } else if (state?.switched && section) {
      // Switching pattern keeps the reader at the switch, with focus on the choice made.
      scrollTo = focus = document.querySelector<HTMLElement>(`#movement-${CSS.escape(section)} .pattern-switch [aria-pressed=true]`);
      block = "nearest";
    } else if (state?.closed) {
      // Closing keeps the reader where they were, with focus on the control they used.
      scrollTo = byId(state.closed);
      focus = scrollTo?.querySelector<HTMLElement>(":scope > button") || null;
      block = "nearest";
    } else if (!section) {
      scrollTo = focus = byId("service-heading");
      block = "nearest";
    } else {
      const item = byId(`movement-${section}`) || byId(`section-${section}`);
      focus = item?.querySelector<HTMLElement>(":scope > button .item-title, :scope > button .landmark-title") || null;
      // A deep link to a prayer inside a movement lands on the movement, so its context shows.
      const parent = parentOf(section);
      scrollTo = initial && parent ? byId(`movement-${parent}`) : item;
    }
    // At once, not on a later frame: the page is already in its new state, and a deferred focus
    // could land after the reader's next tap or key and take focus from it.
    if (navigation !== "pop" || initial) scrollTo?.scrollIntoView({ block, behavior: initial || reduce ? "instant" : "smooth" });
    focus?.focus({ preventScroll: true });
    if (navigation === "initial" && scrollTo) holdInView(scrollTo, block);
    else if (navigation === "initial") delete main.dataset.arriving;
  }

  /**
   * A deep link's target near the end of the page cannot scroll fully into place until the text
   * below it arrives. Keep it in place as the page grows, until the reader scrolls, taps, types or
   * navigates (or ten seconds pass).
   */
  function holdInView(target: HTMLElement, block: ScrollLogicalPosition) {
    let expected: number | undefined, height = document.documentElement.scrollHeight;
    const hold = () => {
      // The scroll just made (perhaps a smooth one, still running) stands until the page changes size.
      if (document.documentElement.scrollHeight === height) return;
      height = document.documentElement.scrollHeight;
      if (!target.isConnected) return stop();
      target.scrollIntoView({ block, behavior: "instant" });
      expected = scrollY;
    };
    const observer = new ResizeObserver(hold);
    const onScroll = () => { if (expected !== undefined && Math.abs(scrollY - expected) > 1) stop(); };
    const interactions = ["wheel", "touchstart", "pointerdown", "keydown", "popstate"];
    const timer = setTimeout(() => stop(), 10000);
    function stop() {
      observer.disconnect();
      clearTimeout(timer);
      removeEventListener("scroll", onScroll);
      for (const type of interactions) removeEventListener(type, stop, true);
      stopHolding = undefined;
      // The page has settled or the reader has taken over: later openings get no reserved room.
      delete main.dataset.arriving;
    }
    stopHolding = stop;
    observer.observe(main);
    addEventListener("scroll", onScroll, { passive: true });
    for (const type of interactions) addEventListener(type, stop, { capture: true, passive: true });
  }

  function navigate(url: string, state: NavState, replace = false) {
    stopHolding?.();
    history[replace ? "replaceState" : "pushState"](state, "", url);
    sync();
    settle(replace ? "replace" : "push");
  }

  /** Opening is a step in history; closing goes back up a level in place (a member to its movement). */
  function toggleItem(button: HTMLElement) {
    if (button.getAttribute("aria-expanded") !== "true") navigate(routeFor(button.dataset.route), {});
    else navigate(routeFor(button.dataset.parent), { closed: button.parentElement!.id }, true);
  }

  /** Opening a section is a step in history; closing one goes back to the last section still open. */
  function toggleSection(toggle: HTMLElement) {
    const { section, sections, heicha } = route();
    const slug = toggle.dataset.section!;
    const prayer = toggle.closest<HTMLElement>("[data-reader]")!;
    // Heicha Kedushah's sections open under the movement's route, whichever part they are in.
    const at = heicha ? routeFor(section, HEICHA) : routeFor(section);
    const rest = sections.filter(s => s !== slug);
    if (toggle.getAttribute("aria-expanded") !== "true") navigate(`${at}/${slug}`, { sections: [...rest, slug] });
    else navigate(rest.length ? `${at}/${rest[rest.length - 1]}` : at, { sections: rest, closedSection: `${prayer.id.slice("section-".length)}/${slug}` }, true);
  }

  function toggleGroup(group: HTMLElement) {
    const prayer = group.closest<HTMLElement>("[data-reader]")!;
    const chosen = groups.get(prayer.id) || {};
    chosen[group.dataset.group!] = group.getAttribute("aria-expanded") !== "true";
    groups.set(prayer.id, chosen);
    syncSections(prayer, route().sections);
  }

  /** The usual pattern or Heicha Kedushah: a step in history, like opening. */
  function choosePattern(choice: HTMLElement) {
    const movement = choice.closest<HTMLElement>(".movement")!.id.slice("movement-".length);
    const heicha = choice.dataset.patternChoice === "heicha";
    if (heicha !== route().heicha) navigate(heicha ? routeFor(movement, HEICHA) : routeFor(movement), { switched: true });
  }

  main.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLElement>("button");
    if (!button || !main.contains(button)) return;
    if (button.dataset.route) toggleItem(button);
    else if (button.dataset.section) toggleSection(button);
    else if (button.dataset.group) toggleGroup(button);
    else if (button.dataset.patternChoice) choosePattern(button);
  });
  // A nusach change refills every open region whose content differs by nusach, then the texts.
  document.addEventListener("nusachchange", () => {
    for (const button of main.querySelectorAll<HTMLElement>('button[data-route][aria-expanded="true"]')) {
      const region = byId(button.getAttribute("aria-controls")!)!;
      if (button.isConnected && stored(`t:${templateKey(region)}:sefard`)) setOpen(button, false, true);
    }
    for (const button of main.querySelectorAll<HTMLElement>('button[data-route][aria-expanded="false"]')) {
      if (stored(`t:summary-${button.dataset.route}:sefard`)) setOpen(button, false, true);
    }
    sync();
  }, { signal: listening.signal });

  // The HTML holds both nusachs' versions of whatever is open and differs by nusach; keep the saved one.
  for (const version of main.querySelectorAll<HTMLElement>("[data-nusach-only]")) {
    if (version.dataset.nusachOnly === nusach()) version.replaceWith(...version.childNodes);
    else version.remove();
  }
  try { sessionStorage.setItem(`service:${main.dataset.day}`, main.dataset.service!); } catch { /* optional */ }
  sync();
  settle(arrival);
  return {
    pop: () => { sync(); settle("pop"); },
    dispose: () => { stopHolding?.(); listening.abort(); },
  };
}

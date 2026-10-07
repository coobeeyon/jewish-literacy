// A service map in the browser. The page arrives with its route's state already in the HTML; this
// opens and closes movements, prayers and sections in place, keeps the URL in step with
// history.pushState, and lets Back and Forward restore each state, as the React app's router did.
//
// The DOM contract with src/view/map.tsx:
// - an openable item's button has data-route (its route segment), data-parent (its movement, if a
//   member) and aria-controls (its region: a container that is empty while closed);
// - each region's content is in <template id="t:<region id>"> (or "t:<id>:<nusach>" where the
//   nusach changes it); a member prayer's summary is in "t:summary-<prayer id>";
// - a section toggle has data-section (its slug) and its text box (.section-text, data-part) beside it;
//   a group toggle has data-group and data-sections (the slugs of the sections it holds);
// - a multi-prayer movement lists its members in data-members; a prayer with text has data-reader.
import { nusach } from "./preferences";
import { hideCredit, release, showCalendar, showCredit, showPrayer, showSection, type ReaderInfo } from "./reader";

type NavState = { sections?: string[]; closed?: string; closedSection?: string };
type Navigation = "initial" | "push" | "replace" | "pop";

export function initMap(main: HTMLElement) {
  const base = `/${main.dataset.day}/${main.dataset.service}`;
  /** Groups opened or closed by hand, per open prayer; forgotten when the prayer closes. */
  const groups = new Map<string, Record<string, boolean>>();
  /** The nusach each reader element was last filled for. */
  const filled = new WeakMap<Element, string>();

  const byId = (id: string) => document.getElementById(id);
  const routeFor = (section?: string) => section ? `${base}/${section}` : base;
  const infoFor = (el: Element): ReaderInfo => JSON.parse(el.closest<HTMLElement>("[data-reader]")!.dataset.reader!);
  const parentOf = (id: string) => main.querySelector<HTMLElement>(`.service-map > [data-members~="${CSS.escape(id)}"]`)?.id.slice("movement-".length);

  /** The state the URL and history entry name: the open movement and prayer, and its open sections. */
  function route() {
    const [section, part] = location.pathname.slice(base.length).split("/").filter(Boolean);
    const state = history.state as NavState | null;
    // Open sections ride in history state, so Back and Forward restore them; the URL names the latest.
    const sections = [...(state?.sections || []).filter(s => s !== part), ...(part ? [part] : [])];
    const open = new Set<string>();
    if (section) {
      const parent = byId(`movement-${section}`) ? undefined : parentOf(section);
      if (parent) open.add(parent);
      open.add(section);
    }
    return { section, part, sections, open, state };
  }

  function template(key: string): DocumentFragment | undefined {
    const found = (byId(`t:${key}:${nusach()}`) || byId(`t:${key}`)) as HTMLTemplateElement | null;
    return found?.content.cloneNode(true) as DocumentFragment | undefined;
  }

  /** Open or close an item: fill or empty its region, and swap a member prayer's summary out or back. */
  function setOpen(button: HTMLElement, open: boolean, keepGroups = false) {
    const item = button.parentElement!;
    const region = byId(button.getAttribute("aria-controls")!)!;
    button.setAttribute("aria-expanded", String(open));
    region.hidden = !open;
    region.replaceChildren(...(open ? [template(region.id)!] : []));
    if (item.matches(".landmark-reader, .movement:not(.card)")) item.toggleAttribute("data-open", open);
    hideCredit(region);
    filled.delete(region);
    if (!open && !keepGroups) groups.delete(button.dataset.route!);
    const summary = template(`summary-${button.dataset.route}`);
    if (summary) {
      const copy = button.querySelector(".copy")!;
      while (copy.lastChild && copy.lastChild !== copy.firstChild) copy.lastChild.remove();
      if (!open) copy.append(summary);
    }
  }

  /** Make the page match the route: open what it names, close the rest, then the open prayer's sections. */
  function sync() {
    const { open, sections, section } = route();
    for (let changed = true; changed;) {
      changed = false;
      for (const button of main.querySelectorAll<HTMLElement>("button[data-route]")) {
        if (!button.isConnected) continue;
        const want = open.has(button.dataset.route!);
        if ((button.getAttribute("aria-expanded") === "true") !== want) { setOpen(button, want); changed = true; }
      }
    }
    const item = section ? byId(`section-${section}`) : null;
    if (item?.querySelector(":scope > .details .toc-toggle")) syncSections(item, section!, sections);
    fillReaders();
  }

  /** In the open prayer: each entry's section, each group, and the credit once any section is open. */
  function syncSections(item: HTMLElement, id: string, sections: string[]) {
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
    const chosen = groups.get(id) || {};
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
    for (const box of main.querySelectorAll<HTMLElement>(".section-text:not([hidden])")) fill(box, () => showSection(box, infoFor(box), Number(box.dataset.part), now));
    // This week's Torah reading does not depend on the nusach: fetched once per element.
    for (const calendar of main.querySelectorAll<HTMLElement>(".reader-calendar")) if (!filled.has(calendar)) { filled.set(calendar, ""); showCalendar(calendar); }
  }

  /** Bring the right thing into view and focus, as the React app did after each navigation. */
  function settle(navigation: Navigation) {
    const { section, part, state } = route();
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
    if (navigation !== "pop" || initial) scrollTo?.scrollIntoView({ block, behavior: initial || reduce ? "auto" : "smooth" });
    focus?.focus({ preventScroll: true });
  }

  function navigate(url: string, state: NavState, replace = false) {
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
    const { section, sections } = route();
    const slug = toggle.dataset.section!;
    const prayer = routeFor(section);
    const rest = sections.filter(s => s !== slug);
    if (toggle.getAttribute("aria-expanded") !== "true") navigate(`${prayer}/${slug}`, { sections: [...rest, slug] });
    else navigate(rest.length ? `${prayer}/${rest[rest.length - 1]}` : prayer, { sections: rest, closedSection: `${section}/${slug}` }, true);
  }

  function toggleGroup(group: HTMLElement) {
    const { section, sections } = route();
    const chosen = groups.get(section!) || {};
    chosen[group.dataset.group!] = group.getAttribute("aria-expanded") !== "true";
    groups.set(section!, chosen);
    syncSections(byId(`section-${section}`)!, section!, sections);
  }

  main.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLElement>("button");
    if (!button || !main.contains(button)) return;
    if (button.dataset.route) toggleItem(button);
    else if (button.dataset.section) toggleSection(button);
    else if (button.dataset.group) toggleGroup(button);
  });
  addEventListener("popstate", () => { sync(); settle("pop"); });

  // A nusach change refills every open region whose content differs by nusach, then the texts.
  document.addEventListener("nusachchange", () => {
    for (const button of main.querySelectorAll<HTMLElement>('button[data-route][aria-expanded="true"]')) {
      const region = button.getAttribute("aria-controls")!;
      if (button.isConnected && byId(`t:${region}:sefard`)) setOpen(button, false, true);
    }
    for (const button of main.querySelectorAll<HTMLElement>('button[data-route][aria-expanded="false"]')) {
      if (byId(`t:summary-${button.dataset.route}:sefard`)) setOpen(button, false, true);
    }
    sync();
  });

  // The HTML holds both nusachs' versions of whatever is open and differs by nusach; keep the saved one.
  for (const version of main.querySelectorAll<HTMLElement>("[data-nusach-only]")) {
    if (version.dataset.nusachOnly === nusach()) version.replaceWith(...version.childNodes);
    else version.remove();
  }
  try { sessionStorage.setItem(`service:${main.dataset.day}`, main.dataset.service!); } catch { /* optional */ }
  sync();
  settle("initial");
}

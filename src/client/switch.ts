// Day and service switches, in place. Every map page ends with every map, closed, in a
// <template data-map="<day>/<service>"> (see allMaps in src/view/map.tsx), so a switch needs no
// request: copy the chosen map's <main> in for the live one, step history, retitle the page, and
// move focus to the new service heading, as a page load would. Back and Forward across switches
// swap back the same way. The day and service choices are links, so without a script (or with a
// modifier key) they are plain navigations.
import { services } from "../paths";
import type { DayType, ServiceId } from "../types";
import { initControls } from "./controls";
import { initDateLine, withDate } from "./date";
import { initMap, type MapView, type NavState, type Navigation } from "./map";
import { reflect } from "./preferences";
import { animateSwitch } from "./transition";

const days: DayType[] = ["weekday", "shabbat"];
const keyOf = (path: string) => path.split("/").slice(1, 3).join("/");
/** A map's place in the order of days, then services: switches animate toward it. */
const rank = (key: string) => {
  const [day, service] = key.split("/") as [DayType, ServiceId];
  return days.indexOf(day) * 10 + services[day].indexOf(service);
};
const stored = (key: string) => document.querySelector<HTMLTemplateElement>(`template[data-map="${CSS.escape(key)}"]`);

let main: HTMLElement;
let view: MapView;

function mount(next: HTMLElement, arrival: Navigation) {
  main = next;
  view = initMap(main, arrival);
  initControls(main);
  initDateLine(main);
  reflect();
}

/** Show the map `key` names in place of the live one. A push steps history to `url` first. */
function show(key: string, arrival: "push" | "pop", url?: string, skipAnimation = false) {
  const store = stored(key);
  if (!store) return location.assign(url || location.href);
  const from = `${main.dataset.day}/${main.dataset.service}`;
  const settingsOpen = main.querySelector(".settings-toggle")?.getAttribute("aria-expanded") === "true";
  if (arrival === "push") history.replaceState({ ...(history.state as NavState | null), y: scrollY }, "");
  animateSwitch(rank(key) < rank(from) ? "back" : "forward", () => {
    const next = store.content.querySelector("main")!.cloneNode(true) as HTMLElement;
    // The display settings stay as they were.
    next.querySelector(".settings-toggle")!.setAttribute("aria-expanded", String(settingsOpen));
    next.querySelector<HTMLElement>("#display-settings")!.hidden = !settingsOpen;
    // Step history before the page changes, so the entry left keeps the scroll it had.
    if (arrival === "push") history.pushState({}, "", url);
    view.dispose();
    main.replaceWith(next);
    document.title = store.dataset.title!;
    mount(next, arrival);
    const y = (history.state as NavState | null)?.y;
    if (arrival === "pop" && y !== undefined) scrollTo({ top: y, behavior: "instant" });
  }, skipAnimation || key === from);
}

export function initSwitching(first: HTMLElement) {
  mount(first, "initial");
  document.addEventListener("click", event => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[data-day-choice], a[data-service-choice]");
    if (!link || !main.contains(link) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const url = new URL(link.href).pathname;
    if (url !== location.pathname) show(keyOf(url), "push", withDate(url));
  });
  addEventListener("popstate", event => {
    const key = keyOf(location.pathname);
    if (key === `${main.dataset.day}/${main.dataset.service}`) view.pop();
    else show(key, "pop", undefined, (event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition);
  });
}

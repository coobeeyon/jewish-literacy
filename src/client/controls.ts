// The map's controls: day and service are links to other maps, which src/client/switch.ts shows in
// place; language and nusach sit behind one small settings toggle. Each day remembers its last
// service for the visit.
import { services } from "../paths";
import type { DayType, ServiceId } from "../types";

const remembered = (day: DayType): ServiceId => {
  let service: string | null = null;
  try { service = sessionStorage.getItem(`service:${day}`); } catch { /* optional */ }
  return services[day].includes(service as ServiceId) ? service as ServiceId : "shacharit";
};

export function initControls(main: HTMLElement) {
  const day = main.dataset.day as DayType;
  const toggle = main.querySelector<HTMLElement>(".settings-toggle")!;
  const settings = main.querySelector<HTMLElement>("#display-settings")!;
  const setOpen = (open: boolean) => { toggle.setAttribute("aria-expanded", String(open)); settings.hidden = !open; };
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  main.querySelector(".controls")!.addEventListener("keydown", event => {
    if ((event as KeyboardEvent).key === "Escape") { setOpen(false); toggle.focus(); }
  });
  // Each day's link goes to the service last seen there.
  for (const link of main.querySelectorAll<HTMLAnchorElement>("[data-day-choice]")) {
    const next = link.dataset.dayChoice as DayType;
    link.href = `/${next}/${remembered(next)}`;
  }
  // About's back link returns to this map.
  main.querySelector(".about-link")!.addEventListener("click", () => {
    try { sessionStorage.setItem("about-from", `/${day}/${main.dataset.service}`); } catch { /* optional */ }
  });
}

/** About: the back link goes to the map that linked here (kept with this history entry), and the heading takes focus. */
export function initAbout() {
  const state = history.state as { from?: string } | null;
  let from = state?.from;
  try { from ??= sessionStorage.getItem("about-from") || undefined; sessionStorage.removeItem("about-from"); } catch { /* optional */ }
  if (from && /^\/(weekday|shabbat)\/[a-z]+$/.test(from)) {
    history.replaceState({ ...state, from }, "");
    document.querySelector<HTMLAnchorElement>("[data-back-to-map]")!.href = from;
  }
  document.getElementById("about-heading")?.focus();
}

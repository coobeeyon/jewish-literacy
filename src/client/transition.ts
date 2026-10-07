// The one hook for how a day or service switch looks. `swap` changes the page; this decides whether
// and how to animate it. The motion itself (time, distance, easing) is CSS: "Switch animation" at
// the end of src/styles.css, keyed on <html data-switch>.
export type Direction = "forward" | "back";

/** Fallback animation length; keep in step with --switch-time in src/styles.css. */
const FALLBACK_MS = 260;
let clearFallback: ReturnType<typeof setTimeout> | undefined;

/**
 * Run `swap` as an animated switch toward `direction` (the order of days, then services). With the
 * View Transitions API the old map slides out as the new one slides in; without it the new one
 * slides in. No animation under reduced motion, or when the browser is already animating the
 * change itself (a swipe Back on a phone).
 */
export function animateSwitch(direction: Direction, swap: () => void, skip = false) {
  const root = document.documentElement;
  if (skip || matchMedia("(prefers-reduced-motion: reduce)").matches) return swap();
  root.dataset.switch = direction;
  if (document.startViewTransition) {
    const transition = document.startViewTransition(swap);
    transition.finished.finally(() => { if (root.dataset.switch === direction) delete root.dataset.switch; });
    return;
  }
  swap();
  clearTimeout(clearFallback);
  delete root.dataset.switchIn;
  void root.offsetWidth; // restart the CSS animation if a switch is still running
  root.dataset.switchIn = "";
  clearFallback = setTimeout(() => { delete root.dataset.switchIn; delete root.dataset.switch; }, FALLBACK_MS);
}

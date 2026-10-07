// The only script the site ships: preferences everywhere; on a map, its controls, in-place opening,
// and in-place day and service switches.
import { initAbout } from "./controls";
import { initPreferences } from "./preferences";
import { initSwitching } from "./switch";

initPreferences();
const main = document.querySelector<HTMLElement>("main");
if (main?.dataset.day) initSwitching(main);
if (main?.classList.contains("about")) initAbout();

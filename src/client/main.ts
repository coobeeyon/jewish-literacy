// The only script the site ships: preferences everywhere; on a map, its controls and in-place opening.
import { initAbout, initControls } from "./controls";
import { initMap } from "./map";
import { initPreferences } from "./preferences";

initPreferences();
const main = document.querySelector<HTMLElement>("main");
if (main?.dataset.day) { initControls(main); initMap(main); }
if (main?.classList.contains("about")) initAbout();

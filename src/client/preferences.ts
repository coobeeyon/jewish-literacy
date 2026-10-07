// Language and nusach: saved preferences, not part of the path. The inline script in Page.astro
// applies them as <html data-language data-nusach> before first paint; this keeps them in step.
import type { Language, Nusach } from "../types";

const LANGUAGE_KEY = "weekday-shacharit-language";
const NUSACH_KEY = "weekday-shacharit-nusach";
const root = document.documentElement;

export const language = (): Language => (root.dataset.language as Language) || "both";
export const nusach = (): Nusach => root.dataset.nusach === "sefard" ? "sefard" : "ashkenaz";

const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* storage is optional */ }
};

/** aria-pressed follows <html>; CSS already shows the pressed choice from the same attributes. */
function reflect() {
  for (const button of document.querySelectorAll<HTMLElement>("[data-language-choice]")) button.setAttribute("aria-pressed", String(button.dataset.languageChoice === language()));
  for (const button of document.querySelectorAll<HTMLElement>("[data-nusach-choice]")) button.setAttribute("aria-pressed", String(button.dataset.nusachChoice === nusach()));
}

export function setLanguage(value: Language) {
  write(LANGUAGE_KEY, value);
  root.dataset.language = value;
  root.lang = value === "he" ? "he" : "en";
  reflect();
}

export function setNusach(value: Nusach) {
  write(NUSACH_KEY, value);
  if (value === nusach()) return;
  root.dataset.nusach = value;
  reflect();
  document.dispatchEvent(new CustomEvent("nusachchange"));
}

export function initPreferences() {
  reflect();
  document.addEventListener("click", event => {
    const button = (event.target as Element).closest<HTMLElement>("[data-language-choice], [data-nusach-choice]");
    if (button?.dataset.languageChoice) setLanguage(button.dataset.languageChoice as Language);
    else if (button?.dataset.nusachChoice) setNusach(button.dataset.nusachChoice as Nusach);
  });
}

// A tiny element builder for the few things the browser renders itself (Sefaria text and its states).
import type { Localized } from "../types";

type Child = Node | string | false | null | undefined | readonly Child[];

export function h(tag: string, attrs: Record<string, string | undefined> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) if (value !== undefined) el.setAttribute(name, value);
  append(el, children);
  return el;
}

function append(el: Element, children: readonly Child[]) {
  for (const child of children) {
    if (Array.isArray(child)) append(el, child);
    else if (typeof child === "string" || child instanceof Node) el.append(child);
  }
}

/** English and Hebrew side by side; CSS shows one or both (see LocalizedText in src/view/common.tsx). */
export const bi = (value: Localized) => [h("span", { "data-lang": "en" }, value.en), h("span", { class: "he", "data-lang": "he" }, value.he)];

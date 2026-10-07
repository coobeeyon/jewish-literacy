// Build-time markup shared by every page. These are plain functions returning Preact VNodes,
// rendered to static HTML by Astro; none of this code ships to the browser.
import type { ComponentChildren, VNode } from "preact";
import type { Language, Localized } from "../types";

export function LocalizedText(value: Localized, className?: string): VNode {
  return <>
    <span className={className} data-lang="en">{value.en}</span>
    <span className={["he", className].filter(Boolean).join(" ")} data-lang="he">{value.he}</span>
  </>;
}

export function PeopleIcon(): VNode {
  return <svg className="communal-mark" aria-hidden="true" viewBox="0 0 16 16"><path fill="currentColor" d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-5.784 6A2.24 2.24 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.3 6.3 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1zM4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5" /></svg>;
}

export function SettingsIcon(): VNode {
  return <svg className="settings-mark" aria-hidden="true" viewBox="0 0 16 16"><path fill="currentColor" d="M1 3.5h8.1a2 2 0 0 1 3.8 0H15v1.5h-2.1a2 2 0 0 1-3.8 0H1zm0 7.5h2.1a2 2 0 0 1 3.8 0H15v1.5H6.9a2 2 0 0 1-3.8 0H1z" /></svg>;
}

const languageLabels: Record<Language, string> = { en: "English", he: "עברית", both: "Both" };

/**
 * The saved language is applied before first paint by the inline script in Page.astro, which sets
 * <html data-language>; CSS shows the pressed choice from that. The script in src/client keeps
 * aria-pressed in step. The markup is written for the default ("both").
 */
export function LanguagePicker(): VNode {
  return <div className="picker language" role="group" aria-label="Display language">{(["en", "he", "both"] as const).map(v => <button key={v} data-language-choice={v} aria-pressed={v === "both"}>{v === "he" ? <span lang="he">{languageLabels[v]}</span> : languageLabels[v]}</button>)}</div>;
}

export const fragment = (children: ComponentChildren): VNode => <>{children}</>;

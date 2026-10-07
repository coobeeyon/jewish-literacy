// Build time: a service map as static HTML, in the state its URL names (which movement, prayer and
// section are open). Ported from the React app's App.tsx; the markup is the same element for element.
//
// Everything that can open in place is a "region": a container that is empty while closed. Each
// region's closed-state content is also written once into a <template> at the end of the page, so
// the browser script (src/client/map.ts) can open it without a reload and without rendering code.
// Content that differs by nusach gets a template per nusach, and where it is open in the HTML both
// versions are written, one hidden by CSS from <html data-nusach>, so no nusach ever flashes.
import type { ComponentChildren, VNode } from "preact";
import { renderToString } from "preact-render-to-string";
import { displayTitle, HEICHA, heichaAloud, layoutFor, type Movement } from "../movements";
import { corpus, routeFor, services, type MapRoute } from "../routes";
import { textNusach } from "../sefaria";
import type { AstNode, CalendarKind, ContentNode, DayType, Localized, Nusach, ServiceId, ServiceMap } from "../types";
import { boxHead, noteRules } from "../notes";
import { partsOf, sourceOf, textUrl } from "../texts";
import { CalendarIcon, LanguagePicker, LocalizedText, PeopleIcon, SettingsIcon } from "./common";
import { Credit, PartText } from "./reader";

/** What is open: movement and prayer ids, and the open prayer's open sections (by slug). */
type Place = Readonly<{
  map: ServiceMap;
  open: ReadonlySet<string>;
  sections: readonly string[];
  /** The Shmoneh Esrei is shown as Heicha Kedushah rather than silent prayer and repetition. */
  heicha: boolean;
}>;

/**
 * An open prayer of several sections: its breakdown entries each expand their own section of text
 * in place. Entries are keyed as in scripts/toc.mjs (a chip's English text, or "amidah:N").
 */
type Sections = Readonly<{
  node: ContentNode;
  /** The section an entry opens: its route slug and text part (and a heading in place of the part's), if the entry has one. */
  entry: (key: string) => { slug: string; part: number; heading?: Localized } | undefined;
  isOpen: (slug: string) => boolean;
  /** Groups of entries (the Shema's paragraphs, the Amidah's blessing groups) open when holding an open section. */
  groupOpen: (keys: string[]) => boolean;
}>;

type View = Readonly<{
  place: Place;
  nusach: Nusach;
  /** Inside one nusach's version of a region: render for `nusach` only, without splitting again. */
  fixed: boolean;
  /** Region id → its <template> markup, collected while rendering. */
  templates: Map<string, string>;
  sections?: Sections;
}>;

const nusachs = ["ashkenaz", "sefard"] as const;
const html = (node: ComponentChildren) => renderToString(<>{node}</>);
const template = (id: string, body: string) => `<template id="t:${id}">${body}</template>`;

/** The same content for each nusach, or undefined if it is the same for both. */
function perNusach(view: View, content: (view: View) => ComponentChildren): { same: string } | Record<Nusach, string> {
  const [ashkenaz, sefard] = nusachs.map(nusach => html(content({ ...view, nusach, fixed: true })));
  return ashkenaz === sefard ? { same: ashkenaz } : { ashkenaz, sefard };
}

/**
 * A region's container: its content when open (both nusachs if they differ), empty when closed.
 * A region with more than one form (the Shmoneh Esrei, usual or Heicha Kedushah) names its `mode`:
 * its template is "<id>~<mode>", and the open container says which form it holds.
 */
function Region(view: View, id: string, className: string, open: boolean, content: (view: View) => ComponentChildren, mode?: string): VNode {
  registerTemplate(view, mode ? `${id}~${mode}` : id, content);
  let inner = "";
  if (open && view.fixed) inner = html(content(view));
  else if (open) {
    const versions = perNusach(view, content);
    inner = "same" in versions ? versions.same : nusachs.map(n => `<div class="nusach-variant" data-nusach-only="${n}">${versions[n]}</div>`).join("");
  }
  return <div id={id} className={className} hidden={!open} data-mode={open ? mode : undefined} dangerouslySetInnerHTML={{ __html: inner }} />;
}

/** Write a region's closed-state content once per page, per nusach where it differs. */
function registerTemplate(view: View, id: string, content: (view: View) => ComponentChildren) {
  if (view.templates.has(id)) return;
  view.templates.set(id, "");
  const closed: View = { ...view, place: { map: view.place.map, open: new Set(), sections: [], heicha: false }, sections: undefined };
  const versions = perNusach(closed, content);
  view.templates.set(id, "same" in versions ? template(id, versions.same) : nusachs.map(n => template(`${id}:${n}`, versions[n])).join(""));
}

/**
 * A calendar box: a date-dependent rule, stated in full, then the verdict for the date being prayed
 * with its reason ("Mon 12 Oct (1 Cheshvan): **not said** — it’s Rosh Chodesh."), written in by the
 * browser (src/today.ts). At the top of the opened item, before its sections. A page that arrives
 * with a box open has it complete and loads the small script that writes the verdict before the
 * first paint (src/notes-script.ts), so nothing moves. The templates a box opens from carry it
 * empty, and the browser builds it (src/client/date.ts), so every page stays light.
 */
function CalendarBox(id: string, open = true): VNode {
  const rule = noteRules[id];
  if (!rule) throw new Error(`No rule for the calendar box ${id}`);
  if (!open) return <div className="calendar-box" data-note={id} />;
  return <div className="calendar-box" data-note={id}>
    <p className="box-head">{CalendarIcon()}{LocalizedText(boxHead)}</p>
    <p className="box-rule">{LocalizedText(rule)}</p>
    <p className="box-verdict" />
  </div>;
}

/** The calendar boxes an item opens with: one for each date-dependent rule its content marks (complete where the page arrives with it open). */
function CalendarBoxes(node: ContentNode, open: boolean): VNode {
  const ids: string[] = [];
  const find = (nodes: AstNode[]) => { for (const n of nodes) if (n.type === "element") { const c = (n.attrs.class || "").split(/\s+/); if (c.includes("calendar-note")) ids.push(c.find(x => x.startsWith("note-"))!.slice(5)); else find(n.children); } };
  find(node.details); find(node.boundary);
  return <>{ids.map(id => CalendarBox(id, open))}</>;
}

const plainText = (node: AstNode): string => node.type === "text" ? node.value : node.children.map(plainText).join("");
const slugOf = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** A breakdown entry's toggle; its section appears right below it, inside the entry. */
function EntryToggle(view: View, entryKey: string, children: ComponentChildren): VNode {
  const sections = view.sections;
  const entry = sections?.entry(entryKey);
  if (!sections || !entry) return <>{children}</>;
  const open = sections.isOpen(entry.slug);
  return <button type="button" className="toc-toggle" aria-expanded={open} aria-controls={`text-${sections.node.id}-${entry.slug}`} data-section={entry.slug}>{children}</button>;
}

/**
 * Where an entry's section of text goes. Open in the page as it arrives, the text is written in
 * (data-filled tells the browser it is there); otherwise the browser places it when it opens.
 */
function EntryText(view: View, entryKey: string): VNode | null {
  const sections = view.sections;
  const entry = sections?.entry(entryKey);
  if (!sections || !entry) return null;
  const open = sections.isOpen(entry.slug);
  const { id } = shownText(view, sections.node);
  return <div id={`text-${sections.node.id}-${entry.slug}`} className="section-text" hidden={!open} data-part={entry.part} data-heading={entry.heading && JSON.stringify(entry.heading)} data-filled={open ? "" : undefined}>
    {open && <div className="reader section-reader">{PartText(sections.node.id, entry.part, partsOf(id)[entry.part], true, entry.heading)}</div>}
  </div>;
}

/** The text a prayer shows in a nusach: Sefard's where Sefaria has it, otherwise Ashkenaz's (and the credit says so). */
const shownText = (view: View, node: ContentNode) => {
  const text = node.text!;
  return { id: text[textNusach(text, view.nusach)]!, fellBack: view.nusach === "sefard" && !text.sefard };
};

/** The Sefaria credit under a prayer's text. */
function TextCredit(view: View, node: ContentNode): VNode {
  const { id, fellBack } = shownText(view, node);
  return Credit(sourceOf(id), fellBack);
}

/** A group heading that shows or hides its entries. */
function GroupToggle(view: View, id: string, keys: string[], title: ComponentChildren, children: ComponentChildren): VNode {
  const sections = view.sections!;
  const open = sections.groupOpen(keys);
  const bodyId = `group-${sections.node.id}-${id}`;
  const slugs = [...new Set(keys.flatMap(key => sections.entry(key)?.slug || []))];
  return <>
    <button type="button" className="toc-group" aria-expanded={open} aria-controls={bodyId} data-group={id} data-sections={slugs.join(" ")}>{title}</button>
    <div id={bodyId} className="toc-group-body" hidden={!open}>{children}</div>
  </>;
}

const chipKey = (node: AstNode) => {
  const en = node.type === "element" ? node.children.find(child => child.type === "element" && child.attrs["data-lang"] === "en") : undefined;
  return plainText(en || node).trim();
};

function Ast(view: View, nodes: AstNode[]): VNode {
  const sections = view.sections;
  const render = (node: AstNode, key: number): ComponentChildren => {
    if (node.type === "text") return node.value;
    const classes = (node.attrs.class || "").split(/\s+/);
    if (classes.includes("rite") && !classes.includes(view.nusach[0])) return null;
    // A date-dependent rule: shown as its calendar box at the top of the opened item (see CalendarBoxes).
    if (classes.includes("calendar-note")) return null;
    const props: Record<string, unknown> = { key };
    if (node.attrs.class) props.className = node.attrs.class;
    if (node.attrs["data-lang"]) props["data-lang"] = node.attrs["data-lang"];
    if (node.attrs.lang) props.lang = node.attrs.lang;
    if (node.attrs.dir) props.dir = node.attrs.dir;
    // A breakdown entry the date turns on or off (the Monday–Thursday additions, the Omer): marked by the browser.
    const dateMark = classes.find(c => c.startsWith("mark-"))?.slice("mark-".length);
    if (dateMark) props["data-mark"] = dateMark;
    const Tag = node.tag as "div";
    const children = node.children.map(render);
    if (sections && node.tag === "li") {
      // A breakdown chip: its toggle, then its section's text in place.
      const entryKey = chipKey(node);
      if (!sections.entry(entryKey)) return <Tag {...props}>{children}</Tag>;
      return <li {...props} className={[node.attrs.class, "toc-entry"].filter(Boolean).join(" ")}>{EntryToggle(view, entryKey, children)}{EntryText(view, entryKey)}</li>;
    }
    if (sections && classes.includes("nested")) {
      // A group of chips (e.g. the Shema's paragraphs) under a title that opens it.
      const title = node.children.find(child => child.type === "element" && (child.attrs.class || "").split(/\s+/).includes("nested-title"));
      const rest = node.children.filter(child => child !== title);
      const keys: string[] = [];
      const collect = (n: AstNode) => { if (n.type !== "element") return; if (n.tag === "li") keys.push(chipKey(n)); else n.children.forEach(collect); };
      rest.forEach(collect);
      return <div {...props}>{GroupToggle(view, slugOf(title ? chipKey(title) : "group"), keys, title ? render(title, 0) : null, rest.map((child, i) => render(child, i + 1)))}</div>;
    }
    return <Tag {...props}>{children}</Tag>;
  };
  return <>{nodes.map(render)}</>;
}

const weekdayBlessings = [
  ["Ancestors — Avot", "אבות — אבות"], ["Divine might — Gevurot", "גבורות — גבורות"], ["God’s holiness — Kedushat Hashem", "קדושת השם — קדושת השם"],
  ["Knowledge — Atah Chonen", "דעת — אתה חונן"], ["Return — Hashiveinu", "תשובה — השיבנו"], ["Forgiveness — Selach Lanu", "סליחה — סלח לנו"],
  ["Redemption — Re’eh Na", "גאולה — ראה נא"], ["Healing — Refa’einu", "רפואה — רפאנו"], ["Sustenance and the year — Barekh Aleinu / Barekheinu", "ברכת השנים — ברך עלינו / ברכנו"],
  ["Gathering the exiles — Teka B’Shofar", "קיבוץ גלויות — תקע בשופר"], ["Justice — Hashivah Shofteinu", "משפט — השיבה שופטינו"], ["Against destructive wickedness — V’lamalshinim", "ברכת המינים — ולמלשינים"],
  ["The righteous — Al HaTzadikim", "על הצדיקים — על הצדיקים"], ["Rebuilding Jerusalem — V’liYerushalayim", "בניין ירושלים — ולירושלים"], ["Davidic redemption — Et Tzemach David", "מלכות בית דוד — את צמח דוד"],
  ["Hear our prayer — Shema Koleinu", "שומע תפילה — שמע קולנו"], ["Restore worship — Retzeh", "עבודה — רצה"], ["Thanksgiving — Modim", "הודאה — מודים"], ["Peace — Sim Shalom", "שלום — שים שלום"],
] as const;

/** A blessing: in an open prayer, its toggle opens its text right below it. */
function Blessing(view: View, n: number, entryKey: string, value: readonly [string, string], repetition: boolean, overlay?: ComponentChildren): VNode {
  return <div className={view.sections?.entry(entryKey) ? "blessing toc-entry" : "blessing"}>{EntryToggle(view, entryKey, LocalizedText({ en: n ? `${n}. ${value[0]}` : value[0], he: n ? `${n}. ${value[1]}` : value[1] }))}{overlay}{repetition && <span className="amen">{LocalizedText({ en: "Amen response", he: "עניית אמן" })}</span>}{EntryText(view, entryKey)}</div>;
}

/** A note on a blessing. It opens text of its own only when it has its own section (the priestly blessing). */
function Overlay(view: View, value: Localized, entryKey?: string): VNode {
  if (!entryKey) return <span className="overlay">{LocalizedText(value)}</span>;
  return <span className="overlay toc-entry">{EntryToggle(view, entryKey, LocalizedText(value))}{EntryText(view, entryKey)}</span>;
}

function AmidahGroup(view: View, en: string, he: string, keys: string[], children: ComponentChildren): VNode {
  if (!view.sections) return <details className="amidah-group"><summary>{LocalizedText({ en, he })}</summary><div className="blessings">{children}</div></details>;
  return <div className="amidah-group">{GroupToggle(view, slugOf(en), keys, LocalizedText({ en, he }), <div className="blessings">{children}</div>)}</div>;
}

const kedushah = (view: View) => Overlay(view, { en: "Kedushah · leader/congregation call-and-response", he: "קדושה · קריאה ומענה של הש״ץ והציבור" });
const range = (start: number, end: number) => Array.from({ length: end - start }, (_, i) => `amidah:${start + i + 1}`);

/** Heicha Kedushah's part of a Shmoneh Esrei: the first three blessings said aloud, or the rest said silently. */
type HeichaPart = "aloud" | "silent";
const holinessOfTheName = ["Holiness of the Name — Kedushat Hashem", "קדושת השם — קדושת השם"] as const;

/** Heicha Kedushah's opening blessings, each opening its text from the leader's repetition. */
function AloudBlessings(view: View, blessings: ReadonlyArray<readonly [string, string]>): VNode {
  return <div className="blessings">{[blessings[0], blessings[1], holinessOfTheName].map((b, i) => Blessing(view, i + 1, `amidah:${i + 1}`, b, false, i === 2 ? kedushah(view) : undefined))}</div>;
}

function AmidahDetails(view: View, node: ContentNode, part?: HeichaPart): VNode {
  const repetition = node.section === "repetition" && !part;
  // Heicha Kedushah's silent part starts after the opening group of three blessings.
  const from = part === "silent" ? 1 : 0;
  if (node.detailKind === "weekday-amidah") {
    if (part === "aloud") return <div className="amidah-groups">{AloudBlessings(view, weekdayBlessings)}</div>;
    const groups = [["Praise", "שבח", 0, 3], ["Requests", "בקשות", 3, 16], ["Thanksgiving and leave-taking", "הודאה וסיום", 16, 19]] as const;
    return <div className="amidah-groups">{groups.slice(from).map(([en, he, start, end]) => AmidahGroup(view, en, he, [...range(start, end), ...(end === 19 && repetition ? ["amidah:kohanim"] : [])], weekdayBlessings.slice(start, end).map((b, i) => {
      const n = start + i + 1;
      const overlay = repetition && n === 3 ? kedushah(view) : repetition && n === 18 ? <>{Overlay(view, { en: "Modim D’Rabbanan · parallel congregational response", he: "מודים דרבנן · מענה מקביל של הציבור" })}{Overlay(view, { en: "Priestly blessing or prayer leader’s verses · community practice varies", he: "ברכת כהנים או אמירת הפסוקים בידי הש״ץ · המנהג משתנה בין קהילות" }, "amidah:kohanim")}</> : undefined;
      return Blessing(view, n, `amidah:${n}`, b, repetition, overlay);
    })))}{repetition ? <span className="badge">{LocalizedText({ en: "Requires a minyan · community wording varies", he: "נדרש מניין · הנוסח משתנה בין קהילות" })}</span> : Blessing(view, 0, "amidah:conclusion", ["Personal conclusion — Elohai Netzor and steps back", "סיום אישי — אלוהי נצור ופסיעות לאחור"], false)}</div>;
  }
  const middle: Record<ServiceId, Localized> = {
    maariv: { en: "Sanctity of the day — Atah Kidashta", he: "קדושת היום — אתה קידשת" },
    shacharit: { en: "Sanctity of the day — Yismach Moshe", he: "קדושת היום — ישמח משה" },
    musaf: { en: "Sanctity of the day and Shabbat’s additional offering — Tikanta Shabbat", he: "קדושת היום וקרבן מוסף של שבת — תקנת שבת" },
    mincha: { en: "Sanctity of the day — Atah Echad", he: "קדושת היום — אתה אחד" },
  };
  const blessings = [["Ancestors — Avot", "אבות — אבות"], ["Divine might — Gevurot", "גבורות — גבורות"], ["God’s holiness — Kedushat Hashem", "קדושת השם — קדושת השם"], [middle[node.variant || "shacharit"].en, middle[node.variant || "shacharit"].he], ["Restore worship — Retzeh", "עבודה — רצה"], ["Thanksgiving — Modim", "הודאה — מודים"], ["Peace blessing", "ברכת השלום"]] as const;
  if (part === "aloud") return <div className="amidah-groups">{AloudBlessings(view, blessings)}</div>;
  const groups = [["Praise", "שבח", 0, 3], ["Sanctity of the day", "קדושת היום", 3, 4], ["Thanksgiving and peace", "הודאה ושלום", 4, 7]] as const;
  return <div className="amidah-groups">{groups.slice(from).map(([en, he, start, end]) => AmidahGroup(view, en, he, range(start, end), blessings.slice(start, end).map((b, i) => { const n = start + i + 1; return Blessing(view, n, `amidah:${n}`, b, repetition, repetition && n === 3 ? kedushah(view) : undefined); })))}{!repetition && Blessing(view, 0, "amidah:conclusion", ["Personal conclusion and steps back", "סיום אישי ופסיעות לאחור"], false)}</div>;
}

/**
 * The date the notes speak of: today unless another is dialled in (?date=YYYY-MM-DD), with its Hebrew
 * date, a step back and forward, and a way back to today. The browser builds it (src/client/date.ts)
 * in room kept for it, so nothing moves; without a script it is hidden.
 */
const DateLine = (): VNode => <div className="date-line" />;

/**
 * The items a date turns on or off at the top level (and two breakdown entries), by the date note
 * that decides them (src/today.ts noteState). The browser marks them data-today="on" or "off" and
 * writes the note's line into the label kept for it, so the map itself shows what applies today.
 */
const marks: Record<string, string> = {
  "weekday/shacharit/tachanun": "tachanun-shacharit", "weekday/shacharit/half-kaddish-2": "kaddish-after-tachanun", "weekday/shacharit/torah": "torah-weekday",
  "weekday/mincha/tachanun": "tachanun-mincha", "weekday/maariv/concluding-prayers": "omer",
  "shabbat/mincha/tzidkatcha": "tzidkatcha", "shabbat/mincha/full-kaddish": "kaddish-after-tzidkatcha",
};
const markOf = (map: Pick<ServiceMap, "day" | "id">, id: string): string | undefined => marks[`${map.day}/${map.id}/${id}`];
/** The label a marked item keeps for its line: one line in each language shown. */
const MarkLabel = (mark: string | undefined) => mark && <span className="today-mark" />;

const dayLabels: Record<DayType, Localized> = { weekday: { en: "Weekday", he: "חול" }, shabbat: { en: "Shabbat", he: "שבת" } };
const serviceLabels: Record<ServiceId, Localized> = { shacharit: { en: "Shacharit", he: "שחרית" }, mincha: { en: "Mincha", he: "מנחה" }, maariv: { en: "Maariv", he: "ערבית" }, musaf: { en: "Musaf", he: "מוסף" } };

/**
 * Day and service always show; language and nusach sit behind one small settings control. Day and
 * service are links to their maps, so they work without a script; the script switches in place.
 */
function Controls(day: DayType, service: ServiceId): VNode {
  return <div className="controls">
    <div className="control-row">
      <nav className="picker daytype" aria-label="Day type">{(["weekday", "shabbat"] as const).map(v => <a key={v} href={routeFor({ day: v, id: v === day ? service : "shacharit" })} data-day-choice={v} aria-current={day === v ? "true" : undefined}>{LocalizedText(dayLabels[v])}</a>)}</nav>
      <button type="button" className="settings-toggle" aria-expanded={false} aria-controls="display-settings">{SettingsIcon()}<span className="settings-label">{LocalizedText({ en: "Language · Nusach", he: "שפה · נוסח" })}</span></button>
    </div>
    <div id="display-settings" className="settings" hidden>
      {LanguagePicker()}
      <div className="picker nusach" role="group" aria-label="Prayer rite">{nusachs.map(v => <button key={v} data-nusach-choice={v} aria-pressed={v === "ashkenaz"}>{LocalizedText({ en: `Nusach ${v === "ashkenaz" ? "Ashkenaz" : "Sefard"}`, he: `נוסח ${v === "ashkenaz" ? "אשכנז" : "ספרד"}` })}</button>)}</div>
    </div>
    <nav className={`picker service ${day}`} aria-label="Service">{services[day].map(v => <a key={v} href={routeFor({ day, id: v })} data-service-choice={v} aria-current={service === v ? "true" : undefined}>{LocalizedText(serviceLabels[v])}</a>)}</nav>
  </div>;
}

/**
 * Title (English and Hebrew share a line in "both" mode) plus at most one short line; an event
 * (the Torah reading) shows the sequence of its stages across the block instead.
 */
function MovementHead(movement: Movement): VNode {
  return <>{MovementCopy(movement)}{movement.stages && <span className="stages">{movement.stages.map(stage => <span className="stage" key={stage.en}>{LocalizedText(stage)}</span>)}</span>}</>;
}

function MovementCopy(movement: Movement): VNode {
  return <span className="copy">
    <h2 className="item-title" tabIndex={-1}>{LocalizedText(movement.title)}</h2>
    {movement.blurb && <span className="blurb">{LocalizedText(movement.blurb)}</span>}
  </span>;
}

const movementClass = (m: Movement) => ["movement", m.tone, m.peak && "peak", m.minor && "minor", m.stages && "event", m.communal && "communal"].filter(Boolean).join(" ");

/** What the browser needs to show a prayer's text: its text file per nusach, title and Sefaria links. */
const readerData = (node: ContentNode) => node.text && JSON.stringify({
  id: node.id,
  title: node.title,
  texts: { ashkenaz: textUrl(node.text.ashkenaz), ...(node.text.sefard ? { sefard: textUrl(node.text.sefard) } : {}) },
  links: node.text.links,
});

/**
 * A prayer card. At the top level it stands for a whole one-card movement and shows the movement's
 * title and line; inside an open movement it is a member and shows its own title and summary.
 */
function Card(view: View, node: ContentNode, movement?: Movement, parent?: string): VNode {
  const { place } = view;
  const detailId = `detail-${place.map.day}-${place.map.id}-${node.id}`;
  const open = place.open.has(node.id);
  // With Sefaria text, the opened card shows the prayer itself in place of its summary.
  const reader = Boolean(node.text);
  const summary = movement ? open && !reader : !(open && reader);
  // A member prayer's summary leaves its button while the prayer is open; the browser puts it back from here.
  if (!movement && reader) registerTemplate(view, `summary-${node.id}`, v => Ast(v, node.summary));
  const className = movement ? `${movementClass(movement)} card` : ["card", "member", node.role, node.communal && "communal", node.classes.includes("conditional") && "conditional"].filter(Boolean).join(" ");
  const mark = movement ? markOf(place.map, node.id) : undefined;
  return <li id={`section-${node.id}`} className={`${className}${reader ? " reader-card" : ""}`} data-reader={readerData(node)} data-mark={mark}>
    <button type="button" aria-expanded={open} aria-controls={detailId} data-route={node.id} data-parent={parent}>{node.communal && PeopleIcon()}{movement ? MovementHead(movement) : <span className="copy"><h3 className="item-title" tabIndex={-1}>{LocalizedText(displayTitle(node))}</h3>{summary && Ast(view, node.summary)}</span>}{MarkLabel(mark)}</button>
    {Region(view, detailId, "details", open, v => <>{CalendarBoxes(node, v.place.open.has(node.id))}{movement && !reader && Ast(v, node.summary)}{reader ? ReaderDetails(v, node) : node.detailKind ? AmidahDetails(v, node) : Ast(v, node.details)}</>)}
  </li>;
}

/**
 * A prayer shown whole (one section, or no breakdown, as Kaddish and Barkhu). Open in the page as
 * it arrives, its text is written in (data-filled); otherwise the browser places it when it opens.
 */
function PrayerReader(view: View, node: ContentNode): VNode {
  const open = view.place.open.has(node.id);
  const parts = open ? partsOf(shownText(view, node).id) : [];
  return <section className="reader" aria-label={`${node.title.en} prayer text`} data-prayer="" data-filled={open ? "" : undefined}>
    {node.text!.calendar && TorahCalendar(node.text!.calendar)}
    {open && <><div className="reader-texts">{parts.map((part, i) => PartText(node.id, i, part, parts.length > 1))}</div>{TextCredit(view, node)}</>}
  </section>;
}

/** What a Torah card's reading line introduces (src/today.ts readingFor). */
const readingIntro: Record<CalendarKind, Localized> = {
  weekday: { en: "The coming Shabbat’s portion (outside Israel):", he: "פרשת השבת הקרובה (חוץ לארץ):" },
  shabbat: { en: "This Shabbat’s reading (outside Israel):", he: "הקריאה של שבת זו (חוץ לארץ):" },
  mincha: { en: "Shabbat afternoon reads the opening of the next week’s portion (outside Israel):", he: "במנחה של שבת קוראים את תחילת פרשת השבוע הבא (חוץ לארץ):" },
};

/**
 * The week's Torah reading for the date being prayed, with a link to it on Sefaria. The browser
 * writes the reading in (src/client/date.ts) from the calendar table, in room kept for it: its name
 * and verses (in Hebrew, its name), and on Shabbat morning the haftarah, one line each.
 */
const TorahCalendar = (kind: CalendarKind) => <div className="reader-calendar" data-calendar={kind}>
  <p className="calendar-intro">{LocalizedText(readingIntro[kind])}</p>
  <p className={`calendar-reading${kind === "shabbat" ? " with-haftarah" : ""}`} />
</div>;

/**
 * An open card with text. A prayer of several sections shows only its breakdown; each entry opens
 * its own section in place, at /…/<prayer>/<section>. A prayer of one section shows its text whole.
 * (The Sefaria credit, once a section is open, is added by the browser with the text.)
 */
function ReaderDetails(view: View, node: ContentNode, heicha?: HeichaPart): VNode {
  const { nusach, place } = view;
  const text = node.text!;
  const shown = textNusach(text, nusach);
  const slugs = text.slugs?.[shown];
  const toc = text.toc[shown] || {};
  const hasBreakdown = node.detailKind || node.details.length > 0;
  const breakdown = (sections?: Sections) => hasBreakdown && <nav className="card-toc" aria-label={`${node.title.en} sections`}>{node.detailKind ? AmidahDetails({ ...view, sections }, node, heicha) : Ast({ ...view, sections }, node.details)}</nav>;
  if (!slugs) return <>{breakdown()}{PrayerReader(view, node)}</>;
  // In Heicha Kedushah a prayer shows only its part of the blessings, and its sections open under the movement's route.
  const shows = (key: string) => !heicha || (heicha === "aloud") === heichaAloud(key);
  const entry = (key: string) => key in toc && shows(key) ? { slug: slugs[toc[key]], part: toc[key], heading: heicha === "aloud" && key === "amidah:3" ? heichaKedushahHeading : undefined } : undefined;
  const own = heicha ? new Set(Object.keys(toc).flatMap(key => entry(key)?.slug ?? [])) : new Set(slugs);
  const open = place.sections.filter(slug => own.has(slug));
  const sections: Sections = {
    node, entry,
    isOpen: slug => open.includes(slug),
    groupOpen: keys => keys.some(key => { const e = entry(key); return e ? open.includes(e.slug) : false; }),
  };
  // Once a section is open, the credit follows the breakdown (the browser adds and removes it as sections open and close).
  return <>
    {text.calendar && <div className="reader">{TorahCalendar(text.calendar)}</div>}
    {breakdown(sections)}
    {open.length > 0 && <div className="reader" data-credit="" data-filled="">{TextCredit(view, node)}</div>}
  </>;
}

const heichaKedushahHeading: Localized = { en: "Kedushah and Holiness of the Name", he: "קדושה וקדושת השם" };

/** The fine print under a landmark's title in the source ("after the final aliyah", "community practice", a date note). */
const landmarkNote = (node: ContentNode): AstNode | undefined => {
  const find = (nodes: AstNode[]): AstNode | undefined => {
    for (const n of nodes) {
      if (n.type !== "element") continue;
      if (n.tag === "small") return plainText(n).trim() ? n : undefined;
      const inner = find(n.children);
      if (inner) return inner;
    }
  };
  return find(node.boundary);
};

/** Kaddish and Barkhu: a slim boxed seam showing only its title; its fine print and text open inside. */
function Landmark(view: View, node: ContentNode, parent?: string): VNode {
  const { place } = view;
  if (!node.text) return <li className="threshold">{node.communal && PeopleIcon()}{Ast(view, node.boundary)}</li>;
  const open = place.open.has(node.id);
  const className = ["seam", node.communal && "kaddish communal", node.classes.includes("barkhu") && "barkhu"].filter(Boolean).join(" ");
  const note = landmarkNote(node);
  const detailId = `detail-${place.map.day}-${place.map.id}-${node.id}`;
  const mark = markOf(place.map, node.id);
  return <li id={`section-${node.id}`} className={`${className} landmark-reader`} data-open={open ? "true" : undefined} data-reader={readerData(node)} data-mark={mark}>
    {node.communal && PeopleIcon()}
    <button type="button" className="landmark-toggle" aria-expanded={open} aria-controls={detailId} data-route={node.id} data-parent={parent}><span className="landmark-title" tabIndex={-1}>{LocalizedText(node.title)}</span>{MarkLabel(mark)}</button>
    {Region(view, detailId, "landmark-details", open, v => <>{CalendarBoxes(node, v.place.open.has(node.id))}{note && <p className="seam-note">{note.type === "element" && Ast(v, note.children)}</p>}{PrayerReader(v, node)}</>)}
  </li>;
}

/** The usual pattern or Heicha Kedushah: a small switch at the top of a Shmoneh Esrei that offers both. */
function PatternSwitch(heicha: boolean): VNode {
  const choices = [[false, { en: "Usual", he: "כרגיל" }], [true, { en: "When time is short", he: "כשהזמן דחוק" }]] as const;
  return <div className="picker pattern-switch" role="group" aria-label="How the Shmoneh Esrei is said">{choices.map(([choice, label]) => <button key={String(choice)} type="button" data-pattern-choice={choice ? "heicha" : "usual"} aria-pressed={heicha === choice}>{LocalizedText(label)}</button>)}</div>;
}

/** When Heicha Kedushah is used, and how; fine print, so only inside the opened movement. */
const heichaNote: Localized = {
  en: "Heicha Kedushah is for when time is short, mostly at Mincha; Maariv has no repetition to shorten. The rabbi or congregation decides. Some congregations use it routinely, though many authorities keep it for real need. Practice varies.",
  he: "הויכע קדושה נאמרת כשהזמן דחוק, בעיקר במנחה; בערבית אין חזרה לקצר. הרב או הקהל מחליטים. יש קהילות שנוהגות כך בקביעות, אף שרבים מהפוסקים מגבילים זאת לשעת הצורך. המנהג משתנה בין קהילות.",
};

/** Heicha Kedushah in place of silent prayer and repetition: the opening blessings aloud with the leader, then the rest silently. */
function HeichaBody(view: View, movement: Movement): VNode {
  const { aloud, silent } = movement.heicha!;
  const parts = [
    { node: aloud, part: "aloud", title: { en: "Aloud, with the leader", he: "בקול, עם הש״ץ" }, hint: { en: "The congregation says it along quietly or listens, and answers Kedushah.", he: "הציבור אומר עמו בלחש או מקשיב, ועונה קדושה." } },
    { node: silent, part: "silent", title: { en: "The rest, silently", he: "השאר, בלחש" }, hint: { en: "Everyone, leader included. No repetition follows.", he: "כולם, גם הש״ץ. אין חזרה אחר כך." } },
  ] as const;
  return <>
    <div className="pattern-note"><p>{LocalizedText(heichaNote)}</p><p className="pattern-source">{LocalizedText({ en: "Shulchan Aruch, Orach Chaim 124:2 and 232:1", he: "שולחן ערוך, אורח חיים קכ״ד ב׳ ורל״ב א׳" })}</p></div>
    <ol className="members">{parts.map(({ node, part, title, hint }) => <li key={part} id={`section-${node.id}`} className={["card", "member", "reader-card", "heicha-part", node.role, part === "aloud" && node.communal && "communal"].filter(Boolean).join(" ")} data-heicha-part={part} data-reader={readerData(node)}>
      {part === "aloud" && node.communal && PeopleIcon()}
      <div className="heicha-head copy"><h3 className="item-title" tabIndex={-1}>{LocalizedText(title)}</h3><span className="hint">{LocalizedText(hint)}</span></div>
      <div className="details">{ReaderDetails(view, node, part)}</div>
    </li>)}</ol>
  </>;
}

const heichaBlurb: Localized = { en: "Kedushah aloud, then silent", he: "בקול עד הקדושה, ואחר כך בלחש" };
const Blurb = (blurb: Localized) => <span className="blurb">{LocalizedText(blurb)}</span>;

/**
 * A movement of several prayers: one card at the top level that opens into its members. A Mincha
 * Shmoneh Esrei also offers Heicha Kedushah, in place of its members, with its own line.
 */
function MovementItem(view: View, movement: Movement): VNode {
  const { place } = view;
  const open = place.open.has(movement.id);
  const heicha = Boolean(movement.heicha && place.heicha);
  const detailId = `movement-detail-${place.map.day}-${place.map.id}-${movement.id}`;
  const usual = (v: View) => <>{movement.heicha && PatternSwitch(false)}<ol className="members">{movement.members.map(node => node.kind === "card" ? Card(v, node, undefined, movement.id) : Landmark(v, node, movement.id))}</ol></>;
  const shortened = (v: View) => <>{PatternSwitch(true)}{HeichaBody(v, movement)}</>;
  if (movement.heicha) {
    // Switching pattern in place swaps the body and the movement's line; both forms are templates.
    registerTemplate(view, detailId, usual);
    registerTemplate(view, `${detailId}~heicha`, shortened);
    registerTemplate(view, `blurb-${movement.id}`, () => Blurb(movement.blurb!));
    registerTemplate(view, `blurb-${movement.id}~heicha`, () => Blurb(heichaBlurb));
  }
  const mark = markOf(place.map, movement.id);
  return <li id={`movement-${movement.id}`} className={movementClass(movement)} data-open={open ? "true" : undefined} data-members={movement.members.map(m => m.id).join(" ")} data-heicha={movement.heicha ? "" : undefined} data-mark={mark}>
    <button type="button" aria-expanded={open} aria-controls={detailId} data-route={movement.id}>{movement.communal && PeopleIcon()}{MovementHead(heicha ? { ...movement, blurb: heichaBlurb } : movement)}{MarkLabel(mark)}</button>
    {heicha ? Region(view, detailId, "movement-body", open, shortened, "heicha") : Region(view, detailId, "movement-body", open, usual)}
  </li>;
}

function ServiceView(view: View): VNode {
  const { map } = view.place;
  const layout = layoutFor(map);
  // A view with something open has just arrived: its prayer text keeps a screen's room while it loads (styles.css).
  return <main data-day={map.day} data-service={map.id} data-arriving={view.place.open.size ? "" : undefined}><header><h1>{LocalizedText({ en: "Jewish Literacy Project", he: "מיזם האוריינות היהודית" })}</h1><a className="about-link" href="/about">{LocalizedText({ en: "About Jewish Literacy", he: "על מיזם האוריינות היהודית" })}</a>{Controls(map.day, map.id)}<h2 id="service-heading" className="service-title" tabIndex={-1}>{LocalizedText(map.title)}</h2>{DateLine()}<div className="communal-key">{PeopleIcon()}{LocalizedText({ en: "Requires a minyan (prayer quorum)", he: "נדרש מניין (ציבור לתפילה)" })}</div></header>
    <ol className="service-map">{layout.items.map(item => item.kind === "seam"
      ? Landmark(view, item.node)
      : item.movement.single
        ? Card(view, item.movement.single, item.movement)
        : MovementItem(view, item.movement))}</ol>
    <footer>{LocalizedText({ en: "Each service moves through a few large movements. The largest are its high points: the Shema and the Shmoneh Esrei (“Amidah”), or the Shmoneh Esrei alone where there is no Shema. Community practice varies.", he: "כל תפילה עוברת בכמה חלקים גדולים. הגדולים שבהם הם שיאיה: קריאת שמע ושמונה עשרה (\"עמידה\"), או שמונה עשרה לבדה כשאין קריאת שמע. המנהג משתנה בין קהילות." })}</footer></main>;
}

/** Where each route opens: a prayer keeps its movement open too, and its section rides along. */
function placeFor(route: MapRoute): Place {
  const target = route.section ? layoutFor(route.map).resolve(route.section) : undefined;
  const open = new Set<string>();
  if (target?.movement) open.add(target.movement.id);
  if (target?.node) open.add(target.node.id);
  // A Shmoneh Esrei shown as Heicha Kedushah: /day/service/<movement>/heicha-kedushah[/<section>].
  const heicha = Boolean(target?.movement?.heicha && !target.node && route.part === HEICHA);
  const section = heicha ? route.sub : route.part;
  return { map: route.map, open, sections: section ? [section] : [], heicha };
}

const checked = new Set<ServiceMap>();

/** A map page in its route's state: the <main> markup and the templates that follow it. */
export function renderMapPage(route: MapRoute): { title: string; main: string; templates: string; path: string; landing?: string; opensOnText: boolean } {
  const render = (nusach: Nusach, place: Place) => {
    const templates = new Map<string, string>();
    return { main: html(ServiceView({ place, nusach, fixed: false, templates })), templates };
  };
  // Only regions may differ by nusach: the closed map itself must read the same in both.
  if (!checked.has(route.map)) {
    const closed = placeFor({ map: route.map });
    if (render("ashkenaz", closed).main !== render("sefard", closed).main) throw new Error(`${routeFor(route.map)}: nusach changes the closed map`);
    checked.add(route.map);
  }
  const page = render("ashkenaz", placeFor(route));
  const templates = [...page.templates.values()].join("");
  // Every view of a map opens and closes from the same templates (those of the map, closed).
  const closed = mapTemplates().get(route.map);
  if (closed && closed !== templates) throw new Error(`${routeFor(route.map, route.section, route.part, route.sub)}: its templates differ from its map's`);
  return {
    title: `${route.map.title.en} — Jewish Literacy Project`, main: page.main, templates, path: routeFor(route.map, route.section, route.part, route.sub),
    landing: landingFor(route),
    // A page that opens on prayer text has it in the HTML (and preloads the reader's fonts; see Page.astro).
    opensOnText: page.main.includes("data-filled"),
  };
}

/**
 * Where a deep link lands (at the top of the screen), so a small script right after the map can
 * put it there before the first paint: a section's entry; a movement; or a prayer, by its movement
 * when it is a member of one. settle("initial") in src/client/map.ts lands on the same element
 * once the page script runs; tests/switch.spec.ts checks the two agree.
 */
function landingFor(route: MapRoute): string | undefined {
  if (!route.section) return undefined;
  const target = layoutFor(route.map).resolve(route.section)!;
  const heicha = route.part === HEICHA && !target.node;
  const section = heicha ? route.sub : route.part;
  if (section) return `#${heicha ? "movement" : "section"}-${route.section} .toc-toggle[data-section="${section}"]`;
  if (target.node && target.movement && !target.movement.single) return `#movement-${target.movement.id}`;
  return target.node ? `#section-${target.node.id}` : `#movement-${target.movement!.id}`;
}

const attr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
let maps: Map<ServiceMap, string> | undefined;
let store: string | undefined;

/** Each map's closed-state templates, rendered once. */
function mapTemplates(): Map<ServiceMap, string> {
  if (maps) return maps;
  maps = new Map();
  for (const map of corpus.services) maps.set(map, renderMapPage({ map }).templates);
  return maps;
}

/**
 * Every map, closed, for the browser to switch day and service in place without a request: one
 * <template data-map="<day>/<service>"> per map, holding its closed <main> and the templates its
 * regions open from. Template content is inert, so its ids never clash with the live page's. The
 * same markup ends every map page, so the live map's own templates are found here too.
 */
export function allMaps(): string {
  return store ??= corpus.services.map(map => {
    const page = renderMapPage({ map });
    return `<template data-map="${map.day}/${map.id}" data-title="${attr(page.title)}">${page.main}${page.templates}</template>`;
  }).join("");
}

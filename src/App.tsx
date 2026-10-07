import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType, useParams } from "react-router-dom";
import corpusJson from "./corpus.generated.json";
import { usePreferences } from "./preferences";
import { PrayerReader, SectionText, SourceCredit, textNusach, TorahCalendar } from "./reader";
import { displayTitle, HEICHA, heichaAloud, layoutFor, type Movement } from "./movements";
import type { AstNode, ContentNode, Corpus, DayType, Language, Localized, Nusach, ServiceId, ServiceMap } from "./types";

const corpus = corpusJson as Corpus;
const valid: Record<DayType, ServiceId[]> = {
  weekday: ["shacharit", "mincha", "maariv"],
  shabbat: ["maariv", "shacharit", "musaf", "mincha"],
};
const sessionService: Record<DayType, ServiceId> = { weekday: "shacharit", shabbat: "shacharit" };

function LocalizedText({ value, className }: { value: Localized; className?: string }) {
  return <>
    <span className={className} data-lang="en">{value.en}</span>
    <span className={["he", className].filter(Boolean).join(" ")} data-lang="he">{value.he}</span>
  </>;
}

const plainText = (node: AstNode): string => node.type === "text" ? node.value : node.children.map(plainText).join("");
const slugOf = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * An open prayer of several sections: its breakdown entries each expand their own section of text
 * in place. Entries are keyed as in scripts/toc.mjs (a chip's English text, or "amidah:N").
 */
type Sections = Readonly<{
  node: ContentNode;
  /** The section an entry opens: its route slug and text part (and a heading in place of the part's), if the entry has one. */
  entry: (key: string) => { slug: string; part: number; heading?: Localized } | undefined;
  isOpen: (slug: string) => boolean;
  toggle: (slug: string) => void;
  /** Groups of entries (the Shema's paragraphs, the Amidah's blessing groups) open on demand, or when holding an open section. */
  groupOpen: (id: string, keys: string[]) => boolean;
  toggleGroup: (id: string, open: boolean) => void;
}>;
const SectionsContext = createContext<Sections | null>(null);

/** A breakdown entry's toggle; its section appears right below it, inside the entry. */
function EntryToggle({ entryKey, children }: { entryKey: string; children: ReactNode }) {
  const sections = useContext(SectionsContext);
  const entry = sections?.entry(entryKey);
  if (!sections || !entry) return <>{children}</>;
  const open = sections.isOpen(entry.slug);
  return <button type="button" className="toc-toggle" aria-expanded={open} aria-controls={`text-${sections.node.id}-${entry.slug}`} data-section={entry.slug} onClick={() => sections.toggle(entry.slug)}>{children}</button>;
}

function EntryText({ entryKey }: { entryKey: string }) {
  const sections = useContext(SectionsContext);
  const entry = sections?.entry(entryKey);
  if (!sections || !entry) return null;
  const open = sections.isOpen(entry.slug);
  return <div id={`text-${sections.node.id}-${entry.slug}`} className="section-text" hidden={!open}>{open && <SectionText node={sections.node} index={entry.part} heading={entry.heading} />}</div>;
}

/** A group heading that shows or hides its entries. */
function GroupToggle({ id, keys, title, children }: { id: string; keys: string[]; title: ReactNode; children: ReactNode }) {
  const sections = useContext(SectionsContext)!;
  const open = sections.groupOpen(id, keys);
  const bodyId = `group-${sections.node.id}-${id}`;
  return <>
    <button type="button" className="toc-group" aria-expanded={open} aria-controls={bodyId} onClick={() => sections.toggleGroup(id, !open)}>{title}</button>
    <div id={bodyId} className="toc-group-body" hidden={!open}>{children}</div>
  </>;
}

const chipKey = (node: AstNode) => {
  const en = node.type === "element" ? node.children.find(child => child.type === "element" && child.attrs["data-lang"] === "en") : undefined;
  return plainText(en || node).trim();
};

function Ast({ nodes, nusach }: { nodes: AstNode[]; nusach: Nusach }): ReactNode {
  const sections = useContext(SectionsContext);
  const render = (node: AstNode, key: number): ReactNode => {
    if (node.type === "text") return node.value;
    const classes = (node.attrs.class || "").split(/\s+/);
    if (classes.includes("rite") && !classes.includes(nusach[0])) return null;
    const props: Record<string, unknown> = { key };
    if (node.attrs.class) props.className = node.attrs.class;
    if (node.attrs["data-lang"]) props["data-lang"] = node.attrs["data-lang"];
    if (node.attrs.lang) props.lang = node.attrs.lang;
    if (node.attrs.dir) props.dir = node.attrs.dir;
    const children: ReactNode = node.children.map(render);
    if (sections && node.tag === "li") {
      // A breakdown chip: its toggle, then its section's text in place.
      const entryKey = chipKey(node);
      if (!sections.entry(entryKey)) return createElement(node.tag, props, children);
      return createElement("li", { ...props, className: [node.attrs.class, "toc-entry"].filter(Boolean).join(" ") }, <EntryToggle entryKey={entryKey}>{children}</EntryToggle>, <EntryText entryKey={entryKey} />);
    }
    if (sections && classes.includes("nested")) {
      // A group of chips (e.g. the Shema's paragraphs) under a title that opens it.
      const title = node.children.find(child => child.type === "element" && (child.attrs.class || "").split(/\s+/).includes("nested-title"));
      const rest = node.children.filter(child => child !== title);
      const keys: string[] = [];
      const collect = (n: AstNode) => { if (n.type !== "element") return; if (n.tag === "li") keys.push(chipKey(n)); else n.children.forEach(collect); };
      rest.forEach(collect);
      return createElement("div", props, <GroupToggle id={slugOf(title ? chipKey(title) : "group")} keys={keys} title={title ? render(title, 0) : null}>{rest.map((child, i) => render(child, i + 1))}</GroupToggle>);
    }
    return createElement(node.tag, props, children);
  };
  return <>{nodes.map(render)}</>;
}

function PeopleIcon() {
  return <svg className="communal-mark" aria-hidden="true" viewBox="0 0 16 16"><path fill="currentColor" d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-5.784 6A2.24 2.24 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.3 6.3 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1zM4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5" /></svg>;
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
function Blessing({ n, entryKey, value, repetition, overlay }: { n: number; entryKey: string; value: readonly [string, string]; repetition: boolean; overlay?: ReactNode }) {
  const sections = useContext(SectionsContext);
  return <div className={sections?.entry(entryKey) ? "blessing toc-entry" : "blessing"}><EntryToggle entryKey={entryKey}><LocalizedText value={{ en: n ? `${n}. ${value[0]}` : value[0], he: n ? `${n}. ${value[1]}` : value[1] }} /></EntryToggle>{overlay}{repetition && <span className="amen"><LocalizedText value={{ en: "Amen response", he: "עניית אמן" }} /></span>}<EntryText entryKey={entryKey} /></div>;
}

/** A note on a blessing. It opens text of its own only when it has its own section (the priestly blessing). */
function Overlay({ value, entryKey }: { value: Localized; entryKey?: string }) {
  if (!entryKey) return <span className="overlay"><LocalizedText value={value} /></span>;
  return <span className="overlay toc-entry"><EntryToggle entryKey={entryKey}><LocalizedText value={value} /></EntryToggle><EntryText entryKey={entryKey} /></span>;
}

function AmidahGroup({ en, he, keys, children }: { en: string; he: string; keys: string[]; children: ReactNode }) {
  const sections = useContext(SectionsContext);
  if (!sections) return <details className="amidah-group"><summary><LocalizedText value={{ en, he }} /></summary><div className="blessings">{children}</div></details>;
  return <div className="amidah-group"><GroupToggle id={slugOf(en)} keys={keys} title={<LocalizedText value={{ en, he }} />}><div className="blessings">{children}</div></GroupToggle></div>;
}

const kedushah = <Overlay value={{ en: "Kedushah · leader/congregation call-and-response", he: "קדושה · קריאה ומענה של הש״ץ והציבור" }} />;
const range = (start: number, end: number) => Array.from({ length: end - start }, (_, i) => `amidah:${start + i + 1}`);

/** Heicha Kedushah's part of a Shmoneh Esrei: the first three blessings said aloud, or the rest said silently. */
type HeichaPart = "aloud" | "silent";
const holinessOfTheName = ["Holiness of the Name — Kedushat Hashem", "קדושת השם — קדושת השם"] as const;

/** Heicha Kedushah's opening blessings, each opening its text from the leader's repetition. */
function AloudBlessings({ blessings }: { blessings: ReadonlyArray<readonly [string, string]> }) {
  return <div className="blessings">{[blessings[0], blessings[1], holinessOfTheName].map((b, i) => <Blessing key={i} n={i + 1} entryKey={`amidah:${i + 1}`} value={b} repetition={false} overlay={i === 2 ? kedushah : undefined} />)}</div>;
}

function AmidahDetails({ node, part }: { node: ContentNode; part?: HeichaPart }) {
  const repetition = node.section === "repetition" && !part;
  // Heicha Kedushah's silent part starts after the opening group of three blessings.
  const from = part === "silent" ? 1 : 0;
  if (node.detailKind === "weekday-amidah") {
    if (part === "aloud") return <div className="amidah-groups"><AloudBlessings blessings={weekdayBlessings} /></div>;
    const groups = [["Praise", "שבח", 0, 3], ["Requests", "בקשות", 3, 16], ["Thanksgiving and leave-taking", "הודאה וסיום", 16, 19]] as const;
    return <div className="amidah-groups">{groups.slice(from).map(([en, he, start, end]) => <AmidahGroup key={en} en={en} he={he} keys={[...range(start, end), ...(end === 19 && repetition ? ["amidah:kohanim"] : [])]}>{weekdayBlessings.slice(start, end).map((b, i) => {
      const n = start + i + 1;
      const overlay = repetition && n === 3 ? kedushah : repetition && n === 18 ? <><Overlay value={{ en: "Modim D’Rabbanan · parallel congregational response", he: "מודים דרבנן · מענה מקביל של הציבור" }} /><Overlay entryKey="amidah:kohanim" value={{ en: "Priestly blessing or prayer leader’s verses · community practice varies", he: "ברכת כהנים או אמירת הפסוקים בידי הש״ץ · המנהג משתנה בין קהילות" }} /></> : undefined;
      return <Blessing key={n} n={n} entryKey={`amidah:${n}`} value={b} repetition={repetition} overlay={overlay} />;
    })}</AmidahGroup>)}{repetition ? <span className="badge"><LocalizedText value={{ en: "Requires a minyan · community wording varies", he: "נדרש מניין · הנוסח משתנה בין קהילות" }} /></span> : <Blessing n={0} entryKey="amidah:conclusion" value={["Personal conclusion — Elohai Netzor and steps back", "סיום אישי — אלוהי נצור ופסיעות לאחור"]} repetition={false} />}</div>;
  }
  const middle: Record<ServiceId, Localized> = {
    maariv: { en: "Sanctity of the day — Atah Kidashta", he: "קדושת היום — אתה קידשת" },
    shacharit: { en: "Sanctity of the day — Yismach Moshe", he: "קדושת היום — ישמח משה" },
    musaf: { en: "Sanctity of the day and Shabbat’s additional offering — Tikanta Shabbat", he: "קדושת היום וקרבן מוסף של שבת — תקנת שבת" },
    mincha: { en: "Sanctity of the day — Atah Echad", he: "קדושת היום — אתה אחד" },
  };
  const blessings = [["Ancestors — Avot", "אבות — אבות"], ["Divine might — Gevurot", "גבורות — גבורות"], ["God’s holiness — Kedushat Hashem", "קדושת השם — קדושת השם"], [middle[node.variant || "shacharit"].en, middle[node.variant || "shacharit"].he], ["Restore worship — Retzeh", "עבודה — רצה"], ["Thanksgiving — Modim", "הודאה — מודים"], ["Peace blessing", "ברכת השלום"]] as const;
  if (part === "aloud") return <div className="amidah-groups"><AloudBlessings blessings={blessings} /></div>;
  const groups = [["Praise", "שבח", 0, 3], ["Sanctity of the day", "קדושת היום", 3, 4], ["Thanksgiving and peace", "הודאה ושלום", 4, 7]] as const;
  return <div className="amidah-groups">{groups.slice(from).map(([en, he, start, end]) => <AmidahGroup key={en} en={en} he={he} keys={range(start, end)}>{blessings.slice(start, end).map((b, i) => { const n = start + i + 1; return <Blessing key={n} n={n} entryKey={`amidah:${n}`} value={b} repetition={repetition} overlay={repetition && n === 3 ? kedushah : undefined} />; })}</AmidahGroup>)}{!repetition && <Blessing n={0} entryKey="amidah:conclusion" value={["Personal conclusion and steps back", "סיום אישי ופסיעות לאחור"]} repetition={false} />}</div>;
}

const languageLabels: Record<Language, string> = { en: "English", he: "עברית", both: "Both" };

function LanguagePicker() {
  const { language, setLanguage } = usePreferences();
  return <div className="picker language" role="group" aria-label="Display language">{(["en", "he", "both"] as const).map(v => <button key={v} data-language-choice={v} aria-pressed={language === v} onClick={() => setLanguage(v)}>{v === "he" ? <span lang="he">{languageLabels[v]}</span> : languageLabels[v]}</button>)}</div>;
}

function SettingsIcon() {
  return <svg className="settings-mark" aria-hidden="true" viewBox="0 0 16 16"><path fill="currentColor" d="M1 3.5h8.1a2 2 0 0 1 3.8 0H15v1.5h-2.1a2 2 0 0 1-3.8 0H1zm0 7.5h2.1a2 2 0 0 1 3.8 0H15v1.5H6.9a2 2 0 0 1-3.8 0H1z" /></svg>;
}

/** Day and service always show; language and nusach sit behind one small settings control. */
function Controls({ day, service }: { day: DayType; service: ServiceId }) {
  const navigate = useNavigate();
  const { nusach, setNusach } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const chooseDay = (next: DayType) => navigate(`/${next}/${sessionService[next]}`);
  const closeOnEscape = (event: React.KeyboardEvent) => { if (event.key === "Escape") { setSettingsOpen(false); toggleRef.current?.focus(); } };
  return <div className="controls" onKeyDown={closeOnEscape}>
    <div className="control-row">
      <div className="picker daytype" role="group" aria-label="Day type">{(["weekday", "shabbat"] as const).map(v => <button key={v} data-day-choice={v} aria-pressed={day === v} onClick={() => chooseDay(v)}><LocalizedText value={v === "weekday" ? { en: "Weekday", he: "חול" } : { en: "Shabbat", he: "שבת" }} /></button>)}</div>
      <button ref={toggleRef} type="button" className="settings-toggle" aria-expanded={settingsOpen} aria-controls="display-settings" onClick={() => setSettingsOpen(open => !open)}><SettingsIcon /><span className="settings-label"><LocalizedText value={{ en: "Language · Nusach", he: "שפה · נוסח" }} /></span></button>
    </div>
    <div id="display-settings" className="settings" hidden={!settingsOpen}>
      <LanguagePicker />
      <div className="picker nusach" role="group" aria-label="Prayer rite">{(["ashkenaz", "sefard"] as const).map(v => <button key={v} data-nusach-choice={v} aria-pressed={nusach === v} onClick={() => setNusach(v)}><LocalizedText value={{ en: `Nusach ${v === "ashkenaz" ? "Ashkenaz" : "Sefard"}`, he: `נוסח ${v === "ashkenaz" ? "אשכנז" : "ספרד"}` }} /></button>)}</div>
    </div>
    <div className={`picker service ${day}`} role="group" aria-label="Service">{valid[day].map(v => <button key={v} data-service-choice={v} aria-pressed={service === v} onClick={() => navigate(`/${day}/${v}`)}><LocalizedText value={{ en: v === "maariv" ? "Maariv" : v[0].toUpperCase() + v.slice(1), he: ({ shacharit: "שחרית", mincha: "מנחה", maariv: "ערבית", musaf: "מוסף" } as Record<ServiceId, string>)[v] }} /></button>)}</div>
  </div>;
}

/** Where each open thing goes when it closes: a member back to its movement, anything else to the map. */
type Place = Readonly<{
  map: ServiceMap;
  open: Set<string>;
  /** The open prayer's open sections, by slug, most recently opened last. */
  sections: readonly string[];
  /** The Shmoneh Esrei is shown as Heicha Kedushah rather than silent prayer and repetition. */
  heicha: boolean;
}>;
const routeFor = (map: ServiceMap, id?: string) => id ? `/${map.day}/${map.id}/${id}` : `/${map.day}/${map.id}`;

function useToggle(place: Place, id: string, domId: string, parent?: string) {
  const navigate = useNavigate();
  const open = place.open.has(id);
  return { open, toggle: () => open ? navigate(routeFor(place.map, parent), { replace: true, state: { closed: domId } }) : navigate(routeFor(place.map, id)) };
}

/**
 * Title (English and Hebrew share a line in "both" mode) plus at most one short line; an event
 * (the Torah reading) shows the sequence of its stages across the block instead.
 */
function MovementHead({ movement }: { movement: Movement }) {
  return <><MovementCopy movement={movement} />{movement.stages && <span className="stages">{movement.stages.map(stage => <span className="stage" key={stage.en}><LocalizedText value={stage} /></span>)}</span>}</>;
}

function MovementCopy({ movement }: { movement: Movement }) {
  return <span className="copy">
    <h2 className="item-title" tabIndex={-1}><LocalizedText value={movement.title} /></h2>
    {movement.blurb && <span className="blurb"><LocalizedText value={movement.blurb} /></span>}
  </span>;
}

const movementClass = (m: Movement) => ["movement", m.tone, m.peak && "peak", m.minor && "minor", m.stages && "event", m.communal && "communal"].filter(Boolean).join(" ");

/**
 * A prayer card. At the top level it stands for a whole one-card movement and shows the movement's
 * title and line; inside an open movement it is a member and shows its own title and summary.
 */
function Card({ node, place, movement, parent }: { node: ContentNode; place: Place; movement?: Movement; parent?: string }) {
  const { nusach } = usePreferences();
  const detailId = `detail-${place.map.day}-${place.map.id}-${node.id}`;
  const { open, toggle } = useToggle(place, node.id, `section-${node.id}`, parent);
  // With Sefaria text, the opened card shows the prayer itself in place of its summary.
  const reader = Boolean(node.text);
  const summary = movement ? open && !reader : !(open && reader);
  const className = movement ? `${movementClass(movement)} card` : ["card", "member", node.role, node.communal && "communal", node.classes.includes("conditional") && "conditional"].filter(Boolean).join(" ");
  return <li id={`section-${node.id}`} className={`${className}${reader ? " reader-card" : ""}`}>
    <button type="button" aria-expanded={open} aria-controls={detailId} onClick={toggle}>{node.communal && <PeopleIcon />}{movement ? <MovementHead movement={movement} /> : <span className="copy"><h3 className="item-title" tabIndex={-1}><LocalizedText value={displayTitle(node)} /></h3>{summary && <Ast nodes={node.summary} nusach={nusach} />}</span>}</button>
    <div id={detailId} className="details" hidden={!open}>{open && <>{movement && summary && <Ast nodes={node.summary} nusach={nusach} />}{reader ? <ReaderDetails node={node} place={place} /> : node.detailKind ? <AmidahDetails node={node} /> : <Ast nodes={node.details} nusach={nusach} />}</>}</div>
  </li>;
}

/**
 * An open card with text. A prayer of several sections shows only its breakdown; each entry opens
 * its own section in place, at /…/<prayer>/<section>. A prayer of one section shows its text whole.
 */
function ReaderDetails({ node, place, heicha }: { node: ContentNode; place: Place; heicha?: Readonly<{ part: HeichaPart; base: string }> }) {
  const { nusach } = usePreferences();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Record<string, boolean>>({});
  const shown = textNusach(node, nusach);
  const slugs = node.text!.slugs?.[shown];
  const toc = node.text!.toc[shown] || {};
  const hasBreakdown = node.detailKind || node.details.length > 0;
  const breakdown = (sections: Sections | null) => hasBreakdown && <nav className="card-toc" aria-label={`${node.title.en} sections`}><SectionsContext.Provider value={sections}>{node.detailKind ? <AmidahDetails node={node} part={heicha?.part} /> : <Ast nodes={node.details} nusach={nusach} />}</SectionsContext.Provider></nav>;
  if (!slugs) return <>{breakdown(null)}<PrayerReader node={node} /></>;
  // In Heicha Kedushah a prayer shows only its part of the blessings, and its sections open under the movement's route.
  const shows = (key: string) => !heicha || (heicha.part === "aloud") === heichaAloud(key);
  const entry = (key: string) => key in toc && shows(key) ? { slug: slugs[toc[key]], part: toc[key], heading: heicha?.part === "aloud" && key === "amidah:3" ? heichaKedushahHeading : undefined } : undefined;
  const own = heicha ? new Set(Object.keys(toc).flatMap(key => entry(key)?.slug ?? [])) : new Set(slugs);
  const open = place.sections.filter(slug => own.has(slug));
  const base = heicha ? heicha.base : routeFor(place.map, node.id);
  const sections: Sections = {
    node, entry,
    isOpen: slug => open.includes(slug),
    // Opening a section is a step in history; closing one goes back to the last section still open.
    toggle: slug => {
      const rest = place.sections.filter(s => s !== slug);
      if (!open.includes(slug)) navigate(`${base}/${slug}`, { state: { sections: [...rest, slug] } });
      else navigate(rest.length ? `${base}/${rest[rest.length - 1]}` : base, { replace: true, state: { sections: rest, closedSection: `${node.id}/${slug}` } });
    },
    groupOpen: (id, keys) => groups[id] ?? keys.some(key => { const e = entry(key); return e ? open.includes(e.slug) : false; }),
    toggleGroup: (id, value) => setGroups(current => ({ ...current, [id]: value })),
  };
  return <>
    {node.text!.calendar && <div className="reader"><TorahCalendar kind={node.text!.calendar} /></div>}
    {breakdown(sections)}
    {open.length > 0 && <SourceCredit node={node} />}
  </>;
}

const heichaKedushahHeading: Localized = { en: "Kedushah and Holiness of the Name", he: "קדושה וקדושת השם" };

/** The fine print under a landmark's title in the source ("after the final aliyah", "community practice"). */
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
function Landmark({ node, place, parent }: { node: ContentNode; place: Place; parent?: string }) {
  const { nusach } = usePreferences();
  const { open, toggle } = useToggle(place, node.id, `section-${node.id}`, parent);
  if (!node.text) return <li className="threshold">{node.communal && <PeopleIcon />}<Ast nodes={node.boundary} nusach={nusach} /></li>;
  const className = ["seam", node.communal && "kaddish communal", node.classes.includes("barkhu") && "barkhu"].filter(Boolean).join(" ");
  const note = landmarkNote(node);
  const detailId = `detail-${place.map.day}-${place.map.id}-${node.id}`;
  return <li id={`section-${node.id}`} className={`${className} landmark-reader`} data-open={open || undefined}>
    {node.communal && <PeopleIcon />}
    <button type="button" className="landmark-toggle" aria-expanded={open} aria-controls={detailId} onClick={toggle}><span className="landmark-title" tabIndex={-1}><LocalizedText value={node.title} /></span></button>
    <div id={detailId} className="landmark-details" hidden={!open}>{open && <>{note && <p className="seam-note">{note.type === "element" && <Ast nodes={note.children} nusach={nusach} />}</p>}<PrayerReader node={node} /></>}</div>
  </li>;
}

const heichaRoute = (place: Place, movement: Movement) => `${routeFor(place.map, movement.id)}/${HEICHA}`;

/** The usual pattern or Heicha Kedushah: a small switch at the top of a Shmoneh Esrei that offers both. */
function PatternSwitch({ movement, place }: { movement: Movement; place: Place }) {
  const navigate = useNavigate();
  const choose = (heicha: boolean) => { if (heicha !== place.heicha) navigate(heicha ? heichaRoute(place, movement) : routeFor(place.map, movement.id), { state: { switched: true } }); };
  const choices = [[false, { en: "Usual", he: "כרגיל" }], [true, { en: "When time is short", he: "כשהזמן דחוק" }]] as const;
  return <div className="picker pattern-switch" role="group" aria-label="How the Shmoneh Esrei is said">{choices.map(([heicha, label]) => <button key={String(heicha)} type="button" data-pattern-choice={heicha ? "heicha" : "usual"} aria-pressed={place.heicha === heicha} onClick={() => choose(heicha)}><LocalizedText value={label} /></button>)}</div>;
}

/** When Heicha Kedushah is used, and how; fine print, so only inside the opened movement. */
const heichaNote: Localized = {
  en: "Heicha Kedushah is for when time is short, mostly at Mincha; Maariv has no repetition to shorten. The rabbi or congregation decides. Some congregations use it routinely, though many authorities keep it for real need. Practice varies.",
  he: "הויכע קדושה נאמרת כשהזמן דחוק, בעיקר במנחה; בערבית אין חזרה לקצר. הרב או הקהל מחליטים. יש קהילות שנוהגות כך בקביעות, אף שרבים מהפוסקים מגבילים זאת לשעת הצורך. המנהג משתנה בין קהילות.",
};

/** Heicha Kedushah in place of silent prayer and repetition: the opening blessings aloud with the leader, then the rest silently. */
function HeichaBody({ movement, place }: { movement: Movement; place: Place }) {
  const { aloud, silent } = movement.heicha!;
  const base = heichaRoute(place, movement);
  const parts = [
    { node: aloud, part: "aloud", title: { en: "Aloud, with the leader", he: "בקול, עם הש״ץ" }, hint: { en: "The congregation says it along quietly or listens, and answers Kedushah.", he: "הציבור אומר עמו בלחש או מקשיב, ועונה קדושה." } },
    { node: silent, part: "silent", title: { en: "The rest, silently", he: "השאר, בלחש" }, hint: { en: "Everyone, leader included. No repetition follows.", he: "כולם, גם הש״ץ. אין חזרה אחר כך." } },
  ] as const;
  return <>
    <div className="pattern-note"><p><LocalizedText value={heichaNote} /></p><p className="pattern-source"><LocalizedText value={{ en: "Shulchan Aruch, Orach Chaim 124:2 and 232:1", he: "שולחן ערוך, אורח חיים קכ״ד ב׳ ורל״ב א׳" }} /></p></div>
    <ol className="members">{parts.map(({ node, part, title, hint }) => <li key={part} id={`section-${node.id}`} className={["card", "member", "reader-card", "heicha-part", node.role, part === "aloud" && node.communal && "communal"].filter(Boolean).join(" ")} data-heicha-part={part}>
      {part === "aloud" && node.communal && <PeopleIcon />}
      <div className="heicha-head copy"><h3 className="item-title" tabIndex={-1}><LocalizedText value={title} /></h3><span className="hint"><LocalizedText value={hint} /></span></div>
      <div className="details"><ReaderDetails node={node} place={place} heicha={{ part, base }} /></div>
    </li>)}</ol>
  </>;
}

const heichaBlurb: Localized = { en: "Kedushah aloud, then silent", he: "בקול עד הקדושה, ואחר כך בלחש" };

/** A movement of several prayers: one card at the top level that opens into its members. */
function MovementItem({ movement, place }: { movement: Movement; place: Place }) {
  const { open, toggle } = useToggle(place, movement.id, `movement-${movement.id}`);
  const detailId = `movement-detail-${place.map.day}-${place.map.id}-${movement.id}`;
  const heicha = Boolean(movement.heicha && place.heicha);
  return <li id={`movement-${movement.id}`} className={movementClass(movement)} data-open={open || undefined}>
    <button type="button" aria-expanded={open} aria-controls={detailId} onClick={toggle}>{movement.communal && <PeopleIcon />}<MovementHead movement={heicha ? { ...movement, blurb: heichaBlurb } : movement} /></button>
    <div id={detailId} className="movement-body" hidden={!open}>{open && <>
      {movement.heicha && <PatternSwitch movement={movement} place={place} />}
      {heicha ? <HeichaBody movement={movement} place={place} /> : <ol className="members">{movement.members.map(node => node.kind === "card"
        ? <Card key={node.id} node={node} place={place} parent={movement.id} />
        : <Landmark key={node.id} node={node} place={place} parent={movement.id} />)}</ol>}
    </>}</div>
  </li>;
}

function ServiceView() {
  const { day, service, section, part, sub } = useParams();
  const navigationType = useNavigationType();
  const location = useLocation();
  const parsedDay = day as DayType;
  const parsedService = service as ServiceId;
  const map = corpus.services.find(s => s.day === parsedDay && s.id === parsedService);
  const layout = map ? layoutFor(map) : undefined;
  const target = layout && section ? layout.resolve(section) : undefined;
  // A Shmoneh Esrei shown as Heicha Kedushah: /day/service/<movement>/heicha-kedushah[/<section>].
  const heicha = target?.movement && !target.node && part === HEICHA ? target.movement.heicha : undefined;
  // A section of a prayer: valid if the prayer has that section in either nusach.
  const slugs = target?.node?.text?.slugs;
  const validPart = heicha ? !sub || heicha.slugs.has(sub) : !sub && (!part || Boolean(slugs && (slugs.ashkenaz?.includes(part) || slugs.sefard?.includes(part))));
  const validPath = map && (!section || target) && validPart;
  const openSection = heicha ? sub : part;
  const state = location.state as { closed?: string; closedSection?: string; sections?: string[]; switched?: boolean } | null;
  useEffect(() => {
    if (!map || !validPath) return;
    sessionService[map.day] = map.id;
    document.title = `${map.title.en} — Jewish Literacy Project`;
    const closed = state?.closed;
    const initial = location.key === "default";
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let scrollTo: HTMLElement | null, focus: HTMLElement | null, block: ScrollLogicalPosition = "start";
    const entryToggle = (nodeId: string, slug: string) => document.querySelector<HTMLElement>(`#section-${CSS.escape(nodeId)} .toc-toggle[data-section="${CSS.escape(slug)}"]`);
    if (state?.closedSection) {
      // Closing a section leaves focus on its entry.
      const [nodeId, slug] = state.closedSection.split("/");
      scrollTo = focus = entryToggle(nodeId, slug);
      block = "nearest";
    } else if (part && target?.node) {
      // A section: a deep link brings it into view; a tap keeps the entry where it is.
      scrollTo = focus = entryToggle(target.node.id, part);
      if (!initial) block = "nearest";
    } else if (heicha && sub) {
      scrollTo = focus = document.querySelector<HTMLElement>(`#movement-${CSS.escape(target!.movement!.id)} .toc-toggle[data-section="${CSS.escape(sub)}"]`);
      if (!initial) block = "nearest";
    } else if (state?.switched && target?.movement) {
      // Switching pattern keeps the reader at the switch, with focus on the choice made.
      scrollTo = focus = document.querySelector<HTMLElement>(`#movement-${CSS.escape(target.movement.id)} .pattern-switch [aria-pressed=true]`);
      block = "nearest";
    } else if (closed) {
      // Closing keeps the reader where they were, with focus on the control they used.
      scrollTo = document.getElementById(closed);
      focus = scrollTo?.querySelector<HTMLElement>(":scope > button") || null;
      block = "nearest";
    } else if (!target) {
      scrollTo = focus = document.querySelector<HTMLElement>("#service-heading");
      block = "nearest";
    } else {
      const id = target.node && target.node.id !== target.movement?.single?.id ? `section-${target.node.id}` : target.movement?.single ? `section-${target.movement.id}` : `movement-${target.movement!.id}`;
      const item = document.getElementById(id);
      focus = item?.querySelector<HTMLElement>(":scope > button .item-title, :scope > button .landmark-title") || null;
      // A deep link to a prayer inside a movement lands on the movement, so its context shows.
      scrollTo = initial && target.movement && !target.movement.single ? document.getElementById(`movement-${target.movement.id}`) : item;
    }
    requestAnimationFrame(() => {
      if (navigationType !== "POP" || initial) scrollTo?.scrollIntoView({ block, behavior: initial || reduce ? "auto" : "smooth" });
      focus?.focus({ preventScroll: true });
    });
  }, [location.key, map, navigationType, section, part, sub, validPath]);
  if (!validPath || !map || !layout) return <NotFound />;
  // An open prayer keeps its movement open too; closing the movement closes both.
  const open = new Set<string>();
  if (target?.movement) open.add(target.movement.id);
  if (target?.node) open.add(target.node.id);
  // Open sections ride in history state, so Back and Forward restore them; the URL names the latest.
  const sections = [...(state?.sections || []).filter(s => s !== openSection), ...(openSection ? [openSection] : [])];
  const place: Place = { map, open, sections, heicha: Boolean(heicha) };
  return <main><header><h1><LocalizedText value={{ en: "Jewish Literacy Project", he: "מיזם האוריינות היהודית" }} /></h1><Link className="about-link" to="/about" state={{ from: `/${map.day}/${map.id}` }}><LocalizedText value={{ en: "About Jewish Literacy", he: "על מיזם האוריינות היהודית" }} /></Link><Controls day={map.day} service={map.id} /><h2 id="service-heading" className="service-title" tabIndex={-1}><LocalizedText value={map.title} /></h2><div className="communal-key"><PeopleIcon /><LocalizedText value={{ en: "Requires a minyan (prayer quorum)", he: "נדרש מניין (ציבור לתפילה)" }} /></div></header>
    <ol className="service-map">{layout.items.map(item => item.kind === "seam"
      ? <Landmark key={item.node.id} node={item.node} place={place} />
      : item.movement.single
        ? <Card key={item.movement.id} node={item.movement.single} place={place} movement={item.movement} />
        : <MovementItem key={item.movement.id} movement={item.movement} place={place} />)}</ol>
    <footer><LocalizedText value={{ en: "Each service moves through a few large movements. The largest are its high points: the Shema and the Shmoneh Esrei (“Amidah”), or the Shmoneh Esrei alone where there is no Shema. Community practice varies.", he: "כל תפילה עוברת בכמה חלקים גדולים. הגדולים שבהם הם שיאיה: קריאת שמע ושמונה עשרה (\"עמידה\"), או שמונה עשרה לבדה כשאין קריאת שמע. המנהג משתנה בין קהילות." }} /></footer></main>;
}

const aboutSections: Array<{ title: Localized; body: Localized }> = [
  { title: { en: "The goal", he: "המטרה" }, body: { en: "Help you enter an unfamiliar synagogue as an oriented participant: able to recognize the service, find its major movements, notice where you are, and anticipate what normally comes next.", he: "לעזור לכם להיכנס לבית כנסת שאינכם מכירים כמשתתפים בעלי התמצאות: לזהות את התפילה, למצוא את חלקיה העיקריים, להבין היכן אתם נמצאים ולצפות מה בדרך כלל בא אחר כך." } },
  { title: { en: "A visual roadmap", he: "מפת דרכים חזותית" }, body: { en: "The colored blocks are a service’s few large movements, in order, before any details. The high points are drawn largest: the Shema and its blessings, and the Shmoneh Esrei (“Amidah”), the central standing prayer. Mincha and Musaf have no Shema, so there the Shmoneh Esrei stands alone. Kaddish and Barkhu are the slim boxed joints between movements. Open a movement to see the prayers nested inside it, and open a prayer to read it. Beginnings, endings, and transitions are landmarks that help you recover your place.", he: "הגושים הצבעוניים מציגים את החלקים הגדולים של התפילה, לפי הסדר, לפני הפרטים. השיאים מצוירים הגדולים מכולם: קריאת שמע וברכותיה, ושמונה עשרה (\"עמידה\"), התפילה המרכזית בעמידה. במנחה ובמוסף אין קריאת שמע, ולכן שם שמונה עשרה עומדת לבדה. קדיש וברכו הם המפרקים הצרים והממוסגרים שבין החלקים. פתחו חלק כדי לראות את התפילות שבתוכו, ופתחו תפילה כדי לקרוא אותה. התחלות, סיומים ומעברים הם ציוני דרך שעוזרים למצוא מחדש את המקום." } },
  { title: { en: "Differences are expected", he: "השוני צפוי" }, body: { en: "Synagogues vary by nusach, community, calendar date, minyan, denomination, language, and local custom. The maps teach transferable landmarks, not one supposedly universal service. If the room differs, use the nearest familiar landmark, follow or listen, and ask which part of the service is happening.", he: "בתי כנסת שונים זה מזה לפי נוסח, קהילה, תאריך בלוח, מניין, זרם, שפה ומנהג מקומי. המפות מלמדות ציוני דרך שאפשר להעביר ממקום למקום, ולא תפילה אחת שמתיימרת להיות כלל־עולמית. אם הסדר במקום שונה, חפשו את ציון הדרך המוכר הקרוב, עקבו או הקשיבו, ושאלו באיזה חלק של התפילה נמצאים." } },
  { title: { en: "What this is not", he: "מה המיזם אינו" }, body: { en: "This is not a complete siddur, a test of Jewishness, a substitute for local guidance, or a promise that every synagogue works the same way. You do not need Hebrew fluency or perfect choreography to become more oriented.", he: "זה אינו סידור מלא, מבחן ליהדות, תחליף להדרכה מקומית או הבטחה שכל בתי הכנסת פועלים באותה דרך. אין צורך בשליטה בעברית או בתנועות מושלמות כדי להתמצא טוב יותר." } },
];

function About() {
  const location = useLocation();
  const back = (location.state as { from?: string } | null)?.from || "/weekday/shacharit";
  useEffect(() => { document.title = "About Jewish Literacy"; document.querySelector<HTMLElement>("#about-heading")?.focus(); }, []);
  return <main className="about"><nav><Link to={back}><LocalizedText value={{ en: "← Service map", he: "מפת התפילה ←" }} /></Link><LanguagePicker /></nav><article className="copy"><h1 id="about-heading" tabIndex={-1}><LocalizedText value={{ en: "About Jewish Literacy", he: "על מיזם האוריינות היהודית" }} /></h1><p className="lead"><LocalizedText value={{ en: "Jewish Literacy is for people who grew up Jewish but learned little, or whose prayer experience looked nothing like a traditional synagogue service.", he: "מיזם האוריינות היהודית מיועד למי שגדלו כיהודים אך למדו מעט, או שחוויית התפילה שלהם לא דמתה כלל לתפילה מסורתית בבית הכנסת." }} /></p>{aboutSections.map(section => <section className="about-section" key={section.title.en}><h2><LocalizedText value={section.title} /></h2><p><LocalizedText value={section.body} /></p></section>)}</article><footer><LocalizedText value={{ en: "Learn the structure. Notice the transitions. Stay oriented when the details differ.", he: "למדו את המבנה. שימו לב למעברים. שמרו על התמצאות גם כשהפרטים שונים." }} /></footer></main>;
}

function NotFound() {
  useEffect(() => { document.title = "Page not found — Jewish Literacy Project"; }, []);
  return <main className="not-found"><h1 tabIndex={-1}><LocalizedText value={{ en: "Page not found", he: "הדף לא נמצא" }} /></h1><p><LocalizedText value={{ en: "That Jewish Literacy view does not exist.", he: "העמוד המבוקש אינו קיים במיזם האוריינות היהודית." }} /></p><Link to="/weekday/shacharit"><LocalizedText value={{ en: "Go to Weekday Shacharit", he: "מעבר לשחרית של חול" }} /></Link></main>;
}

export function App() {
  return <Routes><Route path="/" element={<Navigate replace to="/weekday/shacharit" />} /><Route path="/about" element={<About />} /><Route path="/:day/:service" element={<ServiceView />} /><Route path="/:day/:service/:section" element={<ServiceView />} /><Route path="/:day/:service/:section/:part" element={<ServiceView />} /><Route path="/:day/:service/:section/:part/:sub" element={<ServiceView />} /><Route path="*" element={<NotFound />} /></Routes>;
}

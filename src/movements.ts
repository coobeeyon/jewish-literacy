import type { ContentNode, DayType, Localized, ServiceId, ServiceMap } from "./types";

/**
 * The top level of every service map: a handful of movements, with Kaddish and Barkhu as seams
 * between them. This file is the only place the grouping lives.
 *
 * A plan lists, in service order, every node of its map exactly once: a string is a seam that
 * stands between movements; an object is a movement and lists its member nodes (prayer cards,
 * plus any Kaddish or threshold that falls inside it). A movement with one member is that card
 * itself, so its route is the card's route; a movement with several members gets its own id
 * and route (/day/service/<id>).
 */
type MovementSpec = {
  id?: string;
  title?: Localized;
  /** At most one short line; omit it when it would only repeat the title. */
  blurb?: Localized;
  /** A high point of the service: the Shmoneh Esrei, and in Shacharit and Maariv the Shema too. */
  peak?: true;
  /**
   * An event rather than a prayer (the Torah reading): drawn as its own kind of block, showing the
   * sequence of what happens in place of a line of description.
   */
  stages?: Localized[];
  /** A brief or occasional movement, drawn smaller than the main ones. */
  minor?: true;
  members: string[];
};
type PlanEntry = string | MovementSpec;

const L = (en: string, he: string): Localized => ({ en, he });
// Mike's usage: "Shmoneh Esrei", with "Amidah" in quotes, on weekdays and Shabbat alike. The route slug stays "amidah".
const amidah = (blurb: Localized, members: string[], title = L("Shmoneh Esrei (“Amidah”)", "שמונה עשרה (\"עמידה\")")): MovementSpec => ({ id: "amidah", title, blurb, peak: true, members });
const silentThenAloud = L("Silent, then repeated aloud", "בלחש, ואחר כך בקול");
// The Shema is the other pillar of Shacharit and Maariv: drawn with the same peak stature as the Shmoneh Esrei.
const shema = (member: string): MovementSpec => ({ title: L("Shema and its blessings", "קריאת שמע וברכותיה"), blurb: L("“Hear, O Israel”", "״שמע ישראל״"), peak: true, members: [member] });
const morningBlessings = (member: string): MovementSpec => ({ title: L("Morning blessings", "ברכות השחר"), blurb: L("Waking, gratitude, and study", "התעוררות, הודיה ולימוד"), members: [member] });
const closing = (blurb: Localized, members: string[]): MovementSpec => ({ id: "closing", title: L("Closing", "סיום התפילה"), blurb, members });
const aleinuOnly = (member: string) => closing(L("Aleinu", "עלינו"), [member]);
const finishes = "the-congregation-finishes-its-silent-prayer";
const takeOut = L("Take out", "הוצאה");
const threeAliyot = L("Three aliyot", "שלוש עליות");
const halfKaddish = L("Half Kaddish", "חצי קדיש");
const raiseAndReturn = L("Raise and return", "הגבהה והחזרה");

export const plans: Partial<Record<`${DayType}/${ServiceId}`, PlanEntry[]>> = {
  "weekday/shacharit": [
    morningBlessings("opening-blessings"),
    "rabbis-kaddish",
    { title: L("Pesukei D’Zimra", "פסוקי דזמרה"), blurb: L("Psalms of praise", "מזמורי שבח"), members: ["pesukei-dzimra"] },
    "half-kaddish",
    "barkhu-call-to-prayer",
    shema("shema-and-its-blessings"),
    amidah(silentThenAloud, ["silent-shemoneh-esrei", finishes, "chazzans-repetition"]),
    { blurb: L("Supplication", "תחינה ובקשת רחמים"), minor: true, members: ["tachanun"] },
    "half-kaddish-2",
    { id: "torah", title: L("Torah reading", "קריאת התורה"), stages: [takeOut, threeAliyot, halfKaddish, raiseAndReturn], members: ["torah-reading", "half-kaddish-3", "raise-and-return-the-torah"] },
    closing(L("Ashrei, Uva L’Tzion, Aleinu", "אשרי, ובא לציון, עלינו"), ["ashrei-and-uva-ltzion", "full-kaddish-titkabel", "aleinu-and-closing-psalms"]),
    "mourners-or-rabbis-kaddish",
  ],
  "weekday/mincha": [
    { blurb: L("Psalm 145 opens the service", "תהילים קמ״ה פותח את התפילה"), members: ["ashrei"] },
    "half-kaddish",
    amidah(silentThenAloud, ["silent-shemoneh-esrei", finishes, "chazzans-repetition"]),
    { blurb: L("Supplication", "תחינה ובקשת רחמים"), minor: true, members: ["tachanun"] },
    "full-kaddish-titkabel",
    aleinuOnly("aleinu"),
    "mourners-kaddish",
  ],
  "weekday/maariv": [
    { title: L("Opening", "פתיחה"), blurb: L("Vehu Rachum", "והוא רחום"), members: ["opening-maariv"] },
    "barkhu-call-to-prayer",
    shema("evening-shema-and-its-blessings"),
    "half-kaddish",
    amidah(L("Said silently", "בלחש"), ["silent-shemoneh-esrei"]),
    "full-kaddish-titkabel",
    aleinuOnly("concluding-prayers"),
    "mourners-kaddish",
  ],
  "shabbat/maariv": [
    { blurb: L("Psalms and Lekha Dodi", "מזמורים ולכה דודי"), members: ["kabbalat-shabbat"] },
    "kaddish-after-kabbalat-shabbat",
    "barkhu-call-to-prayer",
    shema("evening-shema-and-its-blessings"),
    "half-kaddish",
    amidah(L("Silent, then Me’ein Sheva aloud", "בלחש, ואחר כך מעין שבע בקול"), ["silent-shabbat-amidah", "vayechulu", "meein-sheva"]),
    "full-kaddish",
    aleinuOnly("aleinu"),
    "mourners-kaddish",
  ],
  "shabbat/shacharit": [
    morningBlessings("opening-blessings"),
    "rabbis-kaddish",
    { title: L("Pesukei D’Zimra", "פסוקי דזמרה"), blurb: L("Expanded psalms of praise", "מזמורי שבח מורחבים"), members: ["shabbat-pesukei-dzimra"] },
    "half-kaddish",
    "barkhu-call-to-prayer",
    shema("morning-shema-and-its-blessings"),
    amidah(silentThenAloud, ["silent-shabbat-amidah", finishes, "chazzans-repetition"]),
    "full-kaddish",
    { stages: [takeOut, L("Seven aliyot", "שבע עליות"), halfKaddish, L("Maftir, Haftarah", "מפטיר והפטרה"), L("Return", "החזרה")], members: ["torah-service"] },
    { blurb: L("Musaf follows", "מוסף בא אחריה"), minor: true, members: ["transition-to-musaf"] },
  ],
  "shabbat/musaf": [
    "half-kaddish",
    amidah(silentThenAloud, ["silent-musaf-amidah", finishes, "chazzans-musaf-repetition"], L("Musaf Shmoneh Esrei (“Amidah”)", "שמונה עשרה של מוסף (\"עמידה\")")),
    "full-kaddish",
    closing(L("Ein Keloheinu, Aleinu", "אין כאלהינו, עלינו"), ["ein-keloheinu-and-incense-study", "rabbis-kaddish", "aleinu"]),
    "mourners-kaddish",
  ],
  "shabbat/mincha": [
    { members: ["ashrei-and-uva-ltzion"] },
    "half-kaddish",
    { title: L("Torah reading", "קריאת התורה"), stages: [takeOut, threeAliyot, raiseAndReturn], members: ["torah-service"] },
    "half-kaddish-2",
    amidah(silentThenAloud, ["silent-shabbat-amidah", finishes, "chazzans-repetition"]),
    { blurb: L("Shabbat supplication", "תחינת שבת"), minor: true, members: ["tzidkatcha"] },
    "full-kaddish",
    aleinuOnly("aleinu"),
    "mourners-kaddish",
  ],
};

export type Movement = Readonly<{
  id: string;
  title: Localized;
  blurb?: Localized;
  stages?: Localized[];
  peak: boolean;
  minor: boolean;
  /** Colour family, from the first member card's role. */
  tone: string;
  /** Every member card needs a minyan, so the movement does. */
  communal: boolean;
  members: ContentNode[];
  /** A one-card movement is that card: it opens straight into the prayer. */
  single?: ContentNode;
}>;

export type TopItem = { kind: "movement"; movement: Movement } | { kind: "seam"; node: ContentNode };

export type Layout = Readonly<{
  items: TopItem[];
  movements: Movement[];
  /** Resolve a route segment: a movement id, or a node id together with its movement (if any). */
  resolve: (section: string) => { movement?: Movement; node?: ContentNode } | undefined;
}>;

const layouts = new Map<ServiceMap, Layout>();

export function layoutFor(map: ServiceMap): Layout {
  const cached = layouts.get(map);
  if (cached) return cached;
  const key = `${map.day}/${map.id}` as const;
  const plan = plans[key];
  if (!plan) throw new Error(`No movement plan for ${key}`);
  const byId = new Map(map.nodes.map(n => [n.id, n]));
  const node = (id: string) => {
    const found = byId.get(id);
    if (!found) throw new Error(`${key}: plan names unknown node ${id}`);
    return found;
  };
  const items: TopItem[] = plan.map(entry => {
    if (typeof entry === "string") return { kind: "seam", node: node(entry) };
    const members = entry.members.map(node);
    const cards = members.filter(m => m.kind === "card");
    if (!cards.length) throw new Error(`${key}: a movement needs at least one prayer card`);
    const single = members.length === 1 ? members[0] : undefined;
    const id = single ? single.id : entry.id;
    if (!id) throw new Error(`${key}: a movement of several prayers needs an id`);
    return { kind: "movement", movement: {
      id, title: entry.title || displayTitle(cards[0]), blurb: entry.blurb, stages: entry.stages, peak: Boolean(entry.peak), minor: Boolean(entry.minor),
      tone: cards[0].role || "", communal: cards.every(c => c.communal), members, single,
    } };
  });
  // The plan must cover the map exactly, in order, and movement routes must not shadow prayers.
  const flat = items.flatMap(item => item.kind === "seam" ? [item.node.id] : item.movement.members.map(m => m.id));
  if (flat.join() !== map.nodes.map(n => n.id).join()) throw new Error(`${key}: plan does not list every node once, in order`);
  const movements = items.flatMap(item => item.kind === "movement" ? [item.movement] : []);
  const movementIds = new Map(movements.map(m => [m.id, m]));
  for (const m of movements) if (!m.single && byId.has(m.id)) throw new Error(`${key}: movement id ${m.id} collides with a prayer`);
  const parent = new Map(movements.flatMap(m => m.members.map(n => [n.id, m] as const)));
  const layout: Layout = {
    items, movements,
    resolve: section => {
      const movement = movementIds.get(section);
      if (movement && !movement.single) return { movement };
      const found = byId.get(section);
      if (!found || !found.routable) return undefined;
      return { movement: parent.get(found.id), node: found };
    },
  };
  layouts.set(map, layout);
  return layout;
}

/** A prayer's title as shown, in Mike's spelling ("Shmoneh Esrei"); the corpus and Sefaria text keep theirs. */
export const displayTitle = (node: ContentNode): Localized => ({ en: node.title.en.replace(/Shemoneh Esrei/g, "Shmoneh Esrei"), he: node.title.he });

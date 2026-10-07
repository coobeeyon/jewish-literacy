// Build time: which views exist (see src/paths.ts for how a path is built).
import corpusJson from "./corpus.generated.json";
import { HEICHA, layoutFor } from "./movements";
import { routeFor, services } from "./paths";
import type { Corpus, ServiceMap } from "./types";

export { defaultMap, routeFor, services } from "./paths";

export const corpus = corpusJson as Corpus;

/**
 * A map, a movement or prayer in it (`section`), and a section of that prayer (`part`). A Mincha
 * Shmoneh Esrei shown as Heicha Kedushah has part "heicha-kedushah" and its open section in `sub`.
 */
export type MapRoute = Readonly<{ map: ServiceMap; section?: string; part?: string; sub?: string }>;

/**
 * Every view the app has: each map; each movement of several prayers; each prayer and landmark;
 * and each section of a prayer of several sections, in either nusach. Anything else is not found.
 */
export function mapRoutes(): MapRoute[] {
  const out: MapRoute[] = [];
  for (const map of corpus.services) {
    if (!services[map.day]?.includes(map.id)) throw new Error(`Invalid service ${map.day}/${map.id}`);
    const layout = layoutFor(map);
    out.push({ map });
    for (const movement of layout.movements) {
      if (movement.single) continue;
      out.push({ map, section: movement.id });
      if (!movement.heicha) continue;
      out.push({ map, section: movement.id, part: HEICHA });
      for (const sub of movement.heicha.slugs) out.push({ map, section: movement.id, part: HEICHA, sub });
    }
    for (const node of map.nodes) {
      if (!node.routable) continue;
      out.push({ map, section: node.id });
      const slugs = node.text?.slugs;
      for (const part of new Set([...(slugs?.ashkenaz || []), ...(slugs?.sefard || [])])) out.push({ map, section: node.id, part });
    }
  }
  // Each route must resolve as the router resolved it: a movement, or a routable prayer and its sections.
  for (const route of out) {
    if (!route.section) continue;
    const target = layoutFor(route.map).resolve(route.section);
    if (!target || (route.part && !target.node && !(route.part === HEICHA && target.movement?.heicha))) throw new Error(`Unresolvable route ${routeFor(route.map, route.section, route.part, route.sub)}`);
  }
  return out;
}

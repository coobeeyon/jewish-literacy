// The app's paths: which services each day has, and how a view's path is built. Shared by the
// build and the browser, so it imports no data.
import type { DayType, ServiceId, ServiceMap } from "./types";

export const services: Record<DayType, ServiceId[]> = {
  weekday: ["shacharit", "mincha", "maariv"],
  shabbat: ["maariv", "shacharit", "musaf", "mincha"],
};

export const defaultMap = "/weekday/shacharit";

/** The route segment, after a Shmoneh Esrei movement's, of its Heicha Kedushah pattern. */
export const HEICHA = "heicha-kedushah";

/** A map's path, or a movement or prayer in it (`section`), or a section of that prayer (`part`). */
export const routeFor = (map: Pick<ServiceMap, "day" | "id">, ...segments: Array<string | undefined>) =>
  [`/${map.day}/${map.id}`, ...segments].filter(Boolean).join("/");

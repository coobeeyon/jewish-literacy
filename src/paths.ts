// The app's paths: which services each day has, and how a view's path is built. Shared by the
// build and the browser, so it imports no data.
import type { DayType, ServiceId, ServiceMap } from "./types";

export const services: Record<DayType, ServiceId[]> = {
  weekday: ["shacharit", "mincha", "maariv"],
  shabbat: ["maariv", "shacharit", "musaf", "mincha"],
};

export const defaultMap = "/weekday/shacharit";

/** A map's path, or a movement or prayer in it (`section`), or a section of that prayer (`part`). */
export const routeFor = (map: Pick<ServiceMap, "day" | "id">, section?: string, part?: string) =>
  [`/${map.day}/${map.id}`, section, part].filter(Boolean).join("/");

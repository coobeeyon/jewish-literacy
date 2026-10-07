# Jewish Literacy Project

Visual maps of the Jewish prayer services, for people who grew up Jewish but learned little. A static
Astro site: every view is a prebuilt page, with one small browser script for opening things in place
and switching day and service. Prayer text comes live from [Sefaria](https://www.sefaria.org).

## Build and run

```sh
npm ci
npm run build                                  # writes dist/
JL_HOST=127.0.0.1 JL_PORT=4173 node server.mjs # serves dist/ as the live site does
```

## Test

```sh
npx playwright test
```

## Checking speed

```sh
npm run perf                   # a local build (run npm run build first), served on 127.0.0.1
npm run perf -- https://…      # a deployed site
```

`npm run perf` runs Lighthouse (mobile, simulated slow 4G) on map pages and deep links to a movement,
a prayer and a section, and fails if any page goes over budget:

- First Contentful Paint over 1.2 s, or Largest Contentful Paint over 1.5 s (2.5 s for a page that
  opens on prayer text, which waits on Sefaria);
- Cumulative Layout Shift over 0.02, or Total Blocking Time over 50 ms;
- a page over 50 KB gzipped;
- any redirect on a canonical URL (such as `/weekday/maariv`).

It is not part of `npx playwright test` because it is slow and needs Sefaria to answer. Lighthouse
comes through `npx` and uses Playwright's Chromium unless `CHROME_PATH` is set.

## Site icon

The icon's source is `src/icons/alef.svg`. After editing it, run `node scripts/icons.mjs` to redraw
the PNG sizes beside it.

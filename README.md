# Jewish Literacy Project

Visual maps of the Jewish prayer services, for people who grew up Jewish but learned little. A static
Astro site: every view is a prebuilt page, with one small browser script for opening things in place
and switching day and service. Prayer text comes from [Sefaria](https://www.sefaria.org), as a
snapshot the site serves itself (see [Prayer texts](#prayer-texts)).

## Build and run

```sh
npm ci
npm run build                                  # writes dist/
JL_HOST=127.0.0.1 JL_PORT=4173 node server.mjs # serves dist/ as the live site does
```

## Prayer texts

The texts are a snapshot of Sefaria in `content/texts`, one file per prayer and nusach, holding just
the passages each map shows, with each edition's own formatting (line breaks, bold, italics, small
caps) and no other markup. The build reads only the snapshot, so it needs no network.

```sh
npm run snapshot-texts   # fetch every pinned section from Sefaria and rewrite content/texts
npm run verify-sefaria   # compare the pins and the snapshot with live Sefaria; report any drift
```

A section is taken only if Sefaria reports exactly the pinned ref, edition, license, source and
segment count (pins: `scripts/sefaria-pins.json`, from `npm run pin-sefaria` and `npm run extract`).
After re-pinning, run `npm run snapshot-texts`; the build fails if the snapshot lacks a passage a map
needs. Editions and licenses are listed in [TEXT-LICENSES.md](TEXT-LICENSES.md).

A page that opens on prayer text (a deep link to a prayer or section) has the text in its HTML. Any
other text opens from a small file per prayer (`/texts/…json`); once a page has loaded and been idle
for a second, the browser prefetches every prayer on its map, so an open shows the text at once.
`node scripts/text-timing.mjs` measures tap-to-text on a slow link and what the prefetch costs.

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

- First Contentful Paint over 1.2 s, or Largest Contentful Paint over 1.5 s;
- Cumulative Layout Shift over 0.02, or Total Blocking Time over 50 ms;
- a page over 50 KB gzipped, not counting the prayer text a deep link carries;
- any redirect on a canonical URL (such as `/weekday/maariv`).

`PATHS=/a,/b npm run perf` checks other pages. It is not part of `npx playwright test` because it is
slow. Lighthouse comes through `npx` and uses Playwright's Chromium unless `CHROME_PATH` is set.

## Site icon

The icon's source is `src/icons/alef.svg`. After editing it, run `node scripts/icons.mjs` to redraw
the PNG sizes beside it.

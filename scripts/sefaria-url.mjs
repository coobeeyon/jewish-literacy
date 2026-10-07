// The single place that turns a pinned ref + edition into Sefaria URLs. The API's default format
// keeps each edition's own markup (line breaks, small caps, bold, italics); src/format.ts renders it.
const refPath = ref => encodeURIComponent(ref.replace(/ /g, "_")).replace(/%2C/g, ",");

export const apiUrl = (ref, edition) => {
  const version = (lang, title) => `version=${encodeURIComponent(`${lang}|${title}`)}`;
  return `https://www.sefaria.org/api/v3/texts/${refPath(ref)}?${version("hebrew", edition.he)}&${version("english", edition.en)}`;
};

export const pageUrl = ref => `https://www.sefaria.org/${refPath(ref).replace(/%3A/g, ".")}`;

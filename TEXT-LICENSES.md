# Prayer text licenses

The prayer texts on this site come from [Sefaria](https://www.sefaria.org). They are a snapshot of
Sefaria's API, kept in `content/texts` and served by the site itself. `npm run snapshot-texts`
writes the snapshot, and `npm run verify-sefaria` compares it with live Sefaria. A text is taken only
if Sefaria reports exactly the edition, license and source pinned in `scripts/sefaria-pins.json`.

The Jewish Literacy Project is a non-commercial site. It charges nothing, carries no advertising,
and sells nothing.

| Edition | Used for | License reported by Sefaria | Source |
| --- | --- | --- | --- |
| The Koren Shalem Siddur (Ashkenaz), Koren Publishers Jerusalem, 2017 (on Sefaria, the book "The Koren Shalem Siddur", versions "Hebrew Edition; Koren Publishers Jerusalem, 2017" and "English Edition; Koren Publishers Jerusalem, 2017") | Every Nusach Ashkenaz prayer | CC BY-NC (Hebrew and English) | https://korenpub.co.il/collections/shalem-siddur/products/koren-shalem-siddurhardcoverstandardashkenaz |
| Metsudah Linear Siddur (Nusach Sefard, weekday), 1981; English translation by Avrohom Davis (on Sefaria, the book "Weekday Siddur Sefard Linear", versions "The Metsudah siddur: a new linear siddur with English translation by Avrohom Davis, 1981" and the same title with "[en]") | Nusach Sefard weekday prayers | CC BY (Hebrew and English) | https://www.nli.org.il/he/books/NNL_ALEPH002211687 (National Library of Israel) |
| Metsudah Linear Siddur (Nusach Sefard, Shabbat), 1981 (on Sefaria, the book "Shabbat Siddur Sefard Linear", versions "The Metsudah Siddur, Metsudah Publications, 1981 - HE" and "- EN") | Nusach Sefard Shabbat prayers | CC BY (Hebrew and English) | https://www.nli.org.il/he/books/NNL_ALEPH002211687 (National Library of Israel) |
| Tanach with Nikkud (tanach.us); The Holy Scriptures, JPS 1917 (on Sefaria, versions "Tanach with Nikkud" and "The Holy Scriptures: A New Translation (JPS 1917)") | Numbers 28:9–10, read in the Nusach Sefard Shabbat morning blessings | public domain (Hebrew and English) | http://www.tanach.us/Tanach.xml (Hebrew); http://opensiddur.org/2010/08/%D7%AA%D7%A0%D7%B4%D7%9A-the-holy-scriptures-a-new-translation-jps-1917/ (English) |

Every prayer the site shows carries a credit line naming its edition, source and license, with a
link to the prayer on Sefaria. Where the text could not be shown, there is a "Read on Sefaria" link.

## Changes made to the texts

- **Formatting.** Each edition's own line breaks, bold, italics and small caps are kept. Footnotes,
  links and every other piece of markup are removed.
- **Glitches.** A few glitches in Sefaria's copies are fixed: stray markup characters, stray footnote
  numbers, repeated "Leader:" labels, and English stage words inside Koren's Hebrew. Cross-references
  to printed page numbers are removed from instructions, and Hebrew words that Koren prints inside
  its English translation are dropped, since the Hebrew is shown above it.
- **The Name in Metsudah's English.** Metsudah transliterates the Name in an old Ashkenazi
  pronunciation. The site shows "LORD" instead, as Koren prints it, and the credit line says so.
- **Selection.** Only the passages each map shows are used, as listed in `scripts/sefaria-pins.json`.
- **Prayers omitted.** After the Shabbat morning Torah reading, some prayers Koren prints for
  particular present-day circumstances are left out. A short note in their place says that many
  congregations add prayers here for the needs of the time, and the credit line says that prayers
  are omitted. Koren's traditional prayers in that place, and all of Metsudah's, are kept.

export type Language = "en" | "he" | "both";
export type Nusach = "ashkenaz" | "sefard";
export type DayType = "weekday" | "shabbat";
export type ServiceId = "shacharit" | "mincha" | "maariv" | "musaf";
export type Localized = Readonly<{ en: string; he: string }>;

export type AstNode =
  | { type: "text"; value: string }
  | { type: "element"; tag: string; attrs: Record<string, string>; children: AstNode[] };

export type ContentNode = Readonly<{
  id: string;
  kind: "card" | "boundary" | "transition";
  title: Localized;
  role?: string;
  classes: string[];
  communal: boolean;
  routable: boolean;
  weight?: Readonly<{ ashkenaz: number; sefard: number }>;
  section?: "silent" | "repetition";
  variant?: ServiceId;
  summary: AstNode[];
  details: AstNode[];
  detailKind?: "weekday-amidah" | "shabbat-amidah";
  boundary: AstNode[];
  text?: NodeText;
}>;

export type CalendarKind = "weekday" | "shabbat" | "mincha";
export type NodeText = Readonly<{
  ashkenaz: string;
  sefard?: string;
  calendar?: CalendarKind;
  links: Readonly<{ ashkenaz: string; sefard?: string }>;
  /** Breakdown entry (chip English text or "amidah:N") → index of the text part it links to. */
  toc: Readonly<{ ashkenaz: Readonly<Record<string, number>>; sefard?: Readonly<Record<string, number>> }>;
  /** Prayers of several sections: each part's route slug (from its heading), by part index. */
  slugs?: Readonly<{ ashkenaz?: readonly string[]; sefard?: readonly string[] }>;
}>;

export type ServiceMap = Readonly<{
  day: DayType;
  id: ServiceId;
  title: Localized;
  nodes: ContentNode[];
}>;

export type EditionPin = Readonly<{
  title: string;
  license: string;
  source: string;
  direction: "ltr" | "rtl";
  language: "en" | "he";
}>;

export type Edition = Readonly<{
  id: string;
  layout: "block" | "linear";
  cite: Localized;
  sourceLabel: Localized;
  he: EditionPin;
  en: EditionPin;
}>;

export type TextSection = Readonly<{
  ref: string;
  edition: string;
  url: string;
  count: Readonly<{ he: number; en: number }>;
  /** Comma-separated "from-to kind" runs; kind t=both texts, h=Hebrew only, r/rh/re=rubric. */
  items: string;
  /** A note of ours shown after the section, in place of prayers left out. */
  note?: Localized;
  /** The section leaves out prayers the edition prints there; the credit line says so. */
  omits?: boolean;
}>;

export type TextPart = Readonly<{
  heading?: Localized;
  sections: ReadonlyArray<TextSection>;
}>;

export type TextSource = Readonly<{
  id: string;
  nusach: Nusach;
  parts: ReadonlyArray<TextPart>;
  fallbackUrl: string;
}>;

export type Corpus = Readonly<{
  services: ServiceMap[];
  editions: Record<string, Edition>;
}>;

export type TextSources = Record<string, TextSource>;

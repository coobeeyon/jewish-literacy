import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Language, Nusach } from "./types";

const LANGUAGE_KEY = "weekday-shacharit-language";
const NUSACH_KEY = "weekday-shacharit-nusach";

const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: string) => {
  try { localStorage.setItem(key, value); } catch { /* storage is optional */ }
};

type Preferences = {
  language: Language;
  setLanguage: (value: Language) => void;
  nusach: Nusach;
  setNusach: (value: Nusach) => void;
};

const Context = createContext<Preferences | null>(null);

export function PreferenceProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => read(LANGUAGE_KEY, ["en", "he", "both"], "both"));
  const [nusach, setNusachState] = useState<Nusach>(() => read(NUSACH_KEY, ["ashkenaz", "sefard"], "ashkenaz"));
  const setLanguage = (value: Language) => { setLanguageState(value); write(LANGUAGE_KEY, value); };
  const setNusach = (value: Nusach) => { setNusachState(value); write(NUSACH_KEY, value); };
  useEffect(() => {
    document.documentElement.lang = language === "he" ? "he" : "en";
    document.documentElement.dir = "ltr";
    document.body.dataset.language = language;
    document.body.dataset.nusach = nusach;
  }, [language, nusach]);
  const value = useMemo(() => ({ language, setLanguage, nusach, setNusach }), [language, nusach]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("PreferenceProvider missing");
  return value;
}

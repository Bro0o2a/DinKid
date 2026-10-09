"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AR } from "./ar";

// The app is written in English; `t` swaps in the Arabic text when Arabic is chosen.
// English is the default. The choice is kept on each phone.

export type Lang = "ar" | "en";

type I18n = {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
  t: (text: string, vars?: Record<string, string | number>) => string;
};

const KEY = "dinkin:lang";

function translate(lang: Lang, text: string, vars?: Record<string, string | number>) {
  let out = lang === "ar" ? (AR[text] ?? text) : text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

const Context = createContext<I18n>({
  lang: "en",
  locale: "en-GB",
  setLang: () => {},
  t: (text, vars) => translate("en", text, vars),
});

function apply(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    let saved: Lang = "en";
    try {
      if (localStorage.getItem(KEY) === "ar") saved = "ar";
    } catch {}
    setLangState(saved);
    apply(saved);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    apply(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  }, []);

  const t = useCallback((text: string, vars?: Record<string, string | number>) => translate(lang, text, vars), [lang]);
  // Latin digits read more naturally for times and dates in Lebanon.
  const locale = lang === "ar" ? "ar-LB-u-nu-latn" : "en-GB";

  return <Context.Provider value={{ lang, locale, setLang, t }}>{children}</Context.Provider>;
}

export const useT = () => useContext(Context);

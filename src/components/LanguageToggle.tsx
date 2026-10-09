"use client";

import { Languages } from "lucide-react";
import { useT } from "@/lib/i18n";

// Switches between Arabic and English on this phone.
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <button
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
      className={`btn-ghost gap-1.5 text-sm font-semibold ${className}`}
      aria-label={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
    >
      <Languages size={18} /> {lang === "ar" ? "English" : "عربي"}
    </button>
  );
}

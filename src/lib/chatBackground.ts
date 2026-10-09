"use client";

import { useEffect, useState } from "react";

// Each person picks their own chat background; it is kept on their device only.
const KEY = "dinkin:chatBackground";
const EVENT = "dinkin:chatBackground";

export const PRESETS: Record<string, { label: string; css: string }> = {
  none: { label: "Plain", css: "" },
  mint: { label: "Mint", css: "linear-gradient(160deg, #d1fae5 0%, #ccfbf1 50%, #e0f2fe 100%)" },
  sunset: { label: "Sunset", css: "linear-gradient(160deg, #fde68a 0%, #fecaca 55%, #fbcfe8 100%)" },
  lavender: { label: "Lavender", css: "linear-gradient(160deg, #ede9fe 0%, #e0e7ff 50%, #fae8ff 100%)" },
  night: { label: "Night", css: "linear-gradient(160deg, #0f172a 0%, #134e4a 100%)" },
  dots: {
    label: "Dots",
    css: "radial-gradient(circle, rgba(15,118,110,0.18) 1.5px, transparent 1.6px) 0 0 / 18px 18px, #f0fdfa",
  },
};

export function readBackground(): string {
  try {
    return localStorage.getItem(KEY) ?? "none";
  } catch {
    return "none";
  }
}

export function saveBackground(value: string) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    alert("This photo is too big to keep on this phone. Try another one.");
    return;
  }
  window.dispatchEvent(new Event(EVENT));
}

// CSS `background` for a preset id or a photo (data: URL).
export function backgroundCss(value: string) {
  if (value.startsWith("data:")) return `center / cover no-repeat url("${value}")`;
  return PRESETS[value]?.css ?? "";
}

export function useChatBackground() {
  const [value, setValue] = useState("none");
  useEffect(() => {
    const update = () => setValue(readBackground());
    update();
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, []);
  return value;
}

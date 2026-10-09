"use client";

import { Check, ImagePlus } from "lucide-react";
import { useRef } from "react";
import { backgroundCss, PRESETS, saveBackground, useChatBackground } from "@/lib/chatBackground";
import { resizedJpeg } from "@/lib/image";

export function ChatBackgroundPicker() {
  const current = useChatBackground();
  const input = useRef<HTMLInputElement>(null);

  async function choosePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const blob = await resizedJpeg(file, 1080, 0.7);
    const reader = new FileReader();
    reader.onload = () => saveBackground(reader.result as string);
    reader.readAsDataURL(blob);
  }

  const swatch = "relative size-14 rounded-xl border border-border overflow-hidden shrink-0";
  return (
    <section className="card p-4 space-y-3">
      <div>
        <h2 className="font-semibold">Chat background</h2>
        <p className="text-sm text-muted">Only you see it, on this phone.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => input.current?.click()} className={`${swatch} flex items-center justify-center text-brand bg-brand-soft`} aria-label="Choose a photo">
          {current.startsWith("data:") ? (
            <span className="absolute inset-0" style={{ background: backgroundCss(current) }}>
              <Check size={20} className="absolute inset-0 m-auto text-white drop-shadow" />
            </span>
          ) : (
            <ImagePlus size={20} />
          )}
        </button>
        {Object.entries(PRESETS).map(([id, p]) => (
          <button
            key={id}
            onClick={() => saveBackground(id)}
            className={`${swatch} ${current === id ? "ring-2 ring-brand ring-offset-2 ring-offset-surface" : ""}`}
            style={{ background: p.css || "var(--background)" }}
            aria-label={p.label}
            title={p.label}
          >
            {current === id && <Check size={18} className="absolute inset-0 m-auto text-brand" />}
          </button>
        ))}
        <input ref={input} type="file" accept="image/*" onChange={choosePhoto} className="hidden" />
      </div>
    </section>
  );
}

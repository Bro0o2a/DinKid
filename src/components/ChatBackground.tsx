"use client";

import { Check, ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { backgroundCss, PRESETS, saveBackground, useChatBackground } from "@/lib/chatBackground";
import { resizedJpeg } from "@/lib/image";
import { PhotoEditor } from "./PhotoEditor";
import { useT } from "@/lib/i18n";

export function ChatBackgroundPicker() {
  const current = useChatBackground();
  const input = useRef<HTMLInputElement>(null);
  const { t } = useT();

  const [editing, setEditing] = useState<File | null>(null);

  function choosePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setEditing(file);
  }

  async function save(photo: Blob) {
    setEditing(null);
    const blob = await resizedJpeg(photo, 1080, 0.7);
    const reader = new FileReader();
    reader.onload = () => saveBackground(reader.result as string);
    reader.readAsDataURL(blob);
  }

  const swatch = "relative size-14 rounded-xl border border-border overflow-hidden shrink-0";
  return (
    <section className="card p-4 space-y-3">
      {editing && <PhotoEditor file={editing} onCancel={() => setEditing(null)} onDone={save} />}
      <div>
        <h2 className="font-semibold">{t("Chat background")}</h2>
        <p className="text-sm text-muted">{t("Only you see it, on this phone.")}</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button onClick={() => input.current?.click()} className={`${swatch} flex items-center justify-center text-brand bg-brand-soft`} aria-label={t("Choose a photo")}>
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
            aria-label={t(p.label)}
            title={t(p.label)}
          >
            {current === id && <Check size={18} className="absolute inset-0 m-auto text-brand" />}
          </button>
        ))}
        <input ref={input} type="file" accept="image/*" onChange={choosePhoto} className="hidden" />
      </div>
    </section>
  );
}

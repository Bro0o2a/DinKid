"use client";

import { ImagePlus, MessageCircle, SendHorizontal, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { backgroundCss, useChatBackground } from "@/lib/chatBackground";
import { resizedJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import type { Message, Profile } from "@/lib/types";
import { useRealtime } from "@/lib/useFamily";
import { Avatar } from "./Avatar";
import { NotificationBanner } from "./Notifications";
import { PhotoEditor } from "./PhotoEditor";

type Props = { familyId: string; userId: string; profiles: Record<string, Profile> };

type Change = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Message; old: Partial<Message> };

export function Chat({ familyId, userId, profiles }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ file: Blob; preview: string } | null>(null);
  const [editing, setEditing] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const background = useChatBackground();

  useEffect(() => {
    supabase
      .from("messages")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setMessages((data ?? []).reverse()));
  }, [familyId]);

  const onChange = useCallback((payload: unknown) => {
    const change = payload as Change;
    if (change.eventType === "INSERT") {
      setMessages((prev) => (prev.some((m) => m.id === change.new.id) ? prev : [...prev, change.new]));
    } else if (change.eventType === "DELETE") {
      setMessages((prev) => prev.filter((m) => m.id !== change.old.id));
    }
  }, []);
  useRealtime("messages", familyId, onChange);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setEditing(file);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if ((!body && !photo) || sending) return;
    setSending(true);
    let image_path: string | undefined;
    if (photo) {
      // Chat photos are private: stored in the family's folder of the "chat" bucket.
      image_path = `${familyId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from("chat")
        .upload(image_path, await resizedJpeg(photo.file), { contentType: "image/jpeg" });
      if (error) {
        setSending(false);
        return alert(error.message);
      }
    }
    setText("");
    setPhoto(null);
    const { data, error } = await supabase
      .from("messages")
      .insert({ family_id: familyId, body, ...(image_path && { image_path }) })
      .select()
      .single();
    setSending(false);
    if (error) {
      setText(body);
      alert(error.message);
    } else if (data) {
      onChange({ eventType: "INSERT", new: data, old: {} });
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this message?")) return;
    await supabase.from("messages").delete().eq("id", id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <div className="h-full flex flex-col">
      <NotificationBanner />
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1" style={{ background: backgroundCss(background) }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center text-muted mt-16 gap-2">
            <MessageCircle size={36} strokeWidth={1.5} />
            <p>No messages yet. Say marhaba!</p>
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.user_id === userId;
          const prev = messages[i - 1];
          const firstInGroup = !prev || prev.user_id !== m.user_id || dayKey(prev) !== dayKey(m);
          const showDay = !prev || dayKey(prev) !== dayKey(m);
          const author = profiles[m.user_id];
          return (
            <div key={m.id}>
              {showDay && (
                <div className="text-center text-xs text-muted my-3">{formatDay(m.created_at)}</div>
              )}
              <div className={`flex gap-2 items-end ${mine ? "flex-row-reverse" : ""} ${firstInGroup ? "mt-3" : ""}`}>
                <div className="w-7">{!mine && firstInGroup && <Avatar profile={author} size={28} />}</div>
                <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                    {!mine && firstInGroup && (
                    <span className="text-xs text-muted mb-0.5 px-1 rounded bg-surface/70">{author?.display_name ?? "Former member"}</span>
                  )}
                  <div
                    dir="auto"
                    onDoubleClick={() => mine && remove(m.id)}
                    className={`${m.image_path ? "p-1" : "px-3 py-2"} rounded-2xl whitespace-pre-wrap break-words ${
                      mine ? "bg-brand text-white rounded-br-md" : "bg-bubble-other border border-border rounded-bl-md"
                    }`}
                  >
                    {m.image_path && <ChatPhoto path={m.image_path} onOpen={setViewing} />}
                    {m.image_path ? m.body && <span className="block px-2 pt-1">{m.body}</span> : m.body}
                    <span className={`ml-2 text-[10px] align-bottom ${mine ? "text-white/70" : "text-muted"}`}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {photo && (
        <div className="px-3 pt-3 border-t border-border bg-surface flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.preview} alt="" className="size-16 rounded-xl object-cover" />
          <p className="flex-1 text-sm text-muted">Add a caption or tap send.</p>
          <button onClick={() => setPhoto(null)} className="btn-ghost" aria-label="Remove photo">
            <X size={18} />
          </button>
        </div>
      )}

      <form onSubmit={send} className={`flex gap-2 items-end p-3 bg-surface ${photo ? "" : "border-t border-border"}`}>
        <button type="button" onClick={() => photoInput.current?.click()} className="btn-ghost px-2 py-2.5" aria-label="Send a photo">
          <ImagePlus size={22} />
        </button>
        <input ref={photoInput} type="file" accept="image/*" onChange={pickPhoto} className="hidden" />
        <textarea
          dir="auto"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
          placeholder="Write a message…"
          className="input resize-none"
        />
        <button className="btn-primary px-3" aria-label="Send" disabled={(!text.trim() && !photo) || sending}>
          <SendHorizontal size={20} />
        </button>
      </form>

      {editing && (
        <PhotoEditor
          file={editing}
          onCancel={() => setEditing(null)}
          onDone={(blob) => {
            setEditing(null);
            setPhoto({ file: blob, preview: URL.createObjectURL(blob) });
          }}
        />
      )}

      {viewing && (
        <button onClick={() => setViewing(null)} className="fixed inset-0 z-30 bg-black/90 flex items-center justify-center p-4" aria-label="Close photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing} alt="" className="max-h-full max-w-full rounded-lg" />
        </button>
      )}
    </div>
  );
}

// Signed links to private photos, kept for the visit so they load once.
const photoUrls = new Map<string, Promise<string | null>>();

function ChatPhoto({ path, onOpen }: { path: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photoUrls.has(path)) {
      photoUrls.set(
        path,
        supabase.storage.from("chat").createSignedUrl(path, 60 * 60 * 24).then(({ data }) => data?.signedUrl ?? null),
      );
    }
    let live = true;
    photoUrls.get(path)!.then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [path]);

  if (!url) return <div className="w-56 h-40 rounded-xl bg-black/10 animate-pulse" />;
  return (
    <button type="button" onClick={() => onOpen(url)} className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Photo" className="rounded-xl max-h-72 w-auto max-w-full object-cover" />
    </button>
  );
}

const dayKey = (m: Message) => new Date(m.created_at).toDateString();

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
}

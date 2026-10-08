"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Message, Profile } from "@/lib/types";
import { useRealtime } from "@/lib/useFamily";
import { Avatar } from "./Avatar";

type Props = { familyId: string; userId: string; profiles: Record<string, Profile> };

type Change = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Message; old: Partial<Message> };

export function Chat({ familyId, userId, profiles }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

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

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    const { data, error } = await supabase
      .from("messages")
      .insert({ family_id: familyId, body })
      .select()
      .single();
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
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {messages.length === 0 && (
          <p className="text-center text-muted mt-10">No messages yet. Say marhaba 👋</p>
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
                    <span className="text-xs text-muted mb-0.5 px-1">{author?.display_name ?? "Former member"}</span>
                  )}
                  <div
                    dir="auto"
                    onDoubleClick={() => mine && remove(m.id)}
                    className={`px-3 py-2 rounded-2xl whitespace-pre-wrap break-words ${
                      mine ? "bg-brand text-white rounded-br-md" : "bg-surface border border-border rounded-bl-md"
                    }`}
                  >
                    {m.body}
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

      <form onSubmit={send} className="flex gap-2 p-3 border-t border-border bg-surface">
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
        <button className="btn-primary" aria-label="Send">➤</button>
      </form>
    </div>
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

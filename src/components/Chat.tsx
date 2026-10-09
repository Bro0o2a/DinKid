"use client";

import { BarChart3, Check, CheckCheck, Copy, ImagePlus, MessageCircle, Mic, Plus, Reply, SendHorizontal, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { backgroundCss, useChatBackground } from "@/lib/chatBackground";
import { uploadChatFile, useSignedUrl } from "@/lib/chatFiles";
import { useT } from "@/lib/i18n";
import { resizedJpeg } from "@/lib/image";
import { supabase } from "@/lib/supabase";
import type { Message, Profile, Reaction, Read, Vote } from "@/lib/types";
import { useRealtime } from "@/lib/useFamily";
import { Avatar } from "./Avatar";
import { AudioPlayer } from "./chat/AudioPlayer";
import { PollCard, PollComposer } from "./chat/Poll";
import { useRecorder } from "./chat/useRecorder";
import { NotificationBanner } from "./Notifications";
import { PhotoEditor } from "./PhotoEditor";

type Props = { familyId: string; userId: string; profiles: Record<string, Profile> };

type Change<T> = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: T; old: Partial<T> };

const EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

export function Chat({ familyId, userId, profiles }: Props) {
  const { t, locale } = useT();
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [reads, setReads] = useState<Read[]>([]);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ file: Blob; preview: string } | null>(null);
  const [editing, setEditing] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const background = useChatBackground();
  const recorder = useRecorder();
  const typing = useTyping(familyId, userId);

  useEffect(() => {
    supabase
      .from("messages")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setMessages((data ?? []).reverse()));
    // These tables come with database update 6; before that they are simply empty.
    supabase.from("message_reactions").select("message_id, user_id, emoji").eq("family_id", familyId).then(({ data }) => setReactions(data ?? []));
    supabase.from("poll_votes").select("message_id, user_id, choice").eq("family_id", familyId).then(({ data }) => setVotes(data ?? []));
    supabase.from("message_reads").select("user_id, last_read_id, read_at").eq("family_id", familyId).then(({ data }) => setReads(data ?? []));
  }, [familyId]);

  const onMessage = useCallback((payload: unknown) => {
    const change = payload as Change<Message>;
    if (change.eventType === "INSERT") {
      setMessages((prev) => (prev.some((m) => m.id === change.new.id) ? prev : [...prev, change.new]));
    } else if (change.eventType === "UPDATE") {
      setMessages((prev) => prev.map((m) => (m.id === change.new.id ? change.new : m)));
    } else if (change.eventType === "DELETE") {
      setMessages((prev) => prev.filter((m) => m.id !== change.old.id));
    }
  }, []);
  useRealtime("messages", familyId, onMessage);

  const onReaction = useCallback((payload: unknown) => {
    const { eventType, new: row, old } = payload as Change<Reaction>;
    const same = (r: Reaction, o: Partial<Reaction>) => r.message_id === o.message_id && r.user_id === o.user_id && r.emoji === o.emoji;
    if (eventType === "INSERT") setReactions((prev) => (prev.some((r) => same(r, row)) ? prev : [...prev, row]));
    if (eventType === "DELETE") setReactions((prev) => prev.filter((r) => !same(r, old)));
  }, []);
  useRealtime("message_reactions", familyId, onReaction);

  const onVoteChange = useCallback((payload: unknown) => {
    const { eventType, new: row, old } = payload as Change<Vote>;
    const same = (v: Vote, o: Partial<Vote>) => v.message_id === o.message_id && v.user_id === o.user_id;
    if (eventType === "DELETE") setVotes((prev) => prev.filter((v) => !same(v, old)));
    else setVotes((prev) => [...prev.filter((v) => !same(v, row)), row]);
  }, []);
  useRealtime("poll_votes", familyId, onVoteChange);

  const onReadChange = useCallback((payload: unknown) => {
    const { eventType, new: row } = payload as Change<Read>;
    if (eventType !== "DELETE") setReads((prev) => [...prev.filter((r) => r.user_id !== row.user_id), row]);
  }, []);
  useRealtime("message_reads", familyId, onReadChange);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Tell the family how far this person has read, while the chat is on screen.
  const lastId = messages[messages.length - 1]?.id ?? 0;
  const marked = useRef(0);
  useEffect(() => {
    const mark = () => {
      if (document.visibilityState !== "visible" || !lastId || lastId <= marked.current) return;
      marked.current = lastId;
      supabase.rpc("mark_read", { fid: familyId, mid: lastId }).then(() => {});
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [familyId, lastId]);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const others = Object.keys(profiles).filter((id) => id !== userId);
  const birthdays = Object.values(profiles).filter((p) => isBirthdayToday(p.birthday));

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setEditing(file);
  }

  async function insert(fields: Partial<Message>) {
    const { data, error } = await supabase
      .from("messages")
      .insert({ family_id: familyId, body: "", ...(replyTo && { reply_to: replyTo.id }), ...fields })
      .select()
      .single();
    if (error) throw error;
    setReplyTo(null);
    onMessage({ eventType: "INSERT", new: data, old: {} });
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if ((!body && !photo) || sending) return;
    setSending(true);
    try {
      const image_path = photo ? await uploadChatFile(familyId, await resizedJpeg(photo.file), "jpg", "image/jpeg") : undefined;
      setText("");
      setPhoto(null);
      await insert({ body, ...(image_path && { image_path }) });
      typing.stop();
    } catch (err) {
      setText(body);
      alert(err instanceof Error ? err.message : String(err));
    }
    setSending(false);
  }

  async function startRecording() {
    try {
      await recorder.start();
    } catch {
      alert(t("DinKin needs the microphone to record. Allow it in your phone settings."));
    }
  }

  async function sendVoice() {
    const rec = await recorder.stop();
    if (!rec) return;
    setSending(true);
    try {
      const audio_path = await uploadChatFile(familyId, rec.blob, rec.extension, rec.type);
      await insert({ audio_path });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
    setSending(false);
  }

  async function createPoll(question: string, options: string[]) {
    setPollOpen(false);
    try {
      await insert({ poll: { question, options } });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function vote(messageId: number, choice: number | null) {
    const others = votes.filter((v) => !(v.message_id === messageId && v.user_id === userId));
    if (choice === null) {
      setVotes(others);
      await supabase.from("poll_votes").delete().eq("message_id", messageId).eq("user_id", userId);
    } else {
      setVotes([...others, { message_id: messageId, user_id: userId, choice }]);
      const { error } = await supabase.from("poll_votes").upsert({ message_id: messageId, family_id: familyId, user_id: userId, choice });
      if (error) alert(error.message);
    }
  }

  async function react(m: Message, emoji: string) {
    setSelected(null);
    const mineAlready = reactions.some((r) => r.message_id === m.id && r.user_id === userId && r.emoji === emoji);
    if (mineAlready) {
      setReactions((prev) => prev.filter((r) => !(r.message_id === m.id && r.user_id === userId && r.emoji === emoji)));
      await supabase.from("message_reactions").delete().match({ message_id: m.id, user_id: userId, emoji });
    } else {
      setReactions((prev) => [...prev, { message_id: m.id, user_id: userId, emoji }]);
      const { error } = await supabase.from("message_reactions").insert({ message_id: m.id, family_id: familyId, emoji });
      if (error) alert(error.message);
    }
  }

  async function remove(m: Message) {
    setSelected(null);
    if (!confirm(t("Delete this message?"))) return;
    await supabase.from("messages").delete().eq("id", m.id);
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
  }

  function startReply(m: Message) {
    setSelected(null);
    setReplyTo(m);
    textRef.current?.focus();
  }

  function jumpTo(id: number) {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    setTimeout(() => setFlash(null), 1200);
  }

  function summary(m: Message) {
    if (m.poll) return `🗳️ ${m.poll.question}`;
    if (m.audio_path) return `🎤 ${t("Voice message")}`;
    if (m.image_path) return m.body || `📷 ${t("Photo")}`;
    return m.body;
  }

  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const name = (id: string) => profiles[id]?.display_name ?? t("Former member");
  const myLast = [...messages].reverse().find((m) => m.user_id === userId);
  const typingNames = typing.names.map(name);

  return (
    <div className="h-full flex flex-col">
      <NotificationBanner />
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1" style={{ background: backgroundCss(background) }}>
        {birthdays.map((p) => (
          <div key={p.id} className="mx-auto mb-3 w-fit card px-4 py-2 text-sm font-semibold text-brand" dir="auto">
            🎂 {p.id === userId ? t("Happy birthday, {name}! 🎉", { name: p.display_name }) : t("Today is {name}'s birthday!", { name: p.display_name })}
          </div>
        ))}
        {messages.length === 0 && (
          <div className="flex flex-col items-center text-muted mt-16 gap-2">
            <MessageCircle size={36} strokeWidth={1.5} />
            <p>{t("No messages yet. Say marhaba!")}</p>
          </div>
        )}
        {messages.map((m, i) => {
          const mine = m.user_id === userId;
          const prev = messages[i - 1];
          const firstInGroup = !prev || prev.user_id !== m.user_id || dayKey(prev) !== dayKey(m);
          const showDay = !prev || dayKey(prev) !== dayKey(m);
          const author = profiles[m.user_id];
          const quoted = m.reply_to ? byId.get(m.reply_to) : undefined;
          const mReactions = reactions.filter((r) => r.message_id === m.id);
          const readers = mine ? reads.filter((r) => r.user_id !== userId && r.last_read_id >= m.id).map((r) => r.user_id) : [];
          const allRead = others.length > 0 && others.every((id) => readers.includes(id));
          const media = m.image_path || m.audio_path || m.poll;
          return (
            <div key={m.id} id={`msg-${m.id}`}>
              {showDay && <div className="text-center text-xs text-muted my-3">{formatDay(m.created_at, locale, t)}</div>}
              <div className={`flex gap-2 items-end ${mine ? "flex-row-reverse" : ""} ${firstInGroup ? "mt-3" : ""}`}>
                <div className="w-7">{!mine && firstInGroup && <Avatar profile={author} size={28} />}</div>
                <div className={`max-w-[78%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                  {!mine && firstInGroup && (
                    <span className="text-xs text-muted mb-0.5 px-1 rounded bg-surface/70">{name(m.user_id)}</span>
                  )}
                  <div
                    onClick={() => setSelected(m)}
                    className={`cursor-pointer ${m.image_path ? "p-1" : "px-3 py-2"} rounded-2xl whitespace-pre-wrap break-words transition ${
                      mine ? "bg-brand text-white rounded-ee-md" : "bg-bubble-other border border-border rounded-es-md"
                    } ${flash === m.id ? "ring-4 ring-gold" : ""}`}
                  >
                    {m.reply_to && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (quoted) jumpTo(quoted.id);
                        }}
                        className={`block w-full text-start rounded-lg px-2 py-1 mb-1 text-xs border-s-4 ${
                          mine ? "bg-white/15 border-white/60" : "bg-brand-soft border-brand"
                        } ${m.image_path ? "mx-0" : ""}`}
                        dir="auto"
                      >
                        <span className="font-semibold block">{quoted ? name(quoted.user_id) : ""}</span>
                        <span className="line-clamp-2 opacity-90">{quoted ? summary(quoted) : t("Message deleted")}</span>
                      </button>
                    )}
                    {m.image_path && <ChatPhoto path={m.image_path} onOpen={setViewing} />}
                    {m.audio_path && <AudioPlayer path={m.audio_path} mine={mine} />}
                    {m.poll && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <PollCard
                          message={m}
                          votes={votes.filter((v) => v.message_id === m.id)}
                          userId={userId}
                          profiles={profiles}
                          mine={mine}
                          onVote={(choice) => vote(m.id, choice)}
                        />
                      </div>
                    )}
                    {m.body && (
                      <span dir="auto" className={media ? "block px-2 pt-1" : ""}>
                        {m.body}
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-0.5 ms-2 text-[10px] align-bottom ${media && !m.body ? "px-2" : ""} ${mine ? "text-white/70" : "text-muted"}`}>
                      {time(m.created_at)}
                      {mine && (readers.length > 0 ? <CheckCheck size={14} className={allRead ? "text-gold" : ""} /> : <Check size={14} />)}
                    </span>
                  </div>
                  {mReactions.length > 0 && <ReactionChips reactions={mReactions} userId={userId} onToggle={(emoji) => react(m, emoji)} names={name} />}
                  {m.id === myLast?.id && readers.length > 0 && (
                    <p className="text-[11px] text-muted mt-0.5 px-1 rounded bg-surface/60" dir="auto">
                      {allRead && others.length > 1 ? t("Seen by everyone") : t("Seen by {names}", { names: readers.map(name).join("، ") })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {typingNames.length > 0 && (
        <div className="px-4 py-1 text-xs text-muted bg-surface border-t border-border flex items-center gap-2" dir="auto">
          <TypingDots />
          {typingNames.length === 1 ? t("{name} is typing…", { name: typingNames[0] }) : t("{names} are typing…", { names: typingNames.join("، ") })}
        </div>
      )}

      {replyTo && (
        <div className="px-3 pt-3 border-t border-border bg-surface flex items-center gap-3">
          <Reply size={18} className="text-brand shrink-0 rtl:-scale-x-100" />
          <div className="flex-1 min-w-0 border-s-4 border-brand ps-2" dir="auto">
            <p className="text-xs font-semibold text-brand">{t("Replying to {name}", { name: name(replyTo.user_id) })}</p>
            <p className="text-sm text-muted truncate">{summary(replyTo)}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="btn-ghost" aria-label={t("Cancel")}>
            <X size={18} />
          </button>
        </div>
      )}

      {photo && (
        <div className="px-3 pt-3 border-t border-border bg-surface flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.preview} alt="" className="size-16 rounded-xl object-cover" />
          <p className="flex-1 text-sm text-muted">{t("Add a caption or tap send.")}</p>
          <button onClick={() => setPhoto(null)} className="btn-ghost" aria-label={t("Remove photo")}>
            <X size={18} />
          </button>
        </div>
      )}

      {recorder.recording ? (
        <div className="flex gap-3 items-center p-3 border-t border-border bg-surface">
          <button onClick={() => recorder.stop()} className="btn-ghost hover:text-red-500" aria-label={t("Cancel")}>
            <Trash2 size={22} />
          </button>
          <div className="flex-1 flex items-center gap-2 text-sm font-semibold">
            <span className="size-2.5 rounded-full bg-red-500 animate-pulse" />
            <span dir="ltr">{Math.floor(recorder.seconds / 60)}:{String(recorder.seconds % 60).padStart(2, "0")}</span>
            <span className="text-muted font-normal">{t("Recording…")}</span>
          </div>
          <button onClick={sendVoice} className="btn-primary px-3" aria-label={t("Send")}>
            <SendHorizontal size={20} className="rtl:-scale-x-100" />
          </button>
        </div>
      ) : (
        <form onSubmit={send} className={`relative flex gap-2 items-end p-3 bg-surface ${photo || replyTo ? "" : "border-t border-border"}`}>
          <button type="button" onClick={() => setAttachOpen((o) => !o)} className={`btn-ghost px-2 py-2.5 transition ${attachOpen ? "rotate-45 text-brand" : ""}`} aria-label={t("Attach")}>
            <Plus size={24} />
          </button>
          {attachOpen && (
            <div className="absolute bottom-full start-3 mb-2 card p-1.5 flex flex-col min-w-44 shadow-lg z-10">
              <button type="button" onClick={() => { setAttachOpen(false); photoInput.current?.click(); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-background text-start">
                <ImagePlus size={20} className="text-brand" /> {t("Photo")}
              </button>
              <button type="button" onClick={() => { setAttachOpen(false); setPollOpen(true); }} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-background text-start">
                <BarChart3 size={20} className="text-brand" /> {t("Poll")}
              </button>
            </div>
          )}
          <input ref={photoInput} type="file" accept="image/*" onChange={pickPhoto} className="hidden" />
          <textarea
            ref={textRef}
            dir="auto"
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value) typing.ping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t("Write a message…")}
            className="input resize-none"
          />
          {text.trim() || photo ? (
            <button className="btn-primary px-3" aria-label={t("Send")} disabled={sending}>
              <SendHorizontal size={20} className="rtl:-scale-x-100" />
            </button>
          ) : (
            <button type="button" onClick={startRecording} className="btn-primary px-3" aria-label={t("Record a voice message")} disabled={sending}>
              <Mic size={20} />
            </button>
          )}
        </form>
      )}

      {selected && (
        <div className="fixed inset-0 z-30 bg-black/30 flex items-end justify-center" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-surface rounded-t-3xl p-4 space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="text-sm text-muted truncate px-1" dir="auto">
              <b className="text-foreground">{name(selected.user_id)}:</b> {summary(selected)}
            </p>
            <div className="flex justify-between bg-background rounded-2xl p-2">
              {EMOJIS.map((emoji) => {
                const picked = reactions.some((r) => r.message_id === selected.id && r.user_id === userId && r.emoji === emoji);
                return (
                  <button key={emoji} onClick={() => react(selected, emoji)} className={`text-2xl size-11 rounded-full transition hover:scale-110 ${picked ? "bg-brand-soft" : ""}`}>
                    {emoji}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => startReply(selected)} className="btn-secondary flex-col gap-1 py-3 text-sm">
                <Reply size={20} className="rtl:-scale-x-100" /> {t("Reply")}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(selected.poll ? selected.poll.question : selected.body);
                  setSelected(null);
                }}
                disabled={!selected.body && !selected.poll}
                className="btn-secondary flex-col gap-1 py-3 text-sm disabled:opacity-40"
              >
                <Copy size={20} /> {t("Copy")}
              </button>
              <button onClick={() => remove(selected)} disabled={selected.user_id !== userId} className="btn-secondary flex-col gap-1 py-3 text-sm text-red-600 disabled:opacity-40">
                <Trash2 size={20} /> {t("Delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pollOpen && <PollComposer onCancel={() => setPollOpen(false)} onCreate={createPoll} />}

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
        <button onClick={() => setViewing(null)} className="fixed inset-0 z-30 bg-black/90 flex items-center justify-center p-4" aria-label={t("Close photo")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing} alt="" className="max-h-full max-w-full rounded-lg" />
        </button>
      )}
    </div>
  );
}

function ReactionChips({ reactions, userId, onToggle, names }: { reactions: Reaction[]; userId: string; onToggle: (emoji: string) => void; names: (id: string) => string }) {
  const groups = new Map<string, string[]>();
  for (const r of reactions) groups.set(r.emoji, [...(groups.get(r.emoji) ?? []), r.user_id]);
  return (
    <div className="flex flex-wrap gap-1 -mt-1.5 px-2 relative">
      {[...groups].map(([emoji, users]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle(emoji)}
          title={users.map(names).join(", ")}
          className={`text-xs rounded-full border px-1.5 py-0.5 bg-surface shadow-sm ${users.includes(userId) ? "border-brand" : "border-border"}`}
        >
          {emoji}
          {users.length > 1 && <span className="ms-0.5 font-semibold">{users.length}</span>}
        </button>
      ))}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

// "… is typing" travels as a short live signal; nothing is saved.
function useTyping(familyId: string, userId: string) {
  const [active, setActive] = useState<Record<string, number>>({});
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    const ch = supabase.channel(`typing:${familyId}`);
    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      const { user, on } = payload as { user: string; on: boolean };
      if (user === userId) return;
      setActive((prev) => {
        const next = { ...prev };
        if (on) next[user] = Date.now();
        else delete next[user];
        return next;
      });
    }).subscribe();
    channel.current = ch;
    const sweep = setInterval(() => {
      setActive((prev) => {
        const fresh = Object.fromEntries(Object.entries(prev).filter(([, at]) => Date.now() - at < 4000));
        return Object.keys(fresh).length === Object.keys(prev).length ? prev : fresh;
      });
    }, 1000);
    return () => {
      clearInterval(sweep);
      channel.current = null;
      supabase.removeChannel(ch);
    };
  }, [familyId, userId]);

  return {
    names: Object.keys(active),
    ping() {
      if (Date.now() - lastSent.current < 2000) return;
      lastSent.current = Date.now();
      channel.current?.send({ type: "broadcast", event: "typing", payload: { user: userId, on: true } });
    },
    stop() {
      lastSent.current = 0;
      channel.current?.send({ type: "broadcast", event: "typing", payload: { user: userId, on: false } });
    },
  };
}

function ChatPhoto({ path, onOpen }: { path: string; onOpen: (url: string) => void }) {
  const url = useSignedUrl(path);
  if (!url) return <div className="w-56 h-40 rounded-xl bg-black/10 animate-pulse" />;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(url);
      }}
      className="block"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="rounded-xl max-h-72 w-auto max-w-full object-cover" />
    </button>
  );
}

export function isBirthdayToday(birthday?: string | null) {
  if (!birthday) return false;
  const [, m, d] = birthday.split("-").map(Number);
  const now = new Date();
  return now.getMonth() + 1 === m && now.getDate() === d;
}

const dayKey = (m: Message) => new Date(m.created_at).toDateString();

function formatDay(iso: string, locale: string, t: (s: string) => string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return t("Today");
  if (d.toDateString() === yesterday.toDateString()) return t("Yesterday");
  return d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "short" });
}

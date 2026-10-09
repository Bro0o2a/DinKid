"use client";

import { BarChart3, Check, Plus, X } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import type { Message, Profile, Vote } from "@/lib/types";
import { Avatar } from "../Avatar";

type CardProps = {
  message: Message;
  votes: Vote[];
  userId: string;
  profiles: Record<string, Profile>;
  mine: boolean;
  onVote: (choice: number | null) => void;
};

export function PollCard({ message, votes, userId, profiles, mine, onVote }: CardProps) {
  const { t } = useT();
  const poll = message.poll!;
  const myVote = votes.find((v) => v.user_id === userId)?.choice;
  const total = votes.length;

  return (
    <div className="w-64 py-1 space-y-2" dir="auto">
      <p className="font-semibold flex items-start gap-1.5">
        <BarChart3 size={18} className="shrink-0 mt-0.5" /> {poll.question}
      </p>
      <div className="space-y-1.5">
        {poll.options.map((option, i) => {
          const voters = votes.filter((v) => v.choice === i);
          const share = total ? Math.round((voters.length / total) * 100) : 0;
          const chosen = myVote === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onVote(chosen ? null : i)}
              className={`relative w-full overflow-hidden rounded-xl border text-start px-3 py-2 text-sm ${
                mine ? "border-white/30" : "border-border bg-background"
              } ${chosen ? (mine ? "ring-2 ring-white" : "ring-2 ring-brand") : ""}`}
            >
              <span
                className={`absolute inset-y-0 start-0 ${mine ? "bg-white/20" : "bg-brand-soft"} transition-all`}
                style={{ width: `${share}%` }}
              />
              <span className="relative flex items-center gap-2">
                <span className={`size-4 rounded-full border-2 shrink-0 flex items-center justify-center ${mine ? "border-white" : "border-brand"} ${chosen ? (mine ? "bg-white text-brand" : "bg-brand text-white") : ""}`}>
                  {chosen && <Check size={10} strokeWidth={4} />}
                </span>
                <span className="flex-1 min-w-0 truncate">{option}</span>
                <span className="flex -space-x-1.5 rtl:space-x-reverse">
                  {voters.slice(0, 3).map((v) => (
                    <Avatar key={v.user_id} profile={profiles[v.user_id]} size={18} />
                  ))}
                </span>
                <span className="text-xs font-semibold w-9 text-end">{share}%</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className={`text-xs ${mine ? "text-white/70" : "text-muted"}`}>
        {total === 1 ? t("1 vote") : t("{n} votes", { n: total })}
      </p>
    </div>
  );
}

export function PollComposer({ onCancel, onCreate }: { onCancel: () => void; onCreate: (q: string, options: string[]) => void }) {
  const { t } = useT();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const filled = options.map((o) => o.trim()).filter(Boolean);

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-end sm:items-center justify-center" onClick={onCancel}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim() && filled.length >= 2) onCreate(question.trim(), filled);
        }}
        className="w-full max-w-md bg-surface rounded-t-3xl sm:rounded-3xl p-5 space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{t("New poll")}</h2>
          <button type="button" onClick={onCancel} className="btn-ghost" aria-label={t("Cancel")}>
            <X size={20} />
          </button>
        </div>
        <input required dir="auto" autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("Question, e.g. Where shall we eat?")} className="input" maxLength={140} />
        {options.map((o, i) => (
          <div key={i} className="flex gap-2">
            <input
              dir="auto"
              value={o}
              onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={t("Option {n}", { n: i + 1 })}
              className="input"
              maxLength={60}
            />
            {options.length > 2 && (
              <button type="button" onClick={() => setOptions((all) => all.filter((_, j) => j !== i))} className="btn-ghost" aria-label={t("Remove")}>
                <X size={18} />
              </button>
            )}
          </div>
        ))}
        {options.length < 6 && (
          <button type="button" onClick={() => setOptions((all) => [...all, ""])} className="text-sm font-semibold text-brand inline-flex items-center gap-1">
            <Plus size={16} /> {t("Add option")}
          </button>
        )}
        <button disabled={!question.trim() || filled.length < 2} className="btn-primary w-full">
          {t("Send poll")}
        </button>
      </form>
    </div>
  );
}

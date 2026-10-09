"use client";

import { CalendarDays, Clock, ListChecks, MessageCircle, Users } from "lucide-react";
import type { Member } from "@/lib/types";
import type { Arrival, Presence } from "@/lib/useFamily";
import { Avatar } from "./Avatar";

type Props = { members: Member[]; userId: string; present: Record<string, Presence>; arrivals: Arrival[] };

const where: Record<string, { label: string; Icon: typeof MessageCircle }> = {
  chat: { label: "In the chat", Icon: MessageCircle },
  events: { label: "Looking at events", Icon: CalendarDays },
  lists: { label: "Looking at lists", Icon: ListChecks },
  online: { label: "Looking at who's online", Icon: Users },
  family: { label: "In family settings", Icon: Users },
};

export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function lastSeen(iso?: string | null) {
  if (!iso) return "Not seen yet";
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString() === d.toDateString();
  const day = today ? "today" : yesterday ? "yesterday" : d.toLocaleDateString([], { day: "numeric", month: "short" });
  return `Last seen ${day} at ${clock(iso)}`;
}

export function Online({ members, userId, present, arrivals }: Props) {
  const online = members.filter((m) => present[m.user_id]);
  const offline = members
    .filter((m) => !present[m.user_id])
    .sort((a, b) => (b.profiles.last_seen_at ?? "").localeCompare(a.profiles.last_seen_at ?? ""));
  const byId = Object.fromEntries(members.map((m) => [m.user_id, m]));

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      <section>
        <h2 className="section-title">Online now · {online.length}</h2>
        <ul className="card divide-y divide-border">
          {online.map((m) => {
            const p = present[m.user_id];
            const place = where[p.tab] ?? where.chat;
            return (
              <li key={m.user_id} className="flex items-center gap-3 p-3">
                <Avatar profile={m.profiles} size={44} online />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" dir="auto">
                    {m.profiles.display_name}
                    {m.user_id === userId && <span className="text-muted font-normal"> (you)</span>}
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                    <place.Icon size={12} /> {place.label}
                  </p>
                </div>
                <span className="text-xs text-muted text-right shrink-0">
                  Since<br />
                  <b className="text-foreground font-semibold">{clock(p.since)}</b>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {arrivals.length > 0 && (
        <section>
          <h2 className="section-title">Just arrived</h2>
          <ul className="card divide-y divide-border">
            {[...arrivals].reverse().map((a) => (
              <li key={a.userId + a.at} className="flex items-center gap-3 p-3 text-sm">
                <Clock size={16} className="text-brand shrink-0" />
                <span className="flex-1 min-w-0 truncate" dir="auto">
                  <b>{byId[a.userId]?.profiles.display_name ?? "Someone"}</b> opened DinKin
                </span>
                <span className="text-muted shrink-0">{clock(a.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {offline.length > 0 && (
        <section>
          <h2 className="section-title">Offline · {offline.length}</h2>
          <ul className="card divide-y divide-border">
            {offline.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 p-3">
                <Avatar profile={m.profiles} size={44} online={false} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate" dir="auto">{m.profiles.display_name}</p>
                  <p className="text-xs text-muted">{lastSeen(m.profiles.last_seen_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

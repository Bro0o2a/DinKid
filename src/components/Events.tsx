"use client";

import { Bell, CalendarDays, ChevronLeft, ChevronRight, MapPin, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FamilyEvent, Profile } from "@/lib/types";
import { useRealtime } from "@/lib/useFamily";

type Props = { familyId: string; profiles: Record<string, Profile> };

const REMINDERS = [
  { minutes: null, label: "No reminder" },
  { minutes: 0, label: "At the time" },
  { minutes: 15, label: "15 minutes before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 180, label: "3 hours before" },
  { minutes: 1440, label: "1 day before" },
];

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

export function Events({ familyId, profiles }: Props) {
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => new Date());
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("events").select("*").eq("family_id", familyId).order("starts_at");
    setEvents(data ?? []);
  }, [familyId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime("events", familyId, load);

  const byDay = useMemo(() => {
    const map = new Map<string, FamilyEvent[]>();
    for (const e of events) {
      const key = dayKey(new Date(e.starts_at));
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [events]);

  const dayEvents = byDay.get(dayKey(selected)) ?? [];
  const endOfSelected = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + 1).getTime();
  const comingUp = events.filter((e) => new Date(e.starts_at).getTime() >= Math.max(Date.now(), endOfSelected)).slice(0, 5);

  async function remove(id: string) {
    if (!confirm("Delete this event?")) return;
    await supabase.from("events").delete().eq("id", id);
    load();
  }

  function pick(day: Date) {
    setSelected(day);
    if (day.getMonth() !== month.getMonth()) setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <Calendar month={month} setMonth={setMonth} selected={selected} onPick={pick} byDay={byDay} />

      <div className="flex items-center justify-between">
        <h2 className="section-title mb-0">
          {sameDay(selected, new Date()) ? "Today" : selected.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
        </h2>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-sm">
          {showForm ? <><X size={16} /> Cancel</> : <><Plus size={16} /> New event</>}
        </button>
      </div>

      {showForm && (
        <EventForm
          familyId={familyId}
          day={selected}
          onDone={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {dayEvents.length === 0 && !showForm ? (
        <p className="text-sm text-muted">Nothing on this day.</p>
      ) : (
        <ul className="space-y-2">
          {dayEvents.map((e) => (
            <EventCard key={e.id} event={e} author={profiles[e.created_by]} onDelete={() => remove(e.id)} />
          ))}
        </ul>
      )}

      {comingUp.length > 0 && (
        <section>
          <h2 className="section-title">Coming up</h2>
          <ul className="space-y-2">
            {comingUp.map((e) => (
              <EventCard key={e.id} event={e} author={profiles[e.created_by]} onDelete={() => remove(e.id)} onOpen={() => pick(new Date(e.starts_at))} />
            ))}
          </ul>
        </section>
      )}

      {events.length === 0 && !showForm && (
        <div className="flex flex-col items-center text-muted py-6 gap-2">
          <CalendarDays size={36} strokeWidth={1.5} />
          <p>Nothing planned yet. Tap a day, then New event.</p>
        </div>
      )}
    </div>
  );
}

type CalendarProps = {
  month: Date;
  setMonth: (d: Date) => void;
  selected: Date;
  onPick: (d: Date) => void;
  byDay: Map<string, FamilyEvent[]>;
};

function Calendar({ month, setMonth, selected, onPick, byDay }: CalendarProps) {
  const today = new Date();
  // Weeks start on Monday.
  const offset = (month.getDay() + 6) % 7;
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - offset);
  const weeks = Math.ceil((offset + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString([], { weekday: "narrow" }));

  return (
    <section className="card p-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="btn-ghost" aria-label="Previous month">
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={() => onPick(new Date())}
          className="font-semibold"
          title="Go to today"
        >
          {month.toLocaleDateString([], { month: "long", year: "numeric" })}
        </button>
        <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="btn-ghost" aria-label="Next month">
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted mb-1">
        {weekdays.map((w, i) => <span key={i}>{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((d) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isSelected = sameDay(d, selected);
          const isToday = sameDay(d, today);
          const count = byDay.get(dayKey(d))?.length ?? 0;
          return (
            <button
              key={d.toISOString()}
              onClick={() => onPick(d)}
              className={`mx-auto size-10 rounded-full flex flex-col items-center justify-center text-sm transition ${
                isSelected
                  ? "bg-brand text-white font-semibold"
                  : isToday
                    ? "text-brand font-bold ring-2 ring-brand/40"
                    : inMonth
                      ? "hover:bg-brand-soft"
                      : "text-muted/50"
              }`}
            >
              {d.getDate()}
              <span className="flex gap-0.5 h-1.5 mt-0.5">
                {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                  <span key={i} className={`size-1.5 rounded-full ${isSelected ? "bg-white" : "bg-amber-400"}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function reminderLabel(minutes?: number | null) {
  return REMINDERS.find((r) => r.minutes === minutes)?.label ?? `${minutes} minutes before`;
}

function EventCard({ event, author, onDelete, onOpen }: { event: FamilyEvent; author?: Profile; onDelete: () => void; onOpen?: () => void }) {
  const d = new Date(event.starts_at);
  return (
    <li className="card p-3 flex gap-3">
      <button onClick={onOpen} disabled={!onOpen} className="w-14 shrink-0 rounded-xl bg-brand-soft text-brand flex flex-col items-center justify-center py-1">
        <span className="text-xs uppercase">{d.toLocaleDateString([], { month: "short" })}</span>
        <span className="text-xl font-bold leading-none">{d.getDate()}</span>
      </button>
      <div className="flex-1 min-w-0" dir="auto">
        <p className="font-semibold">{event.title}</p>
        <p className="text-sm text-muted">
          {d.toLocaleDateString([], { weekday: "long" })} · {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {event.location && <> · <MapPin size={13} className="inline -mt-0.5" /> {event.location}</>}
        </p>
        {event.notes && <p className="text-sm mt-1 whitespace-pre-wrap">{event.notes}</p>}
        <p className="text-xs text-muted mt-1 flex items-center gap-1 flex-wrap">
          {event.remind_minutes != null && (
            <span className="inline-flex items-center gap-0.5 text-brand">
              <Bell size={11} /> {reminderLabel(event.remind_minutes)} ·
            </span>
          )}
          Added by {author?.display_name ?? "someone"}
        </p>
      </div>
      <button onClick={onDelete} className="btn-ghost hover:text-red-500 self-start -m-1" aria-label="Delete event">
        <Trash2 size={16} />
      </button>
    </li>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

function EventForm({ familyId, day, onDone }: { familyId: string; day: Date; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`);
  const [time, setTime] = useState("18:00");
  const [remind, setRemind] = useState("60");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const row = {
      family_id: familyId,
      title,
      starts_at: new Date(`${date}T${time}`).toISOString(),
      location: location || null,
      notes: notes || null,
    };
    let { error } = await supabase.from("events").insert({
      ...row,
      remind_minutes: remind === "" ? null : Number(remind),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    // Before database update 5 there are no reminder columns.
    if (error?.message.includes("remind_minutes") || error?.message.includes("tz")) {
      ({ error } = await supabase.from("events").insert(row));
    }
    setBusy(false);
    if (error) alert(error.message);
    else onDone();
  }

  return (
    <form onSubmit={save} className="card p-4 space-y-3">
      <input required dir="auto" placeholder="What? e.g. Teta's birthday dinner" value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
      <div className="grid grid-cols-2 gap-2">
        <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
        <input required type="time" value={time} onChange={(e) => setTime(e.target.value)} className="input" />
      </div>
      <label className="flex items-center gap-2">
        <Bell size={18} className="text-brand shrink-0" />
        <select value={remind} onChange={(e) => setRemind(e.target.value)} className="input">
          {REMINDERS.map((r) => (
            <option key={r.label} value={r.minutes ?? ""}>
              {r.minutes === null ? r.label : `Remind everyone ${r.label.toLowerCase()}`}
            </option>
          ))}
        </select>
      </label>
      <input dir="auto" placeholder="Where? (optional)" value={location} onChange={(e) => setLocation(e.target.value)} className="input" />
      <textarea dir="auto" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="input" rows={2} />
      <button disabled={busy} className="btn-primary w-full">Save event</button>
    </form>
  );
}

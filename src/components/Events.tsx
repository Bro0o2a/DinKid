"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FamilyEvent, Profile } from "@/lib/types";
import { useRealtime } from "@/lib/useFamily";

type Props = { familyId: string; profiles: Record<string, Profile> };

export function Events({ familyId, profiles }: Props) {
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("events").select("*").eq("family_id", familyId).order("starts_at");
    setEvents(data ?? []);
  }, [familyId]);

  useEffect(() => {
    load();
  }, [load]);
  useRealtime("events", familyId, load);

  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= now - 3 * 3600000);
  const past = events.filter((e) => new Date(e.starts_at).getTime() < now - 3 * 3600000).reverse();

  async function remove(id: string) {
    if (!confirm("Delete this event?")) return;
    await supabase.from("events").delete().eq("id", id);
    load();
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title mb-0">Upcoming</h2>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-sm">
          {showForm ? "Cancel" : "+ New event"}
        </button>
      </div>

      {showForm && (
        <EventForm
          familyId={familyId}
          onDone={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {upcoming.length === 0 && !showForm && <p className="text-muted">Nothing planned yet.</p>}
      <ul className="space-y-2">
        {upcoming.map((e) => (
          <EventCard key={e.id} event={e} author={profiles[e.created_by]} onDelete={() => remove(e.id)} />
        ))}
      </ul>

      {past.length > 0 && (
        <div>
          <button onClick={() => setShowPast((s) => !s)} className="section-title hover:underline">
            {showPast ? "▾" : "▸"} Past events ({past.length})
          </button>
          {showPast && (
            <ul className="space-y-2 opacity-60">
              {past.map((e) => (
                <EventCard key={e.id} event={e} author={profiles[e.created_by]} onDelete={() => remove(e.id)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({ event, author, onDelete }: { event: FamilyEvent; author?: Profile; onDelete: () => void }) {
  const d = new Date(event.starts_at);
  return (
    <li className="card p-3 flex gap-3">
      <div className="w-14 shrink-0 rounded-xl bg-brand-soft text-brand flex flex-col items-center justify-center py-1">
        <span className="text-xs uppercase">{d.toLocaleDateString([], { month: "short" })}</span>
        <span className="text-xl font-bold leading-none">{d.getDate()}</span>
      </div>
      <div className="flex-1 min-w-0" dir="auto">
        <p className="font-semibold">{event.title}</p>
        <p className="text-sm text-muted">
          {d.toLocaleDateString([], { weekday: "long" })} ·{" "}
          {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {event.location && <> · 📍 {event.location}</>}
        </p>
        {event.notes && <p className="text-sm mt-1 whitespace-pre-wrap">{event.notes}</p>}
        <p className="text-xs text-muted mt-1">Added by {author?.display_name ?? "someone"}</p>
      </div>
      <button onClick={onDelete} className="text-muted hover:text-red-500 self-start" aria-label="Delete event">
        ✕
      </button>
    </li>
  );
}

function EventForm({ familyId, onDone }: { familyId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("events").insert({
      family_id: familyId,
      title,
      starts_at: new Date(when).toISOString(),
      location: location || null,
      notes: notes || null,
    });
    setBusy(false);
    if (error) alert(error.message);
    else onDone();
  }

  return (
    <form onSubmit={save} className="card p-4 space-y-3">
      <input required dir="auto" placeholder="What? e.g. Teta's birthday dinner" value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
      <input required type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input" />
      <input dir="auto" placeholder="Where? (optional)" value={location} onChange={(e) => setLocation(e.target.value)} className="input" />
      <textarea dir="auto" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="input" rows={2} />
      <button disabled={busy} className="btn-primary w-full">Save event</button>
    </form>
  );
}

"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { selectFamilies, supabase } from "@/lib/supabase";
import type { Family, Member, Profile } from "@/lib/types";

export function useFamily(familyId: string) {
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const members = (columns: string) =>
      supabase.from("family_members").select(columns).eq("family_id", familyId).order("joined_at");
    const [[fam], first] = await Promise.all([
      selectFamilies(familyId),
      members("user_id, role, joined_at, profiles(id, display_name, avatar_url, last_seen_at)"),
    ]);
    // Before database update 3 there is no last_seen_at column.
    const { data: mem } = first.error ? await members("user_id, role, joined_at, profiles(id, display_name, avatar_url)") : first;
    if (!fam) setNotFound(true);
    setFamily(fam ?? null);
    setMembers((mem as unknown as Member[]) ?? []);
  }, [familyId]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime("family_members", familyId, load);

  const profiles: Record<string, Profile> = Object.fromEntries(members.map((m) => [m.user_id, m.profiles]));

  return { family, members, profiles, notFound, reload: load };
}

// Calls onChange whenever a row of `table` belonging to this family changes.
export function useRealtime(table: string, familyId: string, onChange: (payload: unknown) => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`${table}:${familyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `family_id=eq.${familyId}` },
        (payload) => onChange(payload),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, familyId, onChange]);
}

export type Presence = { since: string; tab: string };
export type Arrival = { userId: string; at: string };

// Who has this family open right now (Supabase Realtime Presence), and which tab they are on.
// Also records "last seen" while the app is open.
export function usePresence(familyId: string, userId: string, tab: string) {
  const [present, setPresent] = useState<Record<string, Presence>>({});
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const since = useRef(new Date().toISOString());
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    const channel = supabase.channel(`presence:${familyId}`, { config: { presence: { key: userId } } });
    channelRef.current = channel;
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ at: string; tab: string }>();
        setPresent(
          Object.fromEntries(
            Object.entries(state).map(([id, metas]) => {
              const first = [...metas].sort((a, b) => (a.at < b.at ? -1 : 1))[0];
              return [id, { since: first.at, tab: metas[metas.length - 1].tab }];
            }),
          ),
        );
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        // Only people who just opened the app, not everyone already there when we joined.
        const at = (newPresences[0] as unknown as { at?: string })?.at;
        if (key === userId || !at || Date.now() - new Date(at).getTime() > 20_000) return;
        setArrivals((prev) => [...prev.filter((a) => a.userId !== key), { userId: key, at }]);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ at: since.current, tab: tabRef.current });
      });
    return () => {
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [familyId, userId]);

  useEffect(() => {
    channelRef.current?.track({ at: since.current, tab });
  }, [tab]);

  useEffect(() => {
    const touch = () => {
      if (document.visibilityState === "visible") supabase.rpc("touch_last_seen").then(() => {});
    };
    touch();
    const timer = setInterval(touch, 60_000);
    document.addEventListener("visibilitychange", touch);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", touch);
    };
  }, [userId]);

  const online = useMemo(() => new Set(Object.keys(present)), [present]);
  return { online, present, arrivals };
}

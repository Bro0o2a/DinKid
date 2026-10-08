"use client";

import { useCallback, useEffect, useState } from "react";
import { FAMILY_COLUMNS, supabase } from "@/lib/supabase";
import type { Family, Member, Profile } from "@/lib/types";

export function useFamily(familyId: string) {
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const members = (columns: string) =>
      supabase.from("family_members").select(columns).eq("family_id", familyId).order("joined_at");
    const [{ data: fam }, first] = await Promise.all([
      supabase.from("families").select(FAMILY_COLUMNS).eq("id", familyId).maybeSingle(),
      members("user_id, role, joined_at, profiles(id, display_name, avatar_url, last_seen_at)"),
    ]);
    // Before database update 3 there is no last_seen_at column.
    const { data: mem } = first.error ? await members("user_id, role, joined_at, profiles(id, display_name, avatar_url)") : first;
    if (!fam) setNotFound(true);
    setFamily(fam);
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

// Who has this family open right now (Supabase Realtime Presence).
// Also records "last seen" while the app is open.
export function usePresence(familyId: string, userId: string) {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    const channel = supabase.channel(`presence:${familyId}`, { config: { presence: { key: userId } } });
    channel
      .on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(channel.presenceState()))))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ at: new Date().toISOString() });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [familyId, userId]);

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

  return online;
}

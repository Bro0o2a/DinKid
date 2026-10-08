"use client";

import { useCallback, useEffect, useState } from "react";
import { FAMILY_COLUMNS, supabase } from "@/lib/supabase";
import type { Family, Member, Profile } from "@/lib/types";

export function useFamily(familyId: string) {
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const [{ data: fam }, { data: mem }] = await Promise.all([
      supabase.from("families").select(FAMILY_COLUMNS).eq("id", familyId).maybeSingle(),
      supabase
        .from("family_members")
        .select("user_id, role, profiles(id, display_name, avatar_url)")
        .eq("family_id", familyId)
        .order("joined_at"),
    ]);
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

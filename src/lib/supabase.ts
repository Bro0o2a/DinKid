import { createClient } from "@supabase/supabase-js";
import type { Family } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isConfigured = Boolean(url && anonKey);

// The anon key is safe in the browser: Row Level Security in
// supabase/schema.sql decides what each family member can see.
export const supabase = createClient(
  url ?? "http://localhost:54321",
  anonKey ?? "missing-anon-key",
);

// invite_code is admin-only (see get_invite_code in supabase/schema.sql).
export const FAMILY_COLUMNS = "id, name, created_by, created_at";

// Family rows with the photo (database update 5), falling back to the older columns.
export async function selectFamilies(id?: string) {
  const query = (columns: string) => {
    const q = supabase.from("families").select(columns).order("created_at");
    return id ? q.eq("id", id) : q;
  };
  const first = await query(`${FAMILY_COLUMNS}, photo_url`);
  const { data } = first.error ? await query(FAMILY_COLUMNS) : first;
  return (data ?? []) as unknown as Family[];
}

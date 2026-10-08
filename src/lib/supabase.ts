import { createClient } from "@supabase/supabase-js";

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

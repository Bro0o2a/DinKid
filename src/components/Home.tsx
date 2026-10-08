"use client";

import { ChevronRight, KeyRound, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FAMILY_COLUMNS, supabase } from "@/lib/supabase";
import type { Family } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { Wordmark } from "./Logo";

export function Home() {
  const router = useRouter();
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [newName, setNewName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isGuest = useAuth().session?.user.is_anonymous ?? false;

  useEffect(() => {
    supabase
      .from("families")
      .select(FAMILY_COLUMNS)
      .order("created_at")
      .then(({ data }) => {
        const list = data ?? [];
        setFamilies(list);
        // When the app is opened, go straight to the family chat (once per visit,
        // so the back button still reaches this screen).
        try {
          if (list.length === 0 || sessionStorage.getItem("dinkin:autoOpened")) return;
          sessionStorage.setItem("dinkin:autoOpened", "1");
          const last = localStorage.getItem("dinkin:lastFamily");
          const target = list.find((f) => f.id === last) ?? (list.length === 1 ? list[0] : undefined);
          if (target) router.replace(`/f/${target.id}`);
        } catch {}
      });
  }, [router]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { data, error } = await supabase.rpc("create_family", { family_name: newName });
    if (error) return setError(error.message);
    router.push(`/f/${data}`);
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { data, error } = await supabase.rpc("join_family", { code });
    if (error) return setError(error.message);
    router.push(`/f/${data}`);
  }

  return (
    <main className="min-h-dvh max-w-lg mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between pt-2">
        <Wordmark />
        <button onClick={() => supabase.auth.signOut()} className="btn-ghost" aria-label="Sign out" title="Sign out">
          <LogOut size={20} />
        </button>
      </header>

      <section>
        <h2 className="section-title">Your families</h2>
        {families === null ? (
          <p className="text-muted">Loading…</p>
        ) : families.length === 0 ? (
          <p className="text-muted">You&apos;re not in a family yet. Create one or join with a code.</p>
        ) : (
          <ul className="space-y-2">
            {families.map((f) => (
              <li key={f.id}>
                <Link href={`/f/${f.id}`} className="card p-3 flex items-center gap-3 hover:border-brand transition">
                  <div className="size-11 rounded-full bg-brand-soft text-brand font-bold flex items-center justify-center">
                    {f.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="flex-1 font-semibold" dir="auto">{f.name}</span>
                  <ChevronRight size={20} className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><KeyRound size={18} className="text-brand" /> Join a family</h2>
        <form onSubmit={join} className="flex gap-2">
          <input
            required
            placeholder="Invite code, e.g. 4F9A2C"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="input uppercase tracking-widest"
            maxLength={6}
          />
          <button className="btn-primary">Join</button>
        </form>
      </section>

      {!isGuest && (
        <section className="card p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Plus size={18} className="text-brand" /> Start a new family</h2>
          <p className="text-sm text-muted -mt-1">You&apos;ll be the admin and get the invite code.</p>
          <form onSubmit={create} className="flex gap-2">
            <input
              required
              placeholder="Family name, e.g. Beit Jeddo"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="input"
              maxLength={60}
            />
            <button className="btn-primary">Create</button>
          </form>
        </section>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}
    </main>
  );
}

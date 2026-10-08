"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Family } from "@/lib/types";

export function Home() {
  const router = useRouter();
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [newName, setNewName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("families")
      .select("*")
      .order("created_at")
      .then(({ data }) => setFamilies(data ?? []));
  }, []);

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
        <h1 className="text-2xl font-bold text-brand">🏡 DinKin</h1>
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-muted hover:underline">
          Sign out
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
                <Link href={`/f/${f.id}`} className="card p-4 flex items-center justify-between hover:border-brand transition">
                  <span className="font-semibold">{f.name}</span>
                  <span className="text-muted">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Join a family</h2>
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

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Start a new family</h2>
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

      {error && <p className="text-red-500 text-sm">{error}</p>}
    </main>
  );
}

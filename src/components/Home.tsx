"use client";

import { ChevronRight, KeyRound, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/push";
import { selectFamilies, supabase } from "@/lib/supabase";
import type { Family } from "@/lib/types";
import { useAuth } from "./AuthProvider";
import { FamilyAvatar } from "./Avatar";
import { Wordmark } from "./Logo";
import { useT } from "@/lib/i18n";

export function Home() {
  const router = useRouter();
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [newName, setNewName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const isGuest = useAuth().session?.user.is_anonymous ?? false;
  const { t } = useT();

  useEffect(() => {
    selectFamilies().then((list) => {
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

  // Admins see the invite code of each family they run.
  useEffect(() => {
    if (isGuest) return;
    supabase.rpc("my_admin_codes").then(({ data }) => {
      if (data) setCodes(Object.fromEntries((data as { family_id: string; invite_code: string }[]).map((r) => [r.family_id, r.invite_code])));
    });
  }, [isGuest]);

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
        <div className="flex items-center">
          <button onClick={() => signOut()} className="btn-ghost" aria-label={t("Sign out")} title={t("Sign out")}>
            <LogOut size={20} className="rtl:-scale-x-100" />
          </button>
        </div>
      </header>

      <section>
        <h2 className="section-title">{t("Your families")}</h2>
        {families === null ? (
          <p className="text-muted">{t("Loading…")}</p>
        ) : families.length === 0 ? (
          <p className="text-muted">{t("You're not in a family yet. Create one or join with a code.")}</p>
        ) : (
          <ul className="space-y-2">
            {families.map((f) => (
              <li key={f.id}>
                <Link href={`/f/${f.id}`} className="card p-3 flex items-center gap-3 hover:border-brand transition">
                  <FamilyAvatar family={f} size={44} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate" dir="auto">{f.name}</p>
                    {codes[f.id] && (
                      <p className="text-xs text-muted inline-flex items-center gap-1">
                        <KeyRound size={12} /> {t("Code")}
                        <span className="font-mono font-bold tracking-widest text-brand">{codes[f.id]}</span>
                      </p>
                    )}
                  </div>
                  <ChevronRight size={20} className="text-muted rtl:-scale-x-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><KeyRound size={18} className="text-brand" /> {t("Join a family")}</h2>
        <form onSubmit={join} className="flex gap-2">
          <input
            required
            placeholder={t("Invite code, e.g. 4F9A2C")}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="input uppercase tracking-widest"
            maxLength={6}
          />
          <button className="btn-primary">{t("Join")}</button>
        </form>
      </section>

      {!isGuest && (
        <section className="card p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Plus size={18} className="text-brand" /> {t("Start a new family")}</h2>
          <p className="text-sm text-muted -mt-1">{t("You'll be the admin and get the invite code.")}</p>
          <form onSubmit={create} className="flex gap-2">
            <input
              required
              placeholder={t("Family name, e.g. Beit Jeddo")}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="input"
              maxLength={60}
            />
            <button className="btn-primary">{t("Create")}</button>
          </form>
        </section>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}
    </main>
  );
}

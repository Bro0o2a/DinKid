"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-sm card p-8 text-center">
        <div className="text-5xl mb-2">🏡</div>
        <h1 className="text-3xl font-bold text-brand">DinKin</h1>
        <p className="text-muted mt-1 mb-6">Your family, all in one place. No phone number needed.</p>

        {sent ? (
          <p className="rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 p-4">
            Check your email 📬 and tap the link to sign in.
          </p>
        ) : (
          <>
            <form onSubmit={sendLink} className="space-y-3">
              <input
                type="email"
                required
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
              <button disabled={busy} className="btn-primary w-full">
                {busy ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>
          </>
        )}
        {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
      </div>
    </main>
  );
}

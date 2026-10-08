"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Logo } from "./Logo";

type Mode = "signin" | "signup";

export function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      // No session means the project still requires email confirmation.
      else if (!data.session) setInfo("Check your email and tap the link to finish signing up.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
    }
    setBusy(false);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-sm card p-8 text-center">
        <div className="flex justify-center mb-4"><Logo size={56} /></div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome to DinKin</h1>
        <p className="text-muted mt-1 mb-6 text-sm">Your family, all in one place. No phone number needed.</p>

        <div className="grid grid-cols-2 gap-1 p-1 mb-4 rounded-xl bg-background border border-border text-sm">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`rounded-lg py-1.5 font-semibold ${mode === m ? "bg-surface text-brand shadow-sm" : "text-muted"}`}
            >
              {m === "signin" ? "Sign in" : "New account"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input
              required
              dir="auto"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              maxLength={40}
            />
          )}
          <input
            type="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            autoComplete="email"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password (6+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          <button disabled={busy} className="btn-primary w-full">
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        {info && (
          <p className="rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 p-4 mt-4">{info}</p>
        )}
        {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
      </div>
    </main>
  );
}

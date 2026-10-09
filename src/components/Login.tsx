"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Logo } from "./Logo";

type Mode = "join" | "signin" | "signup";

export function Login() {
  const [mode, setMode] = useState<Mode>("join");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A failed join signs the guest out, which remounts this screen; carry the error across.
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("dinkin:joinError");
      if (pending) {
        sessionStorage.removeItem("dinkin:joinError");
        setError(pending);
      }
    } catch {}
  }, []);

  // Family members join with only their name and the admin's code.
  // They get an anonymous account that stays signed in on this device.
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInAnonymously({
      options: { data: { full_name: name.trim() } },
    });
    if (authError) {
      setBusy(false);
      return setError(
        authError.message.toLowerCase().includes("anonymous")
          ? "Joining with a code is not switched on yet. Ask the family admin."
          : authError.message,
      );
    }
    const { data: familyId, error: joinError } = await supabase.rpc("join_family", { code });
    if (joinError) {
      const message = joinError.message.includes("not found") ? "That code is not right. Check it with the admin." : joinError.message;
      try {
        sessionStorage.setItem("dinkin:joinError", message);
      } catch {}
      await supabase.auth.signOut();
      setBusy(false);
      return setError(message);
    }
    // This screen may already be unmounted by the new session, so navigate directly.
    window.location.assign(`/f/${familyId}`);
  }

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
        <h1 className="font-display text-3xl font-bold tracking-tight">Welcome to <span className="text-brand">DinKin</span></h1>
        <p className="text-muted mt-1 mb-6 text-sm">Your family, all in one place. No phone number needed.</p>

        {mode === "join" ? (
          <>
            <form onSubmit={join} className="space-y-3">
              <input
                required
                dir="auto"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                maxLength={40}
                autoComplete="given-name"
              />
              <input
                required
                placeholder="Family code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ""))}
                className="input uppercase tracking-[0.3em] text-center font-mono"
                maxLength={6}
                autoCapitalize="characters"
              />
              <button disabled={busy || !name.trim() || code.length < 6} className="btn-primary w-full">
                <KeyRound size={18} /> {busy ? "Joining…" : "Join my family"}
              </button>
            </form>
            {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
            <button
              onClick={() => switchMode("signin")}
              className="mt-6 text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5"
            >
              <ShieldCheck size={15} /> Family admin? Sign in here
            </button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1 p-1 mb-4 rounded-xl bg-background border border-border text-sm">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`rounded-lg py-1.5 font-semibold ${mode === m ? "bg-surface text-brand shadow-sm" : "text-muted"}`}
                >
                  {m === "signin" ? "Admin sign in" : "New admin"}
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
                {busy ? "…" : mode === "signin" ? "Sign in" : "Create admin account"}
              </button>
            </form>

            {info && (
              <p className="rounded-xl bg-brand-soft text-brand p-4 mt-4">{info}</p>
            )}
            {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
            <button onClick={() => switchMode("join")} className="mt-6 text-sm text-muted hover:text-foreground">
              ← Join with a family code instead
            </button>
          </>
        )}
      </div>
    </main>
  );
}

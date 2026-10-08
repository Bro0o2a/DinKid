"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Family, Member } from "@/lib/types";
import { Avatar } from "./Avatar";

type Props = { family: Family; members: Member[]; userId: string; onChange: () => void };

export function Members({ family, members, userId, onChange }: Props) {
  const router = useRouter();
  const me = members.find((m) => m.user_id === userId);
  const [name, setName] = useState(me?.profiles.display_name ?? "");
  const [copied, setCopied] = useState(false);

  const inviteText = `Join our family "${family.name}" on DinKin 🏡\nOpen ${window.location.origin} and enter code: ${family.invite_code}`;

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: "DinKin invite", text: inviteText }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(inviteText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", userId);
    if (error) alert(error.message);
    else onChange();
  }

  async function leave() {
    if (!confirm(`Leave ${family.name}?`)) return;
    await supabase.from("family_members").delete().eq("family_id", family.id).eq("user_id", userId);
    router.push("/");
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      <section className="card p-5 text-center space-y-2">
        <p className="text-muted text-sm">Invite code</p>
        <p className="text-4xl font-mono font-bold tracking-[0.3em] text-brand">{family.invite_code}</p>
        <button onClick={share} className="btn-primary">{copied ? "Copied ✓" : "Share invite"}</button>
      </section>

      <section>
        <h2 className="section-title">Members ({members.length})</h2>
        <ul className="card divide-y divide-border">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 p-3">
              <Avatar profile={m.profiles} size={36} />
              <span className="flex-1">{m.profiles.display_name}{m.user_id === userId && " (you)"}</span>
              {m.role === "admin" && <span className="text-xs text-brand">admin</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4 space-y-2">
        <h2 className="font-semibold">Your name</h2>
        <form onSubmit={saveName} className="flex gap-2">
          <input required dir="auto" value={name} onChange={(e) => setName(e.target.value)} className="input" maxLength={40} />
          <button className="btn-primary">Save</button>
        </form>
      </section>

      <div className="flex justify-between text-sm">
        <button onClick={leave} className="text-red-500 hover:underline">Leave family</button>
        <button onClick={() => supabase.auth.signOut()} className="text-muted hover:underline">Sign out</button>
      </div>
    </div>
  );
}

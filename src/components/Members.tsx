"use client";

import { Camera, Copy, Crown, LogOut, MessageCircle, RefreshCw, ShieldCheck, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Family, Member } from "@/lib/types";
import { Avatar } from "./Avatar";
import { useAuth } from "./AuthProvider";

type Props = { family: Family; members: Member[]; userId: string; online: Set<string>; onChange: () => void };

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Shrink a photo to a small square JPEG before uploading.
async function squareJpeg(file: File, size = 256): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read the photo"))), "image/jpeg", 0.85));
}

export function Members({ family, members, userId, online, onChange }: Props) {
  const router = useRouter();
  const me = members.find((m) => m.user_id === userId);
  const isAdmin = me?.role === "admin";
  const isGuest = useAuth().session?.user.is_anonymous ?? false;
  const [name, setName] = useState(me?.profiles.display_name ?? "");
  const [code, setCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.rpc("get_invite_code", { fid: family.id }).then(({ data, error }) => {
      if (error) setCodeError("Run the latest database update (supabase/migrations) to show the code.");
      else setCode(data);
    });
  }, [isAdmin, family.id]);

  const inviteText = code
    ? `Join our family "${family.name}" on DinKin\n1. Open ${window.location.origin}\n2. Write your name and the code: ${code}`
    : "";

  async function copy() {
    await navigator.clipboard.writeText(inviteText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function newCode() {
    if (!confirm("Make a new code? The old code will stop working.")) return;
    const { data, error } = await supabase.rpc("regenerate_invite_code", { fid: family.id });
    if (error) alert(error.message);
    else setCode(data);
  }

  async function remove(member: Member) {
    if (!confirm(`Remove ${member.profiles.display_name} from ${family.name}?`)) return;
    const { error } = await supabase.rpc("remove_member", { fid: family.id, member: member.user_id });
    if (error) alert(error.message);
    else onChange();
  }

  async function promote(member: Member) {
    if (!confirm(`Make ${member.profiles.display_name} an admin? They will see the invite code and can remove members.`)) return;
    const { error } = await supabase.rpc("make_admin", { fid: family.id, member: member.user_id });
    if (error) alert(error.message);
    else onChange();
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", userId);
    if (error) alert(error.message);
    else onChange();
  }

  async function changePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const path = `${userId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, await squareJpeg(file), { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
      if (error) throw error;
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not change the photo.");
    }
    setUploading(false);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return alert(error.message);
    setPassword("");
    setPasswordSaved(true);
  }

  async function leave() {
    if (!confirm(`Leave ${family.name}?`)) return;
    await supabase.from("family_members").delete().eq("family_id", family.id).eq("user_id", userId);
    router.push("/");
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {isAdmin ? (
        <section className="card p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand">
            <ShieldCheck size={18} /> Only you can see this code
          </div>
          {codeError ? (
            <p className="text-sm text-red-500">{codeError}</p>
          ) : (
            <div className="rounded-xl bg-brand-soft py-4 text-center">
              <p className="text-xs uppercase tracking-wider text-muted mb-1">Invite code</p>
              <p className="text-3xl font-mono font-bold tracking-[0.35em] text-brand">{code ?? "······"}</p>
            </div>
          )}
          {code && (
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(inviteText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary bg-[#25D366] hover:bg-[#1eb957]"
              >
                <MessageCircle size={18} /> WhatsApp
              </a>
              <button onClick={copy} className="btn-secondary">
                <Copy size={18} /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
          {code && (
            <button onClick={newCode} className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5">
              <RefreshCw size={14} /> Make a new code
            </button>
          )}
        </section>
      ) : (
        <section className="card p-5 flex gap-3 items-start">
          <ShieldCheck className="text-brand shrink-0" size={22} />
          <p className="text-sm text-muted">
            Want to add someone? Ask the family admin for the invite code.
          </p>
        </section>
      )}

      <section>
        <h2 className="section-title">Members · {members.length}</h2>
        <ul className="card divide-y divide-border">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 p-3">
              <Avatar profile={m.profiles} size={44} online={online.has(m.user_id)} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate" dir="auto">
                  {m.profiles.display_name}
                  {m.user_id === userId && <span className="text-muted font-normal"> (you)</span>}
                  {m.role === "admin" && (
                    <span className="ml-1.5 text-xs text-brand inline-flex items-center gap-0.5 align-middle">
                      <Crown size={12} /> Admin
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted truncate">
                  {online.has(m.user_id) ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">Online now</span>
                  ) : m.profiles.last_seen_at ? (
                    `Last seen ${timeAgo(m.profiles.last_seen_at)}`
                  ) : (
                    "Offline"
                  )}
                </p>
                {isAdmin && m.joined_at && <p className="text-xs text-muted truncate">Joined {formatDate(m.joined_at)}</p>}
              </div>
              {isAdmin && m.user_id !== userId && (
                <div className="flex">
                  {m.role !== "admin" && (
                    <button onClick={() => promote(m)} className="btn-ghost" aria-label="Make admin" title="Make admin">
                      <Crown size={18} />
                    </button>
                  )}
                  <button onClick={() => remove(m)} className="btn-ghost hover:text-red-500" aria-label="Remove" title="Remove">
                    <UserMinus size={18} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Your profile</h2>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="relative rounded-full"
            aria-label="Change photo"
          >
            <Avatar profile={me?.profiles} size={72} />
            <span className="absolute -bottom-0.5 -right-0.5 size-7 rounded-full bg-brand text-white flex items-center justify-center border-2 border-surface">
              <Camera size={14} />
            </span>
          </button>
          <div className="text-sm">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="font-semibold text-brand">
              {uploading ? "Uploading…" : me?.profiles.avatar_url ? "Change photo" : "Add a photo"}
            </button>
            <p className="text-muted">Your family will see it next to your name.</p>
          </div>
          <input ref={fileInput} type="file" accept="image/*" onChange={changePhoto} className="hidden" />
        </div>
        <form onSubmit={saveName} className="flex gap-2">
          <input required dir="auto" value={name} onChange={(e) => setName(e.target.value)} className="input" maxLength={40} />
          <button className="btn-primary">Save</button>
        </form>
      </section>

      {!isGuest && (
        <section className="card p-4 space-y-2">
          <h2 className="font-semibold">Password</h2>
          <form onSubmit={savePassword} className="flex gap-2">
            <input
              type="password"
              required
              minLength={6}
              placeholder="New password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordSaved(false);
              }}
              className="input"
              autoComplete="new-password"
            />
            <button className="btn-primary">Save</button>
          </form>
          {passwordSaved && <p className="text-sm text-brand">Password saved.</p>}
        </section>
      )}

      <div className="flex justify-between text-sm pb-4">
        <button onClick={leave} className="text-red-500 hover:underline inline-flex items-center gap-1.5">
          <LogOut size={16} /> Leave family
        </button>
        <button
          onClick={() => {
            if (isGuest && !confirm("Sign out? To come back you will need the family code again.")) return;
            supabase.auth.signOut();
          }}
          className="text-muted hover:underline"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

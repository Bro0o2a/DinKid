"use client";

import { Cake, Camera, Copy, Crown, LogOut, MessageCircle, RefreshCw, ShieldCheck, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/push";
import { squareJpeg } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import type { Family, Member } from "@/lib/types";
import { Avatar, FamilyAvatar } from "./Avatar";
import { useAuth } from "./AuthProvider";
import { ChatBackgroundPicker } from "./ChatBackground";
import { LanguageToggle } from "./LanguageToggle";
import { NotificationSettings } from "./Notifications";
import { PhotoEditor } from "./PhotoEditor";

type Props = { family: Family; members: Member[]; userId: string; online: Set<string>; onChange: () => void };

type T = ReturnType<typeof useT>["t"];

function timeAgo(iso: string, t: T, locale: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 2) return t("just now");
  if (minutes < 60) return t("{n} min ago", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("{n} h ago", { n: hours });
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function Members({ family, members, userId, online, onChange }: Props) {
  const { t, locale } = useT();
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
  const familyInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{ file: File; target: "me" | "family" } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.rpc("get_invite_code", { fid: family.id }).then(({ data, error }) => {
      if (error) setCodeError(t("Run the latest database update (supabase/migrations) to show the code."));
      else setCode(data);
    });
  }, [isAdmin, family.id]);

  const inviteText = code
    ? t("Join our family \"{family}\" on DinKin\n1. Open {link}\n2. Write your name and the code: {code}", { family: family.name, link: window.location.origin, code })
    : "";

  async function copy() {
    await navigator.clipboard.writeText(inviteText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function newCode() {
    if (!confirm(t("Make a new code? The old code will stop working."))) return;
    const { data, error } = await supabase.rpc("regenerate_invite_code", { fid: family.id });
    if (error) alert(error.message);
    else setCode(data);
  }

  async function remove(member: Member) {
    if (!confirm(t("Remove {name} from {family}?", { name: member.profiles.display_name, family: family.name }))) return;
    const { error } = await supabase.rpc("remove_member", { fid: family.id, member: member.user_id });
    if (error) alert(error.message);
    else onChange();
  }

  async function promote(member: Member) {
    if (!confirm(t("Make {name} an admin? They will see the invite code and can remove members.", { name: member.profiles.display_name }))) return;
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

  // Photos go in the public "avatars" bucket, inside the uploader's own folder.
  async function uploadPhoto(photo: Blob, save: (url: string) => PromiseLike<{ error: unknown }>) {
    setUploading(true);
    try {
      const path = `${userId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, await squareJpeg(photo, 512), { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      const { error } = await save(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
      if (error) throw error;
      onChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("Could not change the photo."));
    }
    setUploading(false);
  }

  // Both photos open the editor first; `editing` says which one it is for.
  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>, target: "me" | "family") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setEditing({ file, target });
  }

  function savePhoto(photo: Blob) {
    const target = editing?.target;
    setEditing(null);
    if (target === "family") uploadPhoto(photo, (url) => supabase.from("families").update({ photo_url: url }).eq("id", family.id));
    else uploadPhoto(photo, (url) => supabase.from("profiles").update({ avatar_url: url }).eq("id", userId));
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return alert(error.message);
    setPassword("");
    setPasswordSaved(true);
  }

  async function leave() {
    if (!confirm(t("Leave {family}?", { family: family.name }))) return;
    await supabase.from("family_members").delete().eq("family_id", family.id).eq("user_id", userId);
    router.push("/");
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {editing && <PhotoEditor file={editing.file} square onCancel={() => setEditing(null)} onDone={savePhoto} />}
      {isAdmin ? (
        <section className="card p-5 space-y-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => familyInput.current?.click()}
              disabled={uploading}
              className="relative rounded-full"
              aria-label={t("Change family photo")}
            >
              <FamilyAvatar family={family} size={56} />
              <span className="absolute -bottom-0.5 -end-0.5 size-6 rounded-full bg-brand text-white flex items-center justify-center border-2 border-surface">
                <Camera size={12} />
              </span>
            </button>
            <div className="text-sm min-w-0">
              <p className="font-semibold truncate" dir="auto">{family.name}</p>
              <button type="button" onClick={() => familyInput.current?.click()} disabled={uploading} className="text-brand font-semibold">
                {family.photo_url ? t("Change family photo") : t("Add a family photo")}
              </button>
            </div>
            <input ref={familyInput} type="file" accept="image/*" onChange={(e) => pickPhoto(e, "family")} className="hidden" />
          </div>
          <div className="flex items-center gap-2 text-sm font-semibold text-brand">
            <ShieldCheck size={18} /> {t("Only you can see this code")}
          </div>
          {codeError ? (
            <p className="text-sm text-red-500">{codeError}</p>
          ) : (
            <div className="rounded-xl bg-brand-soft py-4 text-center">
              <p className="text-xs uppercase tracking-wider text-muted mb-1">{t("Invite code")}</p>
              <p className="text-3xl font-mono font-bold tracking-[0.35em] text-brand" dir="ltr">{code ?? "······"}</p>
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
                <Copy size={18} /> {copied ? t("Copied") : t("Copy")}
              </button>
            </div>
          )}
          {code && (
            <button onClick={newCode} className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5">
              <RefreshCw size={14} /> {t("Make a new code")}
            </button>
          )}
        </section>
      ) : (
        <section className="card p-5 flex gap-3 items-start">
          <ShieldCheck className="text-brand shrink-0" size={22} />
          <p className="text-sm text-muted">
            {t("Want to add someone? Ask the family admin for the invite code.")}
          </p>
        </section>
      )}

      <section>
        <h2 className="section-title">{t("Members")} · {members.length}</h2>
        <ul className="card divide-y divide-border">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 p-3">
              <Avatar profile={m.profiles} size={44} online={online.has(m.user_id)} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate" dir="auto">
                  {m.profiles.display_name}
                  {m.user_id === userId && <span className="text-muted font-normal"> ({t("you")})</span>}
                  {m.role === "admin" && (
                    <span className="ms-1.5 text-xs text-brand inline-flex items-center gap-0.5 align-middle">
                      <Crown size={12} /> {t("Admin")}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted truncate">
                  {online.has(m.user_id) ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t("Online now")}</span>
                  ) : m.profiles.last_seen_at ? (
                    t("Last seen {when}", { when: timeAgo(m.profiles.last_seen_at, t, locale) })
                  ) : (
                    t("Offline")
                  )}
                </p>
                {isAdmin && m.joined_at && <p className="text-xs text-muted truncate">{t("Joined {date}", { date: formatDate(m.joined_at, locale) })}</p>}
              </div>
              {isAdmin && m.user_id !== userId && (
                <div className="flex">
                  {m.role !== "admin" && (
                    <button onClick={() => promote(m)} className="btn-ghost" aria-label={t("Make admin")} title={t("Make admin")}>
                      <Crown size={18} />
                    </button>
                  )}
                  <button onClick={() => remove(m)} className="btn-ghost hover:text-red-500" aria-label={t("Remove")} title={t("Remove")}>
                    <UserMinus size={18} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">{t("Your profile")}</h2>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="relative rounded-full"
            aria-label={t("Change photo")}
          >
            <Avatar profile={me?.profiles} size={72} />
            <span className="absolute -bottom-0.5 -end-0.5 size-7 rounded-full bg-brand text-white flex items-center justify-center border-2 border-surface">
              <Camera size={14} />
            </span>
          </button>
          <div className="text-sm">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="font-semibold text-brand">
              {uploading ? t("Uploading…") : me?.profiles.avatar_url ? t("Change photo") : t("Add a photo")}
            </button>
            <p className="text-muted">{t("Your family will see it next to your name.")}</p>
          </div>
          <input ref={fileInput} type="file" accept="image/*" onChange={(e) => pickPhoto(e, "me")} className="hidden" />
        </div>
        <form onSubmit={saveName} className="flex gap-2">
          <input required dir="auto" value={name} onChange={(e) => setName(e.target.value)} className="input" maxLength={40} />
          <button className="btn-primary">{t("Save")}</button>
        </form>
        <BirthdayPicker userId={userId} value={me?.profiles.birthday ?? null} onSaved={onChange} />
      </section>

      <NotificationSettings />

      <ChatBackgroundPicker />

      <section className="card p-4 flex items-center justify-between">
        <h2 className="font-semibold">{t("Language")}</h2>
        <LanguageToggle />
      </section>

      {!isGuest && (
        <section className="card p-4 space-y-2">
          <h2 className="font-semibold">{t("Password")}</h2>
          <form onSubmit={savePassword} className="flex gap-2">
            <input
              type="password"
              required
              minLength={6}
              placeholder={t("New password")}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordSaved(false);
              }}
              className="input"
              autoComplete="new-password"
            />
            <button className="btn-primary">{t("Save")}</button>
          </form>
          {passwordSaved && <p className="text-sm text-brand">{t("Password saved.")}</p>}
        </section>
      )}

      <div className="flex justify-between text-sm pb-4">
        <button onClick={leave} className="text-red-500 hover:underline inline-flex items-center gap-1.5">
          <LogOut size={16} className="rtl:-scale-x-100" /> {t("Leave family")}
        </button>
        <button
          onClick={() => {
            if (isGuest && !confirm(t("Sign out? To come back you will need the family code again."))) return;
            signOut();
          }}
          className="text-muted hover:underline"
        >
          {t("Sign out")}
        </button>
      </div>
    </div>
  );
}

// Only the day and month matter; the year is stored as 2000.
function BirthdayPicker({ userId, value, onSaved }: { userId: string; value: string | null; onSaved: () => void }) {
  const { t, locale } = useT();
  const [, m0, d0] = value ? value.split("-").map(Number) : [0, 0, 0];
  const [month, setMonth] = useState(m0 || 0);
  const [day, setDay] = useState(d0 || 0);
  const [saved, setSaved] = useState(false);
  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(locale, { month: "long" }));
  const days = month ? new Date(2000, month, 0).getDate() : 31;

  async function save(nextMonth: number, nextDay: number) {
    setMonth(nextMonth);
    setDay(nextDay);
    setSaved(false);
    if (!!nextMonth !== !!nextDay) return;
    const birthday = nextMonth ? `2000-${String(nextMonth).padStart(2, "0")}-${String(Math.min(nextDay, new Date(2000, nextMonth, 0).getDate())).padStart(2, "0")}` : null;
    const { error } = await supabase.from("profiles").update({ birthday }).eq("id", userId);
    if (error) return alert(error.message.includes("birthday") ? t("Run database update 6 first.") : error.message);
    setSaved(true);
    onSaved();
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold flex items-center gap-1.5">
        <Cake size={16} className="text-brand" /> {t("Birthday")}
        {saved && <span className="text-xs font-normal text-brand">✓ {t("Saved")}</span>}
      </p>
      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <select value={day} onChange={(e) => save(month, Number(e.target.value))} className="input" aria-label={t("Day")}>
          <option value={0}>{t("Day")}</option>
          {Array.from({ length: days }, (_, i) => (
            <option key={i + 1} value={i + 1}>{i + 1}</option>
          ))}
        </select>
        <select value={month} onChange={(e) => save(Number(e.target.value), day)} className="input" aria-label={t("Month")}>
          <option value={0}>{t("Month")}</option>
          {months.map((label, i) => (
            <option key={i + 1} value={i + 1}>{label}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted">{t("The family gets a reminder every year.")}</p>
    </div>
  );
}

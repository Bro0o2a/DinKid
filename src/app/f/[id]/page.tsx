"use client";

import { CalendarDays, ChevronLeft, ListChecks, MessageCircle, Radio, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { FamilyAvatar } from "@/components/Avatar";
import { Chat } from "@/components/Chat";
import { Events } from "@/components/Events";
import { Lists } from "@/components/Lists";
import { Login } from "@/components/Login";
import { Members } from "@/components/Members";
import { clock, Online } from "@/components/Online";
import { clearBadge } from "@/lib/push";
import { useFamily, usePresence } from "@/lib/useFamily";
import { useT } from "@/lib/i18n";

const tabs = [
  { key: "chat", label: "Chat", Icon: MessageCircle },
  { key: "events", label: "Events", Icon: CalendarDays },
  { key: "lists", label: "Lists", Icon: ListChecks },
  { key: "online", label: "Online", Icon: Radio },
  { key: "family", label: "Family", Icon: Users },
] as const;

type Tab = (typeof tabs)[number]["key"];

export default function FamilyPage() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Login />;
  return <FamilyView userId={session.user.id} />;
}

function FamilyView({ userId }: { userId: string }) {
  const { id } = useParams<{ id: string }>();
  const { family, members, profiles, notFound, reload } = useFamily(id);
  const [tab, setTab] = useState<Tab>("chat");
  const { online, present, arrivals } = usePresence(id, userId, tab);
  const [toast, setToast] = useState<string | null>(null);
  const { t, locale } = useT();
  const onlineCount = members.filter((m) => online.has(m.user_id)).length;

  // Short message at the top when someone opens the family.
  const latest = arrivals[arrivals.length - 1];
  useEffect(() => {
    if (!latest) return;
    const name = members.find((m) => m.user_id === latest.userId)?.profiles.display_name ?? t("Someone");
    setToast(t("{name} is here · {time}", { name, time: clock(latest.at, locale) }));
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest]);

  useEffect(() => {
    const clear = () => document.visibilityState === "visible" && clearBadge(id);
    clear();
    document.addEventListener("visibilitychange", clear);
    return () => document.removeEventListener("visibilitychange", clear);
  }, [id]);

  useEffect(() => {
    try {
      localStorage.setItem("dinkin:lastFamily", id);
    } catch {}
  }, [id]);

  if (notFound) {
    return (
      <main className="p-6 text-center space-y-3">
        <p>{t("This family doesn't exist or you're not a member.")}</p>
        <Link href="/" className="text-brand underline">{t("Back home")}</Link>
      </main>
    );
  }

  return (
    <div className="h-dvh flex flex-col max-w-2xl mx-auto">
      <header className="flex items-center gap-3 px-3 py-2.5 border-b border-border bg-surface/90 backdrop-blur">
        <Link href="/" className="btn-ghost -ms-1" aria-label={t("Back")}>
          <ChevronLeft size={22} className="rtl:-scale-x-100" />
        </Link>
        <FamilyAvatar family={family} size={40} />
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg font-bold truncate leading-tight" dir="auto">{family?.name ?? "…"}</h1>
          <p className="text-xs text-muted truncate" dir="auto">
            {onlineCount > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t("{n} online", { n: onlineCount })} · </span>
            )}
            {members.map((m) => m.profiles.display_name).join("، ")}
          </p>
        </div>
      </header>

      {toast && (
        <div className="fixed top-16 inset-x-0 z-20 flex justify-center pointer-events-none px-4">
          <div className="card px-4 py-2 text-sm font-medium shadow-lg flex items-center gap-2" dir="auto">
            <span className="size-2 rounded-full bg-emerald-500" /> {toast}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "chat" && <Chat familyId={id} userId={userId} profiles={profiles} />}
        {tab === "events" && <Events familyId={id} profiles={profiles} />}
        {tab === "lists" && <Lists familyId={id} userId={userId} profiles={profiles} />}
        {tab === "online" && <Online members={members} userId={userId} present={present} arrivals={arrivals} />}
        {tab === "family" && family && (
          <Members family={family} members={members} userId={userId} online={online} onChange={reload} />
        )}
      </div>

      <nav className="grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pt-2 pb-2.5 flex flex-col items-center gap-1 text-[11px] font-medium transition ${active ? "text-brand" : "text-muted hover:text-foreground"}`}
            >
              <span className={`px-4 py-1 rounded-full transition ${active ? "bg-brand-soft" : ""}`}>
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              </span>
              {t(label)}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

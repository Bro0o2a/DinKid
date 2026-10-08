"use client";

import { CalendarDays, ChevronLeft, ListChecks, MessageCircle, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Chat } from "@/components/Chat";
import { Events } from "@/components/Events";
import { Lists } from "@/components/Lists";
import { Login } from "@/components/Login";
import { Members } from "@/components/Members";
import { useFamily } from "@/lib/useFamily";

const tabs = [
  { key: "chat", label: "Chat", Icon: MessageCircle },
  { key: "events", label: "Events", Icon: CalendarDays },
  { key: "lists", label: "Lists", Icon: ListChecks },
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

  useEffect(() => {
    try {
      localStorage.setItem("dinkin:lastFamily", id);
    } catch {}
  }, [id]);

  if (notFound) {
    return (
      <main className="p-6 text-center space-y-3">
        <p>This family doesn&apos;t exist or you&apos;re not a member.</p>
        <Link href="/" className="text-brand underline">Back home</Link>
      </main>
    );
  }

  return (
    <div className="h-dvh flex flex-col max-w-2xl mx-auto">
      <header className="flex items-center gap-3 px-3 py-2.5 border-b border-border bg-surface/90 backdrop-blur">
        <Link href="/" className="btn-ghost -ml-1" aria-label="Back">
          <ChevronLeft size={22} />
        </Link>
        <div className="size-10 rounded-full bg-brand-soft text-brand font-bold flex items-center justify-center shrink-0">
          {family?.name.charAt(0).toUpperCase() ?? ""}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate" dir="auto">{family?.name ?? "…"}</h1>
          <p className="text-xs text-muted truncate" dir="auto">
            {members.map((m) => m.profiles.display_name).join(", ")}
          </p>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "chat" && <Chat familyId={id} userId={userId} profiles={profiles} />}
        {tab === "events" && <Events familyId={id} profiles={profiles} />}
        {tab === "lists" && <Lists familyId={id} userId={userId} profiles={profiles} />}
        {tab === "family" && family && (
          <Members family={family} members={members} userId={userId} onChange={reload} />
        )}
      </div>

      <nav className="grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
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
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

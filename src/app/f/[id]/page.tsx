"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Chat } from "@/components/Chat";
import { Events } from "@/components/Events";
import { Lists } from "@/components/Lists";
import { Login } from "@/components/Login";
import { Members } from "@/components/Members";
import { useFamily } from "@/lib/useFamily";

const tabs = [
  { key: "chat", label: "Chat", icon: "💬" },
  { key: "events", label: "Events", icon: "📅" },
  { key: "lists", label: "Lists", icon: "🛒" },
  { key: "family", label: "Family", icon: "👨‍👩‍👧" },
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
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
        <Link href="/" className="text-muted text-xl" aria-label="Back">‹</Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold truncate">{family?.name ?? "…"}</h1>
          <p className="text-xs text-muted">{members.length} {members.length === 1 ? "member" : "members"}</p>
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
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-2 flex flex-col items-center text-xs ${tab === t.key ? "text-brand font-semibold" : "text-muted"}`}
          >
            <span className="text-xl">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

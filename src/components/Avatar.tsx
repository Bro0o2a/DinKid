import type { Profile } from "@/lib/types";

const colors = ["bg-rose-400", "bg-amber-400", "bg-emerald-400", "bg-sky-400", "bg-violet-400", "bg-orange-400"];

export function Avatar({ profile, size = 32, online }: { profile?: Profile; size?: number; online?: boolean }) {
  if (online === undefined) return <AvatarImage profile={profile} size={size} />;
  const dot = Math.max(10, Math.round(size * 0.28));
  return (
    <span className="relative shrink-0 inline-flex">
      <AvatarImage profile={profile} size={size} />
      <span
        className={`absolute bottom-0 right-0 rounded-full border-2 border-surface ${online ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}
        style={{ width: dot, height: dot }}
        title={online ? "Online" : "Offline"}
      />
    </span>
  );
}

function AvatarImage({ profile, size }: { profile?: Profile; size: number }) {
  const name = profile?.display_name ?? "?";
  const color = colors[(name.charCodeAt(0) || 0) % colors.length];
  if (profile?.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={profile.avatar_url} alt={name} width={size} height={size} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className={`${color} rounded-full shrink-0 flex items-center justify-center text-white font-semibold`}
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

import type { Family, Profile } from "@/lib/types";

const colors = ["bg-rose-500", "bg-amber-600", "bg-orange-500", "bg-[#9b2c45]", "bg-[#8a6a4a]", "bg-pink-500"];

export function Avatar({ profile, size = 32, online }: { profile?: Profile; size?: number; online?: boolean }) {
  if (online === undefined) return <AvatarImage profile={profile} size={size} />;
  const dot = Math.max(10, Math.round(size * 0.28));
  return (
    <span className="relative shrink-0 inline-flex">
      <AvatarImage profile={profile} size={size} />
      <span
        className={`absolute bottom-0 end-0 rounded-full border-2 border-surface ${online ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}
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

export function FamilyAvatar({ family, size = 44 }: { family?: Family | null; size?: number }) {
  if (family?.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={family.photo_url} alt={family.name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="rounded-full bg-brand-soft text-brand font-bold flex items-center justify-center shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {family?.name.charAt(0).toUpperCase() ?? ""}
    </div>
  );
}

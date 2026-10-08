export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="var(--brand)" />
      <path d="M24 11 11 21.5V37h9.5v-8h7v8H37V21.5z" fill="#fff" />
      <circle cx="33.5" cy="15.5" r="5.5" fill="#fbbf24" stroke="var(--brand)" strokeWidth="2.5" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={32} />
      <span className="text-xl font-bold tracking-tight">DinKin</span>
    </div>
  );
}

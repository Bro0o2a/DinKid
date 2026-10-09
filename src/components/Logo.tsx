export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9b2c45" />
          <stop offset="1" stopColor="#5a1325" />
        </linearGradient>
        <linearGradient id="logo-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1d9a7" />
          <stop offset="1" stopColor="#c9a46a" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="url(#logo-bg)" />
      {/* A house that is also a chat bubble, with a heart inside. */}
      <path d="M256 104 L404 222 V372 Q404 404 372 404 H164 L118 436 V222 Z" fill="#f6efe6" />
      <path
        d="M256 352 C214 322 182 296 182 262 C182 238 200 220 222 220 C238 220 250 229 256 242 C262 229 274 220 290 220 C312 220 330 238 330 262 C330 296 298 322 256 352 Z"
        fill="url(#logo-bg)"
      />
      <circle cx="392" cy="128" r="34" fill="url(#logo-gold)" stroke="#5a1325" strokeWidth="10" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={34} />
      <span className="font-display text-2xl font-bold tracking-tight text-brand">DinKin</span>
    </div>
  );
}

/**
 * Bottom-nav icons drawn to match the mockups: outline when idle, filled violet when active
 * (with white details like the door and the chat dots).
 */
type IconProps = { active?: boolean; className?: string };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HomeIcon({ active, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M3.6 10.4 12 3.6l8.4 6.8v8.7a1.6 1.6 0 0 1-1.6 1.6h-4.1v-5.1a2.7 2.7 0 0 0-5.4 0v5.1H5.2a1.6 1.6 0 0 1-1.6-1.6z"
        {...stroke}
        fill={active ? "currentColor" : "none"}
      />
    </svg>
  );
}

export function CommunitiesIcon({ active, className }: IconProps) {
  const f = active ? "currentColor" : "none";
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="8.2" r="3.1" {...stroke} fill={f} />
      <path d="M6.6 19.6c.3-3 2.6-5.2 5.4-5.2s5.1 2.2 5.4 5.2z" {...stroke} fill={f} />
      <circle cx="5.4" cy="9.6" r="2.2" {...stroke} fill={f} />
      <circle cx="18.6" cy="9.6" r="2.2" {...stroke} fill={f} />
      <path d="M1.9 17.6c.3-2.1 1.7-3.5 3.6-3.6M22.1 17.6c-.3-2.1-1.7-3.5-3.6-3.6" {...stroke} />
    </svg>
  );
}

export function ChatsIcon({ active, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 3.9c4.8 0 8.6 3.3 8.6 7.4s-3.8 7.4-8.6 7.4c-1.1 0-2.1-.16-3.1-.47L4.5 19.9l1.2-3.7C4.2 14.8 3.4 13.1 3.4 11.3 3.4 7.2 7.2 3.9 12 3.9z"
        {...stroke}
        fill={active ? "currentColor" : "none"}
      />
      {[8.3, 12, 15.7].map((x) => (
        <circle key={x} cx={x} cy="11.3" r="1.15" fill={active ? "#ffffff" : "currentColor"} />
      ))}
    </svg>
  );
}

export function ProfileIcon({ active, className }: IconProps) {
  const f = active ? "currentColor" : "none";
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="8" r="3.9" {...stroke} fill={f} />
      <path d="M4.4 20.3c.6-3.8 3.8-6.2 7.6-6.2s7 2.4 7.6 6.2z" {...stroke} fill={f} />
    </svg>
  );
}

export function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.6 2H4.4z" {...stroke} strokeWidth={2} />
      <path d="M9.8 20.6a2.4 2.4 0 0 0 4.4 0" {...stroke} strokeWidth={2} />
    </svg>
  );
}

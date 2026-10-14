import { useId } from "react";
export function KMark({ className = "size-7" }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#b49aff" />
          <stop offset=".6" stopColor="#8c70ef" />
          <stop offset="1" stopColor="#63d7cf" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="20" fill={`url(#${id})`} />
      <path
        d="M20 17v30M43 17 27 32l17 15"
        fill="none"
        stroke="#171226"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="49" cy="13" r="4" fill="#e9fff9" />
    </svg>
  );
}

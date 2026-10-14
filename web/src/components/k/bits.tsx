import { Check, Users, User } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { compactNumber } from "@/lib/format-ui";
import { cn } from "@/lib/utils";
import { TONE_STYLE, type Tone } from "./tokens";

/** Small tinted badge: "Discussion", "⭐ Creator", "She/Her". `solid` fills it with the tone. */
export function Pill({
  children,
  tone = "violet",
  solid = false,
  icon,
  className,
}: {
  children: ReactNode;
  tone?: Tone | "neutral";
  solid?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  const look =
    tone === "neutral"
      ? "bg-surface-alt text-muted"
      : solid
        ? TONE_STYLE[tone].className
        : TONE_STYLE[tone].softClassName;
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-[11.5px] font-semibold whitespace-nowrap",
        look,
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Dark translucent count pill over pictures: "👥 245K" (people) or "👤 1.2K" (watching). */
export function CountPill({
  count,
  kind = "members",
  className,
}: {
  count: number;
  /** members = group icon, watching = single person icon. */
  kind?: "members" | "watching";
  className?: string;
}) {
  const Icon = kind === "members" ? Users : User;
  const label =
    kind === "members" ? `${compactNumber(count)} members` : `${compactNumber(count)} listening`;
  return (
    <span
      className={cn(
        "inline-flex h-[17px] items-center gap-[3px] rounded-full bg-[#0f0b2a9e] px-[5px] text-[9.5px] font-bold text-white backdrop-blur-sm lg:h-5 lg:px-1.5 lg:text-[11px]",
        className,
      )}
      aria-label={label}
    >
      <Icon className="size-2.5 lg:size-3" strokeWidth={2.6} aria-hidden />
      {compactNumber(count)}
    </span>
  );
}

/** Red "• LIVE" pill. */
export function LiveBadge({ className, label = "LIVE" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[17px] items-center gap-[3px] rounded-full bg-red-strong px-1 text-[9.5px] font-extrabold tracking-wide text-white lg:h-5 lg:px-1.5 lg:text-[11px]",
        className,
      )}
    >
      <span className="k-pulse size-[5px] rounded-full bg-white" aria-hidden />
      {label}
    </span>
  );
}

/** Blue circle with a white check: verified account. */
export function VerifiedTick({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Verified"
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-blue-strong text-white",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Check style={{ width: size * 0.62, height: size * 0.62 }} strokeWidth={3.6} aria-hidden />
    </span>
  );
}

/** Presence check/dash with a surface ring, distinguishable without color perception. */
export function OnlineDot({
  size = 10,
  online = true,
  className,
  style,
}: {
  size?: number;
  /** false shows a grey "offline" dot (chats list). */
  online?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      role="img"
      aria-label={online ? "Online" : "Offline"}
      title={online ? "Online" : "Offline"}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full ring-2 ring-surface",
        online ? "bg-green" : "bg-subtle",
        className,
      )}
      style={{ width: size, height: size, ...style }}
    >
      {online ? <Check aria-hidden style={{ width: "70%", height: "70%", color: "#063b27" }} strokeWidth={4} /> : <span aria-hidden className="h-px w-1/2 rounded-full bg-white" />}
    </span>
  );
}

/** Red unread count ("3", "12", "99+"). */
export function UnreadCount({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-strong px-1 text-[10.5px] font-bold text-white",
        className,
      )}
      aria-label={`${count} unread`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Small red dot (unread notifications / chats). */
export function RedDot({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      className={cn("inline-block size-2 rounded-full bg-red ring-2 ring-surface", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

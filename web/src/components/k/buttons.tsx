import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GRADIENT_CLASS, TONE_STYLE, type GradientName, type Tone } from "./tokens";

/**
 * Sizes measured on the mockups (mockup pixels ÷ 1.65 at 430px wide). The smaller ones are drawn
 * as small as the mockups but keep a 44px tap area (k-hit).
 * xs = card Join/Follow pills, sm = "Follow Back", "Join Event", md = "Start Exploring",
 * lg = "Get Started" / "Continue" / "Publish Post".
 */
const SIZE = {
  xs: "k-hit h-6 px-3 text-[12px] gap-1",
  sm: "k-hit h-8 px-4 text-[13px] gap-1.5",
  md: "k-hit h-9 px-5 text-[14px] gap-2",
  lg: "h-[52px] px-8 text-[19px] gap-2.5",
} as const;

export type ButtonSize = keyof typeof SIZE;

type CommonProps = {
  children: ReactNode;
  gradient?: GradientName;
  size?: ButtonSize;
  /** Icon before the label. */
  icon?: ReactNode;
  /** Show the → arrow after the label (Get Started →, Start Exploring →). */
  arrow?: boolean;
  /** Stretch to the full width of the parent. */
  full?: boolean;
  className?: string;
};

const base =
  "k-focus relative inline-flex shrink-0 items-center justify-center rounded-full font-bold whitespace-nowrap text-white transition-[transform,filter,opacity] duration-150 ease-out hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

function glow(gradient: GradientName) {
  return gradient === "streak" ? "" : "shadow-glow";
}

/**
 * Pill button painted with one of the spec gradients (default `primary`).
 * Pass `to` to make it a link inside the app, `href` for an outside link, otherwise it is a button.
 */
export function GradientButton({
  children,
  gradient = "primary",
  size = "md",
  icon,
  arrow = false,
  full = false,
  className,
  to,
  href,
  ...rest
}: CommonProps & { to?: string; href?: string } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children"
  >) {
  const cls = cn(
    base,
    SIZE[size],
    GRADIENT_CLASS[gradient],
    glow(gradient),
    full && "w-full",
    className,
  );
  const inner = (
    <>
      {icon}
      <span>{children}</span>
      {arrow && (
        <ArrowRight
          className={size === "lg" ? "size-6" : "size-[1.2em]"}
          strokeWidth={2.4}
          aria-hidden
        />
      )}
    </>
  );
  // Links keep the few button props that make sense for them.
  const linkProps = { className: cls, "aria-label": rest["aria-label"], tabIndex: rest.tabIndex };
  if (to) {
    return (
      <Link to={to} {...linkProps}>
        {inner}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} {...linkProps}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {inner}
    </button>
  );
}

/**
 * Coloured Join pill used on cards (tone follows the card position, see `toneAt`).
 * When `joined`, it turns into a lighter "Joined ✓" in the same colour.
 */
export function JoinButton({
  tone = "violet",
  joined = false,
  busy = false,
  onClick,
  size = "xs",
  full = false,
  icon,
  label,
  joinedLabel = "Joined",
  name,
  className,
}: {
  tone?: Tone;
  joined?: boolean;
  busy?: boolean;
  onClick?: () => void;
  size?: ButtonSize;
  full?: boolean;
  icon?: ReactNode;
  label?: string;
  joinedLabel?: string;
  /** What is being joined, for screen readers ("Join Anime Haven"). */
  name?: string;
  className?: string;
}) {
  const look = joined ? TONE_STYLE[tone].softClassName : TONE_STYLE[tone].className;
  const text = joined ? joinedLabel : (label ?? "Join");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={joined}
      aria-label={name ? `${text} ${name}` : undefined}
      className={cn(
        "k-focus relative z-10 inline-flex shrink-0 items-center justify-center rounded-full font-bold whitespace-nowrap transition-[transform,filter,opacity] duration-150 hover:brightness-105 active:scale-[0.97] disabled:opacity-60",
        SIZE[size],
        look,
        full && "w-full",
        className,
      )}
    >
      {joined ? <Check className="size-[1.1em]" strokeWidth={3} aria-hidden /> : icon}
      {text}
    </button>
  );
}

/** Plain outlined pill (Save, Edit profile, secondary actions). */
export function OutlineButton({
  children,
  icon,
  size = "md",
  className,
  to,
  ...rest
}: Omit<CommonProps, "gradient" | "arrow"> & { to?: string } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children"
  >) {
  const cls = cn(
    "k-focus inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-surface font-bold whitespace-nowrap text-violet shadow-card transition-colors hover:bg-surface-alt",
    SIZE[size],
    className,
  );
  if (to) {
    return (
      <Link to={to} className={cls}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/** Round icon-only button (back, share, ⋯). Always 44px to tap; `variant` changes the look. */
export function IconButton({
  label,
  children,
  variant = "plain",
  className,
  to,
  ...rest
}: {
  label: string;
  children: ReactNode;
  /** plain = no background, soft = white circle with shadow, dark = translucent dark (over pictures). */
  variant?: "plain" | "soft" | "dark";
  className?: string;
  to?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const cls = cn(
    "k-focus relative inline-grid size-11 shrink-0 place-items-center rounded-full transition-colors",
    variant === "plain" && "text-ink hover:bg-surface-alt",
    variant === "soft" && "bg-surface text-ink shadow-card hover:bg-surface-alt",
    variant === "dark" && "bg-[#14112b99] text-white backdrop-blur-sm hover:bg-[#14112bcc]",
    className,
  );
  if (to) {
    return (
      <Link to={to} className={cls} aria-label={label}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} className={cls} {...rest}>
      {children}
    </button>
  );
}

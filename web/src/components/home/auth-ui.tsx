import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { welcomeArt } from "@/lib/brand-art";
import { cn } from "@/lib/utils";
import { CloudEdge, GradientWord, VIOLET_GRADIENT } from "./decor";

/**
 * Pieces shared by the sign-in, password and onboarding pages: the page frame (white, with the
 * Welcome sky behind the top on computers), the "Create Your **Account**" title, a text field and
 * the white card the form sits in. Matches the phone app's sign-in screen.
 */

/** The look of every text box, select and text area on these pages. */
export const INPUT_CLASS =
  "w-full rounded-[14px] border border-border bg-surface-alt px-4 text-[15px] text-ink transition-[border-color,box-shadow,background-color] placeholder:text-subtle focus:border-violet focus:bg-surface focus:ring-4 focus:ring-[color-mix(in_oklab,var(--color-violet)_16%,transparent)] focus:outline-none disabled:opacity-60";

/** White page (dark background in dark mode). On computers the Welcome sky shows behind the top. */
export function AuthFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative min-h-dvh bg-[var(--k-lower)] pb-10 text-body [--k-lower:#ffffff] dark:[--k-lower:var(--color-bg)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-[400px] overflow-hidden lg:block" aria-hidden>
        <img src={welcomeArt.sky} alt="" className="size-full object-cover object-[50%_30%] opacity-90" draggable={false} />
        <div className="absolute inset-0 hidden bg-[rgba(14,11,31,0.45)] dark:block" />
        <div className="absolute inset-x-0 bottom-0 h-[150px]">
          <CloudEdge tiles={4} className="h-full" />
        </div>
      </div>
      {children}
    </div>
  );
}

/** "Create Your **Account**": plain words, then a word in the violet gradient, and a short line under it. */
export function AuthTitle({
  lead,
  highlight,
  text,
  as: Tag = "h1",
  className,
}: {
  lead: string;
  highlight: string;
  text?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-1.5 px-6 text-center", className)}>
      <Tag className="text-[min(32px,8vw)] leading-[1.2] font-extrabold tracking-[-0.8px] text-ink lg:text-[40px]">
        {lead}
        <GradientWord colors={VIOLET_GRADIENT}>{highlight}</GradientWord>
      </Tag>
      {text && (
        <p className="max-w-[340px] text-[15px] leading-5 font-medium text-muted lg:max-w-[420px] lg:text-[16px] lg:leading-6 lg:text-body">
          {text}
        </p>
      )}
    </div>
  );
}

/** The white card a form sits in. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("k-card flex flex-col gap-4 p-4 lg:p-7 lg:shadow-lift", className)}>{children}</div>
  );
}

/** Label + text box (+ optional hint or error under it). */
export function Field({
  label,
  hint,
  error,
  trailing,
  className,
  ...input
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Something inside the box on the right (e.g. the show-password eye). */
  trailing?: ReactNode;
  className?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] font-bold text-ink">{label}</span>
      <span className="relative block">
        <input
          {...input}
          aria-invalid={error ? true : undefined}
          className={cn(INPUT_CLASS, "h-12", trailing ? "pr-12" : undefined)}
        />
        {trailing && <span className="absolute inset-y-0 right-1 flex items-center">{trailing}</span>}
      </span>
      {error ? (
        <span role="alert" className="text-[13px] font-semibold text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="text-[12.5px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/** Label + multi-line text box. */
export function TextArea({
  label,
  hint,
  className,
  ...area
}: { label: string; hint?: ReactNode; className?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] font-bold text-ink">{label}</span>
      <textarea {...area} className={cn(INPUT_CLASS, "min-h-[96px] resize-y py-3 leading-[1.45]")} />
      {hint && <span className="text-[12.5px] text-muted">{hint}</span>}
    </label>
  );
}

/** Red message for a failed submit (read out by screen readers). */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-[12px] bg-tint-pink px-3 py-2 text-[14px] leading-[1.4] font-semibold text-pink-ink"
    >
      {children}
    </p>
  );
}

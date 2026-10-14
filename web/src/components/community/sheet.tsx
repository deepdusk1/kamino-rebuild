import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { ChevronRight, X } from "lucide-react";
import type { ReactNode } from "react";
import { TONE_STYLE, type Tone } from "@/components/k";
import { cn } from "@/lib/utils";

/**
 * A panel that slides up from the bottom on phones and sits in the middle of the screen on computers
 * (the phone app's "Sheet"). Used for the ⋯ menus, filters, join questions, reports and small forms.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** A short line under the title (also read out by screen readers). */
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#0f0b2a]/45 backdrop-blur-[2px] data-[state=open]:animate-[k-fade_160ms_ease-out]" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex max-h-[88dvh] flex-col bg-surface text-body shadow-lift outline-none",
            // Phones: bottom sheet. Computers: centred card.
            "inset-x-0 bottom-0 rounded-t-[24px] pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-[k-sheet_220ms_cubic-bezier(.2,.8,.2,1)]",
            "lg:inset-x-auto lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:w-[460px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-card lg:pb-0 lg:data-[state=open]:animate-[k-fade_160ms_ease-out]",
            className,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border lg:hidden" aria-hidden />
          <div className="flex items-start gap-3 px-5 pt-3 pb-2 lg:pt-5">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-[18px] font-extrabold tracking-[-0.01em] text-ink">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-[13.5px] text-muted">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="k-focus -mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-alt hover:text-ink"
            >
              <X className="size-5" strokeWidth={2.4} aria-hidden />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pt-1 pb-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
      {/* Tiny keyframes for the sheet (kept here so the shared stylesheet stays untouched). */}
      <style>{`@keyframes k-sheet{from{transform:translateY(40px);opacity:.6}to{transform:none;opacity:1}}@keyframes k-fade{from{opacity:0}to{opacity:1}}`}</style>
    </Dialog.Root>
  );
}

export type MenuItem = {
  key: string;
  label: string;
  /** A lucide icon (or emoji) shown in a tinted circle. */
  icon: ReactNode;
  /** Colour of the icon circle (default violet). */
  tone?: Tone;
  /** Red text: deletes or leaves something. */
  destructive?: boolean;
  /** A second, grey line under the label. */
  hint?: string;
  /** Go somewhere inside the app … */
  to?: string;
  /** … or do something. */
  onSelect?: () => void;
};

/**
 * The ⋯ menu: rows with a tinted icon circle, a label and an optional hint (like the phone app's ActionMenu).
 * The menu closes before the chosen action runs, so a second panel can open cleanly.
 */
export function ActionMenu({
  open,
  onOpenChange,
  title,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: readonly MenuItem[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <ul className="-mx-2 -mt-2 space-y-0.5">
        {items.map((item) => {
          const tone: Tone = item.destructive ? "pink" : (item.tone ?? "violet");
          const inner = (
            <>
              <span
                className={cn(
                  "grid size-[38px] shrink-0 place-items-center rounded-full text-[18px] [&_svg]:size-[19px]",
                  TONE_STYLE[tone].softClassName,
                )}
                aria-hidden
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[15px] leading-5 font-bold",
                    item.destructive ? "text-danger" : "text-ink",
                  )}
                >
                  {item.label}
                </span>
                {item.hint ? (
                  <span className="block text-[12.5px] leading-4 text-muted">{item.hint}</span>
                ) : null}
              </span>
              <ChevronRight className="size-4 shrink-0 text-subtle" strokeWidth={2.4} aria-hidden />
            </>
          );
          const cls =
            "k-focus flex min-h-[52px] w-full items-center gap-3 rounded-tile px-2 text-left transition-colors hover:bg-surface-alt";
          return (
            <li key={item.key}>
              {item.to ? (
                <Link to={item.to} className={cls} onClick={() => onOpenChange(false)}>
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  className={cls}
                  onClick={() => {
                    onOpenChange(false);
                    // Let the menu start closing first.
                    window.setTimeout(() => item.onSelect?.(), 60);
                  }}
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

/** Text field in the sheet style (label above, soft grey box). */
export function SheetField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[13.5px] font-bold text-ink">{label}</span>
      {children}
      {hint ? <span className="block text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

/** Class for inputs/selects/textareas inside sheets and cards. 16px text so phones don't zoom in. */
export const fieldClass =
  "k-focus w-full rounded-[14px] border border-border bg-surface-alt px-3.5 py-2.5 text-[16px] text-ink outline-none placeholder:text-subtle focus:ring-2 focus:ring-violet lg:text-[15px]";

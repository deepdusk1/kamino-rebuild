import { Link, useRouterState } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, activeNav, navHref } from "./nav-items";
import { useShellData } from "./use-shell-data";
import { useT } from "@/lib/i18n";

/**
 * Phone bottom navigation: Home · Communities · (+) · Chats · Profile.
 * Outline icons with a label; the active one is filled violet. The middle is a raised 64px
 * gradient circle that opens Create. A red dot on Chats means unread messages.
 * Hidden from 1024px wide (the header shows the same links there).
 */
export function BottomNav({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { unreadChats, profileHref } = useShellData();
  const t = useT();
  const active = activeNav(pathname, profileHref);
  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(20,17,43,0.06)] backdrop-blur-md lg:hidden",
        className,
      )}
    >
      <ul className="mx-auto grid h-14 max-w-[560px] grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const href = navHref(item.key, profileHref);
          const isActive = active === item.key;
          if (item.key === "create") {
            return (
              <li key={item.key} className="relative flex justify-center">
                <Link
                  to={href}
                  aria-label="Create"
                  className="k-focus k-hit absolute -top-2.5 grid size-[46px] place-items-center rounded-full bg-grad-fab text-white shadow-fab transition-transform active:scale-95"
                >
                  <Plus className="size-6" strokeWidth={2.8} aria-hidden />
                </Link>
              </li>
            );
          }
          const Icon = item.Icon;
          return (
            <li key={item.key}>
              <Link
                to={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "k-focus flex h-full flex-col items-center justify-center gap-0.5 rounded-tile text-[11px] font-semibold",
                  isActive ? "text-violet" : "text-muted hover:text-ink",
                )}
              >
                <span className="relative">
                  <Icon active={isActive} className="size-6" />
                  {item.key === "chats" && unreadChats > 0 && (
                    <span
                      className="absolute -top-0.5 -right-1 size-2 rounded-full bg-red ring-2 ring-surface"
                      aria-label={`${unreadChats} unread`}
                      role="img"
                    />
                  )}
                </span>
                {t(`nav.${item.key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

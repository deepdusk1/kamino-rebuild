import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AgeGate } from "./age-gate";
import { IncomingCall } from "./incoming-call";
import { AppHeader } from "./k/app-header";
import { BottomNav } from "./k/bottom-nav";
import { useShellData } from "./k/use-shell-data";

/**
 * The frame around every app screen.
 *
 * - `AppHeader` on top (logo, search, bell, your avatar; on computers also the main links).
 * - `BottomNav` fixed at the bottom on phones (Home · Communities · + · Chats · Profile).
 *   The page is padded at the bottom so nothing hides behind it.
 * - Content is centred, up to 1120px wide.
 *
 * Options:
 * - `chrome="none"`: no header and no nav (welcome, onboarding — screens that draw their own top).
 * - `hideNav`: keep the header but drop the phone bottom nav (post page with its comment bar, chat room).
 * - `back`: show a "<" back button in the header (true = history back, or an address).
 * - `headerActions`: replace the header's right-hand icons (search / share / ⋯ on a community).
 * - `title` + `actions`: older pages show a heading row with optional buttons. New screens draw
 *   their own title (use `ScreenTitle` from the kit) and leave `title` out.
 * - `padded`: add the standard 16px side padding around the content.
 */
export function AppShell({
  children,
  title,
  actions,
  hideNav = false,
  chrome = "full",
  back,
  headerActions,
  padded = false,
  className,
}: {
  children: ReactNode;
  title?: string;
  actions?: ReactNode;
  hideNav?: boolean;
  chrome?: "full" | "none";
  back?: boolean | string;
  headerActions?: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  const { user, needsAge } = useShellData();
  const [ageDone, setAgeDone] = useState(false);

  if (chrome === "none") {
    return (
      <div className={cn("kamino-shell min-h-dvh bg-bg text-body", className)}>
        <main id="main">{children}</main>
        {user ? <IncomingCall /> : null}
      </div>
    );
  }

  return (
    <div className="kamino-shell min-h-dvh bg-bg text-body">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-surface px-4 py-2 font-bold text-violet shadow-lift focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <AppHeader back={back} actions={headerActions} />
      <main
        id="main"
        className={cn(
          "mx-auto w-full max-w-[1120px]",
          // Room for the bottom nav (56px bar + the raised + button + breathing space).
          hideNav ? "pb-8" : "pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-12",
          padded && "px-4",
          className,
        )}
      >
        {title && (
          <div
            className={cn("flex items-center justify-between gap-3 pt-2 pb-3", !padded && "px-4")}
          >
            <h1 className="min-w-0 truncate text-[26px] leading-tight font-extrabold tracking-[-0.03em] text-ink lg:text-[30px]">
              {title}
            </h1>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        )}
        {!title && actions && (
          <div className={cn("flex justify-end gap-2 pb-2", !padded && "px-4")}>{actions}</div>
        )}
        {children}
      </main>
      {!hideNav && <BottomNav />}
      {user ? <IncomingCall /> : null}
      {user && needsAge && !ageDone ? <AgeGate onDone={() => setAgeDone(true)} /> : null}
    </div>
  );
}

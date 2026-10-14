import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Bookmark, ChevronLeft, LogOut, Plus, Search, Shield, User } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { KaminoLogo } from "./brand";
import { GradientButton, IconButton } from "./buttons";
import { BellIcon } from "./nav-icons";
import { NAV_ITEMS, activeNav, navHref } from "./nav-items";
import { useShellData } from "./use-shell-data";
import { useT } from "@/lib/i18n";
import { ThemeToggle } from "@/components/theme-toggle";

const noSubscribe = () => () => {};
const noGateOnServer = () => false;

/**
 * Top bar of every signed-in screen: Kamino logo on the left; search, bell (red dot when
 * there are unread notifications) and your avatar (with a green online dot) on the right.
 * With `back`, a "<" button comes first (post and community pages).
 * From 1024px wide the five main destinations appear as links in the middle.
 */
export function AppHeader({
  back,
  actions,
  className,
}: {
  /** true = go back in history (home if there is none); a string = go to that address. */
  back?: boolean | string;
  /** Replace the right-hand icons (e.g. search + share + ⋯ on a community page). */
  actions?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending, profile, unreadNotifications, unreadChats, profileHref } =
    useShellData();
  const t = useT();
  const active = activeNav(pathname, profileHref);

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else void router.navigate({ to: "/" });
  }

  return (
    <header className={cn("sticky top-0 z-30 bg-bg/95 backdrop-blur-md", className)}>
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-0.5 px-4 lg:h-[72px] lg:gap-4">
        {back &&
          (typeof back === "string" ? (
            <IconButton label="Back" to={back} className="-ml-2.5">
              <ChevronLeft className="size-6" strokeWidth={2.4} aria-hidden />
            </IconButton>
          ) : (
            <IconButton label="Back" onClick={goBack} className="-ml-2.5">
              <ChevronLeft className="size-6" strokeWidth={2.4} aria-hidden />
            </IconButton>
          ))}
        <KaminoLogo
          to="/"
          size={back ? 30 : 32}
          wordSize={back ? 22 : 24}
          className="shrink-0 gap-1.5 lg:hidden"
        />
        <KaminoLogo to="/" size={38} wordSize={26} className="hidden shrink-0 lg:inline-flex" />

        {/* Computers: the five destinations as header links. */}
        <nav aria-label="Main" className="mx-auto hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => {
            const href = navHref(item.key, profileHref);
            const isActive = active === item.key;
            if (item.key === "create") {
              return (
                <Link
                  key={item.key}
                  to={href}
                  aria-label="Create"
                  className="k-focus mx-2 grid size-11 place-items-center rounded-full bg-grad-fab text-white shadow-fab transition-transform hover:scale-105"
                >
                  <Plus className="size-6" strokeWidth={2.6} aria-hidden />
                </Link>
              );
            }
            const Icon = item.Icon;
            return (
              <Link
                key={item.key}
                to={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "k-focus relative inline-flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold transition-colors",
                  isActive
                    ? "bg-tint-violet text-violet"
                    : "text-muted hover:bg-surface-alt hover:text-ink",
                )}
              >
                <Icon active={isActive} className="size-[22px]" />
                {t(`nav.${item.key}`)}
                {item.key === "chats" && unreadChats > 0 && (
                  <span
                    className="absolute top-2 left-8 size-2.5 rounded-full bg-red ring-2 ring-bg"
                    role="img"
                    aria-label={`${unreadChats} unread`}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="-mr-1 ml-auto flex items-center lg:mr-0 lg:ml-0 lg:gap-1">
          {actions ?? (
            <>
              <ThemeToggle />
              <Link
                to="/explore"
                hash="search"
                aria-label="Search"
                className="k-focus grid size-11 place-items-center rounded-full text-ink hover:bg-surface-alt"
              >
                <Search className="size-6" strokeWidth={2.2} aria-hidden />
              </Link>
              {user && (
                <Link
                  to="/notifications"
                  aria-label={
                    unreadNotifications > 0
                      ? `Notifications, ${unreadNotifications} unread`
                      : "Notifications"
                  }
                  aria-current={pathname.startsWith("/notifications") ? "page" : undefined}
                  className={cn(
                    "k-focus relative grid size-11 place-items-center rounded-full hover:bg-surface-alt",
                    pathname.startsWith("/notifications") ? "text-violet" : "text-ink",
                  )}
                >
                  <BellIcon className="size-6" />
                  {unreadNotifications > 0 && (
                    <span
                      className="absolute top-2 right-2.5 size-2 rounded-full bg-red ring-2 ring-bg"
                      aria-hidden
                    />
                  )}
                </Link>
              )}
            </>
          )}
          {isPending ? (
            <span className="ml-0.5 size-9 animate-pulse rounded-full bg-surface-alt" aria-hidden />
          ) : user ? (
            <AccountMenu
              person={{
                name: profile?.displayName || user.displayName || "You",
                hue: profile?.avatarHue ?? 265,
                userId: profile?.userId ?? user.id,
                avatarV: profile?.avatarVersion ?? 0,
              }}
              profileHref={profileHref}
            />
          ) : (
            <GradientButton to="/login" size="sm" className="ml-1.5">
              Sign in
            </GradientButton>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * The avatar: on phones it opens your profile; on computers a small menu (My profile, Saved,
 * Safety & settings, Sign out).
 */
function AccountMenu({
  person,
  profileHref,
}: {
  person: { name: string; hue: number; userId: string; avatarV: number };
  profileHref: string;
}) {
  const [signingOut, setSigningOut] = useState(false);
  // Behind the Grok gate the next request signs you straight back in, so no sign-out there.
  const gateSession = useSyncExternalStore(noSubscribe, hasGateSessionMarker, noGateOnServer);
  const item =
    "k-focus flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-ink outline-none data-[highlighted]:bg-surface-alt";
  return (
    <>
      {/* Phones: straight to your profile (like the phone app). */}
      <Link
        to={profileHref}
        aria-label="My profile"
        className="k-focus grid size-11 shrink-0 place-items-center rounded-full lg:hidden"
      >
        <Avatar person={person} size={36} online />
      </Link>
      {/* Computers: a small account menu. */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="Your account"
            className="k-focus hidden size-11 shrink-0 place-items-center rounded-full lg:grid"
          >
            <Avatar person={person} size={42} online />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="z-50 min-w-[220px] rounded-card border border-border bg-surface p-1.5 shadow-lift"
          >
            <DropdownMenu.Item asChild>
              <Link to={profileHref} className={item}>
                <User className="size-5 text-violet" aria-hidden /> My profile
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Link to="/saved" className={item}>
                <Bookmark className="size-5 text-blue-ink" aria-hidden /> Saved
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Link to="/settings" className={item}>
                <Shield className="size-5 text-green-ink" aria-hidden /> Safety & settings
              </Link>
            </DropdownMenu.Item>
            {authEnabled && !gateSession && (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item
                  className={item}
                  disabled={signingOut}
                  onSelect={(e) => {
                    e.preventDefault();
                    setSigningOut(true);
                    void signOut().catch(() => setSigningOut(false));
                  }}
                >
                  <LogOut className="size-5 text-pink-ink" aria-hidden />
                  {signingOut ? "Signing out…" : "Sign out"}
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );
}

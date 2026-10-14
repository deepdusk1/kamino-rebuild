import { ChatsIcon, CommunitiesIcon, HomeIcon, ProfileIcon } from "./nav-icons";

/** The five destinations of the app (bottom nav on phones, header links on computers). */
export type NavKey = "home" | "communities" | "create" | "chats" | "profile";

export const NAV_ITEMS = [
  { key: "home", label: "Home", Icon: HomeIcon },
  { key: "communities", label: "Communities", Icon: CommunitiesIcon },
  { key: "create", label: "Create", Icon: null },
  { key: "chats", label: "Chats", Icon: ChatsIcon },
  { key: "profile", label: "Profile", Icon: ProfileIcon },
] as const;

/** Address of each destination. Profile depends on the viewer (own page or /me). */
export function navHref(key: NavKey, profileHref: string): string {
  switch (key) {
    case "home":
      return "/";
    case "communities":
      return "/explore";
    case "create":
      return "/new";
    case "chats":
      return "/chats";
    case "profile":
      return profileHref;
  }
}

/** Which destination the current address belongs to (for the active highlight). */
export function activeNav(pathname: string, profileHref: string): NavKey | null {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/explore") || pathname.startsWith("/c/")) return "communities";
  if (pathname.startsWith("/new")) return "create";
  if (pathname.startsWith("/chats")) return "chats";
  if (pathname === "/me" || (profileHref !== "/me" && decodeURIComponent(pathname) === decodeURIComponent(profileHref))) {
    return "profile";
  }
  return null;
}

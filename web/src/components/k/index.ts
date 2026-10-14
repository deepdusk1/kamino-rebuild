/**
 * Kamino UI kit (the redesign). Import from "@/components/k":
 *
 *   import { AppHeader, CommunityCard, SectionHeader } from "@/components/k";
 *
 * Every component takes plain props (no data fetching), except AppHeader and BottomNav,
 * which read the signed-in viewer and unread counts themselves. A live gallery of every
 * piece with sample data is at /kit.
 */
export { KaminoLogo, KaminoMark, KaminoWordmark } from "./brand";
export { CountPill, LiveBadge, OnlineDot, Pill, RedDot, UnreadCount, VerifiedTick } from "./bits";
export { Avatar, AvatarStack } from "./avatar";
export { avatarSrc, type AvatarPerson } from "./media";
export { GradientButton, IconButton, JoinButton, OutlineButton, type ButtonSize } from "./buttons";
export { CardRow, EmptyHint, ScreenTitle, SectionHeader } from "./layout";
export {
  CategoryChips,
  FilterPills,
  HashtagChips,
  ProgressSegments,
  TabsUnderline,
  type FilterItem,
  type TabItem,
} from "./chips";
export { HeroCarousel, type HeroSlide } from "./hero-carousel";
export { CommunityCard, CommunityCover, type CommunityCardInfo } from "./community-card";
export {
  BadgeHex,
  CreatorCard,
  DayStreakCard,
  EventCard,
  InterestTile,
  LiveRoomCard,
  ProfileCategoryTile,
  ShowcaseBanner,
  StatCard,
  type CreatorInfo,
  type LiveRoomInfo,
} from "./cards";
export {
  CommentBar,
  CommentRow,
  ImageCarousel,
  MessageRow,
  NotificationRow,
  SearchField,
  type NotificationKind,
} from "./rows";
export { AppHeader } from "./app-header";
export { BottomNav } from "./bottom-nav";
export { useShellData } from "./use-shell-data";
export { NAV_ITEMS, activeNav, navHref, type NavKey } from "./nav-items";
export {
  CATEGORY_LIST,
  EXPLORE_CATEGORIES,
  HOME_CATEGORIES,
  INTEREST_CATEGORIES,
  WELCOME_CATEGORIES,
  categoryByKey,
  pickCategories,
  type CategoryItem,
} from "./categories";
export { GRADIENT_CLASS, TONES, TONE_STYLE, hueGradient, toneAt, type GradientName, type Tone } from "./tokens";
export { compactNumber, monthYear, timeAgo } from "@/lib/format-ui";

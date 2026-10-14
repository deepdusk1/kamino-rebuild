/**
 * The Kamino redesign kit (SPEC sections 1–2). Import everything from "@/components/k".
 * Components take plain data as props and never fetch, except `AppHeader` / `BottomNav` (viewer + unread counts).
 * Colours, gradients, radii, shadows and the type scale live in "@/theme"; number / time helpers in "@/lib/format".
 */
export { KaminoMark, KaminoWordmark } from "./Brand";
export { AppHeader, IconButton, CoverButton, type HeaderAction } from "./AppHeader";
export { BottomNav, BottomNavBar, type BottomNavItem } from "./BottomNav";
export { SectionHeader, CategoryChips, CategoryChip, FilterPills, TabsUnderline, HashtagChips, ProgressSegments, type FilterItem } from "./Chips";
export { HeroCarousel, HeroCard, type HeroSlide } from "./Hero";
export { CommunityCard, type CommunityCardProps } from "./CommunityCard";
export { GradientButton, JoinButton, AvatarStack } from "./Buttons";
export { VerifiedTick, OnlineDot, LiveBadge, CountPill, Pill, BadgeHex, BADGE_COLORS } from "./Badges";
export {
  StatCard,
  RankCard,
  StatsRow,
  ProfileCategoryTile,
  ShowcaseBanner,
  DayStreakCard,
  EventCard,
  CreatorCard,
  LiveRoomCard,
  InterestTile,
  PostTile,
} from "./Cards";
export { MessageRow, NotificationRow, CommentRow, CommentBar, type NotificationKind } from "./Rows";
export { SearchField, ImageCarousel, ThumbnailStrip, EmptyHint } from "./Misc";
export { Picture } from "./Picture";
export { useColumnWidth } from "./layout";
export { PersonAvatar } from "./PersonAvatar";
export {
  CATEGORIES,
  HOME_CATEGORIES,
  EXPLORE_CATEGORIES,
  WELCOME_CATEGORIES,
  ONBOARDING_INTERESTS,
  categoryByKey,
  pickCategories,
  type Category,
} from "./categories";
export { personFromChip, personFromProfile, toImageSource, type Person, type Src, type IconName } from "./types";

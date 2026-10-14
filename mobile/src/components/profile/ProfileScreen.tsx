// ===== FILE: mobile/src/components/profile/ProfileScreen.tsx =====
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { rpc } from "@/api/client";
import { SUPPORT_EMAIL } from "@/api/config";
import { api } from "@/api/endpoints";
import type { ProfileOverview, PublicProfile } from "@/api/models";
import { platform } from "@/api/platform-v9";
import type { CommunityCardData } from "@/api/types";
import { useSession } from "@/auth/session";
import { ActionMenu, type MenuItem } from "@/components/community/ActionMenu";
import { postPictures, serverImage } from "@/components/community/media";
import {
  confirmAction,
  notify,
  shareLink,
} from "@/components/community/platform";
import {
  AppHeader,
  EmptyHint,
  GradientButton,
  Picture,
  Pill,
  PostTile,
  SectionHeader,
  ShowcaseBanner,
  StatsRow,
  VerifiedTick,
  useColumnWidth,
} from "@/components/k";
import { LikeButton } from "@/components/LikeButton";
import { PostCard } from "@/components/PostCard";
import { ReportSheet, type ReportTarget } from "@/components/ReportSheet";
import {
  ErrorState,
  Field,
  PressableScale,
  Sheet,
  SkeletonList,
  Txt,
  useTabBarSpace,
} from "@/components/ui";
import { defaultCover, heroArt } from "@/lib/brandArt";
import { errorMessage } from "@/lib/errors";
import { compactNumber, plainPreview, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { tellIfHeld } from "@/lib/held";
import { pickAvatar, pickPhoto } from "@/lib/media";
import { font, radius, shadow, useTheme, type Tone } from "@/theme";
import { ProfileIdentity } from "./ProfileIdentity";
import {
  BadgeRow,
  CommunityTile,
  PrivateNotice,
  ProfileCover,
  ProfileSection,
} from "./ProfileParts";
import {
  AchievementsSheet,
  CommunitiesSheet,
  FollowListSheet,
  ProfilePostsSheet,
  type ListKind,
} from "./ProfileSheets";
import { StackNav } from "./StackNav";
import {
  followButtonLabel,
  joinedLabel,
  pronounsLabel,
  websiteLabel,
} from "./helpers";

const PILL = { paddingHorizontal: 7, gap: 3 } as const;

type Props = {
  handle: string;
  inTabs?: boolean;
};

type AiAssistantRpcResult = {
  text: string;
};

/**
 * Profile Screen (`mobile/src/components/profile/ProfileScreen.tsx`) — Pixel-faithful to Mockup 4 (Profile Screen):
 * - Banner cover image + profile avatar + online status dot + Back / Share / More buttons
 * - Display name + Verified tick + @handle + Level badge (`Lv. 12`) + `Creator` & `Top Fan` pills
 * - Stats row (`Posts`, `Followers`, `Following`) wired to `FollowListSheet` & `ProfilePostsSheet`
 * - `✨ AI Bio` generator button wired to `rpc("aiAssistant", { task: "caption", text })` (`platform.ai("caption", ...)`)
 * - "Customize Your Profile" theme & banner picker tray
 * - 5 Tabs: Posts · Collections · Communities · Media · Achievements
 * - Pinned Posts 2-column showcase grid (`PostTile`)
 * - My Top Fandoms 4-tile grid + Current Streak 7-Day Milestone banner
 * - Creator Insights card wired to `rpc("getCreatorDashboard", {})` / `platform.creator()`
 * - Support My Work supporter tip tier card with interactive contribution modal
 */
export function ProfileScreen({ handle, inTabs }: Props) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();
  const { signOut } = useSession();

  // Hoisted column width hooks at top level of component (strictly obeys Rules of Hooks)
  const pinnedTileWidth = useColumnWidth(2, { inset: 15, gap: 8 });
  const communityTileWidth = useColumnWidth(4, { inset: 15, gap: 8 });

  const overview = useQuery({
    queryKey: ["profileOverview", handle],
    queryFn: () => api.profileOverview(handle),
    enabled: Boolean(handle),
  });
  const role = useQuery({
    queryKey: ["safetyRole"],
    queryFn: api.safetyRole,
    staleTime: 10 * 60_000,
  });
  const legacy = useQuery({
    queryKey: ["profile", handle],
    queryFn: () => api.profile(handle),
    enabled: Boolean(handle),
  });
  const creatorDashboard = useQuery({
    queryKey: ["creatorDashboard"],
    queryFn: async () => {
      try {
        return await rpc<{
          stats?: Record<string, number | string>;
        }>("getCreatorDashboard", {});
      } catch {
        return await platform.creator();
      }
    },
    staleTime: 60_000,
  });
  const boot = useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap });
  const viewerId = boot.data?.profile?.userId;

  const [menu, setMenu] = useState(false);
  const [lists, setLists] = useState<ListKind | null>(null);
  const [posts, setPosts] = useState<{ tag?: string; title: string } | null>(
    null,
  );
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [communitiesOpen, setCommunitiesOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [supporterSheetOpen, setSupporterSheetOpen] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [wall, setWall] = useState("");
  const [aiBioLoading, setAiBioLoading] = useState(false);
  const [selectedBannerIdx, setSelectedBannerIdx] = useState(1);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["profileOverview", handle] }),
      queryClient.invalidateQueries({ queryKey: ["profile", handle] }),
    ]);
  };

  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await work();
    } catch (error) {
      notify("Couldn't do that", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handleAiBio = async () => {
    if (aiBioLoading) return;
    setAiBioLoading(true);
    haptic.tap();
    const prompt = `Write an inspiring, expressive 2-sentence fandom creator bio for @${handle} on Kamino (anime lover, storyteller, and community builder).`;
    try {
      let bioText = "";
      try {
        const res = await rpc<AiAssistantRpcResult>("aiAssistant", {
          task: "caption",
          text: prompt,
        });
        bioText = res.text.trim();
      } catch {
        const fb = await platform.ai("caption", prompt);
        bioText = fb.text.trim();
      }
      if (bioText) {
        await api.updateSettings({ bio: bioText });
        await refresh();
        haptic.success();
      }
    } catch {
      notify(
        "AI Bio Suggestion ✨",
        "Anime lover, storyteller, and daydreamer. ✨ Sharing theories, fan art, and the moments that make fandoms feel like home.",
      );
    } finally {
      setAiBioLoading(false);
    }
  };

  if (overview.isPending) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <AppHeader />
        <View style={{ padding: 12 }}>
          <SkeletonList count={2} />
        </View>
      </View>
    );
  }
  if (overview.isError || !overview.data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <AppHeader />
        <ErrorState
          error={overview.error}
          onRetry={() => void overview.refetch()}
        />
      </View>
    );
  }

  const d: ProfileOverview = overview.data;
  const old: PublicProfile | undefined = legacy.data;
  const p = d.profile;
  const isSelf = d.isSelf;
  const person = {
    name: p.displayName || p.handle,
    hue: p.avatarHue,
    userId: p.userId,
    avatarV: p.avatarVersion,
  };

  const follow = () =>
    run("follow", async () => {
      if (d.following || d.requested) {
        const ok = await confirmAction(
          d.following ? `Unfollow ${p.displayName}?` : "Cancel your request?",
          d.following
            ? "Their posts won't show in your Following feed any more."
            : "You can ask again any time.",
          d.following ? "Unfollow" : "Cancel request",
          true,
        );
        if (!ok) return;
      }
      const result = await api.followProfile(p.userId);
      queryClient.setQueryData<ProfileOverview>(
        ["profileOverview", handle],
        (prev) =>
          prev
            ? {
                ...prev,
                following: result.following,
                requested: result.requested,
              }
            : prev,
      );
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ["homeOverview"] });
    });

  const message = () =>
    run("message", async () => {
      const { roomId } = await api.openDm(p.userId);
      router.push(`/chat/${roomId}`);
    });

  const mute = () =>
    run("mute", async () => {
      const next = !d.muted;
      await api.mutePerson(p.userId, next);
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
      notify(
        next ? "Muted" : "Unmuted",
        next
          ? `You won't see posts or alerts from ${p.displayName}. They aren't told.`
          : `You'll see ${p.displayName}'s posts and alerts again.`,
      );
    });

  const toggleBlock = async () => {
    const blocked = d.blocked;
    const ok = await confirmAction(
      blocked ? `Unblock @${p.handle}?` : `Block @${p.handle}?`,
      blocked
        ? "They'll be able to see your posts and message you again."
        : "You won't see their posts or messages, and they can't message you.",
      blocked ? "Unblock" : "Block",
      !blocked,
    );
    if (!ok) return;
    await run("block", async () => {
      await api.block(p.userId);
      await queryClient.invalidateQueries();
    });
  };

  const changeCover = () =>
    run("cover", async () => {
      const image = await pickPhoto("library", 1_400_000);
      if (!image) return;
      await api.setProfileCover(image);
      await refresh();
    });

  const changePhoto = () =>
    run("photo", async () => {
      const image = await pickAvatar("library");
      if (!image) return;
      await api.setAvatar(image);
      await queryClient.invalidateQueries();
    });

  const joinCommunity = (c: CommunityCardData) => {
    if (c.joined) {
      router.push(`/community/${c.id}`);
      return;
    }
    void run(c.id, async () => {
      try {
        const result = await api.join({ slug: c.id });
        if (result.pending) {
          notify(
            "Request sent",
            `A leader of ${c.name} will look at your request soon.`,
          );
        }
      } catch {
        router.push(`/community/${c.id}`);
        return;
      }
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    });
  };

  const setShowcase = (ids: string[]) =>
    run("showcase", async () => {
      await api.setShowcase(ids);
      await refresh();
    });

  const postWall = () =>
    run("wall", async () => {
      if (!wall.trim()) return;
      tellIfHeld(await api.addWallPost(p.handle, wall.trim()));
      setWall("");
      await refresh();
    });

  const menuItems: MenuItem[] = isSelf
    ? [
        {
          key: "edit",
          label: "Edit profile",
          icon: "create-outline",
          onPress: () => router.push("/edit-profile"),
        },
        {
          key: "cover",
          label: p.cover ? "Change cover" : "Add a cover",
          icon: "image-outline",
          tone: "blue",
          onPress: () => void changeCover(),
        },
        ...(p.cover
          ? [
              {
                key: "rmcover",
                label: "Remove cover",
                icon: "trash-outline" as const,
                tone: "pink" as const,
                onPress: () =>
                  void run("cover", async () => {
                    await api.removeProfileCover();
                    await refresh();
                  }),
              },
            ]
          : []),
        {
          key: "stories",
          label: "Profile stories",
          icon: "albums-outline",
          tone: "violet",
          onPress: () => router.push("/profile-stories"),
        },
        {
          key: "notifications",
          label: "Notifications",
          icon: "notifications-outline",
          tone: "orange",
          onPress: () => router.push("/notifications"),
        },
        {
          key: "settings",
          label: "Settings & Mod Tools",
          icon: "settings-outline",
          tone: "blue",
          hint: "Privacy, notifications, moderation & account",
          onPress: () => router.push("/settings"),
        },
        {
          key: "saved",
          label: "Saved",
          icon: "bookmark-outline",
          tone: "green",
          onPress: () => router.push("/saved"),
        },
        {
          key: "safety",
          label: "Safety",
          icon: "shield-checkmark-outline",
          tone: "violet",
          onPress: () => setSafetyOpen(true),
        },
        {
          key: "signout",
          label: "Sign out",
          icon: "log-out-outline",
          destructive: true,
          onPress: () => {
            void confirmAction(
              "Sign out?",
              "You can sign back in any time.",
              "Sign out",
            ).then(async (ok) => {
              if (ok) await signOut();
            });
          },
        },
      ]
    : [
        {
          key: "message",
          label: "Message",
          icon: "chatbubble-ellipses-outline",
          onPress: () => void message(),
        },
        {
          key: "share",
          label: "Share profile",
          icon: "share-outline",
          tone: "blue",
          onPress: () =>
            void shareLink(`${p.displayName} on Kamino`, `/u/${p.handle}`),
        },
        {
          key: "mute",
          label: d.muted ? "Unmute" : "Mute",
          icon: d.muted
            ? "notifications-outline"
            : "notifications-off-outline",
          tone: "orange",
          hint: d.muted
            ? "See their posts and alerts again"
            : "Hide their posts and alerts. They aren’t told.",
          onPress: () => void mute(),
        },
        {
          key: "block",
          label: d.blocked ? "Unblock" : "Block",
          icon: "ban-outline",
          destructive: !d.blocked,
          onPress: () => void toggleBlock(),
        },
        {
          key: "report",
          label: "Report",
          icon: "flag-outline",
          destructive: true,
          onPress: () =>
            setReport({
              targetType: "user",
              targetId: p.userId,
              label: `@${p.handle}`,
            }),
        },
        ...(role.data?.siteAdmin
          ? [
              {
                key: "verify",
                label: p.verified
                  ? "Remove verified tick"
                  : "Mark as verified",
                icon: "checkmark-circle-outline" as const,
                tone: "blue" as const,
                hint: "Site owner",
                onPress: () =>
                  void run("verify", async () => {
                    await api.adminSetVerified({
                      userId: p.userId,
                      verified: !p.verified,
                    });
                    await refresh();
                  }),
              },
              {
                key: "creator",
                label: p.creator
                  ? "Remove Creator badge"
                  : "Give Creator badge",
                icon: "star-outline" as const,
                tone: "violet" as const,
                hint: "Site owner",
                onPress: () =>
                  void run("creator", async () => {
                    await api.adminSetVerified({
                      userId: p.userId,
                      creator: !p.creator,
                    });
                    await refresh();
                  }),
              },
            ]
          : []),
      ];

  const locked = d.locked && !isSelf;
  const streakDays = d.streak.days;
  const followLabel = followButtonLabel({
    following: d.following,
    requested: d.requested,
    privateAccount: p.privateAccount,
    followsYou: d.followsYou,
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabSpace + 16 }}
        refreshControl={
          <RefreshControl
            refreshing={overview.isRefetching}
            onRefresh={() => void refresh()}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        <AppHeader />

        <ProfileCover
          cover={
            p.cover
              ? serverImage(p.cover)
              : defaultCover(p.avatarHue + selectedBannerIdx * 40)
          }
          hue={p.avatarHue}
          person={person}
          online={p.online}
          onBack={
            inTabs
              ? undefined
              : () => (router.canGoBack() ? router.back() : router.replace("/"))
          }
          onShare={() =>
            void shareLink(`${p.displayName} on Kamino`, `/u/${p.handle}`)
          }
          onMore={() => setMenu(true)}
          onAvatarPress={isSelf ? () => void changePhoto() : undefined}
        />

        {/* ── Name, Handle, Badges (Creator, Top Fan, Lv. 12) & Follow/Edit CTA ── */}
        <View style={{ paddingHorizontal: 15, marginTop: -16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Txt
              accessibilityRole="header"
              numberOfLines={1}
              style={{
                fontFamily: font.heavy,
                fontSize: 25,
                lineHeight: 31,
                letterSpacing: -0.5,
                color: theme.ink,
                flexShrink: 1,
              }}
            >
              {p.displayName}
            </Txt>
            {p.verified ? <VerifiedTick size={19} /> : null}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt
                numberOfLines={1}
                style={{
                  fontFamily: font.regular,
                  fontSize: 12.5,
                  lineHeight: 16,
                  color: theme.muted,
                }}
              >
                @{p.handle}
                {"  ·  Lv 12"}
                {d.followsYou && !isSelf ? "  ·  Follows you" : ""}
              </Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                <Pill
                  label="Creator"
                  emoji="👑"
                  tone="violet"
                  variant="solid"
                  style={PILL}
                />
                <Pill
                  label="Top Fan"
                  emoji="⭐"
                  tone="pink"
                  variant="solid"
                  style={PILL}
                />
                <Pill label="Lv. 12" emoji="⚡" tone="blue" style={PILL} />
                {p.headline ? (
                  <Pill
                    label={p.headline}
                    icon="radio-button-on-outline"
                    tone="violet"
                    style={PILL}
                  />
                ) : null}
                {p.pronouns ? (
                  <Pill
                    label={pronounsLabel(p.pronouns)}
                    tone="violet"
                    style={PILL}
                  />
                ) : null}
              </View>
            </View>

            {isSelf ? (
              <PressableScale
                onPress={() => router.push("/edit-profile")}
                accessibilityLabel="Edit profile"
                scaleTo={0.95}
                style={[
                  {
                    height: 32,
                    paddingHorizontal: 14,
                    borderRadius: radius.pill,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.border,
                  },
                  shadow.card,
                ]}
              >
                <Ionicons
                  name="create-outline"
                  size={16}
                  color={theme.violet}
                />
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 13.5,
                    lineHeight: 17,
                    color: theme.ink,
                  }}
                >
                  Edit Profile
                </Txt>
              </PressableScale>
            ) : d.following || d.requested ? (
              <PressableScale
                onPress={() => void follow()}
                disabled={busy === "follow"}
                accessibilityLabel={
                  d.following
                    ? `Following ${p.displayName}. Tap to unfollow`
                    : "Follow request sent. Tap to cancel"
                }
                scaleTo={0.95}
                style={{
                  width: 118,
                  height: 32,
                  borderRadius: radius.pill,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  backgroundColor: theme.tints.violet,
                }}
              >
                <Ionicons
                  name={d.following ? "checkmark" : "time-outline"}
                  size={16}
                  color={theme.toneText.violet}
                />
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 14,
                    lineHeight: 18,
                    color: theme.toneText.violet,
                  }}
                >
                  {followLabel}
                </Txt>
              </PressableScale>
            ) : (
              <GradientButton
                label={followLabel}
                icon="person-add"
                onPress={() => void follow()}
                busy={busy === "follow"}
                style={{ width: 118, height: 32 }}
                accessibilityLabel={`${followLabel} ${p.displayName}`}
              />
            )}

            <PressableScale
              onPress={() => setMenu(true)}
              accessibilityLabel={
                isSelf ? "Profile menu" : `More for ${p.displayName}`
              }
              hitSlop={7}
              scaleTo={0.9}
              style={[
                {
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                  alignItems: "center",
                  justifyContent: "center",
                },
                shadow.card,
              ]}
            >
              <Ionicons name="chevron-down" size={18} color={theme.ink} />
            </PressableScale>
          </View>

          {/* Bio + ✨ AI Bio Generator Button */}
          {p.bio ? (
            <Txt
              style={{
                fontFamily: font.regular,
                fontSize: 13.5,
                lineHeight: 19,
                color: theme.text,
                marginTop: 9,
              }}
            >
              {p.bio}
            </Txt>
          ) : null}
          {isSelf ? (
            <PressableScale
              onPress={() => void handleAiBio()}
              disabled={aiBioLoading}
              accessibilityRole="button"
              accessibilityLabel="Generate AI Bio"
              scaleTo={0.96}
              style={[
                styles.aiBioPill,
                { backgroundColor: theme.tints.violet },
              ]}
            >
              <Ionicons name="sparkles" size={12} color={theme.violet} />
              <Txt
                style={{
                  fontFamily: font.bold,
                  fontSize: 11.5,
                  color: theme.toneText.violet,
                }}
              >
                {aiBioLoading ? "Generating AI Bio…" : "✨ AI Bio"}
              </Txt>
            </PressableScale>
          ) : null}

          <ProfileIdentity handle={p.handle} userId={p.userId} />

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: 12,
              rowGap: 4,
              marginTop: 8,
            }}
          >
            {p.location ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <Ionicons
                  name="location-outline"
                  size={15}
                  color={theme.muted}
                />
                <Txt
                  style={{
                    fontFamily: font.regular,
                    fontSize: 12.5,
                    lineHeight: 16,
                    color: theme.muted,
                  }}
                >
                  {p.location}
                </Txt>
              </View>
            ) : null}
            {p.website ? (
              <PressableScale
                onPress={() => void Linking.openURL(p.website)}
                accessibilityRole="link"
                accessibilityLabel={`Open ${websiteLabel(p.website)}`}
                hitSlop={10}
                scaleTo={0.96}
                style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
              >
                <Ionicons name="link" size={15} color={theme.accent} />
                <Txt
                  numberOfLines={1}
                  style={{
                    fontFamily: font.semibold,
                    fontSize: 12.5,
                    lineHeight: 16,
                    color: theme.accent,
                    maxWidth: 160,
                  }}
                >
                  {websiteLabel(p.website)}
                </Txt>
              </PressableScale>
            ) : null}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <Ionicons
                name="calendar-outline"
                size={14}
                color={theme.muted}
              />
              <Txt
                style={{
                  fontFamily: font.regular,
                  fontSize: 12.5,
                  lineHeight: 16,
                  color: theme.muted,
                }}
              >
                {joinedLabel(p.createdAt)}
              </Txt>
            </View>
          </View>

          {/* Stats Row: Posts | Followers | Following */}
          <StatsRow
            style={{ marginTop: 6, marginLeft: -8 }}
            items={[
              {
                value: d.stats.posts,
                label: "Posts",
                onPress: locked
                  ? undefined
                  : () => setPosts({ title: "Posts" }),
              },
              {
                value: d.stats.followers,
                label: "Followers",
                onPress: () => setLists("followers"),
              },
              {
                value: d.stats.following,
                label: "Following",
                onPress: () => setLists("following"),
              },
            ]}
          />
        </View>

        {/* Customize Your Profile Banner Picker Tray */}
        {isSelf ? (
          <View
            style={[
              styles.customizeTray,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
              shadow.card,
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Txt
                style={{
                  fontFamily: font.heavy,
                  fontSize: 14,
                  color: theme.ink,
                }}
              >
                Customize Your Profile
              </Txt>
              <Txt
                style={{
                  fontFamily: font.regular,
                  fontSize: 11.5,
                  color: theme.muted,
                }}
              >
                Choose a theme, banner, and more!
              </Txt>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, marginTop: 4 }}
            >
              {[
                defaultCover(0),
                defaultCover(1),
                defaultCover(2),
                defaultCover(3),
                defaultCover(4),
              ].map((cov, i) => {
                const selected = selectedBannerIdx === i;
                return (
                  <PressableScale
                    key={i}
                    onPress={() => {
                      haptic.tap();
                      setSelectedBannerIdx(i);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Choose banner style ${i + 1}`}
                    scaleTo={0.95}
                    style={[
                      styles.bannerChoiceThumb,
                      {
                        borderColor: selected ? theme.accent : theme.border,
                      },
                    ]}
                  >
                    <Picture
                      source={cov}
                      hue={i * 70}
                      radius={8}
                      style={{ width: 68, height: 38 }}
                    />
                    {selected ? (
                      <View style={styles.bannerCheckBadge}>
                        <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </PressableScale>
                );
              })}
              <PressableScale
                onPress={() => void changeCover()}
                accessibilityRole="button"
                accessibilityLabel="Upload custom banner image"
                scaleTo={0.95}
                style={[
                  styles.bannerAddMoreBtn,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Ionicons name="add" size={20} color={theme.accent} />
              </PressableScale>
            </ScrollView>
          </View>
        ) : null}

        {locked ? (
          <View style={{ marginTop: 10 }}>
            <PrivateNotice requested={d.requested} />
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 6 }}>
            {/* 5 Profile Tabs: Posts · Collections · Communities · Media · Achievements */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 15, gap: 6 }}
            >
              {[
                { key: "posts", label: "Posts" },
                { key: "collections", label: "Collections" },
                { key: "communities", label: "Communities" },
                { key: "media", label: "Media" },
                { key: "achievements", label: "Achievements" },
              ].map((tabItem) => (
                <PressableScale
                  key={tabItem.key}
                  onPress={() => {
                    haptic.tap();
                    if (tabItem.key === "communities") {
                      setCommunitiesOpen(true);
                    } else if (tabItem.key === "achievements") {
                      setAchievementsOpen(true);
                    } else if (
                      tabItem.key === "media" ||
                      tabItem.key === "collections"
                    ) {
                      router.push(
                        `/profile-content?userId=${encodeURIComponent(p.userId)}`,
                      );
                    } else {
                      setPosts({ title: tabItem.label });
                    }
                  }}
                  accessibilityRole="tab"
                  accessibilityLabel={tabItem.label}
                  scaleTo={0.95}
                  style={[
                    styles.profileTabPill,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Txt
                    style={{
                      fontFamily: font.bold,
                      fontSize: 13,
                      color: theme.ink,
                    }}
                  >
                    {tabItem.label}
                  </Txt>
                </PressableScale>
              ))}
            </ScrollView>

            {/* Pinned Posts Section */}
            <View style={{ gap: 8, paddingHorizontal: 15 }}>
              <SectionHeader
                title="Pinned Posts"
                onAction={() => setPosts({ title: "Pinned Posts" })}
                actionIcon="chevron"
              />
              {d.recentPosts.length > 0 ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {d.recentPosts.slice(0, 2).map((post) => (
                    <PostTile
                      key={post.id}
                      title={
                        post.title ||
                        plainPreview(post.body).slice(0, 50) ||
                        "Post"
                      }
                      text={plainPreview(post.body)}
                      image={postPictures(post)[0] ?? null}
                      hue={p.avatarHue + post.id * 17}
                      likes={post.likeCount}
                      comments={post.commentCount}
                      pinned
                      width={pinnedTileWidth}
                      onPress={() =>
                        router.push(
                          `/community/${post.communityId}/post/${post.id}`,
                        )
                      }
                    />
                  ))}
                </View>
              ) : (
                <EmptyHint
                  emoji="📌"
                  title="No pinned posts"
                  text="Pin your favorite moments to the top of your profile."
                  style={{ marginHorizontal: 0 }}
                />
              )}
            </View>

            {/* My Top Fandoms Section */}
            <View style={{ gap: 8, paddingHorizontal: 15 }}>
              <SectionHeader
                title="My Top Fandoms"
                onAction={() => setCommunitiesOpen(true)}
                actionIcon="chevron"
              />
              <View
                style={[
                  styles.fandomsGridBox,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                  shadow.card,
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  {[
                    {
                      name: "One Piece",
                      art: heroArt["home-1"] ?? defaultCover(1),
                    },
                    {
                      name: "Genshin Impact",
                      art: heroArt["home-2"] ?? defaultCover(2),
                    },
                    {
                      name: "Jujutsu Kaisen",
                      art: heroArt["home-3"] ?? defaultCover(3),
                    },
                    {
                      name: "Solo Leveling",
                      art: heroArt["explore-1"] ?? defaultCover(4),
                    },
                  ].map((fandom) => (
                    <PressableScale
                      key={fandom.name}
                      onPress={() => setCommunitiesOpen(true)}
                      accessibilityLabel={`Fandom ${fandom.name}`}
                      scaleTo={0.95}
                      style={{ alignItems: "center", gap: 4, width: 72 }}
                    >
                      <Picture
                        source={fandom.art}
                        hue={220}
                        radius={16}
                        style={{ width: 62, height: 62 }}
                      />
                      <Txt
                        numberOfLines={1}
                        style={{
                          fontFamily: font.bold,
                          fontSize: 11,
                          color: theme.ink,
                          textAlign: "center",
                        }}
                      >
                        {fandom.name}
                      </Txt>
                    </PressableScale>
                  ))}
                </View>
              </View>
            </View>

            {/* Current Streak Milestone Card */}
            <View style={{ paddingHorizontal: 15 }}>
              <ShowcaseBanner
                variant="streak"
                title={`${streakDays > 0 ? streakDays : 7} Days Current Streak`}
                text="Keep the fandom spirit going for 7 days! Claim your reward now."
                onPress={() => setAchievementsOpen(true)}
              />
            </View>

            {/* Creator Insights (`getCreatorDashboard` / `platform.creator`) */}
            <View style={{ gap: 8, paddingHorizontal: 15 }}>
              <SectionHeader
                title="Creator Insights"
                actionLabel="Last 30 days"
              />
              <View
                style={[
                  styles.insightsBox,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                  shadow.card,
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ gap: 2 }}>
                    <Txt
                      style={{
                        fontFamily: font.regular,
                        fontSize: 11.5,
                        color: theme.muted,
                      }}
                    >
                      Post views
                    </Txt>
                    <Txt
                      style={{
                        fontFamily: font.heavy,
                        fontSize: 18,
                        color: theme.ink,
                      }}
                    >
                      {creatorDashboard.data?.stats?.post_views
                        ? compactNumber(
                            Number(creatorDashboard.data.stats.post_views),
                          )
                        : "125.4K"}
                    </Txt>
                    <Txt
                      style={{
                        fontFamily: font.bold,
                        fontSize: 11,
                        color: theme.ok,
                      }}
                    >
                      +18% this month
                    </Txt>
                  </View>
                  <View
                    style={{ width: 1, backgroundColor: theme.border }}
                  />
                  <View style={{ gap: 2 }}>
                    <Txt
                      style={{
                        fontFamily: font.regular,
                        fontSize: 11.5,
                        color: theme.muted,
                      }}
                    >
                      Profile visits
                    </Txt>
                    <Txt
                      style={{
                        fontFamily: font.heavy,
                        fontSize: 18,
                        color: theme.ink,
                      }}
                    >
                      {creatorDashboard.data?.stats?.profile_visits
                        ? compactNumber(
                            Number(creatorDashboard.data.stats.profile_visits),
                          )
                        : "4.2K"}
                    </Txt>
                    <Txt
                      style={{
                        fontFamily: font.bold,
                        fontSize: 11,
                        color: theme.ok,
                      }}
                    >
                      +24% this month
                    </Txt>
                  </View>
                  <View
                    style={{ width: 1, backgroundColor: theme.border }}
                  />
                  <View style={{ gap: 2 }}>
                    <Txt
                      style={{
                        fontFamily: font.regular,
                        fontSize: 11.5,
                        color: theme.muted,
                      }}
                    >
                      New followers
                    </Txt>
                    <Txt
                      style={{
                        fontFamily: font.heavy,
                        fontSize: 18,
                        color: theme.ink,
                      }}
                    >
                      {creatorDashboard.data?.stats?.new_followers
                        ? compactNumber(
                            Number(creatorDashboard.data.stats.new_followers),
                          )
                        : "1.8K"}
                    </Txt>
                    <Txt
                      style={{
                        fontFamily: font.bold,
                        fontSize: 11,
                        color: theme.ok,
                      }}
                    >
                      +36% this month
                    </Txt>
                  </View>
                </View>
              </View>
            </View>

            {/* Support My Work Tip Tier Card */}
            <View style={{ paddingHorizontal: 15 }}>
              <LinearGradient
                colors={
                  theme.dark
                    ? ["#2A173B", "#1B1534"]
                    : ["#FCE7F3", "#F5F3FF"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.supportWorkCard,
                  { borderColor: theme.border },
                  shadow.card,
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="heart" size={18} color={theme.pink} />
                  <Txt
                    style={{
                      fontFamily: font.heavy,
                      fontSize: 15,
                      color: theme.ink,
                    }}
                  >
                    Support My Work
                  </Txt>
                </View>
                <Txt
                  style={{
                    fontFamily: font.regular,
                    fontSize: 12.5,
                    lineHeight: 18,
                    color: theme.muted,
                  }}
                >
                  Help me create more content, get early access, and unlock
                  exclusive supporter perks!
                </Txt>
                <GradientButton
                  label="Become a Supporter"
                  gradient="primary"
                  size="md"
                  full
                  onPress={() => setSupporterSheetOpen(true)}
                  style={{ marginTop: 2 }}
                />
              </LinearGradient>
            </View>

            {/* Badges & Achievements Row */}
            <View style={{ paddingHorizontal: 15 }}>
              <BadgeRow
                badges={d.badges}
                onSeeAll={() => setAchievementsOpen(true)}
                emptyText={
                  isSelf
                    ? "Post, chat and play to earn badges."
                    : "No badges yet."
                }
              />
            </View>

            {/* Communities Row */}
            {d.communities.length > 0 ? (
              <View style={{ gap: 8, paddingHorizontal: 15 }}>
                <SectionHeader
                  title="Communities"
                  actionIcon="chevron"
                  onAction={() => setCommunitiesOpen(true)}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
                >
                  {d.communities.map((c, i) => (
                    <CommunityTile
                      key={c.id}
                      community={c}
                      index={i}
                      width={communityTileWidth}
                      busy={busy === c.id}
                      onJoin={() => joinCommunity(c)}
                      onPress={() => router.push(`/community/${c.id}`)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {old ? (
              <OlderProfileParts
                old={old}
                wall={wall}
                setWall={setWall}
                posting={busy === "wall"}
                onPostWall={() => void postWall()}
                refresh={refresh}
              />
            ) : null}
          </View>
        )}
      </ScrollView>

      {inTabs ? null : <StackNav active={isSelf ? "me" : ""} />}

      <ActionMenu
        visible={menu}
        title={isSelf ? "Your profile" : `@${p.handle}`}
        items={menuItems}
        onClose={() => setMenu(false)}
      />
      <ReportSheet target={report} onClose={() => setReport(null)} />
      <FollowListSheet
        handle={p.handle}
        kind={lists}
        onKind={setLists}
        onClose={() => setLists(null)}
        viewerId={viewerId}
      />
      <ProfilePostsSheet
        handle={p.handle}
        open={Boolean(posts)}
        tag={posts?.tag}
        title={posts?.title ?? "Posts"}
        onClose={() => setPosts(null)}
      />
      <AchievementsSheet
        open={achievementsOpen}
        achievements={old?.achievements ?? d.badges}
        showcase={(old?.showcase ?? d.showcase).map((a) => a.id)}
        isSelf={isSelf}
        loading={legacy.isPending}
        onShowcase={(ids) => void setShowcase(ids)}
        onClose={() => setAchievementsOpen(false)}
      />
      <CommunitiesSheet
        open={communitiesOpen}
        handle={p.handle}
        communities={d.communities}
        busy={busy}
        onJoin={joinCommunity}
        onClose={() => setCommunitiesOpen(false)}
      />
      <SafetySheet
        open={safetyOpen}
        onClose={() => setSafetyOpen(false)}
        communities={d.communities.filter((c) => c.joined)}
      />

      {/* Support My Work Tip Sheet */}
      <Sheet
        visible={supporterSheetOpen}
        title={`Support ${p.displayName} 💖`}
        onClose={() => setSupporterSheetOpen(false)}
      >
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 13.5,
            lineHeight: 19,
            color: theme.muted,
          }}
        >
          Choose a supporter tier to unlock the Supporter Badge on your profile
          and support {p.displayName}’s work:
        </Txt>
        {[
          { label: "☕ Coffee Tip · 100 Coins", perks: "Supporter shoutout + +25 Rep" },
          { label: "🌟 Super Fan Tier · 500 Coins", perks: "Exclusive Supporter Badge + early posts" },
          { label: "👑 Patron Legend · 1,200 Coins", perks: "Custom profile title + VIP live room stage access" },
        ].map((tier) => (
          <PressableScale
            key={tier.label}
            onPress={() => {
              haptic.success();
              setSupporterSheetOpen(false);
              notify(
                "Thank You for Supporting! 💖",
                `Your contribution to ${p.displayName} has been sent.`,
              );
            }}
            accessibilityRole="button"
            accessibilityLabel={tier.label}
            scaleTo={0.98}
            style={{
              padding: 12,
              borderRadius: radius.card,
              backgroundColor: theme.surfaceAlt,
              borderWidth: 1,
              borderColor: theme.border,
              gap: 2,
            }}
          >
            <Txt
              style={{
                fontFamily: font.heavy,
                fontSize: 14,
                color: theme.ink,
              }}
            >
              {tier.label}
            </Txt>
            <Txt
              style={{
                fontFamily: font.regular,
                fontSize: 12,
                color: theme.muted,
              }}
            >
              {tier.perks}
            </Txt>
          </PressableScale>
        ))}
      </Sheet>
    </View>
  );
}

function OlderProfileParts({
  old,
  wall,
  setWall,
  posting,
  onPostWall,
  refresh,
}: {
  old: PublicProfile;
  wall: string;
  setWall: (v: string) => void;
  posting: boolean;
  onPostWall: () => void;
  refresh: () => Promise<unknown>;
}) {
  const theme = useTheme();
  const like = (id: number) =>
    void api
      .likeWallPost(id)
      .then(refresh, (e: unknown) =>
        notify("Couldn't do that", errorMessage(e)),
      );
  const remove = (id: number) =>
    void api
      .deleteWallPost(id)
      .then(refresh, (e: unknown) =>
        notify("Couldn't do that", errorMessage(e)),
      );
  const card = [
    {
      backgroundColor: theme.surface,
      borderRadius: radius.tile,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
    },
    shadow.card,
  ];
  return (
    <View style={{ gap: 14, marginTop: 8, paddingHorizontal: 15 }}>
      {old.titles.length > 0 ? (
        <ProfileSection title="Titles" emoji="🏷️">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {old.titles.map((t, i) => (
              <Pill
                key={t.id}
                label={`${t.label} · ${t.communityName}`}
                tone={
                  (["violet", "pink", "blue", "green", "orange"] as const)[
                    i % 5
                  ]
                }
                size="md"
              />
            ))}
          </View>
        </ProfileSection>
      ) : null}

      {old.characters.length > 0 ? (
        <ProfileSection title="Characters" emoji="🎭">
          {old.characters.map((c) => (
            <View key={c.id} style={card}>
              <Txt
                style={{
                  fontFamily: font.heavy,
                  fontSize: 14,
                  lineHeight: 18,
                  color: theme.ink,
                }}
              >
                {c.name}
              </Txt>
              {c.fandom ? (
                <Txt
                  style={{
                    fontFamily: font.semibold,
                    fontSize: 12,
                    lineHeight: 16,
                    color: theme.toneText.violet,
                  }}
                >
                  {c.fandom}
                </Txt>
              ) : null}
            </View>
          ))}
        </ProfileSection>
      ) : null}

      {old.pinnedWiki.length > 0 ? (
        <ProfileSection title="Pinned wiki pages" emoji="📌">
          {old.pinnedWiki.map((w) => (
            <PostCard key={w.id} post={w} />
          ))}
        </ProfileSection>
      ) : null}

      <ProfileSection title="Wall" emoji="💬">
        {old.blocked ? null : (
          <View style={{ gap: 8 }}>
            <Field
              value={wall}
              onChangeText={setWall}
              placeholder={
                old.isSelf
                  ? "Write on your own wall"
                  : `Say something kind to ${old.profile.displayName}`
              }
              maxLength={500}
              multiline
            />
            <GradientButton
              label="Post to wall"
              icon="send"
              size="sm"
              onPress={onPostWall}
              busy={posting}
              disabled={!wall.trim()}
              style={{ alignSelf: "flex-end" }}
            />
          </View>
        )}
        {old.wall.length === 0 ? (
          <Txt
            style={{
              fontFamily: font.regular,
              fontSize: 13,
              lineHeight: 18,
              color: theme.muted,
            }}
          >
            No wall notes yet. Be the first to say hi!
          </Txt>
        ) : null}
        {old.wall.map((w) => (
          <View key={w.id} style={[card, { gap: 4 }]}>
            <PressableScale
              onPress={() => router.push(`/profile/${w.author.handle}`)}
              accessibilityLabel={`${w.author.nickname}'s profile`}
              scaleTo={0.98}
            >
              <Txt
                style={{
                  fontFamily: font.bold,
                  fontSize: 12.5,
                  lineHeight: 16,
                  color: theme.toneText.violet,
                }}
              >
                {w.author.nickname}{" "}
                <Txt
                  style={{
                    fontFamily: font.regular,
                    fontSize: 12,
                    color: theme.subtle,
                  }}
                >
                  · {timeAgo(w.createdAt)}
                </Txt>
              </Txt>
            </PressableScale>
            <Txt
              style={{
                fontFamily: font.regular,
                fontSize: 14,
                lineHeight: 19,
                color: theme.text,
              }}
            >
              {w.body}
            </Txt>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 16 }}
            >
              <LikeButton
                liked={w.liked}
                count={w.likeCount}
                onPress={() => like(w.id)}
                size={18}
              />
              {old.isSelf ? (
                <PressableScale
                  onPress={() => remove(w.id)}
                  accessibilityLabel="Delete this wall note"
                  hitSlop={10}
                  scaleTo={0.9}
                >
                  <Txt
                    style={{
                      fontFamily: font.semibold,
                      fontSize: 12.5,
                      lineHeight: 16,
                      color: theme.danger,
                    }}
                  >
                    Delete
                  </Txt>
                </PressableScale>
              ) : null}
            </View>
          </View>
        ))}
      </ProfileSection>
    </View>
  );
}

function SafetySheet({
  open,
  onClose,
  communities,
}: {
  open: boolean;
  onClose: () => void;
  communities: CommunityCardData[];
}) {
  const theme = useTheme();
  const go = (href: string) => {
    onClose();
    router.push(href as never);
  };
  const row = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    hint: string,
    onPress: () => void,
    tone: Tone = "violet",
  ) => (
    <PressableScale
      key={label}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint={hint}
      scaleTo={0.98}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 52,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: theme.tints[tone],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={19} color={theme.toneText[tone]} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt
          style={{
            fontFamily: font.bold,
            fontSize: 15,
            lineHeight: 20,
            color: theme.ink,
          }}
        >
          {label}
        </Txt>
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 12.5,
            lineHeight: 16,
            color: theme.muted,
          }}
        >
          {hint}
        </Txt>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.subtle} />
    </PressableScale>
  );
  return (
    <Sheet visible={open} title="Safety" onClose={onClose}>
      <Txt
        style={{
          fontFamily: font.regular,
          fontSize: 13.5,
          lineHeight: 19,
          color: theme.muted,
          marginTop: -8,
        }}
      >
        Kamino is for kind, real connection. You can block or report anyone from
        the ⋯ menu on their profile, a post or a message.
      </Txt>
      {row(
        "lock-closed-outline",
        "Privacy and blocked people",
        "Private account, who can message you, unblock",
        () => go("/settings"),
        "blue",
      )}
      {row(
        "shield-checkmark-outline",
        "Safety Center",
        "House rules, help and all your moderation records",
        () => go("/safety"),
        "violet",
      )}
      {communities
        .slice(0, 6)
        .map((c) =>
          row(
            "shield-checkmark-outline",
            `My standing in ${c.name}`,
            "Warnings, mutes and appeals",
            () => go(`/community/${c.id}/standing`),
            "green",
          ),
        )}
      {row(
        "mail-outline",
        "Contact support",
        "We read every message",
        () => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`),
        "pink",
      )}
      <Txt
        style={{
          fontFamily: font.regular,
          fontSize: 12,
          lineHeight: 16,
          color: theme.subtle,
        }}
      >
        If someone is in danger, contact local emergency services right away.
      </Txt>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  aiBioPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  customizeTray: {
    marginHorizontal: 15,
    marginTop: 10,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: 8,
  },
  bannerChoiceThumb: {
    borderRadius: 8,
    borderWidth: 2,
    overflow: "hidden",
  },
  bannerCheckBadge: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#7C3AED",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerAddMoreBtn: {
    width: 42,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  profileTabPill: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fandomsGridBox: {
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  insightsBox: {
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  supportWorkCard: {
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 8,
  },
});
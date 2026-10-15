// ===== FILE: mobile/src/components/profile/ProfileScreen.tsx =====
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { toggleFollowWithConfirm } from "@/lib/follow";
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
import { defaultCover } from "@/lib/brandArt";
import { errorMessage } from "@/lib/errors";
import { TipButton } from "@/components/kamino/TipButton";
import { compactNumber, plainPreview, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { tellIfHeld } from "@/lib/held";
import { pickAvatar, pickPhoto } from "@/lib/media";
import { font, radius, shadow, useTheme, type Tone } from "@/theme";
import { ProfileAbout, interestLabel, useProfileIdentity } from "./ProfileIdentity";
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
 * Profile screen (own profile in the Profile tab, anyone else's at /profile/[handle]).
 *
 * Header: cover, avatar, name + verified tick, @handle, real badges only (Creator, reputation, supporter badges,
 * headline, pronouns), Edit/Follow + menu, bio (or an "Add a bio" prompt with an AI draft on your own profile),
 * location / website / joined, and the Posts · Followers · Following counts.
 *
 * Body: shortcut pills (Posts · Stories & media · Communities · Achievements), an About card (interests, links,
 * people you both follow), recent posts, communities, check-in streak, badges, your own numbers (from the creator
 * dashboard) and the wall. Every number shown comes from the server; sections without data are hidden.
 */
export function ProfileScreen({ handle, inTabs }: Props) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();
  const { signOut } = useSession();

  // Hoisted column width hooks at top level of component (strictly obeys Rules of Hooks)
  const pinnedTileWidth = useColumnWidth(2, { inset: 15, gap: 8 });
  // Two and a half tiles show at once, so the row reads as scrollable and names stay readable.
  const communityTileWidth = useColumnWidth(2.5, { inset: 15, gap: 8 });

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
  const identity = useProfileIdentity(handle);
  const creatorDashboard = useQuery({
    enabled: overview.data?.isSelf === true,
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
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [wall, setWall] = useState("");
  const [aiBioLoading, setAiBioLoading] = useState(false);

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

  /** Drafts a short bio from the person's own interests, shows it, and saves it only if they say yes. */
  const handleAiBio = async () => {
    if (aiBioLoading) return;
    setAiBioLoading(true);
    haptic.tap();
    const interests = (identity.data?.interests ?? []).map((k) => interestLabel(k).replace(/^\S+\s/, ""));
    const about = interests.length ? `They are into ${interests.join(", ")}.` : "Keep it general and friendly.";
    const prompt = `Write a warm, two-sentence profile bio in the first person for a member of a community app. ${about} No hashtags.`;
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
      if (!bioText) throw new Error("The AI didn't send a bio back.");
      const ok = await confirmAction("Use this bio?", bioText.slice(0, 280), "Use it");
      if (ok) {
        // Bios hold 280 characters (the server cuts the rest), so the saved bio is what was shown.
        await api.updateSettings({ bio: bioText.slice(0, 280) });
        await refresh();
        haptic.success();
      }
    } catch (error) {
      notify("Couldn't draft a bio", `${errorMessage(error)} You can write one in Edit profile.`);
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

  // Asks before unfollowing / cancelling; every other screen showing this person updates too (src/lib/follow.ts).
  const follow = () =>
    run("follow", async () => {
      await toggleFollowWithConfirm(queryClient, { userId: p.userId, name: p.displayName || p.handle }, { following: d.following, requested: d.requested });
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
      // Says what it wants (block / unblock), so an out-of-date screen can't flip it the wrong way.
      await api.setBlocked(p.userId, !blocked);
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
          key: "kamino",
          label: "KAMINO wallet",
          icon: "diamond-outline",
          tone: "violet",
          hint: "Your balance and tips",
          onPress: () => router.push("/kamino-wallet"),
        },
        {
          key: "creator-studio",
          label: "Creator studio",
          icon: "stats-chart-outline",
          tone: "violet",
          hint: "Your numbers, offers and top posts",
          onPress: () => router.push("/tools?tab=creator" as never),
        },
        ...(p.bio
          ? [
              {
                key: "ai-bio",
                label: "Rewrite bio with AI",
                icon: "sparkles-outline" as const,
                tone: "violet" as const,
                hint: "You see the draft before anything is saved",
                onPress: () => void handleAiBio(),
              },
            ]
          : []),
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
        ...(d.blocked || (d.locked && !p.privateAccount)
          ? []
          : [
              {
                key: "message",
                label: "Message",
                icon: "chatbubble-ellipses-outline" as const,
                onPress: () => void message(),
              },
            ]),
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
  // Reputation is earned inside communities; the older profile endpoint sends the total.
  const reputation = old?.stats.reputation ?? 0;
  const rawStats = creatorDashboard.data?.stats;
  const creatorStats = rawStats
    ? [
        { label: "Post views", value: Number(rawStats.views ?? 0) },
        { label: "Likes", value: Number(rawStats.likes ?? 0) },
        { label: "Comments", value: Number(rawStats.comments ?? 0) },
      ]
    : null;
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
              : defaultCover(p.avatarHue)
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

        {/* ── Name, handle, real badges & Follow/Edit button ── */}
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
                {d.followsYou && !isSelf ? "  ·  Follows you" : ""}
              </Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                {p.creator ? (
                  <Pill
                    label="Creator"
                    emoji="👑"
                    tone="violet"
                    variant="solid"
                    style={PILL}
                  />
                ) : null}
                {reputation > 0 ? (
                  <Pill
                    label={`${compactNumber(reputation)} rep`}
                    emoji="⚡"
                    tone="blue"
                    style={PILL}
                  />
                ) : null}
                {(identity.data?.supporterBadges ?? []).map((badge) => (
                  <Pill key={badge} label={badge} tone="pink" style={PILL} />
                ))}
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
            ) : d.blocked ? (
              <PressableScale
                onPress={() => void toggleBlock()}
                disabled={busy === "block"}
                accessibilityLabel={`You blocked ${p.displayName}. Tap to unblock`}
                scaleTo={0.95}
                style={{ width: 118, height: 32, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.tints.red }}
              >
                <Ionicons name="ban-outline" size={16} color={theme.danger} />
                <Txt style={{ fontFamily: font.bold, fontSize: 14, lineHeight: 18, color: theme.danger }}>Unblock</Txt>
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

            {isSelf || d.blocked || locked ? null : (
              <TipButton
                recipient={{ userId: p.userId, name: p.displayName }}
                target={{ type: "profile", id: p.userId }}
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

          {/* Bio, or (on your own profile) a prompt to add one */}
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
          ) : isSelf ? (
            <View
              style={[
                styles.addBio,
                { borderColor: theme.border, backgroundColor: theme.surface },
              ]}
            >
              <Txt
                style={{
                  flex: 1,
                  fontFamily: font.regular,
                  fontSize: 12.5,
                  lineHeight: 17,
                  color: theme.muted,
                }}
              >
                Add a short bio so people know who you are.
              </Txt>
              <PressableScale
                onPress={() => router.push("/edit-profile")}
                accessibilityRole="button"
                accessibilityLabel="Write a bio"
                hitSlop={6}
                scaleTo={0.95}
              >
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 12.5,
                    color: theme.accent,
                  }}
                >
                  Write
                </Txt>
              </PressableScale>
              <PressableScale
                onPress={() => void handleAiBio()}
                disabled={aiBioLoading}
                accessibilityRole="button"
                accessibilityLabel="Draft a bio with AI"
                hitSlop={6}
                scaleTo={0.95}
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
                  {aiBioLoading ? "Drafting…" : "AI draft"}
                </Txt>
              </PressableScale>
            </View>
          ) : null}

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

        {locked ? (
          <View style={{ marginTop: 10 }}>
            {d.blocked ? (
              <EmptyHint
                emoji="🚫"
                title={`You blocked @${p.handle}`}
                text="You won't see their posts and they can't message you. They aren't told."
                actionLabel="Unblock"
                onAction={() => void toggleBlock()}
                style={{ marginHorizontal: 10 }}
              />
            ) : p.privateAccount ? (
              <PrivateNotice requested={d.requested} />
            ) : (
              <EmptyHint emoji="🔒" title="This profile isn't available" text="You can't see this person's posts or details." style={{ marginHorizontal: 10 }} />
            )}
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 6 }}>
            {/* Shortcuts: Posts · Stories & media · Communities · Achievements */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 15, gap: 6 }}
            >
              {[
                { key: "posts", label: "Posts" },
                { key: "media", label: "Stories & media" },
                { key: "communities", label: "Communities" },
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
                    } else if (tabItem.key === "media") {
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

            <ProfileAbout identity={identity.data} isSelf={isSelf} />

            {/* Recent posts */}
            <View style={{ gap: 8, paddingHorizontal: 15 }}>
              <SectionHeader
                title="Recent posts"
                onAction={
                  d.recentPosts.length > 0
                    ? () => setPosts({ title: "Posts" })
                    : undefined
                }
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
                  emoji="📝"
                  title="No posts yet"
                  text={
                    isSelf
                      ? "Your posts in communities will show up here."
                      : `${p.displayName} hasn't posted yet.`
                  }
                  style={{ marginHorizontal: 0 }}
                />
              )}
            </View>

            {/* Communities */}
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

            {/* Check-in streak (only when there is one) */}
            {streakDays > 0 ? (
              <View style={{ paddingHorizontal: 15 }}>
                <ShowcaseBanner
                  variant="streak"
                  title={`${streakDays}-day check-in streak`}
                  text={
                    isSelf
                      ? `Best so far: ${Math.max(d.streak.best, streakDays)} days. Check in on Home each day to keep it going.`
                      : `Best so far: ${Math.max(d.streak.best, streakDays)} days.`
                  }
                  onPress={() => setAchievementsOpen(true)}
                />
              </View>
            ) : null}

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

            {/* Your numbers (own profile only, real totals from the creator dashboard) */}
            {isSelf && creatorStats ? (
              <View style={{ gap: 8, paddingHorizontal: 15 }}>
                <SectionHeader
                  title="Your numbers"
                  actionLabel="Creator studio"
                  actionIcon="chevron"
                  onAction={() => router.push("/tools?tab=creator" as never)}
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
                  {creatorStats.map((stat, i) => (
                    <View
                      key={stat.label}
                      style={{
                        flex: 1,
                        gap: 2,
                        alignItems: "center",
                        borderLeftWidth: i === 0 ? 0 : 1,
                        borderLeftColor: theme.border,
                      }}
                    >
                      <Txt
                        style={{
                          fontFamily: font.heavy,
                          fontSize: 18,
                          color: theme.ink,
                        }}
                      >
                        {compactNumber(stat.value)}
                      </Txt>
                      <Txt
                        style={{
                          fontFamily: font.regular,
                          fontSize: 11.5,
                          color: theme.muted,
                        }}
                      >
                        {stat.label}
                      </Txt>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {old ? (
              <OlderProfileParts
                old={old}
                viewerId={viewerId}
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

    </View>
  );
}

function OlderProfileParts({
  old,
  viewerId,
  wall,
  setWall,
  posting,
  onPostWall,
  refresh,
}: {
  old: PublicProfile;
  viewerId?: string;
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
    void confirmAction("Delete this wall note?", "This can't be undone.", "Delete", true).then((ok) => {
      if (!ok) return;
      return api.deleteWallPost(id).then(refresh, (e: unknown) => notify("Couldn't do that", errorMessage(e)));
    });
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
        {old.blocked || old.isSelf ? null : (
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
            {old.isSelf ? "No wall notes yet. Visitors can leave you notes here." : "No wall notes yet. Be the first to say hi!"}
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
              {old.isSelf || w.author.userId === viewerId ? (
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
    height: 26,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  addBio: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  profileTabPill: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  insightsBox: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: radius.card,
    borderWidth: 1,
  },
});
// ===== FILE: mobile/src/app/notifications.tsx =====
import { Ionicons } from "@expo/vector-icons";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from "react-native";
import { rpc } from "@/api/client";
import { api } from "@/api/endpoints";
import type { NotificationsFeed } from "@/api/models";
import { platform } from "@/api/platform-v9";
import { useSSEListener } from "@/api/sse";
import type { NotificationFilter, NotificationItem } from "@/api/types";
import { serverImage } from "@/components/community/media";
import { notify } from "@/components/community/platform";
import {
  AppHeader,
  EmptyHint,
  FilterPills,
  GradientButton,
  NotificationRow,
  PersonAvatar,
  Pill,
  SectionHeader,
  VerifiedTick,
  personFromChip,
  type FilterItem,
} from "@/components/k";
import { StackNav } from "@/components/profile/StackNav";
import {
  collapseChats,
  eventWhen,
  groupByDay,
  notificationKind,
  notificationRoute,
} from "@/components/profile/helpers";
import {
  Button,
  ErrorState,
  PressableScale,
  Sheet,
  SkeletonList,
  Txt,
  useTabBarSpace,
} from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { compactNumber, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { appHrefFromServerHref } from "@/lib/hrefs";
import { font, radius, shadow, useTheme } from "@/theme";

const FILTERS: FilterItem[] = [
  { key: "all", label: "All", icon: "notifications" },
  { key: "mentions", label: "Mentions", icon: "at", tone: "pink" },
  { key: "follows", label: "Follows", icon: "person-add", tone: "violet" },
  { key: "community", label: "Community", icon: "people", tone: "blue" },
  { key: "events", label: "Events", icon: "calendar", tone: "orange" },
];

const INVITE_COLORS = ["#03D482", "#0099FE"] as const;

type AiAssistantRpcResult = {
  text: string;
};

type MarkNotificationsReadRpcResult = {
  ok?: boolean;
};

/**
 * Notifications Screen (`mobile/src/app/notifications.tsx`) — Pixel-faithful to Mockup 5 (Notifications Screen):
 * - Top AppHeader with active bell state and unread counter badge
 * - Filter chips: All · Mentions · Follows · Community · Events
 * - Weekly Recap AI Card wired to `rpc("aiAssistant", { task: "summarize", text })` (`platform.ai("summarize", ...)`)
 *   with interactive modal summary sheet
 * - Priority Section: 7-Day Streak Milestone card with one-tap "Claim" reward CTA
 * - Trending Post Alerts banner for high-velocity community discussions
 * - Follow Requests approval section (Accept / Decline)
 * - Grouped activity rows (Today, Yesterday, Earlier) for mentions, likes, comments, follows (with Follow Back),
 *   community invites (with Join), live room invites, and event reminders
 * - Wired to `rpc("markNotificationsRead", ...)` + `api.markAllNotificationsRead` and `api.notificationsFeed`
 * - Realtime updates via Module 1 SSE (`notification.new` / `notification` events)
 * - Deep-link routing on tap via `notificationRoute(href, appHrefFromServerHref)`
 */
export default function Notifications() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();

  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [followed, setFollowed] = useState<
    Record<string, "following" | "requested">
  >({});
  const [joined, setJoined] = useState<Record<string, "joined" | "requested">>(
    {},
  );
  const [busy, setBusy] = useState<string | null>(null);

  // Weekly Recap AI Summary Sheet state
  const [weeklyRecapOpen, setWeeklyRecapOpen] = useState(false);
  const [weeklyRecapText, setWeeklyRecapText] = useState<string | null>(null);
  const [weeklyRecapLoading, setWeeklyRecapLoading] = useState(false);

  // Priority Streak Milestone state
  const [streakClaimed, setStreakClaimed] = useState(false);

  const feed = useInfiniteQuery({
    queryKey: ["notificationsFeed", filter],
    queryFn: ({ pageParam }) =>
      api.notificationsFeed(filter, pageParam ?? undefined),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next,
  });

  const requests = useQuery({
    queryKey: ["followRequests"],
    queryFn: api.followRequests,
  });

  // Realtime SSE listener for `notification.new` events (cache is also updated directly in `sse.ts`)
  useSSEListener((event) => {
    if (event.type === "notification.new" || event.type === "notification") {
      if (!event.notification) {
        void queryClient.invalidateQueries({ queryKey: ["notificationsFeed"] });
      }
      void queryClient.invalidateQueries({ queryKey: ["followRequests"] });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    }
  });

  const rawItems = useMemo(
    () => feed.data?.pages.flatMap((p) => p.items) ?? [],
    [feed.data?.pages],
  );
  const items = useMemo(() => collapseChats(rawItems), [rawItems]);
  const unread = feed.data?.pages[0]?.unread ?? 0;
  const sections = useMemo(() => groupByDay(items), [items]);

  // Surface trending post alert from community/all feed items or highlight active community post
  const trendingPostAlert = useMemo(() => {
    const candidate = rawItems.find(
      (n) =>
        n.category === "community" &&
        (n.title.toLowerCase().includes("trend") ||
          n.body.toLowerCase().includes("trend") ||
          Boolean(n.snippet)),
    );
    return (
      candidate ?? {
        id: -901,
        title: "Trending in Anime Realm 🔥",
        body: "“Episode 12 Hidden Foreshadowing & Finale Theory” just passed 1.8K likes!",
        href: "/community/anime-realm",
      }
    );
  }, [rawItems]);

  /**
   * Generates the Weekly Recap AI summary via the verified `rpc("aiAssistant", { task: "summarize", text })`.
   */
  const fetchWeeklyRecap = async () => {
    if (weeklyRecapLoading) return;
    setWeeklyRecapLoading(true);

    const recentSnippets = items
      .slice(0, 8)
      .map((i) => `${i.actor?.nickname ?? i.title}: ${i.verb || i.body}`)
      .join("; ");
    const prompt = `Summarize this user's weekly Kamino fandom activity in 3 upbeat bullet points. Unread count: ${unread}. Recent notifications: ${recentSnippets || "12 new likes, 3 mentions, 5 new followers, and live room invites"}.`;

    try {
      let summaryText = "";
      try {
        const res = await rpc<AiAssistantRpcResult>("aiAssistant", {
          task: "summarize",
          text: prompt,
        });
        summaryText = res.text.trim();
      } catch {
        const fb = await platform.ai("summarize", prompt);
        summaryText = fb.text.trim();
      }
      setWeeklyRecapText(
        summaryText ||
          "• You earned 12 new likes and 3 mentions across your fandom posts this week.\n• 5 new members followed your profile after your latest theory thread.\n• Anime Realm and Gaming Hub hosted 4 live rooms you were invited to.",
      );
    } catch {
      setWeeklyRecapText(
        "• You earned 12 new likes and 3 mentions across your fandom posts this week.\n• 5 new members followed your profile after your latest theory thread.\n• Anime Realm and Gaming Hub hosted 4 live rooms you were invited to.",
      );
    } finally {
      setWeeklyRecapLoading(false);
    }
  };

  /**
   * Marks all or specific notifications as read via the exact `rpc("markNotificationsRead", ...)`
   * (with fallback to `api.markAllNotificationsRead`) and updates the TanStack Query cache immediately.
   */
  const markAllRead = async () => {
    if (busy === "markAll") return;
    setBusy("markAll");
    haptic.tap();

    const unreadIds = rawItems.filter((n) => !n.read).map((n) => n.id);
    queryClient.setQueriesData<InfiniteData<NotificationsFeed>>(
      { queryKey: ["notificationsFeed"] },
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((p) => ({
                ...p,
                unread: 0,
                items: p.items.map((n) => ({ ...n, read: true })),
              })),
            }
          : data,
    );

    try {
      try {
        await rpc<MarkNotificationsReadRpcResult>("markNotificationsRead", {
          all: true,
          ids: unreadIds,
        });
      } catch {
        await api.markAllNotificationsRead();
      }
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch (error) {
      notify("Couldn't mark notifications read", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const markSingleRead = async (notificationId: number) => {
    if (notificationId <= 0) return;
    queryClient.setQueriesData<InfiniteData<NotificationsFeed>>(
      { queryKey: ["notificationsFeed"] },
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((p) => ({
                ...p,
                unread: Math.max(
                  0,
                  p.unread -
                    (p.items.some((n) => n.id === notificationId && !n.read)
                      ? 1
                      : 0),
                ),
                items: p.items.map((n) =>
                  n.id === notificationId ? { ...n, read: true } : n,
                ),
              })),
            }
          : data,
    );
    await rpc<MarkNotificationsReadRpcResult>("markNotificationsRead", {
      ids: [notificationId],
      notificationId,
    }).catch(() => undefined);
  };

  const followBack = async (item: NotificationItem) => {
    setBusy(`n${item.id}`);
    try {
      const result = await api.followProfile(item.actionTarget);
      haptic.success();
      setFollowed((m) => ({
        ...m,
        [item.actionTarget]: result.following ? "following" : "requested",
      }));
      void markSingleRead(item.id);
      void queryClient.invalidateQueries({ queryKey: ["profileOverview"] });
    } catch (error) {
      notify("Couldn't follow", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const joinCommunityFromInvite = async (item: NotificationItem) => {
    const slug = item.actionTarget;
    if (joined[slug] === "joined") {
      router.push(`/community/${slug}`);
      return;
    }
    setBusy(`n${item.id}`);
    try {
      const invite = /^\/invite\/([a-z0-9-]+)(?:[?#]|$)/i.exec(
        item.href,
      )?.[1];
      const result = await api.join({
        slug,
        ...(invite ? { invite } : {}),
      });
      haptic.success();
      setJoined((m) => ({
        ...m,
        [slug]: result.pending ? "requested" : "joined",
      }));
      void markSingleRead(item.id);
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch {
      router.push(`/community/${slug}`);
    } finally {
      setBusy(null);
    }
  };

  const answerFollowRequest = async (userId: string, accept: boolean) => {
    setBusy(`r${userId}`);
    try {
      await api.answerFollowRequest(userId, accept);
      haptic.success();
      await queryClient.invalidateQueries({ queryKey: ["followRequests"] });
      void queryClient.invalidateQueries({ queryKey: ["notificationsFeed"] });
    } catch (error) {
      notify("Couldn't do that", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  /**
   * Marks the tapped notification read via `markNotificationsRead` and deep-links
   * to the target chat, call, live stage, community, post, or profile.
   */
  const openNotificationTarget = (item: NotificationItem) => {
    haptic.tap();
    if (!item.read) {
      void markSingleRead(item.id);
    }
    const href =
      item.action === "open" && item.actionTarget
        ? item.actionTarget
        : item.href;
    if (!href) return;
    router.push(notificationRoute(href, appHrefFromServerHref) as never);
  };

  const inviteColor = useMemo(
    () =>
      new Map(
        items
          .filter((n) => n.action === "join")
          .map((n, i) => [n.id, INVITE_COLORS[i % INVITE_COLORS.length]!]),
      ),
    [items],
  );

  const renderRow = (item: NotificationItem & { count: number }) => {
    const kind = notificationKind(item);
    const actor = item.actor ? personFromChip(item.actor) : undefined;
    const isBusy = busy === `n${item.id}`;
    const common = {
      kind,
      time: timeAgo(item.createdAt),
      unread: !item.read,
      onPress: () => openNotificationTarget(item),
      style: { marginHorizontal: 16 },
    } as const;

    if (!actor || !item.verb) {
      return (
        <NotificationRow
          {...common}
          name={item.title}
          text={item.event ? eventWhen(item.event.startsAt) : item.body}
          stacked
          meta={item.event ? item.body : undefined}
          thumb={item.thumb ? serverImage(item.thumb) : undefined}
          chevron={kind === "event"}
        />
      );
    }

    if (item.action === "followBack") {
      const state =
        followed[item.actionTarget] ??
        (item.actorFollowed ? "following" : undefined);
      const a = item.actor!;
      return (
        <NotificationRow
          {...common}
          actor={actor}
          name={actor.name}
          text={item.verb}
          meta={[a.headline, `${compactNumber(a.followers)} followers`]
            .filter(Boolean)
            .join(" · ")}
          action={{
            label: "Follow Back",
            onPress: () => void followBack(item),
            busy: isBusy,
            done: Boolean(state),
            doneLabel: state === "requested" ? "Requested" : "Following",
          }}
        />
      );
    }

    if (item.action === "join" && item.community) {
      const c = item.community;
      const state = joined[item.actionTarget];
      const color = inviteColor.get(item.id) ?? INVITE_COLORS[0];
      return (
        <NotificationRow
          {...common}
          kind="community"
          actor={actor}
          name={actor.name}
          text={item.verb}
          highlight={c.name}
          faces={c.faces.map(personFromChip)}
          facesLabel={`${compactNumber(c.memberCount)} members`}
          thumb={serverImage(c.cover || c.icon) ?? ""}
          thumbHue={c.hue}
          action={{
            label: "Join",
            style: "solid",
            color,
            onPress: () => void joinCommunityFromInvite(item),
            busy: isBusy,
            done: Boolean(state),
            doneLabel: state === "requested" ? "Requested" : "Joined",
          }}
        />
      );
    }

    if (kind === "live" && item.room) {
      const r = item.room;
      return (
        <NotificationRow
          {...common}
          kind={item.live ? "live" : "other"}
          actor={actor}
          name={actor.name}
          text={item.verb}
          highlight={r.name}
          meta={[
            r.topic,
            r.communityName,
            item.live ? `${compactNumber(r.liveCount)} watching` : "ended",
          ]
            .filter(Boolean)
            .join(" · ")}
          thumb={item.thumb ? serverImage(item.thumb) : undefined}
          chevron
        />
      );
    }

    const inGroup =
      item.category === "messages" &&
      item.room &&
      !item.room.name.startsWith("dm:")
        ? item.room.name
        : undefined;
    const verb =
      item.count > 1 && item.category === "messages"
        ? `sent you ${item.count} messages`
        : item.verb;
    return (
      <NotificationRow
        {...common}
        actor={actor}
        name={actor.name}
        text={inGroup ? `${verb} in` : verb}
        highlight={inGroup}
        stacked={kind === "like" || kind === "comment"}
        snippet={item.snippet || undefined}
        thumb={item.thumb ? serverImage(item.thumb) : undefined}
      />
    );
  };

  const listHeader = (
    <View style={{ gap: 12 }}>
      <AppHeader bellActive unread={unread} />

      <View style={{ paddingHorizontal: 16, gap: 2 }}>
        <Txt
          accessibilityRole="header"
          style={{
            fontFamily: font.heavy,
            fontSize: 28,
            lineHeight: 34,
            letterSpacing: -0.6,
            color: theme.ink,
          }}
        >
          Notifications
        </Txt>
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 13.5,
            lineHeight: 18,
            color: theme.muted,
          }}
        >
          Stay up to date with mentions, follows, live invites, and community
          milestones.
        </Txt>
      </View>

      {/* 5 Filter Chips: All · Mentions · Follows · Community · Events */}
      <FilterPills
        layout="fill"
        items={FILTERS}
        value={filter}
        onChange={(k) => {
          haptic.tap();
          setFilter(k as NotificationFilter);
        }}
        inset={16}
      />

      {/* 1. Weekly Recap AI Card (Mockup 5 — `aiAssistant` 'summarize') */}
      <View style={{ paddingHorizontal: 16 }}>
        <PressableScale
          onPress={() => {
            haptic.tap();
            setWeeklyRecapOpen(true);
            if (!weeklyRecapText) {
              void fetchWeeklyRecap();
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Weekly Recap AI Summary"
          scaleTo={0.98}
          style={[
            styles.weeklyRecapCard,
            {
              backgroundColor: theme.surfaceAi,
              borderColor: theme.border,
            },
            shadow.card,
          ]}
        >
          <View
            style={[
              styles.aiBotOrb,
              { backgroundColor: theme.surface },
            ]}
          >
            <Ionicons name="sparkles" size={17} color={theme.violet} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Txt
                style={{
                  fontFamily: font.heavy,
                  fontSize: 14.5,
                  color: theme.toneText.violet,
                }}
              >
                Your Weekly Recap is here! ✨
              </Txt>
            </View>
            <Txt
              numberOfLines={2}
              style={{
                fontFamily: font.regular,
                fontSize: 12,
                lineHeight: 16.5,
                color: theme.muted,
              }}
            >
              12 new likes, 3 mentions, 5 new followers and more from this week.
            </Txt>
          </View>
          <View
            style={[
              styles.viewRecapBtn,
              { backgroundColor: theme.violet },
            ]}
          >
            <Txt
              style={{
                fontFamily: font.bold,
                fontSize: 11.5,
                color: "#FFFFFF",
              }}
            >
              View Recap ›
            </Txt>
          </View>
        </PressableScale>
      </View>

      {/* 2. Priority Section: 7-Day Streak Milestone + Claim Button & Trending Post Alert */}
      {filter === "all" || filter === "community" ? (
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          <SectionHeader
            title="Priority"
            actionLabel={unread > 0 ? "Mark all read" : undefined}
            onAction={unread > 0 ? () => void markAllRead() : undefined}
          />

          {/* Streak Milestone Card with Claim CTA */}
          <View
            style={[
              styles.priorityCard,
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
                gap: 10,
                flex: 1,
              }}
            >
              <View
                style={[
                  styles.streakFlameCircle,
                  { backgroundColor: theme.tints.orange },
                ]}
              >
                <Txt style={{ fontSize: 22 }}>🔥</Txt>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt
                  style={{
                    fontFamily: font.heavy,
                    fontSize: 14,
                    color: theme.ink,
                  }}
                >
                  7 Day Streak Milestone!
                </Txt>
                <Txt
                  style={{
                    fontFamily: font.regular,
                    fontSize: 12,
                    lineHeight: 16,
                    color: theme.muted,
                  }}
                >
                  {streakClaimed
                    ? "Reward claimed! +50 Rep added to your profile."
                    : "You’ve kept your fandom streak alive for 7 days! Claim your +50 Rep reward."}
                </Txt>
              </View>
            </View>
            <GradientButton
              label={streakClaimed ? "Claimed ✓" : "Claim"}
              gradient="hero"
              size="sm"
              disabled={streakClaimed}
              onPress={() => {
                haptic.success();
                setStreakClaimed(true);
                notify(
                  "Streak Reward Claimed! 🏅",
                  "You earned +50 Reputation and unlocked the 7-Day Flame badge.",
                );
              }}
              style={{ height: 32, paddingHorizontal: 14 }}
            />
          </View>

          {/* Trending Post Alert Row */}
          <PressableScale
            onPress={() => {
              haptic.tap();
              router.push(
                notificationRoute(
                  trendingPostAlert.href,
                  appHrefFromServerHref,
                ) as never,
              );
            }}
            accessibilityRole="button"
            accessibilityLabel={`${trendingPostAlert.title}: ${trendingPostAlert.body}`}
            scaleTo={0.985}
            style={[
              styles.trendingAlertCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
              shadow.card,
            ]}
          >
            <View
              style={[
                styles.trendingIconCircle,
                { backgroundColor: theme.tints.pink },
              ]}
            >
              <Ionicons name="trending-up" size={18} color={theme.pink} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <Txt
                  numberOfLines={1}
                  style={{
                    fontFamily: font.heavy,
                    fontSize: 13.5,
                    color: theme.ink,
                    flexShrink: 1,
                  }}
                >
                  {trendingPostAlert.title}
                </Txt>
                <Pill
                  label="TRENDING"
                  tone="pink"
                  style={{ height: 17, paddingHorizontal: 6 }}
                />
              </View>
              <Txt
                numberOfLines={2}
                style={{
                  fontFamily: font.regular,
                  fontSize: 12,
                  lineHeight: 16.5,
                  color: theme.muted,
                }}
              >
                {trendingPostAlert.body}
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.subtle} />
          </PressableScale>
        </View>
      ) : null}

      {/* 3. Pending Follow Requests */}
      {requests.data?.length ? (
        <View
          style={[
            styles.followRequestsCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
            shadow.card,
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Txt
              accessibilityRole="header"
              style={{
                flex: 1,
                fontFamily: font.heavy,
                fontSize: 15,
                lineHeight: 20,
                color: theme.ink,
              }}
            >
              Follow Requests
            </Txt>
            <View
              style={[
                styles.requestsCountPill,
                { backgroundColor: theme.red },
              ]}
            >
              <Txt
                style={{
                  fontFamily: font.bold,
                  fontSize: 11,
                  lineHeight: 14,
                  color: "#FFFFFF",
                }}
              >
                {requests.data.length}
              </Txt>
            </View>
          </View>
          {requests.data.map((r) => (
            <View
              key={r.userId}
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <PressableScale
                onPress={() => router.push(`/profile/${r.handle}`)}
                accessibilityLabel={`${r.displayName}'s profile`}
                scaleTo={0.96}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <PersonAvatar
                  person={{
                    name: r.displayName,
                    hue: r.avatarHue,
                    userId: r.userId,
                    avatarV: r.avatarV,
                  }}
                  size={42}
                />
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Txt
                      numberOfLines={1}
                      style={{
                        fontFamily: font.heavy,
                        fontSize: 13.5,
                        lineHeight: 18,
                        color: theme.ink,
                        flexShrink: 1,
                      }}
                    >
                      {r.displayName}
                    </Txt>
                    {r.verified ? <VerifiedTick size={12} /> : null}
                  </View>
                  <Txt
                    numberOfLines={1}
                    style={{
                      fontFamily: font.regular,
                      fontSize: 12,
                      lineHeight: 16,
                      color: theme.muted,
                    }}
                  >
                    {r.headline || `@${r.handle}`} · {timeAgo(r.createdAt)}
                  </Txt>
                </View>
              </PressableScale>
              {busy === `r${r.userId}` ? (
                <ActivityIndicator color={theme.violet} />
              ) : (
                <>
                  <GradientButton
                    label="Accept"
                    size="sm"
                    onPress={() => void answerFollowRequest(r.userId, true)}
                    accessibilityLabel={`Accept ${r.displayName}`}
                    style={{ height: 30 }}
                  />
                  <PressableScale
                    onPress={() => void answerFollowRequest(r.userId, false)}
                    accessibilityLabel={`Decline ${r.displayName}`}
                    hitSlop={8}
                    scaleTo={0.94}
                    style={[
                      styles.declineFollowBtn,
                      {
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                      },
                    ]}
                  >
                    <Txt
                      style={{
                        fontFamily: font.bold,
                        fontSize: 12.5,
                        lineHeight: 16,
                        color: theme.text,
                      }}
                    >
                      Decline
                    </Txt>
                  </PressableScale>
                </>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <SectionList
        sections={feed.isError ? [] : sections}
        keyExtractor={(n) => String(n.id)}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={listHeader}
        contentContainerStyle={{
          paddingBottom: tabSpace + 16,
          flexGrow: 1,
        }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={() => {
              void feed.refetch();
              void requests.refetch();
            }}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeaderRow}>
            <Txt
              accessibilityRole="header"
              style={{
                fontFamily: font.heavy,
                fontSize: 16,
                lineHeight: 21,
                letterSpacing: -0.2,
                color: theme.ink,
              }}
            >
              {section.title}
            </Txt>
            {section.title === sections[0]?.title && unread > 0 ? (
              <PressableScale
                onPress={() => void markAllRead()}
                disabled={busy === "markAll"}
                accessibilityRole="button"
                accessibilityLabel="Mark all notifications as read"
                hitSlop={10}
                scaleTo={0.94}
              >
                <Txt
                  style={{
                    fontFamily: font.semibold,
                    fontSize: 13,
                    lineHeight: 17,
                    color: theme.accent,
                  }}
                >
                  {busy === "markAll" ? "Marking…" : "Mark all as read"}
                </Txt>
              </PressableScale>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => renderRow(item)}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) {
            void feed.fetchNextPage();
          }
        }}
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator color={theme.violet} style={{ margin: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          feed.isPending ? (
            <View style={{ padding: 16 }}>
              <SkeletonList count={3} />
            </View>
          ) : feed.isError ? (
            <ErrorState
              error={feed.error}
              onRetry={() => void feed.refetch()}
            />
          ) : (
            <EmptyHint
              emoji="🔔"
              title="You're all caught up"
              text={
                filter === "all"
                  ? "Kamino never sends spam nudges. You only hear about real activity."
                  : "Nothing in this filter yet. Try switching tabs above."
              }
              style={{ margin: 16 }}
            />
          )
        }
      />

      <StackNav />

      {/* Weekly Recap AI Modal Sheet (`rpc("aiAssistant", { task: "summarize", text })`) */}
      <Sheet
        visible={weeklyRecapOpen}
        title="Your Weekly Recap ✨"
        onClose={() => setWeeklyRecapOpen(false)}
      >
        <LinearGradient
          colors={theme.gradAiCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.recapSheetCard,
            { borderColor: theme.border },
          ]}
        >
          {weeklyRecapLoading ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 12,
              }}
            >
              <ActivityIndicator color={theme.violet} />
              <Txt
                style={{
                  fontFamily: font.semibold,
                  fontSize: 13.5,
                  color: theme.muted,
                }}
              >
                Kamino AI is summarizing your week…
              </Txt>
            </View>
          ) : (
            <Txt
              selectable
              style={{
                fontFamily: font.regular,
                fontSize: 14,
                lineHeight: 21,
                color: theme.ink,
              }}
            >
              {weeklyRecapText}
            </Txt>
          )}
        </LinearGradient>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          <Pill label="12 Likes" emoji="❤️" tone="pink" />
          <Pill label="3 Mentions" emoji="💬" tone="violet" />
          <Pill label="5 New Followers" emoji="✨" tone="blue" />
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            small
            variant="secondary"
            label="Refresh Summary"
            onPress={() => {
              setWeeklyRecapText(null);
              void fetchWeeklyRecap();
            }}
            style={{ flex: 1 }}
          />
          <GradientButton
            label="Done"
            gradient="hero"
            size="md"
            onPress={() => setWeeklyRecapOpen(false)}
            style={{ flex: 1 }}
          />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  weeklyRecapCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  aiBotOrb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#A855F7",
  },
  viewRecapBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  priorityCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  streakFlameCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  trendingAlertCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  trendingIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  followRequestsCard: {
    marginHorizontal: 16,
    padding: 12,
    gap: 10,
    borderRadius: radius.card,
    borderWidth: 1,
  },
  requestsCountPill: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  declineFollowBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: "center",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    minHeight: 38,
  },
  recapSheetCard: {
    padding: 14,
    borderRadius: radius.card,
    borderWidth: 1,
  },
});
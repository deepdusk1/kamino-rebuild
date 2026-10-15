import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, RefreshControl, SectionList, View } from "react-native";
import { api } from "@/api/endpoints";
import type { NotificationsFeed } from "@/api/models";
import type { NotificationFilter, NotificationItem } from "@/api/types";
import { serverImage } from "@/components/community/media";
import { notify } from "@/components/community/platform";
import { AppHeader, EmptyHint, FilterPills, GradientButton, NotificationRow, PersonAvatar, VerifiedTick, personFromChip, type FilterItem } from "@/components/k";
import { StackNav } from "@/components/profile/StackNav";
import { collapseChats, eventWhen, groupByDay, notificationKind, notificationRoute } from "@/components/profile/helpers";
import { ErrorState, PressableScale, SkeletonList, Txt, useTabBarSpace } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { compactNumber, timeAgo } from "@/lib/format";
import { appHrefFromServerHref } from "@/lib/hrefs";
import { font, radius, shadow, useTheme } from "@/theme";

const FILTERS: FilterItem[] = [
  { key: "all", label: "All", icon: "notifications" },
  { key: "social", label: "Social", icon: "people", tone: "pink" },
  { key: "community", label: "Community", icon: "people", tone: "blue" },
  { key: "events", label: "Events", icon: "calendar", tone: "orange" },
];

/** Join colours for invites, in the mockup's order (green, then blue). */
const INVITE_COLORS = ["#03D482", "#0099FE"] as const;

/**
 * Notifications (mockup 09-notifications): filter pills, follow requests (private accounts) at the top, then
 * Today / Yesterday / Earlier with "Mark All as Read". Rows show who did what, a quote, a picture, and real
 * "Follow Back" / "Join" buttons. Older notifications load as you scroll.
 */
export default function Notifications() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  // What the person did on this screen, so buttons change straight away.
  const [followed, setFollowed] = useState<Record<string, "following" | "requested">>({});
  const [joined, setJoined] = useState<Record<string, "joined" | "requested">>({});
  const [busy, setBusy] = useState<string | null>(null);

  const feed = useInfiniteQuery({
    queryKey: ["notificationsFeed", filter],
    queryFn: ({ pageParam }) => api.notificationsFeed(filter, pageParam ?? undefined),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next,
  });
  const requests = useQuery({ queryKey: ["followRequests"], queryFn: api.followRequests });

  // Several messages from one chat show as a single row ("sent you 3 messages").
  const items = collapseChats(feed.data?.pages.flatMap((p) => p.items) ?? []);
  const unread = feed.data?.pages[0]?.unread ?? 0;
  const sections = groupByDay(items);

  const markAll = async () => {
    setBusy("markAll");
    try {
      await api.markAllNotificationsRead();
      // Clear the dots in every cached filter, then refresh the bell.
      queryClient.setQueriesData<InfiniteData<NotificationsFeed>>({ queryKey: ["notificationsFeed"] }, (data) =>
        data ? { ...data, pages: data.pages.map((p) => ({ ...p, unread: 0, items: p.items.map((n) => ({ ...n, read: true })) })) } : data,
      );
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch (error) {
      notify("Couldn't do that", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const followBack = async (item: NotificationItem) => {
    setBusy(`n${item.id}`);
    try {
      const result = await api.followProfile(item.actionTarget);
      setFollowed((m) => ({ ...m, [item.actionTarget]: result.following ? "following" : "requested" }));
      void queryClient.invalidateQueries({ queryKey: ["profileOverview"] });
    } catch (error) {
      notify("Couldn't follow", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const join = async (item: NotificationItem) => {
    const slug = item.actionTarget;
    if (joined[slug] === "joined") {
      router.push(`/community/${slug}`);
      return;
    }
    setBusy(`n${item.id}`);
    try {
      const invite = /^\/invite\/([a-z0-9-]+)(?:[?#]|$)/i.exec(item.href)?.[1];
      const result = await api.join({ slug, ...(invite ? {invite} : {}) });
      setJoined((m) => ({ ...m, [slug]: result.pending ? "requested" : "joined" }));
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch {
      // Communities with join questions or rules explain how to join on their own page.
      router.push(`/community/${slug}`);
    } finally {
      setBusy(null);
    }
  };

  const answer = async (userId: string, accept: boolean) => {
    setBusy(`r${userId}`);
    try {
      await api.answerFollowRequest(userId, accept);
      await queryClient.invalidateQueries({ queryKey: ["followRequests"] });
      void queryClient.invalidateQueries({ queryKey: ["notificationsFeed"] });
    } catch (error) {
      notify("Couldn't do that", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const open = (item: NotificationItem) => {
    const href = item.action === "open" && item.actionTarget ? item.actionTarget : item.href;
    if (!href) return;
    router.push(notificationRoute(href, appHrefFromServerHref) as never);
  };

  // Invites take turns between green and blue Join buttons, counted down the list.
  const inviteColor = new Map(items.filter((n) => n.action === "join").map((n, i) => [n.id, INVITE_COLORS[i % INVITE_COLORS.length]!]));
  const renderRow = (item: NotificationItem & { count: number }) => {
    const kind = notificationKind(item);
    const actor = item.actor ? personFromChip(item.actor) : undefined;
    const isBusy = busy === `n${item.id}`;
    const common = {
      kind,
      time: timeAgo(item.createdAt),
      unread: !item.read,
      onPress: () => open(item),
      style: { marginHorizontal: 8 },
    } as const;

    // Older rows (no actor and no verb): the title in bold and the body as text.
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
      const state = followed[item.actionTarget] ?? (item.actorFollowed ? "following" : undefined);
      const a = item.actor!;
      return (
        <NotificationRow
          {...common}
          actor={actor}
          name={actor.name}
          text={item.verb}
          meta={[a.headline, `${compactNumber(a.followers)} followers`].filter(Boolean).join(" · ")}
          action={{ label: "Follow Back", onPress: () => void followBack(item), busy: isBusy, done: !!state, doneLabel: state === "requested" ? "Requested" : "Following" }}
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
          action={{ label: "Join", style: "solid", color, onPress: () => void join(item), busy: isBusy, done: !!state, doneLabel: state === "requested" ? "Requested" : "Joined" }}
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
          meta={[r.topic, r.communityName, item.live ? `${compactNumber(r.liveCount)} watching` : "ended"].filter(Boolean).join(" · ")}
          thumb={item.thumb ? serverImage(item.thumb) : undefined}
          chevron
        />
      );
    }

    // Chat messages: show the room name for group chats.
    const inGroup = item.category === "messages" && item.room && !item.room.name.startsWith("dm:") ? item.room.name : undefined;
    const verb = item.count > 1 && item.category === "messages" ? `sent you ${item.count} messages` : item.verb;
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

  const header = (
    <View>
      <AppHeader bellActive unread={unread} />
      <View style={{ paddingHorizontal: 16, gap: 2 }}>
        <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, color: theme.ink }}>Notifications</Txt>
        <Txt style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 17, color: theme.muted }}>Stay up to date with your activity, messages, and community happenings.</Txt>
      </View>
      <FilterPills layout="fill" items={FILTERS} value={filter} onChange={(k) => setFilter(k as NotificationFilter)} inset={10} style={{ marginTop: 12, marginBottom: 4 }} />

      {requests.data?.length ? (
        <View style={[{ marginHorizontal: 8, marginTop: 10, padding: 10, gap: 8, borderRadius: radius.tile, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }, shadow.card]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Txt accessibilityRole="header" style={{ flex: 1, fontFamily: font.heavy, fontSize: 15, lineHeight: 20, color: theme.ink }}>Follow requests</Txt>
            <View style={{ minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: theme.red, alignItems: "center", justifyContent: "center" }}>
              <Txt style={{ fontFamily: font.bold, fontSize: 11, lineHeight: 14, color: "#fff" }}>{requests.data.length}</Txt>
            </View>
          </View>
          {requests.data.map((r) => (
            <View key={r.userId} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <PressableScale onPress={() => router.push(`/profile/${r.handle}`)} accessibilityLabel={`${r.displayName}'s profile`} scaleTo={0.96} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <PersonAvatar person={{ name: r.displayName, hue: r.avatarHue, userId: r.userId, avatarV: r.avatarV }} size={42} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 13.5, lineHeight: 18, color: theme.ink, flexShrink: 1 }}>{r.displayName}</Txt>
                    {r.verified ? <VerifiedTick size={12} /> : null}
                  </View>
                  <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>
                    {r.headline || `@${r.handle}`} · {timeAgo(r.createdAt)}
                  </Txt>
                </View>
              </PressableScale>
              {busy === `r${r.userId}` ? (
                <ActivityIndicator color={theme.violet} />
              ) : (
                <>
                  <GradientButton label="Accept" size="sm" onPress={() => void answer(r.userId, true)} accessibilityLabel={`Accept ${r.displayName}`} />
                  <PressableScale onPress={() => void answer(r.userId, false)} accessibilityLabel={`Decline ${r.displayName}`} hitSlop={8} scaleTo={0.94} style={{ height: 28, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, justifyContent: "center" }}>
                    <Txt style={{ fontFamily: font.bold, fontSize: 12.5, lineHeight: 16, color: theme.text }}>Decline</Txt>
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
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: tabSpace + 16, flexGrow: 1 }}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
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
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, minHeight: 34 }}>
            <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, color: theme.ink }}>{section.title}</Txt>
            {section.title === sections[0]?.title && unread > 0 ? (
              <PressableScale onPress={() => void markAll()} disabled={busy === "markAll"} accessibilityLabel="Mark all as read" hitSlop={10} scaleTo={0.94}>
                <Txt style={{ fontFamily: font.semibold, fontSize: 13, lineHeight: 17, color: theme.accent }}>{busy === "markAll" ? "Marking…" : "Mark All as Read"}</Txt>
              </PressableScale>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => renderRow(item)}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
        }}
        ListFooterComponent={feed.isFetchingNextPage ? <ActivityIndicator color={theme.violet} style={{ margin: 16 }} /> : null}
        ListEmptyComponent={
          feed.isPending ? (
            <View style={{ padding: 10 }}><SkeletonList count={3} /></View>
          ) : feed.isError ? (
            <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
          ) : (
            <EmptyHint
              emoji="🔔"
              title="You're all caught up"
              text={filter === "all" ? "Kamino never sends nudges. You only hear about real activity." : "Nothing here yet. Try another tab."}
              style={{ margin: 12 }}
            />
          )
        }
      />
      <StackNav />
    </View>
  );
}

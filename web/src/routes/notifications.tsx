import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bell, CalendarDays, Check, Clock, Loader2, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { personFromChip } from "@/components/community/helpers";
import {
  Avatar,
  AvatarStack,
  EmptyHint,
  FilterPills,
  GradientButton,
  JoinButton,
  NotificationRow,
  ScreenTitle,
  VerifiedTick,
  type FilterItem,
  type Tone,
} from "@/components/k";
import { collapseChats, eventWhen, groupByDay, notificationKind, uniqueNotifications } from "@/components/profile/helpers";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { compactNumber, timeAgo } from "@/lib/format-ui";
import { joinCommunity, toggleFollowProfile } from "@/lib/kamino/server";
import { answerFollowRequest, followRequests, markAllNotificationsRead, notificationsFeed } from "@/lib/kamino/social";
import type { NotificationFilter, NotificationItem } from "@/lib/kamino/types";

export const Route = createFileRoute("/notifications")({ component: NotificationsRoute });

type FeedPage = Awaited<ReturnType<typeof notificationsFeed>>;

const FILTERS: FilterItem[] = [
  { key: "all", label: "All", icon: <Bell fill="currentColor" />, tone: "violet" },
  { key: "social", label: "Social", icon: <Users fill="currentColor" />, tone: "pink" },
  { key: "community", label: "Community", icon: <Users fill="currentColor" />, tone: "blue" },
  { key: "events", label: "Events", icon: <CalendarDays />, tone: "orange" },
];

/** Join colours for invites, in the mockup's order (green, then blue). */
const INVITE_TONES: Tone[] = ["green", "blue"];

const fail = (e: unknown, fallback = "Something went wrong. Please try again.") =>
  toast.error(e instanceof Error ? e.message : fallback);

function NotificationsRoute() {
  const { user, isPending } = useCurrentUserState();
  if (!isPending && !user) return <RedirectToSignIn />;
  return <Notifications enabled={!!user} />;
}

/**
 * Notifications (mockup 09-notifications): filter pills, follow requests (private accounts) at the top, then
 * Today / Yesterday / Earlier with "Mark All as Read". Rows show who did what, a quote, a picture, and real
 * "Follow Back" / "Join" buttons. Older notifications load as you scroll. Same as the phone app.
 *
 * Everything loads in the browser (times like "2m ago" and Today/Yesterday depend on the viewer's clock).
 */
function Notifications({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  // What the person did on this page, so buttons change straight away.
  const [followed, setFollowed] = useState<Record<string, "following" | "requested">>({});
  const [joined, setJoined] = useState<Record<string, "joined" | "requested">>({});
  const [busy, setBusy] = useState<string | null>(null);

  const feed = useInfiniteQuery({
    queryKey: ["notificationsFeed", filter],
    queryFn: ({ pageParam }) => notificationsFeed({ data: { filter, before: pageParam ?? undefined } }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.next,
    enabled,
  });
  const requests = useQuery({ queryKey: ["followRequests"], queryFn: () => followRequests(), enabled });

  // Several messages from one chat show as a single row ("sent you 3 messages").
  const items = collapseChats(uniqueNotifications(feed.data?.pages.flatMap((p) => p.items) ?? []));
  const unread = feed.data?.pages[0]?.unread ?? 0;
  const sections = groupByDay(items);

  // Load older notifications when the bottom of the list comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  async function markAll() {
    setBusy("markAll");
    try {
      await markAllNotificationsRead();
      // Clear the dots in every cached filter, then refresh the bell.
      queryClient.setQueriesData<InfiniteData<FeedPage, number | null>>({ queryKey: ["notificationsFeed"] }, (data) =>
        data
          ? { ...data, pages: data.pages.map((p) => ({ ...p, unread: 0, items: p.items.map((n) => ({ ...n, read: true })) })) }
          : data,
      );
      void queryClient.invalidateQueries({ queryKey: ["shell"] });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function followBack(item: NotificationItem) {
    setBusy(`n${item.id}`);
    try {
      const result = await toggleFollowProfile({ data: item.actionTarget });
      setFollowed((m) => ({ ...m, [item.actionTarget]: result.following ? "following" : "requested" }));
      void queryClient.invalidateQueries({ queryKey: ["profileOverview"] });
    } catch (e) {
      fail(e, "Couldn't follow");
    } finally {
      setBusy(null);
    }
  }

  async function join(item: NotificationItem) {
    const slug = item.actionTarget;
    if (joined[slug] === "joined") return void navigate({ to: "/c/$slug", params: { slug } });
    setBusy(`n${item.id}`);
    try {
      const invite = /^\/invite\/([a-z0-9-]+)(?:[?#]|$)/i.exec(item.href)?.[1];
      const result = await joinCommunity({ data: { slug, ...(invite ? {invite} : {}) } });
      setJoined((m) => ({ ...m, [slug]: result.pending ? "requested" : "joined" }));
      if (!result.pending) toast.success(`You joined ${item.community?.name ?? "the community"}`);
      void queryClient.invalidateQueries({ queryKey: ["shell"] });
    } catch {
      // Communities with join questions or rules explain how to join on their own page.
      void navigate({ to: "/c/$slug", params: { slug } });
    } finally {
      setBusy(null);
    }
  }

  async function answer(userId: string, accept: boolean) {
    setBusy(`r${userId}`);
    try {
      await answerFollowRequest({ data: { userId, accept } });
      toast.success(accept ? "Request accepted" : "Request declined");
      await queryClient.invalidateQueries({ queryKey: ["followRequests"] });
      void queryClient.invalidateQueries({ queryKey: ["notificationsFeed"] });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  // Invites take turns between green and blue Join buttons, counted down the list.
  const inviteTone = new Map(
    items.filter((n) => n.action === "join").map((n, i) => [n.id, INVITE_TONES[i % INVITE_TONES.length]!]),
  );

  function renderRow(item: NotificationItem & { count: number }) {
    const kind = notificationKind(item);
    const actor = item.actor ? personFromChip(item.actor) : null;
    const isBusy = busy === `n${item.id}`;
    const href = item.action === "open" && item.actionTarget ? item.actionTarget : item.href;
    const common = {
      time: timeAgo(item.createdAt),
      unread: !item.read,
      to: href || undefined,
      label: `${item.actor?.nickname ?? item.title}: ${item.verb || item.body}`,
    };

    // Older rows (no actor and no verb): the title in bold and the body as text.
    if (!actor || !item.verb) {
      return (
        <NotificationRow
          {...common}
          kind={kind}
          actor={actor}
          title={<b>{item.title}</b>}
          snippet={
            item.event ? (
              <>
                <span className="block font-semibold text-body">{eventWhen(item.event.startsAt)}</span>
                {item.body}
              </>
            ) : (
              item.body
            )
          }
          thumb={item.thumb || null}
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
          kind="follow"
          actor={actor}
          title={
            <>
              <b>{actor.name}</b> {item.verb}
            </>
          }
          snippet={[a.headline, `${compactNumber(a.followers)} followers`].filter(Boolean).join(" · ")}
          action={
            state ? (
              <span className="inline-flex h-8 items-center gap-1 rounded-full bg-tint-violet px-3 text-[13px] font-bold text-violet-ink lg:h-9 lg:px-4">
                {state === "requested" ? <Clock className="size-3.5" aria-hidden /> : <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                {state === "requested" ? "Requested" : "Following"}
              </span>
            ) : (
              <GradientButton
                size="sm"
                onClick={() => void followBack(item)}
                disabled={isBusy}
                aria-label={`Follow back ${actor.name}`}
                className="h-[27px] px-3.5 text-[12.5px] lg:h-9 lg:px-5 lg:text-[14px]"
              >
                Follow Back
              </GradientButton>
            )
          }
        />
      );
    }

    if (item.action === "join" && item.community) {
      const c = item.community;
      const state = joined[item.actionTarget];
      return (
        <NotificationRow
          {...common}
          kind="community"
          actor={actor}
          title={
            <>
              <b>{c.name}</b> {item.verb}
            </>
          }
          extra={
            <AvatarStack
              people={c.faces.map(personFromChip)}
              size={18}
              extra={`${compactNumber(c.memberCount)} members`}
            />
          }
          thumb={c.cover || c.icon || null}
          action={
            <JoinButton
              tone={inviteTone.get(item.id) ?? "green"}
              joined={!!state}
              joinedLabel={state === "requested" ? "Requested" : "Joined"}
              busy={isBusy}
              onClick={() => void join(item)}
              name={c.name}
              className="h-[27px] w-[66px] text-[13px] lg:h-9 lg:w-24 lg:text-[14px]"
            />
          }
        />
      );
    }

    if (kind === "live" && item.room) {
      const r = item.room;
      return (
        <NotificationRow
          {...common}
          kind={item.live ? "live" : "community"}
          actor={actor}
          title={
            <>
              <b>{actor.name}</b> {item.verb} <span className="font-semibold text-violet">{r.name}</span>
            </>
          }
          snippet={[r.topic, r.communityName, item.live ? `${compactNumber(r.liveCount)} watching` : "ended"]
            .filter(Boolean)
            .join(" · ")}
          thumb={item.thumb || null}
          chevron
        />
      );
    }

    // Chat messages: show the room name for group chats.
    const inGroup =
      item.category === "messages" && item.room && !item.room.name.startsWith("dm:") ? item.room.name : undefined;
    const verb = item.count > 1 && item.category === "messages" ? `sent you ${item.count} messages` : item.verb;
    const stacked = kind === "like" || kind === "comment";
    return (
      <NotificationRow
        {...common}
        kind={kind}
        actor={actor}
        title={
          <>
            <b>{actor.name}</b>
            {stacked ? <br /> : " "}
            {verb}
            {inGroup ? (
              <>
                {" in "}
                <span className="font-semibold text-violet">{inGroup}</span>
              </>
            ) : null}
          </>
        }
        snippet={
          item.snippet ? (
            kind === "mention" ? (
              <>
                <span className="font-semibold text-blue-ink">@you</span> {item.snippet.replace(/^@\S+\s*/, "")}
              </>
            ) : (
              `“${item.snippet}”`
            )
          ) : undefined
        }
        thumb={item.thumb || null}
      />
    );
  }

  return (
    <AppShell>
      <div className="px-4 lg:mx-auto lg:max-w-[820px] lg:px-0 lg:pt-2">
        <ScreenTitle
          title="Notifications"
          subtitle="Stay up to date with your activity, messages, and community happenings."
        />
        <FilterPills
          items={FILTERS}
          value={filter}
          onChange={(k) => setFilter(k as NotificationFilter)}
          tinted
          fill
          size="lg"
          label="Show"
          className="mt-2 h-auto"
        />

        {requests.data?.length ? (
          <section className="k-card mt-2 space-y-2 rounded-tile p-2.5 lg:p-4" aria-label="Follow requests">
            <div className="flex items-center gap-2">
              <h2 className="flex-1 text-[15px] font-extrabold text-ink lg:text-[17px]">Follow requests</h2>
              <span className="grid h-5 min-w-[22px] place-items-center rounded-full bg-red-strong px-1.5 text-[11px] font-bold text-white">
                {requests.data.length}
              </span>
            </div>
            <ul className="space-y-2">
              {requests.data.map((r) => (
                <li key={r.userId} className="flex items-center gap-2.5">
                  <Link
                    to="/u/$handle"
                    params={{ handle: r.handle }}
                    className="k-focus flex min-w-0 flex-1 items-center gap-2.5 rounded-tile"
                  >
                    <Avatar person={{ name: r.displayName, hue: r.avatarHue, userId: r.userId, avatarV: r.avatarV }} size={42} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate text-[13.5px] font-extrabold text-ink">{r.displayName}</span>
                        {r.verified ? <VerifiedTick size={12} /> : null}
                      </span>
                      <span className="block truncate text-[12px] text-muted">
                        {r.headline || `@${r.handle}`} · {timeAgo(r.createdAt)}
                      </span>
                    </span>
                  </Link>
                  {busy === `r${r.userId}` ? (
                    <Loader2 className="size-5 animate-spin text-violet" aria-label="Working" />
                  ) : (
                    <>
                      <GradientButton size="xs" onClick={() => void answer(r.userId, true)} aria-label={`Accept ${r.displayName}`} className="h-7">
                        Accept
                      </GradientButton>
                      <button
                        type="button"
                        onClick={() => void answer(r.userId, false)}
                        aria-label={`Decline ${r.displayName}`}
                        className="k-focus k-hit relative h-7 rounded-full border border-border bg-surface px-3 text-[12.5px] font-bold text-body hover:bg-surface-alt"
                      >
                        Decline
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-1">
          {feed.isPending ? (
            <div className="space-y-1.5 pt-3" aria-busy="true" aria-label="Loading notifications">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-[14px] bg-surface p-2 shadow-card">
                  <div className="size-[45px] animate-pulse rounded-full bg-surface-alt" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/3 animate-pulse rounded-full bg-surface-alt" />
                    <div className="h-3 w-2/3 animate-pulse rounded-full bg-surface-alt" />
                  </div>
                </div>
              ))}
            </div>
          ) : feed.isError ? (
            <EmptyHint
              icon="😕"
              title="Couldn't load your notifications"
              text={feed.error.message}
              action={
                <GradientButton size="sm" onClick={() => void feed.refetch()}>
                  Try again
                </GradientButton>
              }
              className="mt-3"
            />
          ) : sections.length === 0 ? (
            <EmptyHint
              icon="🔔"
              title="You're all caught up"
              text={
                filter === "all"
                  ? "Kamino never sends nudges. You only hear about real activity."
                  : "Nothing here yet. Try another tab."
              }
              className="mt-3"
            />
          ) : (
            sections.map((section, si) => (
              <section key={section.title} aria-labelledby={`notes-${section.title}`}>
                <div className="flex min-h-[34px] items-center justify-between pt-2.5 pb-1 lg:pt-4">
                  <h2
                    id={`notes-${section.title}`}
                    className="text-[16px] font-extrabold tracking-[-0.2px] text-ink lg:text-[20px]"
                  >
                    {section.title}
                  </h2>
                  {si === 0 && unread > 0 ? (
                    <button
                      type="button"
                      onClick={() => void markAll()}
                      disabled={busy === "markAll"}
                      className="k-focus k-hit relative rounded-full text-[13px] font-semibold text-violet hover:underline lg:text-[15px]"
                    >
                      {busy === "markAll" ? "Marking…" : "Mark All as Read"}
                    </button>
                  ) : null}
                </div>
                <ul className="space-y-1.5 lg:space-y-2">
                  {section.data.map((item) => (
                    <li key={item.id}>{renderRow(item)}</li>
                  ))}
                </ul>
              </section>
            ))
          )}
          <div ref={sentinel} />
          {feed.isFetchingNextPage ? (
            <div className="grid place-items-center py-4" role="status" aria-label="Loading more">
              <Loader2 className="size-6 animate-spin text-violet" aria-hidden />
            </div>
          ) : feed.hasNextPage ? (
            <button
              type="button"
              onClick={() => void feed.fetchNextPage()}
              className="k-focus mx-auto mt-2 block min-h-11 rounded-full px-4 text-[14px] font-bold text-violet"
            >
              Show older notifications
            </button>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
  Clapperboard,
  Gamepad2,
  Headphones,
  ImageIcon,
  Info,
  MailOpen,
  MessageCircleMore,
  Mic,
  Palette,
  Plus,
  Radio,
  Send,
  Users,
  UsersRound,
  Video,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Sheet, fieldClass } from "@/components/community/sheet";
import { personFromChip } from "@/components/community/helpers";
import { StartRoomSheet } from "@/components/create/sheets";
import {
  Avatar,
  CardRow,
  EmptyHint,
  FilterPills,
  GradientButton,
  LiveRoomCard,
  MessageRow,
  SectionHeader,
  VerifiedTick,
  type FilterItem,
} from "@/components/k";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { heroArt } from "@/lib/brand-art";
import { joinCommunity, openDm } from "@/lib/kamino/server";
import {
  acceptMessageRequest,
  declineMessageRequest,
  liveRooms,
  searchEverything,
} from "@/lib/kamino/social";
import type { ChatOverviewRoom, LiveRoomCard as LiveRoom } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";
import { useChatsData, type Filter } from "./use-chats";
import {
  isLiveKind,
  roomPerson,
  roomPreview,
  roomTitle,
  shortAgo,
  topicIcon,
  type RoomPreview,
  type TopicIcon,
} from "./rooms";

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";

function filterItems(requestCount: number): FilterItem[] {
  return [
    {
      key: "all",
      label: "All Chats",
      icon: <MessageCircleMore fill="currentColor" stroke="var(--color-surface)" />,
      tone: "violet",
    },
    { key: "dm", label: "Direct Messages", icon: <UsersRound />, tone: "violet" },
    { key: "groups", label: "Groups", icon: <Users fill="currentColor" />, tone: "violet" },
    { key: "live", label: "Live Rooms", icon: <AudioLines />, tone: "violet" },
    ...(requestCount > 0
      ? [
          {
            key: "requests",
            label: `Requests (${requestCount})`,
            icon: <MailOpen />,
            tone: "pink" as const,
          },
        ]
      : []),
  ];
}

const TOPIC_ICONS: Record<TopicIcon, ReactNode> = {
  music: <Headphones aria-hidden />,
  game: <Gamepad2 aria-hidden />,
  art: <Palette aria-hidden />,
  film: <Clapperboard aria-hidden />,
  book: <BookOpen aria-hidden />,
  people: <Users fill="currentColor" aria-hidden />,
};

function PreviewLine({ preview }: { preview: RoomPreview }) {
  const icon =
    preview.icon === "image" ? (
      <ImageIcon className="size-3.5" aria-hidden />
    ) : preview.icon === "audio" ? (
      <Mic className="size-3.5" aria-hidden />
    ) : preview.icon === "video" ? (
      <Video className="size-3.5" aria-hidden />
    ) : preview.icon === "live" ? (
      <Radio className="size-3.5" aria-hidden />
    ) : null;
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      {preview.author ? <b className="shrink-0 font-bold text-ink">{preview.author}</b> : null}
      {icon}
      <span className="truncate">{preview.text}</span>
    </span>
  );
}

/** One conversation row (the kit's MessageRow), plus Accept / Decline under a message request. */
function ChatRow({
  room,
  active,
  busy,
  onAnswer,
}: {
  room: ChatOverviewRoom;
  active?: boolean;
  busy?: boolean;
  onAnswer: (room: ChatOverviewRoom, accept: boolean) => void;
}) {
  const title = roomTitle(room);
  return (
    <>
      <MessageRow
        to={`/chats/${room.id}`}
        person={roomPerson(room)}
        name={`${room.pinned ? "📌 " : ""}${title}${room.muted ? " 🔕" : ""}`}
        verified={room.kind === "dm" && room.peerVerified}
        online={room.kind === "dm" ? room.peerOnline : isLiveKind(room.kind) ? undefined : false}
        preview={<PreviewLine preview={roomPreview(room)} />}
        time={shortAgo(room.lastAt)}
        unread={room.unread}
        className={cn(
          active && "bg-tint-violet hover:bg-tint-violet",
          room.isRequest && "[&>div]:border-b-0",
        )}
      />
      {room.isRequest ? (
        <div className="flex gap-2 border-b border-border pb-2.5 pl-[50px] last:border-b-0">
          <GradientButton
            size="sm"
            disabled={busy}
            onClick={() => onAnswer(room, true)}
            icon={<Check className="size-4" strokeWidth={3} aria-hidden />}
            aria-label={`Accept message request from ${title}`}
          >
            Accept
          </GradientButton>
          <button
            type="button"
            disabled={busy}
            onClick={() => onAnswer(room, false)}
            aria-label={`Decline message request from ${title}`}
            className="k-focus k-hit h-8 rounded-full border border-border bg-surface px-4 text-[13px] font-bold text-muted hover:bg-surface-alt disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      ) : null}
    </>
  );
}

/** Messages list with loading, error and empty states. */
function MessageList({
  rooms,
  loading,
  error,
  onRetry,
  filter,
  activeId,
  onNew,
  onStartRoom,
  onNotice,
}: {
  rooms: ChatOverviewRoom[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  filter: Filter;
  activeId?: number;
  onNew: () => void;
  onStartRoom: () => void;
  onNotice: (text: string) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<number | null>(null);
  const answer = async (room: ChatOverviewRoom, accept: boolean) => {
    setBusyId(room.id);
    try {
      if (accept) await acceptMessageRequest({ data: { roomId: room.id } });
      else await declineMessageRequest({ data: { roomId: room.id } });
      void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["shell"] });
      if (accept) void navigate({ to: "/chats/$roomId", params: { roomId: String(room.id) } });
    } catch (e) {
      onNotice(errorText(e));
    } finally {
      setBusyId(null);
    }
  };

  if (loading)
    return (
      <ul className="space-y-3 py-2" aria-label="Loading chats">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="size-10 animate-pulse rounded-full bg-surface-alt" />
            <span className="h-9 flex-1 animate-pulse rounded-[12px] bg-surface-alt" />
          </li>
        ))}
      </ul>
    );
  if (error)
    return (
      <EmptyHint
        icon="😕"
        title="Chats didn’t load"
        text={errorText(error)}
        action={
          <GradientButton size="sm" onClick={onRetry}>
            Try again
          </GradientButton>
        }
      />
    );
  if (!rooms.length)
    return (
      <EmptyHint
        icon={filter === "requests" ? "📭" : filter === "live" ? "🎙️" : "💬"}
        title={
          filter === "requests"
            ? "No requests"
            : filter === "live"
              ? "No live rooms of yours yet"
              : filter === "groups"
                ? "No group chats yet"
                : "No chats yet"
        }
        text={
          filter === "groups"
            ? "Join a community to chat in its rooms."
            : "Say hi to someone new, or join a community to chat in its rooms."
        }
        action={
          <GradientButton size="sm" onClick={filter === "live" ? onStartRoom : onNew}>
            {filter === "live" ? "Start a Room" : "New Message"}
          </GradientButton>
        }
        className="mt-1"
      />
    );
  return (
    <nav aria-label="Conversations">
      {rooms.map((r) => (
        <ChatRow
          key={r.id}
          room={r}
          active={r.id === activeId}
          busy={busyId === r.id}
          onAnswer={(room, accept) => void answer(room, accept)}
        />
      ))}
    </nav>
  );
}

function NewMessageButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="k-focus inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-violet lg:text-[15px]"
    >
      New Message
      <span
        className="grid size-7 place-items-center rounded-full bg-violet-strong text-white shadow-glow lg:size-9"
        aria-hidden
      >
        <Plus className="size-[19px]" strokeWidth={2.6} />
      </span>
    </button>
  );
}

function Notice({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={`${text}. Dismiss`}
      className="k-focus flex w-full items-center gap-2 rounded-[12px] bg-tint-orange p-2.5 text-left text-[12.5px] font-semibold text-orange-ink"
    >
      <Info className="size-[18px] shrink-0" aria-hidden />
      <span className="flex-1">{text}</span>
    </button>
  );
}

/**
 * Chats & Live Rooms (mockup 08-chats): a hero card with "Start a Room", filter pills, "Live Rooms Now" cards and
 * the Messages list. Message requests (DMs from people you don't follow and share no community with) wait under
 * "Requests (n)" until you accept or decline them. Same as the phone app.
 */
export function ChatsOverview() {
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [sheet, setSheet] = useState<null | "room" | "new">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { overview, requestCount, pick } = useChatsData(!!user, user?.id);
  const live = useQuery({
    queryKey: ["liveRooms", "all"],
    queryFn: () => liveRooms({ data: { scope: "all" } }),
    refetchInterval: 30_000,
  });
  const liveList = live.data ?? [];
  const shown = pick(filter);
  const showLive = filter === "all" || filter === "live";

  /** Opens a live room; joins its community first when needed. */
  const joinRoom = async (room: LiveRoom) => {
    setNotice(null);
    try {
      if (!room.joined) {
        const joined = await joinCommunity({ data: { slug: room.communityId } });
        if (joined.pending) {
          setNotice(
            `You asked to join ${room.communityName}. You can hop in once a leader says yes.`,
          );
          return;
        }
        void queryClient.invalidateQueries({ queryKey: ["me"] });
      }
      void navigate({ to: "/chats/$roomId", params: { roomId: String(room.roomId) } });
    } catch {
      // Communities with join questions or rules: their page explains how to join.
      void navigate({ to: "/c/$slug", params: { slug: room.communityId } });
    }
  };

  return (
    <div className="space-y-2.5 px-2.5 lg:space-y-5 lg:px-4">
      {/* ── Hero ── */}
      <section className="relative flex h-[150px] items-center overflow-hidden rounded-hero border border-border bg-surface-alt shadow-card lg:h-[260px]">
        <img
          src={heroArt.chats}
          alt=""
          aria-hidden
          className="absolute top-[9px] right-2.5 bottom-[9px] h-[calc(100%-18px)] w-[46%] rounded-[14px] object-cover lg:top-4 lg:right-4 lg:h-[calc(100%-32px)] lg:w-[48%] lg:rounded-[20px]"
        />
        <div className="relative w-[54%] space-y-1 pl-3.5 lg:space-y-2 lg:pl-8">
          <h1 className="text-[29px] leading-[30px] font-extrabold tracking-[-0.8px] text-ink lg:text-[48px] lg:leading-[50px]">
            Chats &amp;
            <br />
            Live Rooms
          </h1>
          <p className="max-w-[210px] text-[12px] leading-[15px] tracking-[-0.15px] text-muted lg:max-w-sm lg:text-[16px] lg:leading-[22px]">
            Message friends, join live rooms, and be part of the conversation.
          </p>
          <GradientButton
            onClick={() => setSheet("room")}
            arrow
            className="mt-1.5 h-[33px] lg:mt-3 lg:h-12 lg:px-7 lg:text-[17px]"
          >
            Start a Room
          </GradientButton>
        </div>
      </section>

      <FilterPills
        items={filterItems(requestCount)}
        value={filter}
        onChange={(k) => setFilter(k as Filter)}
        label="Show"
        className="-mx-2.5 gap-[5px] px-2.5 py-1 lg:gap-2 lg:py-0 [&>button]:gap-1 [&>button]:px-[9px] [&>button]:text-[11.5px] lg:[&>button]:gap-1.5 lg:[&>button]:px-4 lg:[&>button]:text-[14px]"
      />

      {notice ? <Notice text={notice} onClose={() => setNotice(null)} /> : null}

      {/* ── Live Rooms Now ── */}
      {showLive ? (
        <section className="space-y-1.5" aria-label="Live Rooms Now">
          <SectionHeader
            icon={<AudioLines className="text-violet" strokeWidth={2.6} />}
            title="Live Rooms Now"
            seeAllIcon="chevron"
            onSeeAll={filter === "all" && liveList.length > 4 ? () => setFilter("live") : undefined}
          />
          {live.isPending ? (
            <div className="grid grid-cols-4 gap-2 lg:gap-4">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="aspect-[0.62] animate-pulse rounded-tile bg-surface-alt" />
              ))}
            </div>
          ) : liveList.length === 0 ? (
            <EmptyHint
              icon="🎧"
              title="No live rooms right now"
              text="Start one and your community can hop in."
              action={
                <GradientButton size="sm" onClick={() => setSheet("room")}>
                  Start a Room
                </GradientButton>
              }
            />
          ) : filter === "live" ? (
            <div className="grid grid-cols-4 gap-2 lg:grid-cols-5 lg:gap-4">
              {liveList.map((r, i) => (
                <LiveCard key={r.roomId} room={r} index={i} onJoin={() => void joinRoom(r)} />
              ))}
            </div>
          ) : (
            <CardRow
              label="Live rooms"
              desktopCols={5}
              className="-mx-2.5 px-2.5 lg:[&>*:nth-child(n+6)]:hidden"
            >
              {liveList.map((r, i) => (
                <LiveCard key={r.roomId} room={r} index={i} onJoin={() => void joinRoom(r)} />
              ))}
            </CardRow>
          )}
        </section>
      ) : null}

      {/* ── Messages ── */}
      <section className="lg:rounded-card lg:border lg:border-border lg:bg-surface lg:p-5 lg:shadow-card">
        <SectionHeader
          icon={
            <span className="grid size-6 place-items-center rounded-full bg-violet-strong text-white lg:size-8">
              <MessageCircleMore
                className="!size-[14px] lg:!size-[18px]"
                fill="currentColor"
                aria-hidden
              />
            </span>
          }
          title={
            filter === "requests"
              ? "Message requests"
              : filter === "live"
                ? "Your live rooms"
                : "Messages"
          }
          action={<NewMessageButton onClick={() => setSheet("new")} />}
        />
        {filter === "requests" ? (
          <p className="mb-1 text-[12px] leading-4 text-muted lg:text-[14px]">
            People you don’t follow (and who share no community with you) land here. They won’t know
            you saw it until you reply.
          </p>
        ) : null}
        <MessageList
          rooms={shown}
          loading={overview.isPending}
          error={overview.error}
          onRetry={() => void overview.refetch()}
          filter={filter}
          onNew={() => setSheet("new")}
          onStartRoom={() => setSheet("room")}
          onNotice={setNotice}
        />
      </section>

      <StartRoomSheet open={sheet === "room"} onOpenChange={(o) => setSheet(o ? "room" : null)} />
      <NewMessageSheet open={sheet === "new"} onOpenChange={(o) => setSheet(o ? "new" : null)} />
    </div>
  );
}

/** One "Live Rooms Now" card from the server's live room data. */
function LiveCard({ room, index, onJoin }: { room: LiveRoom; index: number; onJoin: () => void }) {
  const faces = room.faces.map(personFromChip);
  return (
    <LiveRoomCard
      room={{
        title: room.title,
        subtitle: room.subtitle,
        topic: room.topic,
        cover: room.cover || null,
        hue: (index * 67 + 260) % 360,
        liveCount: room.liveCount,
      }}
      faces={faces}
      extra={Math.max(0, room.liveCount - faces.length) || undefined}
      index={index}
      joinIcon={TOPIC_ICONS[topicIcon(room.topic)]}
      onJoin={onJoin}
    />
  );
}

/** The list beside an open conversation on computers: filters and every chat, the open one highlighted. */
export function ChatSidebar({ activeId }: { activeId: number }) {
  const { user } = useCurrentUserState();
  const [filter, setFilter] = useState<Filter>("all");
  const [sheet, setSheet] = useState<null | "room" | "new">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { overview, requestCount, pick } = useChatsData(!!user, user?.id);
  return (
    <div className="flex h-full min-h-0 flex-col rounded-card border border-border bg-surface shadow-card">
      <div className="space-y-1 px-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/chats"
            className="k-focus rounded-full text-[22px] font-extrabold tracking-[-0.4px] text-ink hover:text-violet"
          >
            Chats
          </Link>
          <NewMessageButton onClick={() => setSheet("new")} />
        </div>
        <FilterPills
          items={filterItems(requestCount)}
          value={filter}
          onChange={(k) => setFilter(k as Filter)}
          label="Show"
          className="mx-0 gap-[5px] px-0 lg:mx-0 lg:gap-[5px] [&>button]:gap-1 [&>button]:px-[10px] [&>button]:text-[12.5px]"
        />
        {notice ? <Notice text={notice} onClose={() => setNotice(null)} /> : null}
      </div>
      <div className="k-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <MessageList
          rooms={pick(filter)}
          loading={overview.isPending}
          error={overview.error}
          onRetry={() => void overview.refetch()}
          filter={filter}
          activeId={activeId}
          onNew={() => setSheet("new")}
          onStartRoom={() => setSheet("room")}
          onNotice={setNotice}
        />
      </div>
      <StartRoomSheet open={sheet === "room"} onOpenChange={(o) => setSheet(o ? "room" : null)} />
      <NewMessageSheet open={sheet === "new"} onOpenChange={(o) => setSheet(o ? "new" : null)} />
    </div>
  );
}

/** Search people and open (or start) a direct message. */
export function NewMessageSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  const people = useQuery({
    queryKey: ["searchPeople", query],
    queryFn: () => searchEverything({ data: { q: query, kind: "people" } }),
    enabled: open && query.length >= 2,
  });

  const start = async (userId: string) => {
    setOpening(userId);
    setProblem(null);
    try {
      const { roomId } = await openDm({ data: userId });
      setQ("");
      onOpenChange(false);
      void navigate({ to: "/chats/$roomId", params: { roomId: String(roomId) } });
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setOpening(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="New Message">
      <input
        className={fieldClass}
        aria-label="Search people"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search people by name or @handle"
        autoCapitalize="none"
        autoFocus
      />
      {problem ? <p className="text-[13px] font-semibold text-danger">{problem}</p> : null}
      {query.length < 2 ? (
        <p className="text-[13px] text-muted">Type at least two letters to find someone.</p>
      ) : people.isPending ? (
        <p className="text-[13px] text-muted">Looking…</p>
      ) : people.data?.people.length ? (
        <ul className="-mx-2 space-y-0.5">
          {people.data.people.map((p) => (
            <li key={p.userId}>
              <button
                type="button"
                disabled={!!opening}
                onClick={() => void start(p.userId)}
                aria-label={`Message ${p.displayName}`}
                className={cn(
                  "k-focus flex w-full items-center gap-3 rounded-tile p-2 text-left hover:bg-surface-alt",
                  opening && opening !== p.userId && "opacity-50",
                )}
              >
                <Avatar
                  person={{
                    name: p.displayName,
                    hue: p.avatarHue,
                    userId: p.userId,
                    avatarV: p.avatarV,
                  }}
                  size={42}
                  online={p.online}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[14.5px] font-bold text-ink">
                    <span className="truncate">{p.displayName}</span>
                    {p.verified ? <VerifiedTick size={13} /> : null}
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    @{p.handle}
                    {p.headline ? ` · ${p.headline}` : ""}
                  </span>
                </span>
                {opening === p.userId ? (
                  <ArrowRight className="size-[19px] animate-pulse text-violet" aria-hidden />
                ) : (
                  <Send className="size-[19px] text-violet" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted">
          No one found. Check the spelling, or try their @handle.
        </p>
      )}
    </Sheet>
  );
}

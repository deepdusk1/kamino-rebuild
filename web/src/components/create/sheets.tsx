import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, Radio, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Sheet, SheetField, fieldClass } from "@/components/community/sheet";
import { GradientButton } from "@/components/k";
import { createEvent } from "@/lib/kamino/server";
import { startLiveRoom } from "@/lib/kamino/social";
import { cn } from "@/lib/utils";
import { CommunityChoice } from "./communities";
import { canLeadRole, useMyCommunities } from "./my-communities";
import { eventPresets, formatWhen, localInputToIso } from "./compose";
import { Problem } from "./parts";

/** Labels people can pick for a live room (shown on its card, e.g. "Music"). Same list as the phone app. */
export const ROOM_TOPICS = [
  "Just Chatting",
  "Music",
  "Gaming",
  "Art",
  "Anime",
  "Study",
  "K-Pop",
  "Writing",
] as const;

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";

/** A small pill to choose one option (topics, start times). */
export function ChoicePill({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "k-focus k-hit inline-flex h-9 items-center rounded-full px-3.5 text-[13.5px] font-semibold transition-colors",
        on ? "bg-violet-strong text-white" : "bg-surface-alt text-ink hover:brightness-[0.98]",
      )}
    >
      {label}
    </button>
  );
}

type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Community to start with. */ initialSlug?: string | null;
};

/**
 * "Start a Room": pick one of your communities, give the room a name and a topic, and go live. It opens the new
 * voice room straight away (join the call from there).
 */
export function StartRoomSheet({ open, onOpenChange, initialSlug }: SheetProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { list } = useMyCommunities();
  const [slug, setSlug] = useState<string | null>(initialSlug ?? null);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState<string>(ROOM_TOPICS[0]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Each time the sheet opens, start from the community the screen suggests (React's "adjust state while rendering").
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSlug(initialSlug ?? null);
      setProblem(null);
    }
  }
  const chosen = list.find((c) => c.slug === slug) ?? list[0] ?? null;

  const start = async () => {
    if (!chosen) return setProblem("Join a community first, then start a room there.");
    if (name.trim().length < 2) return setProblem("Give your room a name.");
    setBusy(true);
    setProblem(null);
    try {
      const created = await startLiveRoom({
        data: { slug: chosen.slug, name: name.trim(), topic },
      });
      void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["liveRooms"] });
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setName("");
      onOpenChange(false);
      void navigate({ to: "/chats/$roomId", params: { roomId: String(created.roomId) } });
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Start a Room"
      description="A live voice room in one of your communities. Members get a heads-up, and anyone can hop in."
    >
      {list.length ? (
        <div className="space-y-1.5">
          <p className="text-[13.5px] font-bold text-ink">Community</p>
          <CommunityChoice communities={list} value={chosen?.slug ?? null} onChange={setSlug} />
        </div>
      ) : (
        <p className="text-[14px] text-muted">
          You haven’t joined a community yet. Join one from Communities, then come back.
        </p>
      )}
      <SheetField label="Room name">
        <input
          className={fieldClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Late Night Vibes"
        />
      </SheetField>
      <div className="space-y-1.5">
        <p className="text-[13.5px] font-bold text-ink">Topic</p>
        <div className="flex flex-wrap gap-2">
          {ROOM_TOPICS.map((t) => (
            <ChoicePill key={t} label={t} on={t === topic} onClick={() => setTopic(t)} />
          ))}
        </div>
      </div>
      {problem ? <Problem>{problem}</Problem> : null}
      <GradientButton
        size="lg"
        full
        disabled={busy || !list.length}
        onClick={() => void start()}
        icon={<Radio className="size-5" aria-hidden />}
        className="h-12 text-[17px]"
      >
        {busy ? "Starting…" : "Go live"}
      </GradientButton>
    </Sheet>
  );
}

/** "New Event" for leaders: pick a community you lead, a name, a start time and a short description. */
export function EventSheet({
  open,
  onOpenChange,
  initialSlug,
  onStartCommunity,
}: SheetProps & { onStartCommunity: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { list } = useMyCommunities();
  const led = list.filter((c) => canLeadRole(c.role));
  const [slug, setSlug] = useState<string | null>(initialSlug ?? null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const presets = useMemo(() => eventPresets(), []);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSlug(initialSlug ?? null);
      setProblem(null);
    }
  }

  const picked = list.find((c) => c.slug === slug) ?? null;
  // The suggested community only counts when you lead it; otherwise start from the first one you lead.
  const chosen = picked && canLeadRole(picked.role) ? picked : (led[0] ?? null);
  const when = custom.trim() ? localInputToIso(custom) : startsAt;

  const create = async () => {
    if (!chosen) return;
    if (title.trim().length < 3)
      return setProblem("Give the event a name (at least 3 characters).");
    if (!when) return setProblem("Pick when it starts.");
    setBusy(true);
    setProblem(null);
    try {
      await createEvent({
        data: {
          slug: chosen.slug,
          title: title.trim(),
          body: body.trim(),
          kind: "event",
          startsAt: when,
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["events", chosen.slug] });
      void queryClient.invalidateQueries({ queryKey: ["homeOverview"] });
      setTitle("");
      setBody("");
      setCustom("");
      onOpenChange(false);
      void navigate({ to: "/c/$slug/events", params: { slug: chosen.slug } });
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="New Event">
      {!chosen ? (
        <>
          <p className="text-[14px] text-muted">
            {picked
              ? `Only the leaders of ${picked.name} can schedule its events. Ask one of them, or start your own community to host events.`
              : "Events are scheduled by community leaders. Start your own community to host events, or ask a leader of yours."}
          </p>
          <GradientButton
            full
            icon={<Users className="size-5" aria-hidden />}
            onClick={() => {
              onOpenChange(false);
              onStartCommunity();
            }}
          >
            Start a community
          </GradientButton>
        </>
      ) : (
        <>
          {picked && !canLeadRole(picked.role) ? (
            <p className="text-[13px] text-muted">{`Only leaders can schedule events in ${picked.name}, so here are the communities you lead.`}</p>
          ) : null}
          <div className="space-y-1.5">
            <p className="text-[13.5px] font-bold text-ink">Community</p>
            <CommunityChoice communities={led} value={chosen.slug} onChange={setSlug} />
          </div>
          <SheetField label="Event name">
            <input
              className={fieldClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Community Talent Show"
            />
          </SheetField>
          <div className="space-y-1.5">
            <p className="text-[13.5px] font-bold text-ink">Starts</p>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <ChoicePill
                  key={p.key}
                  label={p.label}
                  on={!custom.trim() && startsAt === p.iso}
                  onClick={() => {
                    setStartsAt(p.iso);
                    setCustom("");
                  }}
                />
              ))}
            </div>
            <input
              type="datetime-local"
              aria-label="Or pick a date and time"
              className={fieldClass}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            {when ? (
              <p className="text-[13px] font-semibold text-violet-ink">{formatWhen(when)}</p>
            ) : null}
          </div>
          <SheetField label="What’s happening? (optional)">
            <textarea
              className={fieldClass}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={800}
              placeholder="Share the plan, who can join, what to bring…"
            />
          </SheetField>
          {problem ? <Problem>{problem}</Problem> : null}
          <GradientButton
            size="lg"
            full
            disabled={busy}
            onClick={() => void create()}
            icon={<CalendarDays className="size-5" aria-hidden />}
            className="h-12 text-[17px]"
          >
            {busy ? "Creating…" : "Create event"}
          </GradientButton>
        </>
      )}
    </Sheet>
  );
}

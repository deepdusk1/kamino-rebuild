import { useState } from "react";
import { toast } from "sonner";
import { GradientButton, OutlineButton, Pill } from "@/components/k";
import { joinCommunity, fileReport, updatePersona } from "@/lib/kamino/server";
import { setCommunityTopics, startLiveRoom } from "@/lib/kamino/social";
import { REPORT_REASONS, type Community, type JoinQuestion, type Membership } from "@/lib/kamino/types";
import { monthYear } from "@/lib/format-ui";
import { parseTopics } from "./helpers";
import { Sheet, SheetField, fieldClass } from "./sheet";
import { TopicChips } from "./community-parts";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** What is being reported. `targetId` for a comment is "<postId>/<commentId>", like the phone app. */
export type ReportTarget = {
  targetType: "post" | "comment" | "community" | "user";
  targetId: string;
  communityId?: string;
  /** "post", "comment" … used in the title. */
  label: string;
};

/** Report something to the community's moderators (reason + optional details). */
export function ReportDialog({
  target,
  onClose,
}: {
  target: ReportTarget | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!target) return;
    setBusy(true);
    try {
      await fileReport({
        data: {
          communityId: target.communityId,
          targetType: target.targetType,
          targetId: target.targetId,
          reason,
          details,
        },
      });
      toast.success("Thanks for telling us", {
        description: "The moderators will take a look.",
      });
      setDetails("");
      onClose();
    } catch (e) {
      toast.error(errorText(e, "Could not send the report"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={`Report this ${target?.label ?? "post"}`}
      description="Reports are private. Only the moderators see who sent them."
    >
      <SheetField label="What's wrong?">
        <select value={reason} onChange={(e) => setReason(e.target.value)} className={fieldClass}>
          {REPORT_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </SheetField>
      <SheetField label="Details (optional)">
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          maxLength={1000}
          className={fieldClass}
          placeholder="Anything that helps the moderators understand"
        />
      </SheetField>
      <GradientButton size="md" full disabled={busy} onClick={() => void send()}>
        {busy ? "Sending…" : "Send report"}
      </GradientButton>
    </Sheet>
  );
}

/**
 * Joining a private community (or one with join questions): persona name, invite code and the leaders'
 * questions. Public communities without questions join straight from the Join button instead.
 */
export function JoinDialog({
  open,
  onOpenChange,
  community,
  questions,
  onJoined,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  community: Community;
  questions: JoinQuestion[];
  onJoined: () => void;
}) {
  const [nick, setNick] = useState("");
  const [invite, setInvite] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const isPrivate = community.visibility === "private";
  async function send() {
    setBusy(true);
    try {
      const res = await joinCommunity({
        data: {
          slug: community.id,
          nickname: nick || undefined,
          invite: invite || undefined,
          answers,
        },
      });
      if (res.pending)
        toast.success("Request sent", {
          description: "The leaders will review it. You'll get a notification when you're in.",
        });
      else toast.success(`Welcome to ${community.name}!`);
      onOpenChange(false);
      onJoined();
    } catch (e) {
      toast.error(errorText(e, "Could not join"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={isPrivate ? `Ask to join ${community.name}` : `Join ${community.name}`}
      description={
        isPrivate
          ? "Leaders review every request. Pick a persona name for this community."
          : "Answer a few questions from the leaders."
      }
    >
      <SheetField label="Persona name (optional)" hint="How you appear in this community.">
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          maxLength={40}
          className={fieldClass}
          placeholder="Your name here"
        />
      </SheetField>
      {isPrivate && (
        <SheetField label="Invite code (optional)">
          <input
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            className={fieldClass}
            placeholder="ABC123"
          />
        </SheetField>
      )}
      {questions.map((q, i) => (
        <SheetField key={q.id} label={q.prompt}>
          <input
            value={answers[i] ?? ""}
            onChange={(e) =>
              setAnswers((prev) => {
                const next = [...prev];
                next[i] = e.target.value;
                return next;
              })
            }
            maxLength={500}
            className={fieldClass}
          />
        </SheetField>
      ))}
      <GradientButton size="md" full disabled={busy} onClick={() => void send()}>
        {busy ? "Sending…" : isPrivate ? "Request to join" : "Join"}
      </GradientButton>
    </Sheet>
  );
}

/** Community info and rules (⋯ → About & rules). */
export function AboutDialog({
  open,
  onOpenChange,
  community,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  community: Community;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={`About ${community.name}`}>
      <div className="flex flex-wrap gap-1.5">
        <Pill tone="violet">{community.category}</Pill>
        <Pill tone="blue">
          {community.visibility === "public"
            ? "Public"
            : community.visibility === "private"
              ? "Private"
              : "Unlisted"}
        </Pill>
        {community.ageGate > 13 ? <Pill tone="pink">{community.ageGate}+</Pill> : null}
        <Pill tone="neutral">Since {monthYear(community.createdAt)}</Pill>
      </div>
      <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-body">
        {community.description || community.tagline}
      </p>
      {community.contentWarnings.length > 0 && (
        <p className="rounded-tile bg-tint-orange px-3 py-2 text-[13px] font-semibold text-orange-ink">
          Content notes: {community.contentWarnings.join(" · ")}
        </p>
      )}
      <h3 className="text-[15px] font-extrabold text-ink">Community rules</h3>
      <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-body">
        {community.rules || "Be kind. Follow the house laws."}
      </p>
    </Sheet>
  );
}

/** Your name and short bio inside this community (⋯ → My persona). */
export function PersonaDialog({
  open,
  onOpenChange,
  slug,
  member,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  member: Membership;
  onSaved: () => void;
}) {
  const [nickname, setNickname] = useState(member.nickname);
  const [bio, setBio] = useState(member.personaBio);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await updatePersona({
        data: { slug, nickname: nickname || member.nickname, personaBio: bio },
      });
      toast.success("Persona saved");
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(errorText(e, "Could not save your persona"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="My persona"
      description="Your name and bio in this community only."
    >
      <SheetField label="Persona name">
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={40}
          className={fieldClass}
        />
      </SheetField>
      <SheetField label="Persona bio">
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={300}
          className={fieldClass}
          placeholder="A line about you, just for this community"
        />
      </SheetField>
      <GradientButton size="md" full disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save persona"}
      </GradientButton>
    </Sheet>
  );
}

/** Leaders: the topic chips under the description (up to 8). */
export function TopicsDialog({
  open,
  onOpenChange,
  slug,
  topics,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  topics: string[];
  onSaved: () => void;
}) {
  const [text, setText] = useState(topics.join(", "));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await setCommunityTopics({ data: { slug, topics: parseTopics(text) } });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(errorText(e, "Could not save the topics"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Topics"
      description="Up to 8 short topics, separated by commas. They show as chips under the description."
    >
      <SheetField label="Topics">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={240}
          className={fieldClass}
          placeholder="Anime, Manga, Fan Art"
        />
      </SheetField>
      <TopicChips topics={parseTopics(text)} className="-mx-5 px-5" />
      <GradientButton size="md" full disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save topics"}
      </GradientButton>
    </Sheet>
  );
}

/** Any member can start a live voice room; it opens straight away. */
export function StartRoomDialog({
  open,
  onOpenChange,
  slug,
  communityName,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  communityName: string;
  onStarted: (roomId: number) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  async function start() {
    const clean = name.trim();
    if (!clean) {
      toast.error("Give the room a short name first.");
      return;
    }
    setBusy(true);
    try {
      const res = await startLiveRoom({ data: { slug, name: clean } });
      setName("");
      onOpenChange(false);
      onStarted(res.roomId);
    } catch (e) {
      toast.error(errorText(e, "Could not start the room"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Start a live room"
      description={`A voice room everyone in ${communityName} can join. Your followers here get a heads-up.`}
    >
      <SheetField label="Room name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className={fieldClass}
          placeholder="Late Night Vibes"
        />
      </SheetField>
      <div className="flex gap-2">
        <OutlineButton onClick={() => onOpenChange(false)}>Cancel</OutlineButton>
        <GradientButton size="md" disabled={busy} onClick={() => void start()} className="min-w-0 flex-1">
          {busy ? "Starting…" : "Go live"}
        </GradientButton>
      </div>
    </Sheet>
  );
}

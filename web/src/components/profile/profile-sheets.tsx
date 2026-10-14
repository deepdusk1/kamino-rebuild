import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Camera,
  Grid3x3,
  Loader2,
  Lock,
  Mail,
  Award,
  Shield,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AchievementTile } from "@/components/achievement-banner";
import { Sheet } from "@/components/community/sheet";
import { SUPPORT_EMAIL } from "@/components/legal-page";
import {
  Avatar,
  EmptyHint,
  GradientButton,
  TabsUnderline,
  TONE_STYLE,
  VerifiedTick,
  type Tone,
} from "@/components/k";
import { resizeImage } from "@/lib/image-resize";
import { compactNumber } from "@/lib/format-ui";
import { removeAvatar, removeProfileCover, setAvatar, setProfileCover } from "@/lib/kamino/extras";
import { getUploadAllowance } from "@/lib/kamino/content-v9";
import { toggleFollowProfile, updateSettings } from "@/lib/kamino/server";
import { followLists, profilePosts } from "@/lib/kamino/social";
import { PROFILE_COVERS } from "@/lib/kamino/titles";
import type { Achievement, CommunityCardData, PersonRow } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";
import { byCategory, toggleShowcase } from "./helpers";
import { CommunityTile, ProfilePostTile } from "./profile-parts";

export type ListKind = "followers" | "following" | "friends";

const fail = (e: unknown, fallback = "Something went wrong. Please try again.") =>
  toast.error(e instanceof Error ? e.message : fallback);

function Spinner() {
  return (
    <div className="grid place-items-center py-10" role="status" aria-label="Loading">
      <Loader2 className="size-6 animate-spin text-violet" aria-hidden />
    </div>
  );
}

// ── Followers / Following / Friends ─────────────────────────────────────────

/** The people lists behind the profile numbers, with a Friends tab (people who follow each other). */
export function FollowListSheet({
  handle,
  kind,
  onKind,
  onClose,
  viewerId,
}: {
  handle: string;
  kind: ListKind | null;
  onKind: (k: ListKind) => void;
  onClose: () => void;
  viewerId?: string;
}) {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ["followLists", handle, kind],
    queryFn: () => followLists({ data: { handle, kind: kind! } }),
    enabled: !!kind,
  });
  const counts = list.data?.counts;
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(person: PersonRow) {
    if (!viewerId) return void (window.location.href = "/login");
    setBusy(person.userId);
    try {
      const r = await toggleFollowProfile({ data: person.userId });
      if (r.requested)
        toast("Request sent", { description: "This account is private. They'll decide." });
      await queryClient.invalidateQueries({ queryKey: ["followLists", handle] });
      void queryClient.invalidateQueries({ queryKey: ["profileOverview"] });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const tab = (k: ListKind, label: string) => ({
    key: k,
    label: counts ? `${label} ${compactNumber(counts[k])}` : label,
  });

  return (
    <Sheet
      open={!!kind}
      onOpenChange={(o) => !o && onClose()}
      title={`@${handle}`}
      className="lg:w-[520px]"
    >
      <TabsUnderline
        tabs={[
          tab("followers", "Followers"),
          tab("following", "Following"),
          tab("friends", "Friends"),
        ]}
        value={kind ?? "followers"}
        onChange={(k) => onKind(k as ListKind)}
        label="Lists"
        className="-mx-5 -mt-1 bg-transparent px-2"
      />
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <EmptyHint icon="😕" title="Couldn't load this list" text={list.error.message} />
      ) : list.data.locked ? (
        <EmptyHint
          icon="🔒"
          title="This account is private"
          text="Follow them to see who they follow."
        />
      ) : (
        <div className="space-y-2">
          {kind === "friends" ? (
            <p className="text-[12.5px] text-muted">Friends are people who follow each other.</p>
          ) : null}
          {list.data.people.length === 0 ? (
            <EmptyHint
              icon={kind === "friends" ? "🤝" : "👋"}
              title={
                kind === "followers"
                  ? "No followers yet"
                  : kind === "following"
                    ? "Not following anyone yet"
                    : "No friends here yet"
              }
              text="When people connect, they show up here."
            />
          ) : (
            <ul className="space-y-2">
              {list.data.people.map((p) => (
                <PersonListRow
                  key={p.userId}
                  person={p}
                  self={p.userId === viewerId}
                  busy={busy === p.userId}
                  onOpen={onClose}
                  onFollow={() => void toggle(p)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}

function PersonListRow({
  person,
  self,
  busy,
  onOpen,
  onFollow,
}: {
  person: PersonRow;
  self: boolean;
  busy: boolean;
  onOpen: () => void;
  onFollow: () => void;
}) {
  const label = person.following
    ? "Following"
    : person.requested
      ? "Requested"
      : person.followsYou
        ? "Follow Back"
        : "Follow";
  return (
    <li className="k-card relative flex items-center gap-2.5 rounded-tile p-2.5">
      <Avatar
        person={{
          name: person.displayName,
          hue: person.avatarHue,
          userId: person.userId,
          avatarV: person.avatarV,
        }}
        size={44}
        online={person.online || undefined}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1">
          <Link
            to="/u/$handle"
            params={{ handle: person.handle }}
            onClick={onOpen}
            className="k-focus truncate text-[14px] font-extrabold text-ink after:absolute after:inset-0 after:content-['']"
          >
            {person.displayName}
          </Link>
          {person.verified ? <VerifiedTick size={13} /> : null}
        </p>
        <p className="truncate text-[12px] text-muted">
          @{person.handle}
          {person.headline ? ` · ${person.headline}` : ""}
        </p>
      </div>
      {self ? null : person.following || person.requested ? (
        <button
          type="button"
          onClick={onFollow}
          disabled={busy}
          aria-label={
            person.following
              ? `Unfollow ${person.displayName}`
              : `Cancel request to ${person.displayName}`
          }
          className="k-focus k-hit relative z-10 h-7 shrink-0 rounded-full bg-tint-violet px-3 text-[12.5px] font-bold text-violet-ink disabled:opacity-60"
        >
          {label}
        </button>
      ) : (
        <GradientButton
          size="xs"
          onClick={onFollow}
          disabled={busy}
          aria-label={`${label} ${person.displayName}`}
          className="relative z-10 h-7"
        >
          {label}
        </GradientButton>
      )}
    </li>
  );
}

// ── A person's posts (category tiles, "See All") ────────────────────────────

/** A grid of someone's posts, all of them or only one profile category (`tag`). */
export function ProfilePostsSheet({
  handle,
  open,
  tag,
  title,
  hue,
  onClose,
}: {
  handle: string;
  open: boolean;
  tag?: string;
  title: string;
  hue: number;
  onClose: () => void;
}) {
  const posts = useInfiniteQuery({
    queryKey: ["profilePosts", handle, tag ?? ""],
    queryFn: ({ pageParam }) => profilePosts({ data: { handle, tag, cursor: pageParam } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    enabled: open,
  });
  const items = posts.data?.pages.flatMap((p) => p.posts) ?? [];
  const locked = posts.data?.pages[0]?.locked;
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={`@${handle}`}
      className="lg:w-[760px]"
    >
      {posts.isPending ? (
        <Spinner />
      ) : posts.isError ? (
        <EmptyHint icon="😕" title="Couldn't load posts" text={posts.error.message} />
      ) : locked ? (
        <EmptyHint
          icon="🔒"
          title="This account is private"
          text="Follow them to see their posts."
        />
      ) : items.length === 0 ? (
        <EmptyHint
          icon="🗂️"
          title="No posts here yet"
          text={
            tag ? "Posts tagged for this category will show up here." : "Posts will show up here."
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3">
            {items.map((p, i) => (
              <ProfilePostTile key={p.id} post={p} hue={hue + i * 23} />
            ))}
          </div>
          {posts.hasNextPage ? (
            <button
              type="button"
              onClick={() => void posts.fetchNextPage()}
              disabled={posts.isFetchingNextPage}
              className="k-focus mx-auto block min-h-11 rounded-full px-4 text-[14px] font-bold text-violet"
            >
              {posts.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

// ── All achievements ────────────────────────────────────────────────────────

/** Every achievement with progress. On your own profile the star picks up to three for your showcase. */
export function AchievementsSheet({
  open,
  achievements,
  showcase,
  isSelf,
  loading,
  onShowcase,
  onClose,
}: {
  open: boolean;
  achievements: Achievement[];
  showcase: string[];
  isSelf: boolean;
  loading: boolean;
  onShowcase: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [all, setAll] = useState(isSelf);
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const shown = all ? achievements : achievements.filter((a) => a.unlocked);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Achievements"
      description={`${unlocked} of ${achievements.length} unlocked`}
      className="lg:w-[640px]"
    >
      <TabsUnderline
        tabs={[
          { key: "unlocked", label: "Unlocked", icon: <Award /> },
          { key: "all", label: "All", icon: <Grid3x3 /> },
        ]}
        value={all ? "all" : "unlocked"}
        onChange={(k) => setAll(k === "all")}
        label="Which achievements"
        className="-mx-5 -mt-1 bg-transparent px-2"
      />
      {isSelf ? (
        <p className="flex items-start gap-2 rounded-tile bg-tint-violet p-2.5 text-[12.5px] font-semibold text-violet-ink">
          <Star className="mt-px size-4 shrink-0 fill-current" aria-hidden />
          Tap the star on up to three unlocked achievements to show them on your profile. The first
          one is your top banner.
        </p>
      ) : null}
      {loading ? <Spinner /> : null}
      {!loading && shown.length === 0 ? (
        <EmptyHint
          icon="🏅"
          title="No achievements yet"
          text="Post, chat and play to unlock them."
        />
      ) : null}
      {!loading &&
        byCategory(shown).map((group) => (
          <section key={group.category} className="space-y-2">
            <h3 className="text-[15px] font-extrabold text-ink">{group.category}</h3>
            <ul className="grid gap-2 lg:grid-cols-2">
              {group.items.map((a) => (
                <AchievementTile
                  key={a.id}
                  achievement={a}
                  showcased={showcase.includes(a.id)}
                  onToggleShowcase={
                    isSelf ? () => onShowcase(toggleShowcase(showcase, a.id)) : undefined
                  }
                />
              ))}
            </ul>
          </section>
        ))}
    </Sheet>
  );
}

// ── All communities ─────────────────────────────────────────────────────────

/** Every community on the profile, with Join / Joined. */
export function CommunitiesSheet({
  open,
  handle,
  communities,
  busy,
  onJoin,
  onClose,
}: {
  open: boolean;
  handle: string;
  communities: CommunityCardData[];
  busy: string | null;
  onJoin: (c: CommunityCardData) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Communities"
      description={`@${handle}`}
      className="lg:w-[640px]"
    >
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        {communities.map((c, i) => (
          <CommunityTile
            key={c.id}
            community={c}
            index={i}
            busy={busy === c.id}
            onJoin={() => onJoin(c)}
          />
        ))}
      </div>
    </Sheet>
  );
}

// ── Safety centre (your own profile) ────────────────────────────────────────

function SafetyRow({
  icon,
  label,
  hint,
  tone,
  to,
  href,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  tone: Tone;
  to?: string;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "grid size-[38px] shrink-0 place-items-center rounded-full [&_svg]:size-[19px]",
          TONE_STYLE[tone].softClassName,
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-5 font-bold text-ink">{label}</span>
        <span className="block text-[12.5px] leading-4 text-muted">{hint}</span>
      </span>
    </>
  );
  const cls =
    "k-focus flex min-h-[52px] w-full items-center gap-3 rounded-tile px-2 text-left hover:bg-surface-alt";
  if (to)
    return (
      <Link to={to} className={cls} onClick={onClick}>
        {inner}
      </Link>
    );
  return (
    <a href={href} className={cls}>
      {inner}
    </a>
  );
}

/** Safety centre for your own profile: privacy, your standing in each community, house rules and help. */
export function SafetySheet({
  open,
  onClose,
  communities,
}: {
  open: boolean;
  onClose: () => void;
  communities: CommunityCardData[];
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Safety"
      description="Kamino is for kind, real connection. You can block or report anyone from the ⋯ menu on their profile, a post or a message."
    >
      <div className="-mx-2 space-y-0.5">
        <SafetyRow
          icon={<Lock />}
          label="Privacy and blocked people"
          hint="Private account, who can message you, unblock"
          tone="blue"
          to="/settings"
          onClick={onClose}
        />
        {communities.slice(0, 6).map((c) => (
          <SafetyRow
            key={c.id}
            icon={<ShieldCheck />}
            label={`My standing in ${c.name}`}
            hint="Rules, warnings and the moderators"
            tone="green"
            to={`/c/${c.id}`}
            onClick={onClose}
          />
        ))}
        <SafetyRow
          icon={<Shield />}
          label="How Kamino keeps you safe"
          hint="House rules, moderation and where to get help"
          tone="violet"
          to="/safety"
          onClick={onClose}
        />
        <SafetyRow
          icon={<Mail />}
          label="Contact support"
          hint="We read every message"
          tone="pink"
          href={`mailto:${SUPPORT_EMAIL}`}
        />
      </div>
      <p className="text-[12px] text-subtle">
        If someone is in danger, contact local emergency services right away.
      </p>
    </Sheet>
  );
}

// ── Cover and photo ─────────────────────────────────────────────────────────

/** Upload or remove your cover and photo, or pick one of the built-in banners. */
export function CoverSheet({
  open,
  onClose,
  hasCover,
  hasPhoto,
  currentCover,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  hasCover: boolean;
  hasPhoto: boolean;
  currentCover: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, work: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await work();
      toast.success(done);
      onChanged();
    } catch (e) {
      fail(e, "Upload failed");
    } finally {
      setBusy(null);
    }
  }
  async function upload(kind: "cover" | "photo", file: File | undefined) {
    if (!file) return;
    await run(
      kind,
      async () => {
        const capability =
          kind === "photo" && file.type === "image/gif" ? await getUploadAllowance() : null;
        const dataUrl = capability?.animatedAvatar
          ? await new Promise<string>((resolve, reject) => {
              if (file.size > 2_000_000)
                return reject(new Error("Animated avatars must be under 2 MB."));
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error("Could not read the GIF."));
              reader.readAsDataURL(file);
            })
          : await resizeImage(
              file,
              kind === "cover"
                ? { maxSide: 1600, maxChars: 1_900_000 }
                : { maxSide: 320, maxChars: 290_000, square: true },
            );
        if (kind === "cover") await setProfileCover({ data: { dataUrl } });
        else await setAvatar({ data: { dataUrl } });
      },
      kind === "cover" ? "Cover updated" : "Photo updated",
    );
  }
  const pick = (kind: "cover" | "photo", label: string) => (
    <label
      className={cn(
        "k-focus inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-[14px] font-bold focus-within:ring-2 focus-within:ring-violet",
        kind === "cover"
          ? "bg-grad-primary text-white shadow-glow"
          : "bg-tint-violet text-violet-ink",
        busy && "pointer-events-none opacity-60",
      )}
    >
      <Camera className="size-4" aria-hidden /> {busy === kind ? "Uploading…" : label}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        disabled={!!busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void upload(kind, file);
        }}
      />
    </label>
  );
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Cover and photo"
      className="lg:w-[560px]"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {pick("cover", "Upload a cover")}
        {pick("photo", "Upload a photo")}
        {hasCover ? (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run("rmcover", () => removeProfileCover(), "Cover removed")}
            className="k-focus inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border text-[14px] font-bold text-danger"
          >
            <Trash2 className="size-4" aria-hidden /> Remove cover
          </button>
        ) : null}
        {hasPhoto ? (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void run("rmphoto", () => removeAvatar(), "Photo removed")}
            className="k-focus inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border text-[14px] font-bold text-danger"
          >
            <Trash2 className="size-4" aria-hidden /> Remove photo
          </button>
        ) : null}
      </div>
      <p className="text-[13px] font-bold text-ink">Or pick a built-in banner</p>
      <div className="grid grid-cols-3 gap-2">
        {PROFILE_COVERS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={currentCover === c.src}
            aria-label={`Use the ${c.label} banner`}
            disabled={!!busy}
            onClick={() =>
              void run(c.id, () => updateSettings({ data: { cover: c.src } }), "Cover updated")
            }
            className={cn(
              "k-focus overflow-hidden rounded-[12px] ring-offset-2 ring-offset-surface",
              currentCover === c.src && "ring-2 ring-violet",
            )}
          >
            <img src={c.src} alt="" className="h-16 w-full object-cover" />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

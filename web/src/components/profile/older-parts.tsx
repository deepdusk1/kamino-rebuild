import { Link } from "@tanstack/react-router";
import { Heart, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { fieldClass } from "@/components/community/sheet";
import { personFromChip } from "@/components/community/helpers";
import { Avatar, GradientButton, OutlineButton } from "@/components/k";
import { TitleChip } from "@/components/title-chip";
import { timeAgo } from "@/lib/format-ui";
import { HELD_MESSAGE } from "@/lib/kamino/held";
import {
  addWallPost,
  deleteCharacter,
  deleteWallPost,
  hideTitle,
  pinTitle,
  saveCharacter,
  toggleWallLike,
} from "@/lib/kamino/server";
import type { getPublicProfile } from "@/lib/kamino/server";
import type { MemberTitle } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";
import { ProfileSection } from "./profile-parts";

export type LegacyProfile = Awaited<ReturnType<typeof getPublicProfile>>;

const fail = (e: unknown, fallback = "Something went wrong. Please try again.") =>
  toast.error(e instanceof Error ? e.message : fallback);

/**
 * Everything the older profile had, in the new style, under the mockup's sections: titles from communities,
 * pinned wiki pages, original characters and the wall (notes people leave).
 */
export function OlderProfileParts({
  data,
  viewerId,
  refresh,
}: {
  data: LegacyProfile;
  viewerId?: string;
  refresh: () => unknown;
}) {
  const titles = (data.titles ?? []).filter((t: MemberTitle) => (data.isSelf ? true : !t.hidden));
  const shown = titles.filter((t: MemberTitle) => !t.hidden);
  const hidden = titles.filter((t: MemberTitle) => t.hidden);
  return (
    <div className="space-y-5">
      {titles.length ? (
        <ProfileSection title="Titles" emoji="🏷️">
          <div className="flex flex-wrap gap-1.5">
            {shown.map((t: MemberTitle) => (
              <TitleChip
                key={t.id}
                label={t.label}
                color={t.color}
                hall={t.communityName}
                pinned={t.pinned}
                onClick={data.isSelf ? () => void pinTitle({ data: t.id }).then(refresh, fail) : undefined}
              />
            ))}
          </div>
          {data.isSelf ? (
            <p className="text-[12px] text-muted">
              Tap a title to pin it under your name. Leaders give these out in their communities.
            </p>
          ) : null}
          {data.isSelf && hidden.length ? (
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
              Hidden:
              {hidden.map((t: MemberTitle) => (
                <button
                  key={t.id}
                  type="button"
                  className="k-focus k-hit relative rounded-full px-1 font-bold text-violet"
                  onClick={() => void hideTitle({ data: t.id }).then(refresh, fail)}
                >
                  Show {t.label}
                </button>
              ))}
            </div>
          ) : null}
        </ProfileSection>
      ) : null}

      {data.pinnedWiki.length ? (
        <ProfileSection title="Pinned wiki pages" emoji="📌">
          <div className="grid gap-2 lg:grid-cols-2">
            {data.pinnedWiki.map((wiki) => (
              <Link
                key={wiki.id}
                to="/c/$slug/p/$postId"
                params={{ slug: wiki.communityId, postId: String(wiki.id) }}
                className="k-card k-focus block rounded-tile p-3 transition-transform hover:-translate-y-0.5"
              >
                <p className="text-[11.5px] font-bold text-green-ink">Community wiki</p>
                <p className="mt-0.5 text-[15px] font-extrabold text-ink">{wiki.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">{wiki.body}</p>
              </Link>
            ))}
          </div>
        </ProfileSection>
      ) : null}

      <Characters mine={data.isSelf} characters={data.characters ?? []} onChange={refresh} />

      <Wall data={data} viewerId={viewerId} refresh={refresh} />
    </div>
  );
}

function Wall({ data, viewerId, refresh }: { data: LegacyProfile; viewerId?: string; refresh: () => unknown }) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const name = data.profile.displayName;
  async function post() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const res = await addWallPost({ data: { handle: data.profile.handle, body: body.trim() } });
      if (res.held) toast(HELD_MESSAGE);
      setBody("");
      await refresh();
    } catch (e) {
      fail(e, "Could not post");
    } finally {
      setBusy(false);
    }
  }
  const wall = data.wall ?? [];
  return (
    <ProfileSection title="Wall" emoji="💬">
      {viewerId && !data.blocked ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void post();
          }}
        >
          <label className="sr-only" htmlFor="wall-note">
            Write on the wall
          </label>
          <textarea
            id="wall-note"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder={data.isSelf ? "Write on your own wall" : `Say something kind to ${name}`}
            className={fieldClass}
          />
          <div className="flex justify-end">
            <GradientButton type="submit" size="sm" disabled={busy || !body.trim()} icon={<Send className="size-4" aria-hidden />}>
              {busy ? "Posting…" : "Post to wall"}
            </GradientButton>
          </div>
        </form>
      ) : null}
      {wall.length === 0 ? <p className="text-[13px] text-muted">No wall notes yet. Be the first to say hi!</p> : null}
      <ul className="space-y-2">
        {wall.map((w) => (
          <li key={w.id} className="k-card flex gap-2.5 rounded-tile p-3">
            <Link to="/u/$handle" params={{ handle: w.author.handle }} aria-label={`${w.author.nickname}'s profile`} className="k-focus shrink-0 rounded-full">
              <Avatar person={personFromChip(w.author)} size={34} />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-violet-ink">
                {w.author.nickname}{" "}
                <span className="font-semibold text-subtle" suppressHydrationWarning>
                  · {timeAgo(w.createdAt)}
                </span>
              </p>
              <p className="text-[14px] text-body">{w.body}</p>
              <div className="mt-1 flex items-center gap-4">
                <button
                  type="button"
                  aria-pressed={w.liked}
                  aria-label={w.liked ? "Unlike this note" : "Like this note"}
                  className={cn("k-focus k-hit relative inline-flex h-8 items-center gap-1 text-[12.5px] font-bold", w.liked ? "text-pink-ink" : "text-muted")}
                  onClick={() => void toggleWallLike({ data: w.id }).then(refresh, fail)}
                >
                  <Heart className={cn("size-4", w.liked && "fill-current")} aria-hidden />
                  {w.likeCount}
                </button>
                {data.isSelf || viewerId === w.author.userId ? (
                  <button
                    type="button"
                    className="k-focus k-hit relative inline-flex h-8 items-center gap-1 text-[12.5px] font-bold text-danger"
                    onClick={() => void deleteWallPost({ data: w.id }).then(refresh, fail)}
                  >
                    <Trash2 className="size-3.5" aria-hidden /> Delete
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </ProfileSection>
  );
}

type CharacterRow = LegacyProfile["characters"][number];

/** Original characters (OCs): anyone can read them; the owner adds and removes them. */
function Characters({ mine, characters, onChange }: { mine: boolean; characters: CharacterRow[]; onChange: () => unknown }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!mine && characters.length === 0) return null;
  return (
    <ProfileSection
      title="Characters"
      emoji="🎭"
      action={
        mine ? (
          <OutlineButton size="xs" onClick={() => setOpen((v) => !v)}>
            {open ? "Close" : "Add a character"}
          </OutlineButton>
        ) : undefined
      }
    >
      {open && mine ? (
        <form
          className="k-card space-y-2 rounded-tile p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setBusy(true);
            void saveCharacter({
              data: {
                name: String(fd.get("name")),
                fandom: String(fd.get("fandom")),
                bio: String(fd.get("bio")),
                appearance: String(fd.get("appearance")),
              },
            })
              .then(() => {
                setOpen(false);
                return onChange();
              }, (err: unknown) => fail(err, "Could not save"))
              .finally(() => setBusy(false));
          }}
        >
          <input name="name" required placeholder="Name" aria-label="Name" className={fieldClass} />
          <input name="fandom" placeholder="Fandom or world" aria-label="Fandom or world" className={fieldClass} />
          <textarea name="bio" rows={3} placeholder="Who they are" aria-label="Who they are" className={fieldClass} />
          <input name="appearance" placeholder="Look and little details" aria-label="Look and little details" className={fieldClass} />
          <GradientButton type="submit" size="sm" disabled={busy} full>
            {busy ? "Saving…" : "Save character"}
          </GradientButton>
        </form>
      ) : null}
      {characters.length === 0 ? <p className="text-[13px] text-muted">No characters yet.</p> : null}
      <div className="grid gap-2 lg:grid-cols-2">
        {characters.map((c) => (
          <article key={c.id} className="k-card flex items-start gap-2.5 rounded-tile p-3">
            <Avatar person={{ name: c.name, hue: c.hue }} size={40} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-extrabold text-ink">{c.name}</p>
              <p className="text-[12px] font-semibold text-violet-ink">{c.fandom || "Original"}</p>
              {c.bio ? <p className="mt-1 text-[13px] text-muted">{c.bio}</p> : null}
              {mine ? (
                <button
                  type="button"
                  className="k-focus k-hit relative mt-1 text-[12.5px] font-bold text-danger"
                  onClick={() => void deleteCharacter({ data: c.id }).then(() => onChange(), fail)}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </ProfileSection>
  );
}

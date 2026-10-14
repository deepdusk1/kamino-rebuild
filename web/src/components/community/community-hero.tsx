import { Link } from "@tanstack/react-router";
import { Clock, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  CommunityCover,
  GradientButton,
  JoinButton,
  OnlineDot,
  Pill,
  VerifiedTick,
} from "@/components/k";
import { defaultCover } from "@/lib/brand-art";
import { compactNumber } from "@/lib/format-ui";
import type { Community, Membership } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";

/** The Join / Joined / Requested button of a community (same in the big and the small header). */
export function JoinState({
  community,
  member,
  busy,
  onJoin,
  onJoined,
  size = "md",
}: {
  community: Pick<Community, "name">;
  member: Membership | null;
  busy: boolean;
  onJoin: () => void;
  /** What "Joined" does when pressed (opens the community menu, like the phone app). */
  onJoined: () => void;
  size?: "sm" | "md";
}) {
  if (member?.status === "active")
    return (
      <JoinButton
        joined
        tone="violet"
        size={size === "md" ? "sm" : "xs"}
        onClick={onJoined}
        name={community.name}
        className={cn(size === "md" && "h-[34px] px-4 text-[14px] lg:h-11 lg:px-6 lg:text-[16px]")}
      />
    );
  if (member?.status === "pending")
    return (
      <Pill tone="orange" icon={<Clock className="size-3.5" aria-hidden />} className="h-8 px-3 text-[13px]">
        Requested
      </Pill>
    );
  if (member?.status === "banned")
    return (
      <Pill tone="pink" className="h-8 px-3 text-[13px]">
        Removed
      </Pill>
    );
  return (
    <GradientButton
      size={size === "md" ? "md" : "xs"}
      disabled={busy}
      onClick={onJoin}
      aria-label={`Join ${community.name}`}
      className={cn(
        size === "md" &&
          "h-[36px] min-w-[96px] px-6 text-[16px] lg:h-12 lg:min-w-[140px] lg:text-[18px]",
      )}
    >
      {busy ? "Joining…" : "Join"}
    </GradientButton>
  );
}

/** "👥 245K Members  ● 12.4K Online" */
function CountsLine({ members, online, className }: { members: number; online: number; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-0.5", className)}>
      <span className="inline-flex items-center gap-1">
        <Users className="size-3.5 text-violet-ink lg:size-[18px]" fill="currentColor" strokeWidth={1.5} aria-hidden />
        <span className="font-semibold text-body">{compactNumber(members)} Members</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <OnlineDot size={8} className="ring-0 lg:size-2.5" />
        <span className="font-semibold text-body">{compactNumber(online)} Online</span>
      </span>
    </p>
  );
}

/** Square community icon with a white border (or the colourful letter when there is none). */
function CommunityIconBox({ community, className }: { community: Community; className?: string }) {
  return (
    <span
      className={cn(
        "block shrink-0 overflow-hidden border-4 border-surface bg-surface shadow-card",
        className,
      )}
    >
      <CommunityCover community={{ ...community, cover: community.icon || null }} useIcon letterSize={40} className="size-full rounded-[inherit]" />
    </span>
  );
}

/**
 * The big community header (mockup 05-community): full-width cover with rounded bottom corners, the square icon
 * overlapping it, the name, member and online counts, Join, and the description (click to read it all).
 * On computers the cover is a wide rounded banner and the text gets more room.
 */
export function CommunityHero({
  community,
  member,
  memberCount,
  onlineCount,
  joinBusy,
  onJoin,
  onJoined,
  aside,
}: {
  community: Community;
  member: Membership | null;
  memberCount: number;
  onlineCount: number;
  joinBusy: boolean;
  onJoin: () => void;
  onJoined: () => void;
  /** Extra buttons next to Join on computers (e.g. check in). */
  aside?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const cover = community.cover || defaultCover(community.hue);
  const text = community.description || community.tagline;
  return (
    <section aria-label={community.name}>
      <div className="relative h-[138px] overflow-hidden rounded-b-[22px] bg-surface-alt sm:h-[200px] lg:mx-4 lg:mt-1 lg:h-[280px] lg:rounded-hero">
        <img src={cover} alt="" className="size-full object-cover" draggable={false} />
      </div>
      <div className="flex gap-3 px-3 lg:gap-6 lg:px-10">
        <CommunityIconBox
          community={community}
          className="relative z-[1] -mt-[42px] size-[104px] rounded-[24px] lg:-mt-[76px] lg:size-[150px] lg:rounded-[32px]"
        />
        <div className="min-w-0 flex-1 pt-2 lg:pt-4">
          <div className="flex items-start gap-2 lg:items-center lg:gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-1.5 text-[21px] leading-[25px] font-extrabold tracking-[-0.4px] text-ink lg:text-[34px] lg:leading-tight">
                <span className="line-clamp-2">{community.name}</span>
                {community.verified ? <VerifiedTick size={16} className="lg:size-6" /> : null}
              </h1>
              <CountsLine
                members={memberCount}
                online={onlineCount}
                className="mt-0.5 text-[12px] leading-4 lg:mt-1 lg:text-[15px]"
              />
            </div>
            <div className="mt-0.5 flex shrink-0 items-center gap-2">
              {aside ? <div className="hidden items-center gap-2 lg:flex">{aside}</div> : null}
              <JoinState
                community={community}
                member={member}
                busy={joinBusy}
                onJoin={onJoin}
                onJoined={onJoined}
              />
            </div>
          </div>
          {text ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? "Show less of the description" : "Show the whole description"}
              className="k-focus mt-1 block w-full rounded-md text-left lg:mt-2 lg:max-w-3xl"
            >
              <span
                className={cn(
                  "block text-[12.5px] leading-[17px] whitespace-pre-line text-muted lg:text-[15px] lg:leading-[22px]",
                  !open && "line-clamp-3",
                )}
              >
                {text}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export type SectionLink = { key: string; label: string; to: string; active: boolean };

/**
 * The small header on a community's other pages (chats, wiki, events …): icon, name, counts, Join, and pills to
 * move between the community's sections.
 */
export function CommunityMiniHeader({
  community,
  member,
  memberCount,
  onlineCount,
  joinBusy,
  onJoin,
  onJoined,
  sections,
}: {
  community: Community;
  member: Membership | null;
  memberCount: number;
  onlineCount: number;
  joinBusy: boolean;
  onJoin: () => void;
  onJoined: () => void;
  sections: SectionLink[];
}) {
  return (
    <section aria-label={community.name} className="space-y-2.5 px-4 pt-1 lg:pt-3">
      <div className="k-card relative flex items-center gap-3 overflow-hidden rounded-card p-2.5 lg:p-3.5">
        <img
          src={community.cover || defaultCover(community.hue)}
          alt=""
          className="pointer-events-none absolute inset-0 size-full object-cover opacity-[0.14]"
        />
        <span className="relative size-12 shrink-0 overflow-hidden rounded-[14px] lg:size-14">
          <CommunityCover community={{ ...community, cover: community.icon || null }} useIcon letterSize={20} className="size-full" />
        </span>
        <div className="relative min-w-0 flex-1">
          <p className="flex items-center gap-1 text-[16px] leading-5 font-extrabold text-ink lg:text-[19px]">
            <Link
              to="/c/$slug"
              params={{ slug: community.id }}
              className="k-focus truncate hover:underline"
            >
              {community.name}
            </Link>
            {community.verified ? <VerifiedTick size={14} /> : null}
          </p>
          <CountsLine members={memberCount} online={onlineCount} className="text-[12px] lg:text-[13.5px]" />
        </div>
        <div className="relative">
          <JoinState
            community={community}
            member={member}
            busy={joinBusy}
            onJoin={onJoin}
            onJoined={onJoined}
            size="sm"
          />
        </div>
      </div>
      <nav aria-label={`${community.name} sections`} className="k-row -mx-4 gap-1.5 px-4 lg:mx-0 lg:px-0">
        {sections.map((s) => (
          <Link
            key={s.key}
            to={s.to}
            aria-current={s.active ? "page" : undefined}
            className={cn(
              "k-focus k-hit inline-flex h-8 shrink-0 items-center rounded-full px-[13px] text-[12.5px] font-semibold whitespace-nowrap transition-colors lg:h-9 lg:px-4 lg:text-[14px]",
              s.active
                ? "bg-grad-primary text-white shadow-[0_4px_12px_rgba(124,58,237,0.28)]"
                : "border border-border bg-surface text-ink hover:bg-surface-alt",
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}

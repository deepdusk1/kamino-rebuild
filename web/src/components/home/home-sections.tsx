import { Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import type { ReactNode } from "react";
import {
  Avatar,
  CardRow,
  CommunityCard,
  DayStreakCard,
  EventCard,
  GradientButton,
  JoinButton,
  SectionHeader,
  VerifiedTick,
  toneAt,
} from "@/components/k";
import type { CommunityCardData, CreatorCard, EventCard as EventCardData, StreakInfo } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";
import { personFromChip } from "./home-data";

/**
 * The Home cards from the mockup (03-home), from "Recommended for You" down to "Featured Creators".
 * Plain props: the Home page loads `homeOverview` and passes the actions in. Same pieces as the
 * phone app's `HomeSections.tsx`.
 */

/** Section title (coloured emoji + title + "See All →") with the mockup's spacing. */
export function HomeSection({
  icon,
  title,
  seeAllTo,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  seeAllTo?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-1 lg:gap-3", className)} aria-label={title}>
      <SectionHeader icon={icon} title={title} seeAllTo={seeAllTo} />
      {children}
    </section>
  );
}

/**
 * A row of community cards: four across on phones (scrolls sideways), one row of six on computers.
 * `vertical` has member faces and Join (Recommended); `compact` is picture + name + one line (Trending).
 */
export function CommunityRow({
  communities,
  variant,
  busy,
  onJoin,
  label,
}: {
  communities: CommunityCardData[];
  variant: "vertical" | "compact";
  busy: string | null;
  onJoin?: (c: CommunityCardData) => void;
  label: string;
}) {
  return (
    <CardRow label={label} perRow={4} desktopCols={6} className="lg:gap-4! lg:[&>*:nth-child(n+7)]:hidden">
      {communities.map((c, i) => (
        <CommunityCard
          key={c.id}
          variant={variant}
          index={i}
          community={{ ...c, tagline: c.tagline || c.description }}
          faces={c.memberFaces.map(personFromChip)}
          joined={c.joined}
          joinBusy={busy === c.id}
          onJoin={onJoin ? () => onJoin(c) : undefined}
        />
      ))}
    </CardRow>
  );
}

/** "Daily Streak" (tap to check in) and "📅 Live Event" (Join Event = RSVP) side by side. */
export function StreakAndEvent({
  streak,
  event,
  when,
  checkingIn,
  onCheckIn,
  rsvpBusy,
  onRsvp,
}: {
  streak: StreakInfo;
  event: EventCardData | null;
  /** "Today at 8:00 PM" (worked out in the browser, which knows the time zone). */
  when: string;
  checkingIn: boolean;
  onCheckIn: () => void;
  rsvpBusy: boolean;
  onRsvp: () => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-2.5 lg:gap-4">
      <DayStreakCard
        days={streak.days}
        week={streak.week}
        checkedInToday={streak.checkedInToday}
        onCheckIn={onCheckIn}
        busy={checkingIn}
        to="/me"
        className="h-full"
      />
      {event ? (
        <EventCard
          title={event.title}
          when={when || " "}
          image={event.communityCover || null}
          hue={event.communityHue}
          faces={event.faces.map(personFromChip)}
          goingCount={event.rsvpCount}
          going={event.going}
          busy={rsvpBusy}
          onJoin={onRsvp}
          to={`/c/${encodeURIComponent(event.communityId)}/events`}
          className="h-full"
        />
      ) : (
        <NoEventCard />
      )}
    </div>
  );
}

/** When none of your communities has an event coming up. */
function NoEventCard() {
  return (
    <div className="flex h-full flex-col justify-center gap-1 rounded-[14px] border border-border bg-tint-violet p-2.5 shadow-card lg:rounded-card lg:p-3.5">
      <p className="flex items-center gap-1 text-[12px] font-bold text-pink-ink lg:text-[14px]">
        <CalendarDays className="size-[15px]" strokeWidth={2.4} aria-hidden />
        Live Event
      </p>
      <p className="text-[12.5px] leading-4 font-extrabold text-ink lg:text-[17px] lg:leading-tight">No events coming up</p>
      <p className="text-[11.5px] leading-[15px] text-muted lg:text-[14px] lg:leading-snug">
        Events from your communities show up here.
      </p>
      <GradientButton to="/explore" size="xs" className="mt-1 h-7 self-start px-3 text-[12px] lg:h-9 lg:px-4 lg:text-[14px]">
        Find communities
      </GradientButton>
    </div>
  );
}

/** "Featured Creators": four small cards across on phones, five on computers. */
export function CreatorRow({
  creators,
  busy,
  onFollow,
}: {
  creators: CreatorCard[];
  busy: string | null;
  onFollow: (c: CreatorCard) => void;
}) {
  return (
    <CardRow label="Featured creators" perRow={3.85} desktopCols={5} className="lg:gap-4! lg:[&>*:nth-child(n+6)]:hidden">
      {creators.map((c, i) => (
        <MiniCreatorCard key={c.userId} creator={c} index={i} busy={busy === c.userId} onFollow={() => onFollow(c)} />
      ))}
    </CardRow>
  );
}

/**
 * The small "Featured Creators" card from the mockup (four across): avatar on the left; name + tick,
 * headline and a coloured Follow pill on the right. The whole card opens the profile.
 */
function MiniCreatorCard({
  creator: c,
  index,
  busy,
  onFollow,
}: {
  creator: CreatorCard;
  index: number;
  busy: boolean;
  onFollow: () => void;
}) {
  const following = c.following || c.requested;
  const person = { name: c.displayName, hue: c.avatarHue, userId: c.userId, avatarV: c.avatarV };
  return (
    <article className="k-card relative flex items-center gap-1 rounded-tile py-1.5 pr-[5px] pl-1 lg:gap-3 lg:rounded-card lg:p-3">
      <Avatar person={person} size={33} className="lg:hidden" />
      <Avatar person={person} size={52} className="hidden lg:inline-grid" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-0.5 lg:gap-1">
          <Link
            to="/u/$handle"
            params={{ handle: c.handle }}
            className="k-focus truncate text-[9.5px] leading-[12.5px] font-extrabold tracking-[-0.25px] text-ink after:absolute after:inset-0 after:rounded-tile after:content-[''] lg:text-[15px] lg:leading-tight lg:tracking-normal"
            aria-label={`${c.displayName}${c.verified ? ", verified" : ""}${c.headline ? `, ${c.headline}` : ""}`}
          >
            {c.displayName}
          </Link>
          {c.verified && (
            <>
              <VerifiedTick size={9} className="lg:hidden" />
              <VerifiedTick size={14} className="hidden lg:inline-grid" />
            </>
          )}
        </p>
        <p className="truncate text-[8.5px] leading-[11px] text-muted lg:text-[13px] lg:leading-snug">
          {c.headline || `@${c.handle}`}
        </p>
        <JoinButton
          tone={toneAt(index)}
          joined={following}
          busy={busy}
          onClick={onFollow}
          label="Follow"
          joinedLabel={c.requested && !c.following ? "Requested" : "Following"}
          name={c.displayName}
          full
          className="mt-[3px] h-[17px] px-1 text-[9.5px] [&_svg]:hidden lg:mt-2 lg:h-8 lg:text-[13px]"
        />
      </div>
    </article>
  );
}

/** Soft placeholder blocks while the Home cards load (shapes of the real cards, no grey pictures). */
export function HomeSkeleton() {
  const block = "animate-pulse rounded-tile bg-surface-alt";
  return (
    <div className="flex flex-col gap-3.5" role="status" aria-label="Loading">
      <div className={cn(block, "h-[166px] rounded-hero sm:h-[220px] lg:h-[300px]")} />
      <div className="flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={cn(block, "h-8 w-20 rounded-full")} />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 lg:grid-cols-6 lg:gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={cn(block, "h-[170px] lg:h-[260px]", i >= 4 && "hidden lg:block")} />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 lg:grid-cols-6 lg:gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={cn(block, "h-[90px] lg:h-[160px]", i >= 4 && "hidden lg:block")} />
        ))}
      </div>
    </div>
  );
}

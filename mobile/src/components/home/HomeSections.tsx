import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import type { HomeOverview } from "@/api/models";
import type { CommunityCardData } from "@/api/types";
import {
  CommunityCard, DayStreakCard, EventCard, GradientButton, HeroCarousel, JoinButton, PersonAvatar, SectionHeader, VerifiedTick, personFromChip, useColumnWidth,
} from "@/components/k";
import { PressableScale, Txt } from "@/components/ui";
import { heroArt } from "@/lib/brandArt";
import { font, radius, shadow, useTheme } from "@/theme";
import { eventWhen, heroHref } from "./homeData";

/**
 * The Home cards from the mockup (03-home), from the hero down to "Featured Creators". Plain props: the Home
 * screen fetches `api.homeOverview` and passes the actions in.
 */

/** A sideways-scrolling row of cards lined up with the screen edge (16 side padding, 8 gaps). */
export function CardRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingTop: 2, paddingBottom: 8 }}>
      {children}
    </ScrollView>
  );
}

export function HomeHero({ heroes }: { heroes: HomeOverview["heroes"] }) {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <HeroCarousel
        slides={heroes.map((h, i) => ({
          key: h.id,
          image: heroArt[h.art] ?? heroArt[`home-${(i % 4) + 1}`],
          title: h.title,
          text: h.text,
          cta: h.cta,
          hue: 262 + i * 20,
          onPress: () => router.push(heroHref(h.href) as never),
        }))}
      />
    </View>
  );
}

type CommunityRowProps = {
  communities: CommunityCardData[];
  /** "vertical" with faces and Join (Recommended) or "compact" (Trending). */
  variant: "vertical" | "compact";
  busy: string | null;
  onJoin?: (c: CommunityCardData) => void;
};

export function CommunityRow({ communities, variant, busy, onJoin }: CommunityRowProps) {
  return (
    <CardRow>
      {communities.map((c, i) => (
        <CommunityCard
          key={c.id}
          variant={variant}
          name={c.name}
          description={c.tagline || c.description}
          image={c.cover || null}
          hue={c.hue}
          members={c.memberCount}
          faces={c.memberFaces.map(personFromChip)}
          joined={c.joined}
          index={i}
          joining={busy === c.id}
          onPress={() => router.push(`/community/${c.id}`)}
          onJoin={onJoin ? () => onJoin(c) : undefined}
        />
      ))}
    </CardRow>
  );
}

type StreakEventProps = {
  streak: HomeOverview["streak"];
  event: HomeOverview["liveEvent"];
  checkingIn: boolean;
  onCheckIn: () => void;
  rsvpBusy: boolean;
  onRsvp: () => void;
};

/** "Daily Streak" (tap to check in) and "📅 Live Event" (Join Event = RSVP) side by side. */
export function StreakAndEvent({ streak, event, checkingIn, onCheckIn, rsvpBusy, onRsvp }: StreakEventProps) {
  return (
    <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16 }}>
      <DayStreakCard
        days={streak.days}
        week={streak.week}
        checkedInToday={streak.checkedInToday}
        onCheckIn={onCheckIn}
        onPress={() => router.push("/me")}
        busy={checkingIn}
      />
      {event ? (
        <EventCard
          title={event.title}
          when={eventWhen(event.startsAt)}
          image={event.communityCover || null}
          hue={event.communityHue}
          faces={event.faces.map(personFromChip)}
          going={event.rsvpCount}
          joined={event.going}
          busy={rsvpBusy}
          onJoin={onRsvp}
          onPress={() => router.push(`/community/${event.communityId}/events`)}
          style={{ flex: 1.15 }}
        />
      ) : (
        <NoEventCard />
      )}
    </View>
  );
}

/** When none of your communities has an event coming up. */
function NoEventCard() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1.15, borderRadius: radius.tile, padding: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.dark ? theme.tints.violet : "#F7F2FF", gap: 4, justifyContent: "center" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="calendar" size={16} color={theme.pink} />
        <Txt style={{ fontFamily: font.bold, fontSize: 12, lineHeight: 16, color: theme.toneText.pink }}>Live Event</Txt>
      </View>
      <Txt style={{ fontFamily: font.heavy, fontSize: 12.5, lineHeight: 16, color: theme.ink }}>No events coming up</Txt>
      <Txt style={{ fontFamily: font.regular, fontSize: 11.5, lineHeight: 15, color: theme.muted }}>Events from your communities show up here.</Txt>
      <GradientButton label="Find communities" size="sm" onPress={() => router.push("/explore")} style={{ marginTop: 4 }} />
    </View>
  );
}

type CreatorsProps = {
  creators: HomeOverview["featuredCreators"];
  busy: string | null;
  onFollow: (userId: string) => void;
};

export function CreatorRow({ creators, busy, onFollow }: CreatorsProps) {
  const fourUp = useColumnWidth(4);
  return (
    <CardRow>
      {creators.map((c, i) => (
        <MiniCreatorCard key={c.userId} creator={c} index={i} width={fourUp + 8} busy={busy === c.userId} onFollow={() => onFollow(c.userId)} />
      ))}
    </CardRow>
  );
}

/**
 * The small "Featured Creators" card from the mockup (four across): avatar on the left; name + tick, headline and a
 * coloured Follow pill on the right. Smaller than the kit's `CreatorCard`, which is sized for 2½ across.
 */
function MiniCreatorCard({ creator: c, index, width, busy, onFollow }: { creator: HomeOverview["featuredCreators"][number]; index: number; width: number; busy: boolean; onFollow: () => void }) {
  const theme = useTheme();
  const following = c.following || c.requested;
  return (
    <PressableScale
      onPress={() => router.push(`/profile/${c.handle}`)}
      accessibilityLabel={`${c.displayName}${c.verified ? ", verified" : ""}${c.headline ? `, ${c.headline}` : ""}`}
      scaleTo={0.97}
      style={[{ width, flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingLeft: 4, paddingRight: 5, backgroundColor: theme.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: theme.border }, shadow.card]}
    >
      <PersonAvatar person={{ name: c.displayName, hue: c.avatarHue, userId: c.userId, avatarV: c.avatarV }} size={33} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 9.5, lineHeight: 12.5, letterSpacing: -0.25, color: theme.ink, flexShrink: 1 }}>{c.displayName}</Txt>
          {c.verified ? <VerifiedTick size={9} /> : null}
        </View>
        {c.headline ? <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 8.5, lineHeight: 11, color: theme.muted }}>{c.headline}</Txt> : null}
        <JoinButton
          joined={following}
          onPress={onFollow}
          index={index}
          label="Follow"
          joinedLabel="Following"
          check={false}
          size="xs"
          full
          busy={busy}
          accessibilityLabel={following ? `Unfollow ${c.displayName}` : `Follow ${c.displayName}`}
          style={{ marginTop: 3, height: 17, paddingHorizontal: 4 }}
        />
      </View>
    </PressableScale>
  );
}

/** Section title with the mockup's spacing. */
export function HomeSection({ title, emoji, onSeeAll, children }: { title: string; emoji: string; onSeeAll?: () => void; children: ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <SectionHeader emoji={emoji} title={title} onAction={onSeeAll} />
      </View>
      {children}
    </View>
  );
}

/** Soft placeholder blocks while the Home cards load (shapes of the real cards, no grey pictures). */
export function HomeSkeleton() {
  const theme = useTheme();
  const fourUp = useColumnWidth(4);
  const block = (w: number | `${number}%`, h: number, r = 14) => <View style={{ width: w, height: h, borderRadius: r, backgroundColor: theme.surfaceAlt }} />;
  return (
    <View style={{ gap: 14 }} accessibilityRole="progressbar" accessibilityLabel="Loading">
      <View style={{ paddingHorizontal: 16 }}>{block("100%", 166, 20)}</View>
      <View style={{ paddingHorizontal: 16, flexDirection: "row", gap: 8 }}>
        {[0, 1, 2, 3].map((i) => <View key={i}>{block(fourUp, 160)}</View>)}
      </View>
      <View style={{ paddingHorizontal: 16, flexDirection: "row", gap: 8 }}>
        {[0, 1, 2, 3].map((i) => <View key={i}>{block(fourUp, 84)}</View>)}
      </View>
    </View>
  );
}

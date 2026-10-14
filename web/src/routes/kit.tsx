import { Navigate, createFileRoute } from "@tanstack/react-router";
import {
  AudioLines,
  Bell,
  CalendarDays,
  FileText,
  Gamepad2,
  Headphones,
  Image as ImageIcon,
  MessageCircleMore,
  Palette,
  Plus,
  TrendingUp,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Avatar,
  AvatarStack,
  BadgeHex,
  CardRow,
  CategoryChips,
  CommentBar,
  CommentRow,
  CommunityCard,
  CountPill,
  CreatorCard,
  DayStreakCard,
  EXPLORE_CATEGORIES,
  EmptyHint,
  EventCard,
  FilterPills,
  GradientButton,
  HOME_CATEGORIES,
  HashtagChips,
  HeroCarousel,
  INTEREST_CATEGORIES,
  ImageCarousel,
  InterestTile,
  JoinButton,
  KaminoLogo,
  KaminoMark,
  LiveBadge,
  LiveRoomCard,
  MessageRow,
  NotificationRow,
  OnlineDot,
  OutlineButton,
  Pill,
  ProfileCategoryTile,
  ProgressSegments,
  ScreenTitle,
  SearchField,
  SectionHeader,
  ShowcaseBanner,
  StatCard,
  TabsUnderline,
  UnreadCount,
  VerifiedTick,
  compactNumber,
  type AvatarPerson,
} from "@/components/k";
import { defaultCover, heroArt, interestArt, isInterestKey } from "@/lib/brand-art";

/**
 * Developer gallery of the UI kit with realistic sample data (/kit).
 * Only available while developing; in a production build it sends people home.
 */
export const Route = createFileRoute("/kit")({ component: KitPage });

const people: AvatarPerson[] = [
  { name: "Luna Sketch", hue: 280 },
  { name: "Cloudy Kai", hue: 200 },
  { name: "Mochi Notes", hue: 330 },
  { name: "Zen Tales", hue: 150 },
  { name: "Sora Chan", hue: 30 },
];

const communities = [
  {
    id: "anime-haven",
    name: "Anime Haven",
    tagline: "A home for anime lovers worldwide",
    hue: 280,
    memberCount: 245_000,
    cover: "/kamino/interests/anime.jpg",
  },
  {
    id: "game-lounge",
    name: "Game Lounge",
    tagline: "Play. Talk. Make new friends.",
    hue: 210,
    memberCount: 189_000,
    cover: "/kamino/interests/gaming.jpg",
  },
  {
    id: "creative-space",
    name: "Creative Space",
    tagline: "Art, design and creative vibes ✨",
    hue: 330,
    memberCount: 122_000,
    cover: "/kamino/interests/art.jpg",
  },
  {
    id: "pet-pals",
    name: "Pet Pals",
    tagline: "For animal lovers everywhere 🐾",
    hue: 150,
    memberCount: 98_000,
    cover: "/kamino/interests/pets.jpg",
  },
  {
    id: "music-world",
    name: "Music World",
    tagline: "Share your sound 🎵",
    hue: 20,
    memberCount: 176_000,
    cover: "",
  },
  {
    id: "kpop-zone",
    name: "K-Pop Zone",
    tagline: "Stans, discussions and all things K-Pop",
    hue: 300,
    memberCount: 164_000,
    cover: "/kamino/interests/kpop.jpg",
  },
];

const VIEWS = [
  { key: "gallery", label: "Gallery" },
  { key: "home", label: "Home" },
  { key: "explore", label: "Explore" },
  { key: "chats", label: "Chats" },
  { key: "notifications", label: "Notifications" },
];

function KitPage() {
  // The view comes from the address (#home, #explore …) so screenshots can open one directly.
  const [view, setView] = useState("gallery");
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace("#", "");
      setView(VIEWS.some((v) => v.key === h) ? h : "gallery");
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  if (!import.meta.env.DEV) return <Navigate to="/" />;
  const pick = (key: string) => {
    window.location.hash = key;
  };
  return (
    <AppShell>
      {view === "home" ? (
        <HomeReplica />
      ) : view === "explore" ? (
        <ExploreReplica />
      ) : view === "chats" ? (
        <ChatsReplica />
      ) : view === "notifications" ? (
        <NotificationsReplica />
      ) : (
        <KitGallery />
      )}
      {/* View switcher at the bottom so the replicas line up with the mockups at the top. */}
      <div className="mt-8 px-4">
        <FilterPills items={VIEWS} value={view} onChange={pick} label="Kit view" />
      </div>
    </AppShell>
  );
}

/* ── Mockup replicas: the kit laid out like the mockups, with the mockups' sample data ── */

const recommended = [
  {
    id: "anime-haven",
    name: "Anime Haven",
    tagline: "A home for anime lovers worldwide",
    hue: 280,
    memberCount: 245_000,
    cover: "/kamino/interests/anime.jpg",
  },
  {
    id: "game-lounge",
    name: "Game Lounge",
    tagline: "Play. Talk. Make new friends.",
    hue: 210,
    memberCount: 189_000,
    cover: "/kamino/interests/gaming.jpg",
  },
  {
    id: "creative-space",
    name: "Creative Space",
    tagline: "Art, design and creative vibes ✨",
    hue: 330,
    memberCount: 122_000,
    cover: "/kamino/interests/art.jpg",
  },
  {
    id: "pet-pals",
    name: "Pet Pals",
    tagline: "For animal lovers everywhere 🐾",
    hue: 150,
    memberCount: 98_000,
    cover: "/kamino/interests/pets.jpg",
  },
  {
    id: "music-world",
    name: "Music World",
    tagline: "Share your sound, find your people",
    hue: 20,
    memberCount: 87_000,
    cover: "/kamino/interests/music.jpg",
  },
  {
    id: "kpop-zone",
    name: "K-Pop Zone",
    tagline: "Stans, discussions and all things K-Pop",
    hue: 300,
    memberCount: 76_000,
    cover: "/kamino/interests/kpop.jpg",
  },
  {
    id: "fantasy-realm",
    name: "Fantasy Realm",
    tagline: "Fantasy, lore and everything magical",
    hue: 250,
    memberCount: 64_000,
    cover: "/kamino/interests/books.jpg",
  },
  {
    id: "chill-corner",
    name: "Chill Corner",
    tagline: "Make friends, chat and unwind",
    hue: 190,
    memberCount: 53_000,
    cover: "/kamino/interests/travel.jpg",
  },
];
const trending = [
  {
    id: "music-world",
    name: "Music World",
    tagline: "Share your sound 🎵",
    hue: 20,
    memberCount: 176_000,
    cover: "/kamino/interests/music.jpg",
  },
  {
    id: "kpop-zone",
    name: "K-Pop Zone",
    tagline: "Stans, discussions 💜",
    hue: 300,
    memberCount: 164_000,
    cover: "/kamino/interests/kpop.jpg",
  },
  {
    id: "manga",
    name: "Manga & Comics",
    tagline: "Stories, fanart, theories",
    hue: 340,
    memberCount: 132_000,
    cover: "/kamino/interests/manga.jpg",
  },
  {
    id: "cozy",
    name: "Cozy Corner",
    tagline: "Chill chat & hangout",
    hue: 30,
    memberCount: 118_000,
    cover: "/kamino/interests/food.jpg",
  },
];
const creators = [
  { handle: "lunasketch", name: "LunaSketch", headline: "Digital Artist", hue: 280 },
  { handle: "cloudykai", name: "CloudyKai", headline: "Gaming Creator", hue: 200 },
  { handle: "mochinotes", name: "MochiNotes", headline: "Lifestyle & Vlogs", hue: 330 },
  { handle: "zentales", name: "ZenTales", headline: "Story Writer", hue: 150 },
];

function HomeReplica() {
  const [chip, setChip] = useState("forYou");
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  const [week, setWeek] = useState([true, true, true, true, true, true, false]);
  return (
    <div className="space-y-3 px-4 pt-1">
      <HeroCarousel
        slides={[
          {
            id: "1",
            title: "Good People Brighter Days ♡",
            text: "Join communities, share your passions, and find your people.",
            cta: "Start Exploring",
            to: "/explore",
            image: heroArt["home-1"],
          },
          {
            id: "2",
            title: "Live the story together",
            text: "Role-play, chat and create with friends.",
            cta: "Find a story",
            to: "/explore",
            image: heroArt["home-2"],
          },
          {
            id: "3",
            title: "Earn badges as you go",
            text: "Every kind post and check-in counts.",
            cta: "See badges",
            to: "/me",
            image: heroArt["home-3"],
          },
          {
            id: "4",
            title: "Start your own space",
            text: "A home for your fandom, your rules.",
            cta: "Create",
            to: "/new",
            image: heroArt["home-4"],
          },
        ]}
      />
      <CategoryChips items={HOME_CATEGORIES} value={chip} onChange={setChip} />
      <section className="space-y-1.5">
        <SectionHeader icon="✨" title="Recommended for You" seeAllTo="/explore" />
        <CardRow label="Recommended communities">
          {recommended.slice(0, 6).map((c, i) => (
            <CommunityCard
              key={c.id}
              community={c}
              index={i}
              faces={people.slice(0, 4)}
              joined={!!joined[c.id]}
              onJoin={() => setJoined((j) => ({ ...j, [c.id]: !j[c.id] }))}
            />
          ))}
        </CardRow>
      </section>
      <section className="space-y-1.5">
        <SectionHeader icon="🔥" title="Trending Communities" seeAllTo="/explore" />
        <CardRow label="Trending communities">
          {trending.map((c, i) => (
            <CommunityCard key={c.id} community={c} variant="compact" index={i} />
          ))}
        </CardRow>
      </section>
      <section className="grid grid-cols-2 gap-2 lg:gap-3">
        <DayStreakCard
          days={7}
          week={week}
          checkedInToday={week[6]!}
          onCheckIn={() => setWeek((w) => w.map(() => true))}
        />
        <EventCard
          title="Community Talent Show"
          when="Today at 8:00 PM"
          image="/kamino/interests/music.jpg"
          faces={people}
          goingCount={1300}
          onJoin={() => undefined}
        />
      </section>
      <section className="space-y-1.5">
        <SectionHeader icon="⭐" title="Featured Creators" seeAllTo="/explore" />
        <CardRow label="Featured creators" perRow={2.6} desktopCols={4}>
          {creators.map((c, i) => (
            <CreatorCard
              key={c.handle}
              index={i}
              creator={{ ...c, verified: true }}
              onFollow={() => undefined}
            />
          ))}
        </CardRow>
      </section>
    </div>
  );
}

function ExploreReplica() {
  const [chip, setChip] = useState("forYou");
  const [q, setQ] = useState("");
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  return (
    <div className="space-y-3 px-4 pt-1">
      <ScreenTitle
        title="Explore"
        subtitle="Discover communities, meet amazing people, and find your next favorite space."
      />
      <SearchField value={q} onChange={setQ} onFilter={() => undefined} />
      <CategoryChips items={EXPLORE_CATEGORIES} value={chip} onChange={setChip} showArrow />
      <HeroCarousel
        heightClassName="h-[150px] sm:h-[200px] lg:h-[260px]"
        slides={[
          {
            id: "e1",
            title: "Discover Your People",
            text: "Explore communities around your passions and interests.",
            cta: "Browse All",
            to: "/explore",
            image: heroArt["explore-1"],
          },
          {
            id: "e2",
            title: "New this week",
            text: "Fresh spaces looking for their first members.",
            cta: "Take a look",
            to: "/explore",
            image: heroArt["explore-2"],
          },
          {
            id: "e3",
            title: "Growing fast",
            text: "Join the conversation while it is buzzing.",
            cta: "See them",
            to: "/explore",
            image: heroArt["explore-3"],
          },
        ]}
      />
      <section className="space-y-1.5">
        <SectionHeader icon="⭐" title="Recommended Communities" seeAllTo="/explore" seeAllIcon="chevron" />
        <div className="grid grid-cols-4 gap-2 lg:grid-cols-6 lg:gap-3">
          {recommended.map((c, i) => (
            <CommunityCard
              key={c.id}
              community={c}
              variant="grid"
              index={i}
              faces={people.slice(0, 4)}
              joined={!!joined[c.id]}
              onJoin={() => setJoined((j) => ({ ...j, [c.id]: !j[c.id] }))}
            />
          ))}
        </div>
      </section>
      <section className="space-y-1.5">
        <SectionHeader
          icon={<TrendingUp className="text-pink" strokeWidth={2.6} />}
          title="Trending Tags"
          seeAllTo="/explore"
        />
        <HashtagChips
          tags={["Anime", "Gaming", "KPop", "Art", "Music", "Pets", "Manga", "Movies"]}
          onTagClick={() => undefined}
        />
      </section>
    </div>
  );
}

function ChatsReplica() {
  const [f, setF] = useState("all");
  return (
    <div className="space-y-3 px-4 pt-1">
      <FilterPills
        value={f}
        onChange={setF}
        items={[
          { key: "all", label: "All Chats", icon: <MessageCircleMore /> },
          { key: "dm", label: "Direct Messages", icon: <Users /> },
          { key: "groups", label: "Groups", icon: <Users /> },
          { key: "live", label: "Live Rooms", icon: <AudioLines /> },
        ]}
      />
      <section className="space-y-1.5">
        <SectionHeader
          icon={<AudioLines className="text-violet" strokeWidth={2.6} />}
          title="Live Rooms Now"
          seeAllTo="/chats"
        />
        <CardRow label="Live rooms" desktopCols={4}>
          {[
            {
              title: "Late Night Vibes",
              subtitle: "Chill music & requests",
              topic: "Music",
              liveCount: 1200,
              extra: 45,
              icon: <Headphones />,
              cover: "/kamino/interests/music.jpg",
            },
            {
              title: "Anime Talk",
              subtitle: "Games • Anime • Chill",
              topic: "Gaming",
              liveCount: 856,
              extra: 32,
              icon: <Gamepad2 />,
              cover: "/kamino/interests/anime.jpg",
            },
            {
              title: "Art & Creativity",
              subtitle: "Draw • Chat • Learn",
              topic: "Art",
              liveCount: 643,
              extra: 28,
              icon: <Palette />,
              cover: "/kamino/interests/art.jpg",
            },
            {
              title: "Game Night Hangout",
              subtitle: "Friends • Chats • Vibes",
              topic: "Just Chatting",
              liveCount: 421,
              extra: 19,
              icon: <Users />,
              cover: "/kamino/interests/gaming.jpg",
            },
          ].map((r, i) => (
            <LiveRoomCard
              key={r.title}
              index={i}
              room={{ ...r, hue: 40 + i * 70 }}
              faces={people.slice(0, 4)}
              extra={r.extra}
              joinIcon={r.icon}
              onJoin={() => undefined}
            />
          ))}
        </CardRow>
      </section>
      <section>
        <SectionHeader
          icon={<MessageCircleMore className="text-violet" strokeWidth={2.6} />}
          title="Messages"
          action={
            <button
              type="button"
              className="k-focus inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-violet"
            >
              New Message
              <span className="grid size-7 place-items-center rounded-full bg-violet-strong text-white">
                <Plus className="size-4" strokeWidth={2.8} aria-hidden />
              </span>
            </button>
          }
        />
        <MessageRow
          to="/chats"
          person={{ name: "Mika", hue: 300 }}
          name="Mika"
          online
          preview="Hey! Are you joining the live room later? ✨"
          time="2m"
          unread={3}
        />
        <MessageRow
          to="/chats"
          person={{ name: "Game Squad", hue: 210 }}
          name="Game Squad"
          online={false}
          preview={
            <>
              <b className="font-bold text-ink">Alex:</b> That was an insane match! 🎮
            </>
          }
          time="12m"
          unread={12}
        />
        <MessageRow
          to="/chats"
          person={{ name: "Art Friends", hue: 30 }}
          name="Art Friends"
          online={false}
          preview={
            <>
              <b className="font-bold text-ink">You:</b> Here’s my latest sketch! ✨
            </>
          }
          time="1h"
          unread={2}
        />
        <MessageRow
          to="/chats"
          person={{ name: "LunaSketch", hue: 280 }}
          name="LunaSketch"
          online
          verified
          preview={
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="size-3.5" aria-hidden /> Sent a photo
            </span>
          }
          time="3h"
        />
        <MessageRow
          to="/chats"
          person={{ name: "CloudyKai", hue: 200 }}
          name="CloudyKai"
          online
          preview="Wanna hop in the voice room? 🎧"
          time="5h"
        />
      </section>
    </div>
  );
}

function NotificationsReplica() {
  const [f, setF] = useState("all");
  return (
    <div className="space-y-2 px-4 pt-1">
      <ScreenTitle
        title="Notifications"
        subtitle="Stay up to date with your activity, messages, and community happenings."
      />
      <FilterPills
        tinted
        fill
        size="lg"
        value={f}
        onChange={setF}
        items={[
          { key: "all", label: "All", icon: <Bell />, tone: "violet" },
          { key: "social", label: "Social", icon: <Users />, tone: "pink" },
          { key: "community", label: "Community", icon: <Users />, tone: "blue" },
          { key: "events", label: "Events", icon: <CalendarDays />, tone: "orange" },
        ]}
      />
      <SectionHeader
        title="Today"
        action={
          <button type="button" className="k-focus min-h-11 text-[13px] font-bold text-violet">
            Mark All as Read
          </button>
        }
      />
      <NotificationRow
        kind="like"
        actor={{ name: "Mika", hue: 300 }}
        title={
          <>
            <b>Mika</b>
            <br />
            liked your drawing
          </>
        }
        time="2m ago"
        thumb="/kamino/interests/art.jpg"
        unread
        to="/notifications"
      />
      <NotificationRow
        kind="comment"
        actor={{ name: "CloudyKai", hue: 200 }}
        title={
          <>
            <b>CloudyKai</b>
            <br />
            replied to your post
          </>
        }
        snippet="“This looks amazing! 😍 Totally love the colors!”"
        time="12m ago"
        thumb="/kamino/interests/anime.jpg"
        unread
        to="/notifications"
      />
      <NotificationRow
        kind="follow"
        actor={{ name: "LunaSketch", hue: 280 }}
        title={
          <>
            <b>LunaSketch</b> started following you
          </>
        }
        snippet="Digital Artist · 24.5K followers"
        time="25m ago"
        unread
        action={
          <GradientButton size="xs" className="h-7 px-3">
            Follow Back
          </GradientButton>
        }
      />
      <NotificationRow
        kind="mention"
        actor={{ name: "Sora", hue: 30 }}
        title={
          <>
            <b>Sora</b> mentioned you in a comment
          </>
        }
        snippet={
          <>
            <span className="font-semibold text-blue-ink">@you</span> You should join us! This event
            is perfect for you! 💜
          </>
        }
        time="1h ago"
        thumb="/kamino/interests/music.jpg"
        unread
      />
      <SectionHeader title="Yesterday" />
      <NotificationRow
        kind="community"
        actor={{ name: "Pet Pals", hue: 150 }}
        title={
          <>
            <b>Pet Pals</b> invited you to join
          </>
        }
        extra={<AvatarStack people={people.slice(0, 4)} extra="98K members" />}
        time="15h ago"
        action={<JoinButton tone="green" />}
        unread
      />
      <NotificationRow
        kind="event"
        title={<b>Reminder: Community Talent Show</b>}
        snippet="Starts today at 8:00 PM"
        time="20h ago"
        thumb="/kamino/interests/music.jpg"
      />
      <SectionHeader title="Earlier" />
      <NotificationRow
        kind="live"
        actor={{ name: "ZenTales", hue: 150 }}
        title={
          <>
            <b>ZenTales</b> is live in{" "}
            <span className="font-bold text-violet">Late Night Vibes</span>
          </>
        }
        snippet="Music · Chill Chat · 1.2K watching"
        time="1d ago"
        thumb="/kamino/interests/music.jpg"
        chevron
        to="/chats"
      />
    </div>
  );
}

function KitGallery() {
  const [chip, setChip] = useState("forYou");
  const [filter, setFilter] = useState("all");
  const [chatFilter, setChatFilter] = useState("all");
  const [tab, setTab] = useState("posts");
  const [joined, setJoined] = useState<Record<string, boolean>>({ "pet-pals": true });
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<string[]>([
    "anime",
    "gaming",
    "music",
    "kpop",
    "food",
    "pets",
  ]);
  const [search, setSearch] = useState("");
  const [comment, setComment] = useState("");
  const [liked, setLiked] = useState(false);
  const [week, setWeek] = useState([true, true, true, true, true, true, false]);
  const toggleJoin = (id: string) => setJoined((j) => ({ ...j, [id]: !j[id] }));

  return (
    <>
      <div className="space-y-8 px-4 pt-2">
        <ScreenTitle
          title="UI kit"
          subtitle="Every piece of the Kamino redesign with sample data. Resize the window to see phone and computer layouts."
        />

        <Section name="Brand">
          <div className="flex flex-wrap items-center gap-6">
            <KaminoLogo />
            <KaminoMark size={64} title="Kamino" />
            <KaminoMark size={24} />
          </div>
        </Section>

        <Section name="Buttons and pills">
          <div className="flex flex-wrap items-center gap-3">
            <GradientButton arrow>Start Exploring</GradientButton>
            <GradientButton gradient="hero" size="lg" arrow>
              Get Started
            </GradientButton>
            <GradientButton gradient="publish" icon={<span aria-hidden>➤</span>}>
              Publish Post
            </GradientButton>
            <GradientButton size="sm">Follow Back</GradientButton>
            <OutlineButton>Save</OutlineButton>
            {(["violet", "blue", "pink", "green", "orange"] as const).map((t, i) => (
              <JoinButton key={t} tone={t} joined={i === 4} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Pill tone="violet" solid icon={<span aria-hidden>⭐</span>}>
              Creator
            </Pill>
            <Pill tone="violet">Discussion</Pill>
            <Pill tone="pink">She/Her</Pill>
            <Pill tone="neutral">Digital Artist</Pill>
            <LiveBadge />
            <span className="rounded-xl bg-[#1b1640] p-2">
              <CountPill count={1234} kind="watching" />
            </span>
            <span className="rounded-xl bg-[#1b1640] p-2">
              <CountPill count={245_000} />
            </span>
            <VerifiedTick />
            <OnlineDot />
            <UnreadCount count={3} />
            <UnreadCount count={12} />
          </div>
        </Section>

        <Section name="Avatars">
          <div className="flex flex-wrap items-center gap-5">
            <Avatar person={people[0]!} size={44} online />
            <Avatar person={people[1]!} size={56} online={false} />
            <Avatar person={{ ...people[2]!, src: "/kamino/interests/art.jpg" }} size={64} />
            <AvatarStack people={people} />
            <AvatarStack people={people} size={26} extra={45} />
            <AvatarStack people={people.slice(0, 3)} extra="1.3K going" />
          </div>
        </Section>

        <Section name="Hero carousel">
          <HeroCarousel
            slides={[
              {
                id: "1",
                title: "Good People Brighter Days ♡",
                text: "Join communities, share your passions, and find your people.",
                cta: "Start Exploring",
                to: "/explore",
                image: heroArt["home-1"],
              },
              {
                id: "2",
                title: "Live the story together",
                text: "Role-play, chat and create with friends.",
                cta: "Find a story",
                to: "/explore",
                image: heroArt["home-2"],
              },
              {
                id: "3",
                title: "Earn badges as you go",
                text: "Every kind post and check-in counts.",
                cta: "See badges",
                to: "/me",
                image: heroArt["home-3"],
              },
              {
                id: "4",
                title: "Start your own space",
                text: "A home for your fandom, your rules.",
                cta: "Create",
                to: "/new",
                hue: 300,
              },
            ]}
          />
        </Section>

        <Section name="Category chips">
          <CategoryChips items={HOME_CATEGORIES} value={chip} onChange={setChip} />
          <CategoryChips
            items={HOME_CATEGORIES.slice(0, 6)}
            value={chip}
            onChange={setChip}
            showArrow
            className="mt-3"
          />
        </Section>

        <Section name="Search">
          <SearchField value={search} onChange={setSearch} onFilter={() => undefined} />
        </Section>

        <section className="space-y-3">
          <SectionHeader icon="✨" title="Recommended for You" seeAllTo="/explore" />
          <CardRow label="Recommended communities">
            {communities.map((c, i) => (
              <CommunityCard
                key={c.id}
                community={c}
                index={i}
                faces={people.slice(0, 4)}
                joined={!!joined[c.id]}
                onJoin={() => toggleJoin(c.id)}
              />
            ))}
          </CardRow>
        </section>

        <section className="space-y-3">
          <SectionHeader icon="🔥" title="Trending Communities" seeAllTo="/explore" />
          <CardRow label="Trending communities">
            {communities.map((c, i) => (
              <CommunityCard
                key={c.id}
                community={{ ...c, cover: c.cover || defaultCover(i) }}
                variant="compact"
                index={i}
              />
            ))}
          </CardRow>
        </section>

        <section className="space-y-3">
          <SectionHeader icon="⭐" title="Recommended Communities (grid)" seeAllTo="/explore" />
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-6 lg:gap-3">
            {communities.map((c, i) => (
              <CommunityCard
                key={c.id}
                community={c}
                variant="grid"
                index={i}
                faces={people.slice(0, 4)}
                joined={!!joined[c.id]}
                onJoin={() => toggleJoin(c.id)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader icon="👥" title="Communities (mini)" seeAllTo="/explore" />
          <CardRow label="Profile communities" desktopCols={4}>
            {communities.slice(0, 4).map((c, i) => (
              <CommunityCard
                key={c.id}
                community={c}
                variant="mini"
                index={i}
                joined
                onJoin={() => undefined}
              />
            ))}
          </CardRow>
        </section>

        <section className="grid grid-cols-2 gap-2 lg:gap-3">
          <DayStreakCard
            days={week.filter(Boolean).length}
            week={week}
            checkedInToday={week[6]!}
            onCheckIn={() => setWeek((w) => w.map((d, i) => (i === 6 ? true : d)))}
          />
          <EventCard
            title="Community Talent Show"
            when="Today at 8:00 PM"
            image="/kamino/interests/music.jpg"
            faces={people}
            goingCount={1300}
            onJoin={() => undefined}
          />
        </section>

        <section className="space-y-3">
          <SectionHeader icon="⭐" title="Featured Creators" seeAllTo="/explore" />
          <CardRow label="Featured creators" perRow={2.6} desktopCols={4}>
            {[
              { handle: "lunasketch", headline: "Digital Artist" },
              { handle: "cloudykai", headline: "Gaming Creator" },
              { handle: "mochinotes", headline: "Lifestyle & Vlogs" },
              { handle: "zentales", headline: "Story Writer" },
            ].map((c, i) => (
              <CreatorCard
                key={c.handle}
                index={i}
                creator={{ ...people[i]!, handle: c.handle, headline: c.headline, verified: true }}
                following={!!following[c.handle]}
                onFollow={() => setFollowing((f) => ({ ...f, [c.handle]: !f[c.handle] }))}
              />
            ))}
          </CardRow>
        </section>

        <section className="space-y-3">
          <SectionHeader
            icon={<AudioLines className="size-6 text-violet" strokeWidth={2.4} />}
            title="Live Rooms Now"
            seeAllTo="/chats"
          />
          <CardRow label="Live rooms" desktopCols={4}>
            {[
              {
                title: "Late Night Vibes",
                subtitle: "Chill music & requests",
                topic: "Music",
                liveCount: 1200,
                extra: 45,
                icon: <Headphones className="size-[18px]" strokeWidth={2.4} />,
                cover: "/kamino/interests/music.jpg",
              },
              {
                title: "Anime Talk",
                subtitle: "Games • Anime • Chill",
                topic: "Gaming",
                liveCount: 856,
                extra: 32,
                icon: <Gamepad2 className="size-[18px]" strokeWidth={2.4} />,
                cover: "/kamino/interests/anime.jpg",
              },
              {
                title: "Art & Creativity",
                subtitle: "Draw • Chat • Learn",
                topic: "Art",
                liveCount: 643,
                extra: 28,
                icon: <Palette className="size-[18px]" strokeWidth={2.4} />,
                cover: "",
              },
              {
                title: "Game Night Hangout",
                subtitle: "Friends • Chats • Vibes",
                topic: "Just Chatting",
                liveCount: 421,
                extra: 19,
                icon: <Users className="size-[18px]" strokeWidth={2.4} />,
                cover: "/kamino/interests/gaming.jpg",
              },
            ].map((r, i) => (
              <LiveRoomCard
                key={r.title}
                index={i}
                room={{ ...r, hue: 40 + i * 70 }}
                faces={people.slice(0, 4)}
                extra={r.extra}
                joinIcon={r.icon}
                onJoin={() => undefined}
              />
            ))}
          </CardRow>
        </section>

        <Section name="Filters and tabs">
          <FilterPills
            tinted
            size="lg"
            value={filter}
            onChange={setFilter}
            items={[
              {
                key: "all",
                label: "All",
                icon: <Bell className="size-5" strokeWidth={2.4} />,
                tone: "violet",
              },
              {
                key: "social",
                label: "Social",
                icon: <Users className="size-5" strokeWidth={2.4} />,
                tone: "pink",
              },
              {
                key: "community",
                label: "Community",
                icon: <Users className="size-5" strokeWidth={2.4} />,
                tone: "blue",
              },
              {
                key: "events",
                label: "Events",
                icon: <CalendarDays className="size-5" strokeWidth={2.4} />,
                tone: "orange",
              },
            ]}
          />
          <FilterPills
            className="mt-3"
            value={chatFilter}
            onChange={setChatFilter}
            items={[
              {
                key: "all",
                label: "All Chats",
                icon: <MessageCircleMore className="size-5" strokeWidth={2.4} />,
              },
              {
                key: "dm",
                label: "Direct Messages",
                icon: <Users className="size-5" strokeWidth={2.4} />,
              },
              {
                key: "groups",
                label: "Groups",
                icon: <Users className="size-5" strokeWidth={2.4} />,
              },
              {
                key: "live",
                label: "Live Rooms",
                icon: <AudioLines className="size-5" strokeWidth={2.4} />,
              },
            ]}
          />
          <TabsUnderline
            className="mt-4"
            value={tab}
            onChange={setTab}
            tabs={[
              {
                key: "posts",
                label: "Posts",
                icon: <FileText className="size-6" strokeWidth={2} />,
              },
              {
                key: "rooms",
                label: "Rooms",
                icon: <AudioLines className="size-6" strokeWidth={2} />,
              },
              {
                key: "events",
                label: "Events",
                icon: <CalendarDays className="size-6" strokeWidth={2} />,
              },
              {
                key: "media",
                label: "Media",
                icon: <ImageIcon className="size-6" strokeWidth={2} />,
              },
            ]}
          />
          <ProgressSegments total={5} current={2} className="mt-5" />
        </Section>

        <Section name="Stat cards">
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              tone="violet"
              icon={
                <span className="grid size-8 place-items-center rounded-full bg-violet-strong text-white">
                  <Users className="size-[18px]" strokeWidth={2.4} aria-hidden />
                </span>
              }
              value={compactNumber(245_000)}
              label="Members"
            >
              <AvatarStack people={people.slice(0, 4)} size={20} />
            </StatCard>
            <StatCard
              tone="pink"
              toTone="blue"
              icon={<OnlineDot size={14} className="mt-2.5" />}
              value="12.4K"
              label="Online Now"
              chevron
              onClick={() => undefined}
            >
              <AvatarStack people={people} size={24} max={5} />
            </StatCard>
            <StatCard
              tone="orange"
              icon={<span className="text-[26px] leading-none">👑</span>}
              value="Top 1%"
              label="Anime Community"
              valueClassName="text-orange-ink"
            />
          </div>
        </Section>

        <Section name="Profile pieces">
          <div className="grid grid-cols-6 gap-1.5 lg:gap-3">
            {[
              ["🎨", "My Art", "pink"],
              ["📷", "Daily Life", "violet"],
              ["🎮", "Gaming", "blue"],
              ["🌱", "Growth", "green"],
              ["❤️", "Q&A", "pink"],
              ["⭐", "Milestones", "orange"],
            ].map(([e, l, t]) => (
              <ProfileCategoryTile
                key={l}
                emoji={e!}
                label={l!}
                tone={t as "pink"}
                onClick={() => undefined}
              />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-[1.2fr_1fr] gap-2 lg:gap-3">
            <ShowcaseBanner
              variant="achievement"
              icon="🏆"
              title="Top Creator"
              text="Featured Creator for inspiring & positive content"
              onClick={() => undefined}
            />
            <ShowcaseBanner
              variant="streak"
              icon="🔥"
              title="72 Day Streak"
              text="Creating, sharing, and lifting others up!"
              onClick={() => undefined}
            />
          </div>
          <div className="k-card k-row mt-3 gap-1 p-3">
            <BadgeHex tone="orange" icon="👑" label="Community Star" />
            <BadgeHex tone="violet" icon="🖌️" label="Art Creator" />
            <BadgeHex tone="pink" icon="💗" label="Kindness Leader" />
            <BadgeHex tone="green" icon="🍃" label="Positive Vibes" />
            <BadgeHex tone="blue" icon="👥" label="Trusted Member" />
            <BadgeHex tone="violet" icon="🔒" label="Locked" locked />
          </div>
        </Section>

        <Section name="Interest tiles">
          <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
            {INTEREST_CATEGORIES.slice(0, 8).map((c) => (
              <InterestTile
                key={c.key}
                label={c.label}
                emoji={c.emoji}
                image={isInterestKey(c.key) ? interestArt[c.key] : undefined}
                selected={picked.includes(c.key)}
                onToggle={() =>
                  setPicked((p) =>
                    p.includes(c.key) ? p.filter((k) => k !== c.key) : [...p, c.key],
                  )
                }
              />
            ))}
          </div>
        </Section>

        <section className="space-y-1">
          <SectionHeader
            icon={<MessageCircleMore className="size-6 text-violet" strokeWidth={2.4} />}
            title="Messages"
            action={
              <button
                type="button"
                className="k-focus inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-violet"
              >
                New Message
                <span className="grid size-7 place-items-center rounded-full bg-violet-strong text-white">
                  <Plus className="size-4" strokeWidth={2.8} aria-hidden />
                </span>
              </button>
            }
          />
          <div>
            <MessageRow
              to="/chats"
              person={people[0]!}
              name="Mika"
              online
              preview="Hey! Are you joining the live room later? ✨"
              time="2m"
              unread={3}
            />
            <MessageRow
              to="/chats"
              person={people[1]!}
              name="Game Squad"
              online={false}
              preview={
                <>
                  <b className="font-bold text-ink">Alex:</b> That was an insane match! 🎮
                </>
              }
              time="12m"
              unread={12}
            />
            <MessageRow
              to="/chats"
              person={people[2]!}
              name="LunaSketch"
              online
              verified
              preview={
                <span className="inline-flex items-center gap-1.5">
                  <ImageIcon className="size-4" aria-hidden /> Sent a photo
                </span>
              }
              time="3h"
            />
          </div>
        </section>

        <section className="space-y-2">
          <SectionHeader
            title="Today"
            action={
              <button type="button" className="k-focus min-h-11 text-[15px] font-bold text-violet">
                Mark All as Read
              </button>
            }
          />
          <NotificationRow
            kind="like"
            actor={people[0]}
            title={
              <>
                <b>Mika</b>
                <br />
                liked your drawing
              </>
            }
            time="2m ago"
            thumb="/kamino/interests/art.jpg"
            unread
            to="/notifications"
          />
          <NotificationRow
            kind="comment"
            actor={people[1]}
            title={
              <>
                <b>CloudyKai</b>
                <br />
                replied to your post
              </>
            }
            snippet="“This looks amazing! 😍 Totally love the colors!”"
            time="12m ago"
            thumb="/kamino/interests/anime.jpg"
            unread
            to="/notifications"
          />
          <NotificationRow
            kind="follow"
            actor={people[2]}
            title={
              <>
                <b>LunaSketch</b> started following you
              </>
            }
            snippet="Digital Artist · 24.5K followers"
            time="25m ago"
            unread
            action={<GradientButton size="sm">Follow Back</GradientButton>}
          />
          <NotificationRow
            kind="mention"
            actor={people[3]}
            title={
              <>
                <b>Sora</b> mentioned you in a comment
              </>
            }
            snippet={
              <>
                <span className="font-semibold text-blue-ink">@you</span> You should join us! This
                event is perfect for you! 💜
              </>
            }
            time="1h ago"
            unread
          />
          <NotificationRow
            kind="community"
            actor={people[4]}
            title={
              <>
                <b>Pet Pals</b> invited you to join
              </>
            }
            extra={<AvatarStack people={people.slice(0, 4)} extra="98K members" />}
            time="15h ago"
            action={<JoinButton tone="green" />}
            unread
          />
          <NotificationRow
            kind="event"
            title={<b>Reminder: Community Talent Show</b>}
            snippet="Starts today at 8:00 PM"
            time="20h ago"
            thumb="/kamino/interests/music.jpg"
          />
          <NotificationRow
            kind="live"
            actor={people[3]}
            title={
              <>
                <b>ZenTales</b> is live in{" "}
                <span className="font-bold text-violet">Late Night Vibes</span>
              </>
            }
            snippet="Music · Chill Chat · 1.2K watching"
            time="1d ago"
            chevron
            to="/chats"
          />
        </section>

        <Section name="Post pieces">
          <ImageCarousel
            images={[
              "/kamino/interests/art.jpg",
              "/kamino/interests/anime.jpg",
              "/kamino/interests/travel.jpg",
              "/kamino/interests/photography.jpg",
              "/kamino/interests/music.jpg",
            ].map((src) => ({ src }))}
          />
          <HashtagChips
            className="mt-3"
            tags={["Anime", "Art", "Sunset", "Illustration", "Original"]}
          />
          <div className="mt-3 divide-y divide-border">
            <CommentRow
              author={people[0]!}
              name="Mika"
              time="3h ago"
              text="This is absolutely stunning!! 💜💜 The colors are so dreamy."
              likes={124}
              liked={liked}
              onLike={() => setLiked((l) => !l)}
              onMore={() => undefined}
            />
            <CommentRow
              author={people[1]!}
              name="CloudyKai"
              time="2h ago"
              text="The atmosphere in this is unreal 📊 It makes me feel so calm."
              likes={86}
              onLike={() => undefined}
              onMore={() => undefined}
            />
          </div>
          <CommentBar
            className="mt-3"
            me={people[4]}
            value={comment}
            onChange={setComment}
            onSubmit={() => setComment("")}
            onPickImage={() => undefined}
            onEmoji={() => undefined}
          />
        </Section>

        <Section name="Empty state">
          <EmptyHint
            icon="🌱"
            title="No posts yet"
            text="Be the first to share something kind here."
            action={<GradientButton size="sm">Create a post</GradientButton>}
          />
        </Section>
      </div>
    </>
  );
}

function Section({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <SectionHeader title={name} />
      <div>{children}</div>
    </section>
  );
}

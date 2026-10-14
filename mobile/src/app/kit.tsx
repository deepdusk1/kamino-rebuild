/**
 * DEV ONLY: a gallery of every component in the Kamino kit (`@/components/k`) with realistic sample data, used for
 * visual checks against the mockups (open `/kit` in the web build). It is not linked from anywhere in the app and
 * fetches nothing. Safe to delete before release.
 */
import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import {
  AppHeader,
  AvatarStack,
  BadgeHex,
  BottomNavBar,
  CATEGORIES,
  CategoryChip,
  CategoryChips,
  CommentBar,
  CommentRow,
  CommunityCard,
  CountPill,
  CreatorCard,
  DayStreakCard,
  EmptyHint,
  EventCard,
  EXPLORE_CATEGORIES,
  FilterPills,
  GradientButton,
  HashtagChips,
  HeroCard,
  HeroCarousel,
  ImageCarousel,
  ONBOARDING_INTERESTS,
  InterestTile,
  JoinButton,
  KaminoMark,
  KaminoWordmark,
  LiveBadge,
  LiveRoomCard,
  MessageRow,
  NotificationRow,
  OnlineDot,
  Pill,
  PostTile,
  ProfileCategoryTile,
  ProgressSegments,
  RankCard,
  SearchField,
  SectionHeader,
  ShowcaseBanner,
  StatCard,
  StatsRow,
  TabsUnderline,
  ThumbnailStrip,
  VerifiedTick,
  WELCOME_CATEGORIES,
  categoryByKey,
  useColumnWidth,
  type Person,
} from "@/components/k";
import { Button, Card, Chip, Txt } from "@/components/ui";
import { defaultCover, heroArt, interestArt, isInterestKey } from "@/lib/brandArt";
import { useTheme } from "@/theme";

const P = (name: string, hue: number): Person => ({ name, hue });
const luna = P("LunaSketch", 280);
const kai = P("CloudyKai", 200);
const mochi = P("MochiNotes", 330);
const zen = P("ZenTales", 150);
const mika = P("Mika", 20);
const sora = P("Sora", 240);
const faces = [mika, kai, sora, zen];
const noop = () => {};

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 12, paddingTop: 22 }}>
      <View style={{ marginHorizontal: 16, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: theme.border }}>
        <Txt variant="caption" tone="subtle">{title.toUpperCase()}</Txt>
      </View>
      {children}
    </View>
  );
}

const Row = ({ children, gap = 8 }: { children: ReactNode; gap?: number }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap, paddingVertical: 4 }}>
    {children}
  </ScrollView>
);
const Pad = ({ children, style }: { children: ReactNode; style?: object }) => <View style={[{ paddingHorizontal: 16 }, style]}>{children}</View>;

export default function KitGallery() {
  const theme = useTheme();
  const col = useColumnWidth(4);
  const [cat, setCat] = useState("forYou");
  const [filter, setFilter] = useState("all");
  const [chatFilter, setChatFilter] = useState("all");
  const [tab, setTab] = useState("posts");
  const [joined, setJoined] = useState<Record<string, boolean>>({ "Creative Space": false });
  const [picks, setPicks] = useState<Record<string, boolean>>({ anime: true, gaming: true, music: true, kpop: true, food: true, pets: true, photography: true, travel: true });
  const [img, setImg] = useState(0);
  const [comment, setComment] = useState("");
  const [nav, setNav] = useState("home");
  const toggle = (name: string) => setJoined((j) => ({ ...j, [name]: !j[name] }));

  const recommended = [
    { name: "Anime Haven", description: "A home for anime lovers worldwide", members: 245_000, hue: 290 },
    { name: "Game Lounge", description: "Play. Talk. Make new friends.", members: 189_000, hue: 210 },
    { name: "Creative Space", description: "Art, design and creative vibes ✨", members: 122_000, hue: 330 },
    { name: "Pet Pals", description: "For animal lovers everywhere 🐾", members: 98_000, hue: 150 },
  ];
  const grid = [
    ...recommended,
    { name: "Music World", description: "Share your sound, find your people", members: 87_000, hue: 20 },
    { name: "K-Pop Zone", description: "Stans, discussions and all things K-Pop", members: 76_000, hue: 260 },
    { name: "Fantasy Realm", description: "Fantasy, lore and everything magical", members: 64_000, hue: 190 },
    { name: "Chill Corner", description: "Make friends, chat and unwind", members: 53_000, hue: 120 },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        {/* ── Header + home top ── */}
        <AppHeader viewer={luna} unread={3} />
        <Pad>
          <HeroCarousel
            slides={[
              { key: "1", image: heroArt["home-1"], title: "Good People Brighter Days ♡", text: "Join communities, share your passions, and find your people.", cta: "Start Exploring", onPress: noop },
              { key: "2", image: heroArt["home-2"], title: "Find your fandom", text: "Thousands of friendly communities.", cta: "Browse", onPress: noop },
              { key: "3", image: heroArt["home-3"], title: "Go live together", text: "Voice rooms every night.", cta: "Join a room", onPress: noop },
              { key: "4", image: heroArt["home-4"], title: "Earn achievements", text: "Streaks, badges and more.", cta: "See badges", onPress: noop },
            ]}
          />
        </Pad>
        <CategoryChips value={cat} onChange={setCat} style={{ marginTop: 10 }} />

        <View style={{ gap: 6, marginTop: 6 }}>
          <Pad><SectionHeader emoji="✨" title="Recommended for You" onAction={noop} /></Pad>
          <Row>
            {recommended.map((c, i) => (
              <CommunityCard key={c.name} {...c} image={defaultCover(i)} faces={faces} index={i} joined={!!joined[c.name]} onPress={noop} onJoin={() => toggle(c.name)} />
            ))}
          </Row>
          <Pad><SectionHeader emoji="🔥" title="Trending Communities" onAction={noop} /></Pad>
          <Row>
            {[
              { name: "Music World", description: "Share your sound 🎵", members: 176_000, hue: 20 },
              { name: "K-Pop Zone", description: "Stans, discussions 💜", members: 164_000, hue: 260 },
              { name: "Manga & Comics", description: "Stories, fanart, theories", members: 132_000, hue: 190 },
              { name: "Cozy Corner", description: "Chill chat & hangout", members: 118_000, hue: 110 },
            ].map((c) => (
              <CommunityCard key={c.name} variant="compact" {...c} image={defaultCover(c.hue)} onPress={noop} />
            ))}
          </Row>
          <Pad style={{ flexDirection: "row", gap: 10 }}>
            <DayStreakCard days={7} week={[true, true, true, true, true, true, false]} checkedInToday onPress={noop} />
            <EventCard title="Community Talent Show" when="Today at 8:00 PM" faces={faces} going={1300} onJoin={noop} onPress={noop} style={{ flex: 1.15 }} />
          </Pad>
          <Pad><SectionHeader emoji="⭐" title="Featured Creators" onAction={noop} /></Pad>
          <Row>
            {[
              { p: luna, h: "Digital Artist" },
              { p: kai, h: "Gaming Creator" },
              { p: mochi, h: "Lifestyle & Vlogs" },
              { p: zen, h: "Story Writer" },
            ].map((c, i) => (
              <CreatorCard key={c.p.name} person={c.p} headline={c.h} verified index={i} following={i === 1} onFollow={noop} onPress={noop} />
            ))}
          </Row>
        </View>

        {/* ── Explore ── */}
        <Section title="Explore">
          <Pad style={{ gap: 4 }}>
            <Txt variant="screen">Explore</Txt>
            <Txt tone="muted">Discover communities, meet amazing people, and find your next favorite space.</Txt>
          </Pad>
          <Pad><SearchField value="" onChangeText={noop} onFilter={noop} /></Pad>
          <CategoryChips items={EXPLORE_CATEGORIES} value="forYou" onChange={noop} onMore={noop} />
          <Pad><HeroCard image={heroArt["explore-1"]} title="Discover Your People" text="Explore communities around your passions and interests." cta="Browse All" onPress={noop} /></Pad>
          <Pad><SectionHeader emoji="⭐" title="Recommended Communities" onAction={noop} actionIcon="chevron" /></Pad>
          <Pad style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {grid.map((c, i) => (
              <View key={c.name} style={{ width: col }}>
                <CommunityCard variant="grid" {...c} faces={faces} index={i} joined={!!joined[c.name]} onPress={noop} onJoin={() => toggle(c.name)} />
              </View>
            ))}
          </Pad>
          <Pad><SectionHeader icon="trending-up" iconColor={theme.pink} title="Trending Tags" onAction={noop} actionIcon="chevron" /></Pad>
          <HashtagChips scroll inset={16} tags={["Anime", "Gaming", "KPop", "Art", "Music", "Pets", "Manga", "Movies"]} onPress={noop} />
        </Section>

        {/* ── Community ── */}
        <Section title="Community page">
          <AppHeader back actions={["search", "share", "more"]} onShare={noop} onMore={noop} insetTop={false} viewer={luna} unread={0} />
          <Pad style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Pill label="Anime" emoji="🌸" tone="pink" />
            <Pill label="Manga" emoji="🎮" tone="violet" />
            <Pill label="Fan Art" emoji="⭐" tone="orange" />
            <Pill label="Discussions" emoji="💗" tone="pink" />
            <Pill label="Recommendations" icon="film-outline" tone="violet" />
          </Pad>
          <Pad style={{ flexDirection: "row", gap: 8 }}>
            <StatCard value={245_000} label="Members" icon="people" tone="violet" faces={faces} />
            <StatCard value={12_400} label="Online Now" dot tone="pink" faces={[...faces, mochi]} onPress={noop} />
            <RankCard percent={1} category="Anime Community" />
          </Pad>
          <TabsUnderline
            tabs={[
              { key: "posts", label: "Posts", icon: "document-text-outline" },
              { key: "rooms", label: "Rooms", icon: "pulse-outline" },
              { key: "events", label: "Events", icon: "calendar-outline" },
              { key: "media", label: "Media", icon: "image-outline" },
            ]}
            value={tab}
            onChange={setTab}
            style={{ marginHorizontal: 16 }}
          />
          <Pad><SectionHeader emoji="⭐" title="Featured Posts" onAction={noop} actionIcon="chevron" /></Pad>
          <Row>
            <PostTile title="Spring 2025 Anime Recommendations 🌸" author={luna} verified time="3h ago" likes={4200} comments={320} pinned onPress={noop} />
            <PostTile title="Share Your Anime Journey! 💜" author={kai} verified time="12h ago" likes={2800} comments={415} onPress={noop} />
            <PostTile title="Post Your Setup & Anime Space! ✨" author={mochi} verified time="1d ago" likes={3100} comments={512} onPress={noop} />
          </Row>
        </Section>

        {/* ── Post ── */}
        <Section title="Post detail">
          <Pad style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Txt variant="cardTitle">LunaSketch</Txt>
            <VerifiedTick size={18} />
            <Pill label="Anime Haven" emoji="⭐" tone="violet" variant="solid" />
            <Pill label="Creator" emoji="👑" tone="violet" />
            <View style={{ flex: 1 }} />
            <GradientButton label="Follow" onPress={noop} size="sm" />
          </Pad>
          <Pad style={{ gap: 8 }}>
            <ImageCarousel images={[null, null, null, null, null]} index={img} onIndexChange={setImg} hue={260} />
            <ThumbnailStrip images={[null, null, null, null, null]} index={img} onSelect={setImg} hue={260} />
            <HashtagChips tags={["Anime", "Art", "Sunset", "Illustration", "Original"]} onPress={noop} />
          </Pad>
          <Pad>
            <CommentRow person={mika} time="3h ago" text="This is absolutely stunning!! 💜💜 The colors are so dreamy and the vibe is everything." likes={124} liked onLike={noop} onMore={noop} />
            <CommentRow person={kai} time="2h ago" text="The atmosphere in this is unreal. It makes me feel so calm." likes={86} onLike={noop} onMore={noop} />
          </Pad>
          <CommentBar me={luna} value={comment} onChangeText={setComment} onSend={noop} onPickImage={noop} onEmoji={noop} />
        </Section>

        {/* ── Chats ── */}
        <Section title="Chats">
          <Pad>
            <HeroCard variant="split" image={heroArt.chats} title="Chats & Live Rooms" text="Message friends, join live rooms, and be part of the conversation." cta="Start a Room" onPress={noop} height={190} hue={260} />
          </Pad>
          <FilterPills
            items={[
              { key: "all", label: "All Chats", icon: "chatbubble-ellipses" },
              { key: "dm", label: "Direct Messages", icon: "people-outline" },
              { key: "groups", label: "Groups", icon: "people" },
              { key: "live", label: "Live Rooms", icon: "pulse" },
            ]}
            value={chatFilter}
            onChange={setChatFilter}
          />
          <Pad><SectionHeader icon="pulse" title="Live Rooms Now" onAction={noop} actionIcon="chevron" /></Pad>
          <Row>
            <LiveRoomCard title="Late Night Vibes" subtitle="Chill music & requests" topic="Music" liveCount={1200} faces={faces} extra={45} index={0} icon="headset" onJoin={noop} />
            <LiveRoomCard title="Anime Talk" subtitle="Games • Anime • Chill" topic="Gaming" liveCount={856} faces={faces} extra={32} index={1} icon="game-controller" onJoin={noop} hue={210} />
            <LiveRoomCard title="Art & Creativity" subtitle="Draw • Chat • Learn" topic="Art" liveCount={643} faces={faces} extra={28} index={2} icon="color-palette" onJoin={noop} hue={330} />
            <LiveRoomCard title="Game Night Hangout" subtitle="Friends • Chats • Vibes" topic="Just Chatting" liveCount={421} faces={faces} extra={19} index={3} icon="people" onJoin={noop} hue={150} />
          </Row>
          <Pad>
            <SectionHeader icon="chatbubble-ellipses" title="Messages" right={<GradientButton label="New Message" icon="add" onPress={noop} size="sm" />} />
            <MessageRow person={mika} title="Mika" online preview="Hey! Are you joining the live room later? ✨" time="2m" unread={3} onPress={noop} />
            <MessageRow person={P("Game Squad", 100)} title="Game Squad" online={false} previewAuthor="Alex:" preview="That was an insane match! 🎮" time="12m" unread={12} onPress={noop} />
            <MessageRow person={luna} title="LunaSketch" verified online previewIcon="image-outline" preview="Sent a photo" time="3h" onPress={noop} divider={false} />
          </Pad>
        </Section>

        {/* ── Notifications ── */}
        <Section title="Notifications">
          <FilterPills
            layout="fill"
            items={[
              { key: "all", label: "All", icon: "notifications" },
              { key: "social", label: "Social", icon: "people", tone: "pink" },
              { key: "community", label: "Community", icon: "people", tone: "blue" },
              { key: "events", label: "Events", icon: "calendar", tone: "orange" },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <Pad><SectionHeader small title="Today" right={<Txt style={{ color: theme.accent }} variant="small">Mark All as Read</Txt>} /></Pad>
          <Pad style={{ gap: 8 }}>
            <NotificationRow kind="like" actor={mika} name="Mika" text="liked your drawing" stacked time="2m ago" thumb="" thumbHue={260} unread />
            <NotificationRow kind="comment" actor={kai} name="CloudyKai" text="replied to your post" stacked snippet="This looks amazing! 😍 Totally love the colors!" time="12m ago" thumb="" unread />
            <NotificationRow kind="follow" actor={luna} name="LunaSketch" text="started following you" meta="Digital Artist · 24.5K followers" time="25m ago" action={{ label: "Follow Back", onPress: noop }} unread />
            <NotificationRow kind="mention" actor={sora} name="Sora" text="mentioned you in a comment" snippet="@you You should join us! This event is perfect for you! 💜" time="1h ago" unread />
            <NotificationRow kind="community" actor={P("Pet Pals", 150)} name="Pet Pals" text="invited you to join" faces={faces} facesLabel="98K members" time="15h ago" action={{ label: "Join", onPress: noop, style: "solid", color: "#03D482" }} unread />
            <NotificationRow kind="event" name="Reminder: Community Talent Show" text="Starts today at 8:00 PM" time="20h ago" thumb="" />
            <NotificationRow kind="live" actor={zen} name="ZenTales" text="is live in" highlight="Late Night Vibes" meta="Music · Chill Chat · 1.2K watching" time="1d ago" chevron onPress={noop} />
          </Pad>
        </Section>

        {/* ── Profile ── */}
        <Section title="Profile">
          <Pad style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Pill label="Creator" emoji="⭐" tone="violet" variant="solid" size="md" />
            <Pill label="Digital Artist" icon="radio-button-on-outline" tone="violet" size="md" />
            <Pill label="She/Her" tone="violet" size="md" />
          </Pad>
          <Pad><StatsRow items={[{ value: 128, label: "Posts" }, { value: 24_500, label: "Followers", onPress: noop }, { value: 312, label: "Following", onPress: noop }]} /></Pad>
          <Pad style={{ flexDirection: "row", gap: 6 }}>
            <ProfileCategoryTile emoji="🎨" label="My Art" tone="orange" onPress={noop} />
            <ProfileCategoryTile emoji="📷" label="Daily Life" tone="violet" onPress={noop} />
            <ProfileCategoryTile emoji="🎮" label="Gaming" tone="blue" onPress={noop} />
            <ProfileCategoryTile emoji="🌱" label="Growth" tone="green" onPress={noop} />
            <ProfileCategoryTile emoji="❤️" label="Q&A" tone="pink" onPress={noop} />
            <ProfileCategoryTile emoji="⭐" label="Milestones" tone="orange" onPress={noop} />
          </Pad>
          <Pad style={{ flexDirection: "row", gap: 8 }}>
            <ShowcaseBanner variant="creator" title="Top Creator" text="Featured Creator for inspiring & positive content" onPress={noop} style={{ flex: 1.25 }} />
            <ShowcaseBanner variant="streak" title="72 Day Streak" text="Creating, sharing, and lifting others up!" onPress={noop} />
          </Pad>
          <Card padding={10} style={{ marginHorizontal: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <BadgeHex icon="ribbon" tone="orange" label="Community Star" />
              <BadgeHex icon="brush" tone="blue" label="Art Creator" />
              <BadgeHex icon="heart" tone="pink" label="Kindness Leader" />
              <BadgeHex icon="leaf" tone="green" label="Positive Vibes" />
              <BadgeHex icon="people" tone="blue" label="Trusted Member" />
            </View>
          </Card>
          <Row>
            <PostTile title="Sunset sketches 🌸" text="A few new drawings from this week!" likes={2400} comments={182} kindIcon="image-outline" onPress={noop} />
            <PostTile title="Studio Tour ✨" text="Take a look at my creative space!" likes={3100} comments={420} kindIcon="videocam-outline" onPress={noop} />
            <PostTile title="Finding Motivation Together" text="A little reminder for anyone who needs this 💜" likes={4800} comments={310} kindIcon="image-outline" onPress={noop} />
          </Row>
          <Row>
            {recommended.map((c, i) => (
              <CommunityCard key={c.name} variant="mini" {...c} index={[0, 2, 1, 3][i]} joined onPress={noop} onJoin={noop} />
            ))}
          </Row>
        </Section>

        {/* ── Onboarding & welcome ── */}
        <Section title="Onboarding">
          <Pad style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <KaminoWordmark />
            <Txt style={{ color: theme.accent }}>Skip</Txt>
          </Pad>
          <Pad><ProgressSegments current={2} total={5} /></Pad>
          <Pad style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {ONBOARDING_INTERESTS.slice(0, 8).map((key, i) => {
              const c = categoryByKey(key);
              return (
                <View key={key} style={{ width: col }}>
                  <InterestTile label={c.label} emoji={c.emoji ?? "✨"} hue={i * 40} image={isInterestKey(key) ? interestArt[key] : undefined} selected={!!picks[key]} onPress={() => setPicks((p) => ({ ...p, [key]: !p[key] }))} />
                </View>
              );
            })}
          </Pad>
          <Pad style={{ alignItems: "stretch" }}>
            <GradientButton label="Continue" gradient="hero" iconRight="arrow-forward" size="lg" full onPress={noop} />
          </Pad>
          <Pad style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {WELCOME_CATEGORIES.map((c) => (
              <CategoryChip key={c.key} category={c} size="lg" />
            ))}
          </Pad>
        </Section>

        {/* ── Atoms ── */}
        <Section title="Atoms">
          <Pad style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <KaminoMark size={56} />
            <KaminoMark size={28} />
            <VerifiedTick size={22} />
            <OnlineDot size={14} />
            <OnlineDot size={14} online={false} />
            <LiveBadge />
            <LiveBadge icon="radio" size="md" />
            <View style={{ backgroundColor: "#bbb", padding: 6, borderRadius: 8 }}><CountPill value={245_000} /></View>
            <AvatarStack people={faces} size={28} extra={45} />
          </Pad>
          <Pad style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <GradientButton label="Follow" icon="person-add" onPress={noop} />
            <GradientButton label="Get Started" gradient="hero" iconRight="arrow-forward" onPress={noop} />
            <GradientButton label="Publish Post" gradient="publish" icon="paper-plane" onPress={noop} />
            <GradientButton label="Join Event" size="sm" onPress={noop} />
            <JoinButton index={0} onPress={noop} />
            <JoinButton index={1} onPress={noop} />
            <JoinButton index={2} onPress={noop} />
            <JoinButton index={3} onPress={noop} />
            <JoinButton index={4} onPress={noop} />
            <JoinButton index={0} joined onPress={noop} />
          </Pad>
          <Pad style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Button label="Old Button" onPress={noop} />
            <Button label="Secondary" variant="secondary" onPress={noop} small />
            <Chip label="Chip" />
            <Chip label="Selected" selected onPress={noop} />
            <Pill label="Discussion" tone="violet" />
            <Pill label="Music" tone="pink" variant="solid" />
          </Pad>
          <Pad style={{ flexDirection: "row", gap: 8 }}>
            {CATEGORIES.slice(9, 13).map((c) => <CategoryChip key={c.key} category={c} />)}
          </Pad>
          <Pad><EmptyHint emoji="🌱" title="No posts yet" text="Be the first to share something kind." actionLabel="Write a post" onAction={noop} /></Pad>
          <Card style={{ marginHorizontal: 16 }}>
            <Txt variant="cardTitle">Card (ui)</Txt>
            <Txt>White, radius 18, hairline and a soft shadow.</Txt>
          </Card>
        </Section>
      </ScrollView>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <BottomNavBar
          activeKey={nav}
          onPress={(k) => k !== "create" && setNav(k)}
          items={[
            { key: "home", label: "Home", icon: "home-outline" },
            { key: "communities", label: "Communities", icon: "people-outline" },
            { key: "create", label: "Create", icon: "add", fab: true },
            { key: "chats", label: "Chats", icon: "chatbubble-ellipses-outline", badge: 4 },
            { key: "profile", label: "Profile", icon: "person-outline" },
          ]}
        />
      </View>
    </View>
  );
}

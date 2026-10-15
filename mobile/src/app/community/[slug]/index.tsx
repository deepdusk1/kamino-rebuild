import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { api } from "@/api/endpoints";
import type { CommunityOverview } from "@/api/models";
import { platform } from "@/api/platform-v9";
import type { HallEvent } from "@/api/types";
import { withCommunityTheme } from "@/components/CommunityTheme";
import { JoinSheet } from "@/components/JoinSheet";
import { PostCard } from "@/components/PostCard";
import { ActionMenu, type MenuItem } from "@/components/community/ActionMenu";
import { EventsPanel, MediaGrid, ModeratorsRow, RoomsPanel, TopicChips } from "@/components/community/CommunityParts";
import { postPictures, serverImage } from "@/components/community/media";
import { notify, shareLink } from "@/components/community/platform";
import {
  AvatarStack,
  EmptyHint,
  GradientButton,
  JoinButton,
  Picture,
  Pill,
  PostTile,
  SectionHeader,
  VerifiedTick,
  personFromChip,
  useColumnWidth,
  type IconName,
} from "@/components/k";
import { ErrorState, PressableScale, SkeletonList, Txt, useTabBarSpace } from "@/components/ui";
import { defaultCover } from "@/lib/brandArt";
import { errorMessage, showError } from "@/lib/errors";
import { compactNumber, levelFromRep, plainPreview, timeAgo } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { joinButtonLabel, leaveCommunity } from "@/lib/community-join";
import { font, radius, shadow, useTheme } from "@/theme";

type Section = "home" | "rooms" | "events" | "media";

const SECTIONS: { key: Section; label: string; icon: IconName }[] = [
  { key: "home", label: "Home", icon: "home-outline" },
  { key: "rooms", label: "Rooms", icon: "chatbubbles-outline" },
  { key: "events", label: "Events", icon: "calendar-outline" },
  { key: "media", label: "Media", icon: "images-outline" },
];

/** Shortcuts to the community's own pages, shown as a row of icon buttons under the header. */
const SHORTCUTS: { key: string; label: string; icon: IconName; path: string }[] = [
  { key: "wiki", label: "Wiki", icon: "book-outline", path: "wiki" },
  { key: "members", label: "Members", icon: "people-outline", path: "members" },
  { key: "rank", label: "Leaderboard", icon: "trophy-outline", path: "rank" },
  { key: "stories", label: "AI stories", icon: "sparkles-outline", path: "roleplay" },
];

const MOD_ROLES = new Set(["leader", "agent", "curator"]);

/**
 * A community's home page (/community/[slug]).
 *
 * Everything comes from `communityOverview` (counts, faces, moderators, featured and recent posts, rooms, events,
 * media) plus `getCommunityPage` for the join questions. Header: banner, icon, name, tagline, members / online,
 * Join (or Check in + your level when you're a member). Then shortcuts (Wiki, Members, Leaderboard, AI stories),
 * topic chips and four sections: Home (AI recap on request, featured, moderators, recent posts), Rooms, Events, Media.
 * Private communities you can't read show a short locked card with the join button.
 */
function CommunityHomeScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();
  const { width } = useWindowDimensions();
  const featuredWidth = useColumnWidth(2, { inset: 16, gap: 10 });
  const { slug: rawSlug } = useLocalSearchParams<{ slug: string }>();
  const slug = typeof rawSlug === "string" ? rawSlug : "";

  const [section, setSection] = useState<Section>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [recap, setRecap] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: ["communityOverview", slug],
    queryFn: () => api.communityOverview(slug),
    enabled: Boolean(slug),
  });
  // Same key as the community colour wrapper, so this reuses its request. Only the join questions are read from it.
  const page = useQuery({ queryKey: ["community", slug], queryFn: () => api.community(slug), enabled: Boolean(slug) });

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["communityOverview", slug] }),
      queryClient.invalidateQueries({ queryKey: ["community", slug] }),
    ]);
  };

  if (!slug || (overview.isPending && !overview.data)) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <View style={[styles.banner, { backgroundColor: theme.surfaceAlt }]} />
        <View style={{ padding: 16 }}>
          <SkeletonList count={3} />
        </View>
      </View>
    );
  }
  if (overview.isError || !overview.data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: 60 }}>
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      </View>
    );
  }

  const d: CommunityOverview = overview.data;
  const c = d.community;
  const member = d.member && d.member.status === "active" ? d.member : null;
  const pending = d.member?.status === "pending";
  const removed = d.member?.status === "banned";
  const isOwner = member?.role === "agent";
  const canModerate = Boolean(member && MOD_ROLES.has(member.role));
  const level = member ? levelFromRep(member.rep) : 0;
  const coverSource = c.cover ? serverImage(c.cover) : defaultCover(c.hue);
  const iconSource = c.icon ? serverImage(c.icon) : c.cover ? serverImage(c.cover) : defaultCover(c.hue);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/explore"));

  const checkIn = async () => {
    if (!member || member.checkedInToday || busy) return;
    setBusy("checkin");
    try {
      const result = await api.checkInCommunity(slug);
      haptic.success();
      if (!result.already) notify("Checked in", `Day ${result.streak} in a row. Keep it going tomorrow!`);
      await refreshAll();
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  };

  const rsvp = async (event: HallEvent) => {
    setBusy(`rsvp:${event.id}`);
    try {
      await api.rsvp(slug, event.id);
      haptic.tap();
      await queryClient.invalidateQueries({ queryKey: ["communityOverview", slug] });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  };

  /** Leaves (or cancels a waiting request) after asking first. */
  const leave = async () => {
    setBusy("leave");
    try {
      await leaveCommunity(queryClient, { id: slug, name: c.name, pending });
    } catch (error) {
      showError(error);
    } finally {
      setBusy(null);
    }
  };

  /** Asks the AI for a two-sentence recap of the newest posts. Only runs when someone taps the button. */
  const summarize = async () => {
    if (busy === "recap") return;
    const lines = d.recent
      .slice(0, 8)
      .map((p) => `${p.title}: ${plainPreview(p.body).slice(0, 140)}`)
      .join("\n");
    setBusy("recap");
    try {
      const res = await platform.ai("summarize", `Recap these recent posts from the "${c.name}" community in two friendly sentences:\n${lines}`);
      setRecap(res.text.trim() || "Nothing to summarize yet.");
    } catch (error) {
      notify("Couldn't make a recap", errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const menuItems: MenuItem[] = [
    ...(member
      ? [{ key: "compose", label: "Write a post", icon: "create-outline" as const, tone: "violet" as const, onPress: () => router.push(`/community/${slug}/compose`) }]
      : []),
    { key: "share", label: "Share community", icon: "share-outline", tone: "blue", onPress: () => void shareLink(c.name, `/c/${slug}`) },
    { key: "news", label: "Announcements", icon: "megaphone-outline", tone: "orange", onPress: () => router.push(`/community/${slug}/news`) },
    { key: "files", label: "Shared files", icon: "folder-open-outline", tone: "green", onPress: () => router.push(`/community/${slug}/files`) },
    ...(member
      ? [
          { key: "standing", label: "My standing", icon: "shield-checkmark-outline" as const, tone: "green" as const, hint: "Warnings, mutes and appeals", onPress: () => router.push(`/community/${slug}/standing`) },
        ]
      : []),
    ...(canModerate
      ? [{ key: "mod", label: "Moderation", icon: "construct-outline" as const, tone: "violet" as const, onPress: () => router.push(`/community/${slug}/mod`) }]
      : []),
    ...(member && !isOwner
      ? [
          {
            key: "leave",
            label: "Leave community",
            icon: "exit-outline" as const,
            destructive: true,
            hint: "Your reputation is kept if you come back",
            onPress: () => void leave(),
          },
        ]
      : []),
    ...(isOwner
      ? [
          {
            key: "owner",
            label: "Hand over ownership",
            icon: "key-outline" as const,
            tone: "violet" as const,
            hint: "Make a co-leader the owner (then you can leave)",
            onPress: () => router.push(`/community/${slug}/mod`),
          },
        ]
      : []),
  ];

  const header = (
    <>
      {/* Banner with floating back / share / menu buttons */}
      <View style={styles.banner}>
        <Picture source={coverSource} hue={c.hue} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={["rgba(10,8,24,0.5)", "rgba(10,8,24,0.05)", "rgba(10,8,24,0.55)"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.bannerBar}>
          <GlassButton icon="chevron-back" label="Back" onPress={goBack} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <GlassButton icon="search" label={`Search ${c.name}`} onPress={() => router.push({ pathname: "/search", params: { q: c.name } })} />
            <GlassButton icon="ellipsis-horizontal" label="Community menu" onPress={() => setMenuOpen(true)} />
          </View>
        </View>
      </View>

      {/* Icon, name, counts and the main button */}
      <View style={{ paddingHorizontal: 16, marginTop: -38, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <View style={[styles.iconFrame, { backgroundColor: theme.bg }, shadow.raised]}>
            <Picture source={iconSource} hue={c.hue} label={c.name} radius={20} style={{ width: 76, height: 76 }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 4 }}>
            {member ? (
              <PressableScale
                onPress={() => void checkIn()}
                disabled={member.checkedInToday || busy === "checkin"}
                accessibilityRole="button"
                accessibilityLabel={member.checkedInToday ? `Checked in today, ${member.streak} day streak` : "Check in for today"}
                scaleTo={0.95}
                style={[
                  styles.checkIn,
                  {
                    backgroundColor: member.checkedInToday ? theme.tints.green : theme.tints.orange,
                    borderColor: member.checkedInToday ? theme.ok : theme.orange,
                  },
                ]}
              >
                {busy === "checkin" ? (
                  <ActivityIndicator size="small" color={theme.orange} />
                ) : (
                  <Txt style={{ fontFamily: font.heavy, fontSize: 12.5, color: member.checkedInToday ? theme.toneText.green : theme.toneText.orange }}>
                    {member.checkedInToday ? `🔥 ${member.streak}-day streak` : "Check in"}
                  </Txt>
                )}
              </PressableScale>
            ) : null}
            {member ? (
              <GradientButton label="Post" icon="create-outline" size="sm" onPress={() => router.push(`/community/${slug}/compose`)} />
            ) : (
              <JoinButton
                joined={pending || removed}
                check={false}
                label={joinButtonLabel({ ...c, joined: false, pending })}
                joinedLabel={removed ? "Removed" : "Requested"}
                size="md"
                busy={busy === "leave"}
                onPress={() => (removed ? router.push(`/community/${slug}/standing`) : pending ? void leave() : setJoinOpen(true))}
                accessibilityLabel={removed ? "You were removed. See your standing and appeal" : pending ? "Cancel your join request" : `Join ${c.name}`}
              />
            )}
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Txt accessibilityRole="header" numberOfLines={2} style={{ fontFamily: font.heavy, fontSize: 24, lineHeight: 30, letterSpacing: -0.5, color: theme.ink, flexShrink: 1 }}>
              {c.name}
            </Txt>
            {c.verified ? <VerifiedTick size={18} /> : null}
          </View>
          {c.tagline || c.description ? (
            <Txt numberOfLines={3} style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: theme.text }}>
              {c.tagline || c.description}
            </Txt>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          {d.memberFaces.length ? <AvatarStack people={d.memberFaces.map(personFromChip)} size={22} max={4} /> : null}
          <Txt style={{ fontFamily: font.bold, fontSize: 12.5, color: theme.ink }}>
            {compactNumber(c.memberCount)} <Txt style={{ fontFamily: font.regular, color: theme.muted }}>{c.memberCount === 1 ? "member" : "members"}</Txt>
          </Txt>
          {d.onlineCount > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View style={[styles.dot, { backgroundColor: theme.ok }]} />
              <Txt style={{ fontFamily: font.bold, fontSize: 12.5, color: theme.ok }}>{compactNumber(d.onlineCount)} online</Txt>
            </View>
          ) : null}
          {member ? <Pill label={`Lv ${level} · ${compactNumber(member.rep)} rep`} emoji="⚡" tone="violet" style={{ height: 22, paddingHorizontal: 8 }} /> : null}
          {member && d.rankPercent > 0 && d.rankPercent <= 25 ? <Pill label={`Top ${d.rankPercent}%`} tone="orange" style={{ height: 22, paddingHorizontal: 8 }} /> : null}
        </View>
      </View>

      {d.locked ? null : (
        <>
          {/* Shortcuts */}
          <View style={styles.shortcutRow}>
            {SHORTCUTS.map((s) => (
              <PressableScale
                key={s.key}
                onPress={() => router.push(`/community/${slug}/${s.path}` as never)}
                accessibilityRole="button"
                accessibilityLabel={s.label}
                scaleTo={0.94}
                style={[styles.shortcut, { backgroundColor: theme.surface, borderColor: theme.border }, shadow.card]}
              >
                <Ionicons name={s.icon} size={20} color={theme.accent} />
                <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 11.5, lineHeight: 15, color: theme.ink }}>
                  {s.label}
                </Txt>
              </PressableScale>
            ))}
          </View>

          <TopicChips topics={c.topics ?? []} onPress={(t) => router.push({ pathname: "/search", params: { q: `#${t.replace(/^#/, "")}` } })} />

          {/* Section switcher */}
          <View style={[styles.segment, { backgroundColor: theme.surfaceAlt }]}>
            {SECTIONS.map((s) => {
              const on = section === s.key;
              return (
                <PressableScale
                  key={s.key}
                  onPress={() => {
                    haptic.tap();
                    setSection(s.key);
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={s.label}
                  scaleTo={0.96}
                  style={[styles.segmentItem, on ? [{ backgroundColor: theme.surface }, shadow.card] : null]}
                >
                  <Ionicons name={s.icon} size={15} color={on ? theme.accent : theme.muted} />
                  <Txt style={{ fontFamily: on ? font.bold : font.semibold, fontSize: 12.5, color: on ? theme.ink : theme.muted }}>{s.label}</Txt>
                </PressableScale>
              );
            })}
          </View>
        </>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabSpace + 90 }}
        refreshControl={<RefreshControl refreshing={overview.isRefetching} onRefresh={() => void refreshAll()} tintColor={theme.accent} colors={[theme.accent]} />}
      >
        {header}

        {d.locked ? (
          <View style={{ padding: 16 }}>
            {removed ? (
              <EmptyHint
                emoji="🚫"
                title="You were removed from this community"
                text="You can see why and send the leaders an appeal."
                actionLabel="See your standing"
                onAction={() => router.push(`/community/${slug}/standing`)}
                style={{ marginHorizontal: 0 }}
              />
            ) : (
              <EmptyHint
                emoji="🔒"
                title="This community is private"
                text={pending ? "Your request is waiting for a leader to review it." : "Ask to join to see its posts, rooms and events."}
                actionLabel={pending ? "Cancel request" : "Ask to join"}
                onAction={pending ? () => void leave() : () => setJoinOpen(true)}
                style={{ marginHorizontal: 0 }}
              />
            )}
          </View>
        ) : (
          <View style={{ gap: 18, marginTop: 14 }}>
            {section === "home" ? (
              <>
                {/* AI recap: made only when asked */}
                {d.recent.length >= 2 ? (
                  <View style={{ paddingHorizontal: 16 }}>
                    <View style={[styles.recapCard, { backgroundColor: theme.surfaceAi, borderColor: theme.border }]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <View style={[styles.recapIcon, { backgroundColor: theme.surface }]}>
                          <Ionicons name="sparkles" size={16} color={theme.violet} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Txt style={{ fontFamily: font.heavy, fontSize: 14, color: theme.ink }}>Catch up with AI</Txt>
                          <Txt style={{ fontFamily: font.regular, fontSize: 12, color: theme.muted }}>A short recap of the newest posts</Txt>
                        </View>
                        {recap ? null : (
                          <PressableScale
                            onPress={() => void summarize()}
                            disabled={busy === "recap"}
                            accessibilityRole="button"
                            accessibilityLabel="Make an AI recap of recent posts"
                            scaleTo={0.95}
                            style={[styles.recapBtn, { backgroundColor: theme.violet }]}
                          >
                            {busy === "recap" ? <ActivityIndicator size="small" color="#fff" /> : <Txt style={{ fontFamily: font.bold, fontSize: 12, color: "#fff" }}>Recap</Txt>}
                          </PressableScale>
                        )}
                      </View>
                      {recap ? <Txt style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: theme.ink }}>{recap}</Txt> : null}
                    </View>
                  </View>
                ) : null}

                {d.featured.length ? (
                  <View style={{ gap: 8 }}>
                    <SectionHeader title="Featured" emoji="⭐" style={{ paddingHorizontal: 16 }} />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
                      {d.featured.map((p) => (
                        <PostTile
                          key={p.id}
                          title={p.title || plainPreview(p.body).slice(0, 48) || "Post"}
                          image={postPictures(p)[0] ?? null}
                          hue={p.author.hue}
                          likes={p.likeCount}
                          comments={p.commentCount}
                          author={personFromChip(p.author)}
                          verified={p.authorVerified}
                          time={timeAgo(p.createdAt)}
                          pinned={p.pinned}
                          width={featuredWidth}
                          onPress={() => router.push(`/community/${slug}/post/${p.id}`)}
                        />
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {d.moderators.length ? (
                  <View style={{ gap: 8 }}>
                    <SectionHeader title="Leaders" emoji="🛡️" style={{ paddingHorizontal: 16 }} />
                    <ModeratorsRow moderators={d.moderators} />
                  </View>
                ) : null}

                <View style={{ gap: 10, paddingHorizontal: 16 }}>
                  <SectionHeader
                    title="Latest posts"
                    emoji="📝"
                    actionLabel={member ? "Write" : undefined}
                    onAction={member ? () => router.push(`/community/${slug}/compose`) : undefined}
                  />
                  {d.recent.length ? (
                    d.recent.map((p, i) => <PostCard key={p.id} post={p} index={Math.min(i, 6)} />)
                  ) : (
                    <EmptyHint
                      emoji="✍️"
                      title="No posts yet"
                      text={member ? `Start the conversation in ${c.name}.` : `Join ${c.name} to start the conversation.`}
                      actionLabel={member ? "Write the first post" : undefined}
                      onAction={member ? () => router.push(`/community/${slug}/compose`) : undefined}
                      style={{ marginHorizontal: 0 }}
                    />
                  )}
                </View>
              </>
            ) : section === "rooms" ? (
              <RoomsPanel slug={slug} rooms={d.rooms} canStart={Boolean(member)} onStart={() => router.push(`/community/${slug}/chats`)} />
            ) : section === "events" ? (
              <EventsPanel slug={slug} events={d.events} canRsvp={Boolean(member)} busyId={busy?.startsWith("rsvp:") ? Number(busy.slice(5)) : null} onRsvp={(e) => void rsvp(e)} />
            ) : (
              <MediaGrid slug={slug} media={d.media} width={Math.min(width, 600)} />
            )}
          </View>
        )}
      </ScrollView>

      {member && !d.locked ? (
        <PressableScale
          onPress={() => router.push(`/community/${slug}/compose`)}
          accessibilityRole="button"
          accessibilityLabel={`Write a post in ${c.name}`}
          scaleTo={0.92}
          style={[styles.fab, { bottom: tabSpace + 18 }, shadow.glow(theme.accent, 0.4)]}
        >
          <LinearGradient colors={theme.gradHero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 28 }]} />
          <Ionicons name="add" size={26} color="#FFFFFF" />
        </PressableScale>
      ) : null}

      <ActionMenu visible={menuOpen} title={c.name} items={menuItems} onClose={() => setMenuOpen(false)} />
      {page.data ? (
        <JoinSheet
          community={page.data.community}
          questions={page.data.joinQuestions ?? []}
          visible={joinOpen}
          onClose={() => setJoinOpen(false)}
          onJoined={() => {
            haptic.success();
            void refreshAll();
          }}
        />
      ) : null}
    </View>
  );
}

function GlassButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} scaleTo={0.9} style={styles.glass}>
      <Ionicons name={icon} size={20} color="#FFFFFF" />
    </PressableScale>
  );
}

export default withCommunityTheme(CommunityHomeScreen);

const styles = StyleSheet.create({
  banner: { height: 190, overflow: "hidden" },
  bannerBar: { position: "absolute", top: 44, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between" },
  glass: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(15,12,35,0.45)", alignItems: "center", justifyContent: "center" },
  iconFrame: { padding: 3, borderRadius: 23 },
  checkIn: { height: 34, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center", minWidth: 84 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  shortcutRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 16, marginBottom: 12 },
  shortcut: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 10, borderRadius: radius.card, borderWidth: 1 },
  segment: { flexDirection: "row", marginHorizontal: 16, marginTop: 14, padding: 4, borderRadius: radius.pill, gap: 4 },
  segmentItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 34, borderRadius: radius.pill },
  recapCard: { padding: 12, gap: 10, borderRadius: radius.card, borderWidth: 1 },
  recapIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  recapBtn: { height: 32, minWidth: 72, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: 18, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
});

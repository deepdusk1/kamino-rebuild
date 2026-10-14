import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { api } from "@/api/endpoints";
import type { Draft } from "@/api/models";
import { AppHeader, GradientButton, Picture, Pill, useColumnWidth } from "@/components/k";
import { CommunityAvatar, CommunityList, useMyCommunities } from "@/components/create/communities";
import { EventSheet } from "@/components/create/EventSheet";
import {
  ActionButton,
  AddMediaTile,
  CREATE_KINDS,
  InlineInput,
  MediaThumb,
  OptionRow,
  PollEditor,
  RowTitle,
  TagChips,
  ToggleRow,
  TypeTile,
  type CreateKind,
} from "@/components/create/parts";
import { StartRoomSheet } from "@/components/create/StartRoomSheet";
import { Button, Field, PressableScale, Sheet, Txt, useTabBarSpace } from "@/components/ui";
import { heroArt } from "@/lib/brandArt";
import {
  MAX_POLL_OPTIONS,
  MAX_POST_MEDIA,
  MAX_POST_TEXT,
  addTag,
  draftToQuickPost,
  emptyQuickPost,
  isQuickDraft,
  quickPostProblem,
  quickPostRequest,
  quickPostToDraft,
  schedulePresets,
  type QuickPost,
} from "@/lib/compose";
import { errorMessage } from "@/lib/errors";
import { compactNumber, formatDateTime, parseLocalDateTime } from "@/lib/format";
import { HELD_MESSAGE, HELD_TITLE } from "@/lib/held";
import { pickPhoto } from "@/lib/media";
import { useDebounced } from "@/lib/useDebounced";
import { uuid } from "@/lib/uuid";
import { font, radius, shadow, useTheme } from "@/theme";

/** What happened after Publish, shown kindly under the button. */
type Outcome = { kind: "posted" | "scheduled" | "held"; title: string; text: string; href?: string };

/** Post types the quick composer doesn't do; they open the full editor of the chosen community. */
const MORE_TYPES = [
  { type: "quiz", label: "Quiz", emoji: "🧠" },
  { type: "wiki", label: "Wiki page", emoji: "📚" },
  { type: "question", label: "Question", emoji: "❓" },
  { type: "story", label: "Story", emoji: "🎞️" },
] as const;

/**
 * The Create tab (mockup 07-create): five type tiles (Post · Story · Community · Live Room · Event) and the
 * "Create a Post" card. The card really posts: text, up to 10 pictures, a poll, a link, a place, tags, who can
 * see it, and (under More Options) a title, a content warning, comments on/off, scheduling and drafts.
 * Open it with `/create?slug=<community>` to preselect where the post goes.
 */
export default function Create() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();
  const params = useLocalSearchParams<{ slug?: string }>();
  const { list: communities, query: meQuery } = useMyCommunities();

  const [post, setPost] = useState<QuickPost>(emptyQuickPost);
  const update = (patch: Partial<QuickPost>) => setPost((p) => ({ ...p, ...patch }));
  const [slug, setSlug] = useState<string | null>(params.slug ?? null);
  // Opening Create again with another `?slug=` switches the community (React's "adjust state while rendering").
  const [seenParam, setSeenParam] = useState(params.slug);
  if (params.slug !== seenParam) {
    setSeenParam(params.slug);
    if (params.slug) setSlug(params.slug);
  }
  // Without a choice yet, post to your biggest community.
  const community = communities.find((c) => c.slug === slug) ?? [...communities].sort((a, b) => b.memberCount - a.memberCount)[0] ?? null;

  const [locationOpen, setLocationOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scheduleOn, setScheduleOn] = useState(false);
  const [customTime, setCustomTime] = useState("");
  const [sheet, setSheet] = useState<null | "community" | "visibility" | "tag" | "drafts" | "room" | "event">(null);
  const [tagText, setTagText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState<null | "publish" | "draft" | "photo">(null);
  const draftRef = useRef<{ id: string; slug: string; revision: number } | null>(null);
  const scroller = useRef<ScrollView>(null);

  // Tag ideas from what you wrote and the community's topics (asked again a moment after you stop typing).
  const words = useDebounced(`${post.title}\n${post.text}`.trim(), 600);
  const suggestions = useQuery({
    queryKey: ["suggestTags", words, community?.slug],
    queryFn: () => api.suggestTags(words, community?.slug),
    enabled: !!community,
    staleTime: 60_000,
  });
  const drafts = useQuery({ queryKey: ["drafts", community?.slug], queryFn: () => api.drafts(community!.slug), enabled: !!community && sheet === "drafts" });

  const tileWidth = useColumnWidth(4, { inset: 24, gap: 6 });
  const tileHeight = Math.round(tileWidth * 1.1);
  const presets = schedulePresets();

  const addPhoto = async () => {
    if (post.media.length >= MAX_POST_MEDIA) return setProblem(`A post can have up to ${MAX_POST_MEDIA} pictures.`);
    setBusy("photo");
    try {
      const image = await pickPhoto("library", 1_800_000);
      if (image) setPost((p) => ({ ...p, media: [...p.media, image].slice(0, MAX_POST_MEDIA) }));
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const chooseTime = (iso: string | null) => {
    setCustomTime("");
    update({ publishAt: iso });
  };

  const reset = () => {
    setPost(emptyQuickPost());
    setLocationOpen(false);
    setScheduleOn(false);
    setCustomTime("");
    draftRef.current = null;
  };

  const publish = async () => {
    setOutcome(null);
    if (!community) return setProblem("Join a community first, then you can post there.");
    const scheduleProblem = scheduleOn && !post.publishAt ? (customTime.trim() ? "Write the time like 2026-10-31 19:30." : "Pick when it should go live, or turn scheduling off.") : null;
    const found = scheduleProblem ?? quickPostProblem(post);
    if (found) return setProblem(found);
    setProblem(null);
    setBusy("publish");
    try {
      const created = await api.createPost({ slug: community.slug, ...quickPostRequest({ ...post, publishAt: scheduleOn ? post.publishAt : null }) });
      // The draft has done its job. If deleting it fails the post is still published, so that error is ignored.
      if (draftRef.current) await api.deleteDraft(draftRef.current.id, draftRef.current.revision).catch(() => undefined);
      void queryClient.invalidateQueries();
      reset();
      const href = `/community/${community.slug}/post/${created.id}`;
      if (created.held) setOutcome({ kind: "held", title: HELD_TITLE, text: HELD_MESSAGE });
      else if (created.scheduled)
        setOutcome({ kind: "scheduled", title: "Scheduled ✨", text: `Your post goes live in ${community.name} on ${formatDateTime(created.publishAt ?? "")}. Only you can see it until then.`, href });
      else {
        setOutcome({ kind: "posted", title: "Posted! 🎉", text: `Your post is live in ${community.name}.`, href });
        router.push(href as never);
      }
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async () => {
    if (!community) return setProblem("Join a community first; drafts are kept per community.");
    if (!post.text.trim() && !post.title.trim()) return setProblem("Write something first, then save it as a draft.");
    setProblem(null);
    setBusy("draft");
    try {
      const current = draftRef.current?.slug === community.slug ? draftRef.current : { id: uuid(), slug: community.slug, revision: 0 };
      const saved = await api.saveDraft({ id: current.id, slug: community.slug, revision: current.revision, content: quickPostToDraft(post) });
      draftRef.current = { id: saved.id, slug: community.slug, revision: saved.revision };
      void queryClient.invalidateQueries({ queryKey: ["drafts", community.slug] });
      setOutcome({ kind: "posted", title: "Draft saved", text: `Find it under Drafts in ${community.name}.` });
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const openDraft = (draft: Draft) => {
    setSheet(null);
    if (!isQuickDraft(draft.content)) {
      // Quizzes, wiki pages and stories open in the full editor, which has its own Drafts list.
      router.push(`/community/${draft.slug}/compose?type=${draft.content.type}` as never);
      return;
    }
    draftRef.current = { id: draft.id, slug: draft.slug, revision: draft.revision };
    setPost(draftToQuickPost(draft.content));
    setMoreOpen(!!(draft.content.title || draft.content.warning || draft.content.commentsOff));
    setOutcome(null);
  };

  const onTile = (kind: CreateKind) => {
    if (kind === "post") return scroller.current?.scrollTo({ y: 0, animated: true });
    if (kind === "community") return router.push("/new-community");
    if (kind === "live") return setSheet("room");
    if (kind === "event") return setSheet("event");
    // Story: the story editor of the chosen community (pictures with captions that disappear after 24 hours).
    if (!community) return setProblem("Join a community first, then share a story there.");
    router.push(`/community/${community.slug}/compose?type=story` as never);
  };

  const visibilityLabel = post.visibility === "members" ? "Members" : "Public";
  const publishLabel = scheduleOn && post.publishAt ? "Schedule Post" : "Publish Post";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={scroller} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: tabSpace + 12 }}>
        <AppHeader />
        <Txt tone="accent" onPress={()=>router.push('/content-studio' as never)} style={{paddingHorizontal:16,paddingVertical:12}}>Video, audio, stories & portfolio →</Txt>

        {/* ── Title, subline and soft artwork ── */}
        <View style={{ paddingHorizontal: 14, minHeight: 84 }}>
          <Picture source={heroArt.create} radius={16} style={{ position: "absolute", right: 12, top: -2, width: "52%", height: 82, opacity: theme.dark ? 0.35 : 1 }} />
          <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, color: theme.ink }}>Create</Txt>
          <Txt style={{ marginTop: 6, maxWidth: "70%", fontFamily: font.regular, fontSize: 13, lineHeight: 15, color: theme.muted }}>Share your ideas, start something new, and bring people together.</Txt>
        </View>

        {/* ── Type tiles ── */}
        <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 10, marginTop: 10 }}>
          {CREATE_KINDS.map((k) => (
            <TypeTile key={k.key} kind={k.key} label={k.label} hint={k.hint} selected={k.key === "post"} onPress={() => onTile(k.key)} style={{ flex: k.key === "post" ? 0.86 : k.key === "story" ? 0.9 : 1 }} />
          ))}
        </View>

        {/* ── Create a Post ── */}
        <View style={[{ marginHorizontal: 10, marginTop: 10, padding: 12, paddingTop: 13, gap: 12, borderRadius: radius.card, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }, shadow.card]}>
          <View>
            <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: theme.ink }}>Create a Post</Txt>
            <Txt style={{ fontFamily: font.regular, fontSize: 11.5, lineHeight: 15, color: theme.muted }}>Share updates, art, thoughts, or anything with your community.</Txt>
          </View>

          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 6 }}>
            <TextInput
              value={post.text}
              onChangeText={(text) => update({ text })}
              placeholder={post.poll ? "Ask your poll question…" : "What's on your mind?"}
              placeholderTextColor={theme.subtle}
              accessibilityLabel="What's on your mind?"
              multiline
              maxLength={MAX_POST_TEXT}
              selectionColor={theme.accent}
              style={{ minHeight: 44, maxHeight: 220, fontFamily: font.regular, fontSize: 14, lineHeight: 19, color: theme.ink, paddingVertical: 4, textAlignVertical: "top", outlineWidth: 0 }}
            />
            <Txt style={{ alignSelf: "flex-end", fontFamily: font.regular, fontSize: 11, lineHeight: 14, color: theme.muted }} accessibilityLabel={`${post.text.length} of ${MAX_POST_TEXT} characters`}>
              {`${post.text.length.toLocaleString("en-US")}/${MAX_POST_TEXT.toLocaleString("en-US")}`}
            </Txt>
          </View>

          {/* Pictures: the dashed add tile, then each chosen picture with a ✕. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} style={{ marginHorizontal: -2 }}>
            {post.media.length < MAX_POST_MEDIA ? (
              <AddMediaTile width={tileWidth} height={tileHeight} label={post.media.length ? `Add more (${post.media.length}/${MAX_POST_MEDIA})` : "Add Photos"} busy={busy === "photo"} onPress={() => void addPhoto()} />
            ) : null}
            {post.media.map((uri, i) => (
              <MediaThumb key={`${i}-${uri.length}`} uri={uri} index={i} width={tileWidth} height={tileHeight} onRemove={() => update({ media: post.media.filter((_, j) => j !== i) })} />
            ))}
          </ScrollView>

          <View style={{ flexDirection: "row", gap: 6 }}>
            <ActionButton icon="stats-chart" label="Add Poll" tone="violet" active={!!post.poll} onPress={() => update({ poll: post.poll ? null : ["", ""] })} />
            <ActionButton icon="location" label="Add Location" tone="blue" active={locationOpen || !!post.location} onPress={() => setLocationOpen((o) => !o)} />
            <ActionButton icon="link" label="Add Link" tone="pink" active={post.link !== null} onPress={() => update({ link: post.link === null ? "" : null })} />
          </View>

          {post.poll ? <PollEditor options={post.poll} max={MAX_POLL_OPTIONS} onChange={(poll) => update({ poll })} onRemove={() => update({ poll: null })} /> : null}
          {locationOpen ? (
            <InlineInput icon="location" tone="blue" label="Location" placeholder="Where are you? e.g. Kelowna, BC" value={post.location} onChangeText={(location) => update({ location })} onRemove={() => { update({ location: "" }); setLocationOpen(false); }} />
          ) : null}
          {post.link !== null ? (
            <InlineInput icon="link" tone="pink" label="Link" placeholder="https://" keyboardType="url" value={post.link} onChangeText={(link) => update({ link })} onRemove={() => update({ link: null })} />
          ) : null}

          {/* ── Post to + visibility ── */}
          <RowTitle
            icon="people"
            title="Post to"
            right={
              <PressableScale onPress={() => setSheet("visibility")} accessibilityLabel={`Who can see it: ${visibilityLabel}. Change`} hitSlop={8} scaleTo={0.95} style={{ flexDirection: "row", alignItems: "center", gap: 5, minHeight: 32 }}>
                <Ionicons name={post.visibility === "members" ? "lock-closed-outline" : "globe-outline"} size={16} color={theme.accent} />
                <Txt style={{ fontFamily: font.semibold, fontSize: 13, lineHeight: 17, color: theme.accent }}>{visibilityLabel}</Txt>
                <Ionicons name="chevron-down" size={14} color={theme.accent} />
              </PressableScale>
            }
          />
          <PressableScale
            onPress={() => (communities.length ? setSheet("community") : router.push("/explore"))}
            accessibilityLabel={community ? `Posting to ${community.name}. Change community` : "Find a community to join"}
            scaleTo={0.98}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 7, paddingRight: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }}
          >
            {community ? (
              <>
                <CommunityAvatar community={community} size={38} />
                <View style={{ flex: 1 }}>
                  <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 14, lineHeight: 18, color: theme.ink }}>{community.name}</Txt>
                  <Txt style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>{compactNumber(community.memberCount)} members</Txt>
                </View>
                <Ionicons name="chevron-down" size={18} color={theme.muted} />
              </>
            ) : (
              <>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.tints.violet, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="compass-outline" size={20} color={theme.violet} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontFamily: font.bold, fontSize: 14, lineHeight: 18, color: theme.ink }}>{meQuery.isPending ? "Loading your communities…" : "Join a community first"}</Txt>
                  <Txt style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>Posts live inside communities. Find one you like.</Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.muted} />
              </>
            )}
          </PressableScale>

          {/* ── Tags ── */}
          <RowTitle emoji="#" title="Tags" subtitle="Add tags to help more people find your post." />
          <TagChips
            chosen={post.tags}
            suggestions={(suggestions.data ?? []).slice(0, 5)}
            onToggle={(tag) => update({ tags: post.tags.some((t) => t.toLowerCase() === tag.toLowerCase()) ? post.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()) : addTag(post.tags, tag) })}
            onAdd={() => setSheet("tag")}
          />

          {/* ── More Options ── */}
          <PressableScale
            onPress={() => setMoreOpen((o) => !o)}
            accessibilityLabel="More options"
            accessibilityHint="Title, content warning, comments, scheduling and drafts"
            accessibilityState={{ expanded: moreOpen }}
            scaleTo={0.98}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.surfaceAlt, marginTop: 2 }}
          >
            <Ionicons name="settings-outline" size={22} color={theme.ink} />
            <View style={{ flex: 1 }}>
              <Txt style={{ fontFamily: font.bold, fontSize: 13, lineHeight: 17, color: theme.ink }}>More Options</Txt>
              <Txt style={{ fontFamily: font.regular, fontSize: 10.5, lineHeight: 14, color: theme.muted }}>Comments, sharing, and advanced settings</Txt>
            </View>
            <Ionicons name={moreOpen ? "chevron-down" : "chevron-forward"} size={17} color={theme.muted} />
          </PressableScale>

          {moreOpen ? (
            <View style={{ gap: 10, paddingHorizontal: 2 }}>
              <Field label="Title (optional)" value={post.title} onChangeText={(title) => update({ title })} maxLength={120} placeholder="We'll use your first line if you leave this empty" />
              <Field label="Content warning (optional)" value={post.warning} onChangeText={(warning) => update({ warning })} maxLength={120} placeholder="e.g. spoilers" />
              <ToggleRow label="Allow comments" value={!post.commentsOff} onChange={(on) => update({ commentsOff: !on })} />
              <ToggleRow label="Schedule for later" hint="Posts can be scheduled up to 60 days ahead." value={scheduleOn} onChange={(on) => { setScheduleOn(on); if (!on) chooseTime(null); }} />
              {scheduleOn ? (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {presets.map((p) => {
                      const on = !customTime && post.publishAt === p.iso;
                      return <Pill key={p.key} label={p.label} size="md" tone={on ? "violet" : "neutral"} variant={on ? "solid" : "tint"} onPress={() => chooseTime(p.iso)} accessibilityLabel={`${p.label}${on ? ", chosen" : ""}`} />;
                    })}
                  </View>
                  <Field
                    value={customTime}
                    onChangeText={(text) => {
                      setCustomTime(text);
                      update({ publishAt: text.trim() ? parseLocalDateTime(text) : null });
                    }}
                    placeholder="Or type a time: 2026-10-31 19:30"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {post.publishAt ? <Txt variant="small" tone="accent">Goes live {formatDateTime(post.publishAt)}</Txt> : null}
                </View>
              ) : null}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button label="Save draft" variant="secondary" small style={{ flex: 1 }} busy={busy === "draft"} onPress={() => void saveDraft()} />
                <Button label="Drafts" variant="secondary" small style={{ flex: 1 }} onPress={() => (community ? setSheet("drafts") : setProblem("Join a community first; drafts are kept per community."))} />
              </View>
              <View style={{ gap: 6 }}>
                <Txt variant="caption" tone="muted">More post types</Txt>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {MORE_TYPES.map((t) => (
                    <Pill
                      key={t.type}
                      label={t.label}
                      emoji={t.emoji}
                      size="md"
                      tone="neutral"
                      onPress={() => (community ? router.push(`/community/${community.slug}/compose?type=${t.type}` as never) : setProblem("Join a community first."))}
                      accessibilityLabel={`New ${t.label.toLowerCase()}`}
                    />
                  ))}
                </View>
              </View>
            </View>
          ) : null}

          {problem ? (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 10, borderRadius: 12, backgroundColor: theme.tints.red }}>
              <Ionicons name="alert-circle" size={17} color={theme.danger} />
              <Txt style={{ flex: 1, fontFamily: font.semibold, fontSize: 12.5, lineHeight: 17, color: theme.danger }}>{problem}</Txt>
            </View>
          ) : null}

          <GradientButton label={publishLabel} gradient="publish" icon="paper-plane" full busy={busy === "publish"} onPress={() => void publish()} style={{ height: 33, marginTop: 2 }} />

          {outcome ? (
            <PressableScale
              onPress={() => (outcome.href ? router.push(outcome.href as never) : setOutcome(null))}
              accessibilityLabel={`${outcome.title} ${outcome.text}${outcome.href ? ". Open the post" : ""}`}
              scaleTo={0.98}
              style={{ flexDirection: "row", gap: 10, alignItems: "center", padding: 12, borderRadius: 14, backgroundColor: outcome.kind === "held" ? theme.tints.orange : outcome.kind === "scheduled" ? theme.tints.blue : theme.tints.green }}
            >
              <Ionicons name={outcome.kind === "held" ? "hourglass-outline" : outcome.kind === "scheduled" ? "time-outline" : "checkmark-circle"} size={22} color={outcome.kind === "held" ? theme.toneText.orange : outcome.kind === "scheduled" ? theme.toneText.blue : theme.toneText.green} />
              <View style={{ flex: 1 }}>
                <Txt style={{ fontFamily: font.bold, fontSize: 13.5, lineHeight: 18, color: theme.ink }}>{outcome.title}</Txt>
                <Txt style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.text }}>{outcome.text}</Txt>
              </View>
              {outcome.href ? <Ionicons name="chevron-forward" size={17} color={theme.muted} /> : null}
            </PressableScale>
          ) : null}
        </View>
      </ScrollView>

      {/* ── Sheets ── */}
      <Sheet visible={sheet === "community"} title="Post to" onClose={() => setSheet(null)}>
        <CommunityList communities={communities} value={community?.slug ?? null} onPick={(s) => { setSlug(s); setSheet(null); }} />
      </Sheet>

      <Sheet visible={sheet === "visibility"} title="Who can see it?" onClose={() => setSheet(null)}>
        <OptionRow icon="globe-outline" title="Public" text="Anyone who can see the community." selected={post.visibility === "public"} onPress={() => { update({ visibility: "public" }); setSheet(null); }} />
        <OptionRow icon="lock-closed-outline" title="Members only" text={`Only members of ${community?.name ?? "the community"}.`} selected={post.visibility === "members"} onPress={() => { update({ visibility: "members" }); setSheet(null); }} />
      </Sheet>

      <Sheet visible={sheet === "tag"} title="Add a tag" onClose={() => setSheet(null)}>
        <Field value={tagText} onChangeText={setTagText} placeholder="#FanArt" autoCapitalize="none" autoCorrect={false} maxLength={31} autoFocus onSubmitEditing={() => { update({ tags: addTag(post.tags, tagText) }); setTagText(""); setSheet(null); }} />
        <Txt variant="small" tone="muted">Letters and numbers only. Up to 10 tags per post.</Txt>
        <GradientButton label="Add tag" icon="add" full onPress={() => { update({ tags: addTag(post.tags, tagText) }); setTagText(""); setSheet(null); }} />
      </Sheet>

      <Sheet visible={sheet === "drafts"} title="Your drafts" onClose={() => setSheet(null)}>
        {drafts.isPending ? (
          <Txt tone="muted">Loading your drafts…</Txt>
        ) : drafts.data?.length ? (
          drafts.data.map((d) => (
            <OptionRow
              key={d.id}
              icon={d.content.type === "poll" ? "stats-chart-outline" : d.content.type === "image" ? "image-outline" : d.content.type === "link" ? "link-outline" : "document-text-outline"}
              title={d.content.title || d.content.body.split("\n")[0] || "Untitled"}
              text={`${isQuickDraft(d.content) ? "" : "Opens in the full editor · "}saved ${new Date(d.updatedAt).toLocaleDateString()}`}
              onPress={() => openDraft(d)}
              right={<Ionicons name="chevron-forward" size={17} color={theme.muted} />}
            />
          ))
        ) : (
          <Txt tone="muted">{`No drafts in ${community?.name ?? "this community"} yet. Tap “Save draft” to keep one for later.`}</Txt>
        )}
      </Sheet>

      <StartRoomSheet visible={sheet === "room"} onClose={() => setSheet(null)} initialSlug={community?.slug} />
      <EventSheet visible={sheet === "event"} onClose={() => setSheet(null)} initialSlug={community?.slug} />
    </KeyboardAvoidingView>
  );
}

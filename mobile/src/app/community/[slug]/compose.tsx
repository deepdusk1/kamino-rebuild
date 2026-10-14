import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { api } from "@/api/endpoints";
import type { Draft, DraftContent } from "@/api/models";
import { MAX_ALBUM_EXTRAS, type PostType } from "@/api/types";
import { GradientButton, Pill } from "@/components/k";
import { ToggleRow as KToggleRow } from "@/components/create/parts";
import { Button, Card, Field, Screen, Sheet, Txt } from "@/components/ui";
import { showError, useAction } from "@/lib/errors";
import { pickPhoto } from "@/lib/media";
import { MAX_TIME_LIMIT, MIN_TIME_LIMIT, albumFor, blankQuestion, buildPayload, emptyContent, questionImagesFor, validateContent } from "@/lib/compose";
import { uuid } from "@/lib/uuid";
import { font, radius, space, useTheme } from "@/theme";
import { withCommunityTheme } from "@/components/CommunityTheme";
import { tellIfHeld } from "@/lib/held";

/** Extra pictures beyond the cover (the server allows the same). */

const TYPES: { type: PostType; label: string; hint: string }[] = [
  { type: "blog", label: "Blog", hint: "Write something longer." },
  { type: "image", label: "Image", hint: "Share a picture with a caption." },
  { type: "question", label: "Question", hint: "Ask the community." },
  { type: "link", label: "Link", hint: "Share a web page." },
  { type: "poll", label: "Poll", hint: "Let people vote." },
  { type: "quiz", label: "Quiz", hint: "Test what people know." },
  { type: "wiki", label: "Wiki", hint: "A lasting page for the community library." },
  { type: "story", label: "Story", hint: "Pictures with short captions that disappear after 24 hours." },
];

function Compose() {
  const theme = useTheme();
  // `?type=story` (or quiz, wiki, poll…) opens the editor on that kind of post (the Create tab links here).
  const { slug, type: typeParam } = useLocalSearchParams<{ slug: string; type?: string }>();
  const queryClient = useQueryClient();
  const page = useQuery({ queryKey: ["community", slug], queryFn: () => api.community(slug!), enabled: !!slug });
  const categories = useQuery({ queryKey: ["wikiCategories", slug], queryFn: () => api.wikiCategories(slug!), enabled: !!slug });
  const drafts = useQuery({ queryKey: ["drafts", slug], queryFn: () => api.drafts(slug!), enabled: !!slug });

  const [content, setContent] = useState<DraftContent>(() => emptyContent(TYPES.some((t) => t.type === typeParam) ? (typeParam as PostType) : "blog"));
  const [category, setCategory] = useState("");
  const [draftsOpen, setDraftsOpen] = useState(false);
  // Which saved draft is open (if any). The revision lets the server refuse a stale overwrite.
  const draftRef = useRef<{ id: string; revision: number } | null>(null);

  const isLeader = !!page.data?.member && ["leader", "agent"].includes(page.data.member.role);
  const update = (patch: Partial<DraftContent>) => setContent((c) => ({ ...c, ...patch }));

  const choosePhoto = async () => {
    try {
      const image = await pickPhoto("library", 1_800_000);
      if (image) update({ image });
    } catch (error) {
      showError(error, "Couldn't add the picture");
    }
  };

  const album = content.album ?? [];
  const addAlbumPhoto = async () => {
    try {
      const image = await pickPhoto("library", 1_800_000);
      if (image) setContent((c) => ({ ...c, album: [...(c.album ?? []), image].slice(0, MAX_ALBUM_EXTRAS) }));
    } catch (error) {
      showError(error, "Couldn't add the picture");
    }
  };
  // Removing the cover promotes the next album picture, so an album never loses its first picture.
  const removeCover = () => setContent((c) => ({ ...c, image: c.album?.[0] ?? "", album: c.album?.slice(1), captions: c.captions?.slice(1) }));
  // A story's scene captions follow their pictures when a picture is removed (scene n + 2 is album picture n).
  const removeAlbumPhoto = (n: number) =>
    setContent((c) => ({ ...c, album: (c.album ?? []).filter((_, i) => i !== n), captions: c.captions?.filter((_, i) => i !== n + 1) }));
  const setCaption = (scene: number, text: string) =>
    setContent((c) => {
      const next = [...(c.captions ?? [])];
      while (next.length <= scene) next.push("");
      next[scene] = text;
      return { ...c, captions: next };
    });
  const chooseQuestionPhoto = async (index: number) => {
    try {
      const image = await pickPhoto("library", 1_800_000);
      if (image) setQuestion(index, { image });
    } catch (error) {
      showError(error, "Couldn't add the picture");
    }
  };

  // Saves the draft to the account. `lastSaved` remembers what the server already has, so nothing is sent twice.
  const savingRef = useRef(false);
  const publishedRef = useRef(false);
  const lastSaved = useRef(JSON.stringify(content));
  const persist = useCallback(
    async (toSave: DraftContent) => {
      const snapshot = JSON.stringify(toSave);
      const current = draftRef.current ?? { id: uuid(), revision: 0 };
      const saved = await api.saveDraft({ id: current.id, slug: slug!, revision: current.revision, content: toSave });
      draftRef.current = { id: saved.id, revision: saved.revision };
      lastSaved.current = snapshot;
      await queryClient.invalidateQueries({ queryKey: ["drafts", slug] });
    },
    [slug, queryClient],
  );

  const [saveDraft, savingDraft] = useAction(async () => {
    if (!content.title.trim() && !content.body.trim()) throw new Error("Write something first, then save it as a draft.");
    while (savingRef.current) await new Promise((resolve) => setTimeout(resolve, 100)); // let an autosave finish first
    savingRef.current = true;
    try {
      await persist(content);
    } finally {
      savingRef.current = false;
    }
    Alert.alert("Draft saved", "You can find it under Drafts.");
  });

  // Autosave: a few seconds after you stop typing, the draft is saved quietly. Errors stay quiet too,
  // so typing is never interrupted; the Save draft button still shows them.
  const isMember = page.data?.member?.status === "active";
  useEffect(() => {
    if (!isMember || publishedRef.current) return;
    if (JSON.stringify(content) === lastSaved.current) return;
    if (!content.title.trim() && !content.body.trim() && !content.image) return;
    const timer = setTimeout(() => {
      if (savingRef.current || publishedRef.current) return;
      savingRef.current = true;
      persist(content)
        .catch(() => undefined)
        .finally(() => {
          savingRef.current = false;
        });
    }, 5000);
    return () => clearTimeout(timer);
  }, [content, isMember, persist]);

  const [publish, publishing] = useAction(async () => {
    const problem = validateContent(content);
    if (problem) throw new Error(problem);
    while (savingRef.current) await new Promise((resolve) => setTimeout(resolve, 100)); // never race an autosave
    publishedRef.current = true;
    const created = await api.createPost({
      slug: slug!,
      type: content.type,
      title: content.title.trim(),
      body: content.body,
      cover: content.image || undefined,
      album: albumFor(content),
      questionImages: questionImagesFor(content),
      payload: buildPayload(content, category),
      contentWarning: content.warning.trim() || undefined,
      commentsDisabled: content.commentsOff || undefined,
      announcement: isLeader && content.announce ? true : undefined,
    });
    // The draft has done its job. If deleting it fails the post is still published, so ignore that error.
    if (draftRef.current) await api.deleteDraft(draftRef.current.id, draftRef.current.revision).catch(() => undefined);
    await queryClient.invalidateQueries();
    tellIfHeld(created);
    router.replace(`/community/${slug}/post/${created.id}`);
  });

  const openDraft = (draft: Draft) => {
    draftRef.current = { id: draft.id, revision: draft.revision };
    const opened = { ...emptyContent(), ...draft.content };
    lastSaved.current = JSON.stringify(opened);
    setContent(opened);
    setDraftsOpen(false);
  };

  const removeDraft = async (draft: Draft) => {
    try {
      await api.deleteDraft(draft.id, draft.revision);
      if (draftRef.current?.id === draft.id) draftRef.current = null;
      await queryClient.invalidateQueries({ queryKey: ["drafts", slug] });
    } catch (error) {
      showError(error);
    }
  };

  const active = TYPES.find((t) => t.type === content.type)!;
  const needsBody = content.type !== "poll";
  const setQuestion = (index: number, patch: Partial<DraftContent["questions"][number]>) =>
    update({ questions: content.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)) });

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, color: theme.ink }}>{page.data?.community.name ? `Post in ${page.data.community.name}` : "New post"}</Txt>
        <Txt variant="small" tone="muted">{active.hint}</Txt>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {TYPES.map((t) => (
          <Pill
            key={t.type}
            label={t.label}
            size="md"
            tone={content.type === t.type ? "violet" : "neutral"}
            variant={content.type === t.type ? "solid" : "tint"}
            onPress={() => update({ type: t.type })}
            accessibilityLabel={`${t.label}${content.type === t.type ? ", chosen" : ""}`}
          />
        ))}
      </View>

      <Field label="Title" value={content.title} onChangeText={(title) => update({ title })} maxLength={120} placeholder="What's this about?" />

      {(content.type === "image" || content.type === "story") && (
        <View style={{ gap: space.sm }}>
          {content.image ? (
            <Image source={{ uri: content.image }} style={{ height: 220, borderRadius: radius.lg }} contentFit="cover" accessibilityLabel="Chosen picture" />
          ) : null}
          <Button label={content.image ? "Change picture" : "Choose picture"} variant="secondary" onPress={() => void choosePhoto()} />
          {content.image ? <Button label="Remove picture" variant="ghost" small onPress={removeCover} /> : null}
          {(content.type === "image" || content.type === "story") && content.image ? (
            <View style={{ gap: space.sm }}>
              <Txt variant="label" tone="subtle">{content.type === "story" ? "Scenes" : "Album"} ({album.length + 1}/{MAX_ALBUM_EXTRAS + 1} pictures)</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {album.map((picture, i) => (
                  <Pressable key={i} onPress={() => removeAlbumPhoto(i)} accessibilityRole="button" accessibilityLabel={`Remove album picture ${i + 2}`}>
                    <Image source={{ uri: picture }} style={{ width: 72, height: 72, borderRadius: radius.md }} contentFit="cover" />
                    <View style={{ position: "absolute", top: -6, right: -6, backgroundColor: theme.danger, borderRadius: 10, width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="close" size={14} color="#fff" />
                    </View>
                  </Pressable>
                ))}
              </View>
              {album.length < MAX_ALBUM_EXTRAS ? <Button label={content.type === "story" ? "Add another scene" : "Add another picture"} variant="secondary" small onPress={() => void addAlbumPhoto()} style={{ alignSelf: "flex-start" }} /> : null}
              {content.type === "story" ? (
                <View style={{ gap: space.sm }}>
                  <Txt variant="caption" tone="muted">A short caption for each scene (optional).</Txt>
                  {Array.from({ length: album.length + 1 }, (_, n) => (
                    <Field key={n} value={content.captions?.[n] ?? ""} onChangeText={(text) => setCaption(n, text)} maxLength={140} placeholder={`Scene ${n + 1} caption`} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      {content.type === "link" && (
        <Field label="Link" value={content.url} onChangeText={(url) => update({ url })} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" />
      )}

      {needsBody && (
        <Field
          label={content.type === "question" ? "Details" : content.type === "wiki" ? "Page content" : "Text"}
          hint="You can use **bold**, *italic*, # headings and - lists."
          value={content.body}
          onChangeText={(body) => update({ body })}
          multiline
          maxLength={8000}
          style={{ minHeight: content.type === "blog" || content.type === "wiki" ? 200 : 110 }}
          placeholder="Write here…"
        />
      )}

      {content.type === "poll" && (
        <Card>
          <Txt variant="heading">Poll options</Txt>
          {content.opts.map((option, i) => (
            <Field key={i} value={option} onChangeText={(text) => update({ opts: content.opts.map((o, j) => (j === i ? text : o)) })} maxLength={200} placeholder={`Option ${i + 1}${i < 2 ? "" : " (optional)"}`} />
          ))}
        </Card>
      )}

      {content.type === "quiz" && (
        <View style={{ gap: space.md }}>
          <Field
            label="Time limit in seconds (optional)"
            hint={`Leave empty for no limit. ${MIN_TIME_LIMIT} to ${MAX_TIME_LIMIT} seconds for the whole quiz; the clock starts when a player presses Start.`}
            value={content.timeLimitSec ? String(content.timeLimitSec) : ""}
            onChangeText={(text) => update({ timeLimitSec: text.replace(/\D/g, "") ? Number(text.replace(/\D/g, "")) : undefined })}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="e.g. 120"
          />
          {content.questions.map((q, qi) => (
            <Card key={qi}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Txt variant="heading">Question {qi + 1}</Txt>
                {content.questions.length > 1 ? (
                  <Pressable onPress={() => update({ questions: content.questions.filter((_, i) => i !== qi) })} accessibilityRole="button" accessibilityLabel={`Remove question ${qi + 1}`} hitSlop={10}>
                    <Ionicons name="trash-outline" size={20} color={theme.danger} />
                  </Pressable>
                ) : null}
              </View>
              <Field value={q.q} onChangeText={(text) => setQuestion(qi, { q: text })} maxLength={500} placeholder="Ask something…" />
              {q.image ? (
                <View>
                  <Image source={{ uri: q.image }} style={{ height: 140, borderRadius: radius.md }} contentFit="contain" accessibilityLabel={`Picture for question ${qi + 1}`} />
                  <Button label="Remove picture" variant="ghost" small onPress={() => setQuestion(qi, { image: undefined })} style={{ alignSelf: "flex-start" }} />
                </View>
              ) : (
                <Button label="Add a picture" variant="secondary" small onPress={() => void chooseQuestionPhoto(qi)} style={{ alignSelf: "flex-start" }} />
              )}
              <Txt variant="caption" tone="muted">Tap the circle next to the correct answer.</Txt>
              {q.choices.map((choice, ci) => (
                <View key={ci} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <Pressable onPress={() => setQuestion(qi, { answer: ci })} accessibilityRole="radio" accessibilityState={{ selected: q.answer === ci }} accessibilityLabel={`Mark answer ${ci + 1} as correct`} hitSlop={8}>
                    <Ionicons name={q.answer === ci ? "radio-button-on" : "radio-button-off"} size={26} color={theme.accent} />
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Field value={choice} onChangeText={(text) => setQuestion(qi, { choices: q.choices.map((c, j) => (j === ci ? text : c)) })} maxLength={200} placeholder={`Answer ${ci + 1}`} />
                  </View>
                </View>
              ))}
            </Card>
          ))}
          {content.questions.length < 30 ? (
            <Button label="Add a question" variant="secondary" small onPress={() => update({ questions: [...content.questions, blankQuestion()] })} />
          ) : null}
        </View>
      )}

      {content.type === "wiki" && (categories.data?.length ?? 0) > 0 && (
        <View style={{ gap: space.sm }}>
          <Txt variant="label" tone="subtle">Category</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {categories.data!.map((path) => (
              <Pill key={path} label={path.split("/").join(" › ")} size="md" tone={category === path ? "violet" : "neutral"} variant={category === path ? "solid" : "tint"} onPress={() => setCategory(category === path ? "" : path)} />
            ))}
          </View>
        </View>
      )}

      <Field label="Content warning (optional)" value={content.warning} onChangeText={(warning) => update({ warning })} maxLength={120} placeholder="e.g. spoilers" />

      <Card>
        <ToggleRow label="Turn off comments" value={content.commentsOff} onChange={(commentsOff) => update({ commentsOff })} />
        {isLeader ? <ToggleRow label="Pin as an announcement" value={content.announce} onChange={(announce) => update({ announce })} /> : null}
      </Card>

      <View style={{ gap: space.sm }}>
        <GradientButton label={content.type === "wiki" ? "Create wiki page" : "Publish Post"} gradient="publish" icon="paper-plane" size="lg" full onPress={() => void publish()} busy={publishing} />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button label="Save draft" variant="secondary" style={{ flex: 1 }} onPress={() => void saveDraft()} busy={savingDraft} />
          <Button label={`Drafts${drafts.data?.length ? ` (${drafts.data.length})` : ""}`} variant="secondary" style={{ flex: 1 }} onPress={() => setDraftsOpen(true)} />
        </View>
      </View>

      <Sheet visible={draftsOpen} title="Your drafts" onClose={() => setDraftsOpen(false)}>
        {drafts.data?.length ? (
          drafts.data.map((d) => (
            <Card key={d.id} onPress={() => openDraft(d)} accessibilityLabel={`Open draft ${d.content.title || "untitled"}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="heading" numberOfLines={1}>{d.content.title || "Untitled"}</Txt>
                  <Txt variant="caption" tone="muted">{d.content.type} · saved {new Date(d.updatedAt).toLocaleDateString()}</Txt>
                </View>
                <Pressable onPress={() => void removeDraft(d)} accessibilityRole="button" accessibilityLabel="Delete draft" hitSlop={10}>
                  <Ionicons name="trash-outline" size={20} color={theme.danger} />
                </Pressable>
              </View>
            </Card>
          ))
        ) : (
          <Txt tone="muted">No drafts in this community yet.</Txt>
        )}
      </Sheet>
    </Screen>
  );
}

function ToggleRow(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <KToggleRow {...props} />;
}

export default withCommunityTheme(Compose);

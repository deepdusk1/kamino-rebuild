import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/api/endpoints";
import { AppHeader } from "@/components/k";
import {
  Screen,
  Card,
  Button,
  Field,
  Txt,
  PressableScale,
} from "@/components/ui";
import { contentApi, type MediaInput } from "@/lib/content-v9";
import { pickContentFile } from "@/lib/content-media";
import { pickPhoto, pickVideo } from "@/lib/media";
import { showError } from "@/lib/errors";
import { useTheme } from "@/theme";
import { notify } from "@/components/community/platform";
import { MediaLibraryPicker } from "@/components/content/MediaLibraryPicker";
import { GifSearch } from "@/components/content/GifSearch";
import { DuplicateCheck } from "@/components/DuplicateCheckV10";

const KINDS = [
  { kind: "video", title: "🎬 Video" },
  { kind: "short", title: "⚡ Short" },
  { kind: "audio", title: "🎧 Audio" },
  { kind: "gif", title: "✨ GIF" },
  { kind: "article", title: "📝 Article" },
  { kind: "story", title: "🌈 Story" },
] as const;
export default function ContentStudio() {
  const theme = useTheme(),
    client = useQueryClient(),
    me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const allowance = useQuery({
    queryKey: ["uploadAllowance"],
    queryFn: contentApi.uploadAllowance,
  });
  const [kind, setKind] = useState<(typeof KINDS)[number]["kind"]>("video"),
    [slug, setSlug] = useState(""),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [media, setMedia] = useState<MediaInput | null>(null),
    [images,setImages]=useState<(MediaInput&{kind:"image"})[]>([]),
    [busy, setBusy] = useState(false),
    [published, setPublished] = useState<{
      id: number;
      slug: string;
      held: boolean;
    } | null>(null);
  const [audience, setAudience] = useState<"public" | "members">("public"),
    [commentRule, setCommentRule] = useState<"members" | "followers" | "none">(
      "members",
    ),
    [sharing, setSharing] = useState(true),
    [warning, setWarning] = useState(""),
    [when, setWhen] = useState("");
  const [scope, setScope] = useState<"community" | "profile">("community"),
    [background, setBackground] = useState("#7548df"),
    [overlay, setOverlay] = useState(""),
    [sticker, setSticker] = useState("✨"),
    [mentions, setMentions] = useState(""),
    [question, setQuestion] = useState(""),
    [poll, setPoll] = useState("");
  const [highlight, setHighlight] = useState(""),
    [selected, setSelected] = useState<number[]>([]),
    [workTitle, setWorkTitle] = useState(""),
    [description, setDescription] = useState(""),
    [url, setUrl] = useState("");
  const owner = me.data?.profile.userId,
    library = useQuery({
      queryKey: ["profileContent", owner],
      queryFn: () => contentApi.profile(owner!),
      enabled: !!owner,
    });
  const chosen = slug || me.data?.joined[0]?.community.id || "";
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await client.invalidateQueries({ queryKey: ["profileContent"] });
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function pick(special?: "image" | "video" | "audio") {
    try {
      const target =
        special ?? (kind === "story" || kind === "article" ? "image" : kind);
      if (target === "image") {
        const dataUrl = await pickPhoto(
          "library",
          allowance.data?.limits.image,
        );
        if (dataUrl){
          const picture:MediaInput&{kind:"image"}={
            kind: "image",
            dataUrl,
            filename: "picture.jpg",
            altText: "",
            captions: "",
          };
          if(kind==="article"){
            if(images.length>=6)throw new Error("Use up to six image blocks per article.");
            setImages(previous=>[...previous,picture]);setBody(previous=>`${previous}\n\n[image:${images.length+1}]`);
          }else setMedia(picture);
        }
      } else if (target === "video" || target === "short") {
        const dataUrl = await pickVideo(
          "library",
          allowance.data?.limits[target],
        );
        if (dataUrl)
          setMedia({
            kind: target,
            dataUrl,
            filename: "video.mp4",
            altText: "",
            captions: "",
          });
      } else {
        const picked = await pickContentFile(
          target,
          target === "gif" ? "image/gif" : "audio/*",
          allowance.data?.limits[target],
        );
        if (picked) setMedia(picked);
      }
    } catch (e) {
      showError(e);
    }
  }
  async function publish() {
    setBusy(true);
    try {
      const r = await contentApi.create({
        slug: chosen,
        title,
        body,
        kind,
        media: media ?? undefined,
        images:kind==="article"?images:[],
        visibility: audience,
        commentRule,
        sharingAllowed: sharing,
        contentWarning: warning,
        publishAt: when ? new Date(when).toISOString() : null,
        story:
          kind === "story"
            ? {
                scope,
                background,
                overlayText: overlay,
                sticker,
                mentions: mentions
                  .split(/[ ,]+/)
                  .map((h) => h.replace(/^@/, ""))
                  .filter(Boolean),
                question,
                pollOptions: poll
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }
            : undefined,
      });
      setPublished(r);
      await client.invalidateQueries();
      notify(
        r.held ? "Waiting for moderator review" : "Creation saved",
        r.held
          ? "A moderator will look at your post."
          : when
            ? "Your post is scheduled."
            : "Your community can now open it.",
      );
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader back />
      <Screen>
        <Button variant="secondary" label="Profile stories · no community needed" onPress={()=>router.push("/profile-stories" as never)}/> 
        <Button variant="secondary" label="Watch short videos" onPress={()=>router.push("/short-videos" as never)}/>
        <Button variant="secondary" label="GIF & music library" onPress={()=>router.push("/media-library" as never)}/>
        <View
          style={{
            gap: 10,
            padding: 20,
            borderRadius: 24,
            backgroundColor: theme.accent,
          }}
        >
          <Txt variant="screen" style={{ color: "#fff" }}>
            Content studio
          </Txt>
          <Txt style={{ color: "#fff" }}>
            Share clips, sounds, articles and interactive stories. Keep
            highlights and showcase your work.
          </Txt>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {KINDS.map((k) => (
            <Button
              key={k.kind}
              small
              label={k.title}
              variant={kind === k.kind ? "primary" : "secondary"}
              onPress={() => {
                setKind(k.kind);
                setMedia(null);
                setImages([]);
                setPublished(null);
              }}
            />
          ))}
        </View>
        <Card>
          <View style={{ gap: 14 }}>
            <Txt variant="heading">Create {kind}</Txt>
            <Txt variant="caption" tone="muted">
              Choose a community
            </Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {me.data?.joined.map((j) => (
                <Button
                  small
                  key={j.community.id}
                  variant={chosen === j.community.id ? "primary" : "secondary"}
                  label={j.community.name}
                  onPress={() => setSlug(j.community.id)}
                />
              ))}
            </View>
            {!me.data?.joined.length ? (
              <Txt tone="muted">
                Join a community in Explore before publishing.
              </Txt>
            ) : null}
            <Field
              label="Title"
              value={title}
              onChangeText={setTitle}
              maxLength={160}
            />
            <Field
              label={kind === "article" ? "Article" : "Description"}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={30000}
              style={{ minHeight: 150 }}
              hint={
                kind === "article"
                  ? "Use headings (#), ||spoiler text|| and up to six images. Move [image:1] markers between paragraphs to place each picture."
                  : undefined
              }
            />
            <Button
              variant="secondary"
              label={kind==="article"?`Add image block (${images.length}/6)`:media ? `Replace ${media.filename}` : "Choose media"}
              onPress={() => void pick()}
            />
            {kind==="article"?images.map((image,index)=><View key={index} style={{gap:8}}><Txt variant="small">Image {index+1}: [image:{index+1}]</Txt><Field label={`Describe image ${index+1}`} value={image.altText??""} maxLength={600} onChangeText={altText=>setImages(previous=>previous.map((item,i)=>i===index?{...item,altText}:item))}/><Button small variant="danger" label={`Remove image ${index+1}`} onPress={()=>{setImages(previous=>previous.filter((_,i)=>i!==index));setBody(previous=>previous.replace(/\[image:(\d+)\]/g,(marker,n)=>Number(n)===index+1?"":Number(n)>index+1?`[image:${Number(n)-1}]`:marker));}}/></View>):null}
            {kind==="gif"?<MediaLibraryPicker kind="gif" onSelect={setMedia}/>:null}
            {kind==="gif"?<GifSearch onSelect={setMedia}/>:null}
            {kind==="audio"?<MediaLibraryPicker kind="audio" onSelect={setMedia}/>:null}
            {kind === "story" ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Button
                  small
                  variant="secondary"
                  label="Video story"
                  onPress={() => void pick("video")}
                />
                <Button
                  small
                  variant="secondary"
                  label="Music story"
                  onPress={() => void pick("audio")}
                />
                <Txt variant="caption" tone="muted">
                  Media is optional for a text story.
                </Txt>
              </View>
            ) : null}
            {media ? (
              <>
                <Field
                  label="Alt text / description"
                  value={media.altText ?? ""}
                  onChangeText={(value) =>
                    setMedia({ ...media, altText: value })
                  }
                  maxLength={600}
                />
                {["video", "short", "audio"].includes(media.kind) ? (
                  <Field
                    label="Captions / transcript"
                    value={media.captions ?? ""}
                    onChangeText={(value) =>
                      setMedia({ ...media, captions: value })
                    }
                    maxLength={12000}
                    multiline
                  />
                ) : null}
                <Button
                  small
                  variant="ghost"
                  label="Remove media"
                  onPress={() => setMedia(null)}
                />
              </>
            ) : null}
            {kind === "story" ? (
              <View
                style={{
                  gap: 12,
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: theme.surfaceAlt,
                }}
              >
                <Txt variant="heading">Story overlays & interactions</Txt>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["community", "profile"] as const).map((s) => (
                    <Button
                      small
                      key={s}
                      variant={scope === s ? "primary" : "secondary"}
                      label={s === "profile" ? "My profile" : "Community"}
                      onPress={() => setScope(s)}
                    />
                  ))}
                </View>
                <Txt variant="caption" tone="muted">
                  Stories keep this community&apos;s access rules and expire
                  after 24 hours. Highlights preserve them on your profile.
                </Txt>
                <Field
                  label="Story text"
                  value={overlay}
                  onChangeText={setOverlay}
                  maxLength={400}
                  multiline
                />
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {["#7548df", "#245ee9", "#15865c", "#be4d7a", "#2d2639"].map(
                    (c) => (
                      <PressableScale
                        accessibilityLabel={`Background ${c}`}
                        accessibilityState={{ selected: background === c }}
                        key={c}
                        onPress={() => setBackground(c)}
                        style={{
                          height: 44,
                          width: 44,
                          borderRadius: 22,
                          backgroundColor: c,
                          borderWidth: background === c ? 3 : 0,
                          borderColor: theme.ink,
                        }}
                      >
                        <View />
                      </PressableScale>
                    ),
                  )}
                </View>
                <Field
                  label="Sticker / emoji"
                  value={sticker}
                  onChangeText={setSticker}
                  maxLength={32}
                />
                <Field
                  label="Mention stickers"
                  value={mentions}
                  onChangeText={setMentions}
                  placeholder="@mira @jun"
                />
                <Field
                  label="Question sticker"
                  value={question}
                  onChangeText={setQuestion}
                  maxLength={200}
                />
                <Field
                  label="Poll choices (2–4, one per line)"
                  value={poll}
                  onChangeText={setPoll}
                  multiline
                />
              </View>
            ) : null}
            <Txt variant="heading">Audience & permissions</Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(["public", "members"] as const).map((a) => (
                <Button
                  small
                  key={a}
                  label={a === "public" ? "Community readers" : "Members only"}
                  variant={audience === a ? "primary" : "secondary"}
                  onPress={() => setAudience(a)}
                />
              ))}
            </View>
            <Txt variant="caption" tone="muted">
              Who can comment
            </Txt>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(["members", "followers", "none"] as const).map((c) => (
                <Button
                  small
                  key={c}
                  label={c === "none" ? "Closed" : c}
                  variant={commentRule === c ? "primary" : "secondary"}
                  onPress={() => setCommentRule(c)}
                />
              ))}
            </View>
            <Button
              small
              variant="secondary"
              label={
                sharing
                  ? "Sharing allowed · Turn off"
                  : "Sharing disabled · Turn on"
              }
              onPress={() => setSharing(!sharing)}
            />
            <Field
              label="Content warning"
              value={warning}
              onChangeText={setWarning}
              maxLength={160}
            />
            <Field
              label="Schedule (optional)"
              hint="Example: 2026-10-05T18:30"
              value={when}
              onChangeText={setWhen}
              autoCapitalize="none"
            />
            <DuplicateCheck communityId={chosen} text={title+'\n'+body}/>
            <Button
              busy={busy}
              disabled={!chosen || title.trim().length < 3}
              label={when ? "Schedule" : "Publish"}
              onPress={() => void publish()}
            />
            {published ? (
              <Button
                variant="secondary"
                label="Open your creation"
                onPress={() =>
                  router.push(
                    `/community/${published.slug}/post/${published.id}`,
                  )
                }
              />
            ) : null}
          </View>
        </Card>
        <Card>
          <View style={{ gap: 12 }}>
            <Txt variant="heading">Story highlights</Txt>
            <Field
              label="Collection title"
              value={highlight}
              onChangeText={setHighlight}
              maxLength={40}
            />
            {library.data?.media
              .filter((m) => m.type === "story")
              .map((m) => (
                <Button
                  key={m.id}
                  small
                  variant={selected.includes(m.id) ? "primary" : "secondary"}
                  label={m.title}
                  onPress={() =>
                    setSelected(
                      selected.includes(m.id)
                        ? selected.filter((id) => id !== m.id)
                        : [...selected, m.id],
                    )
                  }
                />
              ))}
            <Button
              disabled={busy || !highlight.trim() || !selected.length}
              label="Save highlight"
              onPress={() =>
                void run(() => contentApi.highlight(highlight, selected))
              }
            />
            {library.data?.highlights.map((h) => (
              <View key={h.id} style={{ gap: 6 }}>
                <Txt>
                  {h.title} · {h.postIds.length} stories
                </Txt>
                <Button
                  small
                  variant="danger"
                  label="Remove highlight"
                  onPress={() =>
                    void run(() => contentApi.removeProfile("highlight", h.id))
                  }
                />
              </View>
            ))}
          </View>
        </Card>
        <Card>
          <View style={{ gap: 12 }}>
            <Txt variant="heading">Your portfolio</Txt>
            <Field
              label="Project title"
              value={workTitle}
              onChangeText={setWorkTitle}
            />
            <Field
              label="Description"
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <Field
              label="Project link"
              placeholder="https://"
              autoCapitalize="none"
              value={url}
              onChangeText={setUrl}
            />
            <Button
              disabled={busy || workTitle.trim().length < 3}
              label="Add project"
              onPress={() =>
                void run(() =>
                  contentApi.portfolio(
                    workTitle,
                    description,
                    url || undefined,
                  ),
                )
              }
            />
            {library.data?.portfolio.map((p) => (
              <View key={p.id} style={{ gap: 6 }}>
                <Txt variant="heading">{p.title}</Txt>
                <Button
                  small
                  variant="danger"
                  label="Remove project"
                  onPress={() =>
                    void run(() => contentApi.removeProfile("portfolio", p.id))
                  }
                />
              </View>
            ))}
          </View>
        </Card>
      </Screen>
    </View>
  );
}

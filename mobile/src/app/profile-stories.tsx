import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  Screen,
  Card,
  Txt,
  Button,
  Field,
  Chip,
  Loading,
} from "@/components/ui";
import { ContentMedia } from "@/components/content/ContentMedia";
import { StoryLayerEditor, StoryLayers } from "@/components/content/StoryLayerEditor";
import { MediaLibraryPicker } from "@/components/content/MediaLibraryPicker";
import type { StoryLayer } from "@/api/media-v10-types";
import { stories, type ProfileStory } from "@/api/profile-stories";
import type { MediaInput } from "@/lib/content-v9";
import { pickContentFile } from "@/lib/content-media";
import { showError } from "@/lib/errors";
import { confirmAction, notify } from "@/components/community/platform";
export default function ProfileStories() {
  const { userId } = useLocalSearchParams<{ userId?: string }>(),
    q = useQuery({
      queryKey: ["profileStories", userId ?? "me"],
      queryFn: () => stories.list(userId),
    });
  return (
    <Screen>
      <Txt variant="title">
        {q.data && !q.data.mine
          ? `${q.data.displayName}’s stories`
          : "Profile stories"}
      </Txt>
      <Txt tone="muted">
        Share a moment from your profile. Stories last 24 hours; highlights stay
        until you remove them.
      </Txt>
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <Txt tone="danger">{q.error.message}</Txt>
      ) : q.data ? (
        <>
          {q.data.mine ? <Composer /> : null}
          {q.data.stories.length ? (
            q.data.stories.map((s) => (
              <StoryCard key={s.id} story={s} mine={q.data.mine} />
            ))
          ) : (
            <Card>
              <Txt tone="muted">No stories to show yet.</Txt>
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}
function Composer() {
  const client = useQueryClient(),
    [caption, setCaption] = useState(""),
    [audience, setAudience] = useState<
      "public" | "followers" | "close_friends"
    >("public"),
    [background, setBackground] = useState<
      "violet" | "ocean" | "rose" | "midnight"
    >("violet"),
    [age, setAge] = useState<13 | 16 | 18>(13),
    [warning, setWarning] = useState(""),
    [question, setQuestion] = useState(""),
    [poll, setPoll] = useState(""),
    [layers,setLayers]=useState<StoryLayer[]>([]),
    [media, setMedia] = useState<MediaInput | null>(null),
    [music,setMusic]=useState<(MediaInput&{kind:"audio"})|null>(null),
    [busy, setBusy] = useState(false);
  async function pick(kind: "image" | "gif" | "video" | "audio") {
    setBusy(true);
    try {
      const picked = await pickContentFile(
        kind,
        kind === "gif" ? "image/gif" : `${kind}/*`,
      );
      if (picked){if(kind==="audio")setMusic({...picked,kind:"audio"});else setMedia(picked);}
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    try {
      await stories.publish({
        caption,
        audience,
        background,
        minimumAge: age,
        contentWarning: warning,
        question,
        pollOptions: poll
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean),
        media: media ?? undefined,
        music:music??undefined,
        layers,
      });
      setCaption("");
      setMedia(null);
      setMusic(null);
      setQuestion("");
      setPoll("");
      setLayers([]);
      await client.invalidateQueries({ queryKey: ["profileStories"] });
      notify("Story published", "Your story is live for 24 hours.");
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Txt variant="heading">Share a moment</Txt>
      <Field
        label="Story text"
        value={caption}
        onChangeText={setCaption}
        maxLength={1500}
        multiline
        placeholder="What’s happening in your world?"
      />
      <Txt>Who can see it</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["public", "followers", "close_friends"] as const).map((a) => (
          <Chip
            key={a}
            label={
              a === "public"
                ? "Everyone"
                : a === "followers"
                  ? "Followers"
                  : "Close friends"
            }
            selected={a === audience}
            onPress={() => setAudience(a)}
          />
        ))}
      </View>
      <Txt tone="muted" variant="small">
        A private profile stays visible to approved followers. Manage close
        friends in Privacy.
      </Txt>
      <Txt>Background</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["violet", "ocean", "rose", "midnight"] as const).map((b) => (
          <Chip
            key={b}
            label={b}
            selected={b === background}
            onPress={() => setBackground(b)}
          />
        ))}
      </View>
      <Txt>Age rating</Txt>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {([13, 16, 18] as const).map((a) => (
          <Chip
            key={a}
            label={`${a}+`}
            selected={a === age}
            onPress={() => setAge(a)}
          />
        ))}
      </View>
      <Field
        label="Content note"
        value={warning}
        onChangeText={setWarning}
        maxLength={120}
        placeholder="Optional, such as flashing lights"
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["image", "gif", "video", "audio"] as const).map((k) => (
          <Button
            key={k}
            small
            variant="secondary"
            label={
              k === "image"
                ? "Photo"
                : k === "audio"
                  ? "Music"
                  : k === "gif"
                    ? "GIF"
                    : "Video"
            }
            disabled={busy}
            onPress={() => void pick(k)}
          />
        ))}
      </View>
      <Txt variant="small" tone="muted">
        Photos up to 2 MB, GIFs 4 MB, video 12 MB and audio 8 MB. Share media
        you have permission to use.
      </Txt>
      {media ? (
        <>
          <Txt>{media.filename}</Txt>
          <Field
            label="Media description"
            value={media.altText ?? ""}
            onChangeText={(v) => setMedia({ ...media, altText: v })}
            maxLength={600}
          />
          <Field
            label="Captions or transcript"
            value={media.captions ?? ""}
            onChangeText={(v) => setMedia({ ...media, captions: v })}
            multiline
            maxLength={12000}
          />
          <Button
            small
            variant="ghost"
            label="Remove attachment"
            onPress={() => setMedia(null)}
          />
        </>
      ) : null}
      <Field
        label="Question (optional)"
        value={question}
        onChangeText={setQuestion}
        maxLength={200}
      />
      <Field
        label="Poll choices, one per line"
        value={poll}
        onChangeText={setPoll}
        maxLength={324}
        multiline
        placeholder="Two to four choices"
      />
      <Button
        label="Publish story"
        busy={busy}
        disabled={(!caption.trim() && !media && !music && !layers.length)||!!music&&media?.kind==="audio"}
        onPress={() => void publish()}
      />
      <StoryLayerEditor layers={layers} onChange={setLayers} background={backgroundColors[background]!}/>
      <MediaLibraryPicker kind="gif" collapsed onSelect={setMedia}/>
      <MediaLibraryPicker kind="audio" collapsed onSelect={file=>setMusic({...file,kind:"audio"})}/>
      {music?<><Txt variant="small">Soundtrack: {music.filename}</Txt><Field label="Audio description" maxLength={600} value={music.altText??""} onChangeText={altText=>setMusic({...music,altText})}/><Field label="Lyrics or transcript" multiline maxLength={12000} value={music.captions??""} onChangeText={captions=>setMusic({...music,captions})}/><Button small variant="ghost" label="Remove soundtrack" onPress={()=>setMusic(null)}/></>:null}
    </Card>
  );
}
const backgroundColors: Record<string, string> = {
  violet: "#49319c",
  ocean: "#105e89",
  rose: "#91285b",
  midnight: "#202a40",
};
function StoryCard({ story: s, mine }: { story: ProfileStory; mine: boolean }) {
  const client = useQueryClient(),
    [revealed, setRevealed] = useState(!s.blur),
    [answer, setAnswer] = useState(""),
    [report, setReport] = useState(""),
    [busy, setBusy] = useState(false),
    [reporting, setReporting] = useState(false);
  const responses = useQuery({
    queryKey: ["profileStoryResponses", s.id],
    queryFn: () => stories.responses(s.id),
    enabled: revealed && (!!s.question || !!s.pollOptions.length),
  });
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      await Promise.all([
        client.invalidateQueries({ queryKey: ["profileStories"] }),
        client.invalidateQueries({ queryKey: ["profileStoryResponses", s.id] }),
      ]);
      notify(message, "Your change was saved.");
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <View
        style={{
          backgroundColor:
            backgroundColors[s.background] ?? backgroundColors.violet,
          padding: 18,
          borderRadius: 18,
          gap: 12,
        }}
      >
        <Txt style={{ color: "#fff" }} variant="small">
          {s.highlighted
            ? "✦ Highlight"
            : s.expired
              ? "Expired · only you"
              : "Live for 24 hours"}{" "}
          · {s.minimumAge}+ · {s.audience.replace("_", " ")}
        </Txt>
        {s.hidden ? (
          <Txt style={{ color: "#fff" }}>Hidden by site moderation</Txt>
        ) : null}
        {s.contentWarning ? (
          <Txt style={{ color: "#fff" }}>Content note: {s.contentWarning}</Txt>
        ) : null}
        {revealed ? (
          <View style={{position:"relative",width:"100%",aspectRatio:9/16,overflow:"hidden",justifyContent:"center",borderRadius:16}}>
            <Txt style={{ color: "#fff" }} variant="heading">
              {s.caption}
            </Txt>
            {s.media ? <ContentMedia media={s.media} muted={!!s.music}/> : null}
            <StoryLayers layers={s.layers}/>
          </View>
        ) : (
          <Button
            variant="secondary"
            label="Show story"
            onPress={() => setRevealed(true)}
          />
        )}
      </View>
      {revealed&&s.music?<ContentMedia media={s.music}/>:null}
      {responses.isError ? (
        <Txt tone="danger">{responses.error.message}</Txt>
      ) : responses.isPending && (s.question || s.pollOptions.length) ? (
        <Txt tone="muted">Loading responses…</Txt>
      ) : null}
      {revealed && !s.hidden ? (
        <>
          {s.pollOptions.map((o, i) => (
            <Button
              key={i}
              variant={
                responses.data?.mine?.optionIndex === i
                  ? "primary"
                  : "secondary"
              }
              label={`${o} · ${responses.data?.votes.find((v) => v.optionIndex === i)?.count ?? 0}`}
              disabled={busy || s.expired || !responses.isSuccess}
              onPress={() =>
                void run(
                  () => stories.respond(s.id, { optionIndex: i }),
                  "Vote saved",
                )
              }
            />
          ))}
          {s.question ? (
            <>
              <Txt variant="heading">{s.question}</Txt>
              <Field
                label="Your answer"
                value={answer}
                onChangeText={setAnswer}
                multiline
                maxLength={1000}
              />
              <Button
                label="Send answer"
                disabled={
                  busy || s.expired || !answer.trim() || !responses.isSuccess
                }
                onPress={() =>
                  void run(
                    () => stories.respond(s.id, { answer }),
                    "Answer saved",
                  )
                }
              />
            </>
          ) : null}
          {mine && responses.data?.answers.length ? (
            <>
              <Txt variant="heading">
                Answers ({responses.data.answers.length})
              </Txt>
              {responses.data.answers.map((a, i) => (
                <Txt key={i}>{a}</Txt>
              ))}
            </>
          ) : null}
        </>
      ) : null}
      {mine ? (
        <>
          <Button
            variant="secondary"
            label={s.highlighted ? "Remove highlight" : "Keep as highlight"}
            disabled={busy || s.hidden}
            onPress={() =>
              void run(
                () => stories.highlight(s.id, !s.highlighted),
                "Highlight updated",
              )
            }
          />
          <Button
            variant="danger"
            label="Delete story"
            disabled={busy}
            onPress={() =>
              void (async () => {
                if (
                  await confirmAction(
                    "Delete this story?",
                    "The story and its replies will be removed.",
                    "Delete",
                    true,
                  )
                )
                  await run(() => stories.remove(s.id), "Story deleted");
              })()
            }
          />
        </>
      ) : (
        <>
          <Button
            small
            variant="ghost"
            label="Report story"
            onPress={() => setReporting((v) => !v)}
          />
          {reporting ? (
            <>
              <Field
                label="Reason"
                value={report}
                onChangeText={setReport}
                maxLength={300}
              />
              <Button
                variant="secondary"
                label="Send report"
                disabled={busy || !report.trim()}
                onPress={() =>
                  void run(
                    () => stories.report(s.id, report),
                    "Report sent to the site team",
                  )
                }
              />
            </>
          ) : null}
        </>
      )}
    </Card>
  );
}

import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Pressable, View } from "react-native";
import { api } from "@/api/endpoints";
import type { ChatMessage } from "@/api/types";
import { ChatBanner, ChatHeader, ChatInputBar, TypingBubble } from "@/components/chat/ChatChrome";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { formatSeconds } from "@/components/chat/MessageMedia";
import { RoomSettings } from "@/components/chat/RoomSettings";
import { roomPerson, roomTitle } from "@/components/chat/rooms";
import { StickerPicker } from "@/components/chat/StickerPicker";
import { OptionRow } from "@/components/create/parts";
import { EmptyHint, GradientButton, PersonAvatar } from "@/components/k";
import { ReportSheet, type ReportTarget } from "@/components/ReportSheet";
import { ErrorState, Field, Loading, PressableScale, Sheet, Txt } from "@/components/ui";
import { errorMessage, showError } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { tellIfHeld } from "@/lib/held";
import { pickPhoto, pickVideo } from "@/lib/media";
import { previewText, stickerToken } from "@/lib/stickers";
import { useDebounced } from "@/lib/useDebounced";
import { useVoiceRecorder } from "@/lib/useVoiceRecorder";
import { font, radius, useTheme } from "@/theme";
import { ChatContentTools, ChatMessageContent } from "@/components/content/ChatContentTools";
import { StageControlsV9 } from "@/components/StageControlsV9";
import {
  discardQueued,
  enqueueMessage,
  flushNow,
  newClientTag,
  onQueueChange,
  queuedForRoom,
  retryQueued,
  type QueuedMessage,
} from "@/lib/offline-queue";

const REACTIONS = ["❤️", "😂", "✨", "🔥", "👏", "😮"];
type Media = { kind: "image" | "audio" | "video"; dataUrl: string };
/** How often we tell the server "I'm typing" while the person types (the server forgets after 6 s). */
const TYPING_EVERY_MS = 4000;

/**
 * One conversation (DM, group, or live room) in the new look: header with face and status, white / gradient
 * bubbles, the comment-bar style input, "is typing…", "Seen" under your last DM message, and a banner to accept or
 * decline a message request. Reactions, replies, edit / delete, photos, clips, voice notes, stickers, search, calls,
 * watch-together and invites all live here.
 */
export default function ChatRoom() {
  const theme = useTheme();
  const { roomId: roomParam } = useLocalSearchParams<{ roomId: string }>();
  const roomId = Number(roomParam);
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  // New messages arrive by asking the server again every few seconds while this screen is open.
  const room = useQuery({ queryKey: ["room", roomId], queryFn: () => api.room(roomId), enabled: Number.isFinite(roomId), refetchInterval: 4000 });
  // The chat list knows extra things about the room: online, verified, message request…
  const overview = useQuery({ queryKey: ["chatsOverview"], queryFn: api.chatsOverview, staleTime: 15_000 });
  const extra = overview.data?.rooms.find((r) => r.id === roomId);
  const isDm = room.data?.room.kind === "dm";
  const typing = useQuery({ queryKey: ["typing", roomId], queryFn: () => api.typingIn(roomId), enabled: Number.isFinite(roomId), refetchInterval: 3000 });
  const receipts = useQuery({ queryKey: ["receipts", roomId], queryFn: () => api.roomReceipts(roomId), enabled: isDm, refetchInterval: 5000 });

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [selected, setSelected] = useState<ChatMessage | null>(null);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [sheet, setSheet] = useState<null | "settings" | "attach" | "stickers" | "search">(null);
  const [sending, setSending] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);
  const voice = useVoiceRecorder();
  const list = useRef<FlatList<ChatMessage>>(null);

  // The newest messages come from `room` (polled); older ones are loaded page by page when you scroll back.
  const latest = room.data?.messages;
  const [older, setOlder] = useState<ChatMessage[]>([]);
  const [olderState, setOlderState] = useState<"idle" | "loading" | "done">("idle");
  const messages = useMemo(() => {
    const newest = latest ?? [];
    const firstLatest = newest[0]?.id ?? Number.POSITIVE_INFINITY;
    // (roomId check: the same screen can be reused for another conversation.)
    return [...older.filter((m) => m.roomId === roomId && m.id < firstLatest), ...newest];
  }, [older, latest, roomId]);
  const byId = useMemo(() => new Map((messages ?? []).map((m) => [m.id, m])), [messages]);
  const newestFirst = useMemo(() => [...(messages ?? [])].reverse(), [messages]);
  const myId = me.data?.profile.userId;
  const newestId = newestFirst[0]?.id ?? 0;

  /** Scrolling back past the newest page loads 50 older messages at a time. */
  const loadOlder = async () => {
    const oldest = messages[0]?.id;
    // The newest page holds up to 200; fewer means the whole conversation is already here.
    if (olderState !== "idle" || !oldest || (older.length === 0 && (latest?.length ?? 0) < 200)) return;
    setOlderState("loading");
    try {
      const page = await api.olderMessages(roomId, oldest);
      setOlder((current) => {
        const known = new Set(current.map((m) => m.id));
        return [...page.messages.filter((m) => !known.has(m.id)), ...current];
      });
      setOlderState(page.hasMore ? "idle" : "done");
    } catch {
      setOlderState("idle"); // try again on the next scroll
    }
  };

  // Messages waiting in the offline queue (or refused) for this room, shown after the sent ones.
  const [pending, setPending] = useState<QueuedMessage[]>([]);
  useEffect(() => {
    if (!myId || !Number.isFinite(roomId)) return;
    let alive = true;
    const load = () =>
      void queuedForRoom(myId, roomId).then((entries) => {
        if (alive) setPending(entries);
      });
    load();
    const off = onQueueChange(() => {
      load();
      // Anything that just went out appears in the conversation.
      void queryClient.invalidateQueries({ queryKey: ["room", roomId] });
    });
    return () => {
      alive = false;
      off();
    };
  }, [myId, roomId, queryClient]);

  const managePending = (entry: QueuedMessage) => {
    if (!myId) return;
    Alert.alert(
      entry.failed ? "Message not sent" : "Waiting to send",
      entry.failed ?? "This message will be sent as soon as you're back online.",
      [
        { text: "Delete", style: "destructive", onPress: () => void discardQueued(myId, entry.clientTag) },
        ...(entry.failed
          ? [{ text: "Try again", onPress: () => void retryQueued(myId, entry.clientTag).then(flushNow) }]
          : [{ text: "Send now", onPress: flushNow }]),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  };

  // Tell the server what we've read (not for message requests: the sender shouldn't see "Seen" before you accept).
  const markedRef = useRef(0);
  useEffect(() => {
    if (!newestId || newestId <= markedRef.current || extra?.isRequest) return;
    markedRef.current = newestId;
    api
      .markRoomRead(roomId, newestId)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["rooms"] });
        void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
      })
      .catch(() => undefined);
  }, [newestId, roomId, extra?.isRequest, queryClient]);

  // "I'm typing": sent at most every few seconds while there is text in the box.
  const typingSent = useRef(0);
  const onChangeText = (value: string) => {
    setText(value);
    if (value.trim() && !editing && Date.now() - typingSent.current > TYPING_EVERY_MS) {
      typingSent.current = Date.now();
      api.setTyping(roomId).catch(() => undefined);
    }
  };

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["room", roomId] });
    void queryClient.invalidateQueries({ queryKey: ["rooms"] });
    void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
  };

  const sendingRef = useRef(false);
  /**
   * Sends what's in the box (or saves an edit). A photo or clip takes the text as its caption; a voice note doesn't.
   * Without a connection, a text message goes into the offline queue and shows as "waiting" until it's sent.
   */
  const submit = async (media?: Media) => {
    const withText = media?.kind !== "audio";
    const body = withText ? text.trim() : "";
    if (sendingRef.current || (!body && !media)) return;
    sendingRef.current = true;
    setSending(true);
    // The tag is made before the first attempt, so a retry can never post a second copy.
    const clientTag = newClientTag();
    const input = { roomId, body, replyTo: replyTo?.id ?? null, clientTag };
    const clearComposer = () => {
      if (withText) setText("");
      setReplyTo(null);
      setEditing(null);
      typingSent.current = 0;
    };
    try {
      // Keep the order: while earlier messages for this room are waiting, a new one waits behind them.
      if (!editing && !media && myId && pending.some((p) => !p.failed)) {
        await enqueueMessage(myId, input);
        clearComposer();
        flushNow();
        return;
      }
      try {
        tellIfHeld(editing ? await api.editMessage(roomId, editing.id, body) : await api.send({ ...input, media }));
        clearComposer();
        await refresh();
      } catch (error) {
        // Only "no connection" is queued. A refusal (blocked, removed, rejected words) is shown instead.
        const offline = (error as { status?: number }).status === 0;
        if (offline && !editing && !media && myId) {
          await enqueueMessage(myId, input);
          clearComposer();
          return;
        }
        showError(error, editing ? "Edit not saved" : media ? "Couldn't send that" : "Message not sent");
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };
  // The voice recorder's 45-second auto-stop calls the latest `submit`, not the one from when recording began.
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  const sendSticker = async (id: string) => {
    setSheet(null);
    if (sending) return;
    setSending(true);
    try {
      await api.send({ roomId, body: stickerToken(id), replyTo: replyTo?.id ?? null, clientTag: newClientTag() });
      setReplyTo(null);
      await refresh();
    } catch (error) {
      showError(error, "Sticker not sent");
    } finally {
      setSending(false);
    }
  };

  const attach = async (kind: "photo" | "camera" | "video") => {
    setSheet(null);
    try {
      if (kind === "video") {
        const dataUrl = await pickVideo("library");
        if (dataUrl) await submit({ kind: "video", dataUrl });
      } else {
        const dataUrl = await pickPhoto(kind === "camera" ? "camera" : "library");
        if (dataUrl) await submit({ kind: "image", dataUrl });
      }
    } catch (error) {
      showError(error, "Couldn't attach that");
    }
  };

  const toggleRecording = async () => {
    try {
      if (voice.isRecording) {
        const dataUrl = await voice.stop();
        if (dataUrl) await submit({ kind: "audio", dataUrl });
      } else {
        await voice.start((dataUrl) => {
          if (dataUrl) void submitRef.current({ kind: "audio", dataUrl });
        });
      }
    } catch (error) {
      await voice.cancel();
      showError(error, "Voice message failed");
    }
  };

  const react = async (message: ChatMessage, emoji: string) => {
    setSelected(null);
    try {
      await api.react(roomId, message.id, emoji);
      await refresh();
    } catch (error) {
      showError(error);
    }
  };

  const remove = (message: ChatMessage) => {
    setSelected(null);
    Alert.alert("Delete this message?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void api.deleteMessage(roomId, message.id).then(refresh, showError) },
    ]);
  };

  const answer = async (accept: boolean) => {
    setAnswering(true);
    try {
      if (accept) await api.acceptMessageRequest(roomId);
      else await api.declineMessageRequest(roomId);
      void queryClient.invalidateQueries({ queryKey: ["chatsOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["rooms"] });
      if (!accept) {
        if (router.canGoBack()) router.back();
        else router.replace("/chats");
      }
    } catch (error) {
      showError(error);
    } finally {
      setAnswering(false);
    }
  };

  /** Jumps to a search result when it's in the loaded messages. */
  const jumpTo = (id: number) => {
    setSheet(null);
    const index = newestFirst.findIndex((m) => m.id === id);
    if (index < 0) return;
    setHighlight(id);
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 2500);
    list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/chats"));

  if (room.isPending) return <Loading />;
  if (room.isError || !room.data) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <ChatHeader person={{ name: "?", hue: 260 }} title="Chat" onBack={goBack} actions={[]} />
        <ErrorState error={room.error} onRetry={() => void room.refetch()} />
      </View>
    );
  }

  const info = room.data.room;
  const title = roomTitle({ ...info, communityName: extra?.communityName });
  const typingNames = (typing.data?.names ?? []).filter((_, i) => typing.data?.userIds[i] !== myId);
  const mineSelected = !!selected && selected.author.userId === myId;
  // "Seen" under my newest message when the other person has read up to it (DMs only, when they share receipts).
  const myLast = newestFirst.find((m) => m.author.userId === myId && !m.deleted);
  const seen = !!myLast && (receipts.data?.seenBy ?? []).some((s) => s.userId !== myId && s.lastReadId >= myLast.id);
  const subtitle = typingNames.length
    ? isDm
      ? "typing…"
      : `${typingNames[0]}${typingNames.length > 1 ? ` +${typingNames.length - 1}` : ""} typing…`
    : isDm
      ? extra?.peerOnline
        ? "Online"
        : info.peerHandle
          ? `@${info.peerHandle}`
          : undefined
      : info.kind === "voice"
        ? `Live room${room.data.voices.length ? ` · ${room.data.voices.length} in the call` : ""}`
        : [extra?.communityName, room.data.participants.length ? `${room.data.participants.length} people` : null].filter(Boolean).join(" · ") || undefined;

  return (
    // "padding" on Android too: apps are edge-to-edge there now, so the window no longer shrinks for the keyboard
    // by itself and the input bar would sit behind it.
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior="padding">
      <ChatHeader
        person={roomPerson(info)}
        title={title}
        verified={isDm && extra?.peerVerified}
        online={isDm ? !!extra?.peerOnline : undefined}
        subtitle={subtitle}
        subtitleTone={typingNames.length ? "accent" : isDm && extra?.peerOnline ? "green" : "muted"}
        onBack={goBack}
        onPressTitle={isDm && info.peerHandle ? () => router.push(`/profile/${info.peerHandle}`) : undefined}
        actions={[
          { icon: "search-outline", label: "Search messages", onPress: () => setSheet("search") },
          { icon: "call-outline", label: "Start or join a call", onPress: () => router.push(`/call/${roomId}?mode=dial`) },
          { icon: "ellipsis-horizontal", label: "Chat settings and invites", onPress: () => setSheet("settings") },
        ]}
      />

      <ChatContentTools roomId={roomId} myId={myId ?? ""} messages={messages ?? []}/>
      {info.kind === "voice" || info.kind === "screening" ? <StageControlsV9 roomId={roomId} userId={myId ?? ""}/> : null}
      {extra?.isRequest ? (
        <View style={{ margin: 12, marginBottom: 0, padding: 14, gap: 10, borderRadius: radius.card, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <PersonAvatar person={roomPerson(info)} size={40} />
            <View style={{ flex: 1 }}>
              <Txt style={{ fontFamily: font.bold, fontSize: 14.5, lineHeight: 19, color: theme.ink }}>{`${title} wants to message you`}</Txt>
              <Txt style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>You don’t follow each other yet. They won’t know you’ve seen this until you accept or reply.</Txt>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <GradientButton label="Accept" icon="checkmark" busy={answering} onPress={() => void answer(true)} style={{ flex: 1 }} full />
            <PressableScale onPress={() => void answer(false)} disabled={answering} accessibilityLabel="Decline message request" scaleTo={0.96} style={{ flex: 1, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface }}>
              <Txt style={{ fontFamily: font.bold, fontSize: 14, lineHeight: 18, color: theme.muted }}>Decline</Txt>
            </PressableScale>
          </View>
          <Pressable
            onPress={() => setReport({ targetType: "message", targetId: String(newestFirst[0]?.id ?? ""), communityId: undefined, label: "message request" })}
            accessibilityRole="button"
            accessibilityLabel="Report this request"
            hitSlop={8}
            style={{ alignSelf: "center" }}
          >
            <Txt style={{ fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: theme.danger }}>Report</Txt>
          </Pressable>
        </View>
      ) : null}
      {extra?.awaitingAccept ? <ChatBanner icon="paper-plane-outline" tone="blue" text={`Message request sent. ${title} will see it once they accept.`} /> : null}

      {room.data.voices.length ? (
        <ChatBanner
          icon="call"
          tone="green"
          text={`${room.data.voices.length} in a call · ${room.data.voices.map((v) => v.nickname).join(", ")}`}
          action="Join"
          onPress={() => router.push(`/call/${roomId}?mode=dial`)}
        />
      ) : null}
      {info.kind === "screening" && info.watchUrl ? (
        <ChatBanner icon="film-outline" tone="violet" text={`Watching together: ${info.watchTitle || info.watchUrl}`} action="Watch" onPress={() => void router.push(`/chat/watch/${roomId}`)} />
      ) : null}

      <FlatList
        ref={list}
        inverted
        data={newestFirst}
        keyExtractor={(m) => String(m.id)}
        onScrollToIndexFailed={() => undefined}
        renderItem={({ item, index }) => {
          const newer = newestFirst[index - 1];
          const older = newestFirst[index + 1];
          const sameAsOlder = older?.author.userId === item.author.userId && new Date(item.createdAt).getTime() - new Date(older.createdAt).getTime() < 5 * 60_000;
          const sameAsNewer = newer?.author.userId === item.author.userId && new Date(newer.createdAt).getTime() - new Date(item.createdAt).getTime() < 5 * 60_000;
          const mine = item.author.userId === myId;
          return (
            <View>
            <MessageBubble
              message={item}
              mine={mine}
              replyTo={item.replyTo ? byId.get(item.replyTo) : undefined}
              showName={!isDm && !sameAsOlder}
              showAvatar={!sameAsNewer}
              showTime={!sameAsNewer}
              receipt={isDm && mine && item.id === myLast?.id ? (seen ? "Seen" : "Sent") : null}
              highlighted={highlight === item.id}
              onLongPress={() => setSelected(item)}
              onOpenProfile={() => router.push(`/profile/${item.author.handle}`)}
              onReact={(emoji) => void react(item, emoji)}
            />
            <ChatMessageContent roomId={roomId} messageId={item.id}/>
            </View>
          );
        }}
        ListHeaderComponent={
          pending.length || typingNames.length ? (
            <View>
              {typingNames.length ? <TypingBubble names={typingNames} /> : null}
              {[...pending].reverse().map((entry) => (
                <PendingBubble key={entry.clientTag} entry={entry} onPress={() => managePending(entry)} />
              ))}
            </View>
          ) : null
        }
        onEndReached={() => void loadOlder()}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          olderState === "loading" ? (
            <View style={{ padding: 12 }}>
              <ActivityIndicator color={theme.violet} />
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingVertical: 10, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
            <EmptyHint emoji="👋" title="Say hello" text="No messages yet. Yours can be the first." />
          </View>
        }
        keyboardShouldPersistTaps="handled"
      />

      <ChatInputBar
        value={text}
        onChangeText={onChangeText}
        onSend={() => void submit()}
        onRecord={() => void toggleRecording()}
        recording={voice.isRecording ? { seconds: formatSeconds(voice.seconds) } : null}
        onAttach={() => setSheet("attach")}
        onSticker={() => setSheet("stickers")}
        onCamera={() => void attach("photo")}
        sending={sending || voice.busy}
        editing={!!editing}
        placeholder={extra?.isRequest ? "Reply to accept…" : isDm ? `Message ${title}…` : "Message…"}
        top={
          replyTo || editing ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 8 }}>
              <View style={{ width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: theme.violet }} />
              <View style={{ flex: 1 }}>
                <Txt style={{ fontFamily: font.bold, fontSize: 12, lineHeight: 16, color: theme.toneText.violet }}>{editing ? "Editing your message" : `Replying to ${replyTo!.author.nickname}`}</Txt>
                {replyTo ? <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 16, color: theme.muted }}>{previewText(replyTo.body) || "Attachment"}</Txt> : null}
              </View>
              <PressableScale onPress={() => { setReplyTo(null); setEditing(null); setText(""); }} accessibilityLabel="Cancel" scaleTo={0.85} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="close-circle" size={22} color={theme.subtle} />
              </PressableScale>
            </View>
          ) : null
        }
      />

      {/* ── Long-press menu: reactions, reply, edit, delete, report ── */}
      <Sheet visible={!!selected} title="Message" onClose={() => setSelected(null)}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 6, borderRadius: radius.pill, backgroundColor: theme.surfaceAlt }}>
          {REACTIONS.map((emoji) => (
            <PressableScale key={emoji} onPress={() => selected && void react(selected, emoji)} accessibilityLabel={`React ${emoji}`} scaleTo={0.8} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Txt style={{ fontSize: 26, lineHeight: 32 }}>{emoji}</Txt>
            </PressableScale>
          ))}
        </View>
        {selected && !selected.deleted ? (
          <>
            <OptionRow icon="arrow-undo-outline" title="Reply" onPress={() => { setReplyTo(selected); setEditing(null); setSelected(null); }} right={null} />
            {mineSelected && !selected.mediaKind ? (
              <OptionRow icon="create-outline" title="Edit" onPress={() => { setEditing(selected); setReplyTo(null); setText(selected.body); setSelected(null); }} right={null} />
            ) : null}
            {/* Others' messages can only be removed by community or group moderators (never in a DM). */}
            {mineSelected || !isDm ? <OptionRow icon="trash-outline" title="Delete" onPress={() => remove(selected)} right={null} /> : null}
            {mineSelected ? null : (
              <OptionRow
                icon="flag-outline"
                title="Report"
                onPress={() => {
                  setReport({ targetType: "message", targetId: String(selected.id), communityId: info.communityId ?? undefined, label: "message" });
                  setSelected(null);
                }}
                right={null}
              />
            )}
          </>
        ) : null}
      </Sheet>

      <Sheet visible={sheet === "attach"} title="Attach" onClose={() => setSheet(null)}>
        <OptionRow icon="images-outline" title="Photo from library" onPress={() => void attach("photo")} right={null} />
        <OptionRow icon="camera-outline" title="Take a photo" onPress={() => void attach("camera")} right={null} />
        <OptionRow icon="videocam-outline" title="Short video" text="Up to 30 seconds" onPress={() => void attach("video")} right={null} />
      </Sheet>

      <SearchSheet visible={sheet === "search"} roomId={roomId} onClose={() => setSheet(null)} onPick={jumpTo} loaded={byId} />
      <StickerPicker visible={sheet === "stickers"} onClose={() => setSheet(null)} onPick={(id) => void sendSticker(id)} />
      <RoomSettings visible={sheet === "settings"} onClose={() => setSheet(null)} page={room.data} myId={myId} onChanged={() => void refresh()} />
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </KeyboardAvoidingView>
  );
}

/** A message of yours that hasn't reached the server yet ("Waiting to send"), or that the server refused. */
function PendingBubble({ entry, onPress }: { entry: QueuedMessage; onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "flex-end", paddingHorizontal: 12, paddingVertical: 3 }}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${previewText(entry.input.body)}. ${entry.failed ? "Not sent" : "Waiting to send"}. Tap for options.`}
        scaleTo={0.98}
        style={{
          maxWidth: "76%",
          paddingHorizontal: 13,
          paddingVertical: 9,
          borderRadius: 18,
          borderBottomRightRadius: 6,
          backgroundColor: theme.surfaceAlt,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: entry.failed ? theme.danger : theme.border,
        }}
      >
        <Txt style={{ fontFamily: font.regular, fontSize: 14.5, lineHeight: 20, color: theme.ink }}>{previewText(entry.input.body)}</Txt>
      </PressableScale>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4, paddingTop: 2 }}>
        <Ionicons name={entry.failed ? "alert-circle" : "time-outline"} size={13} color={entry.failed ? theme.danger : theme.subtle} />
        <Txt style={{ fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: entry.failed ? theme.danger : theme.subtle }}>
          {entry.failed ? "Not sent · tap for options" : "Waiting to send"}
        </Txt>
      </View>
    </View>
  );
}

/** Search this conversation (the server searches the whole history). */
function SearchSheet({ visible, roomId, onClose, onPick, loaded }: { visible: boolean; roomId: number; onClose: () => void; onPick: (id: number) => void; loaded: Map<number, ChatMessage> }) {
  const theme = useTheme();
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const results = useQuery({ queryKey: ["searchMessages", roomId, query], queryFn: () => api.searchMessages(roomId, query), enabled: visible && query.length >= 2 });
  return (
    <Sheet visible={visible} title="Search this chat" onClose={onClose}>
      <Field value={q} onChangeText={setQ} placeholder="Search messages" autoCapitalize="none" autoFocus />
      {query.length < 2 ? (
        <Txt variant="small" tone="muted">Type at least two letters.</Txt>
      ) : results.isPending ? (
        <Txt variant="small" tone="muted">Searching…</Txt>
      ) : results.isError ? (
        <Txt variant="small" tone="danger">{errorMessage(results.error)}</Txt>
      ) : results.data?.length ? (
        results.data.map((m) => {
          const here = loaded.has(m.id);
          return (
            <PressableScale key={m.id} onPress={() => onPick(m.id)} disabled={!here} accessibilityLabel={`${m.author.nickname}: ${previewText(m.body)}. ${here ? "Show in chat" : "Older message"}`} scaleTo={0.98} style={{ gap: 2, padding: 10, borderRadius: 12, backgroundColor: theme.surfaceAlt }}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Txt style={{ flex: 1, fontFamily: font.bold, fontSize: 12.5, lineHeight: 16, color: theme.ink }}>{m.author.nickname}</Txt>
                <Txt style={{ fontFamily: font.regular, fontSize: 11.5, lineHeight: 15, color: theme.subtle }}>{timeAgo(m.createdAt)}{here ? "" : " · older"}</Txt>
              </View>
              <Txt numberOfLines={3} style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 18, color: theme.text }}>{previewText(m.body) || "Attachment"}</Txt>
            </PressableScale>
          );
        })
      ) : (
        <Txt variant="small" tone="muted">No messages match that.</Txt>
      )}
    </Sheet>
  );
}

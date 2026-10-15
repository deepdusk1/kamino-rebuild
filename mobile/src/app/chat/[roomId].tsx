import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
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
import { enqueueMessage, newClientTag } from "@/lib/offline-queue";

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

  const messages = room.data?.messages;
  const byId = useMemo(() => new Map((messages ?? []).map((m) => [m.id, m])), [messages]);
  const newestFirst = useMemo(() => [...(messages ?? [])].reverse(), [messages]);
  const myId = me.data?.profile.userId;
  const newestId = newestFirst[0]?.id ?? 0;

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

  const submit = async (media?: Media) => {
    const body = text.trim();
    if (sending || (!body && !media)) return;
    setSending(true);
    let queued = false;
    // Allocate the dedup tag before the first attempt so a retry after a lost
    // response can never post a second copy (M2).
    const clientTag = newClientTag();
    const userId = me.data?.profile?.userId ?? null;
    try {
      try {
        tellIfHeld(editing ? await api.editMessage(roomId, editing.id, body) : await api.send({ roomId, body, replyTo: replyTo?.id ?? null, media, clientTag }));
      } catch (error) {
        // Queue ONLY transient network failures. Validation, moderation,
        // permission and auth errors are permanent — retrying them is wrong (M2).
        const isNetworkError = error instanceof Error && (error as { status?: number }).status === 0;
        if (!editing && !media && isNetworkError && userId) {
          await enqueueMessage(userId, { roomId, body, replyTo: replyTo?.id ?? null, clientTag });
          queued = true;
          // Clear the composer: the words are safe in the queue now.
          setText("");
          setReplyTo(null);
          showError(error, "No connection — it will send when you're back online");
        } else {
          showError(error, "Message not sent");
        }
        throw error;
      }
      setText("");
      setReplyTo(null);
      setEditing(null);
      typingSent.current = 0;
      await refresh();
    } catch {
      if (queued) return; // already reported with the offline explanation
      showError(new Error("Message not sent"), "Message not sent");
    } finally {
      setSending(false);
    }
  };

  const sendSticker = async (id: string) => {
    setSheet(null);
    if (sending) return;
    setSending(true);
    try {
      await api.send({ roomId, body: stickerToken(id), replyTo: replyTo?.id ?? null });
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
          if (dataUrl) void submit({ kind: "audio", dataUrl });
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
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
          { icon: "call-outline", label: "Start or join a call", onPress: () => router.push(`/call/${roomId}`) },
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
          onPress={() => router.push(`/call/${roomId}`)}
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
        ListHeaderComponent={typingNames.length ? <TypingBubble names={typingNames} /> : null}
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
            <OptionRow icon="trash-outline" title="Delete" onPress={() => remove(selected)} right={null} />
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

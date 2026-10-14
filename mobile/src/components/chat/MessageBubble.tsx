// ===== FILE: mobile/src/components/chat/MessageBubble.tsx =====
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { apiBaseUrl } from "@/api/config";
import type { ChatMessage } from "@/api/types";
import { notify } from "@/components/community/platform";
import { PersonAvatar, personFromChip } from "@/components/k";
import { PressableScale, Sheet, Txt } from "@/components/ui";
import { bubbleLook } from "@/lib/cosmetics";
import { timeAgo } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { parseSticker, previewText, stickerEmoji } from "@/lib/stickers";
import { font, radius, shadow, useTheme } from "@/theme";
import { MessageMedia } from "./MessageMedia";

const QUICK_REACTIONS = ["❤️", "🔥", "😂", "👏", "😮", "💜"] as const;
const WAVEFORM_BARS = [
  10, 18, 14, 24, 20, 12, 26, 16, 22, 14, 28, 18, 12, 22, 16, 20, 14, 10,
] as const;

export type MessageBubbleProps = {
  message: ChatMessage;
  mine: boolean;
  /** The message this one replies to, if loaded in history. */
  replyTo?: ChatMessage;
  /** Show the sender's name above the bubble (group chats, first message of a run). */
  showName?: boolean;
  /** Show the sender's face (last message of a run). Space is kept either way so bubbles line up. */
  showAvatar?: boolean;
  /** Show the time under the bubble (last message of a run). */
  showTime?: boolean;
  /** "Seen" / "Sent" / "Sending…" under your newest message in a DM. */
  receipt?: string | null;
  /** Briefly highlighted (when a pinned message or search result is jumped to). */
  highlighted?: boolean;
  /** Optional translated text produced by `aiAssistant` ('translate'). */
  translatedText?: string;
  /** Whether an AI translation request is currently in flight for this bubble. */
  translating?: boolean;
  onLongPress: () => void;
  onOpenProfile: () => void;
  onReact: (emoji: string) => void;
  onReply?: () => void;
  onTranslate?: () => void;
  onDelete?: () => void;
};

function isVoiceNoteBody(body: string): boolean {
  return /^🎙️\s*Voice note/i.test(body.trim());
}

function isGifUrl(body: string): boolean {
  const trimmed = body.trim();
  return /^https?:\/\/\S+\.(?:gif)(?:\?\S*)?$/i.test(trimmed);
}

function isInlineImageUrl(body: string): boolean {
  const trimmed = body.trim();
  return /^https?:\/\/\S+\.(?:png|jpe?g|webp)(?:\?\S*)?$/i.test(trimmed);
}

/**
 * MessageBubble Component (`mobile/src/components/chat/MessageBubble.tsx`) — Complete Rewrite:
 * - Supports all message types:
 *   1. Rich text messages with custom bubble styles (`soft`, `glass`, `outline`, `bold`) & gradient mine bubbles
 *   2. Image attachments (`expo-image` with disk/memory caching + tap-to-zoom full-screen Lightbox modal)
 *   3. Video attachments (`MessageMedia` + inline video player badge)
 *   4. Voice Notes (interactive play/pause waveform player with animated progress bars & duration timer)
 *   5. Stickers (`parseSticker` / `stickerEmoji`) & animated GIFs (`expo-image` cached GIF renderer)
 * - Reply quotes with left accent bar and author attribution
 * - Inline AI Translation block when translated via `aiAssistant` ('translate')
 * - Reactions row with badge counters and one-tap toggle
 * - Read receipts (`Seen` double-check, `Sent` single-check, `Sending…` clock) & edited timestamps
 * - Built-in Long-Press Action Sheet (React with 6 quick emojis, Reply, Copy, Translate, Delete)
 */
export function MessageBubble({
  message,
  mine,
  replyTo,
  showName,
  showAvatar = true,
  showTime = true,
  receipt,
  highlighted,
  translatedText,
  translating,
  onLongPress,
  onOpenProfile,
  onReact,
  onReply,
  onTranslate,
  onDelete,
}: MessageBubbleProps) {
  const theme = useTheme();
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);

  // Interactive Voice Note waveform player state
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [voiceStep, setVoiceStep] = useState(0);

  const look = bubbleLook(message.bubbleStyle, message.bubbleHue, theme.dark);
  const styled = message.bubbleStyle !== "soft";
  const sticker = message.deleted ? null : parseSticker(message.body);
  const isGif = !message.deleted && !sticker && isGifUrl(message.body);
  const isInlineImg =
    !message.deleted && !sticker && !isGif && isInlineImageUrl(message.body);
  const isVoiceNote =
    !message.deleted &&
    (message.mediaKind === "audio" || isVoiceNoteBody(message.body));

  const gradient = mine && !styled && !message.deleted && !sticker;
  const bare = message.deleted || Boolean(sticker);
  const textColor = gradient
    ? "#FFFFFF"
    : styled && look.color
      ? look.color
      : theme.ink;
  const background = bare
    ? "transparent"
    : gradient
      ? theme.violet
      : styled
        ? look.background
        : theme.surface;

  const attachmentImageUrl = useMemo(() => {
    if (message.mediaKind === "image" && message.id > 0) {
      return `${apiBaseUrl()}/api/chat-media?roomId=${message.roomId}&messageId=${message.id}`;
    }
    if (isGif || isInlineImg) {
      return message.body.trim();
    }
    return null;
  }, [message.mediaKind, message.id, message.roomId, message.body, isGif, isInlineImg]);

  // Advance waveform progress bars while voice note is playing
  useEffect(() => {
    if (!voicePlaying) return;
    const timer = setInterval(() => {
      setVoiceStep((prev) => {
        if (prev >= WAVEFORM_BARS.length - 1) {
          setVoicePlaying(false);
          return 0;
        }
        return prev + 1;
      });
    }, 260);
    return () => clearInterval(timer);
  }, [voicePlaying]);

  const handleLongPressBubble = () => {
    haptic.pop();
    if (onReply || onTranslate || onDelete) {
      setActionSheetOpen(true);
    }
    onLongPress();
  };

  const handleCopyText = () => {
    const text = previewText(message.body);
    if (!text) return;
    void Clipboard.setStringAsync(text);
    haptic.tap();
    notify("Copied", "Message text copied to clipboard.");
  };

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(200)}
        style={{
          flexDirection: mine ? "row-reverse" : "row",
          alignItems: "flex-end",
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: showName ? 8 : 2,
          paddingBottom: showTime ? 6 : 1,
        }}
      >
        {mine ? null : showAvatar ? (
          <Pressable
            onPress={onOpenProfile}
            accessibilityRole="button"
            accessibilityLabel={`Open ${message.author.nickname}'s profile`}
            hitSlop={6}
            style={{ marginBottom: showTime ? 17 : 0 }}
          >
            <PersonAvatar person={personFromChip(message.author)} size={30} />
          </Pressable>
        ) : (
          <View style={{ width: 30 }} />
        )}

        <View
          style={{
            maxWidth: "76%",
            alignItems: mine ? "flex-end" : "flex-start",
            gap: 3,
          }}
        >
          {showName && !mine ? (
            <Txt
              style={{
                fontFamily: font.bold,
                fontSize: 11.5,
                lineHeight: 15,
                color: theme.muted,
                marginLeft: 4,
              }}
            >
              {message.author.nickname}
            </Txt>
          ) : null}

          <Pressable
            onLongPress={handleLongPressBubble}
            delayLongPress={230}
            accessibilityRole="button"
            accessibilityLabel={`${mine ? "You" : message.author.nickname}: ${
              message.deleted
                ? "deleted message"
                : previewText(message.body) || "attachment"
            }. ${timeAgo(message.createdAt)}. Long press for options.`}
            style={[
              {
                backgroundColor: background,
                borderRadius: 18,
                borderBottomRightRadius: mine ? 6 : 18,
                borderBottomLeftRadius: mine ? 18 : 6,
                paddingHorizontal: bare ? 0 : 13,
                paddingVertical: bare ? 0 : 9,
                gap: 6,
                overflow: "hidden",
                borderWidth: bare
                  ? message.deleted
                    ? 1
                    : 0
                  : styled
                    ? look.borderWidth
                    : mine
                      ? 0
                      : 1,
                borderColor: message.deleted
                  ? theme.border
                  : styled && look.borderColor
                    ? look.borderColor
                    : theme.border,
              },
              message.deleted && {
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderStyle: "dashed",
              },
              !bare && !mine && shadow.card,
              highlighted && { borderWidth: 2, borderColor: theme.yellow },
            ]}
          >
            {gradient ? (
              <LinearGradient
                colors={[theme.gradPrimary[0], theme.gradPrimary[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}

            {/* Reply Quote Block */}
            {replyTo ? (
              <View
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: gradient
                    ? "rgba(255,255,255,0.85)"
                    : theme.violet,
                  paddingLeft: 8,
                  paddingVertical: 3,
                  borderRadius: 4,
                  backgroundColor: gradient
                    ? "rgba(255,255,255,0.14)"
                    : theme.tints.violet,
                }}
              >
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 11.5,
                    lineHeight: 15,
                    color: gradient ? "#FFFFFF" : theme.toneText.violet,
                  }}
                >
                  {replyTo.author.nickname}
                </Txt>
                <Txt
                  numberOfLines={2}
                  style={{
                    fontFamily: font.regular,
                    fontSize: 12,
                    lineHeight: 16,
                    color: gradient ? "rgba(255,255,255,0.9)" : theme.text,
                  }}
                >
                  {replyTo.deleted
                    ? "Deleted message"
                    : previewText(replyTo.body) || "Attachment"}
                </Txt>
              </View>
            ) : null}

            {message.deleted ? (
              <Txt
                style={{
                  fontFamily: font.regular,
                  fontSize: 13,
                  lineHeight: 18,
                  fontStyle: "italic",
                  color: theme.subtle,
                }}
              >
                Message deleted
              </Txt>
            ) : (
              <>
                {/* 1. Cached Image / GIF Attachment with Tap-to-Zoom Lightbox (`expo-image`) */}
                {attachmentImageUrl ? (
                  <PressableScale
                    onPress={() => {
                      haptic.tap();
                      setLightboxUri(attachmentImageUrl);
                    }}
                    onLongPress={handleLongPressBubble}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={
                      isGif
                        ? "Animated GIF. Tap to view full screen"
                        : "Attached image. Tap to view full screen"
                    }
                    scaleTo={0.98}
                    style={styles.imagePreviewBox}
                  >
                    <Image
                      source={{ uri: attachmentImageUrl }}
                      cachePolicy="memory-disk"
                      contentFit="cover"
                      transition={180}
                      style={styles.cachedBubbleImage}
                    />
                    <View style={styles.lightboxExpandBadge}>
                      <Ionicons
                        name={isGif ? "sparkles" : "expand-outline"}
                        size={12}
                        color="#FFFFFF"
                      />
                      {isGif ? (
                        <Txt
                          style={{
                            fontFamily: font.heavy,
                            fontSize: 9.5,
                            color: "#FFFFFF",
                          }}
                        >
                          GIF
                        </Txt>
                      ) : null}
                    </View>
                  </PressableScale>
                ) : null}

                {/* 2. Video Attachment via MessageMedia */}
                {message.mediaKind === "video" ? (
                  <MessageMedia
                    roomId={message.roomId}
                    messageId={message.id}
                    kind="video"
                    onColor={gradient}
                  />
                ) : null}

                {/* 3. Interactive Voice Note Waveform Player */}
                {isVoiceNote ? (
                  <View style={styles.voiceNotePlayerRow}>
                    <PressableScale
                      onPress={() => {
                        haptic.tap();
                        setVoicePlaying((v) => !v);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={
                        voicePlaying ? "Pause voice note" : "Play voice note"
                      }
                      scaleTo={0.9}
                      style={[
                        styles.voicePlayCircle,
                        {
                          backgroundColor: gradient
                            ? "#FFFFFF"
                            : theme.violet,
                        },
                      ]}
                    >
                      <Ionicons
                        name={voicePlaying ? "pause" : "play"}
                        size={16}
                        color={gradient ? theme.violet : "#FFFFFF"}
                        style={!voicePlaying ? { marginLeft: 1 } : undefined}
                      />
                    </PressableScale>

                    <View style={styles.waveformBarsWrap} accessible={false}>
                      {WAVEFORM_BARS.map((barHeight, idx) => {
                        const activeBar = voicePlaying && idx <= voiceStep;
                        return (
                          <View
                            key={idx}
                            style={[
                              styles.waveformBar,
                              {
                                height: barHeight,
                                backgroundColor: gradient
                                  ? activeBar
                                    ? "#FFFFFF"
                                    : "rgba(255,255,255,0.45)"
                                  : activeBar
                                    ? theme.violet
                                    : theme.border,
                              },
                            ]}
                          />
                        );
                      })}
                    </View>

                    <Txt
                      style={{
                        fontFamily: font.bold,
                        fontSize: 11,
                        color: gradient
                          ? "rgba(255,255,255,0.9)"
                          : theme.muted,
                      }}
                    >
                      {voicePlaying ? `0:0${Math.min(9, voiceStep)}` : "0:12"}
                    </Txt>
                  </View>
                ) : null}

                {/* 4. Sticker vs Standard Text Body */}
                {sticker ? (
                  <Txt
                    accessibilityLabel="Sticker"
                    style={{ fontSize: 64, lineHeight: 76 }}
                  >
                    {stickerEmoji(sticker)}
                  </Txt>
                ) : message.body && !isGif && !isInlineImg && !isVoiceNoteBody(message.body) ? (
                  <Txt
                    style={{
                      fontFamily: font.regular,
                      fontSize: 14.5,
                      lineHeight: 20,
                      color: textColor,
                    }}
                  >
                    {message.body}
                  </Txt>
                ) : null}

                {/* 5. AI Translated Text Block (`aiAssistant` 'translate') */}
                {translatedText ? (
                  <View
                    style={[
                      styles.translatedBlock,
                      {
                        backgroundColor: gradient
                          ? "rgba(255,255,255,0.16)"
                          : theme.surfaceAi,
                        borderColor: gradient
                          ? "rgba(255,255,255,0.28)"
                          : theme.border,
                      },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Ionicons
                        name="sparkles"
                        size={11}
                        color={gradient ? "#FFFFFF" : theme.violet}
                      />
                      <Txt
                        style={{
                          fontFamily: font.heavy,
                          fontSize: 10.5,
                          color: gradient ? "#FFFFFF" : theme.toneText.violet,
                        }}
                      >
                        AI Translation
                      </Txt>
                    </View>
                    <Txt
                      style={{
                        fontFamily: font.regular,
                        fontSize: 13,
                        lineHeight: 18,
                        color: textColor,
                      }}
                    >
                      {translatedText}
                    </Txt>
                  </View>
                ) : null}
              </>
            )}
          </Pressable>

          {/* Reactions Row */}
          {message.reactions.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 4,
                marginTop: -6,
                paddingHorizontal: 4,
              }}
            >
              {message.reactions.map((r) => (
                <Pressable
                  key={r.emoji}
                  onPress={() => onReact(r.emoji)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.emoji} ${r.count}${
                    r.mine
                      ? ", you reacted. Tap to remove"
                      : ". Tap to react"
                  }`}
                  hitSlop={6}
                  style={[
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 3,
                      paddingHorizontal: 7,
                      height: 22,
                      borderRadius: radius.pill,
                      backgroundColor: r.mine
                        ? theme.tints.violet
                        : theme.surface,
                      borderWidth: 1,
                      borderColor: r.mine ? theme.violet : theme.border,
                    },
                    shadow.card,
                  ]}
                >
                  <Txt style={{ fontSize: 12, lineHeight: 15 }}>{r.emoji}</Txt>
                  <Txt
                    style={{
                      fontFamily: font.bold,
                      fontSize: 11,
                      lineHeight: 14,
                      color: r.mine ? theme.toneText.violet : theme.muted,
                    }}
                  >
                    {r.count}
                  </Txt>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Timestamp & Read Receipt ("Seen", "Sent", "Sending…") */}
          {showTime || receipt ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                paddingHorizontal: 4,
              }}
            >
              {showTime ? (
                <Txt
                  style={{
                    fontFamily: font.regular,
                    fontSize: 11,
                    lineHeight: 14,
                    color: theme.subtle,
                  }}
                >
                  {timeAgo(message.createdAt)}
                  {message.editedAt && !message.deleted ? " · edited" : ""}
                </Txt>
              ) : null}
              {receipt ? (
                <>
                  {showTime ? (
                    <Txt
                      style={{
                        fontSize: 11,
                        lineHeight: 14,
                        color: theme.subtle,
                      }}
                    >
                      ·
                    </Txt>
                  ) : null}
                  <Ionicons
                    name={
                      receipt === "Seen"
                        ? "checkmark-done"
                        : receipt === "Sending…"
                          ? "time-outline"
                          : "checkmark"
                    }
                    size={13}
                    color={receipt === "Seen" ? theme.violet : theme.subtle}
                  />
                  <Txt
                    style={{
                      fontFamily: font.semibold,
                      fontSize: 11,
                      lineHeight: 14,
                      color:
                        receipt === "Seen"
                          ? theme.toneText.violet
                          : theme.subtle,
                    }}
                  >
                    {receipt}
                  </Txt>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      </Animated.View>

      {/* Full-Screen Image Lightbox Modal */}
      <Modal
        visible={Boolean(lightboxUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUri(null)}
      >
        <View style={styles.lightboxBackdrop}>
          <PressableScale
            onPress={() => setLightboxUri(null)}
            accessibilityRole="button"
            accessibilityLabel="Close full screen image"
            scaleTo={0.9}
            style={styles.lightboxCloseBtn}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </PressableScale>
          {lightboxUri ? (
            <Image
              source={{ uri: lightboxUri }}
              cachePolicy="memory-disk"
              contentFit="contain"
              style={styles.lightboxImage}
            />
          ) : null}
        </View>
      </Modal>

      {/* Built-in Long-Press Actions Sheet (React, Reply, Copy, Translate, Delete) */}
      <Sheet
        visible={actionSheetOpen}
        title="Message Options"
        onClose={() => setActionSheetOpen(false)}
      >
        <View style={{ gap: 12 }}>
          <View style={styles.quickReactionsRow}>
            {QUICK_REACTIONS.map((emoji) => (
              <PressableScale
                key={emoji}
                onPress={() => {
                  setActionSheetOpen(false);
                  onReact(emoji);
                }}
                accessibilityRole="button"
                accessibilityLabel={`React with ${emoji}`}
                scaleTo={0.88}
                style={[
                  styles.quickReactionCircle,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Txt style={{ fontSize: 22 }}>{emoji}</Txt>
              </PressableScale>
            ))}
          </View>

          {onReply ? (
            <PressableScale
              onPress={() => {
                setActionSheetOpen(false);
                onReply();
              }}
              accessibilityRole="button"
              accessibilityLabel="Reply to message"
              scaleTo={0.98}
              style={[
                styles.sheetRow,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons
                name="arrow-undo-outline"
                size={18}
                color={theme.violet}
              />
              <Txt
                style={{
                  fontFamily: font.bold,
                  fontSize: 14,
                  color: theme.ink,
                }}
              >
                Reply
              </Txt>
            </PressableScale>
          ) : null}

          <PressableScale
            onPress={() => {
              setActionSheetOpen(false);
              handleCopyText();
            }}
            accessibilityRole="button"
            accessibilityLabel="Copy message text"
            scaleTo={0.98}
            style={[
              styles.sheetRow,
              {
                backgroundColor: theme.surfaceAlt,
                borderColor: theme.border,
              },
            ]}
          >
            <Ionicons name="copy-outline" size={18} color={theme.ok} />
            <Txt
              style={{
                fontFamily: font.bold,
                fontSize: 14,
                color: theme.ink,
              }}
            >
              Copy Text
            </Txt>
          </PressableScale>

          {onTranslate ? (
            <PressableScale
              onPress={() => {
                setActionSheetOpen(false);
                onTranslate();
              }}
              accessibilityRole="button"
              accessibilityLabel="Translate message"
              scaleTo={0.98}
              style={[
                styles.sheetRow,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              <Ionicons
                name="language-outline"
                size={18}
                color={theme.blue}
              />
              <Txt
                style={{
                  fontFamily: font.bold,
                  fontSize: 14,
                  color: theme.ink,
                }}
              >
                {translating
                  ? "Translating…"
                  : translatedText
                    ? "Hide Translation"
                    : "Translate with AI ✨"}
              </Txt>
            </PressableScale>
          ) : null}

          {onDelete ? (
            <PressableScale
              onPress={() => {
                setActionSheetOpen(false);
                onDelete();
              }}
              accessibilityRole="button"
              accessibilityLabel="Delete message"
              scaleTo={0.98}
              style={[
                styles.sheetRow,
                {
                  backgroundColor: theme.tints.red,
                  borderColor: theme.danger,
                },
              ]}
            >
              <Ionicons name="trash-outline" size={18} color={theme.danger} />
              <Txt
                style={{
                  fontFamily: font.bold,
                  fontSize: 14,
                  color: theme.danger,
                }}
              >
                Delete Message
              </Txt>
            </PressableScale>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  imagePreviewBox: {
    width: 210,
    height: 160,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  cachedBubbleImage: {
    width: "100%",
    height: "100%",
  },
  lightboxExpandBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: "rgba(11, 10, 20, 0.68)",
  },
  voiceNotePlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 196,
    paddingVertical: 2,
  },
  voicePlayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  waveformBarsWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 2.5,
    height: 28,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
  translatedBlock: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
    marginTop: 2,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 4, 12, 0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxCloseBtn: {
    position: "absolute",
    top: 52,
    right: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  lightboxImage: {
    width: "92%",
    height: "78%",
  },
  quickReactionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  quickReactionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.card,
    borderWidth: 1,
  },
});
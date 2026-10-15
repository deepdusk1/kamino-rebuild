import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import type { ChatMessage } from "@/api/types";
import { PersonAvatar, personFromChip } from "@/components/k";
import { Txt } from "@/components/ui";
import { bubbleLook } from "@/lib/cosmetics";
import { timeAgo } from "@/lib/format";
import { parseSticker, previewText, stickerEmoji } from "@/lib/stickers";
import { font, radius, shadow, useTheme } from "@/theme";
import { MessageMedia } from "./MessageMedia";

type Props = {
  message: ChatMessage;
  mine: boolean;
  /** The message this one replies to, if it is in the loaded history. */
  replyTo?: ChatMessage;
  /** Show the sender's name above the bubble (group chats, first message of a run). */
  showName?: boolean;
  /** Show the sender's face (the last message of a run). Space is kept either way so bubbles line up. */
  showAvatar?: boolean;
  /** Show the time under the bubble (the last message of a run). */
  showTime?: boolean;
  /** "Seen" / "Sent" under your newest message in a DM. */
  receipt?: string | null;
  /** Briefly highlighted (a search result you jumped to). */
  highlighted?: boolean;
  onLongPress: () => void;
  onOpenProfile: () => void;
  onReact: (emoji: string) => void;
};

/**
 * One chat message. Yours: a violet → blue gradient bubble on the right with white text. Others: a white bubble with
 * a hairline on the left, with their face. A smaller corner on the speaker's side works like a speech-bubble tail.
 * Stickers are shown big without a bubble; a non-"soft" bubble style the author picked (glass, outline, bold) is kept.
 */
export function MessageBubble({ message, mine, replyTo, showName, showAvatar = true, showTime = true, receipt, highlighted, onLongPress, onOpenProfile, onReact }: Props) {
  const theme = useTheme();
  const look = bubbleLook(message.bubbleStyle, message.bubbleHue, theme.dark);
  const styled = message.bubbleStyle !== "soft";
  const sticker = message.deleted ? null : parseSticker(message.body);
  const gradient = mine && !styled && !message.deleted && !sticker;
  const bare = message.deleted || !!sticker;
  const textColor = gradient ? "#FFFFFF" : styled && look.color ? look.color : theme.ink;
  const background = bare ? "transparent" : gradient ? theme.violet : styled ? look.background : theme.surface;

  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ flexDirection: mine ? "row-reverse" : "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: showName ? 8 : 2, paddingBottom: showTime ? 6 : 1 }}>
      {mine ? null : showAvatar ? (
        <Pressable onPress={onOpenProfile} accessibilityRole="button" accessibilityLabel={`Open ${message.author.nickname}'s profile`} hitSlop={6} style={{ marginBottom: showTime ? 17 : 0 }}>
          <PersonAvatar person={personFromChip(message.author)} size={30} />
        </Pressable>
      ) : (
        <View style={{ width: 30 }} />
      )}
      <View style={{ maxWidth: "76%", alignItems: mine ? "flex-end" : "flex-start", gap: 3 }}>
        {showName && !mine ? <Txt style={{ fontFamily: font.bold, fontSize: 11.5, lineHeight: 15, color: theme.muted, marginLeft: 4 }}>{message.author.nickname}</Txt> : null}
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={250}
          accessibilityRole="button"
          accessibilityLabel={`${mine ? "You" : message.author.nickname}: ${message.deleted ? "deleted message" : previewText(message.body) || "attachment"}. ${timeAgo(message.createdAt)}. Long press for options.`}
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
              borderWidth: bare ? (message.deleted ? 1 : 0) : styled ? look.borderWidth : mine ? 0 : 1,
              borderColor: message.deleted ? theme.border : styled && look.borderColor ? look.borderColor : theme.border,
            },
            message.deleted && { paddingHorizontal: 12, paddingVertical: 7, borderStyle: "dashed" },
            !bare && !mine && shadow.card,
            highlighted && { borderWidth: 2, borderColor: theme.yellow },
          ]}
        >
          {gradient ? <LinearGradient colors={[theme.gradPrimary[0], theme.gradPrimary[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
          {replyTo ? (
            <View style={{ borderLeftWidth: 3, borderLeftColor: gradient ? "rgba(255,255,255,0.85)" : theme.violet, paddingLeft: 8, paddingVertical: 2, borderRadius: 2, backgroundColor: gradient ? "rgba(255,255,255,0.14)" : theme.tints.violet }}>
              <Txt style={{ fontFamily: font.bold, fontSize: 11.5, lineHeight: 15, color: gradient ? "#fff" : theme.toneText.violet }}>{replyTo.author.nickname}</Txt>
              <Txt numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 16, color: gradient ? "rgba(255,255,255,0.9)" : theme.text }}>
                {replyTo.deleted ? "Deleted message" : previewText(replyTo.body) || "Attachment"}
              </Txt>
            </View>
          ) : null}
          {message.deleted ? (
            <Txt style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, fontStyle: "italic", color: theme.subtle }}>Message deleted</Txt>
          ) : (
            <>
              {message.mediaKind ? <MessageMedia roomId={message.roomId} messageId={message.id} kind={message.mediaKind} onColor={gradient} /> : null}
              {sticker ? (
                <Txt accessibilityLabel="Sticker" style={{ fontSize: 64, lineHeight: 76 }}>{stickerEmoji(sticker)}</Txt>
              ) : message.body ? (
                <Txt style={{ fontFamily: font.regular, fontSize: 14.5, lineHeight: 20, color: textColor }}>{message.body}</Txt>
              ) : null}
            </>
          )}
        </Pressable>
        {message.reactions.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: -8, paddingHorizontal: 6 }}>
            {message.reactions.map((r) => (
              <Pressable
                key={r.emoji}
                onPress={() => onReact(r.emoji)}
                accessibilityRole="button"
                accessibilityLabel={`${r.emoji} ${r.count}${r.mine ? ", you reacted. Tap to remove" : ". Tap to react"}`}
                hitSlop={6}
                style={[{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, height: 22, borderRadius: radius.pill, backgroundColor: r.mine ? theme.tints.violet : theme.surface, borderWidth: 1, borderColor: r.mine ? theme.violet : theme.border }, shadow.card]}
              >
                <Txt style={{ fontSize: 12, lineHeight: 15 }}>{r.emoji}</Txt>
                <Txt style={{ fontFamily: font.bold, fontSize: 11, lineHeight: 14, color: r.mine ? theme.toneText.violet : theme.muted }}>{r.count}</Txt>
              </Pressable>
            ))}
          </View>
        ) : null}
        {showTime || receipt ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 }}>
            {showTime ? (
              <Txt style={{ fontFamily: font.regular, fontSize: 11, lineHeight: 14, color: theme.subtle }}>
                {timeAgo(message.createdAt)}
                {message.editedAt && !message.deleted ? " · edited" : ""}
              </Txt>
            ) : null}
            {receipt ? (
              <>
                {showTime ? <Txt style={{ fontSize: 11, lineHeight: 14, color: theme.subtle }}>·</Txt> : null}
                <Ionicons name={receipt === "Seen" ? "checkmark-done" : "checkmark"} size={13} color={receipt === "Seen" ? theme.violet : theme.subtle} />
                <Txt style={{ fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: receipt === "Seen" ? theme.toneText.violet : theme.subtle }}>{receipt}</Txt>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

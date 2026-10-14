import { Ionicons } from "@expo/vector-icons";
import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton, PersonAvatar, VerifiedTick, type IconName, type Person } from "@/components/k";
import { PressableScale, Txt } from "@/components/ui";
import { font, radius, shadow, useTheme } from "@/theme";

/**
 * The frame of a chat room in the new look: the header (back, face, name, status, actions), the input bar (styled
 * like the post page's comment bar) and the "is typing…" bubble.
 */

// ── Header ───────────────────────────────────────────────────────────────────

type ChatHeaderProps = {
  person: Person;
  title: string;
  verified?: boolean;
  /** Green dot on the face (DMs). */
  online?: boolean;
  /** "Online", "typing…", "Anime Haven · 12 people" … */
  subtitle?: string;
  subtitleTone?: "accent" | "green" | "muted";
  onBack: () => void;
  onPressTitle?: () => void;
  actions: readonly { icon: IconName; label: string; onPress: () => void }[];
};

export function ChatHeader({ person, title, verified, online, subtitle, subtitleTone = "muted", onBack, onPressTitle, actions }: ChatHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const subColor = subtitleTone === "accent" ? theme.accent : subtitleTone === "green" ? theme.toneText.green : theme.muted;
  return (
    <View style={[{ paddingTop: insets.top + 4, paddingBottom: 8, paddingLeft: 6, paddingRight: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border }, shadow.card]}>
      <PressableScale onPress={onBack} accessibilityLabel="Go back" scaleTo={0.85} style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="chevron-back" size={26} color={theme.ink} />
      </PressableScale>
      <PressableScale onPress={onPressTitle} disabled={!onPressTitle} accessibilityLabel={onPressTitle ? `${title}. Open profile` : title} scaleTo={0.98} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
        <PersonAvatar person={person} size={40} online={online} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Txt accessibilityRole="header" numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 16, lineHeight: 21, color: theme.ink, flexShrink: 1 }}>{title}</Txt>
            {verified ? <VerifiedTick size={14} /> : null}
          </View>
          {subtitle ? (
            <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: subColor }}>{subtitle}</Txt>
          ) : null}
        </View>
      </PressableScale>
      {actions.map((a) => (
        <IconButton key={a.label} icon={a.icon} label={a.label} onPress={a.onPress} size={22} />
      ))}
    </View>
  );
}

// ── Input bar ────────────────────────────────────────────────────────────────

type ChatInputBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** Mic button when there is nothing typed (voice notes). */
  onRecord?: () => void;
  recording?: { seconds: string } | null;
  onAttach?: () => void;
  onSticker?: () => void;
  onCamera?: () => void;
  sending?: boolean;
  editing?: boolean;
  placeholder?: string;
  /** Something above the bar: the reply / edit strip. */
  top?: ReactNode;
};

/** The sticky message bar: ＋ attach, a rounded input with sticker and camera buttons, and a violet send / mic circle. */
export function ChatInputBar({ value, onChangeText, onSend, onRecord, recording, onAttach, onSticker, onCamera, sending, editing, placeholder = "Message…", top }: ChatInputBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const hasText = !!value.trim();
  const showSend = hasText || editing || !onRecord;
  return (
    <View style={{ backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border }}>
      {top}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 + Math.max(insets.bottom - 4, 0) }}>
        {recording ? (
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: theme.tints.red }}>
            <RecordingDot />
            <Txt style={{ fontFamily: font.bold, fontSize: 13.5, lineHeight: 18, color: theme.danger }}>Recording {recording.seconds}</Txt>
            <Txt style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>tap ■ to send</Txt>
          </View>
        ) : (
          <>
            {onAttach && !editing ? (
              <PressableScale onPress={onAttach} accessibilityLabel="Attach a photo or video" scaleTo={0.85} style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="add-circle" size={30} color={theme.violet} />
              </PressableScale>
            ) : null}
            <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end", backgroundColor: theme.surfaceAlt, borderRadius: 20, paddingLeft: 14, paddingRight: 4, minHeight: 40 }}>
              <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={theme.subtle}
                accessibilityLabel="Message"
                multiline
                maxLength={2000}
                selectionColor={theme.accent}
                style={{ flex: 1, fontFamily: font.regular, fontSize: 14.5, lineHeight: 19, color: theme.ink, paddingTop: 10, paddingBottom: 10, maxHeight: 120, outlineWidth: 0 }}
              />
              {onSticker && !editing ? (
                <PressableScale onPress={onSticker} accessibilityLabel="Send a sticker" scaleTo={0.85} style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="happy-outline" size={21} color={theme.muted} />
                </PressableScale>
              ) : null}
              {onCamera && !editing && !hasText ? (
                <PressableScale onPress={onCamera} accessibilityLabel="Send a photo" scaleTo={0.85} style={{ width: 36, height: 40, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="image-outline" size={20} color={theme.muted} />
                </PressableScale>
              ) : null}
            </View>
          </>
        )}
        <PressableScale
          onPress={showSend && !recording ? onSend : (onRecord ?? onSend)}
          disabled={sending || (showSend && !recording && !hasText && !editing)}
          accessibilityLabel={recording ? "Finish and send voice message" : showSend ? (editing ? "Save edit" : "Send message") : "Record a voice message"}
          scaleTo={0.88}
          style={[{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: recording ? theme.danger : theme.violet, opacity: sending || (showSend && !recording && !hasText && !editing) ? 0.5 : 1 }, shadow.glow(theme.violet, 0.3)]}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name={recording ? "stop" : showSend ? (editing ? "checkmark" : "arrow-up") : "mic"} size={20} color="#fff" />
          )}
        </PressableScale>
      </View>
    </View>
  );
}

function RecordingDot() {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduce) o.set(withRepeat(withSequence(withTiming(0.3, { duration: 500 }), withTiming(1, { duration: 500 })), -1));
  }, [o, reduce]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.danger }, style]} />;
}

// ── Typing bubble ────────────────────────────────────────────────────────────

/** "Mika is typing…" with three bouncing dots, shown at the bottom of the conversation. */
export function TypingBubble({ names }: { names: string[] }) {
  const theme = useTheme();
  const label = names.length === 1 ? `${names[0]} is typing…` : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : `${names.length} people are typing…`;
  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 6 }}>
      <View style={[{ flexDirection: "row", gap: 4, paddingHorizontal: 12, height: 32, alignItems: "center", borderRadius: 16, borderBottomLeftRadius: 6, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, marginLeft: 38 }, shadow.card]}>
        {[0, 1, 2].map((i) => <Dot key={i} delay={i * 160} />)}
      </View>
      <Txt style={{ fontFamily: font.semibold, fontSize: 11.5, lineHeight: 15, color: theme.muted }}>{label}</Txt>
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!reduce) y.set(withDelay(delay, withRepeat(withSequence(withTiming(-3, { duration: 260 }), withTiming(0, { duration: 260 }), withTiming(0, { duration: 300 })), -1)));
  }, [y, delay, reduce]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.violet, opacity: 0.75 }, style]} />;
}

// ── Banners ──────────────────────────────────────────────────────────────────

/** A tinted strip under the header (in a call, watching together, request sent). */
export function ChatBanner({ icon, text, action, onPress, tone = "violet" }: { icon: IconName; text: string; action?: string; onPress?: () => void; tone?: "violet" | "blue" | "orange" | "green" }) {
  const theme = useTheme();
  const body = (
    <>
      <Ionicons name={icon} size={18} color={theme.toneText[tone]} />
      <Txt numberOfLines={2} style={{ flex: 1, fontFamily: font.semibold, fontSize: 12.5, lineHeight: 17, color: theme.toneText[tone] }}>{text}</Txt>
      {action ? (
        <View style={{ height: 28, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: theme[tone], justifyContent: "center" }}>
          <Txt style={{ fontFamily: font.bold, fontSize: 12, lineHeight: 15, color: "#fff" }}>{action}</Txt>
        </View>
      ) : null}
    </>
  );
  const style = { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, marginHorizontal: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, borderRadius: 14, backgroundColor: theme.tints[tone] };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={action ? `${text}. ${action}` : text} scaleTo={0.98} style={style}>
      {body}
    </PressableScale>
  );
}

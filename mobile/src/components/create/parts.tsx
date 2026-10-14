import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, Switch, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { Picture, type IconName } from "@/components/k";
import { PressableScale, Txt } from "@/components/ui";
import { font, radius, shadow, useTheme, type Tone } from "@/theme";

/**
 * Small building blocks of the Create screen (07-create mockup). They take plain props and never fetch.
 */

// ── Type tiles (Post · Story · Community · Live Room · Event) ────────────────

/** The coloured artwork for each tile. Drawn with gradients + icons so it matches the mockup's glossy icons. */
function TileArt({ kind, selected }: { kind: CreateKind; selected: boolean }) {
  const theme = useTheme();
  switch (kind) {
    case "post":
      return <Ionicons name="pencil" size={25} color={selected ? "#fff" : theme.violet} />;
    case "story":
      return (
        <View style={{ width: 30, height: 30 }}>
          <LinearGradient colors={["#FF4FA3", "#FF9F1A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 15, height: 15, borderRadius: 8, borderWidth: 2.5, borderColor: "rgba(255,255,255,0.9)" }} />
          </LinearGradient>
          <View style={{ position: "absolute", right: -1, bottom: -1, width: 15, height: 15, borderRadius: 8, backgroundColor: "#F43F8E", borderWidth: 1.5, borderColor: theme.surface, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="add" size={11} color="#fff" />
          </View>
        </View>
      );
    case "community":
      return <Ionicons name="people" size={31} color="#2E72FE" />;
    case "live":
      return <Ionicons name="radio-outline" size={30} color="#C13CF0" />;
    case "event":
      return (
        <LinearGradient colors={["#FF5C8A", "#FF3D6E"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 27, height: 26, borderRadius: 7, alignItems: "center", justifyContent: "center" }}>
          <View style={{ position: "absolute", top: -3, left: 6, width: 3, height: 7, borderRadius: 2, backgroundColor: "#E0245E" }} />
          <View style={{ position: "absolute", top: -3, right: 6, width: 3, height: 7, borderRadius: 2, backgroundColor: "#E0245E" }} />
          <View style={{ width: 18, height: 11, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.88)", marginTop: 5, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: "#FF5C8A" }} />
            <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: "#FF5C8A" }} />
          </View>
        </LinearGradient>
      );
  }
}

export type CreateKind = "post" | "story" | "community" | "live" | "event";

export const CREATE_KINDS: readonly { key: CreateKind; label: string; hint: string }[] = [
  { key: "post", label: "Post", hint: "Write a post" },
  { key: "story", label: "Story", hint: "Pictures that disappear after 24 hours" },
  { key: "community", label: "Community", hint: "Start a new community" },
  { key: "live", label: "Live Room", hint: "Start a live voice room" },
  { key: "event", label: "Event", hint: "Schedule an event (community leaders)" },
];

/** One square-ish tile; the selected one is a violet gradient with white text. */
export function TypeTile({ kind, label, hint, selected, onPress, style }: { kind: CreateKind; label: string; hint: string; selected: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      scaleTo={0.94}
      style={[
        { height: 62, borderRadius: 14, alignItems: "center", justifyContent: "center", gap: 5, overflow: "hidden", backgroundColor: theme.surface, borderWidth: selected ? 0 : 1, borderColor: theme.border },
        selected ? shadow.glow("#7B4DFB", 0.35) : shadow.card,
        style,
      ]}
    >
      {selected ? <LinearGradient colors={["#9A5BFC", "#6B4DFB"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
      <View style={{ height: 31, justifyContent: "center" }}>
        <TileArt kind={kind} selected={selected} />
      </View>
      <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 11.5, lineHeight: 14, color: selected ? "#fff" : theme.ink }}>{label}</Txt>
    </PressableScale>
  );
}

// ── Media row ────────────────────────────────────────────────────────────────

/** The dashed "+ Add Photos" tile. */
export function AddMediaTile({ width, height, onPress, label, busy }: { width: number; height: number; onPress: () => void; label: string; busy?: boolean }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={busy}
      accessibilityLabel={label}
      scaleTo={0.95}
      style={{ width, height, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.dark ? theme.violet : "#CDB8FB", backgroundColor: theme.surface, alignItems: "center", justifyContent: "center", gap: 6, padding: 6, opacity: busy ? 0.6 : 1 }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.violet, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="add" size={18} color="#fff" />
      </View>
      <Txt style={{ fontFamily: font.semibold, fontSize: 10.5, lineHeight: 13, color: theme.toneText.violet, textAlign: "center" }}>{label}</Txt>
    </PressableScale>
  );
}

/** A chosen picture with a dark round ✕ in the corner. */
export function MediaThumb({ uri, width, height, index, onRemove }: { uri: string; width: number; height: number; index: number; onRemove: () => void }) {
  return (
    <Picture source={uri} radius={12} style={{ width, height }}>
      <PressableScale onPress={onRemove} accessibilityLabel={`Remove picture ${index + 1}`} hitSlop={10} scaleTo={0.85} style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(40,38,52,0.72)", alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="close" size={15} color="#fff" />
      </PressableScale>
    </Picture>
  );
}

// ── Add Poll / Add Location / Add Link ───────────────────────────────────────

export function ActionButton({ icon, label, tone, active, onPress }: { icon: IconName; label: string; tone: Tone; active?: boolean; onPress: () => void }) {
  const theme = useTheme();
  const color = tone === "violet" ? theme.violet : tone === "blue" ? theme.blue : theme.pink;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      hitSlop={6}
      scaleTo={0.95}
      style={{ flex: 1, height: 32, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: active ? theme.tints[tone] : theme.surfaceAlt, borderWidth: 1, borderColor: active ? color : "transparent" }}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 12, lineHeight: 15, color: theme.toneText[tone] }}>{label}</Txt>
    </PressableScale>
  );
}

/** A one-line input with an icon and a ✕ (location, link). */
export function InlineInput({ icon, tone, value, onChangeText, placeholder, label, onRemove, keyboardType }: { icon: IconName; tone: Tone; value: string; onChangeText: (t: string) => void; placeholder: string; label: string; onRemove: () => void; keyboardType?: "default" | "url" }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingLeft: 12, paddingRight: 2, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }}>
      <Ionicons name={icon} size={17} color={theme[tone]} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.subtle}
        accessibilityLabel={label}
        autoCapitalize={keyboardType === "url" ? "none" : "sentences"}
        autoCorrect={keyboardType !== "url"}
        keyboardType={keyboardType}
        maxLength={keyboardType === "url" ? 500 : 60}
        selectionColor={theme.accent}
        style={{ flex: 1, fontFamily: font.regular, fontSize: 13.5, color: theme.ink, paddingVertical: 8, outlineWidth: 0 }}
      />
      <PressableScale onPress={onRemove} accessibilityLabel={`Remove ${label.toLowerCase()}`} scaleTo={0.85} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="close-circle" size={19} color={theme.subtle} />
      </PressableScale>
    </View>
  );
}

// ── Poll editor ──────────────────────────────────────────────────────────────

export function PollEditor({ options, onChange, onRemove, max }: { options: string[]; onChange: (options: string[]) => void; onRemove: () => void; max: number }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 8, padding: 10, borderRadius: 14, backgroundColor: theme.tints.violet }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="stats-chart" size={15} color={theme.violet} />
        <Txt style={{ flex: 1, fontFamily: font.bold, fontSize: 13, lineHeight: 17, color: theme.toneText.violet }}>Poll options</Txt>
        <PressableScale onPress={onRemove} accessibilityLabel="Remove poll" scaleTo={0.85} style={{ height: 32, paddingHorizontal: 8, justifyContent: "center" }}>
          <Txt style={{ fontFamily: font.semibold, fontSize: 12, lineHeight: 15, color: theme.toneText.violet }}>Remove</Txt>
        </PressableScale>
      </View>
      {options.map((option, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <TextInput
            value={option}
            onChangeText={(text) => onChange(options.map((o, j) => (j === i ? text : o)))}
            placeholder={`Option ${i + 1}`}
            placeholderTextColor={theme.subtle}
            accessibilityLabel={`Poll option ${i + 1}`}
            maxLength={200}
            selectionColor={theme.accent}
            style={{ flex: 1, height: 38, borderRadius: 10, paddingHorizontal: 12, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, fontFamily: font.regular, fontSize: 13.5, color: theme.ink, outlineWidth: 0 }}
          />
          {options.length > 2 ? (
            <PressableScale onPress={() => onChange(options.filter((_, j) => j !== i))} accessibilityLabel={`Remove option ${i + 1}`} scaleTo={0.85} style={{ width: 32, height: 38, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="close" size={18} color={theme.muted} />
            </PressableScale>
          ) : null}
        </View>
      ))}
      {options.length < max ? (
        <PressableScale onPress={() => onChange([...options, ""])} accessibilityLabel="Add an option" scaleTo={0.95} style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", height: 32 }}>
          <Ionicons name="add" size={16} color={theme.toneText.violet} />
          <Txt style={{ fontFamily: font.semibold, fontSize: 12.5, lineHeight: 16, color: theme.toneText.violet }}>Add option</Txt>
        </PressableScale>
      ) : null}
    </View>
  );
}

// ── Tags ─────────────────────────────────────────────────────────────────────

const TAG_TONES: readonly Tone[] = ["pink", "orange", "blue", "violet"];

/** Tag chips: chosen tags have a coloured ring and a check; suggestions are plain tinted chips you tap to add. */
export function TagChips({ chosen, suggestions, onToggle, onAdd }: { chosen: string[]; suggestions: string[]; onToggle: (tag: string) => void; onAdd: () => void }) {
  const theme = useTheme();
  const lower = new Set(chosen.map((t) => t.toLowerCase()));
  const all = [...chosen, ...suggestions.filter((s) => !lower.has(s.toLowerCase()))];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {all.map((tag, i) => {
        const on = lower.has(tag.toLowerCase());
        const tone = TAG_TONES[i % TAG_TONES.length]!;
        return (
          <PressableScale
            key={tag}
            onPress={() => onToggle(tag)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`Tag ${tag}`}
            accessibilityHint={on ? "Removes the tag" : "Adds the tag"}
            hitSlop={8}
            scaleTo={0.94}
            style={{ height: 27, paddingHorizontal: 10, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: theme.tints[tone], borderWidth: 1.5, borderColor: on ? theme[tone] : "transparent" }}
          >
            {on ? <Ionicons name="checkmark" size={12} color={theme.toneText[tone]} /> : null}
            <Txt style={{ fontFamily: font.semibold, fontSize: 12.5, lineHeight: 16, color: theme.toneText[tone] }}>#{tag}</Txt>
          </PressableScale>
        );
      })}
      <PressableScale onPress={onAdd} accessibilityLabel="Add a tag" hitSlop={8} scaleTo={0.94} style={{ height: 27, paddingHorizontal: 10, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.dark ? theme.violet : "#CDB8FB", backgroundColor: theme.surface }}>
        <Ionicons name="add" size={15} color={theme.toneText.violet} />
        <Txt style={{ fontFamily: font.semibold, fontSize: 12.5, lineHeight: 16, color: theme.toneText.violet }}>Add Tag</Txt>
      </PressableScale>
    </View>
  );
}

// ── Little rows ──────────────────────────────────────────────────────────────

/** Icon + bold label (+ optional right side) — "Post to", "Tags". */
export function RowTitle({ icon, emoji, title, subtitle, right }: { icon?: IconName; emoji?: string; title: string; subtitle?: string; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9, minHeight: 28 }}>
        <View style={{ width: 22, alignItems: "center" }}>
          {icon ? <Ionicons name={icon} size={19} color={theme.violet} /> : <Txt style={{ fontFamily: font.heavy, fontSize: 21, lineHeight: 24, color: theme.violet }}>{emoji}</Txt>}
        </View>
        <Txt accessibilityRole="header" style={{ flex: 1, fontFamily: font.bold, fontSize: 14, lineHeight: 18, color: theme.ink }}>{title}</Txt>
        {right}
      </View>
      {subtitle ? <Txt style={{ marginLeft: 31, fontFamily: font.regular, fontSize: 11.5, lineHeight: 15, color: theme.muted }}>{subtitle}</Txt> : null}
    </View>
  );
}

/** A label with a switch. */
export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 }}>
      <View style={{ flex: 1 }}>
        <Txt style={{ fontFamily: font.semibold, fontSize: 13.5, lineHeight: 18, color: theme.ink }}>{label}</Txt>
        {hint ? <Txt style={{ fontFamily: font.regular, fontSize: 11.5, lineHeight: 15, color: theme.muted }}>{hint}</Txt> : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: theme.violet, false: theme.border }} thumbColor="#ffffff" ios_backgroundColor={theme.border} />
    </View>
  );
}

/** A small rounded option button used in sheets (Public / Members only, drafts…). */
export function OptionRow({ icon, title, text, selected, onPress, right }: { icon: IconName; title: string; text?: string; selected?: boolean; onPress: () => void; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected: !!selected }}
      scaleTo={0.98}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: selected ? theme.violet : theme.border, backgroundColor: selected ? theme.tints.violet : theme.surface }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: selected ? theme.surface : theme.tints.violet }}>
        <Ionicons name={icon} size={18} color={theme.violet} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 14, lineHeight: 18, color: theme.ink }}>{title}</Txt>
        {text ? <Txt numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>{text}</Txt> : null}
      </View>
      {right ?? (selected ? <Ionicons name="checkmark-circle" size={22} color={theme.violet} /> : null)}
    </PressableScale>
  );
}

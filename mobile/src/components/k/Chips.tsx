import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { font, radius, shadow, space, useTheme, type Tone } from "@/theme";
import { PressableScale, Txt } from "@/components/ui";
import { HOME_CATEGORIES, type Category } from "./categories";
import type { IconName } from "./types";

// ── SectionHeader ────────────────────────────────────────────────────────────

type SectionHeaderProps = {
  title: string;
  /** A colourful emoji on the left ("✨", "🔥", "⭐") … */
  emoji?: string;
  /** … or an Ionicon in `iconColor` (default violet). */
  icon?: IconName;
  iconColor?: string;
  /** Right-hand link text (default "See All"). Shown only with `onAction`. */
  actionLabel?: string;
  onAction?: () => void;
  /** Arrow style after the link: "arrow" (→, Home) or "chevron" (>, Explore/Community). */
  actionIcon?: "arrow" | "chevron";
  /** Anything else for the right side (e.g. a "New Message (+)" button). Replaces the link. */
  right?: ReactNode;
  /** Smaller title (17px) for sub-sections ("Today", "Moderators"). */
  small?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Coloured icon + bold title on the left, violet "See All →" on the right. */
export function SectionHeader({ title, emoji, icon, iconColor, actionLabel = "See All", onAction, actionIcon = "arrow", right, small, style }: SectionHeaderProps) {
  const theme = useTheme();
  const size = small ? 14.5 : 15.5;
  return (
    <View style={[styles.sectionRow, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
        {emoji ? <Txt style={{ fontSize: size + 1, lineHeight: size + 6 }}>{emoji}</Txt> : null}
        {icon ? <Ionicons name={icon} size={size + 3} color={iconColor ?? theme.violet} /> : null}
        <Txt accessibilityRole="header" numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: size, lineHeight: size + 6, letterSpacing: -0.2, color: theme.ink, flexShrink: 1 }}>
          {title}
        </Txt>
      </View>
      {right ??
        (onAction ? (
          <PressableScale onPress={onAction} accessibilityLabel={`${actionLabel}: ${title}`} hitSlop={10} scaleTo={0.94} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 }}>
            <Txt style={{ color: theme.accent, fontFamily: font.semibold, fontSize: 12.5, lineHeight: 16 }}>{actionLabel}</Txt>
            <Ionicons name={actionIcon === "arrow" ? "arrow-forward" : "chevron-forward"} size={15} color={theme.accent} />
          </PressableScale>
        ) : null)}
    </View>
  );
}

// ── CategoryChips ────────────────────────────────────────────────────────────

type CategoryChipsProps = {
  /** Which chips (default: the Home set). See `CATEGORIES`, `HOME_CATEGORIES`, `EXPLORE_CATEGORIES`. */
  items?: readonly Category[];
  /** Selected key. */
  value: string;
  onChange: (key: string) => void;
  /** Shows a round ">" button at the end (Explore). */
  onMore?: () => void;
  /** Side padding of the scroll row (default 16, so the row lines up with the screen edge). */
  inset?: number;
  style?: StyleProp<ViewStyle>;
};

/** A horizontal row of emoji category chips. Selected = `gradPrimary` pill with white text. */
export function CategoryChips({ items = HOME_CATEGORIES, value, onChange, onMore, inset = space.lg, style }: CategoryChipsProps) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ paddingHorizontal: inset, gap: 5, alignItems: "center", paddingVertical: 6 }}>
      {items.map((c) => (
        <CategoryChip key={c.key} category={c} selected={c.key === value} onPress={() => onChange(c.key)} />
      ))}
      {onMore ? (
        <PressableScale onPress={onMore} accessibilityLabel="More categories" hitSlop={6} scaleTo={0.9} style={[styles.moreBtn, { backgroundColor: theme.surface, borderColor: theme.border }, shadow.card]}>
          <Ionicons name="chevron-forward" size={16} color={theme.ink} />
        </PressableScale>
      ) : null}
    </ScrollView>
  );
}

/** One category chip (exported for wrapped grids such as the Welcome screen). */
export function CategoryChip({ category, selected, onPress, size = "md" }: { category: Category; selected?: boolean; onPress?: () => void; size?: "md" | "lg" }) {
  const theme = useTheme();
  const lg = size === "lg";
  const inner = (
    <View
      style={[
        styles.chip,
        { height: lg ? 38 : 28, paddingHorizontal: lg ? 13 : 9, backgroundColor: selected ? "transparent" : theme.surface, borderColor: selected ? "transparent" : theme.border },
        selected ? shadow.glow(theme.gradPrimary[0], 0.3) : null,
      ]}
    >
      {selected ? <LinearGradient colors={theme.gradPrimary} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]} /> : null}
      {category.emoji ? (
        <Txt style={{ fontSize: lg ? 16 : 13, lineHeight: lg ? 20 : 17 }}>{category.emoji}</Txt>
      ) : (
        <Ionicons name="grid" size={lg ? 15 : 13} color={selected ? "#fff" : theme.ink} />
      )}
      <Txt style={{ fontFamily: selected ? font.bold : font.semibold, fontSize: lg ? 13.5 : 11.5, lineHeight: lg ? 18 : 15, color: selected ? "#fff" : theme.ink }}>{category.label}</Txt>
    </View>
  );
  if (!onPress) return inner;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={category.label} accessibilityRole="button" accessibilityState={{ selected: !!selected }} hitSlop={lg ? 3 : 8} scaleTo={0.94}>
      {inner}
    </PressableScale>
  );
}

// ── FilterPills ──────────────────────────────────────────────────────────────

export type FilterItem = {
  key: string;
  label: string;
  icon?: IconName;
  emoji?: string;
  /** Unselected pills get this colour's light wash and icon colour (no tone = white with a border). */
  tone?: Tone;
  /** A small count after the label, e.g. Requests (3). */
  count?: number;
};

type FilterPillsProps = {
  items: readonly FilterItem[];
  value: string;
  onChange: (key: string) => void;
  /** "scroll" (default) scrolls sideways; "fill" shares the width evenly (Notifications). */
  layout?: "scroll" | "fill";
  inset?: number;
  style?: StyleProp<ViewStyle>;
};

/** Icon pills for filtering a list (All / Social / Community / Events; All Chats / Direct Messages / …). */
export function FilterPills({ items, value, onChange, layout = "scroll", inset = space.lg, style }: FilterPillsProps) {
  const pills = items.map((item) => <FilterPill key={item.key} item={item} selected={item.key === value} onPress={() => onChange(item.key)} fill={layout === "fill"} />);
  if (layout === "fill") return <View style={[{ flexDirection: "row", gap: 8, paddingHorizontal: inset }, style]}>{pills}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ paddingHorizontal: inset, gap: 8, paddingVertical: 6 }}>
      {pills}
    </ScrollView>
  );
}

function FilterPill({ item, selected, onPress, fill }: { item: FilterItem; selected: boolean; onPress: () => void; fill: boolean }) {
  const theme = useTheme();
  const iconColor = selected ? "#fff" : item.tone ? theme[item.tone] : theme.toneText.violet;
  const label = item.count ? `${item.label} (${item.count})` : item.label;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      scaleTo={0.95}
      style={[
        styles.filter,
        fill && { flexGrow: 1, flexShrink: 1, flexBasis: "auto", paddingHorizontal: 8, gap: 4 },
        { backgroundColor: selected ? "transparent" : item.tone ? theme.tints[item.tone] : theme.surface, borderColor: selected || item.tone ? "transparent" : theme.border },
        selected ? shadow.glow(theme.gradPrimary[0], 0.3) : null,
      ]}
    >
      {selected ? <LinearGradient colors={theme.gradPrimary} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]} /> : null}
      {item.emoji ? <Txt style={{ fontSize: fill ? 14 : 16, lineHeight: 20 }}>{item.emoji}</Txt> : item.icon ? <Ionicons name={item.icon} size={fill ? 14 : 16} color={iconColor} /> : null}
      <Txt numberOfLines={1} style={{ fontFamily: selected ? font.bold : font.semibold, fontSize: fill ? 12 : 12.5, lineHeight: 16, color: selected ? "#fff" : theme.ink, flexShrink: 1 }}>{label}</Txt>
    </PressableScale>
  );
}

// ── TabsUnderline ────────────────────────────────────────────────────────────

type TabsUnderlineProps = {
  tabs: readonly { key: string; label: string; icon?: IconName }[];
  value: string;
  onChange: (key: string) => void;
  style?: StyleProp<ViewStyle>;
};

/** Icon + label tabs with a violet underline under the chosen one (community Posts / Rooms / Events / Media). */
export function TabsUnderline({ tabs, value, onChange, style }: TabsUnderlineProps) {
  const theme = useTheme();
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: theme.border }, style]}>
      {tabs.map((t) => {
        const active = t.key === value;
        const color = active ? theme.accent : theme.muted;
        return (
          <PressableScale key={t.key} onPress={() => onChange(t.key)} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: active }} scaleTo={0.96} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 40 }}>
              {t.icon ? <Ionicons name={active ? (t.icon.replace(/-outline$/, "") as IconName) : t.icon} size={19} color={color} /> : null}
              <Txt style={{ fontFamily: active ? font.bold : font.semibold, fontSize: 14, lineHeight: 18, color }}>{t.label}</Txt>
            </View>
            <View style={{ height: 3, alignSelf: "stretch", marginHorizontal: 8, borderRadius: 2, backgroundColor: active ? theme.accent : "transparent", marginBottom: -1 }} />
          </PressableScale>
        );
      })}
    </View>
  );
}

// ── HashtagChips ─────────────────────────────────────────────────────────────

const TAG_TONES: readonly Tone[] = ["pink", "orange", "violet", "blue"];

type HashtagChipsProps = {
  /** Tags with or without the leading "#". */
  tags: readonly string[];
  onPress?: (tag: string) => void;
  /** Shows a dashed "+ Add Tag" chip at the end. */
  onAdd?: () => void;
  addLabel?: string;
  /** Scroll sideways in one row instead of wrapping (Explore "Trending Tags"). */
  scroll?: boolean;
  inset?: number;
  style?: StyleProp<ViewStyle>;
};

/** Tinted hashtag chips with coloured text (pink, orange, violet, blue, repeating). */
export function HashtagChips({ tags, onPress, onAdd, addLabel = "Add Tag", scroll, inset = 0, style }: HashtagChipsProps) {
  const theme = useTheme();
  const chips = tags.map((raw, i) => {
    const tag = raw.replace(/^#/, "");
    const tone = TAG_TONES[i % TAG_TONES.length]!;
    return (
      <Pillish key={`${tag}-${i}`} label={`#${tag}`} bg={theme.tints[tone]} color={theme.toneText[tone]} onPress={onPress ? () => onPress(tag) : undefined} />
    );
  });
  const add = onAdd ? (
    <PressableScale key="__add" onPress={onAdd} accessibilityLabel={addLabel} hitSlop={6} scaleTo={0.94} style={[styles.tag, { borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.accent, backgroundColor: theme.surface, flexDirection: "row", gap: 6 }]}>
      <Ionicons name="add" size={14} color={theme.accent} />
      <Txt style={{ fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: theme.accent }}>{addLabel}</Txt>
    </PressableScale>
  ) : null;
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style} contentContainerStyle={{ gap: 8, paddingHorizontal: inset, paddingVertical: 4 }}>
        {chips}
        {add}
      </ScrollView>
    );
  }
  return (
    <View style={[{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: inset }, style]}>
      {chips}
      {add}
    </View>
  );
}

function Pillish({ label, bg, color, onPress }: { label: string; bg: string; color: string; onPress?: () => void }) {
  const body = (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Txt style={{ fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color }}>{label}</Txt>
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={label} hitSlop={6} scaleTo={0.94}>
      {body}
    </PressableScale>
  );
}

// ── ProgressSegments ─────────────────────────────────────────────────────────

/** Onboarding progress: `total` bars, the first `current` filled violet, and "2 / 5" on the right. */
export function ProgressSegments({ total = 5, current, showLabel = true, style }: { total?: number; current: number; showLabel?: boolean; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`Step ${current} of ${total}`} style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, style]}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: theme.dark ? theme.surfaceAlt : "#E9E7F1" }}>
          {i < current ? <LinearGradient colors={[theme.gradPrimary[0], theme.gradPrimary[1]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} /> : null}
        </View>
      ))}
      {showLabel ? <Txt style={{ fontFamily: font.semibold, fontSize: 13, lineHeight: 17, color: theme.muted, marginLeft: 4 }}>{`${current} / ${total}`}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, minHeight: 28 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.pill, borderWidth: 1, overflow: "hidden" },
  moreBtn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  filter: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 32, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, overflow: "hidden" },
  tag: { height: 25, paddingHorizontal: 10, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});

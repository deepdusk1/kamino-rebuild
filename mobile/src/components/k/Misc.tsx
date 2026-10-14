import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from "react-native";
import { font, radius, shadow, useTheme } from "@/theme";
import { PressableScale, Txt } from "@/components/ui";
import { Picture } from "./Picture";
import type { IconName, Src } from "./types";

// ── SearchField ──────────────────────────────────────────────────────────────

type SearchFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  /** Shows the filter (sliders) button on the right. */
  onFilter?: () => void;
  /** Puts a violet dot on the filter button when filters are on. */
  filterActive?: boolean;
  autoFocus?: boolean;
  onFocus?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** The big white search box with a magnifier, a clear button and an optional filter button. */
export function SearchField({ value, onChangeText, placeholder = "Search communities, topics, or interests…", onSubmit, onFilter, filterActive, autoFocus, onFocus, style }: SearchFieldProps) {
  const theme = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }, shadow.card, style]}>
      <Ionicons name="search-outline" size={19} color={theme.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.subtle}
        accessibilityLabel="Search"
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        onFocus={onFocus}
        autoCorrect={false}
        selectionColor={theme.accent}
        style={{ flex: 1, fontFamily: font.regular, fontSize: 13.5, color: theme.ink, paddingVertical: 10, outlineWidth: 0 }}
      />
      {value ? (
        <PressableScale onPress={() => onChangeText("")} accessibilityLabel="Clear search" hitSlop={10} scaleTo={0.85}>
          <Ionicons name="close-circle" size={20} color={theme.subtle} />
        </PressableScale>
      ) : null}
      {onFilter ? (
        <>
          <View style={{ width: 1, height: 22, backgroundColor: theme.border }} />
          <PressableScale onPress={onFilter} accessibilityLabel={filterActive ? "Filters (on)" : "Filters"} scaleTo={0.88} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -8 }}>
            <Ionicons name="options-outline" size={21} color={theme.ink} />
            {filterActive ? <View style={{ position: "absolute", top: 10, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: theme.violet }} /> : null}
          </PressableScale>
        </>
      ) : null}
    </View>
  );
}

// ── ImageCarousel + ThumbnailStrip ───────────────────────────────────────────

type ImageCarouselProps = {
  images: readonly Src[];
  /** The picture on show (controlled). */
  index: number;
  onIndexChange: (index: number) => void;
  /** Width ÷ height (default 1.5). */
  aspectRatio?: number;
  hue?: number;
  onPressImage?: (index: number) => void;
  style?: StyleProp<ViewStyle>;
};

/** Swipeable post pictures (rounded 16) with a "1/5" counter top-right. Pair it with `ThumbnailStrip`. */
export function ImageCarousel({ images, index, onIndexChange, aspectRatio = 1.5, hue, onPressImage, style }: ImageCarouselProps) {
  const theme = useTheme();
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const count = images.length;
  // The page the person swiped to themselves (no need to scroll there again).
  const swiped = useRef(index);

  // When a thumbnail is tapped (index changes from outside), slide to that picture.
  useEffect(() => {
    if (width && swiped.current !== index) scroller.current?.scrollTo({ x: index * width, animated: true });
    swiped.current = index;
  }, [index, width]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index && i >= 0 && i < count) {
      swiped.current = i;
      onIndexChange(i);
    }
  };

  return (
    <View style={[{ width: "100%", aspectRatio, borderRadius: radius.image, overflow: "hidden", backgroundColor: theme.surfaceAlt }, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={32} contentOffset={{ x: index * width, y: 0 }}>
          {images.map((src, i) => (
            <PressableScale key={i} onPress={onPressImage ? () => onPressImage(i) : undefined} disabled={!onPressImage} haptics={false} scaleTo={1} accessibilityLabel={`Picture ${i + 1} of ${count}`} style={{ width, height: "100%" }}>
              <Picture source={src} hue={(hue ?? 250) + i * 18} icon="image-outline" style={{ flex: 1 }} />
            </PressableScale>
          ))}
        </ScrollView>
      ) : null}
      {count > 1 ? (
        <View style={styles.counter}>
          <Txt style={{ color: "#fff", fontFamily: font.bold, fontSize: 11, lineHeight: 14 }}>{`${index + 1}/${count}`}</Txt>
        </View>
      ) : null}
    </View>
  );
}

/** A row of small pictures under the carousel; the chosen one gets a violet border. */
export function ThumbnailStrip({ images, index, onSelect, hue, style }: { images: readonly Src[]; index: number; onSelect: (index: number) => void; hue?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[{ flexDirection: "row", gap: 8 }, style]}>
      {images.slice(0, 5).map((src, i) => {
        const active = i === index;
        return (
          <PressableScale key={i} onPress={() => onSelect(i)} accessibilityLabel={`Show picture ${i + 1}`} accessibilityState={{ selected: active }} scaleTo={0.94} style={{ flex: 1 }}>
            <View style={{ aspectRatio: 1.65, borderRadius: 10, padding: active ? 2 : 0, borderWidth: active ? 2 : 1, borderColor: active ? theme.violet : theme.border, overflow: "hidden" }}>
              <Picture source={src} hue={(hue ?? 250) + i * 18} radius={active ? 6 : 9} style={{ flex: 1 }} />
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

// ── EmptyHint ────────────────────────────────────────────────────────────────

type EmptyHintProps = {
  emoji?: string;
  icon?: IconName;
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** A small, friendly inline "nothing here yet" box for empty sections (smaller than `EmptyState`). */
export function EmptyHint({ emoji, icon = "sparkles-outline", title, text, actionLabel, onAction, style }: EmptyHintProps) {
  const theme = useTheme();
  return (
    <View style={[{ alignItems: "center", gap: 6, padding: 20, borderRadius: radius.image, backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border, borderStyle: "dashed" }, style]}>
      {emoji ? <Txt style={{ fontSize: 28, lineHeight: 34 }}>{emoji}</Txt> : <Ionicons name={icon} size={26} color={theme.violet} />}
      <Txt style={{ fontFamily: font.bold, fontSize: 15, lineHeight: 20, color: theme.ink, textAlign: "center" }}>{title}</Txt>
      {text ? <Txt style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: theme.muted, textAlign: "center" }}>{text}</Txt> : null}
      {actionLabel && onAction ? (
        <PressableScale onPress={onAction} accessibilityLabel={actionLabel} hitSlop={8} scaleTo={0.94} style={{ marginTop: 4, minHeight: 32, justifyContent: "center" }}>
          <Txt style={{ fontFamily: font.bold, fontSize: 14, lineHeight: 18, color: theme.accent }}>{actionLabel}</Txt>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 14, minHeight: 40 },
  counter: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(15,11,42,0.62)", borderRadius: radius.pill, paddingHorizontal: 8, height: 21, justifyContent: "center" },
});

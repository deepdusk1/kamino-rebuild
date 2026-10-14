import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { font, radius, shadow, useTheme } from "@/theme";
import { PressableScale, Txt } from "@/components/ui";
import { GradientButton } from "./Buttons";
import { Picture } from "./Picture";
import type { Src } from "./types";

export type HeroSlide = {
  key: string;
  /** Artwork (e.g. `heroArt["home-1"]` from `@/lib/brandArt`, or a web address). */
  image?: Src;
  /** Big white headline (3 lines max). */
  title: string;
  /** Small white text under the headline. */
  text?: string;
  /** Button label, e.g. "Start Exploring". The button shows an arrow. */
  cta?: string;
  /** Runs when the button (or the card) is pressed. */
  onPress?: () => void;
  /** Colour of the fallback gradient when there is no artwork (0–360). */
  hue?: number;
};

type HeroCardProps = Omit<HeroSlide, "key"> & {
  height?: number;
  /** "full" = artwork fills the card, text on top (Home, Explore). "split" = light card, text left, artwork right (Chats). */
  variant?: "full" | "split";
  style?: StyleProp<ViewStyle>;
};

/** One hero banner (rounded 20). The carousel below shows several; Chats uses a single `variant="split"`. */
export function HeroCard({ image, title, text, cta, onPress, hue = 262, height = 166, variant = "full", style }: HeroCardProps) {
  const theme = useTheme();
  const split = variant === "split";
  const ink = split ? theme.ink : "#FFFFFF";
  const body = split ? theme.muted : "rgba(255,255,255,0.92)";
  return (
    <View style={[{ height, borderRadius: radius.hero, overflow: "hidden", backgroundColor: split ? theme.surface : theme.surfaceAlt, borderWidth: split ? 1 : 0, borderColor: theme.border }, shadow.card, style]}>
      {split ? (
        <Picture source={image} hue={hue} radius={radius.tile} style={{ position: "absolute", right: 12, top: 12, bottom: 12, width: "44%" }} />
      ) : (
        <>
          <Picture source={image} hue={hue} style={StyleSheet.absoluteFill} />
          {/* A soft shade on the left so the white text always reads, whatever the artwork. */}
          <LinearGradient colors={["rgba(24,12,64,0.42)", "rgba(24,12,64,0.12)", "rgba(24,12,64,0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </>
      )}
      <View style={{ flex: 1, padding: 16, paddingLeft: 18, paddingRight: split ? "50%" : 16, justifyContent: "center", gap: 5 }}>
        <Txt numberOfLines={3} accessibilityRole="header" style={{ color: ink, fontFamily: font.heavy, fontSize: split ? 24 : 25, lineHeight: split ? 26 : 26, letterSpacing: -0.6, maxWidth: split ? undefined : "52%" }}>
          {title}
        </Txt>
        {text ? <Txt numberOfLines={split ? 3 : 2} style={{ color: body, fontFamily: font.regular, fontSize: 11.5, lineHeight: 15, maxWidth: split ? undefined : "58%" }}>{text}</Txt> : null}
        {cta && onPress ? <GradientButton label={cta} onPress={onPress} size="md" iconRight="arrow-forward" style={{ marginTop: 5, height: 29 }} /> : null}
      </View>
    </View>
  );
}

type HeroCarouselProps = {
  slides: readonly HeroSlide[];
  height?: number;
  /** Auto-advance interval (spec: 5 s). 0 turns it off. It also stays still with "Reduce Motion" on. */
  autoplayMs?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Swipeable hero banners with page dots bottom-right (active = white, others white 50%). Advances by itself
 * every 5 seconds and pauses while you touch it.
 */
export function HeroCarousel({ slides, height = 166, autoplayMs = 5000, style }: HeroCarouselProps) {
  const reduceMotion = useReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [touching, setTouching] = useState(false);
  const count = slides.length;
  // The interval reads the current page from a ref so it never restarts on every page change.
  const indexRef = useRef(0);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (!autoplayMs || reduceMotion || touching || count < 2 || !width) return;
    const timer = setInterval(() => {
      const next = (indexRef.current + 1) % count;
      scroller.current?.scrollTo({ x: next * width, animated: true });
      setIndex(next);
    }, autoplayMs);
    return () => clearInterval(timer);
  }, [autoplayMs, reduceMotion, touching, count, width]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index && i >= 0 && i < count) setIndex(i);
  };

  return (
    <View style={[{ height }, style]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          onScrollBeginDrag={() => setTouching(true)}
          onScrollEndDrag={() => setTouching(false)}
          style={{ borderRadius: radius.hero }}
        >
          {slides.map((s) => (
            <PressableScale key={s.key} onPress={s.onPress} haptics={false} scaleTo={0.99} accessibilityLabel={s.title} style={{ width, height }}>
              <HeroCard {...s} height={height} />
            </PressableScale>
          ))}
        </ScrollView>
      ) : null}
      {count > 1 ? (
        <View style={styles.dots} accessibilityLabel={`Banner ${index + 1} of ${count}`}>
          {slides.map((s, i) => (
            <PressableScale
              key={s.key}
              onPress={() => {
                setIndex(i);
                scroller.current?.scrollTo({ x: i * width, animated: true });
              }}
              accessibilityLabel={`Show banner ${i + 1}`}
              hitSlop={8}
              haptics={false}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === index ? "#FFFFFF" : "rgba(255,255,255,0.5)" }} />
            </PressableScale>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { position: "absolute", right: 16, bottom: 12, flexDirection: "row", gap: 6 },
});

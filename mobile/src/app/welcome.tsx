// ===== FILE: mobile/src/app/welcome.tsx =====
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useId, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import { useSession } from "@/auth/session";
import { PressableScale, Txt } from "@/components/ui";
import { defaultCover, heroArt, interestArt, welcomeArt } from "@/lib/brandArt";
import { errorMessage } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { font, radius, shadow, useTheme } from "@/theme";

type OnboardingSlide = {
  key: string;
  badge: string;
  title: string;
  subtitle: string;
  highlights: readonly [string, string, string];
  backdrop: ImageSourcePropType;
  accentColor: string;
};

/**
 * Six-slide onboarding sequence matching the 6 pagination dots in Mockup 1:
 * - Slide 0 is the exact Mockup 1 Hero Splash ("Your World. Your People.").
 * - Tapping "Get Started" on Slide 0 advances into the interactive onboarding carousel
 *   (Slides 1–5) with step-by-step feature highlights, a "Skip" button, and a final
 *   "Create Your Account" CTA that routes to `/sign-in?mode=up`.
 */
const SLIDES: readonly OnboardingSlide[] = [
  {
    key: "splash",
    badge: "WELCOME TO KAMINO",
    title: "Your World. Your People.",
    subtitle: "Communities for every passion.\nChat, create, explore and belong.",
    highlights: [
      "Vibrant fandom realms",
      "Realtime chat & voice",
      "Interactive AI stories",
    ],
    backdrop: welcomeArt.sky,
    accentColor: "#7C3AED",
  },
  {
    key: "communities",
    badge: "FIND COMMUNITIES",
    title: "Find Your Fandom Home.",
    subtitle: "Join anime, gaming, art, music and book realms curated by passionate fans.",
    highlights: [
      "Custom themed spaces & wikis",
      "Daily check-in streaks & ranks",
      "Challenges, polls & fan events",
    ],
    backdrop: heroArt["home-1"] ?? welcomeArt.sky,
    accentColor: "#8B5CF6",
  },
  {
    key: "chat",
    badge: "CHAT & MAKE FRIENDS",
    title: "Chat, Call & Hang Out.",
    subtitle: "1:1 DMs, topic rooms, voice notes, 1-tap translation and smart AI reply magic.",
    highlights: [
      "HD voice & video calls",
      "Instant message translation",
      "Custom chat bubbles & stickers",
    ],
    backdrop: heroArt["home-2"] ?? welcomeArt.sky,
    accentColor: "#38BDF8",
  },
  {
    key: "create",
    badge: "CREATE & SHARE",
    title: "Create & Share Together.",
    subtitle: "Publish rich posts, fan art, wiki guides, polls, quizzes and branching AI stories.",
    highlights: [
      "Living AI roleplay & story rooms",
      "Collaborative community wikis",
      "Supporter tips & creator insights",
    ],
    backdrop: interestArt.art ?? heroArt["explore-1"] ?? defaultCover(0),
    accentColor: "#EC4899",
  },
  {
    key: "live",
    badge: "LIVE ROOMS & EVENTS",
    title: "Live Stages & Watch Parties.",
    subtitle: "Hop on stage with live waveforms, raise your hand, or stream synced watch parties.",
    highlights: [
      "Live audio stages with co-hosts",
      "AI Live Notes & instant recaps",
      "Synced video watch parties",
    ],
    backdrop: heroArt["home-3"] ?? welcomeArt.sky,
    accentColor: "#F43F8E",
  },
  {
    key: "belong",
    badge: "READY TO LAUNCH",
    title: "Level Up & Belong.",
    subtitle: "Keep your streak alive, climb community leaderboards and unlock profile cosmetics.",
    highlights: [
      "Earn XP, titles & showcase badges",
      "Customize your profile banner",
      "Safe, welcoming mod tools",
    ],
    backdrop: heroArt["home-4"] ?? defaultCover(2),
    accentColor: "#A855F7",
  },
];

type FeatureIconItem = {
  key: string;
  label: string;
  slideIndex: number;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
};

const FEATURE_ICONS: readonly FeatureIconItem[] = [
  {
    key: "communities",
    label: "Find\nCommunities",
    slideIndex: 1,
    icon: "people",
    tint: "#E2E8F0",
  },
  {
    key: "chat",
    label: "Chat & Make\nFriends",
    slideIndex: 2,
    icon: "chatbubble-ellipses",
    tint: "#F8FAFC",
  },
  {
    key: "create",
    label: "Create &\nShare",
    slideIndex: 3,
    icon: "add",
    tint: "#F8FAFC",
  },
  {
    key: "live",
    label: "Live Rooms\n& Events",
    slideIndex: 4,
    icon: "play",
    tint: "#F472B6",
  },
];

/**
 * Mockup 1 — Splash & Onboarding Screen:
 * - Full-bleed illustrated cosmic twilight splash with shooting stars & character silhouettes
 * - Ringed cyan-violet-magenta planet logo + gradient "Kamino" wordmark
 * - "Your World. Your People." tagline & 2-line subtitle
 * - 6 pagination dots corresponding to the 6-slide onboarding carousel
 * - "Get Started →" gradient CTA (`#7C3AED` → `#A855F7` → `#EC4899`) that steps into the onboarding carousel
 * - "Continue with Google" & "Continue with Apple" buttons wired to `useSession().socialSignIn`
 * - 4 feature icons row (Find Communities, Chat & Make Friends, Create & Share, Live Rooms & Events)
 * - "Already have an account? Log In" footer link
 */
export default function Welcome() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { socialSignIn } = useSession();

  const scrollerRef = useRef<ScrollView>(null);
  const [activeSlide, setActiveSlide] = useState<number>(0);
  const [oauthBusy, setOauthBusy] = useState<"google" | "apple" | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const W = Math.max(320, screenWidth);
  const H = Math.max(600, screenHeight);

  const scrollToSlide = (targetIndex: number) => {
    const clamped = Math.max(0, Math.min(SLIDES.length - 1, targetIndex));
    haptic.tap();
    setActiveSlide(clamped);
    scrollerRef.current?.scrollTo({ x: clamped * W, animated: true });
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (W <= 0) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / W);
    if (next !== activeSlide && next >= 0 && next < SLIDES.length) {
      setActiveSlide(next);
    }
  };

  const handlePrimaryCta = () => {
    if (activeSlide < SLIDES.length - 1) {
      // Advance into the onboarding carousel after tapping Get Started (or Next)
      scrollToSlide(activeSlide + 1);
    } else {
      haptic.success();
      router.push("/sign-in?mode=up");
    }
  };

  const handleSocialSignIn = async (provider: "google" | "apple") => {
    if (oauthBusy !== null) return;
    haptic.tap();
    setOauthBusy(provider);
    setOauthError(null);
    try {
      await socialSignIn(provider);
    } catch (error) {
      const msg = errorMessage(error);
      if (!/cancel|dismiss/i.test(msg)) {
        setOauthError(msg);
      }
    } finally {
      setOauthBusy(null);
    }
  };

  const isTourSlide = activeSlide > 0;
  const isFinalSlide = activeSlide === SLIDES.length - 1;

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.dark ? theme.bg : "#090716" },
      ]}
    >
      {/* Full-Bleed Horizontal Onboarding Carousel */}
      <ScrollView
        ref={scrollerRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        style={StyleSheet.absoluteFill}
      >
        {SLIDES.map((slide, idx) => (
          <View key={slide.key} style={{ width: W, height: H }}>
            <Image
              source={slide.backdrop}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              contentPosition="center"
              transition={240}
              accessible={false}
            />

            {/* Layer character silhouette art on Slide 0 to match Mockup 1's rooftop friends */}
            {idx === 0 && welcomeArt.cards[0] ? (
              <Image
                source={welcomeArt.cards[0]}
                style={[StyleSheet.absoluteFill, { opacity: 0.44 }]}
                contentFit="cover"
                contentPosition="center"
                accessible={false}
              />
            ) : null}

            {/* Deep cosmic twilight top & bottom scrims ensuring crisp typography in both light & dark OS modes */}
            <LinearGradient
              colors={
                theme.dark
                  ? [
                      "rgba(9, 10, 38, 0.76)",
                      "rgba(17, 13, 52, 0.30)",
                      "rgba(24, 15, 58, 0.22)",
                      "rgba(11, 10, 20, 0.88)",
                      "#080713",
                    ]
                  : [
                      "rgba(12, 14, 48, 0.70)",
                      "rgba(22, 16, 64, 0.26)",
                      "rgba(30, 18, 68, 0.20)",
                      "rgba(14, 11, 32, 0.86)",
                      "#0B081B",
                    ]
              }
              locations={[0, 0.26, 0.48, 0.68, 0.92]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Shooting stars and twinkling starfield at the top of the sky */}
            <CelestialStarfield width={W} topOffset={insets.top + 16} />

            {/* Top Brand Lockup & Slide Headline */}
            <View
              style={[
                styles.heroTopContainer,
                {
                  paddingTop:
                    insets.top + Math.max(24, Math.round(H * 0.044)),
                },
              ]}
              pointerEvents="none"
            >
              <SplashPlanetEmblem size={idx === 0 ? 68 : 56} />
              <SplashKaminoWordmark
                width={Math.min(300, W - 48)}
                compact={idx > 0}
              />

              {idx > 0 ? (
                <View
                  style={[
                    styles.slideStepBadge,
                    {
                      backgroundColor: "rgba(124, 58, 237, 0.28)",
                      borderColor: "rgba(196, 181, 253, 0.45)",
                    },
                  ]}
                >
                  <Ionicons name="sparkles" size={12} color="#E9D5FF" />
                  <Txt style={styles.slideStepBadgeText}>{slide.badge}</Txt>
                </View>
              ) : null}

              <Txt
                accessibilityRole="header"
                style={[
                  styles.taglineTitle,
                  idx > 0 && { fontSize: 24, lineHeight: 30, marginTop: 10 },
                ]}
              >
                {slide.title}
              </Txt>
              <Txt style={styles.taglineSubtitle}>{slide.subtitle}</Txt>

              {/* Onboarding Carousel Feature Pills on Slides 1–5 */}
              {idx > 0 ? (
                <View style={styles.tourHighlightsBox}>
                  {slide.highlights.map((bullet) => (
                    <View key={bullet} style={styles.tourBulletRow}>
                      <View
                        style={[
                          styles.tourBulletIcon,
                          { backgroundColor: slide.accentColor },
                        ]}
                      >
                        <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                      </View>
                      <Txt style={styles.tourBulletText}>{bullet}</Txt>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Top-Right "Skip" Pill when browsing Onboarding Carousel Slides 1–5 */}
      {isTourSlide ? (
        <View
          style={[
            styles.topTourBar,
            { top: insets.top + 10 },
          ]}
          pointerEvents="box-none"
        >
          <PressableScale
            onPress={() => scrollToSlide(activeSlide - 1)}
            accessibilityRole="button"
            accessibilityLabel="Previous onboarding slide"
            hitSlop={10}
            scaleTo={0.93}
            style={styles.tourNavPill}
          >
            <Ionicons name="chevron-back" size={16} color="#FFFFFF" />
            <Txt style={styles.tourNavPillText}>Back</Txt>
          </PressableScale>

          <PressableScale
            onPress={() => router.push("/sign-in?mode=up")}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding tour and create account"
            hitSlop={10}
            scaleTo={0.93}
            style={styles.tourNavPill}
          >
            <Txt style={styles.tourNavPillText}>Skip</Txt>
            <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
          </PressableScale>
        </View>
      ) : null}

      {/* Bottom Interactive Dock (Pinned over the cosmic dark horizon) */}
      <View
        style={[
          styles.bottomDock,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 6,
            width: Math.min(440, W),
            alignSelf: "center",
          },
        ]}
        pointerEvents="box-none"
      >
        {/* 6 Carousel Pagination Dots (Mockup 1) */}
        <View
          style={styles.dotsRow}
          accessibilityRole="adjustable"
          accessibilityLabel={`Onboarding slide ${activeSlide + 1} of ${SLIDES.length}`}
        >
          {SLIDES.map((s, i) => {
            const active = i === activeSlide;
            return (
              <PressableScale
                key={s.key}
                onPress={() => scrollToSlide(i)}
                accessibilityLabel={`Go to slide ${i + 1}: ${s.title}`}
                accessibilityState={{ selected: active }}
                hitSlop={8}
                haptics={false}
                style={styles.dotHit}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      width: active ? 18 : 7,
                      backgroundColor: active
                        ? "#FFFFFF"
                        : "rgba(255, 255, 255, 0.34)",
                    },
                  ]}
                />
              </PressableScale>
            );
          })}
        </View>

        {/* Friendly OAuth Error Banner with Retry/Dismiss */}
        {oauthError ? (
          <PressableScale
            onPress={() => setOauthError(null)}
            accessibilityRole="alert"
            accessibilityLabel={`${oauthError}. Tap to dismiss`}
            style={[
              styles.errorBanner,
              {
                backgroundColor: "rgba(244, 63, 94, 0.22)",
                borderColor: theme.red,
              },
            ]}
          >
            <Ionicons name="alert-circle" size={17} color="#FDA4AF" />
            <Txt style={styles.errorText} numberOfLines={2}>
              {oauthError}
            </Txt>
            <Ionicons name="close" size={15} color="#FDA4AF" />
          </PressableScale>
        ) : null}

        {/* Primary "Get Started →" Gradient CTA (Mockup 1 `#7C3AED` → `#A855F7` → `#EC4899`) */}
        <PressableScale
          onPress={handlePrimaryCta}
          accessibilityRole="button"
          accessibilityLabel={
            activeSlide === 0
              ? "Get Started"
              : isFinalSlide
                ? "Create Your Account"
                : "Next onboarding slide"
          }
          scaleTo={0.97}
          style={[
            styles.ctaButton,
            shadow.glow("#EC4899", 0.45),
          ]}
        >
          <LinearGradient
            colors={theme.gradHero}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
          />
          <Txt style={styles.ctaLabel}>
            {activeSlide === 0
              ? "Get Started"
              : isFinalSlide
                ? "Create Your Account"
                : `Next · ${activeSlide}/${SLIDES.length - 1}`}
          </Txt>
          <Ionicons
            name="arrow-forward"
            size={20}
            color="#FFFFFF"
            style={styles.ctaArrow}
          />
        </PressableScale>

        {/* "Continue with Google" Dark Glass Pill Button */}
        <PressableScale
          onPress={() => void handleSocialSignIn("google")}
          disabled={oauthBusy !== null}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          scaleTo={0.98}
          style={[
            styles.oauthButton,
            {
              backgroundColor: theme.dark
                ? "rgba(18, 17, 36, 0.86)"
                : "rgba(21, 18, 42, 0.84)",
              borderColor: "rgba(167, 139, 250, 0.28)",
            },
          ]}
        >
          <View style={styles.oauthIconSlot}>
            {oauthBusy === "google" ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <GoogleGLogo size={21} />
            )}
          </View>
          <Txt style={styles.oauthLabel}>Continue with Google</Txt>
        </PressableScale>

        {/* "Continue with Apple" Dark Glass Pill Button */}
        <PressableScale
          onPress={() => void handleSocialSignIn("apple")}
          disabled={oauthBusy !== null}
          accessibilityRole="button"
          accessibilityLabel="Continue with Apple"
          scaleTo={0.98}
          style={[
            styles.oauthButton,
            {
              backgroundColor: theme.dark
                ? "rgba(18, 17, 36, 0.86)"
                : "rgba(21, 18, 42, 0.84)",
              borderColor: "rgba(167, 139, 250, 0.28)",
            },
          ]}
        >
          <View style={styles.oauthIconSlot}>
            {oauthBusy === "apple" ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons name="logo-apple" size={22} color="#FFFFFF" />
            )}
          </View>
          <Txt style={styles.oauthLabel}>Continue with Apple</Txt>
        </PressableScale>

        {/* 4 Feature Icons Row (Find Communities, Chat & Make Friends, Create & Share, Live Rooms & Events) */}
        <View style={styles.featuresRow}>
          {FEATURE_ICONS.map((item) => {
            const selected = activeSlide === item.slideIndex;
            return (
              <PressableScale
                key={item.key}
                onPress={() => scrollToSlide(item.slideIndex)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={item.label.replace("\n", " ")}
                scaleTo={0.93}
                style={styles.featureItem}
              >
                <View
                  style={[
                    styles.featureCircle,
                    {
                      backgroundColor: selected
                        ? "rgba(124, 58, 237, 0.38)"
                        : "rgba(23, 21, 48, 0.86)",
                      borderColor: selected
                        ? "#C084FC"
                        : "rgba(167, 139, 250, 0.28)",
                    },
                  ]}
                >
                  {item.key === "live" ? (
                    <View style={styles.livePlayBadge}>
                      <Ionicons
                        name="play"
                        size={13}
                        color="#151326"
                        style={{ marginLeft: 1 }}
                      />
                    </View>
                  ) : item.key === "chat" ? (
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Ionicons
                        name="chatbubble-ellipses"
                        size={20}
                        color="#FFFFFF"
                      />
                      <View style={styles.chatAccentBubble} />
                    </View>
                  ) : (
                    <Ionicons name={item.icon} size={23} color={item.tint} />
                  )}
                </View>
                <Txt
                  style={[
                    styles.featureText,
                    selected && { color: "#FFFFFF", fontFamily: font.bold },
                  ]}
                >
                  {item.label}
                </Txt>
              </PressableScale>
            );
          })}
        </View>

        {/* Footer: "Already have an account? Log In" */}
        <View style={styles.footerRow}>
          <Txt style={styles.footerPrompt}>Already have an account? </Txt>
          <PressableScale
            onPress={() => {
              haptic.tap();
              router.push("/sign-in?mode=in");
            }}
            accessibilityRole="button"
            accessibilityLabel="Already have an account? Log In"
            hitSlop={12}
            scaleTo={0.95}
            style={styles.loginHit}
          >
            <Txt style={styles.footerLoginLink}>Log In</Txt>
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

/**
 * Shooting stars & celestial starfield overlay from Mockup 1.
 */
function CelestialStarfield({
  width,
  topOffset,
}: {
  width: number;
  topOffset: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: topOffset,
        height: 150,
      }}
      pointerEvents="none"
    >
      <Svg width={width} height={150} viewBox={`0 0 ${width} 150`}>
        <Defs>
          <SvgLinearGradient id={`shootA_${uid}`} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.92" />
            <Stop offset="1" stopColor="#38BDF8" stopOpacity="0" />
          </SvgLinearGradient>
          <SvgLinearGradient id={`shootB_${uid}`} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor="#F472B6" stopOpacity="0.88" />
            <Stop offset="1" stopColor="#7C3AED" stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>

        {/* Left shooting star */}
        <Path
          d={`M ${width * 0.24} 48 L ${width * 0.35} 18`}
          stroke={`url(#shootA_${uid})`}
          strokeWidth={1.8}
          strokeLinecap="round"
        />
        <Circle cx={width * 0.24} cy={48} r={2} fill="#FFFFFF" />

        {/* Right shooting star */}
        <Path
          d={`M ${width * 0.59} 54 L ${width * 0.8} 6`}
          stroke={`url(#shootB_${uid})`}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <Circle cx={width * 0.59} cy={54} r={2.2} fill="#F9A8D4" />

        {/* Twinkling stars */}
        <Circle cx={width * 0.15} cy={30} r={1.4} fill="#BAE6FD" opacity={0.82} />
        <Circle cx={width * 0.44} cy={14} r={1.2} fill="#FFFFFF" opacity={0.68} />
        <Circle cx={width * 0.72} cy={44} r={1.5} fill="#E9D5FF" opacity={0.78} />
        <Circle cx={width * 0.87} cy={26} r={1.3} fill="#FFFFFF" opacity={0.64} />
      </Svg>
    </View>
  );
}

/**
 * Ringed cyan → violet → magenta planet emblem with 4-point sparkle above "Kamino" in Mockup 1.
 */
function SplashPlanetEmblem({ size = 68 }: { size?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const w = Math.round(size * 1.45);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Kamino ringed planet logo"
    >
      <Svg width={w} height={size} viewBox="0 0 110 74">
        <Defs>
          <SvgLinearGradient
            id={`planetSphere_${uid}`}
            x1="28"
            y1="10"
            x2="78"
            y2="62"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#38BDF8" />
            <Stop offset="0.52" stopColor="#7C3AED" />
            <Stop offset="1" stopColor="#EC4899" />
          </SvgLinearGradient>
          <SvgLinearGradient
            id={`planetRing_${uid}`}
            x1="8"
            y1="42"
            x2="102"
            y2="28"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#E0F2FE" />
            <Stop offset="0.5" stopColor="#F5D0FE" />
            <Stop offset="1" stopColor="#F472B6" />
          </SvgLinearGradient>
        </Defs>

        {/* Back ring arc */}
        <G transform="rotate(-19 52 38)">
          <Ellipse
            cx="52"
            cy="38"
            rx="40"
            ry="10.5"
            fill="none"
            stroke={`url(#planetRing_${uid})`}
            strokeWidth="4.5"
            opacity={0.55}
          />
        </G>

        {/* Planet sphere */}
        <Circle cx="52" cy="37" r="22" fill={`url(#planetSphere_${uid})`} />

        {/* Front ring arc */}
        <G transform="rotate(-19 52 38)">
          <Path
            d="M 12 38 A 40 10.5 0 0 0 92 38"
            fill="none"
            stroke={`url(#planetRing_${uid})`}
            strokeWidth="5"
            strokeLinecap="round"
          />
        </G>

        {/* 4-point sparkle star on lower-right ring */}
        <Path
          d="M 85 43 C 86.2 48.2 88 50 93.2 51.2 C 88 52.4 86.2 54.2 85 59.4 C 83.8 54.2 82 52.4 76.8 51.2 C 82 50 83.8 48.2 85 43 Z"
          fill="#F472B6"
        />
      </Svg>
    </View>
  );
}

/**
 * Gradient "Kamino" hero display wordmark matching Mockup 1.
 */
function SplashKaminoWordmark({
  width,
  compact = false,
}: {
  width: number;
  compact?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const height = compact ? 52 : 68;
  const fontSize = compact ? 44 : 58;
  const yPos = compact ? 42 : 54;
  return (
    <View
      style={{
        width,
        height,
        alignItems: "center",
        justifyContent: "center",
        marginTop: -4,
      }}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <SvgLinearGradient id={`wordGrad_${uid}`} x1="0" y1="0" x2="1" y2="0.15">
            <Stop offset="0" stopColor="#7DD3FC" />
            <Stop offset="0.24" stopColor="#F8FAFC" />
            <Stop offset="0.58" stopColor="#DDD6FE" />
            <Stop offset="0.82" stopColor="#A855F7" />
            <Stop offset="1" stopColor="#EC4899" />
          </SvgLinearGradient>
        </Defs>
        <SvgText
          x={width / 2}
          y={yPos}
          textAnchor="middle"
          fill={`url(#wordGrad_${uid})`}
          fontFamily={font.heavy}
          fontWeight="800"
          fontSize={fontSize}
          letterSpacing={-1.2}
        >
          Kamino
        </SvgText>
      </Svg>
    </View>
  );
}

/**
 * 4-color Google "G" SVG icon for the "Continue with Google" pill button.
 */
function GoogleGLogo({ size = 21 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  heroTopContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  slideStepBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 12,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  slideStepBadgeText: {
    fontFamily: font.heavy,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 0.7,
    color: "#F3E8FF",
  },
  taglineTitle: {
    marginTop: 6,
    fontFamily: font.heavy,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: "#FFFFFF",
    textAlign: "center",
  },
  taglineSubtitle: {
    marginTop: 6,
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 20,
    color: "rgba(241, 245, 249, 0.88)",
    textAlign: "center",
    maxWidth: 340,
  },
  tourHighlightsBox: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "rgba(18, 16, 40, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(167, 139, 250, 0.28)",
    gap: 8,
    width: "100%",
    maxWidth: 330,
  },
  tourBulletRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tourBulletIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tourBulletText: {
    fontFamily: font.semibold,
    fontSize: 13.5,
    lineHeight: 18,
    color: "#F8FAFC",
  },
  topTourBar: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tourNavPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: radius.pill,
    backgroundColor: "rgba(18, 16, 40, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
  tourNavPillText: {
    fontFamily: font.bold,
    fontSize: 12.5,
    lineHeight: 16,
    color: "#FFFFFF",
  },
  bottomDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    gap: 10,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginBottom: 4,
  },
  dotHit: {
    minWidth: 20,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  dot: {
    height: 7,
    borderRadius: 3.5,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontFamily: font.semibold,
    fontSize: 12.5,
    lineHeight: 16,
    color: "#FFE4E6",
  },
  ctaButton: {
    height: 54,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 24,
  },
  ctaLabel: {
    fontFamily: font.bold,
    fontSize: 17,
    lineHeight: 22,
    color: "#FFFFFF",
  },
  ctaArrow: {
    position: "absolute",
    right: 22,
  },
  oauthButton: {
    height: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  oauthIconSlot: {
    position: "absolute",
    left: 20,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  oauthLabel: {
    fontFamily: font.bold,
    fontSize: 15.5,
    lineHeight: 20,
    color: "#FFFFFF",
  },
  featuresRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 6,
    paddingHorizontal: 4,
  },
  featureItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  featureCircle: {
    width: 52,
    height: 52,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  livePlayBadge: {
    width: 26,
    height: 20,
    borderRadius: 6,
    backgroundColor: "#F472B6",
    alignItems: "center",
    justifyContent: "center",
  },
  chatAccentBubble: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#38BDF8",
    marginLeft: -4,
    marginTop: 6,
  },
  featureText: {
    fontFamily: font.semibold,
    fontSize: 11.5,
    lineHeight: 14.5,
    color: "rgba(241, 245, 249, 0.9)",
    textAlign: "center",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    minHeight: 40,
  },
  footerPrompt: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 18,
    color: "rgba(226, 232, 240, 0.86)",
  },
  loginHit: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  footerLoginLink: {
    fontFamily: font.heavy,
    fontSize: 14.5,
    lineHeight: 18,
    color: "#D946EF",
  },
});
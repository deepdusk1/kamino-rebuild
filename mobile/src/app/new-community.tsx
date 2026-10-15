// ===== FILE: mobile/src/app/new-community.tsx =====
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { api } from "@/api/endpoints";
import { notify } from "@/components/community/platform";
import {
  AppHeader,
  GradientButton,
  Picture,
  Pill,
  SectionHeader,
} from "@/components/k";
import {
  Button,
  Field,
  PressableScale,
  Txt,
  useTabBarSpace,
} from "@/components/ui";
import { defaultCover } from "@/lib/brandArt";
import { errorMessage, showError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { pickAvatar, pickPhoto } from "@/lib/media";
import { font, radius, shadow, useTheme, type Tone } from "@/theme";

type PrivacyTier = "public" | "private" | "secret";

const PRIVACY_OPTIONS: readonly {
  key: PrivacyTier;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone;
}[] = [
  {
    key: "public",
    title: "Public",
    subtitle: "Anyone on Kamino can discover, read posts, and join right away.",
    icon: "globe-outline",
    tone: "violet",
  },
  {
    key: "private",
    title: "Approval Required",
    subtitle: "Listed in search, but leaders approve every join request.",
    icon: "lock-closed-outline",
    tone: "blue",
  },
  {
    key: "secret",
    title: "Secret (Invite-Only)",
    subtitle: "Hidden from public search. Only members with an invite link can enter.",
    icon: "eye-off-outline",
    tone: "pink",
  },
];

const TOPIC_CATEGORIES: readonly {
  key: string;
  label: string;
  emoji: string;
}[] = [
  { key: "anime", label: "Anime & Manga", emoji: "⚔️" },
  { key: "gaming", label: "Gaming", emoji: "🎮" },
  { key: "art", label: "Art & Design", emoji: "🎨" },
  { key: "music", label: "Music & K-Pop", emoji: "🎧" },
  { key: "writing", label: "Roleplay & Lore", emoji: "📖" },
  { key: "comics", label: "Comics & Sci-Fi", emoji: "🦸" },
  { key: "cosplay", label: "Cosplay & Crafts", emoji: "✨" },
  { key: "tech", label: "Tech & Creators", emoji: "🚀" },
];

const THEME_SWATCHES: readonly {
  hue: number;
  label: string;
  hex: string;
}[] = [
  { hue: 265, label: "Cosmic Violet", hex: "#7C3AED" },
  { hue: 330, label: "Sakura Pink", hex: "#EC4899" },
  { hue: 210, label: "Cyber Blue", hex: "#2563EB" },
  { hue: 160, label: "Emerald Mint", hex: "#10B981" },
  { hue: 32, label: "Solar Amber", hex: "#F59E0B" },
  { hue: 350, label: "Crimson Rose", hex: "#F43F5E" },
  { hue: 190, label: "Neon Cyan", hex: "#06B6D4" },
  { hue: 285, label: "Orchid Glow", hex: "#A855F7" },
];

const DEFAULT_STARTER_RULES: readonly string[] = [
  "Be kind and respectful to every member — zero tolerance for harassment.",
  "Tag major episode or story spoilers clearly in your post titles.",
  "Credit original creators when sharing fan art, cosplay, or edits.",
];

function slugifyName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

/**
 * Community Creation Wizard (`mobile/src/app/new-community.tsx`):
 * - 4-step interactive wizard with live preview header card:
 *   Step 1: Identity (Community Name, URL handle preview, Tagline, Icon upload & Banner upload)
 *   Step 2: Privacy & Access (Public / Approval-Required Private / Secret Invite-Only + 18+ Mature content toggle)
 *   Step 3: Topics & Theme Color (Primary category, custom #tags, and 8 Hue theme swatches)
 *   Step 4: Community Rules & Launch (Editable starter rules list + custom rule builder)
 * - Wired directly to `rpc("createCommunity", ...)` (`api.createCommunity` fallback)
 *   and navigates straight to `/community/[slug]` upon creation.
 */
export default function NewCommunityWizard() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const tabSpace = useTabBarSpace();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [privacy, setPrivacy] = useState<PrivacyTier>("public");
  const [isMature18Plus, setIsMature18Plus] = useState(false);
  const [category, setCategory] = useState("anime");
  const [selectedTags, setSelectedTags] = useState<string[]>([
    "#FanArt",
    "#Theories",
    "#Discussion",
  ]);
  const [customTagInput, setCustomTagInput] = useState("");
  const [hue, setHue] = useState(265);
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
  const [rules, setRules] = useState<string[]>([...DEFAULT_STARTER_RULES]);
  const [newRuleText, setNewRuleText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const generatedSlug = slugifyName(name) || "your-realm";
  const activeSwatch =
    THEME_SWATCHES.find((s) => s.hue === hue) ?? THEME_SWATCHES[0]!;

  const handlePickIcon = async () => {
    try {
      const picked = await pickAvatar("library");
      if (picked) {
        setIconDataUrl(picked);
        haptic.tap();
      }
    } catch (err) {
      showError(err, "Couldn't pick community icon");
    }
  };

  const handlePickCover = async () => {
    try {
      const picked = await pickPhoto("library", 1_400_000);
      if (picked) {
        setCoverDataUrl(picked);
        haptic.tap();
      }
    } catch (err) {
      showError(err, "Couldn't pick banner image");
    }
  };

  const handleAddTag = () => {
    const clean = customTagInput
      .trim()
      .replace(/^#+/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "");
    if (!clean) return;
    const formatted = `#${clean}`;
    if (!selectedTags.includes(formatted) && selectedTags.length < 10) {
      setSelectedTags((prev) => [...prev, formatted]);
      haptic.tap();
    }
    setCustomTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    haptic.tap();
    setSelectedTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleAddRule = () => {
    const clean = newRuleText.trim();
    if (!clean) return;
    if (rules.length < 10) {
      setRules((prev) => [...prev, clean]);
      setNewRuleText("");
      haptic.tap();
    }
  };

  const handleRemoveRule = (index: number) => {
    haptic.tap();
    setRules((prev) => prev.filter((_, i) => i !== index));
  };

  const validateCurrentStep = (): string | null => {
    if (step === 1) {
      if (name.trim().length < 3) {
        return "Give your community a name of at least 3 characters.";
      }
      if (tagline.trim().length < 6) {
        return "Add a short tagline (at least 6 characters) so fans know what your realm is about.";
      }
    }
    return null;
  };

  const goNextStep = () => {
    const err = validateCurrentStep();
    if (err) {
      setErrorMsg(err);
      return;
    }
    setErrorMsg(null);
    haptic.tap();
    if (step < 4) {
      setStep((s) => (s + 1) as 1 | 2 | 3 | 4);
    }
  };

  const goPrevStep = () => {
    setErrorMsg(null);
    haptic.tap();
    if (step > 1) {
      setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/explore");
    }
  };

  /**
   * Submits the new community to the backend via `rpc("createCommunity", ...)`.
   */
  const handleCreateCommunity = async () => {
    const err = validateCurrentStep();
    if (err || submitting) {
      if (err) setErrorMsg(err);
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    // "Secret" communities are the server's "unlisted": hidden from search, joined by link.
    const visibilityValue: "public" | "private" | "unlisted" =
      privacy === "public" ? "public" : privacy === "secret" ? "unlisted" : "private";
    const cleanTopics = selectedTags.map((t) => t.replace(/^#/, "")).filter(Boolean).slice(0, 8);

    try {
      const created = await api.createCommunity({
        name: name.trim(),
        tagline: tagline.trim(),
        description: tagline.trim(),
        category,
        visibility: visibilityValue,
        // The server sets the age gate itself; 18 is sent when the mature box is ticked.
        ageGate: isMature18Plus ? 18 : 13,
        rules: rules.map((r, n) => `${n + 1}. ${r}`).join("\n"),
      });
      const createdSlug = created.id;

      // The community exists now. Its look and topics are saved next; if one of those fails the leader
      // can finish it on the community's Look page, so we say so instead of failing the whole thing.
      const followUps: string[] = [];
      try {
        await api.updateLook({
          slug: createdSlug,
          hue,
          ...(coverDataUrl ? { coverUpload: coverDataUrl } : {}),
          ...(iconDataUrl ? { iconUpload: iconDataUrl } : {}),
        });
      } catch {
        followUps.push("the banner and icon");
      }
      if (cleanTopics.length) {
        try {
          await api.setCommunityTopics(createdSlug, cleanTopics);
        } catch {
          followUps.push("the topics");
        }
      }

      haptic.success();
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      void queryClient.invalidateQueries({ queryKey: ["exploreOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["homeOverview"] });
      notify(
        "Your community is live 🎉",
        followUps.length
          ? `${name.trim()} is ready. We couldn't save ${followUps.join(" or ")}; you can add them from the community's Look page.`
          : `${name.trim()} is ready. Invite your friends and write the first post!`,
      );
      router.replace(`/community/${createdSlug}`);
    } catch (submitErr) {
      setErrorMsg(errorMessage(submitErr));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader back />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: tabSpace + 32,
            gap: 16,
          }}
        >
          {/* Top Wizard Progress Indicator */}
          <View style={{ gap: 8, marginTop: 4 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Txt
                accessibilityRole="header"
                style={{
                  fontFamily: font.heavy,
                  fontSize: 24,
                  lineHeight: 30,
                  letterSpacing: -0.5,
                  color: theme.ink,
                }}
              >
                Create a Community
              </Txt>
              <Pill label={`Step ${step} of 4`} tone="violet" />
            </View>

            <View style={styles.progressStepsRow}>
              {[1, 2, 3, 4].map((idx) => {
                const active = idx <= step;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.progressSegment,
                      {
                        backgroundColor: active
                          ? activeSwatch.hex
                          : theme.border,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>

          {/* Live Community Preview Banner Card */}
          <View
            style={[
              styles.previewCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
              shadow.card,
            ]}
          >
            <View style={styles.previewBannerBox}>
              <Picture
                source={
                  coverDataUrl ? { uri: coverDataUrl } : defaultCover(hue)
                }
                hue={hue}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={["rgba(10,8,24,0.1)", "rgba(10,8,24,0.82)"]}
                style={StyleSheet.absoluteFill}
              />
              <PressableScale
                onPress={() => void handlePickCover()}
                accessibilityRole="button"
                accessibilityLabel="Upload community banner image"
                scaleTo={0.94}
                style={styles.uploadBannerBtn}
              >
                <Ionicons name="camera" size={14} color="#FFFFFF" />
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 11.5,
                    color: "#FFFFFF",
                  }}
                >
                  {coverDataUrl ? "Change Banner" : "Upload Banner"}
                </Txt>
              </PressableScale>
            </View>

            <View style={styles.previewBodyRow}>
              <PressableScale
                onPress={() => void handlePickIcon()}
                accessibilityRole="button"
                accessibilityLabel="Upload community icon"
                scaleTo={0.94}
                style={[
                  styles.previewAvatarBox,
                  { borderColor: theme.surface },
                ]}
              >
                <Picture
                  source={
                    iconDataUrl ? { uri: iconDataUrl } : defaultCover(hue)
                  }
                  hue={hue}
                  label={name || "K"}
                  radius={16}
                  style={{ width: 64, height: 64 }}
                />
                <View
                  style={[
                    styles.avatarCameraBadge,
                    { backgroundColor: activeSwatch.hex },
                  ]}
                >
                  <Ionicons name="camera" size={11} color="#FFFFFF" />
                </View>
              </PressableScale>

              <View style={{ flex: 1, gap: 2 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <Txt
                    numberOfLines={1}
                    style={{
                      fontFamily: font.heavy,
                      fontSize: 17,
                      color: theme.ink,
                    }}
                  >
                    {name.trim() || "Your Community Name"}
                  </Txt>
                  {isMature18Plus ? (
                    <Pill label="18+" tone="pink" variant="solid" />
                  ) : null}
                </View>
                <Txt
                  numberOfLines={1}
                  style={{
                    fontFamily: font.semibold,
                    fontSize: 11.5,
                    color: activeSwatch.hex,
                  }}
                >
                  kamino.app/c/{generatedSlug} ·{" "}
                  {privacy === "public"
                    ? "Public"
                    : privacy === "private"
                      ? "Approval Required"
                      : "Secret"}
                </Txt>
                <Txt
                  numberOfLines={2}
                  style={{
                    fontFamily: font.regular,
                    fontSize: 12,
                    color: theme.muted,
                  }}
                >
                  {tagline.trim() ||
                    "Your tagline and welcome message will appear here."}
                </Txt>
              </View>
            </View>
          </View>

          {errorMsg ? (
            <View
              accessibilityRole="alert"
              style={[
                styles.errorBanner,
                {
                  backgroundColor: theme.tints.red,
                  borderColor: theme.danger,
                },
              ]}
            >
              <Ionicons name="alert-circle" size={18} color={theme.danger} />
              <Txt
                style={{
                  flex: 1,
                  fontFamily: font.semibold,
                  fontSize: 12.5,
                  color: theme.danger,
                }}
              >
                {errorMsg}
              </Txt>
            </View>
          ) : null}

          {/* ── STEP 1: IDENTITY & MEDIA ── */}
          {step === 1 ? (
            <View
              style={[
                styles.stepCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
                shadow.card,
              ]}
            >
              <SectionHeader title="Step 1 · Name & Identity" />
              <Field
                label="Community Name"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Anime Theory Realm"
                maxLength={48}
                hint={`Handle: /c/${generatedSlug}`}
              />
              <Field
                label="Tagline & Description"
                value={tagline}
                onChangeText={setTagline}
                placeholder="What brings your members together?"
                maxLength={240}
                multiline
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button
                  small
                  variant="secondary"
                  label={iconDataUrl ? "Change Icon ✓" : "Pick Square Icon"}
                  onPress={() => void handlePickIcon()}
                  style={{ flex: 1 }}
                />
                <Button
                  small
                  variant="secondary"
                  label={coverDataUrl ? "Change Banner ✓" : "Pick Cover Banner"}
                  onPress={() => void handlePickCover()}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : null}

          {/* ── STEP 2: PRIVACY TIER & 18+ MATURE GATE ── */}
          {step === 2 ? (
            <View
              style={[
                styles.stepCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
                shadow.card,
              ]}
            >
              <SectionHeader title="Step 2 · Privacy & Age Gate" />
              {PRIVACY_OPTIONS.map((opt) => {
                const selected = privacy === opt.key;
                return (
                  <PressableScale
                    key={opt.key}
                    onPress={() => {
                      haptic.tap();
                      setPrivacy(opt.key);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${opt.title}: ${opt.subtitle}`}
                    scaleTo={0.98}
                    style={[
                      styles.privacyOptionRow,
                      {
                        backgroundColor: selected
                          ? theme.tints[opt.tone]
                          : theme.surfaceAlt,
                        borderColor: selected
                          ? theme[opt.tone]
                          : theme.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.privacyIconCircle,
                        { backgroundColor: theme.surface },
                      ]}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={19}
                        color={theme.toneText[opt.tone]}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt
                        style={{
                          fontFamily: font.heavy,
                          fontSize: 14.5,
                          color: theme.ink,
                        }}
                      >
                        {opt.title}
                      </Txt>
                      <Txt
                        style={{
                          fontFamily: font.regular,
                          fontSize: 12,
                          lineHeight: 16,
                          color: theme.muted,
                        }}
                      >
                        {opt.subtitle}
                      </Txt>
                    </View>
                    <Ionicons
                      name={
                        selected ? "checkmark-circle" : "ellipse-outline"
                      }
                      size={22}
                      color={selected ? theme[opt.tone] : theme.subtle}
                    />
                  </PressableScale>
                );
              })}

              {/* 18+ Mature Content Switch */}
              <View
                style={[
                  styles.matureSwitchRow,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Txt
                      style={{
                        fontFamily: font.heavy,
                        fontSize: 14,
                        color: theme.ink,
                      }}
                    >
                      18+ Mature Community
                    </Txt>
                    <Pill label="18+" tone="pink" />
                  </View>
                  <Txt
                    style={{
                      fontFamily: font.regular,
                      fontSize: 12,
                      lineHeight: 16,
                      color: theme.muted,
                    }}
                  >
                    Restrict access to age-verified adult members only.
                  </Txt>
                </View>
                <Switch
                  value={isMature18Plus}
                  onValueChange={(v) => {
                    haptic.tap();
                    setIsMature18Plus(v);
                  }}
                  accessibilityLabel="18 plus mature community toggle"
                  trackColor={{ true: theme.pink, false: theme.border }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          ) : null}

          {/* ── STEP 3: TOPICS & THEME COLOR SEED ── */}
          {step === 3 ? (
            <View
              style={[
                styles.stepCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
                shadow.card,
              ]}
            >
              <SectionHeader title="Step 3 · Category, Topics & Theme" />

              <Txt
                style={{
                  fontFamily: font.bold,
                  fontSize: 13,
                  color: theme.ink,
                }}
              >
                Primary Category
              </Txt>
              <View style={styles.categoryGrid}>
                {TOPIC_CATEGORIES.map((cat) => {
                  const selected = category === cat.key;
                  return (
                    <PressableScale
                      key={cat.key}
                      onPress={() => {
                        haptic.tap();
                        setCategory(cat.key);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={cat.label}
                      scaleTo={0.95}
                      style={[
                        styles.categoryChip,
                        {
                          backgroundColor: selected
                            ? theme.tints.violet
                            : theme.surfaceAlt,
                          borderColor: selected
                            ? theme.violet
                            : theme.border,
                        },
                      ]}
                    >
                      <Txt style={{ fontSize: 15 }}>{cat.emoji}</Txt>
                      <Txt
                        style={{
                          fontFamily: selected ? font.heavy : font.semibold,
                          fontSize: 12.5,
                          color: selected
                            ? theme.toneText.violet
                            : theme.ink,
                        }}
                      >
                        {cat.label}
                      </Txt>
                    </PressableScale>
                  );
                })}
              </View>

              <Txt
                style={{
                  fontFamily: font.bold,
                  fontSize: 13,
                  color: theme.ink,
                  marginTop: 6,
                }}
              >
                Community Accent Color
              </Txt>
              <View style={styles.swatchRow}>
                {THEME_SWATCHES.map((sw) => {
                  const selected = hue === sw.hue;
                  return (
                    <PressableScale
                      key={sw.hue}
                      onPress={() => {
                        haptic.tap();
                        setHue(sw.hue);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`Theme color ${sw.label}`}
                      scaleTo={0.9}
                      style={[
                        styles.colorSwatchCircle,
                        {
                          backgroundColor: sw.hex,
                          borderWidth: selected ? 3 : 0,
                          borderColor: theme.ink,
                        },
                      ]}
                    >
                      {selected ? (
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      ) : null}
                    </PressableScale>
                  );
                })}
              </View>

              <Txt
                style={{
                  fontFamily: font.bold,
                  fontSize: 13,
                  color: theme.ink,
                  marginTop: 6,
                }}
              >
                Topic Channels ({selectedTags.length}/10)
              </Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {selectedTags.map((t) => (
                  <PressableScale
                    key={t}
                    onPress={() => handleRemoveTag(t)}
                    accessibilityLabel={`Remove topic ${t}`}
                    scaleTo={0.94}
                    style={[
                      styles.tagPill,
                      {
                        backgroundColor: theme.tints.violet,
                        borderColor: theme.violet,
                      },
                    ]}
                  >
                    <Txt
                      style={{
                        fontFamily: font.bold,
                        fontSize: 12,
                        color: theme.toneText.violet,
                      }}
                    >
                      {t}
                    </Txt>
                    <Ionicons
                      name="close-circle"
                      size={14}
                      color={theme.violet}
                    />
                  </PressableScale>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Add a custom #topic"
                    value={customTagInput}
                    onChangeText={setCustomTagInput}
                    placeholder="e.g. Cosplay"
                    maxLength={24}
                    onSubmitEditing={handleAddTag}
                  />
                </View>
                <Button
                  small
                  variant="secondary"
                  label="Add"
                  onPress={handleAddTag}
                />
              </View>
            </View>
          ) : null}

          {/* ── STEP 4: HOUSE RULES & LAUNCH ── */}
          {step === 4 ? (
            <View
              style={[
                styles.stepCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
                shadow.card,
              ]}
            >
              <SectionHeader title="Step 4 · Community Rules" />
              <Txt
                style={{
                  fontFamily: font.regular,
                  fontSize: 12.5,
                  color: theme.muted,
                }}
              >
                Clear guidelines help keep your fandom welcoming. You can edit
                these anytime in Moderation Tools.
              </Txt>

              <View style={{ gap: 8 }}>
                {rules.map((rule, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.ruleItemRow,
                      {
                        backgroundColor: theme.surfaceAlt,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <Txt
                      style={{
                        fontFamily: font.heavy,
                        fontSize: 13,
                        color: activeSwatch.hex,
                      }}
                    >
                      #{idx + 1}
                    </Txt>
                    <Txt
                      style={{
                        flex: 1,
                        fontFamily: font.regular,
                        fontSize: 13,
                        lineHeight: 18,
                        color: theme.ink,
                      }}
                    >
                      {rule}
                    </Txt>
                    <PressableScale
                      onPress={() => handleRemoveRule(idx)}
                      accessibilityLabel={`Remove rule ${idx + 1}`}
                      hitSlop={8}
                      scaleTo={0.9}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={theme.subtle}
                      />
                    </PressableScale>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Add another rule"
                    value={newRuleText}
                    onChangeText={setNewRuleText}
                    placeholder="e.g. Keep shipping debates friendly"
                    maxLength={160}
                    onSubmitEditing={handleAddRule}
                  />
                </View>
                <Button
                  small
                  variant="secondary"
                  label="Add Rule"
                  onPress={handleAddRule}
                />
              </View>
            </View>
          ) : null}

          {/* Bottom Wizard Navigation Buttons */}
          <View style={styles.wizardNavRow}>
            <Button
              label={step === 1 ? "Cancel" : "Back"}
              variant="secondary"
              onPress={goPrevStep}
              style={{ flex: 1 }}
            />
            {step < 4 ? (
              <GradientButton
                label="Next Step"
                iconRight="arrow-forward"
                gradient="hero"
                size="lg"
                onPress={goNextStep}
                style={{ flex: 2 }}
              />
            ) : (
              <GradientButton
                label={submitting ? "Launching…" : "Launch Community"}
                icon="rocket"
                gradient="hero"
                size="lg"
                busy={submitting}
                onPress={() => void handleCreateCommunity()}
                style={{ flex: 2 }}
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  progressStepsRow: {
    flexDirection: "row",
    gap: 6,
  },
  progressSegment: {
    flex: 1,
    height: 5,
    borderRadius: 2.5,
  },
  previewCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: "hidden",
  },
  previewBannerBox: {
    height: 96,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    padding: 10,
  },
  uploadBannerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(15, 11, 42, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  previewBodyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  previewAvatarBox: {
    marginTop: -28,
    borderRadius: 18,
    borderWidth: 3,
    position: "relative",
  },
  avatarCameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: radius.tile,
    borderWidth: 1,
  },
  stepCard: {
    padding: 16,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: 12,
  },
  privacyOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1.5,
  },
  privacyIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  matureSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    marginTop: 4,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  swatchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorSwatchCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  ruleItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: radius.tile,
    borderWidth: 1,
  },
  wizardNavRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
});
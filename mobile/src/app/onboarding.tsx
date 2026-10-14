import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/api/endpoints";
import type { CommunityCardData, CreatorCard } from "@/api/types";
import { GradientWord, VIOLET_GRADIENT } from "@/components/home/Decor";
import { StepHeader } from "@/components/home/StepHeader";
import {
  CommunityCard, GradientButton, JoinButton, ONBOARDING_INTERESTS, Picture, PersonAvatar, VerifiedTick,
  categoryByKey, personFromChip, useColumnWidth,
} from "@/components/k";
import { EmptyState, ErrorState, Field, Loading, PressableScale, Txt } from "@/components/ui";
import { interestArt, isInterestKey } from "@/lib/brandArt";
import { errorMessage, showError } from "@/lib/errors";
import { compactNumber } from "@/lib/format";
import { pickAvatar, pickPhoto } from "@/lib/media";
import { markOnboardingShown } from "@/lib/useWelcome";
import { font, radius, shadow, useTheme, withAlpha } from "@/theme";

/**
 * Onboarding steps 2–5 (step 1 is creating the account). 2: pick interests (mockup 02-interests),
 * 3: join a few communities, 4: follow some people, 5: photo, cover and a few words. "Skip" skips one step;
 * "Finish" marks onboarding as done and opens Home.
 */
type Step = 2 | 3 | 4 | 5;
const MIN_INTERESTS = 3;

const COPY: Record<Step, { lead: string; highlight: string; text: string }> = {
  2: { lead: "Pick Your ", highlight: "Interests", text: "Choose the topics you love, and we’ll personalize your feed, communities, and recommendations." },
  3: { lead: "Join ", highlight: "Communities", text: "A few places we think you’ll love. Join as many as you like." },
  4: { lead: "Follow ", highlight: "People", text: "Creators who share your interests. Follow them to see their posts." },
  5: { lead: "Your ", highlight: "Profile", text: "Add a photo and a few words so people know who you are. Everything here is optional." },
};

export default function Onboarding() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const scroller = useRef<ScrollView>(null);
  const boot = useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap });
  const profile = boot.data?.profile ?? null;

  const [step, setStep] = useState<Step>(2);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [joined, setJoined] = useState<Record<string, "joined" | "pending" | undefined>>({});
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pronouns, setPronouns] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");

  // Start from what the person already picked (if anything), and remember onboarding was shown.
  const interests = picked ?? profile?.interests ?? [];
  useEffect(() => {
    if (profile?.userId) void markOnboardingShown(profile.userId);
  }, [profile?.userId]);

  const suggestions = useQuery({ queryKey: ["onboardingSuggestions"], queryFn: api.onboardingSuggestions, enabled: step >= 3 });

  const goTo = (next: Step) => {
    setStep(next);
    scroller.current?.scrollTo({ y: 0, animated: false });
  };

  const toggleInterest = (key: string) =>
    setPicked(interests.includes(key) ? interests.filter((k) => k !== key) : [...interests, key]);

  async function saveInterests() {
    setSaving(true);
    try {
      await api.saveInterests(interests);
      await queryClient.invalidateQueries({ queryKey: ["onboardingSuggestions"] });
      goTo(3);
    } catch (e) {
      showError(e, "Couldn't save your interests");
    } finally {
      setSaving(false);
    }
  }

  async function toggleJoin(c: CommunityCardData) {
    const state = joined[c.id] ?? (c.joined ? "joined" : undefined);
    setBusyKey(c.id);
    try {
      if (state === "joined") {
        await api.leave(c.id);
        setJoined((cur) => ({ ...cur, [c.id]: undefined }));
      } else if (!state) {
        const result = await api.join({ slug: c.id });
        setJoined((cur) => ({ ...cur, [c.id]: result.pending ? "pending" : "joined" }));
      }
    } catch (e) {
      showError(e);
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleFollow(p: CreatorCard) {
    setBusyKey(p.userId);
    try {
      const result = await api.followProfile(p.userId);
      setFollowed((cur) => ({ ...cur, [p.userId]: result.following || result.requested }));
    } catch (e) {
      showError(e);
    } finally {
      setBusyKey(null);
    }
  }

  async function changePhoto(kind: "avatar" | "cover") {
    setBusyKey(kind);
    try {
      const dataUrl = kind === "avatar" ? await pickAvatar("library") : await pickPhoto("library", 1_400_000);
      if (!dataUrl) return;
      if (kind === "avatar") await api.setAvatar(dataUrl);
      else await api.setProfileCover(dataUrl);
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch (e) {
      Alert.alert("Couldn't set the picture", errorMessage(e));
    } finally {
      setBusyKey(null);
    }
  }

  /** Saves the profile bits (when `save`), marks onboarding finished and opens Home. */
  async function finish(save: boolean) {
    setSaving(true);
    try {
      if (save && (pronouns.trim() || location.trim() || bio.trim())) {
        await api.updateSettings({
          ...(pronouns.trim() ? { pronouns: pronouns.trim() } : {}),
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(bio.trim() ? { bio: bio.trim() } : {}),
        });
      }
      await api.finishOnboarding();
      await queryClient.invalidateQueries();
      router.replace("/");
    } catch (e) {
      showError(e, "Couldn't finish setting up");
      setSaving(false);
    }
  }

  const next = () => {
    if (step === 2) return void saveInterests();
    if (step === 5) return void finish(true);
    goTo((step + 1) as Step);
  };
  const skip = () => {
    if (step === 5) return void finish(false);
    goTo((step + 1) as Step);
  };

  const copy = COPY[step];
  const titleSize = Math.min(34, (width - 40) / ((copy.lead.length + copy.highlight.length) * 0.6));
  const tooFew = step === 2 && interests.length < MIN_INTERESTS;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.dark ? theme.bg : "#FFFFFF" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StepHeader onBack={step > 2 ? () => goTo((step - 1) as Step) : undefined} onSkip={skip} step={step} />
      <ScrollView ref={scroller} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", paddingHorizontal: 16, marginTop: 34 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end" }} accessible accessibilityRole="header" accessibilityLabel={`${copy.lead}${copy.highlight}`}>
            <Txt style={{ fontFamily: font.heavy, fontSize: titleSize, lineHeight: Math.round(titleSize * 1.2), letterSpacing: -0.8, color: theme.ink }}>{copy.lead}</Txt>
            <GradientWord text={copy.highlight} size={titleSize} colors={VIOLET_GRADIENT} />
          </View>
          <Txt style={{ marginTop: 6, textAlign: "center", fontFamily: font.regular, fontSize: 14.5, lineHeight: 20, color: theme.muted, maxWidth: 390 }}>{copy.text}</Txt>
        </View>

        <View style={{ marginTop: 24 }}>
          {step === 2 ? <InterestsGrid picked={interests} onToggle={toggleInterest} /> : null}
          {step === 3 ? (
            <SuggestionState query={suggestions} empty={!suggestions.data?.communities.length} emptyTitle="No suggestions yet" emptyBody="You can find communities any time in the Communities tab.">
              <CommunitiesGrid
                communities={suggestions.data?.communities ?? []}
                stateOf={(c) => joined[c.id] ?? (c.joined ? "joined" : undefined)}
                busyKey={busyKey}
                onToggle={(c) => void toggleJoin(c)}
              />
            </SuggestionState>
          ) : null}
          {step === 4 ? (
            <SuggestionState query={suggestions} empty={!suggestions.data?.creators.length} emptyTitle="No one to suggest yet" emptyBody="Follow people from their profiles whenever you like.">
              <View style={{ paddingHorizontal: 16, gap: 10 }}>
                {(suggestions.data?.creators ?? []).map((p, i) => (
                  <CreatorRow key={p.userId} person={p} index={i} following={followed[p.userId] ?? (p.following || p.requested)} busy={busyKey === p.userId} onFollow={() => void toggleFollow(p)} />
                ))}
              </View>
            </SuggestionState>
          ) : null}
          {step === 5 && profile ? (
            <View style={{ paddingHorizontal: 16, gap: 14 }}>
              {/* Cover with the round photo overlapping it, like the profile page. */}
              <View>
                <PressableScale onPress={() => void changePhoto("cover")} accessibilityLabel="Choose a cover picture" scaleTo={0.98}>
                  <Picture source={profile.cover || null} hue={profile.avatarHue} radius={radius.card} style={{ height: 130 }}>
                    <View style={{ position: "absolute", right: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(15,11,42,0.6)", borderRadius: 999, paddingHorizontal: 10, height: 30 }}>
                      <Ionicons name="image-outline" size={15} color="#fff" />
                      <Txt style={{ color: "#fff", fontFamily: font.semibold, fontSize: 12.5, lineHeight: 16 }}>{busyKey === "cover" ? "Saving…" : "Cover"}</Txt>
                    </View>
                  </Picture>
                </PressableScale>
                <PressableScale onPress={() => void changePhoto("avatar")} accessibilityLabel="Choose a profile photo" scaleTo={0.94} style={{ position: "absolute", left: 16, bottom: -38 }}>
                  <PersonAvatar person={{ name: profile.displayName, hue: profile.avatarHue, userId: profile.userId, avatarV: profile.avatarVersion }} size={84} outline={4} />
                  <View style={{ position: "absolute", right: 0, bottom: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: theme.violet, borderWidth: 2, borderColor: theme.surface, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="camera" size={14} color="#fff" />
                  </View>
                </PressableScale>
              </View>
              <View style={{ marginTop: 40, gap: 12 }}>
                <Field label="Pronouns (optional)" value={pronouns} onChangeText={setPronouns} maxLength={30} placeholder="e.g. she/her" autoCapitalize="none" />
                <Field label="Location (optional)" value={location} onChangeText={setLocation} maxLength={60} placeholder="e.g. Kelowna, BC" />
                <Field label="Short bio" value={bio} onChangeText={setBio} maxLength={300} multiline placeholder="A few words about you and what you love" />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 18, gap: 8, backgroundColor: theme.dark ? theme.bg : "#FFFFFF" }}>
        {tooFew ? (
          <Txt accessibilityLiveRegion="polite" style={{ textAlign: "center", fontFamily: font.semibold, fontSize: 13, lineHeight: 17, color: theme.muted }}>
            {`Pick at least ${MIN_INTERESTS} (${interests.length} picked)`}
          </Txt>
        ) : null}
        <GradientButton
          label={step === 5 ? "Finish" : "Continue"}
          gradient="hero"
          size="lg"
          iconRight={step === 5 ? "checkmark" : "arrow-forward"}
          full
          busy={saving}
          disabled={tooFew}
          onPress={next}
          style={{ height: 52 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/** Step 2: the 4-column grid of 16 interest tiles (02-interests). */
function InterestsGrid({ picked, onToggle }: { picked: string[]; onToggle: (key: string) => void }) {
  const tile = useColumnWidth(4, { inset: 10, gap: 8 });
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // The mockup phone is 813pt tall; on taller phones the pictures grow a little so the grid fills the screen.
  const extra = Math.max(0, height - insets.top - insets.bottom - 813);
  const pictureHeight = Math.round(tile / 1.24 + Math.min(30, (extra * 0.45) / 4));
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, rowGap: 13, paddingHorizontal: 10, justifyContent: "center" }}>
      {ONBOARDING_INTERESTS.map((key, i) => {
        const c = categoryByKey(key);
        return (
          <PickTile
            key={key}
            width={tile}
            label={c.label}
            emoji={c.emoji ?? "✨"}
            hue={i * 37}
            image={isInterestKey(key) ? interestArt[key] : undefined}
            pictureHeight={pictureHeight}
            selected={picked.includes(key)}
            onPress={() => onToggle(key)}
          />
        );
      })}
    </View>
  );
}

/**
 * One interest tile, sized like the mockup (picture on top, white label row with emoji). Selected = glowing
 * pink-violet ring and a white check in a violet circle. (The kit's `InterestTile` has a shorter label row, so
 * long names such as "Photography" would be cut off at four across.)
 */
function PickTile({ width, pictureHeight, label, emoji, image, hue, selected, onPress }: { width: number; pictureHeight: number; label: string; emoji: string; image?: ImageSourcePropType; hue: number; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const ring = theme.dark ? "#E879F9" : "#D946EF";
  const labelSize = label.length > 9 ? 9.8 : 12;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      scaleTo={0.95}
      style={[
        { width, borderRadius: radius.tile, backgroundColor: theme.surface, borderWidth: 2, borderColor: selected ? ring : theme.border, overflow: "hidden" },
        selected ? { boxShadow: `0px 0px 12px ${withAlpha("#C026D3", 0.35)}` } : shadow.card,
      ]}
    >
      <Picture source={image} hue={hue} emoji={emoji} style={{ width: "100%", height: pictureHeight }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, height: 34 }}>
        <Txt style={{ fontSize: 13.5, lineHeight: 18 }}>{emoji}</Txt>
        <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: labelSize, lineHeight: 15, letterSpacing: label.length > 9 ? -0.35 : -0.2, color: theme.ink, flexShrink: 1 }}>{label}</Txt>
      </View>
      {selected ? (
        <View style={{ position: "absolute", right: 5, top: 5, width: 23, height: 23, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff", backgroundColor: theme.violet }}>
          <Ionicons name="checkmark" size={13} color="#fff" />
        </View>
      ) : null}
    </PressableScale>
  );
}

/** Step 3: recommended communities, three across, each with Join / Joined / Requested. */
function CommunitiesGrid({ communities, stateOf, busyKey, onToggle }: { communities: CommunityCardData[]; stateOf: (c: CommunityCardData) => "joined" | "pending" | undefined; busyKey: string | null; onToggle: (c: CommunityCardData) => void }) {
  const col = useColumnWidth(3, { inset: 16, gap: 10 });
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16 }}>
      {communities.map((c, i) => {
        const state = stateOf(c);
        return (
          <View key={c.id} style={{ width: col }}>
            <CommunityCard
              variant="vertical"
              width="100%"
              name={c.name}
              description={c.tagline || c.description}
              image={c.cover || null}
              hue={c.hue}
              members={c.memberCount}
              faces={c.memberFaces.map(personFromChip)}
              joined={!!state}
              index={i}
              joining={busyKey === c.id}
              onPress={() => onToggle(c)}
              onJoin={() => onToggle(c)}
            />
            {state === "pending" ? <Txt style={{ marginTop: 4, textAlign: "center", fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: "#706D89" }}>Request sent</Txt> : null}
          </View>
        );
      })}
    </View>
  );
}

/** Step 4: one suggested creator (avatar, name + tick, headline, followers, Follow). */
function CreatorRow({ person, index, following, busy, onFollow }: { person: CreatorCard; index: number; following: boolean; busy: boolean; onFollow: () => void }) {
  const theme = useTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border }, shadow.card]}>
      <PersonAvatar person={{ name: person.displayName, hue: person.avatarHue, userId: person.userId, avatarV: person.avatarV }} size={50} />
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 15, lineHeight: 19, color: theme.ink, flexShrink: 1 }}>{person.displayName}</Txt>
          {person.verified ? <VerifiedTick size={14} /> : null}
        </View>
        {person.headline ? <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 13, lineHeight: 17, color: theme.muted }}>{person.headline}</Txt> : null}
        <Txt style={{ fontFamily: font.semibold, fontSize: 12, lineHeight: 16, color: theme.subtle }}>{`${compactNumber(person.followers)} ${person.followers === 1 ? "follower" : "followers"}`}</Txt>
      </View>
      <JoinButton joined={following} onPress={onFollow} index={index} label="Follow" joinedLabel="Following" size="md" busy={busy} accessibilityLabel={following ? `Unfollow ${person.displayName}` : `Follow ${person.displayName}`} />
    </View>
  );
}

/** Loading / error / empty wrapper for the suggestion steps. */
function SuggestionState({ query, empty, emptyTitle, emptyBody, children }: { query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }; empty: boolean; emptyTitle: string; emptyBody: string; children: ReactNode }) {
  if (query.isPending) return <Loading label="Finding good matches…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (empty) return <EmptyState icon="sparkles-outline" title={emptyTitle} body={emptyBody} />;
  return <>{children}</>;
}

import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { api } from "@/api/endpoints";
import { BUBBLE_STYLES, INTEREST_OPTIONS, MOOD_PRESETS, PROFILE_CATEGORY_OPTIONS, PROFILE_FRAME_IDS, type BubbleStyle, type Profile, type ProfileFrame } from "@/api/types";
import { serverImage } from "@/components/community/media";
import { notify } from "@/components/community/platform";
import { GradientButton, Picture } from "@/components/k";
import { toggleLimited, normalizeWebsite } from "@/components/profile/helpers";
import { Avatar, ErrorState, Field, Loading, PressableScale, Screen, Txt } from "@/components/ui";
import { BUBBLE_STYLE_LABELS } from "@/lib/cosmetics";
import { defaultCover } from "@/lib/brandArt";
import { errorMessage } from "@/lib/errors";
import { pickAvatar, pickPhoto } from "@/lib/media";
import { contentApi } from '@/lib/content-v9';
import { pickContentFile } from '@/lib/content-media';
import { font, radius, shadow, useTheme } from "@/theme";

const FRAME_LABELS: Record<ProfileFrame, string> = {
  none: "Plain", ring: "Ring", moon: "Moon", star: "Star", laurel: "Laurel", spark: "Sparkles", flame: "Flame", crown: "Crown", aurora: "Aurora",
};
const HUES = [0, 25, 50, 140, 175, 210, 250, 290, 330];
const MAX_CATEGORIES = 6;

export default function EditProfile() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  if (me.isPending) return <Loading />;
  if (me.isError || !me.data) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  return <Form profile={me.data.profile} onSaved={() => queryClient.invalidateQueries().then(() => router.back())} />;
}

/**
 * Edit your profile: photo and cover (saved straight away), then name, headline, pronouns, bio, status, location,
 * website, the profile category tiles (up to six), interests, mood, frame and chat bubble look (saved with "Save").
 */
function Form({ profile, onSaved }: { profile: Profile; onSaved: () => Promise<unknown> }) {
  const allowance=useQuery({queryKey:['uploadAllowance'],queryFn:contentApi.uploadAllowance});
  const queryClient = useQueryClient();
  const theme = useTheme();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [pronouns, setPronouns] = useState(profile.pronouns ?? "");
  const [bio, setBio] = useState(profile.bio);
  const [status, setStatus] = useState(profile.status);
  const [location, setLocation] = useState(profile.location ?? "");
  const [website, setWebsite] = useState(profile.website ?? "");
  const [categories, setCategories] = useState<string[]>(profile.profileCategories ?? []);
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [mood, setMood] = useState(profile.mood);
  const [frame, setFrame] = useState<ProfileFrame>(profile.frame);
  const [bubbleHue, setBubbleHue] = useState(profile.bubbleHue);
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>(profile.bubbleStyle);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const websiteValue = normalizeWebsite(website);

  /** Photos are saved straight away (not with the Save button) so they never get lost. */
  const media = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await work();
      await queryClient.invalidateQueries();
    } catch (e) {
      notify("Couldn't update the picture", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const changePhoto = () => media("photo", async () => { const d = await pickAvatar("library"); if (d) await api.setAvatar(d); });
  const animatedPhoto=()=>media('photo',async()=>{const file=await pickContentFile('gif','image/gif',2_000_000);if(file)await api.setAvatar(file.dataUrl);});
  const removePhoto = () => media("photo", () => api.removeAvatar());
  const changeCover = () => media("cover", async () => { const d = await pickPhoto("library", 1_400_000); if (d) await api.setProfileCover(d); });
  const removeCover = () => media("cover", () => api.removeProfileCover());

  const save = async () => {
    setError(null);
    if (displayName.trim().length < 2) return setError("Your name needs at least 2 characters.");
    if (websiteValue === null) return setError("That website doesn't look right. Try something like linktr.ee/yourname.");
    setBusy("save");
    try {
      await api.updateSettings({
        displayName: displayName.trim(),
        headline: headline.trim(),
        pronouns: pronouns.trim(),
        bio,
        status,
        location: location.trim(),
        website: websiteValue,
        profileCategories: categories,
        interests,
        mood,
        frame,
        bubbleHue,
        bubbleStyle,
      });
      await onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      {/* ── Cover + photo ── */}
      <View style={[{ borderRadius: radius.card, overflow: "hidden", backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }, shadow.card]}>
        <Picture source={profile.cover ? serverImage(profile.cover) : defaultCover(profile.avatarHue)} hue={profile.avatarHue} style={{ height: 110 }}>
          <View style={{ position: "absolute", right: 10, top: 10, flexDirection: "row", gap: 6 }}>
            <SmallButton icon="image-outline" label={profile.cover ? "Change cover" : "Add a cover"} onPress={() => void changeCover()} busy={busy === "cover"} dark />
            {profile.cover ? <SmallButton icon="trash-outline" label="Remove" onPress={() => void removeCover()} dark /> : null}
          </View>
        </Picture>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, paddingHorizontal: 14, paddingBottom: 14, marginTop: -40 }}>
          <Avatar name={displayName || "?"} hue={profile.avatarHue} size={84} userId={profile.userId} version={profile.avatarVersion} outline={4} ring={frame !== "none"} frame={frame} />
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", flex: 1, paddingBottom: 4 }}>
            <SmallButton icon="camera-outline" label={profile.avatarVersion ? "Change photo" : "Add a photo"} onPress={() => void changePhoto()} busy={busy === "photo"} />
            {allowance.data?.animatedAvatar?<SmallButton icon="sparkles-outline" label="Animated GIF" onPress={()=>void animatedPhoto()} busy={busy==='photo'}/>:null}
            {profile.avatarVersion ? <SmallButton icon="trash-outline" label="Remove" onPress={() => void removePhoto()} /> : null}
          </View>
        </View>
      </View>

      <Section title="About you" icon="person-circle-outline">
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} />
        <Field label="Headline" value={headline} onChangeText={setHeadline} maxLength={40} placeholder="Digital Artist, Gamer, Bookworm…" hint="A few words under your name." />
        <Field label="Pronouns (optional)" value={pronouns} onChangeText={setPronouns} maxLength={24} placeholder="she/her, he/him, they/them…" autoCapitalize="none" />
        <Field label="Bio" value={bio} onChangeText={setBio} multiline maxLength={280} hint={`${bio.length}/280`} />
        <Field label="Status" value={status} onChangeText={setStatus} maxLength={80} placeholder="What are you up to?" />
        <Field label="Location (optional)" value={location} onChangeText={setLocation} maxLength={40} placeholder="City or region" />
        <Field
          label="Website (optional)"
          value={website}
          onChangeText={setWebsite}
          maxLength={200}
          placeholder="linktr.ee/yourname"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          error={websiteValue === null ? "Use a web address like linktr.ee/yourname" : null}
        />
      </Section>

      <Section title="Profile categories" icon="grid-outline" hint={`Tiles on your profile that open your posts with that tag (#art, #daily…). Pick up to ${MAX_CATEGORIES}: ${categories.length}/${MAX_CATEGORIES}.`}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PROFILE_CATEGORY_OPTIONS.map((c) => {
            const on = categories.includes(c.key);
            return <ChoiceChip key={c.key} label={`${c.emoji} ${c.label}`} selected={on} disabled={!on && categories.length >= MAX_CATEGORIES} onPress={() => setCategories((list) => toggleLimited(list, c.key, MAX_CATEGORIES))} />;
          })}
        </View>
      </Section>

      <Section title="Interests" icon="sparkles-outline" hint="We use these to suggest communities and posts.">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {INTEREST_OPTIONS.map((o) => (
            <ChoiceChip key={o.key} label={`${o.emoji} ${o.label}`} selected={interests.includes(o.key)} onPress={() => setInterests((list) => toggleLimited(list, o.key, INTEREST_OPTIONS.length))} />
          ))}
        </View>
      </Section>

      <Section title="Mood" icon="happy-outline">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {MOOD_PRESETS.map((m) => <ChoiceChip key={m} label={m} selected={mood === m} onPress={() => setMood(mood === m ? "" : m)} />)}
        </View>
      </Section>

      <Section title="Profile frame" icon="ellipse-outline">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PROFILE_FRAME_IDS.map((f) => <ChoiceChip key={f} label={FRAME_LABELS[f]} selected={frame === f} onPress={() => setFrame(f)} />)}
        </View>
      </Section>

      <Section title="Chat bubbles" icon="chatbubble-ellipses-outline">
        <Txt style={{ fontFamily: font.semibold, fontSize: 12.5, lineHeight: 16, color: theme.muted }}>Colour</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {HUES.map((h) => (
            <Pressable
              key={h}
              accessibilityRole="button"
              accessibilityLabel={`Bubble colour ${h}`}
              accessibilityState={{ selected: bubbleHue === h }}
              onPress={() => setBubbleHue(h)}
              hitSlop={3}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: `hsl(${h}, 70%, 62%)`, borderWidth: bubbleHue === h ? 3 : 0, borderColor: theme.ink }}
            />
          ))}
        </View>
        <Txt style={{ fontFamily: font.semibold, fontSize: 12.5, lineHeight: 16, color: theme.muted }}>Style</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {BUBBLE_STYLES.map((b) => <ChoiceChip key={b} label={BUBBLE_STYLE_LABELS[b]} selected={bubbleStyle === b} onPress={() => setBubbleStyle(b)} />)}
        </View>
      </Section>

      {error ? (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderRadius: radius.tile, backgroundColor: theme.tints.red }}>
          <Ionicons name="alert-circle" size={18} color={theme.danger} />
          <Txt style={{ flex: 1, fontFamily: font.semibold, fontSize: 13, lineHeight: 18, color: theme.danger }}>{error}</Txt>
        </View>
      ) : null}
      <GradientButton label="Save" icon="checkmark" size="lg" gradient="hero" full onPress={() => void save()} busy={busy === "save"} />
    </Screen>
  );
}

/** A white card with a coloured icon + title (the redesign's section look). */
function Section({ title, icon, hint, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; hint?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[{ gap: 10, padding: 14, borderRadius: radius.card, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }, shadow.card]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons name={icon} size={19} color={theme.violet} />
        <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 16, lineHeight: 21, color: theme.ink }}>{title}</Txt>
      </View>
      {hint ? <Txt style={{ fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: theme.muted, marginTop: -4 }}>{hint}</Txt> : null}
      {children}
    </View>
  );
}

/** A pickable pill: white with a border, or the violet gradient look when chosen. */
function ChoiceChip({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={label}
      hitSlop={4}
      scaleTo={0.95}
      style={{ height: 36, paddingHorizontal: 13, borderRadius: radius.pill, justifyContent: "center", borderWidth: 1, backgroundColor: selected ? theme.violet : theme.surface, borderColor: selected ? theme.violet : theme.border, opacity: disabled ? 0.45 : 1 }}
    >
      <Txt style={{ fontFamily: selected ? font.bold : font.semibold, fontSize: 13, lineHeight: 17, color: selected ? "#fff" : theme.ink }}>{label}</Txt>
    </PressableScale>
  );
}

/** A small pill button for the picture controls (dark see-through on the cover). */
function SmallButton({ icon, label, onPress, busy, dark }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; busy?: boolean; dark?: boolean }) {
  const theme = useTheme();
  const fg = dark ? "#fff" : theme.toneText.violet;
  return (
    <PressableScale onPress={onPress} disabled={busy} accessibilityLabel={label} hitSlop={6} scaleTo={0.95} style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: dark ? "rgba(15,11,42,0.55)" : theme.tints.violet }}>
      <Ionicons name={icon} size={15} color={fg} />
      <Txt style={{ fontFamily: font.bold, fontSize: 12.5, lineHeight: 16, color: fg }}>{busy ? "Uploading…" : label}</Txt>
    </PressableScale>
  );
}

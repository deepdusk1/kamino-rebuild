import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { api } from "@/api/endpoints";
import { imageSource } from "@/api/client";
import { THEME_STYLES, type Community, type ThemeStyle } from "@/api/types";
import { withCommunityTheme } from "@/components/CommunityTheme";
import { Avatar, Button, Chip, ErrorState, Field, Loading, Screen, Txt } from "@/components/ui";
import { BANNERS } from "@/lib/covers";
import { communityColors } from "@/lib/communityColors";
import { useAction } from "@/lib/errors";
import { pickAvatar, pickPhoto } from "@/lib/media";
import { radius, space, useTheme } from "@/theme";

const STYLE_LABEL: Record<ThemeStyle, string> = { aurora: "Aurora", solid: "Solid", vivid: "Vivid", soft: "Soft", night: "Night" };
const HUES = [0, 25, 50, 90, 140, 175, 210, 250, 290, 330];

/** Leaders only: name, words, colour, style, banner and icon, with a live preview. */
function Look() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const page = useQuery({ queryKey: ["community", slug], queryFn: () => api.community(slug!), enabled: !!slug });
  if (page.isPending) return <Loading />;
  if (page.isError || !page.data) return <ErrorState error={page.error} onRetry={() => void page.refetch()} />;
  const role = page.data.member?.role;
  if (page.data.member?.status !== "active" || (role !== "leader" && role !== "agent")) {
    return <ErrorState error={new Error("Only leaders can change how the community looks.")} />;
  }
  return <Form slug={slug!} community={page.data.community} />;
}

function Form({ slug, community: c }: { slug: string; community: Community }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [name, setName] = useState(c.name);
  const [tagline, setTagline] = useState(c.tagline);
  const [description, setDescription] = useState(c.description);
  const [rules, setRules] = useState(c.rules);
  const [hue, setHue] = useState(c.hue);
  const [style, setStyle] = useState<ThemeStyle>(c.themeStyle);
  const [cover, setCover] = useState(c.cover);
  const [coverUpload, setCoverUpload] = useState<string | undefined>();
  const [iconUpload, setIconUpload] = useState<string | null | undefined>();
  const colors = communityColors(hue, style, theme.dark);
  const shownIcon = iconUpload === null ? "" : (iconUpload ?? c.icon);

  const [choose, choosing] = useAction(async (kind: "banner" | "icon") => {
    if (kind === "banner") {
      const picture = await pickPhoto("library", 1_400_000);
      if (picture) setCoverUpload(picture);
    } else {
      const picture = await pickAvatar("library");
      if (picture) setIconUpload(picture);
    }
  }, { errorTitle: "Couldn't use that picture" });

  const [save, saving] = useAction(async () => {
    await api.updateLook({
      slug, name: name.trim(), tagline: tagline.trim(), description: description.trim(), rules: rules.trim(), hue, themeStyle: style,
      ...(coverUpload !== undefined ? { coverUpload } : cover !== c.cover ? { cover } : {}),
      ...(iconUpload !== undefined ? { iconUpload } : {}),
    });
    await queryClient.invalidateQueries();
    Alert.alert("Saved", "Your community looks new.");
    router.back();
  });

  return (
    <Screen>
      <View style={{ borderRadius: radius.xl, overflow: "hidden", height: 150 }} accessibilityLabel="Preview of the community header">
        {coverUpload ? <Image source={{ uri: coverUpload }} style={{ position: "absolute", inset: 0 }} contentFit="cover" /> : cover ? <Image source={imageSource(cover)} style={{ position: "absolute", inset: 0 }} contentFit="cover" /> : null}
        <LinearGradient colors={[colors.from, colors.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", inset: 0, opacity: colors.tint }} />
        <LinearGradient colors={["transparent", "rgba(12,6,32,0.85)"]} style={{ position: "absolute", inset: 0 }} />
        <View style={{ position: "absolute", left: space.md, right: space.md, bottom: space.md, flexDirection: "row", alignItems: "center", gap: space.md }}>
          {shownIcon ? <Image source={iconUpload ? { uri: iconUpload } : imageSource(shownIcon)} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" /> : null}
          <View style={{ flex: 1 }}>
            <Txt variant="heading" style={{ color: "#fff" }} numberOfLines={1}>{name || "Name"}</Txt>
            <Txt variant="caption" style={{ color: "#ffffffd9" }} numberOfLines={1}>{tagline}</Txt>
          </View>
          <View style={{ backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 }}>
            <Txt variant="label" style={{ color: colors.accentFg }}>Join</Txt>
          </View>
        </View>
      </View>

      <Field label="Name" value={name} onChangeText={setName} maxLength={40} />
      <Field label="Tagline" value={tagline} onChangeText={setTagline} maxLength={120} />
      <Field label="About" value={description} onChangeText={setDescription} multiline maxLength={1000} />
      <Field label="Rules" value={rules} onChangeText={setRules} multiline maxLength={2000} />

      <View style={{ gap: space.sm }}>
        <Txt variant="label" tone="subtle">Colour</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {HUES.map((h) => (
            <Pressable key={h} accessibilityRole="button" accessibilityLabel={`Colour ${h}`} accessibilityState={{ selected: hue === h }} onPress={() => setHue(h)} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: `hsl(${h}, 70%, 55%)`, borderWidth: hue === h ? 3 : 0, borderColor: theme.fg }} />
          ))}
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <Txt variant="label" tone="subtle">Colour style</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {THEME_STYLES.map((s) => <Chip key={s} label={STYLE_LABEL[s]} selected={style === s} onPress={() => setStyle(s)} />)}
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <Txt variant="label" tone="subtle">Banner</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {BANNERS.map((b) => (
            <Pressable key={b.src} accessibilityRole="button" accessibilityLabel={`Banner ${b.label}`} accessibilityState={{ selected: !coverUpload && cover === b.src }} onPress={() => { setCover(b.src); setCoverUpload(undefined); }}>
              <Image source={imageSource(b.src)} style={{ width: 96, height: 56, borderRadius: radius.md, borderWidth: !coverUpload && cover === b.src ? 3 : 0, borderColor: theme.accent }} contentFit="cover" />
            </Pressable>
          ))}
        </View>
        <Button label={coverUpload ? "Choose a different upload" : "Upload your own banner"} variant="secondary" small onPress={() => void choose("banner")} busy={choosing} style={{ alignSelf: "flex-start" }} />
      </View>

      <View style={{ gap: space.sm }}>
        <Txt variant="label" tone="subtle">Icon</Txt>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          {shownIcon ? <Image source={iconUpload ? { uri: iconUpload } : imageSource(shownIcon)} style={{ width: 56, height: 56, borderRadius: 28 }} contentFit="cover" /> : <Avatar name={name || "?"} hue={hue} size={56} />}
          <Button label="Choose an icon" variant="secondary" small onPress={() => void choose("icon")} busy={choosing} />
          {shownIcon ? <Button label="Remove" variant="ghost" small onPress={() => setIconUpload(null)} /> : null}
        </View>
        <Txt variant="caption" tone="muted">Uploaded pictures are shown publicly on community listings.</Txt>
      </View>

      <Button label="Save look" onPress={() => void save()} busy={saving} />
    </Screen>
  );
}

export default withCommunityTheme(Look);

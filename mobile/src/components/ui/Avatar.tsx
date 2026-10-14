import { Image, type ImageSource } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import { apiBaseUrl } from "@/api/config";
import { frameLook } from "@/lib/cosmetics";
import { font, hueGradient, useTheme } from "@/theme";
import { Txt } from "./Txt";
import { PresenceDot } from "./PresenceDot";

type Props = {
  name: string;
  hue: number;
  size?: number;
  /** With `version`, shows the person's profile photo instead of their initial. */
  userId?: string;
  /** The photo version the server reports (0 or missing = no photo). */
  version?: number;
  /** Any other picture to show (a web address, `require(...)` result or image source). Wins over `userId`. */
  source?: string | number | ImageSource | null;
  /** A glowing gradient ring around the avatar (profiles, the chat header). */
  ring?: boolean;
  /** The person's chosen frame (ring colours and charm). Only shown together with `ring`; "none" turns the ring off. */
  frame?: string;
  /** A white ring around the face (avatar stacks, big profile avatars). `true` = 2px, or a width in px. */
  outline?: boolean | number;
  /** Presence dot at the bottom right: green when true, grey when false, none when left out. */
  online?: boolean;
};

/** The address of someone's profile photo (or null when they have none). */
export function avatarUri(userId: string | undefined, version: number | undefined): string | null {
  return userId && version && version > 0 ? `${apiBaseUrl()}/api/v1/media/avatar/${userId}?v=${version}` : null;
}

/**
 * A round avatar: the profile photo when there is one, otherwise the initial on a colourful gradient (never a
 * grey circle). Optional white `outline`, presence dot (`online`) and gradient `ring`.
 */
export function Avatar({ name, hue, size = 40, userId, version, source, ring, frame, outline, online }: Props) {
  const theme = useTheme();
  const uri = avatarUri(userId, version);
  const picture = source ?? (uri ? { uri } : null);
  const ringWidth = outline === true ? 2 : typeof outline === "number" ? outline : 0;
  const face = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderWidth: ringWidth,
        borderColor: theme.surface,
        backgroundColor: theme.surface,
      }}
    >
      <LinearGradient colors={hueGradient(hue, theme.dark)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", width: size, height: size }} />
      <Txt style={{ color: "#fff", fontFamily: font.heavy, fontSize: size * 0.42, lineHeight: size * 0.52 }}>
        {(name.trim()[0] ?? "?").toUpperCase()}
      </Txt>
      {picture ? (
        // The version in the address makes a newly chosen photo appear at once; the old one stays cached.
        <Image
          source={picture}
          style={{ position: "absolute", width: size, height: size }}
          contentFit="cover"
          transition={160}
          cachePolicy="disk"
          accessible={false}
        />
      ) : null}
    </View>
  );

  const dotSize = Math.max(10, Math.round(size * 0.26));
  const dot =
    online === undefined ? null : (
      <PresenceDot
        size={dotSize}
        online={online}
        style={{
          position: "absolute",
          right: size * 0.02,
          bottom: size * 0.02,
        }}
      />
    );

  const look = ring ? frameLook(frame) : null;
  if (!look) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={`${name}'s avatar${online === undefined ? "" : online ? ", Online" : ", Offline"}`}>
        {face}
        {dot}
      </View>
    );
  }
  const pad = Math.max(2, Math.round(size * 0.05));
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${name}'s avatar${online === undefined ? "" : online ? ", Online" : ", Offline"}`} style={{ borderRadius: size }}>
      <LinearGradient colors={look.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: pad, borderRadius: size }}>
        <View style={{ padding: pad, borderRadius: size, backgroundColor: theme.surface }}>{face}</View>
      </LinearGradient>
      {look.charm ? (
        <Txt accessible={false} style={{ position: "absolute", right: -size * 0.06, bottom: -size * 0.06, fontSize: Math.max(12, size * 0.3), lineHeight: Math.max(14, size * 0.36) }}>{look.charm}</Txt>
      ) : null}
      {dot}
    </View>
  );
}

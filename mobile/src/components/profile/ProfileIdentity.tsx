import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Linking, StyleSheet, View } from "react-native";
import { rpc } from "@/api/client";
import { INTEREST_OPTIONS } from "@/api/types";
import { PressableScale, Txt } from "@/components/ui";
import { font, radius, shadow, useTheme } from "@/theme";

/** What `getProfileIdentity` returns (empty lists for a private account the viewer doesn't follow). */
export type ProfileIdentityData = {
  links: { label: string; url: string }[];
  interests: string[];
  profileHue: number;
  mutuals: { handle: string; name: string }[];
  supporterBadges: string[];
};

/** Loads interests, links, people-in-common and supporter badges for a profile. */
export function useProfileIdentity(handle: string) {
  return useQuery({
    queryKey: ["profileIdentity", handle],
    queryFn: () => rpc<ProfileIdentityData>("getProfileIdentity", handle),
    enabled: Boolean(handle),
  });
}

/** Interest key ("tech") → "💻 Tech". Unknown keys are shown as typed. */
export function interestLabel(key: string): string {
  const known = INTEREST_OPTIONS.find((o) => o.key === key);
  return known ? `${known.emoji} ${known.label}` : key;
}

/**
 * The "About" card in the body of a profile: interests, links and (on someone else's profile)
 * the people you both follow. Draws nothing when there is nothing to show.
 */
export function ProfileAbout({ identity, isSelf }: { identity: ProfileIdentityData | undefined; isSelf: boolean }) {
  const theme = useTheme();
  if (!identity) return null;
  // On your own profile "people in common" is just everyone you follow, so it is left out.
  const mutuals = isSelf ? [] : identity.mutuals;
  const hasContent = identity.interests.length > 0 || identity.links.length > 0 || mutuals.length > 0;
  if (!hasContent) return null;

  const label = (text: string) => (
    <Txt style={{ fontFamily: font.bold, fontSize: 11.5, lineHeight: 15, color: theme.muted, letterSpacing: 0.3 }}>{text.toUpperCase()}</Txt>
  );

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, shadow.card]}>
      <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 15.5, lineHeight: 21, color: theme.ink }}>
        About
      </Txt>

      {identity.interests.length > 0 ? (
        <View style={{ gap: 6 }}>
          {label("Interests")}
          <View style={styles.wrap}>
            {identity.interests.map((key) => (
              <View key={key} style={[styles.chip, { backgroundColor: theme.surfaceAlt }]}>
                <Txt style={{ fontFamily: font.semibold, fontSize: 12.5, lineHeight: 16, color: theme.ink }}>{interestLabel(key)}</Txt>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {identity.links.length > 0 ? (
        <View style={{ gap: 6 }}>
          {label("Links")}
          {identity.links.map((link) => (
            <PressableScale
              key={link.url}
              onPress={() => void Linking.openURL(link.url)}
              accessibilityRole="link"
              accessibilityLabel={`Open ${link.label}`}
              scaleTo={0.98}
              style={styles.linkRow}
            >
              <Ionicons name="link" size={15} color={theme.accent} />
              <Txt numberOfLines={1} style={{ flex: 1, fontFamily: font.semibold, fontSize: 13, lineHeight: 17, color: theme.accent }}>
                {link.label}
              </Txt>
              <Ionicons name="open-outline" size={14} color={theme.subtle} />
            </PressableScale>
          ))}
        </View>
      ) : null}

      {mutuals.length > 0 ? (
        <View style={{ gap: 6 }}>
          {label(`You both follow · ${mutuals.length}`)}
          <View style={styles.wrap}>
            {mutuals.map((person) => (
              <PressableScale
                key={person.handle}
                onPress={() => router.push(`/profile/${person.handle}`)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${person.name}'s profile`}
                scaleTo={0.95}
                style={[styles.chip, { backgroundColor: theme.tints.violet }]}
              >
                <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 12.5, lineHeight: 16, color: theme.toneText.violet, maxWidth: 140 }}>
                  {person.name}
                </Txt>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 15, padding: 14, gap: 12, borderRadius: radius.card, borderWidth: 1 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32 },
});

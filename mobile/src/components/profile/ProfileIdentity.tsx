import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Linking, View } from "react-native";
import { rpc } from "@/api/client";
import { Button, Txt } from "@/components/ui";
import { useTheme } from "@/theme";

type Identity = {
  links: { label: string; url: string }[];
  interests: string[];
  profileHue: number;
  mutuals: { handle: string; name: string }[];
  supporterBadges: string[];
};
export function ProfileIdentity({
  handle,
  userId,
}: {
  handle: string;
  userId: string;
}) {
  const theme = useTheme();
  const query = useQuery({
    queryKey: ["profileIdentity", handle],
    queryFn: () => rpc<Identity>("getProfileIdentity", handle),
    enabled: !!handle,
  });
  const identity = query.data;
  if (!identity) return null;
  return (
    <View
      style={{
        gap: 9,
        marginTop: 12,
        paddingLeft: 12,
        borderLeftWidth: 3,
        borderLeftColor: `hsl(${identity.profileHue}, 70%, 55%)`,
      }}
    >
      {identity.supporterBadges.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
          {identity.supporterBadges.map((badge) => (
            <Txt
              key={badge}
              variant="caption"
              style={{
                backgroundColor: theme.surfaceAlt,
                borderRadius: 12,
                paddingHorizontal: 9,
                paddingVertical: 4,
              }}
            >
              {badge}
            </Txt>
          ))}
        </View>
      ) : null}
      {identity.interests.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
          {identity.interests.map((interest) => (
            <Txt
              key={interest}
              variant="caption"
              style={{
                backgroundColor: theme.surfaceAlt,
                borderRadius: 12,
                paddingHorizontal: 9,
                paddingVertical: 4,
              }}
            >
              {interest}
            </Txt>
          ))}
        </View>
      ) : null}
      {identity.links.map((link) => (
        <Button
          key={link.url}
          small
          variant="ghost"
          label={`${link.label} ↗`}
          onPress={() => void Linking.openURL(link.url)}
        />
      ))}
      {identity.mutuals.length ? (
        <>
          <Txt variant="caption" tone="muted">
            Connections in common
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {identity.mutuals.map((person) => (
              <Button
                key={person.handle}
                small
                variant="secondary"
                label={person.name}
                onPress={() =>
                  router.push(`/profile/${person.handle}` as never)
                }
              />
            ))}
          </View>
        </>
      ) : null}
      <Button
        small
        variant="secondary"
        label="Stories, highlights and portfolio"
        onPress={() =>
          router.push(
            `/profile-content?userId=${encodeURIComponent(userId)}` as never,
          )
        }
      />
    </View>
  );
}

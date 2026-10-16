import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSession } from "@/auth/session";
import { KaminoMark } from "@/components/k";
import { identityApi } from "@/lib/identity-v9";
import { font, radius, shadow, useTheme } from "@/theme";
import { PressableScale, Txt } from "./ui";

/** Welcome-tour invite on Home, in the brand gradient like the hero banners. Hidden once the tour is done. */
export function TutorialPrompt() {
  const theme = useTheme();
  const { status } = useSession();
  const query = useQuery({ queryKey: ["identityDashboard"], queryFn: identityApi.dashboard, enabled: status === "signedIn" });
  if (!query.data || query.data.preferences.tutorialComplete) return null;
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <LinearGradient
        colors={theme.gradHero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.banner, shadow.glow(theme.glow, 0.3)]}
      >
        {/* Soft light circles for depth; purely decorative. */}
        <View pointerEvents="none" style={[styles.circle, { width: 140, height: 140, top: -44, right: -34, opacity: 0.15 }]} />
        <View pointerEvents="none" style={[styles.circle, { width: 110, height: 110, bottom: -56, right: 60, opacity: 0.1 }]} />
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={styles.mark}>
            <KaminoMark size={28} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt style={{ fontFamily: font.heavy, fontSize: 16.5, lineHeight: 21, color: "#fff" }}>Make yourself at home</Txt>
            <Txt style={{ fontFamily: font.regular, fontSize: 13.5, lineHeight: 19, color: "rgba(255,255,255,0.88)" }}>
              Four quick steps to find your people, share something and choose your privacy.
            </Txt>
            <PressableScale
              onPress={() => router.push("/tutorial" as never)}
              accessibilityRole="button"
              accessibilityLabel="Take the welcome tour"
              scaleTo={0.95}
              style={styles.button}
            >
              <Txt style={{ fontFamily: font.heavy, fontSize: 13.5, lineHeight: 18, color: "#5B21B6" }}>Take the welcome tour</Txt>
              <Ionicons name="arrow-forward" size={16} color="#5B21B6" />
            </PressableScale>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { overflow: "hidden", borderRadius: radius.card, padding: 16 },
  circle: { position: "absolute", borderRadius: 999, backgroundColor: "#fff" },
  mark: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center" },
  button: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, height: 36, marginTop: 8, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: "#fff" },
});

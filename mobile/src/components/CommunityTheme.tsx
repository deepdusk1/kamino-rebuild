import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useMemo, type ComponentType } from "react";
import { useColorScheme } from "react-native";
import { api } from "@/api/endpoints";
import { communityColors } from "@/lib/communityColors";
import { ThemeOverride, type Theme } from "@/theme";

/**
 * Wraps a community screen so links, tabs, chips and highlights inside it use the colour the community's leaders
 * picked (their "Look" page). The big gradient buttons (Join, Follow) keep Kamino's own violet → blue gradient, like
 * the mockups, so the main actions look the same in every community.
 * It reads the same cached community page the screen itself uses, so it costs no extra request.
 */
export function withCommunityTheme<P extends object>(Screen: ComponentType<P>): ComponentType<P> {
  function Themed(props: P) {
    const { slug } = useLocalSearchParams<{ slug: string }>();
    const dark = useColorScheme() === "dark";
    const page = useQuery({ queryKey: ["community", slug], queryFn: () => api.community(slug!), enabled: !!slug });
    const community = page.data?.community;
    const override = useMemo<Partial<Theme> | null>(() => {
      if (!community) return null;
      const c = communityColors(community.hue, community.themeStyle, dark);
      return { accent: c.accent, accentFg: c.accentFg, tint: c.soft, glow: c.accent };
    }, [community, dark]);
    return (
      <ThemeOverride value={override}>
        <Screen {...props} />
      </ThemeOverride>
    );
  }
  Themed.displayName = `withCommunityTheme(${Screen.displayName ?? Screen.name ?? "Screen"})`;
  return Themed;
}

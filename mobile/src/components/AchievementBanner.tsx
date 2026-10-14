import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import type { Achievement } from "@/api/types";
import { BadgeHex, ShowcaseBanner } from "@/components/k";
import { TIER_LOOK, achievementMedal, progressShare } from "@/lib/achievements";
import { font, radius, shadow, useTheme } from "@/theme";
import { PressableScale, Txt } from "./ui";

/**
 * A showcase banner: the colourful strip for an achievement someone chose to show off. It uses the profile's
 * "Top Creator" banner look (violet gradient, white text, trophy).
 */
export function AchievementBanner({ achievement, onPress }: { achievement: Achievement; onPress?: () => void }) {
  return (
    <ShowcaseBanner
      variant="creator"
      title={achievement.name}
      text={achievement.desc || `${TIER_LOOK[achievement.tier].label} achievement`}
      emoji={achievement.tier === "gold" || achievement.tier === "legend" ? "🏆" : "🏅"}
      onPress={onPress}
    />
  );
}

/**
 * One achievement in the full list: a hexagon medal, the name and what it takes, and either the tier (unlocked)
 * or a progress bar (locked). On your own profile a star picks it for your showcase.
 */
export function AchievementTile({ achievement, showcased, onToggleShowcase }: { achievement: Achievement; showcased?: boolean; onToggleShowcase?: () => void }) {
  const theme = useTheme();
  const look = TIER_LOOK[achievement.tier];
  const medal = achievementMedal(achievement.icon);
  const share = progressShare(achievement);
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.surface, borderRadius: radius.tile, padding: 10, borderWidth: 1, borderColor: showcased ? theme.violet : theme.border },
        shadow.card,
      ]}
    >
      <View style={{ width: 52, alignItems: "center" }}>
        <BadgeHex icon={medal.icon} tone={medal.tone} size={44} locked={!achievement.unlocked} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 14, lineHeight: 18, color: theme.ink }}>{achievement.name}</Txt>
        {achievement.desc ? <Txt numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>{achievement.desc}</Txt> : null}
        {achievement.unlocked ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: look.colors[0] }} />
            <Txt style={{ fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: theme.toneText[look.tone] }}>{look.label}</Txt>
          </View>
        ) : (
          <View style={{ gap: 3, marginTop: 3 }} accessible accessibilityLabel={`${achievement.progress} of ${achievement.target}`}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.surfaceAlt, overflow: "hidden" }}>
              <LinearGradient colors={[theme.gradPrimary[0], theme.gradPrimary[1]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ width: `${Math.round(share * 100)}%`, height: 6 }} />
            </View>
            <Txt style={{ fontFamily: font.semibold, fontSize: 11, lineHeight: 14, color: theme.subtle }}>
              {achievement.progress.toLocaleString()} / {achievement.target.toLocaleString()}
            </Txt>
          </View>
        )}
      </View>
      {achievement.unlocked && onToggleShowcase ? (
        <PressableScale
          onPress={onToggleShowcase}
          accessibilityRole="button"
          accessibilityState={{ selected: !!showcased }}
          accessibilityLabel={showcased ? `Stop showing ${achievement.name} on your profile` : `Show ${achievement.name} on your profile`}
          hitSlop={8}
          scaleTo={0.85}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: showcased ? theme.tints.violet : "transparent" }}
        >
          <Ionicons name={showcased ? "star" : "star-outline"} size={20} color={showcased ? theme.violet : theme.subtle} />
        </PressableScale>
      ) : null}
    </View>
  );
}

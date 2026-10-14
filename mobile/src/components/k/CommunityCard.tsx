import { View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { font, radius, shadow, useTheme } from "@/theme";
import { PressableScale, Txt } from "@/components/ui";
import { compactNumber } from "@/lib/format";
import { CountPill } from "./Badges";
import { AvatarStack, JoinButton } from "./Buttons";
import { useColumnWidth } from "./layout";
import { Picture } from "./Picture";
import type { Person, Src } from "./types";

export type CommunityCardProps = {
  /**
   * - `vertical` (default): picture, title, 2-line description, 4 faces, full-width Join (Home "Recommended").
   * - `compact`: shorter picture, title + one line, no faces or button (Home "Trending").
   * - `grid`: small card for 4-column grids, faces and a small Join side by side (Explore "Recommended").
   * - `mini`: a small horizontal tile, square picture + name + members + Join (Profile "Communities").
   */
  variant?: "vertical" | "compact" | "grid" | "mini";
  name: string;
  description?: string;
  /** Cover picture (server path, web address or bundled image). Without one, a gradient from `hue` is shown. */
  image?: Src;
  hue?: number;
  members: number;
  /** Up to 4 member faces. */
  faces?: Person[];
  joined?: boolean;
  /** Position in the row; picks the Join colour from the cycle (violet, blue, pink, green, orange). */
  index?: number;
  /** A fixed Join colour instead. */
  color?: string;
  onPress: () => void;
  /** Without it the Join button is hidden. */
  onJoin?: () => void;
  joining?: boolean;
  /** Card width (default: four across the screen for vertical / compact / mini; grid fills its parent). */
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
};

/** Community card in four variants (see `variant`). Plain props: map your API data in the screen. */
export function CommunityCard(props: CommunityCardProps) {
  const { variant = "vertical" } = props;
  if (variant === "mini") return <MiniCommunityCard {...props} />;
  return <TallCommunityCard {...props} variant={variant} />;
}

function TallCommunityCard({ variant = "vertical", name, description, image, hue, members, faces = [], joined, index = 0, color, onPress, onJoin, joining, width, style }: CommunityCardProps) {
  const theme = useTheme();
  const fourUp = useColumnWidth(4);
  const compact = variant === "compact";
  const grid = variant === "grid";
  const aspect = compact ? 1.78 : grid ? 1.47 : 1.33;
  const titleSize = compact || grid ? 11 : 11.5;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${name}, ${compactNumber(members)} members${joined ? ", joined" : ""}`}
      scaleTo={0.97}
      style={[
        { width: width ?? (grid ? "100%" : fourUp), backgroundColor: theme.surface, borderRadius: radius.tile, borderWidth: 1, borderColor: theme.border, overflow: "hidden" },
        shadow.card,
        style,
      ]}
    >
      <Picture source={image} hue={hue} style={{ width: "100%", aspectRatio: aspect }}>
        <CountPill value={members} style={{ position: "absolute", left: 5, top: 5 }} />
      </Picture>
      <View style={{ paddingHorizontal: 6, paddingTop: 5, paddingBottom: compact ? 7 : 8, gap: 1 }}>
        <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: titleSize, lineHeight: titleSize + 4, color: theme.ink }}>{name}</Txt>
        {description ? (
          <Txt numberOfLines={compact ? 1 : 2} style={{ fontFamily: font.regular, fontSize: 10, lineHeight: 13, color: theme.muted, minHeight: compact ? undefined : 26 }}>
            {description}
          </Txt>
        ) : null}
        {compact ? null : grid ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 5, gap: 2 }}>
            <AvatarStack people={faces} size={14} max={4} />
            {onJoin ? <JoinButton joined={joined} onPress={onJoin} index={index} color={color} size="xs" busy={joining} joinedLabel="Joined" style={{ paddingHorizontal: 8 }} accessibilityLabel={joined ? `Leave ${name}` : `Join ${name}`} /> : null}
          </View>
        ) : (
          <>
            <AvatarStack people={faces} size={15} max={4} style={{ marginTop: 4 }} />
            {onJoin ? (
              <JoinButton joined={joined} onPress={onJoin} index={index} color={color} size="sm" full busy={joining} accessibilityLabel={joined ? `Leave ${name}` : `Join ${name}`} style={{ marginTop: 7 }} />
            ) : null}
          </>
        )}
      </View>
    </PressableScale>
  );
}

function MiniCommunityCard({ name, image, hue, members, joined, index = 0, color, onPress, onJoin, joining, width, style }: CommunityCardProps) {
  const theme = useTheme();
  const fourUp = useColumnWidth(4);
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${name}, ${compactNumber(members)} members${joined ? ", joined" : ""}`}
      scaleTo={0.97}
      style={[
        { width: width ?? fourUp, padding: 5, gap: 4, backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
        shadow.card,
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <Picture source={image} hue={hue} label={name} radius={7} style={{ width: 28, height: 28 }} />
      <View style={{ flex: 1 }}>
        <Txt numberOfLines={1} style={{ fontFamily: font.heavy, fontSize: 10.5, lineHeight: 13, color: theme.ink }}>{name}</Txt>
        <Txt numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 9.5, lineHeight: 12, color: theme.muted }}>{compactNumber(members)} members</Txt>
        </View>
      </View>
      {onJoin ? <JoinButton joined={joined} onPress={onJoin} index={index} color={color} size="xs" check={false} busy={joining} full accessibilityLabel={joined ? `Leave ${name}` : `Join ${name}`} style={{ height: 18 }} /> : null}
    </PressableScale>
  );
}

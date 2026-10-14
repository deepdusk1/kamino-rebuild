import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { font, radius } from "@/theme";
import { Txt } from "./ui";

type Source = { uri: string; headers?: Record<string, string> };

/**
 * A story with several scenes: one picture at a time, progress bars on top, tap the right side for the next scene and
 * the left side to go back. Nothing advances on its own, so people read at their own pace.
 */
export function StoryViewer({ scenes, captions = [] }: { scenes: Source[]; captions?: string[] }) {
  const [index, setIndex] = useState(0);
  const last = scenes.length - 1;
  const go = (delta: number) => setIndex((i) => Math.min(last, Math.max(0, i + delta)));
  const caption = captions[index]?.trim();

  return (
    <View
      style={{ height: 420, borderRadius: radius.image, overflow: "hidden", backgroundColor: "#0F0B2A" }}
      accessibilityLabel={`Story, scene ${index + 1} of ${scenes.length}`}
    >
      <Image key={index} source={scenes[index]} style={{ flex: 1 }} contentFit="contain" cachePolicy="disk" accessibilityLabel={caption || `Scene ${index + 1}`} />
      {scenes.length > 1 ? (
        <>
          <View pointerEvents="none" style={{ position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", gap: 4 }}>
            {scenes.map((_, i) => (
              <View key={i} style={{ flex: 1, height: 3.5, borderRadius: 2, backgroundColor: i <= index ? "#ffffff" : "rgba(255,255,255,0.38)" }} />
            ))}
          </View>
          <View pointerEvents="none" style={{ position: "absolute", top: 20, right: 12, backgroundColor: "rgba(15,11,42,0.62)", borderRadius: 999, paddingHorizontal: 8, height: 21, justifyContent: "center" }}>
            <Txt style={{ color: "#fff", fontFamily: font.bold, fontSize: 11, lineHeight: 14 }}>{`${index + 1}/${scenes.length}`}</Txt>
          </View>
          <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, flexDirection: "row" }}>
            <Pressable style={{ flex: 1 }} onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel="Previous scene" disabled={index === 0} />
            <Pressable style={{ flex: 1 }} onPress={() => go(1)} accessibilityRole="button" accessibilityLabel="Next scene" disabled={index === last} />
          </View>
        </>
      ) : null}
      {caption ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 10, right: 10, bottom: 10, backgroundColor: "rgba(15,11,42,0.66)", borderRadius: radius.tile, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Txt style={{ color: "#fff", fontFamily: font.semibold, fontSize: 14, lineHeight: 20 }}>{caption}</Txt>
        </View>
      ) : null}
    </View>
  );
}

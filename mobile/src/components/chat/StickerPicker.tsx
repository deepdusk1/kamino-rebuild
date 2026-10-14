import { useState } from "react";
import { View } from "react-native";
import { PressableScale, Segmented, Sheet, Txt } from "@/components/ui";
import { STICKER_PACKS } from "@/lib/stickers";
import { radius, space, useTheme } from "@/theme";

/** A sheet of free sticker packs. Tapping a sticker sends it straight away. */
export function StickerPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const theme = useTheme();
  const [packId, setPackId] = useState(STICKER_PACKS[0]!.id);
  const pack = STICKER_PACKS.find((p) => p.id === packId) ?? STICKER_PACKS[0]!;

  return (
    <Sheet visible={visible} title="Stickers" onClose={onClose}>
      <Segmented options={STICKER_PACKS.map((p) => ({ key: p.id, label: p.label }))} value={packId} onChange={setPackId} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "center" }}>
        {pack.stickers.map((sticker) => (
          <PressableScale
            key={sticker.id}
            onPress={() => onPick(sticker.id)}
            accessibilityLabel={`Send ${sticker.label} sticker`}
            scaleTo={0.85}
            style={{ width: 72, height: 72, borderRadius: radius.tile, alignItems: "center", justifyContent: "center", backgroundColor: theme.surfaceAlt, borderWidth: 1, borderColor: theme.border }}
          >
            <Txt style={{ fontSize: 38, lineHeight: 46 }}>{sticker.emoji}</Txt>
          </PressableScale>
        ))}
      </View>
    </Sheet>
  );
}

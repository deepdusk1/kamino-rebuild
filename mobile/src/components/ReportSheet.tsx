import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { api } from "@/api/endpoints";
import { REPORT_REASONS } from "@/api/types";
import { useAction } from "@/lib/errors";
import { GradientButton } from "@/components/k";
import { font, radius, space, useTheme } from "@/theme";
import { Field, PressableScale, Sheet, Txt } from "./ui";

export type ReportTarget = { targetType: "post" | "comment" | "message" | "user"; targetId: string; communityId?: string; label: string };

/** Report content or a person. Required by the app stores for anything users can post. */
export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const theme = useTheme();
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");

  const [send, busy] = useAction(async () => {
    if (!target) return;
    await api.report({ communityId: target.communityId, targetType: target.targetType, targetId: target.targetId, reason, details: details.trim() || undefined });
    setDetails("");
    onClose();
    Alert.alert("Report sent", "Thank you. A community leader will review it.");
  });

  return (
    <Sheet visible={!!target} title={`Report ${target?.label ?? ""}`} onClose={onClose}>
      <Txt style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: theme.muted }}>Why are you reporting this? Reports go to the community’s leaders, not to the person.</Txt>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {REPORT_REASONS.map((r) => {
          const on = reason === r;
          return (
            <PressableScale
              key={r}
              onPress={() => setReason(r)}
              accessibilityRole="radio"
              accessibilityLabel={r}
              accessibilityState={{ selected: on }}
              hitSlop={4}
              scaleTo={0.95}
              style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: "center", borderWidth: 1.5, borderColor: on ? theme.accent : theme.border, backgroundColor: on ? theme.tint : theme.surface }}
            >
              <Txt style={{ fontFamily: on ? font.bold : font.semibold, fontSize: 13, color: on ? theme.accent : theme.ink }}>{r}</Txt>
            </PressableScale>
          );
        })}
      </View>
      <Field label="Anything else we should know? (optional)" value={details} onChangeText={setDetails} multiline maxLength={500} />
      <GradientButton label="Send report" icon="flag" onPress={() => void send()} busy={busy} size="lg" full />
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel" style={{ alignItems: "center", justifyContent: "center", minHeight: 44, padding: space.sm }}>
        <Txt style={{ fontFamily: font.bold, color: theme.muted }}>Cancel</Txt>
      </Pressable>
    </Sheet>
  );
}

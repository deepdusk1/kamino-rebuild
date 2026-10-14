import { View } from "react-native";
import { api } from "@/api/endpoints";
import type { Membership } from "@/api/types";
import { Avatar, Button, Card, EmptyState, Txt } from "@/components/ui";
import { showError } from "@/lib/errors";
import { space } from "@/theme";

type Props = { slug: string; pending: Membership[]; answers: { userId: string; answers: string[] }[]; questions: string[]; onChanged: () => void };

/** People asking to join a private community, with their answers to the join questions. */
export function RequestsTab({ slug, pending, answers, questions, onChanged }: Props) {
  const decide = async (userId: string, allow: boolean) => {
    try {
      await api.reviewJoin(slug, userId, allow);
      onChanged();
    } catch (error) {
      showError(error);
    }
  };

  if (!pending.length) return <EmptyState icon="person-add-outline" title="No requests" body="New join requests will appear here." />;
  return (
    <View style={{ gap: space.md }}>
      {pending.map((m) => {
        const given = answers.find((a) => a.userId === m.userId)?.answers ?? [];
        return (
          <Card key={m.userId}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Avatar name={m.nickname} hue={m.personaHue} size={40} userId={m.userId} version={m.avatarV} />
              <Txt variant="heading" style={{ flex: 1 }}>{m.nickname}</Txt>
            </View>
            {questions.map((q, i) => (
              <View key={q}>
                <Txt variant="caption" tone="subtle">{q}</Txt>
                <Txt>{given[i] || "—"}</Txt>
              </View>
            ))}
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button label="Approve" small onPress={() => void decide(m.userId, true)} />
              <Button label="Decline" small variant="secondary" onPress={() => void decide(m.userId, false)} />
            </View>
          </Card>
        );
      })}
    </View>
  );
}

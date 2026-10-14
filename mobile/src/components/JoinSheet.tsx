import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, View } from "react-native";
import { api } from "@/api/endpoints";
import type { Community, JoinQuestion } from "@/api/types";
import { useAction } from "@/lib/errors";
import { GradientButton, Pill } from "@/components/k";
import { font, useTheme } from "@/theme";
import { Field, Sheet, Txt } from "./ui";

type Props = {
  community: Community;
  questions: JoinQuestion[];
  visible: boolean;
  onClose: () => void;
  onJoined: () => void;
};

/** Joining: pick a nickname, answer the leaders' questions (private communities) or use an invite code. */
export function JoinSheet({ community, questions, visible, onClose, onJoined }: Props) {
  const queryClient = useQueryClient();
  const [nickname, setNickname] = useState("");
  const [invite, setInvite] = useState("");
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));

  const [join, busy] = useAction(async () => {
    const result = await api.join({
      slug: community.id,
      nickname: nickname.trim() || undefined,
      invite: invite.trim() || undefined,
      answers: invite.trim() ? undefined : answers,
    });
    await queryClient.invalidateQueries();
    onClose();
    if (result.pending) Alert.alert("Request sent", "The leaders will review your request. You'll get a notification when you're in.");
    else onJoined();
  });

  const theme = useTheme();
  const isPrivate = community.visibility === "private";
  return (
    <Sheet visible={visible} title={`Join ${community.name}`} onClose={onClose}>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <Pill label={isPrivate ? "Private" : "Public"} icon={isPrivate ? "lock-closed" : "globe-outline"} tone={isPrivate ? "orange" : "green"} />
        {community.ageGate > 13 ? <Pill label={`${community.ageGate}+`} tone="pink" /> : null}
      </View>
      <Txt style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: theme.muted }}>
        {isPrivate ? "This is a private community. Leaders approve new members." : community.ageGate > 13 ? `This community is for ages ${community.ageGate} and over.` : "You'll get your own nickname here, separate from your other communities."}
      </Txt>
      <Field label="Nickname in this community" value={nickname} onChangeText={setNickname} maxLength={24} placeholder="Optional" />
      {isPrivate && questions.length ? (
        <>
          <Txt style={{ fontFamily: font.heavy, fontSize: 15, color: theme.ink }}>Questions from the leaders</Txt>
          {questions.map((q, i) => (
            <Field key={q.id} label={q.prompt} value={answers[i] ?? ""} onChangeText={(t) => setAnswers((a) => a.map((x, j) => (j === i ? t : x)))} multiline />
          ))}
        </>
      ) : null}
      {isPrivate ? <Field label="Have an invite code?" value={invite} onChangeText={setInvite} autoCapitalize="none" placeholder="Paste it here to skip the review" /> : null}
      <GradientButton label={isPrivate ? "Ask to join" : "Join"} icon={isPrivate ? "paper-plane" : "people"} onPress={() => void join()} busy={busy} size="lg" full />
    </Sheet>
  );
}

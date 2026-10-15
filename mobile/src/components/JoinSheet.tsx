import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, View } from "react-native";
import { api } from "@/api/endpoints";
import type { Community, JoinQuestion } from "@/api/types";
import { useAction } from "@/lib/errors";
import { joinNeedsApproval, refreshCommunityLists } from "@/lib/community-join";
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

/**
 * Joining: pick a nickname, answer the leaders' questions (private and leader-approval communities) or use an invite
 * code (private and invite-only communities).
 */
export function JoinSheet({ community, questions, visible, onClose, onJoined }: Props) {
  const queryClient = useQueryClient();
  const [nickname, setNickname] = useState("");
  const [invite, setInvite] = useState("");
  // Answers by question id, so they stay with the right question even if the list changes while the sheet is open.
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const needsApproval = joinNeedsApproval(community);
  const inviteOnly = community.joinPolicy === "invite";
  const askQuestions = needsApproval && questions.length > 0;

  const [join, busy] = useAction(async () => {
    const code = invite.trim();
    if (inviteOnly && !code) throw new Error("This community is invite only. Paste the invite code a member gave you.");
    const given = questions.map((q) => (answers[q.id] ?? "").trim());
    if (!code && askQuestions && given.some((a) => !a)) throw new Error("Please answer every question from the leaders.");
    const result = await api.join({
      slug: community.id,
      nickname: nickname.trim() || undefined,
      invite: code || undefined,
      answers: code || !askQuestions ? undefined : given,
    });
    refreshCommunityLists(queryClient, community.id);
    onClose();
    if (result.pending) Alert.alert("Request sent", "The leaders will review your request. You'll get a notification when you're in.");
    else onJoined();
  });

  const theme = useTheme();
  const isPrivate = community.visibility === "private";
  const intro = inviteOnly
    ? "This community is invite only. Paste the invite code a member gave you."
    : isPrivate
      ? "This is a private community. Leaders approve new members."
      : needsApproval
        ? "Leaders approve new members here. You'll get a notification when you're in."
        : "You'll get your own nickname here, separate from your other communities.";
  return (
    <Sheet visible={visible} title={`Join ${community.name}`} onClose={onClose}>
      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        <Pill label={isPrivate ? "Private" : "Public"} icon={isPrivate ? "lock-closed" : "globe-outline"} tone={isPrivate ? "orange" : "green"} />
        <Pill label="18+" tone="pink" />
        {inviteOnly ? <Pill label="Invite only" icon="mail-outline" tone="violet" /> : needsApproval && !isPrivate ? <Pill label="Leader approval" tone="violet" /> : null}
      </View>
      <Txt style={{ fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: theme.muted }}>{intro}</Txt>
      <Field label="Nickname in this community" value={nickname} onChangeText={setNickname} maxLength={24} placeholder="Optional" />
      {askQuestions && !inviteOnly ? (
        <>
          <Txt style={{ fontFamily: font.heavy, fontSize: 15, color: theme.ink }}>Questions from the leaders</Txt>
          {questions.map((q) => (
            <Field key={q.id} label={q.prompt} value={answers[q.id] ?? ""} onChangeText={(t) => setAnswers((a) => ({ ...a, [q.id]: t }))} multiline maxLength={500} />
          ))}
        </>
      ) : null}
      {isPrivate || inviteOnly ? (
        <Field
          label={inviteOnly ? "Invite code" : "Have an invite code?"}
          value={invite}
          onChangeText={setInvite}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={inviteOnly ? "Paste it here" : "Paste it here to skip the review"}
        />
      ) : null}
      <GradientButton
        label={inviteOnly ? "Join with invite" : needsApproval ? "Ask to join" : "Join"}
        icon={needsApproval && !inviteOnly ? "paper-plane" : "people"}
        onPress={() => void join()}
        busy={busy}
        size="lg"
        full
      />
    </Sheet>
  );
}

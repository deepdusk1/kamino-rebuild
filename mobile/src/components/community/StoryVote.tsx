import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, View } from "react-native";
import { api } from "@/api/endpoints";
import type { StoryBranches } from "@/api/types";
import { Button, PressableScale, Txt } from "@/components/ui";
import { useAction } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { font, radius, shadow, useTheme } from "@/theme";

/**
 * "What happens next?" for a role-play story: the AI storyteller offers a few directions, members vote, and a player
 * continues the story with the winner. Everything comes from the server (getAiStoryBranches and friends); there is no
 * sample content. Hidden when the viewer can't vote and nothing has been offered yet.
 */
export function StoryVote({ sceneId, onStoryChanged }: { sceneId: number; onStoryChanged: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const key = ["storyBranches", sceneId];
  const q = useQuery({ queryKey: key, queryFn: () => api.storyBranches(sceneId), refetchInterval: 5000 });
  const put = (next: StoryBranches) => queryClient.setQueryData(key, next);

  const [propose, proposing] = useAction(async () => put(await api.proposeStoryBranches(sceneId)), {
    errorTitle: "Couldn't get options",
  });
  const [vote, voting] = useAction(
    async (optionId: number) => {
      haptic.tap();
      put(await api.voteStoryBranch(sceneId, optionId));
    },
    { errorTitle: "Couldn't vote" },
  );
  const [apply, applying] = useAction(
    async () => {
      await api.applyStoryBranch(sceneId);
      haptic.success();
      onStoryChanged();
      await q.refetch();
    },
    { errorTitle: "Couldn't continue the story" },
  );

  const b = q.data;
  if (!b || (!b.canVote && b.options.length === 0)) return null;
  const total = b.options.reduce((sum, o) => sum + o.votes, 0);
  const busy = proposing || voting || applying;

  return (
    <View style={[{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: radius.card, padding: 14, gap: 12 }, shadow.card]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.tints.violet, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="git-branch-outline" size={16} color={theme.toneText.violet} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 15.5, lineHeight: 20, color: theme.ink }}>
            What happens next?
          </Txt>
          <Txt style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>
            {b.options.length
              ? total
                ? `${total} vote${total === 1 ? "" : "s"} so far. Tap to vote, tap again to take it back.`
                : "Vote for the direction you want. One vote each."
              : "Ask the storyteller for a few directions, then everyone votes."}
          </Txt>
        </View>
      </View>

      {b.options.map((o) => {
        const share = total ? o.votes / total : 0;
        const mine = o.votedByMe;
        return (
          <PressableScale
            key={o.id}
            onPress={() => void vote(o.id)}
            disabled={!b.canVote || busy}
            accessibilityRole="button"
            accessibilityState={{ selected: mine }}
            accessibilityLabel={`${o.label}. ${o.votes} vote${o.votes === 1 ? "" : "s"}${mine ? ", your vote" : ""}`}
            scaleTo={0.98}
            style={{ borderRadius: radius.tile, borderWidth: 1.5, borderColor: mine ? theme.violet : theme.border, backgroundColor: theme.surfaceAlt, overflow: "hidden" }}
          >
            {/* Share of the votes, drawn as a soft fill behind the text */}
            <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.round(share * 100)}%`, backgroundColor: theme.tints.violet }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12 }}>
              <Ionicons name={mine ? "checkmark-circle" : "ellipse-outline"} size={20} color={mine ? theme.violet : theme.subtle} />
              <Txt style={{ flex: 1, fontFamily: mine ? font.bold : font.semibold, fontSize: 14, lineHeight: 19, color: theme.ink }}>{o.label}</Txt>
              <Txt style={{ fontFamily: font.bold, fontSize: 13, color: mine ? theme.toneText.violet : theme.muted }}>{o.votes}</Txt>
            </View>
          </PressableScale>
        );
      })}

      {voting ? <ActivityIndicator color={theme.violet} /> : null}

      {b.canSteer && b.options.length === 0 ? (
        <Button label={proposing ? "The storyteller is thinking…" : "Suggest directions"} busy={proposing} disabled={busy} onPress={() => void propose()} />
      ) : null}
      {b.canSteer && total > 0 ? (
        <Button
          label={applying ? "The storyteller is writing…" : "Continue with the top choice"}
          variant="secondary"
          busy={applying}
          disabled={busy}
          onPress={() => void apply()}
        />
      ) : null}
    </View>
  );
}

import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, View } from "react-native";
import { api } from "@/api/endpoints";
import { communityV9 } from "@/api/community-v9";
import type { Membership } from "@/api/types";
import { Avatar, Button, Card, Chip, ErrorState, Field, Loading, Sheet, Txt } from "@/components/ui";
import { showError, useAction } from "@/lib/errors";
import { moderationPowers } from "@/lib/mod-powers";
import { useDebounced } from "@/lib/useDebounced";
import { space } from "@/theme";

type Props = { slug: string; strikeCounts: Map<string, number>; myRole: string; myId?: string; onChanged: () => void };

const MUTE_HOURS = [
  { label: "1 hour", hours: 1 },
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
];

const ROLE_NAME: Record<string, string> = { agent: "Owner", leader: "Co-leader", curator: "Curator", member: "Member" };

/**
 * Roles, strikes, timed mutes and removals for every member (searched on the server, 50 at a time). Only the
 * buttons your role can use are shown; the server still checks every action.
 */
export function PeopleTab({ slug, strikeCounts, myRole, myId, onChanged }: Props) {
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim(), 300);
  const [target, setTarget] = useState<Membership | null>(null);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);

  const list = useInfiniteQuery({
    queryKey: ["communityMembers", slug, term],
    queryFn: ({ pageParam }) => communityV9.members(slug, term, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next ?? undefined,
  });

  const done = () => {
    setTarget(null);
    setReason("");
    void list.refetch();
    onChanged();
  };

  const [strike, striking] = useAction(async () => {
    if (!target) return;
    if (reason.trim().length < 3) throw new Error("Add a short reason so the member knows what happened.");
    const result = await api.strike(slug, target.userId, reason.trim());
    done();
    Alert.alert("Strike issued", result.banned ? "That was their third strike, so they were removed." : `They now have ${result.count} strike${result.count === 1 ? "" : "s"}.`);
  });

  const [mute, muting] = useAction(async () => {
    if (!target) return;
    if (reason.trim().length < 3) throw new Error("Add a short reason so the member knows what happened.");
    await api.mute(slug, target.userId, hours, reason.trim());
    done();
    Alert.alert("Member muted", "They can read but not post or chat until the timer ends.");
  });

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      done();
    } catch (error) {
      showError(error);
    }
  };

  const confirm = (title: string, message: string, label: string, fn: () => Promise<unknown>) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: label, style: "destructive", onPress: () => void act(fn) },
    ]);

  if (list.isPending) return <Loading />;
  if (list.isError || !list.data) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  const shown = list.data.pages.flatMap((p) => p.members).filter((m) => m.userId !== myId);
  const powers = target ? moderationPowers(myRole, target.role) : null;

  return (
    <View style={{ gap: space.md }}>
      <Field value={search} onChangeText={setSearch} placeholder="Find a member by name or @username" autoCapitalize="none" autoCorrect={false} />
      {shown.length ? null : <Txt tone="muted">{term ? `No members match “${term}”.` : "No other members yet."}</Txt>}
      {shown.map((m) => (
        <Card key={m.userId} onPress={() => setTarget(m)} accessibilityLabel={`Manage ${m.nickname}`}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Avatar name={m.nickname} hue={m.personaHue} size={38} userId={m.userId} version={m.avatarV} />
            <View style={{ flex: 1 }}>
              <Txt numberOfLines={1}>{m.nickname}</Txt>
              <Txt variant="caption" tone="subtle">
                {ROLE_NAME[m.role] ?? m.role}
                {m.handle ? ` · @${m.handle}` : ""}
                {strikeCounts.get(m.userId) ? ` · ${strikeCounts.get(m.userId)} strike(s)` : ""}
              </Txt>
            </View>
          </View>
        </Card>
      ))}
      {list.hasNextPage ? <Button label="Show more members" variant="secondary" small busy={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} /> : null}

      <Sheet visible={!!target} title={target?.nickname ?? ""} onClose={() => setTarget(null)}>
        {target && powers ? (
          <>
            <Txt tone="muted">{ROLE_NAME[target.role] ?? target.role}</Txt>
            {powers.mute || powers.strike ? <Field label="Reason (shown to the member)" value={reason} onChangeText={setReason} multiline maxLength={200} /> : null}
            {powers.mute ? (
              <>
                <Txt variant="label" tone="subtle">Mute for</Txt>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  {MUTE_HOURS.map((h) => <Chip key={h.hours} label={h.label} selected={hours === h.hours} onPress={() => setHours(h.hours)} />)}
                </View>
                <Button label="Mute" variant="secondary" onPress={() => void mute()} busy={muting} />
                <Button label="Clear mute" variant="ghost" onPress={() => void act(() => api.clearMute(slug, target.userId))} />
              </>
            ) : null}
            {powers.strike ? <Button label="Give a strike" variant="secondary" onPress={() => void strike()} busy={striking} /> : null}
            {powers.curator ? (
              target.role === "curator" ? (
                <Button label="Make a regular member" variant="secondary" onPress={() => void act(() => api.setMemberRole(slug, target.userId, "member"))} />
              ) : (
                <Button label="Make a curator" variant="secondary" onPress={() => void act(() => api.setMemberRole(slug, target.userId, "curator"))} />
              )
            ) : null}
            {powers.coLeader ? (
              <Button
                label={target.role === "leader" ? "Remove co-leader role" : "Appoint co-leader"}
                variant="secondary"
                onPress={() => void act(() => communityV9.appoint(slug, target.userId, target.role === "leader" ? "member" : "leader"))}
              />
            ) : null}
            {powers.transfer ? (
              <Button
                label="Make them the owner"
                variant="secondary"
                onPress={() =>
                  confirm(
                    `Make ${target.nickname} the owner?`,
                    "They get full control of the community. You stay on as a co-leader and can leave afterwards.",
                    "Make owner",
                    () => communityV9.transferOwnership(slug, target.userId),
                  )
                }
              />
            ) : null}
            {powers.remove ? (
              <Button
                label="Remove from community"
                variant="danger"
                onPress={() =>
                  confirm(`Remove ${target.nickname}?`, "They will be removed from the community and its rooms, and can appeal.", "Remove", () =>
                    api.setMemberRole(slug, target.userId, "ban"),
                  )
                }
              />
            ) : null}
            {!powers.mute && !powers.coLeader && !powers.transfer ? <Txt tone="muted">{"Your role can't change this person's membership."}</Txt> : null}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

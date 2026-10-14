import { useState } from "react";
import { Alert, View } from "react-native";
import { api } from "@/api/endpoints";
import { communityV9 } from '@/api/community-v9';
import type { Membership } from "@/api/types";
import { Avatar, Button, Card, Chip, Field, Sheet, Txt } from "@/components/ui";
import { showError, useAction } from "@/lib/errors";
import { space } from "@/theme";

type Props = { slug: string; members: Membership[]; strikeCounts: Map<string, number>; myRole: string; myId?: string; onChanged: () => void };

const MUTE_HOURS = [
  { label: "1 hour", hours: 1 },
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
];

/** Roles, strikes, timed mutes and removals. The server decides who is allowed to do what. */
export function PeopleTab({ slug, members, strikeCounts, myRole, myId, onChanged }: Props) {
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<Membership | null>(null);
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState(24);

  const term = search.trim().toLowerCase();
  const shown = members.filter((m) => m.userId !== myId && m.status !== "pending" && (!term || m.nickname.toLowerCase().includes(term))).slice(0, 60);
  const isLeader = myRole === "leader" || myRole === "agent";

  const done = () => {
    setTarget(null);
    setReason("");
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

  const confirmBan = () =>
    target &&
    Alert.alert(`Remove ${target.nickname}?`, "They will be removed from the community and can appeal.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void act(() => api.setMemberRole(slug, target.userId, "ban")) },
    ]);

  return (
    <View style={{ gap: space.md }}>
      <Field value={search} onChangeText={setSearch} placeholder="Find a member" autoCapitalize="none" autoCorrect={false} />
      {shown.map((m) => (
        <Card key={m.userId} onPress={() => setTarget(m)} accessibilityLabel={`Manage ${m.nickname}`}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Avatar name={m.nickname} hue={m.personaHue} size={38} userId={m.userId} version={m.avatarV} />
            <View style={{ flex: 1 }}>
              <Txt numberOfLines={1}>{m.nickname}</Txt>
              <Txt variant="caption" tone="subtle">{m.role}{strikeCounts.get(m.userId) ? ` · ${strikeCounts.get(m.userId)} strike(s)` : ""}</Txt>
            </View>
            {m.status === "banned" ? <Chip label="Removed" tone="danger" /> : null}
          </View>
        </Card>
      ))}

      <Sheet visible={!!target} title={target?.nickname ?? ""} onClose={() => setTarget(null)}>
        <Field label="Reason (shown to the member)" value={reason} onChangeText={setReason} multiline maxLength={300} />
        <Txt variant="label" tone="subtle">Mute for</Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {MUTE_HOURS.map((h) => <Chip key={h.hours} label={h.label} selected={hours === h.hours} onPress={() => setHours(h.hours)} />)}
        </View>
        <Button label="Mute" variant="secondary" onPress={() => void mute()} busy={muting} />
        <Button label="Clear mute" variant="ghost" onPress={() => void act(() => api.clearMute(slug, target!.userId))} />
        <Button label="Give a strike" variant="secondary" onPress={() => void strike()} busy={striking} />
        {isLeader && target ? (
          target.role === "curator" ? (
            <Button label="Make a regular member" variant="secondary" onPress={() => void act(() => api.setMemberRole(slug, target.userId, "member"))} />
          ) : target.role === "member" ? (
            <Button label="Make a curator" variant="secondary" onPress={() => void act(() => api.setMemberRole(slug, target.userId, "curator"))} />
          ) : null
        ) : null}
        {myRole==='agent'&&target&&target.role!=='agent'?<Button label={target.role==='leader'?'Remove co-leader role':'Appoint co-leader'} variant="secondary" onPress={()=>void act(()=>communityV9.appoint(slug,target.userId,target.role==='leader'?'member':'leader'))}/>:null}
        {target?.status === "banned" ? (
          <Button label="Restore to the community" onPress={() => void act(() => api.setMemberRole(slug, target.userId, "unban"))} />
        ) : (
          <Button label="Remove from community" variant="danger" onPress={confirmBan} />
        )}
      </Sheet>
    </View>
  );
}

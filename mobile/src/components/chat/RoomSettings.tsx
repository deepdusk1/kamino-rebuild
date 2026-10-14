import { useState, type ReactNode } from "react";
import { Alert, View } from "react-native";
import { api } from "@/api/endpoints";
import type { RoomPage } from "@/api/models";
import { GradientButton, PersonAvatar, Pill } from "@/components/k";
import { ToggleRow } from "@/components/create/parts";
import { Field, Sheet, Txt } from "@/components/ui";
import { showError, useAction } from "@/lib/errors";
import { font, radius, useTheme } from "@/theme";
import { hueFromText } from "./rooms";

type Props = { visible: boolean; onClose: () => void; page: RoomPage; myId?: string; onChanged: () => void };

/** Pin / mute, who is in the room, and (for hosts) invites and co-hosts. */
export function RoomSettings({ visible, onClose, page, myId, onChanged }: Props) {
  const { room, participants } = page;
  const [handle, setHandle] = useState("");
  const isHost = participants.some((p) => p.userId === myId && p.isHost);
  const isCohost = participants.some((p) => p.userId === myId && p.isCohost);
  const canInvite = room.kind !== "dm" && (isHost || isCohost || room.inviteRule === "members");

  const setPref = async (prefs: { pinned?: boolean; muted?: boolean }) => {
    try {
      await api.roomPreference(room.id, prefs);
      onChanged();
    } catch (error) {
      showError(error);
    }
  };

  const [invite, inviting] = useAction(async () => {
    const clean = handle.trim().replace(/^@/, "");
    if (!clean) throw new Error("Type the person's @handle.");
    await api.inviteToRoom(room.id, clean);
    setHandle("");
    onChanged();
    Alert.alert("Invited", `@${clean} can now join this room.`);
  });

  const guarded = (action: () => Promise<unknown>) => async () => {
    try {
      await action();
      onChanged();
    } catch (error) {
      showError(error);
    }
  };

  const confirmTransfer = (userId: string, name: string) =>
    Alert.alert(`Make ${name} the host?`, "You will no longer be the host of this room.", [
      { text: "Cancel", style: "cancel" },
      { text: "Transfer", style: "destructive", onPress: () => void guarded(() => api.transferHost(room.id, userId))() },
    ]);

  return (
    <Sheet visible={visible} title={room.kind === "dm" ? "Conversation" : room.name} onClose={onClose}>
      <Group>
        <ToggleRow label="Pin to the top of my chats" value={room.pinned} onChange={(pinned) => void setPref({ pinned })} />
        <ToggleRow label="Mute notifications" value={room.muted} onChange={(muted) => void setPref({ muted })} />
      </Group>

      {canInvite ? (
        <Group title="Invite someone">
          <Field value={handle} onChangeText={setHandle} autoCapitalize="none" autoCorrect={false} placeholder="@handle" />
          <GradientButton label="Send invite" icon="person-add" busy={inviting} onPress={() => void invite()} />
          {isHost && room.kind !== "dm" ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Txt variant="small" tone="muted">Who can invite:</Txt>
              <Pill label="Hosts" size="md" tone={room.inviteRule === "hosts" ? "violet" : "neutral"} variant={room.inviteRule === "hosts" ? "solid" : "tint"} onPress={() => void guarded(() => api.setInviteRule(room.id, "hosts"))()} />
              <Pill label="Everyone" size="md" tone={room.inviteRule === "members" ? "violet" : "neutral"} variant={room.inviteRule === "members" ? "solid" : "tint"} onPress={() => void guarded(() => api.setInviteRule(room.id, "members"))()} />
            </View>
          ) : null}
        </Group>
      ) : null}

      {room.kind !== "dm" && participants.length ? (
        <Group title={`In this room · ${participants.length}`}>
          {participants.map((p) => (
            <View key={p.userId} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 2, flexWrap: "wrap" }}>
              <PersonAvatar person={{ name: p.name, hue: hueFromText(p.name), userId: p.userId }} size={34} />
              <View style={{ flex: 1, minWidth: 120 }}>
                <Txt numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 14, lineHeight: 18 }}>{p.name}</Txt>
                <Txt variant="caption" tone="subtle">@{p.handle}{p.isHost ? " · host" : p.isCohost ? " · co-host" : ""}</Txt>
              </View>
              {isHost && !p.isHost ? (
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Pill label={p.isCohost ? "Remove co-host" : "Co-host"} size="md" tone="violet" onPress={() => void guarded(() => api.toggleCohost(room.id, p.userId))()} />
                  <Pill label="Make host" size="md" tone="pink" onPress={() => confirmTransfer(p.userId, p.name)} />
                </View>
              ) : null}
            </View>
          ))}
        </Group>
      ) : null}
    </Sheet>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: radius.card, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}>
      {title ? <Txt style={{ fontFamily: font.heavy, fontSize: 15, lineHeight: 20, color: theme.ink }}>{title}</Txt> : null}
      {children}
    </View>
  );
}

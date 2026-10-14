import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Field, Sheet, Txt, PressableScale } from "@/components/ui";
import { contentApi } from "@/lib/content-v9";
import { pickContentFile } from "@/lib/content-media";
import { MediaLibraryPicker } from "./MediaLibraryPicker";
import { showError } from "@/lib/errors";
import { confirmAction } from "@/components/community/platform";
import { useTheme } from "@/theme";
import { ContentMedia } from "./ContentMedia";

export function useChatContent(roomId: number) {
  return useQuery({
    queryKey: ["chatContent", roomId],
    queryFn: () => contentApi.chat(roomId),
    refetchInterval: 5000,
  });
}
function openCard(href: string) {
  const post = /^\/c\/([^/]+)\/p\/(\d+)$/.exec(href);
  if (post) return router.push(`/community/${post[1]}/post/${post[2]}`);
  if (href.startsWith("/u/")) return router.push(`/profile/${href.slice(3)}`);
  if (href.startsWith("/c/")) return router.push(`/community/${href.slice(3)}`);
}
export function ChatMessageContent({
  roomId,
  messageId,
}: {
  roomId: number;
  messageId: number;
}) {
  const q = useChatContent(roomId),
    theme = useTheme(),
    media = q.data?.attachments.filter((a) => a.messageId === messageId),
    card = q.data?.cards.find((a) => a.messageId === messageId);
  return (
    <View
      style={{
        paddingHorizontal: 16,
        gap: 8,
        marginBottom: card || media?.length ? 10 : 0,
      }}
    >
      {media?.map((m) => (
        <ContentMedia key={m.id} media={m} />
      ))}
      {card ? (
        <PressableScale
          onPress={() => openCard(card.href)}
          accessibilityLabel={`Open shared ${card.kind}: ${card.title}`}
          style={{
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 16,
            backgroundColor: theme.surface,
            padding: 14,
            gap: 6,
          }}
        >
          <Txt variant="caption" tone="accent">
            Shared {card.kind}
          </Txt>
          <Txt variant="heading">{card.title}</Txt>
          <Txt variant="small" tone="muted">
            {card.subtitle}
          </Txt>
        </PressableScale>
      ) : null}
    </View>
  );
}
export function ChatContentTools({
  roomId,
  myId,
  messages,
}: {
  roomId: number;
  myId: string;
  messages: { id: number; body: string }[];
}) {
  const allowance = useQuery({
    queryKey: ["uploadAllowance"],
    queryFn: contentApi.uploadAllowance,
  });
  const q = useChatContent(roomId),
    client = useQueryClient(),
    theme = useTheme(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [target, setTarget] = useState(""),
    [kind, setKind] = useState<"post" | "profile" | "community">("post"),
    [handle, setHandle] = useState("");
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await Promise.all([
        client.invalidateQueries({ queryKey: ["chatContent", roomId] }),
        client.invalidateQueries({ queryKey: ["room", roomId] }),
      ]);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }
  async function attach(gif = false) {
    try {
      const media = await pickContentFile(
        gif ? "gif" : "file",
        gif
          ? "image/gif"
          : [
              "application/pdf",
              "text/plain",
              "text/csv",
              "application/zip",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ],
        allowance.data?.limits[gif ? "gif" : "file"],
      );
      if (media) await run(() => contentApi.attach(roomId, media));
    } catch (e) {
      showError(e);
    }
  }
  const d = q.data;
  if (!d) return null;
  return (
    <>
      <Button
        variant="ghost"
        small
        label={`📌 Shared files, pins & people${d.pins.length ? ` · ${d.pins.length} pinned` : ""}`}
        onPress={() => setOpen(true)}
      />
      <Sheet
        visible={open}
        title="Conversation tools"
        onClose={() => setOpen(false)}
      >
        <View style={{ gap: 14 }}>
          {d.pins.map((p) => (
            <View
              key={p.id}
              style={{
                padding: 12,
                gap: 6,
                backgroundColor: theme.surfaceAlt,
                borderRadius: 14,
              }}
            >
              <Txt>📌 {p.body}</Txt>
              {d.canPin ? (
                <Button
                  small
                  variant="ghost"
                  label="Unpin"
                  onPress={() =>
                    void run(() => contentApi.pin(roomId, p.id, false))
                  }
                />
              ) : null}
            </View>
          ))}
          <Button
            variant="secondary"
            label="Attach a file"
            disabled={busy}
            onPress={() => void attach()}
          />
          <Button
            variant="secondary"
            label="Send animated GIF"
            disabled={busy}
            onPress={() => void attach(true)}
          />
          <Txt variant="heading">Share a card</Txt>
          <MediaLibraryPicker kind="gif" collapsed onSelect={media=>void run(()=>contentApi.attach(roomId,media))}/>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {(["post", "profile", "community"] as const).map((k) => (
              <Button
                key={k}
                small
                label={k}
                variant={kind === k ? "primary" : "secondary"}
                onPress={() => setKind(k)}
              />
            ))}
          </View>
          <Field
            label={
              kind === "profile"
                ? "@handle or profile link"
                : "Paste a Kamino link"
            }
            value={target}
            onChangeText={setTarget}
          />
          <Button
            label="Share in conversation"
            disabled={busy || !target.trim()}
            onPress={() =>
              void run(() => contentApi.share(roomId, kind, target.trim()))
            }
          />
          {d.canPin ? (
            <>
              <Txt variant="heading">Pin a message</Txt>
              {messages.slice(-20).map((m) => (
                <PressableScale
                  key={m.id}
                  onPress={() =>
                    void run(() => contentApi.pin(roomId, m.id, true))
                  }
                  accessibilityLabel={`Pin ${m.body.slice(0, 50)}`}
                  style={{
                    minHeight: 44,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                    padding: 10,
                  }}
                >
                  <Txt numberOfLines={2}>{m.body || "Attachment"}</Txt>
                </PressableScale>
              ))}
            </>
          ) : null}
          <Txt variant="heading">People</Txt>
          {d.people.map((p) => (
            <View
              key={p.userId}
              style={{
                gap: 5,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
                paddingBottom: 10,
              }}
            >
              <Txt
                variant="heading"
                onPress={() => router.push(`/profile/${p.handle}`)}
              >
                {p.name}
              </Txt>
              <Txt variant="caption" tone="muted">
                {p.lastActive
                  ? `Last active ${new Date(p.lastActive).toLocaleString()}`
                  : "Activity private"}
              </Txt>
              {p.userId !== myId ? (
                <Button
                  small
                  variant="danger"
                  label="Block"
                  onPress={() =>
                    void confirmAction(
                      `Block ${p.name}?`,
                      "This closes contact with this member.",
                      "Block",
                      true,
                    ).then((ok) =>
                      ok
                        ? run(() => contentApi.block(roomId, p.userId))
                        : undefined,
                    )
                  }
                />
              ) : null}
              {d.kind === "group" && d.ownerId === myId && p.userId !== myId ? (
                <Button
                  small
                  variant="secondary"
                  label="Remove from group"
                  onPress={() =>
                    void run(() =>
                      contentApi.updateGroup(roomId, {
                        removeUserId: p.userId,
                      }),
                    )
                  }
                />
              ) : null}
            </View>
          ))}
          {d.kind === "group" ? (
            <>
              <Button small variant="secondary" label="Group settings & roles" onPress={()=>{setOpen(false);router.push(`/groups/${roomId}`);}}/>
              {d.ownerId === myId ? (
                <>
                  <Field
                    label="Invite a member"
                    placeholder="@handle"
                    value={handle}
                    onChangeText={setHandle}
                  />
                  <Button
                    disabled={busy || !handle.trim()}
                    label="Send group invitation"
                    onPress={() =>
                      void run(() =>
                        contentApi.updateGroup(roomId, {
                          addHandle: handle.trim(),
                        }),
                      )
                    }
                  />
                </>
              ) : null}
              <Button
                variant="danger"
                label="Leave group"
                onPress={() =>
                  void confirmAction(
                    "Leave this group?",
                    "You will lose access to the conversation.",
                    "Leave",
                  ).then((ok) =>
                    ok
                      ? contentApi
                          .updateGroup(roomId, { leave: true })
                          .then(() => {
                            setOpen(false);
                            router.replace("/chats");
                          })
                          .catch(showError)
                      : undefined,
                  )
                }
              />
            </>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}

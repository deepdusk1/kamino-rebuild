import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import { readAsStringAsync } from "expo-file-system/legacy";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Alert, Linking, Share, Switch, View } from "react-native";
import { SUPPORT_EMAIL } from "@/api/config";
import { api } from "@/api/endpoints";
import type { DmPrivacy, NotifyPrefs, Profile } from "@/api/types";
import { useSession } from "@/auth/session";
import { confirmAction, notify } from "@/components/community/platform";
import { PersonAvatar } from "@/components/k";
import { hourLabel } from "@/components/profile/helpers";
import { Button, ErrorState, Field, Loading, PressableScale, Screen, Sheet, Txt } from "@/components/ui";
import { errorMessage, useAction } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { font, radius, shadow, useTheme, type Tone } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

const NOTIFY_CATEGORIES: readonly { key: Exclude<keyof NotifyPrefs, "digest">; label: string; hint: string; icon: IconName; tone: Tone }[] = [
  { key: "social", label: "Social", hint: "Likes, comments, mentions, follows", icon: "heart", tone: "pink" },
  { key: "community", label: "Communities", hint: "Invites, announcements, achievements", icon: "people", tone: "blue" },
  { key: "events", label: "Events & live", hint: "Event reminders, live rooms, calls", icon: "calendar", tone: "orange" },
  { key: "messages", label: "Messages", hint: "New messages in your chats", icon: "chatbubble-ellipses", tone: "violet" },
];

const DM_OPTIONS: readonly { value: DmPrivacy; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "members", label: "People in my communities" },
  { value: "none", label: "No one" },
];

/**
 * Settings: your own account only. Every control here saves to the server (`updateSettings`) or opens a real page.
 * Account → Privacy → Notifications → Safety & blocked people → Data & help → Sign out / Delete account.
 * Community moderation lives on each community's Moderation page, not here.
 */
export default function Settings() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { signOut } = useSession();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const role = useQuery({ queryKey: ["safetyRole"], queryFn: api.safetyRole, staleTime: 10 * 60_000 });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pushNote, setPushNote] = useState<string | null>(null);

  /** Saves a change straight away on screen, then on the server; a failure shows a message and reloads. */
  const save = async (patch: Parameters<typeof api.updateSettings>[0]) => {
    queryClient.setQueryData<typeof me.data>(["me"], (prev) =>
      prev
        ? { ...prev, profile: { ...prev.profile, ...(patch as Partial<Profile>), notifyPrefs: { ...prev.profile.notifyPrefs, ...(patch.notifyPrefs ?? {}) } } }
        : prev,
    );
    try {
      await api.updateSettings(patch);
      haptic.tap();
    } catch (error) {
      notify("Couldn't save that", errorMessage(error));
    }
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    void queryClient.invalidateQueries({ queryKey: ["profileOverview"] });
  };

  const [checkPush, checkingPush] = useAction(async () => {
    const { registerPushDevice } = await import("@/lib/push");
    const result = await registerPushDevice();
    setPushNote(
      result === "enabled"
        ? "Push notifications are on for this phone."
        : result === "denied"
          ? "Notifications are turned off for Kamino in your phone's settings."
          : "This phone couldn't register for push notifications.",
    );
  });

  const [exportData, exporting] = useAction(async () => {
    const { json } = await api.exportData();
    await Share.share({ message: json, title: "My Kamino data" });
  });

  const [importData, importing] = useAction(
    async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain"], copyToCacheDirectory: true });
      const file = picked.assets?.[0];
      if (picked.canceled || !file) return;
      if (file.size && file.size > 20 * 1024 * 1024) throw new Error("That file is too large to import.");
      const result = await api.importData(await readAsStringAsync(file.uri));
      await queryClient.invalidateQueries({ queryKey: ["drafts"] });
      Alert.alert(
        "Import finished",
        `${result.imported} draft${result.imported === 1 ? "" : "s"} added${result.skipped ? `, ${result.skipped} skipped` : ""}. Find them under Drafts when you write a post.`,
      );
    },
    { errorTitle: "Couldn't import that file" },
  );

  const [deleteAccount, deleting] = useAction(async () => {
    if (confirmText.trim() !== "DELETE") throw new Error("Type DELETE (in capitals) to confirm.");
    await api.deleteAccount();
    setDeleteOpen(false);
    await signOut();
  });

  const unblock = async (userId: string) => {
    try {
      await api.block(userId);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    } catch (error) {
      notify("Couldn't unblock", errorMessage(error));
    }
  };

  if (me.isPending) return <Loading />;
  if (me.isError || !me.data) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;

  const p = me.data.profile;
  // Older accounts may be missing a key; anything missing counts as on (digest as off).
  const prefs: NotifyPrefs = { ...{ social: true, community: true, events: true, messages: true, digest: false }, ...(p.notifyPrefs as Partial<NotifyPrefs>) };
  const quietOn = p.quietStart !== null && p.quietEnd !== null;

  return (
    <Screen>
      <Section title="Account" icon="person" tone="violet">
        <LinkRow icon="create-outline" label="Edit profile" detail="Name, photo, bio, cover" onPress={() => router.push("/edit-profile")} />
        <LinkRow icon="finger-print-outline" label="Username, language & accessibility" detail="Handle, app language, text size, contrast" onPress={() => router.push("/privacy-dashboard" as never)} />
        <LinkRow icon="shield-outline" label="Security" detail="Password, two-step sign-in, signed-in devices" onPress={() => router.push("/security")} />
      </Section>

      <Section title="Privacy" icon="lock-closed" tone="blue">
        <SwitchRow label="Private account" hint="Only people you approve can see your posts and communities." value={p.privateAccount} onChange={(privateAccount) => void save({ privateAccount })} />
        <SwitchRow label="Show when I'm online" hint="A green dot on your picture while you're active." value={p.showOnline} onChange={(showOnline) => void save({ showOnline })} />
        <SwitchRow label="Read receipts" hint="Let people see when you've read their messages." value={p.showReadReceipts} onChange={(showReadReceipts) => void save({ showReadReceipts })} />
        <SwitchRow label="Hide communities I've joined" hint="Others won't see your communities on your profile." value={p.hideJoined} onChange={(hideJoined) => void save({ hideJoined })} />
        <View style={{ gap: 8 }}>
          <Txt style={{ fontFamily: font.semibold, fontSize: 14, color: theme.ink }}>Who can message me</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {DM_OPTIONS.map((opt) => {
              const on = p.dmPrivacy === opt.value;
              return (
                <PressableScale
                  key={opt.value}
                  onPress={() => void save({ dmPrivacy: opt.value })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={opt.label}
                  scaleTo={0.96}
                  style={{ height: 32, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, justifyContent: "center", backgroundColor: on ? theme.tints.violet : theme.surfaceAlt, borderColor: on ? theme.violet : theme.border }}
                >
                  <Txt style={{ fontFamily: on ? font.bold : font.semibold, fontSize: 12.5, color: on ? theme.toneText.violet : theme.muted }}>{opt.label}</Txt>
                </PressableScale>
              );
            })}
          </View>
        </View>
      </Section>

      <Section title="Notifications" icon="notifications" tone="orange">
        {NOTIFY_CATEGORIES.map((c) => (
          <SwitchRow key={c.key} label={c.label} hint={c.hint} icon={c.icon} tone={c.tone} value={prefs[c.key]} onChange={(value) => void save({ notifyPrefs: { [c.key]: value } })} />
        ))}
        <SwitchRow label="Weekly email digest" hint="What you missed across your communities." icon="mail" tone="green" value={prefs.digest} onChange={(digest) => void save({ notifyPrefs: { digest } })} />
        <SwitchRow
          label="Quiet hours"
          hint={quietOn ? `No phone alerts from ${hourLabel(p.quietStart ?? 22)} to ${hourLabel(p.quietEnd ?? 7)}` : "Pause phone alerts overnight (10 pm to 7 am)"}
          icon="moon"
          tone="blue"
          value={quietOn}
          onChange={(on) => void save({ quietStart: on ? 22 : null, quietEnd: on ? 7 : null })}
        />
        <LinkRow icon="refresh-outline" label="Check push notifications" detail={pushNote ?? "Re-register this phone if alerts stopped"} busy={checkingPush} onPress={() => void checkPush()} />
      </Section>

      <Section title="Safety" icon="shield-checkmark" tone="green">
        <LinkRow icon="shield-checkmark-outline" label="Safety Center" detail="House rules, reports and appeals" onPress={() => router.push("/safety")} />
        {role.data?.siteAdmin ? <LinkRow icon="construct-outline" label="Site operations" detail="Reports, flags and admin tools (site owner)" onPress={() => router.push("/admin-operations" as never)} /> : null}
        {me.data.blocked.length ? (
          <View style={{ gap: 8 }}>
            <Txt style={{ fontFamily: font.semibold, fontSize: 14, color: theme.ink }}>Blocked people</Txt>
            {me.data.blocked.map((b) => (
              <View key={b.blocked_id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <PersonAvatar person={{ name: b.display_name, hue: 260 }} size={34} />
                <Txt numberOfLines={1} style={{ flex: 1, fontFamily: font.semibold, fontSize: 14, color: theme.ink }}>
                  {b.display_name} <Txt style={{ color: theme.subtle }}>@{b.handle}</Txt>
                </Txt>
                <Button label="Unblock" small variant="secondary" onPress={() => void unblock(b.blocked_id)} />
              </View>
            ))}
          </View>
        ) : (
          <Txt style={{ fontFamily: font.regular, fontSize: 12.5, color: theme.muted }}>You haven&apos;t blocked anyone. You can block from the ⋯ menu on a profile or message.</Txt>
        )}
      </Section>

      <Section title="Data & help" icon="cloud-download" tone="violet">
        <LinkRow icon="download-outline" label="Export my data" detail="Everything you've shared, as a file" busy={exporting} onPress={() => void exportData()} />
        <LinkRow icon="push-outline" label="Import drafts" detail="From a Kamino export file" busy={importing} onPress={() => void importData()} />
        <LinkRow icon="school-outline" label="Replay the welcome tour" onPress={() => router.push("/tutorial" as never)} />
        <LinkRow icon="mail-outline" label="Contact support" detail={SUPPORT_EMAIL} onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
      </Section>

      <View style={{ gap: 8 }}>
        <Button
          label="Sign out"
          variant="secondary"
          onPress={() => {
            void confirmAction("Sign out?", "You can sign back in any time.", "Sign out").then(async (ok) => {
              if (ok) await signOut();
            });
          }}
        />
        <Button label="Delete account" variant="danger" onPress={() => setDeleteOpen(true)} />
      </View>

      <Txt variant="caption" tone="subtle" style={{ textAlign: "center" }}>
        Kamino {Constants.expoConfig?.version ?? "1.0.0"}
      </Txt>

      <Sheet visible={deleteOpen} title="Delete account" onClose={() => setDeleteOpen(false)}>
        <Txt tone="muted">This permanently deletes your profile, posts, messages and memberships. It can&apos;t be undone.</Txt>
        <Field label="Type DELETE to confirm" value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" autoCorrect={false} />
        <Button label="Delete forever" variant="danger" onPress={() => void deleteAccount()} busy={deleting} disabled={confirmText.trim() !== "DELETE"} />
      </Sheet>
    </Screen>
  );
}

function Section({ title, icon, tone, children }: { title: string; icon: IconName; tone: Tone; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[{ gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }, shadow.card]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: theme.tints[tone], alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={16} color={theme.toneText[tone]} />
        </View>
        <Txt accessibilityRole="header" style={{ fontFamily: font.heavy, fontSize: 16.5, lineHeight: 22, color: theme.ink }}>
          {title}
        </Txt>
      </View>
      {children}
    </View>
  );
}

function SwitchRow({ label, hint, value, onChange, icon, tone = "violet" }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; icon?: IconName; tone?: Tone }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
      {icon ? (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.tints[tone], alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={15} color={theme.toneText[tone]} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Txt style={{ fontFamily: font.semibold, fontSize: 14, lineHeight: 19, color: theme.ink }}>{label}</Txt>
        {hint ? <Txt style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>{hint}</Txt> : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: theme.violet, false: theme.border }} thumbColor="#FFFFFF" ios_backgroundColor={theme.border} />
    </View>
  );
}

function LinkRow({ icon, label, detail, onPress, busy }: { icon: IconName; label: string; detail?: string; onPress: () => void; busy?: boolean }) {
  const theme = useTheme();
  return (
    <PressableScale onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={label} scaleTo={0.98} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 }}>
      <Ionicons name={icon} size={19} color={theme.violet} />
      <View style={{ flex: 1 }}>
        <Txt style={{ fontFamily: font.semibold, fontSize: 14, lineHeight: 19, color: theme.ink }}>{busy ? "Working…" : label}</Txt>
        {detail ? (
          <Txt numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 12, lineHeight: 16, color: theme.muted }}>
            {detail}
          </Txt>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.subtle} />
    </PressableScale>
  );
}

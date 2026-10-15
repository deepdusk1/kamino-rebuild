import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Switch, View } from "react-native";
import { api } from "@/api/endpoints";
import { BirthdayFields, EMPTY_BIRTHDAY, judgeBirthday, YOUNG_MESSAGE } from "@/components/BirthdayFields";
import { ContactImporter } from "@/components/ContactImporter";
import { notify } from "@/components/community/platform";
import { Button, ErrorState, Field, Loading, PressableScale, Screen, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useT } from "@/lib/i18n";
import { identityApi, type IdentityDashboard, type IdentityPreferences } from "@/lib/identity-v9";
import { AUDIENCE_LABEL, LANGUAGE_LABEL, PEOPLE_KIND_LABEL, SENSITIVE_LABEL } from "@/lib/settings-rules";
import { radius, useTheme } from "@/theme";

/**
 * Privacy dashboard: username, language, links, who can reach you, people lists and finding contacts.
 * Text size, contrast and light / dark live under Settings → Appearance.
 */
export default function PrivacyDashboard() {
  const t = useT();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["identityDashboard"], queryFn: identityApi.dashboard });
  const [handle, setHandle] = useState<string | null>(null);
  const [links, setLinks] = useState<string | null>(null);
  const [person, setPerson] = useState("");
  const [kind, setKind] = useState("favorite");
  const [birthday, setBirthday] = useState(EMPTY_BIRTHDAY);
  const [contacts, setContacts] = useState("");
  const [matches, setMatches] = useState<{ handle: string; name: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Shows the change straight away, then saves it. Only this screen's data and your profile are reloaded (it used to
   * reload every screen in the app on each tap, and switches jumped back while that happened).
   */
  const save = async (patch: Partial<IdentityPreferences>, done?: string) => {
    client.setQueryData<IdentityDashboard>(["identityDashboard"], (prev) => (prev ? { ...prev, preferences: { ...prev.preferences, ...patch } } : prev));
    try {
      await identityApi.preferences(patch);
      haptic.tap();
      if (done) notify(done);
      if (patch.handle) setHandle(null);
      if (patch.socialLinks) setLinks(null);
    } catch (e) {
      notify("Couldn't save that", errorMessage(e));
    }
    await client.invalidateQueries({ queryKey: ["identityDashboard"] });
    if (patch.handle || patch.language || patch.socialLinks || patch.profileHue !== undefined) {
      void client.invalidateQueries({ queryKey: ["bootstrap"] });
      void client.invalidateQueries({ queryKey: ["me"] });
      void client.invalidateQueries({ queryKey: ["profileOverview"] });
    }
  };

  const change = async (target: string, relationship: string, on: boolean) => {
    const clean = target.trim().replace(/^@/, "");
    if (on && clean.length < 2) return notify("Add a username", "Type the member's @username first.");
    setBusy(`person:${clean}:${relationship}`);
    try {
      await identityApi.person(clean, relationship, on);
      await query.refetch();
      if (on) setPerson("");
    } catch (e) {
      notify("Couldn't update", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (query.isPending) return <Loading />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const d = query.data;
  const p = d.preferences;
  const handleValue = handle ?? p.handle;
  const linksValue = links ?? p.socialLinks.map((link) => `${link.label}|${link.url}`).join("\n");
  const people = [...d.people, ...d.muted.map((m) => ({ ...m, kind: "mute" }))];

  return (
    <Screen>
      <Txt variant="title">Privacy dashboard</Txt>
      <Txt tone="muted">Your identity, who can reach you, and your people.</Txt>
      <Button label="Account security and devices" variant="secondary" onPress={() => router.push("/security" as never)} />

      <Card title="Your identity">
        <Field label="Username" value={handleValue} onChangeText={setHandle} maxLength={30} autoCapitalize="none" autoCorrect={false} hint="3–30 letters, numbers, _ or -. Your old @link stops working." />
        <Button label="Save username" disabled={handleValue.trim().toLowerCase() === p.handle} onPress={() => void save({ handle: handleValue.trim().toLowerCase() }, "Username saved")} />
        <Txt>{t("privacy.language.title")}</Txt>
        <Choices values={Object.keys(LANGUAGE_LABEL)} labels={LANGUAGE_LABEL} value={p.language} onSelect={(language) => void save({ language })} />
        <Field label="Profile links" value={linksValue} onChangeText={setLinks} multiline placeholder="Portfolio|https://example.com" hint="Up to six links, one per line: label|https://address" />
        <Button
          label="Save links"
          onPress={() =>
            void save(
              {
                socialLinks: linksValue
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => {
                    const [label, ...url] = line.split("|");
                    return { label: label?.trim() ?? "", url: url.join("|").trim() };
                  }),
              },
              "Links saved",
            )
          }
        />
        <Txt>Profile accent</Txt>
        <Choices values={["0", "25", "140", "175", "210", "250", "290", "330"]} value={String(p.profileHue)} onSelect={(hue) => void save({ profileHue: Number(hue) })} swatches />
      </Card>

      <Card title="Who can reach you">
        <Txt>Who can mention you</Txt>
        <Choices values={["everyone", "following", "none"]} labels={AUDIENCE_LABEL} value={p.mentionPrivacy} onSelect={(mentionPrivacy) => void save({ mentionPrivacy })} />
        <Txt>Who can invite you to communities</Txt>
        <Choices values={["everyone", "following", "none"]} labels={AUDIENCE_LABEL} value={p.invitePrivacy} onSelect={(invitePrivacy) => void save({ invitePrivacy })} />
        <Toggle label="Appear in people search" hint="Off: people can still open your profile from a link or a post." value={p.searchVisible} onChange={(searchVisible) => void save({ searchVisible })} />
        <Toggle label="Hide my followers list" value={p.hideFollowers} onChange={(hideFollowers) => void save({ hideFollowers })} />
        <Toggle label="Hide who I follow" value={p.hideFollowing} onChange={(hideFollowing) => void save({ hideFollowing })} />
        <Txt>Posts with a content warning</Txt>
        <Choices
          values={d.ageBand === "18+" ? ["blur", "hide", "show"] : ["blur", "hide"]}
          labels={SENSITIVE_LABEL}
          value={p.sensitiveContent}
          onSelect={(sensitiveContent) => void save({ sensitiveContent })}
        />
      </Card>

      <Card title="Age check">
        <Txt>{d.ageChecked ? "You confirmed you're 18 or over." : "Kamino is for adults 18 and over. Confirm your birthday once to use communities."}</Txt>
        {!d.ageChecked ? (
          <>
            <BirthdayFields value={birthday} onChange={setBirthday} />
            <Button
              label="Confirm my age"
              busy={busy === "age"}
              onPress={async () => {
                const verdict = judgeBirthday(birthday);
                if (verdict.kind !== "ok") return notify("Check your birthday", verdict.kind === "young" ? YOUNG_MESSAGE : "Enter your real birthday: month, day and a four-digit year.");
                setBusy("age");
                try {
                  await api.confirmAge({ year: verdict.year, month: verdict.month, day: verdict.day });
                  await query.refetch();
                  void client.invalidateQueries({ queryKey: ["bootstrap"] });
                } catch (e) {
                  notify("Couldn't confirm", errorMessage(e));
                } finally {
                  setBusy(null);
                }
              }}
            />
          </>
        ) : null}
      </Card>

      <Card title="Your people">
        <Field label="Member username" value={person} onChangeText={setPerson} autoCapitalize="none" autoCorrect={false} placeholder="@username" />
        <Choices values={["favorite", "close_friend", "restrict", "mute"]} labels={PEOPLE_KIND_LABEL} value={kind} onSelect={setKind} />
        <Button label="Add" busy={busy?.startsWith(`person:${person.trim().replace(/^@/, "")}:`) ?? false} onPress={() => void change(person, kind, true)} />
        {people.length === 0 ? <Txt tone="muted">Your lists are empty.</Txt> : null}
        {people.map((row) => (
          <View key={`${row.kind}:${row.userId}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt onPress={() => router.push(`/profile/${row.handle}` as never)}>
                {row.name} · @{row.handle}
              </Txt>
              <Txt variant="caption" tone="muted">
                {PEOPLE_KIND_LABEL[row.kind ?? ""] ?? row.kind}
              </Txt>
            </View>
            <Button label="Remove" small variant="secondary" busy={busy === `person:${row.handle}:${row.kind}`} onPress={() => void change(row.handle, row.kind!, false)} />
          </View>
        ))}
      </Card>

      <Card title="Find people you know">
        <ContactImporter onMatches={setMatches} />
        <Txt tone="muted">Or paste email addresses you have permission to use. They are matched once and never kept.</Txt>
        <Field label="Contact emails" value={contacts} onChangeText={setContacts} multiline autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
        <Button
          label="Find contacts"
          busy={busy === "contacts"}
          onPress={async () => {
            const emails = contacts.split(/[\s,;]+/).filter(Boolean);
            if (!emails.length) return notify("Add an email", "Paste at least one email address.");
            setBusy("contacts");
            try {
              const found = await identityApi.contacts(emails);
              setMatches(found);
              setContacts("");
              if (!found.length) notify("No matches", "None of those people are on Kamino (or they've chosen not to be found).");
            } catch (e) {
              notify("Couldn't find contacts", errorMessage(e));
            } finally {
              setBusy(null);
            }
          }}
        />
        {matches.map((m) => (
          <Button key={m.handle} label={`${m.name} · @${m.handle}`} variant="secondary" onPress={() => router.push(`/profile/${m.handle}` as never)} />
        ))}
      </Card>
    </Screen>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 14, padding: 16, borderRadius: radius.card, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}>
      <Txt variant="heading">{title}</Txt>
      {children}
    </View>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Txt>{label}</Txt>
        {hint ? (
          <Txt variant="caption" tone="muted">
            {hint}
          </Txt>
        ) : null}
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

function Choices({ values, labels, value, onSelect, swatches }: { values: string[]; labels?: Record<string, string>; value: string; onSelect: (v: string) => void; swatches?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {values.map((v) =>
        swatches ? (
          <PressableScale
            key={v}
            onPress={() => onSelect(v)}
            accessibilityRole="radio"
            accessibilityState={{ checked: v === value }}
            accessibilityLabel={`Accent colour ${Number(v)} degrees`}
            scaleTo={0.9}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `hsl(${v}, 70%, 55%)`, borderWidth: v === value ? 3 : 0, borderColor: theme.ink }}
          >
            <View />
          </PressableScale>
        ) : (
          <Button key={v} label={labels?.[v] ?? v.replace(/_/g, " ")} small variant={v === value ? "primary" : "secondary"} onPress={() => onSelect(v)} />
        ),
      )}
    </View>
  );
}

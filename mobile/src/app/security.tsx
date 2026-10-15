import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Linking, View } from "react-native";
import { authRequest } from "@/api/client";
import { apiBaseUrl } from "@/api/config";
import { useSession } from "@/auth/session";
import { confirmAction, notify } from "@/components/community/platform";
import { Button, ErrorState, Field, Loading, Screen, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { identityApi } from "@/lib/identity-v9";
import { newPasswordProblem } from "@/lib/settings-rules";
import { radius, useTheme } from "@/theme";

/**
 * Account security: email confirmation, password, two-step login and signed-in devices.
 * Google / Apple accounts have no Kamino password, so the password and authenticator parts explain that instead.
 */
export default function Security() {
  const { signOut } = useSession();
  const query = useQuery({ queryKey: ["identityDashboard"], queryFn: identityApi.dashboard });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");

  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await work();
      await query.refetch();
    } catch (e) {
      notify("Couldn't update security", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const changePassword = () =>
    run("password", async () => {
      const problem = newPasswordProblem(current, next, repeat);
      if (problem) throw new Error(problem);
      await authRequest("change-password", { currentPassword: current, newPassword: next, revokeOtherSessions: false });
      setCurrent("");
      setNext("");
      setRepeat("");
      const others = query.data?.sessions.filter((s) => !s.current).length ?? 0;
      if (others > 0 && (await confirmAction("Password changed", `Also sign out the ${others} other device${others === 1 ? "" : "s"} using your account?`, "Sign them out"))) {
        await identityApi.revokeOthers();
      } else if (!others) {
        notify("Password changed", "Use your new password next time you sign in.");
      }
    });

  const endSession = async (session: { id: string; device: string; current: boolean }) => {
    const ok = await confirmAction(
      session.current ? "Sign out of this phone?" : `Sign out ${session.device}?`,
      session.current ? "You'll need to sign in again here." : "That device loses access straight away.",
      "Sign out",
      true,
    );
    if (!ok) return;
    setBusy(`session:${session.id}`);
    try {
      const result = await identityApi.revoke(session.id);
      // Ending this phone's own session: sign out properly instead of failing every request afterwards.
      if (result.signedOut || session.current) return await signOut();
      await query.refetch();
    } catch (e) {
      notify("Couldn't sign that device out", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const endOthers = async () => {
    const ok = await confirmAction("Sign out everywhere else?", "Every other phone and browser loses access. This phone stays signed in.", "Sign them out", true);
    if (!ok) return;
    await run("others", async () => {
      const { ended } = await identityApi.revokeOthers();
      notify("Done", ended ? `Signed out ${ended} other device${ended === 1 ? "" : "s"}.` : "No other devices were signed in.");
    });
  };

  if (query.isPending) return <Loading />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const d = query.data;
  const others = d.sessions.filter((s) => !s.current);

  return (
    <Screen>
      <Txt variant="title">Account security</Txt>
      <Txt tone="muted">Protect your account and manage where you&apos;re signed in.</Txt>

      <Card title="Email">
        <Txt>{d.email}</Txt>
        <Txt tone="muted">{d.emailVerified ? "Confirmed" : "Not confirmed yet"}</Txt>
        {!d.emailVerified ? (
          <Button
            label="Send confirmation email"
            busy={busy === "email"}
            disabled={!d.emailDeliveryConfigured}
            onPress={() =>
              void run("email", async () => {
                await authRequest("send-verification-email", { email: d.email, callbackURL: `${apiBaseUrl()}/security` });
                notify("Check your email", "Follow the link in it to confirm your account.");
              })
            }
          />
        ) : null}
        {!d.emailVerified && !d.emailDeliveryConfigured ? (
          <Txt variant="caption" tone="muted">
            Confirmation emails aren&apos;t available right now. Please try again later.
          </Txt>
        ) : null}
      </Card>

      <Card title="Password">
        {d.hasPassword ? (
          <>
            <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" textContentType="password" />
            <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" textContentType="newPassword" hint="At least 8 characters." />
            <Field label="New password again" value={repeat} onChangeText={setRepeat} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
            <Button label="Change password" busy={busy === "password"} disabled={!current || !next || !repeat} onPress={() => void changePassword()} />
          </>
        ) : (
          <Txt tone="muted">You sign in with Google or Apple, so there&apos;s no Kamino password to change. Manage it in your Google or Apple account.</Txt>
        )}
      </Card>

      <Card title="Two-step sign-in">
        {!d.hasPassword ? (
          <Txt tone="muted">Two-step sign-in protects password sign-in. For Google or Apple sign-in, turn on two-step verification in that account.</Txt>
        ) : (
          <>
            <Txt>{d.twoFactorEnabled ? "On: an authenticator app protects your password sign-in." : "Add an authenticator app and save your backup codes."}</Txt>
            {!setup ? <Field label="Current password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" /> : null}
            {!setup && !d.twoFactorEnabled ? (
              <Button
                label="Set up authenticator"
                busy={busy === "2fa"}
                disabled={!password}
                onPress={() =>
                  void run("2fa", async () => {
                    const { body } = await authRequest("two-factor/enable", { password });
                    setSetup(body as { totpURI: string; backupCodes: string[] });
                  })
                }
              />
            ) : null}
            {setup ? (
              <>
                <Button label="Open authenticator app" variant="secondary" onPress={() => void Linking.openURL(setup.totpURI).catch(() => notify("No authenticator app found", "Copy the key below into your authenticator app."))} />
                <Txt selectable>{new URL(setup.totpURI).searchParams.get("secret")}</Txt>
                <Field label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" />
                <Button
                  label="Verify and turn on"
                  busy={busy === "verify"}
                  disabled={code.length !== 6}
                  onPress={() =>
                    void run("verify", async () => {
                      await authRequest("two-factor/verify-totp", { code });
                      setPassword("");
                      setCode("");
                    })
                  }
                />
                <Txt variant="heading">Save your backup codes</Txt>
                <Txt selectable>{setup.backupCodes.join("\n")}</Txt>
                <Button label="I saved my codes" variant="secondary" onPress={() => setSetup(null)} />
              </>
            ) : null}
            {d.twoFactorEnabled && !setup ? (
              <Button
                label="Turn off two-step sign-in"
                variant="danger"
                busy={busy === "2fa-off"}
                disabled={!password}
                onPress={() =>
                  void run("2fa-off", async () => {
                    await authRequest("two-factor/disable", { password });
                    setPassword("");
                  })
                }
              />
            ) : null}
          </>
        )}
      </Card>

      <Card title="Where you're signed in">
        {d.sessions.map((session) => (
          <View key={session.id} style={{ gap: 6 }}>
            <Txt>
              {session.device}
              {session.current ? " · this phone" : ""}
            </Txt>
            <Txt variant="caption" tone="muted">
              Last active {new Date(session.lastActive).toLocaleString()}
            </Txt>
            <Button label={session.current ? "Sign out here" : "Sign out"} small variant="danger" busy={busy === `session:${session.id}`} onPress={() => void endSession(session)} />
          </View>
        ))}
        {others.length ? <Button label="Sign out everywhere else" variant="secondary" busy={busy === "others"} onPress={() => void endOthers()} /> : null}
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

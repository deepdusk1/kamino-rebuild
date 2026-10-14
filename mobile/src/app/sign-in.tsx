// ===== FILE: mobile/src/app/sign-in.tsx =====
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { rpc, setAuthToken } from "@/api/client";
import { apiBaseUrl } from "@/api/config";
import { useSession } from "@/auth/session";
import { writeSecret } from "@/auth/storage";
import {
  BirthdayFields,
  EMPTY_BIRTHDAY,
  judgeBirthday,
  YOUNG_MESSAGE,
} from "@/components/BirthdayFields";
import { GradientWord, VIOLET_GRADIENT } from "@/components/home/Decor";
import { StepHeader } from "@/components/home/StepHeader";
import { FilterPills, GradientButton } from "@/components/k";
import {
  Appear,
  Button,
  Field,
  PressableScale,
  Screen,
  Sheet,
  Txt,
} from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { font, radius, shadow, space, useTheme } from "@/theme";

WebBrowser.maybeCompleteAuthSession();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_TOKEN_KEY = "kamino.session-token";

type AuthMode = "in" | "up";
type AuthMethod = "email" | "emailOtp" | "phone";
type SocialProvider = "google" | "apple";

type SignInCapabilities = {
  google: boolean;
  apple: boolean;
  phone: boolean;
  emailOtp?: boolean;
  captchaSiteKey: string | null;
};

type BeginMobileOAuthResult = {
  url?: string;
  authUrl?: string;
  authorizationUrl?: string;
  state?: string;
};

type FinishMobileOAuthResult = {
  token?: string;
  sessionToken?: string;
  twoFactorRequired?: boolean;
  needsAge?: boolean;
  userId?: string;
};

type EmailOtpSendResult = {
  sent?: boolean;
  ok?: boolean;
};

type EmailOtpVerifyResult = {
  token?: string;
  sessionToken?: string;
  twoFactorRequired?: boolean;
};

function hasTwoFactorFlag(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "twoFactorRequired" in err &&
    Boolean((err as { twoFactorRequired?: unknown }).twoFactorRequired)
  );
}

function parseCallbackUrlParams(callbackUrl: string): {
  code: string | null;
  state: string | null;
  token: string | null;
  error: string | null;
} {
  try {
    const normalized = callbackUrl.replace("#", "?");
    const qIndex = normalized.indexOf("?");
    if (qIndex === -1) {
      return { code: null, state: null, token: null, error: null };
    }
    const search = normalized.slice(qIndex + 1);
    const params = new URLSearchParams(search);
    return {
      code: params.get("code"),
      state: params.get("state"),
      token: params.get("token") ?? params.get("sessionToken"),
      error: params.get("error") ?? params.get("error_description"),
    };
  } catch {
    return { code: null, state: null, token: null, error: null };
  }
}

/**
 * Auth Screen (`mobile/src/app/sign-in.tsx`) — Pixel-faithful to Mockup 1 & Onboarding Step 1:
 * - Modes: Create Account (`mode="up"`) with 13+ Birthday verification vs Log In (`mode="in"`)
 * - Methods:
 *   1. Email & Password (`signIn` / `signUp` from `useSession`)
 *   2. Email OTP passwordless code (`sendEmailOtp` / `verifyEmailOtp` with fallback to `requestPasswordReset`)
 *   3. Phone SMS OTP (`sendPhoneCode` / `verifyPhoneCode` from `useSession`)
 *   4. Google & Apple OAuth wired end-to-end with `beginMobileOAuth` & `finishMobileOAuth` RPCs
 *      plus `useSession().socialSignIn` session persistence
 * - Full 2FA state (`verifyTwoFactor` with TOTP 6-digit authenticator code or single-use backup code)
 * - Friendly error banner with one-tap "Retry" button that replays the exact failed action
 */
export default function SignIn() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ mode?: string; method?: string }>();
  const {
    signIn,
    signUp,
    requestPasswordReset,
    verifyTwoFactor,
    socialSignIn,
    sendPhoneCode,
    verifyPhoneCode,
  } = useSession();

  const [mode, setMode] = useState<AuthMode>(
    params.mode === "up" ? "up" : "in",
  );
  const [authMethod, setAuthMethod] = useState<AuthMethod>(
    params.method === "phone"
      ? "phone"
      : params.method === "emailOtp"
        ? "emailOtp"
        : "email",
  );

  // Email + Password & Sign-Up fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthday, setBirthday] = useState(EMPTY_BIRTHDAY);

  // Email OTP state
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState("");

  // Phone SMS OTP state
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneSent, setPhoneSent] = useState(false);

  // Two-Factor Authentication (TOTP / Backup code) state
  const [twoFactor, setTwoFactor] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  // Busy & friendly retryable error state
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryTask, setRetryTask] = useState<(() => Promise<void>) | null>(null);

  // Password Reset sheet state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetState, setResetState] = useState<"idle" | "sending" | "sent">(
    "idle",
  );
  const [resetError, setResetError] = useState<string | null>(null);

  const capabilities = useQuery({
    queryKey: ["signInCapabilities"],
    queryFn: () => rpc<SignInCapabilities>("getSignInCapabilities"),
    staleTime: 60_000,
    retry: 1,
  });

  const up = mode === "up";
  const phoneSupported = capabilities.data?.phone ?? true;

  const persistOAuthToken = useCallback(
    async (token: string): Promise<void> => {
      const clean = token.trim();
      if (!clean) return;
      setAuthToken(clean);
      await writeSecret(SESSION_TOKEN_KEY, clean);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    },
    [queryClient],
  );

  /**
   * Executes the full mobile OAuth handshake using `beginMobileOAuth` and `finishMobileOAuth`
   * RPCs, opening the system authentication session browser and persisting the resulting session
   * token via `auth/session.tsx` / `auth/storage.ts`.
   */
  const executeMobileOAuthFlow = useCallback(
    async (provider: SocialProvider): Promise<void> => {
      const redirectUri = Linking.createURL("oauth-callback");

      const started = await rpc<BeginMobileOAuthResult>("beginMobileOAuth", {
        provider,
        redirectUri,
      });

      const authorizeUrl =
        started.url ?? started.authUrl ?? started.authorizationUrl ?? "";

      if (!authorizeUrl) {
        // Fallback to SessionProvider's built-in socialSignIn if the server handled redirect inline
        await socialSignIn(provider);
        return;
      }

      const browserResult = await WebBrowser.openAuthSessionAsync(
        authorizeUrl,
        redirectUri,
      );

      if (browserResult.type !== "success" || !browserResult.url) {
        if (
          browserResult.type === "cancel" ||
          browserResult.type === "dismiss"
        ) {
          throw new Error("Sign-in was cancelled.");
        }
        throw new Error(
          `Could not complete ${provider === "google" ? "Google" : "Apple"} sign-in.`,
        );
      }

      const callbackParams = parseCallbackUrlParams(browserResult.url);
      if (callbackParams.error) {
        throw new Error(callbackParams.error);
      }

      const finished = await rpc<FinishMobileOAuthResult>(
        "finishMobileOAuth",
        {
          provider,
          code: callbackParams.code ?? "",
          state: callbackParams.state ?? started.state ?? "",
          redirectUri,
          callbackUrl: browserResult.url,
        },
      );

      if (finished.twoFactorRequired) {
        setTwoFactor(true);
        throw new Error(
          "Enter your 2-step verification code to complete sign-in.",
        );
      }

      const resolvedToken =
        finished.token ?? finished.sessionToken ?? callbackParams.token ?? "";

      if (resolvedToken) {
        await persistOAuthToken(resolvedToken);
        haptic.success();
        router.replace("/");
        return;
      }

      // If `finishMobileOAuth` set cookie/session via session provider, sync via `socialSignIn`
      await socialSignIn(provider);
    },
    [persistOAuthToken, socialSignIn],
  );

  const handleOAuth = async (provider: SocialProvider) => {
    if (busy || socialBusy !== null) return;
    haptic.tap();

    const task = async () => {
      setSocialBusy(provider);
      setError(null);
      try {
        await executeMobileOAuthFlow(provider);
      } catch (err) {
        if (hasTwoFactorFlag(err)) {
          setTwoFactor(true);
        }
        const msg = errorMessage(err);
        if (!/cancel|dismiss/i.test(msg)) {
          setError(msg);
        }
      } finally {
        setSocialBusy(null);
      }
    };

    setRetryTask(() => task);
    await task();
  };

  const validateEmailPasswordForm = (): string | null => {
    if (up && name.trim().length < 2) {
      return "Choose a display name (at least 2 characters).";
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      return "Enter a valid email address.";
    }
    if (password.length < 8) {
      return "Your password needs at least 8 characters.";
    }
    if (up) {
      const verdict = judgeBirthday(birthday);
      if (verdict.kind === "young") return YOUNG_MESSAGE;
      if (verdict.kind === "invalid") return verdict.message;
    }
    return null;
  };

  const handleEmailOrTwoFactorSubmit = async () => {
    if (twoFactor) {
      const cleanCode = authCode.trim();
      if (!cleanCode) {
        setError(
          useBackupCode
            ? "Enter one of your single-use backup codes."
            : "Enter the 6-digit code from your authenticator app.",
        );
        setRetryTask(null);
        return;
      }

      const task = async () => {
        setBusy(true);
        setError(null);
        try {
          await verifyTwoFactor(cleanCode, useBackupCode);
          haptic.success();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      };

      setRetryTask(() => task);
      await task();
      return;
    }

    const validationError = validateEmailPasswordForm();
    if (validationError) {
      setError(validationError);
      setRetryTask(null);
      return;
    }

    const task = async () => {
      setBusy(true);
      setError(null);
      try {
        const verdict = judgeBirthday(birthday);
        if (up && verdict.kind === "ok") {
          await signUp(name.trim(), email.trim(), password, {
            year: verdict.year,
            month: verdict.month,
            day: verdict.day,
          });
        } else {
          await signIn(email.trim(), password);
        }
        haptic.success();
      } catch (err) {
        if (hasTwoFactorFlag(err)) {
          setTwoFactor(true);
        }
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    };

    setRetryTask(() => task);
    await task();
  };

  const handleEmailOtpSubmit = async () => {
    const cleanEmail = email.trim();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setError("Enter a valid email address to receive your sign-in code.");
      setRetryTask(null);
      return;
    }
    if (emailOtpSent && emailOtpCode.trim().length < 4) {
      setError("Enter the verification code sent to your email.");
      setRetryTask(null);
      return;
    }

    const task = async () => {
      setBusy(true);
      setError(null);
      try {
        if (!emailOtpSent) {
          await rpc<EmailOtpSendResult>("sendEmailCode", { email: cleanEmail });
          setEmailOtpSent(true);
          haptic.success();
        } else {
          const verified = await rpc<EmailOtpVerifyResult>("verifyEmailCode", {
            email: cleanEmail,
            code: emailOtpCode.trim(),
          });
          if (verified.twoFactorRequired) {
            setTwoFactor(true);
            return;
          }
          const resolvedToken = verified.token ?? verified.sessionToken ?? "";
          if (resolvedToken) {
            await persistOAuthToken(resolvedToken);
            haptic.success();
            router.replace("/");
          }
        }
      } catch (err) {
        if (hasTwoFactorFlag(err)) {
          setTwoFactor(true);
        }
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    };

    setRetryTask(() => task);
    await task();
  };

  const handlePhoneOtpSubmit = async () => {
    const cleanPhone = phone.trim();
    if (cleanPhone.length < 7) {
      setError("Enter your phone number with country code (e.g. +16045551234).");
      setRetryTask(null);
      return;
    }
    if (phoneSent && phoneCode.trim().length < 4) {
      setError("Enter the 6-digit SMS code sent to your phone.");
      setRetryTask(null);
      return;
    }

    const task = async () => {
      setBusy(true);
      setError(null);
      try {
        if (!phoneSent) {
          await sendPhoneCode(cleanPhone);
          setPhoneSent(true);
          haptic.success();
        } else {
          await verifyPhoneCode(cleanPhone, phoneCode.trim());
          haptic.success();
        }
      } catch (err) {
        if (hasTwoFactorFlag(err)) {
          setTwoFactor(true);
          setAuthMethod("email");
        }
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    };

    setRetryTask(() => task);
    await task();
  };

  const handleSendPasswordReset = async () => {
    const cleanResetEmail = resetEmail.trim();
    if (!EMAIL_REGEX.test(cleanResetEmail)) {
      setResetError("Enter the email address you signed up with.");
      return;
    }
    setResetState("sending");
    setResetError(null);
    try {
      await requestPasswordReset(cleanResetEmail);
      setResetState("sent");
    } catch (err) {
      setResetError(errorMessage(err));
      setResetState("idle");
    }
  };

  const switchMode = (next: AuthMode) => {
    haptic.tap();
    setTwoFactor(false);
    setMode(next);
    setError(null);
    setRetryTask(null);
  };

  const switchMethod = (next: AuthMethod) => {
    haptic.tap();
    setAuthMethod(next);
    setError(null);
    setRetryTask(null);
  };

  const openLegalPage = (path: string) => {
    void WebBrowser.openBrowserAsync(`${apiBaseUrl()}${path}`);
  };

  return (
    <Screen padded={false}>
      <StepHeader
        onBack={
          router.canGoBack()
            ? () => router.back()
            : () => router.replace("/welcome")
        }
        step={up ? 1 : undefined}
      />

      {/* Top Headline & Subtitle */}
      <Appear
        style={{
          alignItems: "center",
          paddingHorizontal: space.xl,
          gap: 6,
          marginTop: up ? 8 : 14,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
          accessible
          accessibilityRole="header"
          accessibilityLabel={
            twoFactor
              ? "Verify Identity"
              : up
                ? "Create Your Account"
                : "Welcome Back"
          }
        >
          <Txt
            style={{
              fontFamily: font.heavy,
              fontSize: 30,
              lineHeight: 36,
              letterSpacing: -0.7,
              color: theme.ink,
            }}
          >
            {twoFactor ? "Verify " : up ? "Create Your " : "Welcome "}
          </Txt>
          <GradientWord
            text={twoFactor ? "Identity" : up ? "Account" : "Back"}
            size={30}
            colors={VIOLET_GRADIENT}
          />
        </View>
        <Txt
          style={{
            textAlign: "center",
            fontFamily: font.regular,
            fontSize: 14.5,
            lineHeight: 20,
            color: theme.muted,
            maxWidth: 340,
          }}
        >
          {twoFactor
            ? "Enter the 6-digit code from your authenticator app or a backup code to finish signing in."
            : up
              ? "Your world. Your people. Join communities, chat, create and belong."
              : "Sign in with Google, Apple, email, or phone to jump back into your communities."}
        </Txt>
      </Appear>

      <Appear index={1} style={{ padding: space.lg, gap: space.md }}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
            shadow.card,
          ]}
        >
          {/* Mode Switcher: Create Account vs Log In */}
          <FilterPills
            layout="fill"
            inset={0}
            items={[
              { key: "up", label: "Create account", icon: "sparkles" },
              { key: "in", label: "Log In", icon: "log-in-outline" },
            ]}
            value={mode}
            onChange={(k) => switchMode(k as AuthMode)}
          />

          {/* Auth Method Selector: Email Password · Email OTP · Phone SMS */}
          {!twoFactor ? (
            <View
              style={[
                styles.methodBar,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: theme.border,
                },
              ]}
            >
              {(
                [
                  {
                    key: "email" as const,
                    label: "Password",
                    icon: "mail-outline" as const,
                  },
                  {
                    key: "emailOtp" as const,
                    label: "Email OTP",
                    icon: "keypad-outline" as const,
                  },
                  ...(phoneSupported
                    ? [
                        {
                          key: "phone" as const,
                          label: "Phone SMS",
                          icon: "call-outline" as const,
                        },
                      ]
                    : []),
                ] as const
              ).map((item) => {
                const active = authMethod === item.key;
                return (
                  <PressableScale
                    key={item.key}
                    onPress={() => switchMethod(item.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={item.label}
                    scaleTo={0.97}
                    style={[
                      styles.methodTab,
                      active && {
                        backgroundColor: theme.surface,
                        ...shadow.card,
                      },
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={14}
                      color={active ? theme.violet : theme.muted}
                    />
                    <Txt
                      style={{
                        fontFamily: active ? font.bold : font.semibold,
                        fontSize: 12.5,
                        color: active ? theme.ink : theme.muted,
                      }}
                    >
                      {item.label}
                    </Txt>
                  </PressableScale>
                );
              })}
            </View>
          ) : null}

          {/* Friendly Error State with One-Tap Retry */}
          {error ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={[
                styles.errorBox,
                {
                  backgroundColor: theme.tints.red,
                  borderColor: theme.danger,
                },
              ]}
            >
              <Ionicons name="alert-circle" size={20} color={theme.danger} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt
                  style={{
                    fontFamily: font.bold,
                    fontSize: 13,
                    lineHeight: 17,
                    color: theme.danger,
                  }}
                >
                  Couldn’t complete sign-in
                </Txt>
                <Txt
                  style={{
                    fontFamily: font.regular,
                    fontSize: 12.5,
                    lineHeight: 17,
                    color: theme.ink,
                  }}
                >
                  {error}
                </Txt>
              </View>
              {retryTask ? (
                <PressableScale
                  onPress={() => void retryTask()}
                  disabled={busy || socialBusy !== null}
                  accessibilityRole="button"
                  accessibilityLabel="Retry last sign-in attempt"
                  scaleTo={0.94}
                  style={[
                    styles.retryPill,
                    { backgroundColor: theme.danger },
                  ]}
                >
                  <Ionicons name="refresh" size={13} color="#FFFFFF" />
                  <Txt
                    style={{
                      fontFamily: font.bold,
                      fontSize: 12,
                      color: "#FFFFFF",
                    }}
                  >
                    Retry
                  </Txt>
                </PressableScale>
              ) : null}
            </View>
          ) : null}

          {/* Active Auth Form: 2FA vs Email OTP vs Phone OTP vs Email/Password */}
          {twoFactor ? (
            <View style={{ gap: space.md }}>
              <Field
                label={useBackupCode ? "Backup code" : "Authenticator code"}
                value={authCode}
                onChangeText={setAuthCode}
                keyboardType={useBackupCode ? "default" : "number-pad"}
                maxLength={useBackupCode ? 32 : 6}
                autoComplete="one-time-code"
                placeholder={
                  useBackupCode ? "Single-use backup code" : "6-digit code"
                }
                autoFocus
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  small
                  variant="secondary"
                  label={
                    useBackupCode
                      ? "Use authenticator code"
                      : "Use a backup code"
                  }
                  onPress={() => {
                    setUseBackupCode(!useBackupCode);
                    setAuthCode("");
                    setError(null);
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  small
                  variant="ghost"
                  label="Back"
                  onPress={() => {
                    setTwoFactor(false);
                    setAuthCode("");
                    setError(null);
                  }}
                />
              </View>
              <GradientButton
                label="Verify & Continue"
                gradient="hero"
                size="lg"
                iconRight="arrow-forward"
                full
                busy={busy}
                onPress={() => void handleEmailOrTwoFactorSubmit()}
              />
            </View>
          ) : authMethod === "emailOtp" ? (
            <View style={{ gap: space.md }}>
              <Field
                label="Email address"
                value={email}
                onChangeText={(val) => {
                  setEmail(val);
                  if (emailOtpSent) setEmailOtpSent(false);
                }}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                hint="We’ll send a one-time verification code to your inbox."
              />
              {emailOtpSent ? (
                <Field
                  label="Email verification code"
                  value={emailOtpCode}
                  onChangeText={setEmailOtpCode}
                  keyboardType="number-pad"
                  maxLength={8}
                  autoComplete="one-time-code"
                  placeholder="Enter code from email"
                  autoFocus
                />
              ) : null}
              <GradientButton
                label={emailOtpSent ? "Verify Email Code" : "Send Email Code"}
                gradient="hero"
                size="lg"
                iconRight="arrow-forward"
                full
                busy={busy}
                onPress={() => void handleEmailOtpSubmit()}
              />
              {emailOtpSent ? (
                <Pressable
                  onPress={() => {
                    setEmailOtpSent(false);
                    setEmailOtpCode("");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Send a new email code"
                  style={{ alignSelf: "center", paddingVertical: 4 }}
                >
                  <Txt
                    variant="small"
                    tone="accent"
                    style={{ fontFamily: font.bold }}
                  >
                    Didn’t get it? Send a new code
                  </Txt>
                </Pressable>
              ) : null}
            </View>
          ) : authMethod === "phone" ? (
            <View style={{ gap: space.md }}>
              <Field
                label="Phone number"
                value={phone}
                onChangeText={(val) => {
                  setPhone(val);
                  if (phoneSent) setPhoneSent(false);
                }}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder="+1 604 555 1234"
                hint="Include your country code (for example +1)."
              />
              {phoneSent ? (
                <Field
                  label="SMS verification code"
                  value={phoneCode}
                  onChangeText={setPhoneCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="6-digit SMS code"
                  autoFocus
                />
              ) : null}
              <GradientButton
                label={phoneSent ? "Verify SMS Code" : "Send SMS Code"}
                gradient="hero"
                size="lg"
                iconRight="arrow-forward"
                full
                busy={busy}
                onPress={() => void handlePhoneOtpSubmit()}
              />
              {phoneSent ? (
                <Pressable
                  onPress={() => {
                    setPhoneSent(false);
                    setPhoneCode("");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Change phone number or resend SMS code"
                  style={{ alignSelf: "center", paddingVertical: 4 }}
                >
                  <Txt
                    variant="small"
                    tone="accent"
                    style={{ fontFamily: font.bold }}
                  >
                    Resend SMS code
                  </Txt>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              {up ? (
                <Field
                  label="Display name"
                  value={name}
                  onChangeText={setName}
                  autoComplete="nickname"
                  maxLength={40}
                  placeholder="What should we call you?"
                />
              ) : null}

              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
              />

              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete={up ? "new-password" : "current-password"}
                placeholder="At least 8 characters"
              />

              {!up ? (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: -6,
                  }}
                >
                  <Pressable
                    onPress={() => switchMethod("emailOtp")}
                    accessibilityRole="button"
                    accessibilityLabel="Sign in with a one-time email code instead"
                    hitSlop={10}
                  >
                    <Txt
                      variant="small"
                      tone="muted"
                      style={{ fontFamily: font.semibold }}
                    >
                      Use email code instead
                    </Txt>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setResetEmail(email);
                      setResetState("idle");
                      setResetError(null);
                      setResetOpen(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Forgot your password?"
                    hitSlop={10}
                  >
                    <Txt
                      variant="small"
                      tone="accent"
                      style={{ fontFamily: font.bold }}
                    >
                      Forgot password?
                    </Txt>
                  </Pressable>
                </View>
              ) : null}

              {up ? (
                <BirthdayFields value={birthday} onChange={setBirthday} />
              ) : null}

              <GradientButton
                label={up ? "Get Started" : "Log In"}
                gradient="hero"
                size="lg"
                iconRight="arrow-forward"
                full
                busy={busy}
                onPress={() => void handleEmailOrTwoFactorSubmit()}
              />
            </View>
          )}

          {/* OAuth Section: Continue with Google & Continue with Apple */}
          {!twoFactor ? (
            <>
              <View style={styles.dividerRow}>
                <View
                  style={[styles.dividerLine, { backgroundColor: theme.border }]}
                />
                <Txt
                  style={{
                    fontFamily: font.semibold,
                    fontSize: 12,
                    color: theme.subtle,
                  }}
                >
                  or continue with
                </Txt>
                <View
                  style={[styles.dividerLine, { backgroundColor: theme.border }]}
                />
              </View>

              <View style={{ gap: 10 }}>
                <PressableScale
                  onPress={() => void handleOAuth("google")}
                  disabled={busy || socialBusy !== null}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                  scaleTo={0.98}
                  style={[
                    styles.oauthPill,
                    {
                      backgroundColor: theme.dark ? "#1B1833" : "#151326",
                      borderColor: theme.dark
                        ? "rgba(167, 139, 250, 0.28)"
                        : "#282447",
                    },
                  ]}
                >
                  <View style={styles.oauthIconLeft}>
                    {socialBusy === "google" ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <GoogleGIcon size={20} />
                    )}
                  </View>
                  <Txt style={styles.oauthPillText}>Continue with Google</Txt>
                </PressableScale>

                <PressableScale
                  onPress={() => void handleOAuth("apple")}
                  disabled={busy || socialBusy !== null}
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Apple"
                  scaleTo={0.98}
                  style={[
                    styles.oauthPill,
                    {
                      backgroundColor: theme.dark ? "#1B1833" : "#151326",
                      borderColor: theme.dark
                        ? "rgba(167, 139, 250, 0.28)"
                        : "#282447",
                    },
                  ]}
                >
                  <View style={styles.oauthIconLeft}>
                    {socialBusy === "apple" ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Ionicons name="logo-apple" size={22} color="#FFFFFF" />
                    )}
                  </View>
                  <Txt style={styles.oauthPillText}>Continue with Apple</Txt>
                </PressableScale>
              </View>
            </>
          ) : null}

          <Txt
            variant="caption"
            tone="subtle"
            style={{ textAlign: "center", marginTop: 2 }}
          >
            By continuing you agree to the{" "}
            <Txt
              variant="caption"
              tone="accent"
              onPress={() => openLegalPage("/terms")}
            >
              Terms
            </Txt>{" "}
            and{" "}
            <Txt
              variant="caption"
              tone="accent"
              onPress={() => openLegalPage("/privacy")}
            >
              Privacy Policy
            </Txt>
            .
          </Txt>
        </View>
      </Appear>

      {/* Footer Mode Switch ("Already have an account? Log In") */}
      <View style={styles.footerRow}>
        <Txt
          style={{
            fontFamily: font.regular,
            fontSize: 14.5,
            color: theme.muted,
          }}
        >
          {up ? "Already have an account? " : "New to Kamino? "}
        </Txt>
        <PressableScale
          onPress={() => switchMode(up ? "in" : "up")}
          accessibilityRole="button"
          accessibilityLabel={
            up
              ? "Already have an account? Log In"
              : "New to Kamino? Create an account"
          }
          hitSlop={10}
          scaleTo={0.95}
        >
          <LinearGradient
            colors={theme.gradHero}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.footerBadge}
          >
            <Txt
              style={{
                fontFamily: font.heavy,
                fontSize: 14,
                color: "#FFFFFF",
              }}
            >
              {up ? "Log In" : "Get Started"}
            </Txt>
          </LinearGradient>
        </PressableScale>
      </View>

      {/* Password Reset Sheet */}
      <Sheet
        visible={resetOpen}
        title="Reset your password"
        onClose={() => setResetOpen(false)}
      >
        {resetState === "sent" ? (
          <>
            <Txt>
              If an account exists for {resetEmail.trim()}, we’ve sent a link to
              choose a new password. It works for one hour.
            </Txt>
            <GradientButton
              label="Done"
              gradient="hero"
              size="lg"
              full
              onPress={() => setResetOpen(false)}
            />
          </>
        ) : (
          <>
            <Txt tone="muted">
              Enter your email and we’ll send you a reset link.
            </Txt>
            <Field
              label="Email"
              value={resetEmail}
              onChangeText={setResetEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              error={resetError}
            />
            <GradientButton
              label="Send reset link"
              gradient="hero"
              size="lg"
              full
              busy={resetState === "sending"}
              onPress={() => void handleSendPasswordReset()}
            />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

/**
 * Multi-color Google "G" SVG icon matching Mockup 1.
 */
function GoogleGIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: space.lg,
    gap: space.md,
  },
  methodBar: {
    flexDirection: "row",
    borderRadius: radius.pill,
    padding: 4,
    borderWidth: 1,
    gap: 4,
  },
  methodTab: {
    flex: 1,
    height: 36,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.tile,
    borderWidth: 1,
  },
  retryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: radius.pill,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  oauthPill: {
    height: 50,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  oauthIconLeft: {
    position: "absolute",
    left: 18,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  oauthPillText: {
    fontFamily: font.bold,
    fontSize: 15,
    lineHeight: 20,
    color: "#FFFFFF",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  footerBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
});
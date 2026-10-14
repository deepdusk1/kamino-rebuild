import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSession } from "@/auth/session";
import { BirthdayFields, EMPTY_BIRTHDAY, judgeBirthday, YOUNG_MESSAGE } from "@/components/BirthdayFields";
import { GradientWord, VIOLET_GRADIENT } from "@/components/home/Decor";
import { StepHeader } from "@/components/home/StepHeader";
import { GradientButton } from "@/components/k";
import { Appear, Screen, Txt } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { font, radius, shadow, space, useTheme } from "@/theme";

/**
 * Onboarding step 1 (part two): shown to a signed-in person who has not passed the 18+ birthday check yet
 * (for example an account created before the check existed, or through another sign-in method).
 */
export default function AgeCheck() {
  const theme = useTheme();
  const { confirmAge, signOut } = useSession();
  const [birthday, setBirthday] = useState(EMPTY_BIRTHDAY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const verdict = judgeBirthday(birthday);
    if (verdict.kind === "invalid") return setError(verdict.message);
    setBusy(true);
    setError(null);
    try {
      // Under-18 answers are sent too: the server then erases the account instead of keeping it.
      const allowed = await confirmAge({ year: Number(birthday.year), month: Number(birthday.month), day: Number(birthday.day) });
      if (!allowed) setError(YOUNG_MESSAGE);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <StepHeader step={1} />
      <Appear style={{ alignItems: "center", paddingHorizontal: space.xl, gap: 6, marginTop: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }} accessible accessibilityRole="header" accessibilityLabel="One Quick Thing">
          <Txt style={{ fontFamily: font.heavy, fontSize: 32, lineHeight: 38, letterSpacing: -0.8, color: theme.ink }}>One Quick </Txt>
          <GradientWord text="Thing" size={32} colors={VIOLET_GRADIENT} />
        </View>
        <Txt style={{ textAlign: "center", fontFamily: font.regular, fontSize: 15, lineHeight: 20, color: theme.muted, maxWidth: 320 }}>
          Kamino is for adults aged 18 and over. Tell us your birthday to continue.
        </Txt>
      </Appear>
      <Appear index={1} style={{ padding: space.lg }}>
        <View style={[{ backgroundColor: theme.surface, borderRadius: radius.card, borderWidth: 1, borderColor: theme.border, padding: space.lg, gap: space.lg }, shadow.card]}>
          <BirthdayFields value={birthday} onChange={setBirthday} />
          {error ? <Txt tone="danger" accessibilityLiveRegion="polite">{error}</Txt> : null}
          <GradientButton label="Continue" gradient="hero" size="lg" iconRight="arrow-forward" full busy={busy} onPress={() => void submit()} />
        </View>
      </Appear>
      <Pressable onPress={() => void signOut()} accessibilityRole="button" accessibilityLabel="Sign out" style={{ alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}>
        <Txt style={{ fontFamily: font.semibold, fontSize: 15, lineHeight: 20, color: theme.accent }}>Sign out</Txt>
      </Pressable>
    </Screen>
  );
}

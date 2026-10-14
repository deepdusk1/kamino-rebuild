import { useState } from "react";
import { FormError } from "@/components/home/auth-ui";
import { GradientButton } from "@/components/k";
import { signOut } from "@/lib/auth/client";
import { confirmMinimumAge } from "@/lib/kamino/extras";
import { BirthdayFields, EMPTY_BIRTHDAY, judgeBirthday, YOUNG_MESSAGE, type Birthday } from "./birthday-fields";

/**
 * Shown over the app to a signed-in person who has not passed the 18+ birthday check yet
 * (for example, someone who signed up with a social account, which skips our sign-up form).
 */
export function AgeGate({ onDone }: { onDone: () => void }) {
  const [birthday, setBirthday] = useState<Birthday>(EMPTY_BIRTHDAY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const verdict = judgeBirthday(birthday);
    if (verdict.kind === "invalid") return setError(verdict.message);
    setBusy(true);
    setError("");
    try {
      // Under-13 answers are sent too: the server then erases the account instead of keeping it.
      const answer = await confirmMinimumAge({ data: { year: Number(birthday.year), month: Number(birthday.month), day: Number(birthday.day) } });
      if (!answer.ok) {
        setError(YOUNG_MESSAGE);
        await signOut().catch(() => undefined);
        return;
      }
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[rgba(15,11,42,0.55)] p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
    >
      <form className="k-card flex w-full max-w-[400px] flex-col gap-4 p-6 shadow-lift" onSubmit={submit}>
        <span className="grid size-14 place-items-center self-center rounded-full bg-tint-violet text-[28px]" aria-hidden>
          🎂
        </span>
        <div className="text-center">
          <h2 id="age-gate-title" className="text-[24px] leading-tight font-extrabold tracking-[-0.5px] text-ink">
            One quick thing
          </h2>
          <p className="mt-1.5 text-[15px] leading-[1.45] text-muted">
            Kamino is for adults aged 18 and over. Tell us your birthday to continue.
          </p>
        </div>
        <BirthdayFields value={birthday} onChange={setBirthday} />
        {error && <FormError>{error}</FormError>}
        <GradientButton type="submit" gradient="hero" size="lg" full arrow disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </GradientButton>
      </form>
    </div>
  );
}

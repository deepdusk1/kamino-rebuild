import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthCard, AuthFrame, AuthTitle, Field, FormError } from "@/components/home/auth-ui";
import { StepHeader } from "@/components/home/step-header";
import { GradientButton } from "@/components/k";
import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
    error: typeof search.error === "string" ? search.error : "",
  }),
  head: () => ({ meta: [{ title: "Choose a new password · Kamino" }] }),
  component: ResetPassword,
});

/** Opened from the reset email: choose a new password. */
function ResetPassword() {
  const { token, error: linkError } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await authClient.resetPassword({ newPassword: password, token });
      if (r.error) throw new Error(r.error.message ?? "Could not change the password.");
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const invalid = !token || Boolean(linkError);
  return (
    <AuthFrame>
      <main id="main">
        <StepHeader back="/login" />
        <div className="relative mx-auto w-full max-w-[480px] px-4 lg:pt-6">
          <AuthTitle
            lead="Choose a New "
            highlight="Password"
            text="Pick something you haven't used before, at least 8 characters."
            className="mt-5"
          />
          <AuthCard className="mt-4">
            {done ? (
              <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
                <span className="grid size-14 place-items-center rounded-full bg-tint-green text-[28px]" aria-hidden>
                  ✅
                </span>
                <p className="text-[17px] font-extrabold text-ink">Password changed</p>
                <p className="text-[15px] leading-[1.45] text-muted">
                  You can now sign in from the app or the website.
                </p>
                <GradientButton to="/login" gradient="hero" size="lg" arrow full className="mt-1">
                  Sign in
                </GradientButton>
              </div>
            ) : invalid ? (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <span className="grid size-14 place-items-center rounded-full bg-tint-orange text-[28px]" aria-hidden>
                  ⏳
                </span>
                <p className="text-[17px] font-extrabold text-ink">This link has expired</p>
                <p className="text-[15px] leading-[1.45] text-muted">
                  The reset link is missing or too old.{" "}
                  <Link to="/forgot-password" className="k-focus font-bold text-violet hover:underline">
                    Ask for a new one
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={submit}>
                <Field
                  label="New password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
                {error && <FormError>{error}</FormError>}
                <GradientButton type="submit" gradient="hero" size="lg" arrow full disabled={busy}>
                  {busy ? "Saving…" : "Save password"}
                </GradientButton>
              </form>
            )}
          </AuthCard>
        </div>
      </main>
    </AuthFrame>
  );
}

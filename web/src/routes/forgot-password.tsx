import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AuthCard, AuthFrame, AuthTitle, Field, FormError } from "@/components/home/auth-ui";
import { StepHeader } from "@/components/home/step-header";
import { GradientButton } from "@/components/k";
import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Reset your password · Kamino" }] }),
  component: ForgotPassword,
});

/** "Forgot your password?": asks for the email and sends a reset link. */
function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      // The server answers the same way whether or not the address exists.
      if (r.error) throw new Error(r.error.message ?? "Could not send the email.");
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <main id="main">
        <StepHeader back="/login" />
        <div className="relative mx-auto w-full max-w-[480px] px-4 lg:pt-6">
          <AuthTitle
            lead="Reset Your "
            highlight="Password"
            text="Enter your account email and we'll send you a link to choose a new password."
            className="mt-5"
          />
          <AuthCard className="mt-4">
            {sent ? (
              <div className="flex flex-col items-center gap-3 py-2 text-center" role="status">
                <span className="grid size-14 place-items-center rounded-full bg-tint-violet text-[28px]" aria-hidden>
                  ✉️
                </span>
                <p className="text-[17px] font-extrabold text-ink">Check your inbox</p>
                <p className="text-[15px] leading-[1.45] text-muted">
                  If an account exists for <strong className="text-ink">{email}</strong>, a reset link is on its way. It
                  works for one hour.
                </p>
                <GradientButton to="/login" gradient="hero" size="lg" full className="mt-1">
                  Back to sign in
                </GradientButton>
              </div>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={submit}>
                <Field
                  label="Email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                {error && <FormError>{error}</FormError>}
                <GradientButton type="submit" gradient="hero" size="lg" arrow full disabled={busy}>
                  {busy ? "Sending…" : "Send reset link"}
                </GradientButton>
              </form>
            )}
          </AuthCard>
        </div>
      </main>
    </AuthFrame>
  );
}

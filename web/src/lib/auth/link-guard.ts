/**
 * Stops "pre-registration" account takeover.
 *
 * Someone could sign up with email + password using *your* address (they can't confirm it, so it stays
 * unverified). If you later sign in with Google or Apple, Better Auth would attach your Google/Apple login to that
 * account and mark the email confirmed, and their password would then open your account. So a Google/Apple login is
 * never attached to an account that has a password but an unconfirmed email. The person sees "sign in with your
 * email first" instead (`unable_to_link_account`).
 */
export const SOCIAL_PROVIDERS_TO_GUARD = ["google", "apple"];

export function blocksSocialLink(input: { providerId: string; emailVerified: boolean; hasPassword: boolean }): boolean {
  return SOCIAL_PROVIDERS_TO_GUARD.includes(input.providerId) && input.hasPassword && !input.emailVerified;
}

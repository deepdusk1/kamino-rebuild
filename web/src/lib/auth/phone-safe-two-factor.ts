import { twoFactor } from 'better-auth/plugins';

/** Better Auth's default challenge covers password phone sign-in; also cover possession-only OTP verification. */
export function phoneSafeTwoFactor() {
  const plugin = twoFactor({ issuer: 'Kamino' });
  return { ...plugin, hooks: { ...plugin.hooks, after: plugin.hooks.after.map(hook => ({
    ...hook,
    matcher: (context: Parameters<typeof hook.matcher>[0]) => context.path === '/phone-number/verify' || hook.matcher(context),
  })) } };
}

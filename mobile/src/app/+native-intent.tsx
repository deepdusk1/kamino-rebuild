import { isAuthReturnLink } from "@/auth/oauth-return";

/**
 * Links that open the app go through here before the router sees them.
 *
 * The Google/Apple sign-in browser and the human-check page return to `kamino://auth-complete` and
 * `kamino://captcha-complete`. They are not screens: the sign-in code reads them (see src/auth/oauth.ts). On Android
 * the router would otherwise also try to open them and show "This screen doesn't exist" over the sign-in screen.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    if (isAuthReturnLink(path)) return initial ? "/" : null;
    return path;
  } catch {
    return initial ? "/" : null;
  }
}

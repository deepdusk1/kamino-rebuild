/** Restrict post-sign-in navigation to app paths; reject schemes, protocol-relative URLs and parser ambiguity. */
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || Array.from(value).some(char => char.charCodeAt(0) <= 32 || char === '\\')) return '/';
  try {
    const url = new URL(value, 'https://kamino.invalid');
    return url.origin === 'https://kamino.invalid' ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch { return '/'; }
}

import { en, type Catalog, type CatalogKey } from "./en.ts";
import { es } from "./es.ts";

export type { Catalog, CatalogKey };

export type Locale = string;

export type LocaleMeta = { name: string; rtl?: boolean };

/** Locales the interface can be served in (metadata); catalogs decide actual coverage. */
export const LOCALES: Record<Locale, LocaleMeta> = {
  en: { name: "English" },
  es: { name: "Español" },
  // Recognised profile languages without a catalog yet: they fall back to English per key.
  fr: { name: "Français" },
  de: { name: "Deutsch" },
  pt: { name: "Português" },
  ja: { name: "日本語" },
  ko: { name: "한국어" },
  zh: { name: "中文" },
  hi: { name: "हिन्दी" },
  ar: { name: "العربية", rtl: true },
};

const CATALOGS: Record<Locale, Catalog | undefined> = { en, es };

export const DEFAULT_LOCALE = "en";
export const LOCALE_COOKIE = "kamino.locale";

/** Locales with a real catalog, for pickers. */
export function availableLocales(): Locale[] {
  return Object.keys(CATALOGS).filter((locale) => CATALOGS[locale]);
}

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return !!value && /^[a-z]{2}$/.test(value) && value in LOCALES;
}

/** RTL only switches on once the locale actually has a catalog, so direction always matches text. */
export function isRtl(locale: Locale): boolean {
  return !!LOCALES[locale]?.rtl && !!CATALOGS[locale];
}

/** Replaces `{name}` placeholders. Unknown placeholders stay visible so mistakes are loud. */
export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

export function translate(
  locale: Locale,
  key: CatalogKey,
  vars?: Record<string, string | number>,
): string {
  const catalog = CATALOGS[locale] ?? (locale === DEFAULT_LOCALE ? undefined : CATALOGS[DEFAULT_LOCALE]);
  const template = (catalog ?? en)[key] ?? en[key];
  return format(template, vars);
}

/** Reads the locale cookie (works on the server via request headers, in the browser via document.cookie). */
export function readLocaleCookie(cookieHeader?: string | null): Locale {
  const source =
    cookieHeader ??
    (typeof document !== "undefined" ? document.cookie : undefined);
  if (!source) return DEFAULT_LOCALE;
  const match = source
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  const value = match?.slice(LOCALE_COOKIE.length + 1);
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

/** Persists the chosen locale for a year and returns immediately (callers reload). */
export function writeLocaleCookie(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
}

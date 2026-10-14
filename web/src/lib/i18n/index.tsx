import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, isSupportedLocale, translate, type CatalogKey, type Locale } from "./core";

export * from "./core";
export type { Catalog, CatalogKey } from "./en";

const I18nContext = createContext<Locale>(DEFAULT_LOCALE);

/** Feeds the app's locale (read from the cookie by the root loader) to `useT`. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <I18nContext.Provider value={isSupportedLocale(locale) ? locale : DEFAULT_LOCALE}>
      {children}
    </I18nContext.Provider>
  );
}

/** `const t = useT(); t("login.continueWith", { provider: "Google" })` */
export function useT() {
  const locale = useContext(I18nContext);
  return (key: CatalogKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}

export function useLocale(): Locale {
  return useContext(I18nContext);
}

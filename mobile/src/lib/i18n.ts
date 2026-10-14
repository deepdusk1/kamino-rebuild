import { useQuery } from "@tanstack/react-query";
import { identityApi } from "@/lib/identity-v9";

/**
 * Interface translation for the phone app. The locale comes from the member's saved language
 * preference (their profile), so it follows them across devices; unknown keys fall back to
 * English per key. Spanish is the first catalog.
 */

export const en = {
  "nav.home": "Home",
  "nav.communities": "Communities",
  "nav.create": "Create",
  "nav.chats": "Chats",
  "nav.profile": "Profile",
  "privacy.language.title": "Language preference",
  "privacy.language.help":
    "Interface translations cover more of the app over time. Your choice also helps discovery and translation tools.",
} as const;

export type CatalogKey = keyof typeof en;
export type Catalog = Record<CatalogKey, string>;

export const es: Catalog = {
  "nav.home": "Inicio",
  "nav.communities": "Comunidades",
  "nav.create": "Crear",
  "nav.chats": "Chats",
  "nav.profile": "Perfil",
  "privacy.language.title": "Preferencia de idioma",
  "privacy.language.help":
    "La traducción de la interfaz cubre más partes de la app con el tiempo. Tu elección también ayuda a las herramientas de descubrimiento y traducción.",
};

const CATALOGS: Record<string, Catalog | undefined> = { en, es };

export function translateWith(locale: string, key: CatalogKey): string {
  return (CATALOGS[locale] ?? en)[key] ?? en[key];
}

export type Translation = (key: CatalogKey) => string;

/** Reads the member's saved language and returns `t`. Falls back to English while loading. */
export function useT(): Translation {
  const dashboard = useQuery({
    queryKey: ["identityDashboard"],
    queryFn: identityApi.dashboard,
    staleTime: 60_000,
    retry: false,
  });
  const locale = dashboard.data?.preferences.language ?? "en";
  return (key: CatalogKey) => translateWith(locale, key);
}


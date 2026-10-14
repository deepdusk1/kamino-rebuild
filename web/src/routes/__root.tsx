import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { I18nProvider, isRtl, readLocaleCookie } from "@/lib/i18n";
import { themeBootstrapScript, watchSystemTheme } from "@/lib/theme";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AuthProvider } from "@/lib/auth/provider";
import appCss from "../styles.css?url";
import { Toaster } from 'sonner';
import { useEffect, useState } from "react";
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { getIdentityDashboard } from '@/lib/kamino/identity-v9';
import { PwaProvider } from "@/components/pwa";
import { ServerEventsProvider } from "@/lib/server-events";

const APP_NAME = "Kamino";
const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { staleTime: 8_000, retry: 1, refetchOnWindowFocus: false } },
  });

/**
 * The browser keeps one query cache for the whole visit. The server must make a fresh one for every request:
 * a shared server cache would let one visitor's data be drawn into another visitor's page.
 */
let browserQueryClient: QueryClient | undefined;
function getQueryClient(): QueryClient {
  if (typeof window === "undefined") return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}

export const Route = createRootRoute({
  // The locale cookie decides the interface language; the provider below hands it to `useT`.
  loader: () => ({ locale: readLocaleCookie() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#f8f7fc" },
      {
        name: "description",
        content: "Kamino is a secured community home for fandoms: chats, wikis, polls, quizzes, and per-space personas.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  component: Root,
});

function Root() {
  const [queryClient] = useState(getQueryClient);
  const { locale } = Route.useLoaderData();
  useEffect(() => watchSystemTheme(), []);
  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"} className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Apply the saved light/dark choice before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="bg-bg text-body">
        {/* Lets the Grok preview chrome drive navigation; does nothing anywhere else. Keep it. */}
        <PreviewHostBridge />
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <I18nProvider locale={locale}>
              <PwaProvider>
                <IdentityAppearance />
                <ServerEventsProvider>
                  <Outlet />
                </ServerEventsProvider>
              <Toaster theme="system" richColors position="top-center" />
              </PwaProvider>
            </I18nProvider>
          </QueryClientProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

function IdentityAppearance() {
  const { user } = useCurrentUserState();
  const query = useQuery({ queryKey: ['identityDashboard'], queryFn: () => getIdentityDashboard(), enabled: Boolean(user), retry: false });
  useEffect(() => {
    const p = user ? query.data?.preferences : undefined;
    document.documentElement.dataset.highContrast = String(p?.highContrast ?? false);
    document.documentElement.dataset.textScale = p?.textScale ?? 'standard';
    document.documentElement.dataset.preferredLanguage = p?.language ?? 'en';
  }, [user, query.data]);
  return <style>{`
    html[data-high-contrast="true"] { --color-bg:#fff;--color-surface:#fff;--color-surface-alt:#eee;--color-body:#111;--color-ink:#000;--color-muted:#333;--color-subtle:#333;--color-border:#333;--color-accent:#5122b4;--color-violet:#5122b4;--shadow-card:none; }
    @media(prefers-color-scheme:dark) { html[data-high-contrast="true"] { --color-bg:#000;--color-surface:#000;--color-surface-alt:#171717;--color-body:#fff;--color-ink:#fff;--color-muted:#eee;--color-subtle:#eee;--color-border:#ddd;--color-accent:#cbb4ff;--color-violet:#cbb4ff; } }
    html[data-text-scale="large"] :is(p,label,input,textarea,select,button,a) { font-size:max(1em,16px);line-height:1.5; }
    html[data-text-scale="largest"] :is(p,label,input,textarea,select,button,a) { font-size:max(1em,18px);line-height:1.55; }
  `}</style>;
}

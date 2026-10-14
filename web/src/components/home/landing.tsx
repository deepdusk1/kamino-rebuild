import { Link } from "@tanstack/react-router";
import { availableLocales, LOCALES, LOCALE_COOKIE, useLocale, useT } from "@/lib/i18n";
import {
  Compass,
  Film,
  HeartHandshake,
  MessageCircle,
  Mic,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

/**
 * The marketing page signed-out visitors see on `/`. It shows what Kamino is, who it is for, and
 * routes people to the guided intro (/welcome), sign-up (/login) or straight into browsing
 * (/explore). Members never see it — they land straight in the app.
 */



export function Landing() {
  const t = useT();
  const locale = useLocale();
  const FEATURES = [
  {
    icon: <Users className="size-5" />,
    title: t("landing.feature.communities.title"),
    body: t("landing.feature.communities.body"),
  },
  {
    icon: <Film className="size-5" />,
    title: t("landing.feature.watch.title"),
    body: t("landing.feature.watch.body"),
  },
  {
    icon: <Mic className="size-5" />,
    title: t("landing.feature.live.title"),
    body: t("landing.feature.live.body"),
  },
  {
    icon: <MessageCircle className="size-5" />,
    title: t("landing.feature.chats.title"),
    body: t("landing.feature.chats.body"),
  },
  {
    icon: <Sparkles className="size-5" />,
    title: t("landing.feature.creators.title"),
    body: t("landing.feature.creators.body"),
  },
  {
    icon: <ShieldCheck className="size-5" />,
    title: t("landing.feature.safety.title"),
    body: t("landing.feature.safety.body"),
  },
];
  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-bg text-ink">
      {/* Aurora backdrop, same brand look as the app */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_20%_0%,var(--color-tint-violet),transparent),radial-gradient(50%_50%_at_85%_10%,var(--color-tint-blue),transparent)] opacity-70"
      />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link to="/" className="k-focus flex items-center gap-2 rounded-full" aria-label="Kamino home">
          <img src="/kamino-logo.svg" alt="" className="size-9 rounded-xl" />
          <span className="text-lg font-extrabold tracking-[-0.02em]">Kamino</span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            to="/explore"
            className="k-focus hidden h-10 items-center rounded-full px-4 text-[14px] font-bold text-ink hover:bg-surface-alt sm:inline-flex"
          >
            {t("landing.cta.explore")}
          </Link>
          <Link
            to="/login"
            className="k-focus inline-flex h-10 items-center rounded-full bg-grad-primary px-5 text-[14px] font-bold text-white shadow-glow"
          >
            {t("landing.cta.getStarted")}
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto max-w-6xl px-5 pb-16 pt-10 text-center sm:pt-16">
        <p className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full bg-surface px-4 py-1.5 text-xs font-extrabold tracking-[0.14em] text-violet uppercase shadow-card">
          <HeartHandshake className="size-4" aria-hidden />
          {t("landing.badge")}
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-[-0.03em] text-balance sm:text-6xl">
          {t("landing.hero.title")}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg font-medium text-muted text-pretty">
          {t("landing.hero.body")}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/login"
            className="k-focus inline-flex h-12 items-center rounded-full bg-grad-primary px-7 text-[15px] font-bold text-white shadow-glow"
          >
            {t("landing.cta.getStarted")}
          </Link>
          <Link
            to="/welcome"
            className="k-focus inline-flex h-12 items-center rounded-full bg-surface px-7 text-[15px] font-bold text-ink shadow-card"
          >
            {t("landing.cta.tour")}
          </Link>
          <Link
            to="/explore"
            className="k-focus inline-flex h-12 items-center gap-2 rounded-full px-5 text-[15px] font-bold text-ink"
          >
            <Compass className="size-5" aria-hidden />
            {t("landing.cta.browse")}
          </Link>
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 pb-20">
        <h2 className="sr-only">{t("landing.features.title")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-card border border-border bg-surface p-5 shadow-card"
            >
              <span className="mb-3 inline-grid size-10 place-items-center rounded-2xl bg-tint-violet text-violet">
                {feature.icon}
              </span>
              <h3 className="text-[15px] font-extrabold">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 pb-20">
        <div className="rounded-card border border-border bg-grad-primary p-8 text-center text-white shadow-lift sm:p-12">
          <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-balance sm:text-3xl">
            {t("landing.banner.title")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-medium text-white/85 text-pretty">
            {t("landing.banner.body")}
          </p>
          <Link
            to="/login"
            className="k-focus mt-6 inline-flex h-12 items-center rounded-full bg-white px-7 text-[15px] font-extrabold text-violet shadow-lift"
          >
            {t("landing.banner.button")}
          </Link>
        </div>
      </section>

      <footer className="relative border-t border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs font-semibold text-muted">
          <span>{t("landing.footer.rights", { year: new Date().getFullYear() })}</span>
          <nav className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-1.5">
              <span className="sr-only">{t("landing.footer.language")}</span>
              <select
                aria-label={t("landing.footer.language")}
                defaultValue={locale}
                onChange={(e) => {
                  document.cookie = `${LOCALE_COOKIE}=${e.target.value};path=/;max-age=31536000;samesite=lax`;
                  window.location.reload();
                }}
                className="k-focus rounded-full bg-bg px-3 py-1.5 text-xs font-bold text-ink"
              >
                {availableLocales().map((code) => (
                  <option key={code} value={code}>
                    {LOCALES[code]!.name}
                  </option>
                ))}
              </select>
            </label>
            <Link to="/safety" className="k-focus rounded hover:text-ink">
              {t("landing.footer.houseRules")}
            </Link>
            <Link to="/privacy" className="k-focus rounded hover:text-ink">
              {t("landing.footer.privacy")}
            </Link>
            <Link to="/terms" className="k-focus rounded hover:text-ink">
              {t("landing.footer.terms")}
            </Link>
            <Link to="/copyright" className="k-focus rounded hover:text-ink">
              {t("landing.footer.copyright")}
            </Link>
            <Link to="/child-safety" className="k-focus rounded hover:text-ink">
              {t("landing.footer.childSafety")}
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

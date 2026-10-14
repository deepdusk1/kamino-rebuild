import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/** Override with VITE_SUPPORT_EMAIL when building; defaults to the operator inbox. */
export const SUPPORT_EMAIL: string =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || "info.kelnova@gmail.com";

/** Shared frame for the privacy policy, terms and account-deletion pages. */
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <main className="doc-page">
      <article className="doc-card">
        <p>
          <Link to="/">← Kamino</Link>
        </p>
        <h1>{title}</h1>
        {updated && <p>Last updated {updated}</p>}
        {children}
        <p style={{ marginTop: 28 }}>
          Questions? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </article>
    </main>
  );
}

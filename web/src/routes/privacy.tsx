import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, SUPPORT_EMAIL } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="October 5, 2026">
      <p>
        Kamino is operated by <strong>Kelnova Labs</strong>, located in Kelowna, British Columbia,
        Canada (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We handle your personal information under
        Canadian privacy law (PIPEDA and, for British Columbia, PIPA). This page explains, in
        plain language, what we collect, why, who sees it, and the choices you have. Questions or
        requests: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> email address, chosen username, display name and a password (stored only as a one-way hash).</li>
        <li><strong>What you create:</strong> profile information, posts, comments, polls, quiz answers, stories, chat messages, pictures, voice notes and videos you share.</li>
        <li><strong>Activity that powers the app:</strong> communities joined, follows, blocks, reports, notifications, reputation, streaks and achievements.</li>
        <li><strong>Age:</strong> the birthday you enter at sign-up is used once to confirm you are 18 or older and is then discarded — it is not stored. Independent document checks (when enabled) are performed by our verification provider; we receive only a verified result, never the document.</li>
        <li><strong>Device and delivery data:</strong> your push-notification address (only if you allow notifications), sign-in device names and session times for the security screen.</li>
        <li><strong>Payment data:</strong> handled entirely by Stripe; we store only an order record, its status and pseudonymised accounting identifiers. We never see your full card number.</li>
      </ul>

      <h2>2. What we do not do</h2>
      <ul>
        <li>We do not show advertising and we do not sell your personal information.</li>
        <li>We do not track you across other apps or websites.</li>
        <li>People do not read your private messages. Automated safety checks scan shared content — direct messages included — for illegal or dangerous material; if something is held, a human reviews a short excerpt to decide. A person always makes the final decision about your account.</li>
      </ul>

      <h2>3. Why we use your information</h2>
      <ul>
        <li>To provide the Service you asked for (accounts, communities, messaging, content).</li>
        <li>To keep members safe (moderation, enforcement, age gating) and to comply with the law (accounting records, lawful requests).</li>
        <li>To communicate with you (security notices, notification preferences you control). We send no marketing email by default.</li>
      </ul>

      <h2>4. Who can see what</h2>
      <p>
        Posts in public communities are visible to anyone. Private communities, direct messages and
        private rooms are visible only to their members. You control follower-list visibility,
        mention permissions, search visibility and more from the privacy dashboard. Blocking someone
        hides their content from you.
      </p>

      <h2>5. Service providers (who processes what for us)</h2>
      <p>
        We use a short list of specialist companies, each processing only what its job requires,
        under contract:
      </p>
      <ul>
        <li><strong>Hosting and database:</strong> our hosting provider (for example Render) and our database provider (for example Neon) store the Service and its data.</li>
        <li><strong>Payments and identity:</strong> Stripe processes payments, subscriptions and — if you choose it — independent age verification.</li>
        <li><strong>Email:</strong> Resend delivers transactional email (confirmation, password reset, optional digests).</li>
        <li><strong>SMS:</strong> Twilio Verify delivers phone sign-in codes, if phone sign-in is enabled.</li>
        <li><strong>Push delivery:</strong> Apple and Google (through Expo&apos;s push service) deliver notifications you have allowed.</li>
        <li><strong>AI safety and features:</strong> if enabled, content you share is sent to AI providers (OpenAI for moderation checks; a storytelling model for role-play scenes) for that job only. They receive the content needed, not your email address, and process it under their own terms. We use them for no advertising or profiling.</li>
        <li><strong>Object storage:</strong> your uploaded media may be stored in a private S3-compatible bucket.</li>
      </ul>

      <h2>6. Payments and financial records</h2>
      <p>
        Order and accounting records are retained in pseudonymised form as accounting law requires,
        even after an account is deleted. Refunded or charged-back creator earnings are reversed or
        offset as described in the <a href="/terms">Terms of Use</a>.
      </p>

      <h2>7. How long we keep things</h2>
      <ul>
        <li>Your content stays until you delete it or delete your account.</li>
        <li>Deleting your account removes your profile, posts, comments, messages, follows and notifications, and stages removal of uploaded media files (retried until the storage provider confirms).</li>
        <li>What may remain: pseudonymised accounting records the law requires, moderation entries that protect other members (such as a strike record without your content), and entries already included in someone else&apos;s export.</li>
        <li>Backups roll off on the backup schedule of the hosting provider.</li>
      </ul>

      <h2>8. Your choices and rights</h2>
      <ul>
        <li><strong>Access and portability:</strong> Settings → Export my data downloads your content and records.</li>
        <li><strong>Deletion:</strong> Settings → Delete account, or the <a href="/delete-account">account deletion page</a>.</li>
        <li><strong>Correction and preferences:</strong> edit your profile and privacy, notification and visibility choices in Settings at any time.</li>
        <li><strong>Withdraw consent / complaints:</strong> email us. You may also complain to the Office of the Privacy Commissioner of Canada or the Office of the Information and Privacy Commissioner for British Columbia; we will help them with any inquiry.</li>
      </ul>

      <h2>9. Children</h2>
      <p>
        Kamino is strictly for adults aged 18 or older. We do not knowingly collect personal
        information from anyone under 18; accounts confirmed as belonging to someone under 18 are
        erased. If you believe a minor is using the Service, contact us immediately.
      </p>

      <h2>10. Security</h2>
      <p>
        Passwords are stored as one-way hashes; sessions can be revoked per device from the
        security screen; enforcement actions and administrator access are logged and auditable; and
        private member data is excluded from the website&apos;s offline cache. No service can
        promise perfect security, but we design to keep what matters protected.
      </p>

      <h2>11. Changes and contact</h2>
      <p>
        We may update this policy as the Service changes; the current version always lives here,
        and material changes will be announced in the app.
      </p>
      <p>
        Kelnova Labs — <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> — Kelowna, British
        Columbia, Canada.
      </p>
    </LegalPage>
  );
}

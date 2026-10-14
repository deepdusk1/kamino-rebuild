import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, SUPPORT_EMAIL } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <LegalPage title="Terms of Use" updated="October 5, 2026">
      <p>
        These Terms of Use (&ldquo;Terms&rdquo;) are a binding agreement between you and
        <strong> Kelnova Labs</strong>, located in Kelowna, British Columbia, Canada
        (&ldquo;Kelnova Labs&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), the operator of the
        Kamino app and website (together, the &ldquo;Service&rdquo;). By creating an account or
        using the Service you accept these Terms. If you do not accept them, do not use the
        Service. Questions? <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>1. Eligibility — adults only</h2>
      <ul>
        <li>The Service is strictly for adults aged 18 or older. Accounts confirmed as belonging to someone under 18 are erased, and we may delete any account that misstates their age.</li>
        <li>You must provide an accurate email address, keep your sign-in credentials confidential, and are responsible for everything done through your account.</li>
        <li>One person, one account. Creating accounts to evade enforcement is prohibited.</li>
      </ul>

      <h2>2. Your content stays yours — but you give us a licence</h2>
      <ul>
        <li>You keep ownership of the posts, pictures, stories, videos and other material you create (&ldquo;Your Content&rdquo;).</li>
        <li>You grant Kelnova Labs a worldwide, royalty-free, sublicensable licence to host, store, reproduce, adapt for technical purposes (compression, resizing, transcription), and display Your Content within the Service to the audience you choose, for as long as your account exists and for the backups and caches reasonably needed to run the Service.</li>
        <li>You confirm you own or have the rights to share Your Content, and that it does not violate law or these Terms. <strong>You alone are responsible for Your Content.</strong></li>
        <li>When you delete content or your account, that licence ends except for backups, cached copies and material already shared by others within the Service.</li>
      </ul>

      <h2>3. Community rules and prohibited conduct</h2>
      <ul>
        <li>Be kind. No harassment, hate speech, threats, doxxing, sexual content involving minors (ever), non-consensual intimate images, self-harm promotion, scams, spam, or illegal activity of any kind.</li>
        <li>No trading or soliciting explicit material, no off-platform recruiting inside communities, no automated scraping or use of the Service other than through its official apps.</li>
        <li>No attempts to buy influence: reputation, moderation and community standing can never be purchased.</li>
      </ul>

      <h2>4. Moderation and enforcement</h2>
      <ul>
        <li>Community leaders, curators and moderators enforce each community&apos;s rules and can hide content, mute members for set times, issue strikes and remove members. Site administrators can suspend or ban accounts platform-wide.</li>
        <li>Automated safety checks (including AI services) scan shared content for illegal or dangerous material; held items are reviewed by a person before any account penalty. A person always makes the final decision about your account.</li>
        <li>We may remove content or end accounts that break these Terms or that we reasonably consider harmful to members or to the Service, at our discretion. Where our rules allow, you can appeal enforcement decisions.</li>
      </ul>

      <h2>5. No endorsement of member content</h2>
      <p>
        Kamino hosts material created by its members. The views expressed are those of the members
        who wrote them, not of Kelnova Labs. We do not pre-screen all content and are not obligated
        to monitor any of it, but we may review, edit or remove anything at any time.
      </p>

      <h2>6. Copyright</h2>
      <p>
        We respect copyright law. If you believe material on the Service infringes your rights,
        follow the process on our <a href="/copyright">Copyright &amp; Takedown Policy</a>. Repeat
        infringers lose their accounts. The Kamino name, logo and design are the property of
        Kelnova Labs and may not be used without permission.
      </p>

      <h2>7. AI features</h2>
      <p>
        Where enabled, the Service sends content you share to third-party AI providers (such as
        OpenAI for moderation checks and a storytelling model for role-play scenes) to perform the
        feature you requested. They process it under their own terms. See the{" "}
        <a href="/privacy">Privacy Policy</a> for details. No decision affecting your account is
        made by AI alone.
      </p>

      <h2>8. Payments, subscriptions and payouts</h2>
      <ul>
        <li>The core Service is free. Optional paid features are processed by Stripe and are never required to take part.</li>
        <li>Paid features are sold as described at checkout. Refunds are handled case by case at our discretion, and as required by law.</li>
        <li>Creators receive earnings through Stripe Connect after a refund hold period and a platform fee shown before checkout. Creators are responsible for their own taxes. Chargebacks and refunds may be recovered from future earnings.</li>
        <li>Purchases made through native app stores, when offered, are additionally governed by Apple&apos;s or Google&apos;s terms.</li>
      </ul>

      <h2>9. Availability — provided &ldquo;as is&rdquo;</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the maximum
        extent permitted by law, Kelnova Labs disclaims all warranties, express or implied,
        including fitness for a particular purpose and non-infringement. We do not promise the
        Service will be uninterrupted, error-free, or that content will be preserved. Features in
        testing may change or end.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Kelnova Labs and its operators will not be liable
        for any indirect, incidental, special, consequential or punitive damages, or for lost data,
        lost profits or emotional distress, arising from your use of the Service or from other
        members&apos; content or conduct. Our total liability to you for all claims is limited to
        the greater of the amount you paid us in the 12 months before the claim or CAD $10.
      </p>

      <h2>11. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless Kelnova Labs from claims, damages, losses and
        expenses (including reasonable legal fees) arising from Your Content, your use of the
        Service, or your breach of these Terms.
      </p>

      <h2>12. Ending the agreement</h2>
      <p>
        You can stop using the Service and delete your account at any time (Settings → Delete
        account). We may suspend or end your access for breach of these Terms, or discontinue the
        Service, at our discretion. Sections that should survive termination (licences already
        granted, limitations of liability, indemnification, governing law) do so.
      </p>

      <h2>13. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the Province of British Columbia and the federal
        laws of Canada applicable therein. Any dispute will be brought exclusively in the courts
        of British Columbia, except that either party may bring small-claims proceedings in the
        appropriate forum. Nothing here removes mandatory consumer rights.
      </p>

      <h2>14. Changes to these Terms</h2>
      <p>
        We may update these Terms; the current version always lives at this page, and material
        changes will be announced in the app. Continuing to use the Service after a change means
        you accept the updated Terms.
      </p>

      <p>
        Contact: Kelnova Labs — <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, Kelowna,
        British Columbia, Canada.
      </p>
    </LegalPage>
  );
}

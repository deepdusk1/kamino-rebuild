import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/child-safety")({ component: ChildSafety });

function ChildSafety() {
  return (
    <LegalPage title="Child Safety Standards" updated="September 30, 2026">
      <p>
        Kamino is operated by <strong>Kelnova Labs</strong> of Kelowna, British Columbia, Canada.
        Kamino is strictly for adults aged 18 and older. These standards explain how we keep
        children off the platform, how we handle child safety concerns, and how to reach us.
        Contact our child safety point of contact at{" "}
        <strong>info.kelnova@gmail.com</strong>.
      </p>

      <h2>1. Adults only — no children allowed</h2>
      <ul>
        <li>Kamino requires every user to confirm they are 18 or older before they can use the app.</li>
        <li>We do not knowingly collect personal information from anyone under 18.</li>
        <li>
          If we learn that a user is under 18, we delete their account and personal information
          promptly, as described in our <a href="/privacy">Privacy Policy</a>.
        </li>
      </ul>

      <h2>2. Reporting child safety concerns in the app</h2>
      <ul>
        <li>
          Every post, comment, message, and profile can be reported directly in the app using the
          built-in report function.
        </li>
        <li>
          Reports are reviewed by a human moderator. Content that violates our standards is
          removed, and accounts are subject to strikes, suspension, or permanent removal.
        </li>
        <li>
          You can also report a child safety concern by emailing{" "}
          <strong>info.kelnova@gmail.com</strong> with the subject line &ldquo;Child safety
          report&rdquo;. Include as much detail as you can (usernames, dates, what happened).
        </li>
      </ul>

      <h2>3. Prohibited content</h2>
      <ul>
        <li>
          Any sexual content involving minors — real or fictional, visual, textual, or implied —
          is strictly prohibited and results in immediate account removal.
        </li>
        <li>
          Grooming, sexual solicitation of minors, and attempts to move conversations with
          minors off the platform are prohibited and result in immediate account removal.
        </li>
        <li>Automated moderation scans content, including direct messages, for illegal material.</li>
      </ul>

      <h2>4. Cooperation with authorities</h2>
      <p>
        We comply with all applicable child safety laws, including Canadian law. When we become
        aware of child sexual abuse material or the sexual exploitation of a child, we remove the
        content, preserve evidence as required by law, and report it to the appropriate regional
        or national authorities, including the National Center for Missing &amp; Exploited
        Children (NCMEC) CyberTipline where applicable.
      </p>

      <h2>5. Blocking and user controls</h2>
      <ul>
        <li>Blocking another user hides their content from you and prevents contact.</li>
        <li>Community moderators can remove members and content that violate community rules.</li>
        <li>Private communities and direct messages are visible only to their members.</li>
      </ul>

      <h2>6. Changes to these standards</h2>
      <p>
        We may update these standards and will announce material changes in the app before they
        take effect, with the new date shown above.
      </p>
    </LegalPage>
  );
}

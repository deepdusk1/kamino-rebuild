import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/copyright")({ component: Copyright });

function Copyright() {
  return (
    <LegalPage title="Copyright & Takedown Policy" updated="October 5, 2026">
      <p>
        Kamino respects the intellectual property rights of others and expects members to do the
        same. This policy explains how copyright complaints about material shared on Kamino —
        including videos queued in watch parties, posts, comments, chats, stories and profile media
        — are handled, and how to submit a takedown request or a counter-notice.
      </p>

      <h2>1. What is not allowed</h2>
      <ul>
        <li>Uploading or sharing works you do not own or have permission to share (articles, artwork, music, video, software).</li>
        <li>Queuing or playing copies of films, shows or other video you do not have the rights to stream in a watch party.</li>
        <li>Reposting another member's original work without credit, or stripping credit or watermarks from it.</li>
      </ul>
      <p>
        Kamino's watch parties support links and embeds (YouTube, Vimeo, Twitch, direct files). Embedding content
        through its original platform is generally the safest way to share it; hosting unauthorized copies as direct
        files is not allowed.
      </p>

      <h2>2. How to report copyright infringement</h2>
      <p>
        If you believe material on Kamino infringes your copyright, report it in the app (Report →
        "Copyright infringement") and also send a notice to the copyright agent at{" "}
        <strong>info.kelnova@gmail.com</strong> (the copyright agent for Kelnova Labs) that includes:
      </p>
      <ul>
        <li>Identification of the copyrighted work you claim has been infringed;</li>
        <li>The exact location of the infringing material (links, community and post names);</li>
        <li>Your name, address, telephone number and email address;</li>
        <li>A statement that you have a good-faith belief that the use is not authorized by the copyright owner, its agent, or the law;</li>
        <li>A statement, under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act on their behalf; and</li>
        <li>Your physical or electronic signature.</li>
      </ul>

      <h2>3. What happens after a valid notice</h2>
      <ul>
        <li>We remove or disable access to the reported material promptly.</li>
        <li>The member who shared it is notified, gets a strike, and may lose upload or watch-party privileges for repeat offenses.</li>
        <li>Watch-party queues containing infringing material are cleared.</li>
      </ul>

      <h2>4. Counter-notice</h2>
      <p>
        If your material was removed and you believe it was misidentified or that you have the right to share it,
        send a counter-notice to the same address with the removed material's location, your contact details, a
        statement under penalty of perjury that you have a good-faith belief it was removed by mistake, your consent
        to the jurisdiction of your local courts, and your signature. We may restore the material if the complainant
        does not pursue the matter.
      </p>

      <h2>5. Repeat infringers</h2>
      <p>
        Accounts that repeatedly infringe copyright are banned. Community owners who allow repeated infringement in
        their communities may lose verification, featured status or their community.
      </p>

      <p>
        Kamino is operated by Kelnova Labs, Kelowna, British Columbia, Canada.
      </p>
    </LegalPage>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, SUPPORT_EMAIL } from "@/components/legal-page";

export const Route = createFileRoute("/delete-account")({ component: DeleteAccount });

function DeleteAccount() {
  return (
    <LegalPage title="Delete your Kamino account">
      <p>You can delete your account and content yourself, in the app or on the website:</p>
      <ul>
        <li>Open <strong>Settings</strong>, scroll to <strong>Delete account</strong>, type DELETE and confirm.</li>
        <li>This removes your profile, posts, comments, messages, follows, notifications and devices. It cannot be undone.</li>
      </ul>
      <p>
        Can&apos;t sign in? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the address
        on the account and we will delete it for you.
      </p>
    </LegalPage>
  );
}

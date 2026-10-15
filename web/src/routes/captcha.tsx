import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CaptchaField } from "@/components/captcha-field";
import { getSignInCapabilities } from "@/lib/kamino/identity-v9";

export const Route = createFileRoute("/captcha")({ component: Captcha });

/**
 * The human check the phone app opens before creating an email account. When it passes, the browser goes back to
 * the app with the check's token. Some Android browsers only open an app link after a tap, so a button is shown too.
 */
function Captcha() {
  const query = useQuery({ queryKey: ["signInCapabilities"], queryFn: () => getSignInCapabilities() });
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-10">
      <h1 className="text-2xl font-bold">Confirm you are a person</h1>
      <p>Complete verification to continue creating your Kamino account in the app.</p>
      {returnUrl ? (
        <a className="inline-block rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white" href={returnUrl}>
          Return to Kamino
        </a>
      ) : query.data?.captchaSiteKey ? (
        <CaptchaField
          siteKey={query.data.captchaSiteKey}
          onToken={(token) => {
            if (!token) return;
            const url = `kamino://captcha-complete?token=${encodeURIComponent(token)}`;
            setReturnUrl(url);
            location.assign(url);
          }}
        />
      ) : (
        <p>Verification is unavailable. Return to the app and try again.</p>
      )}
    </main>
  );
}

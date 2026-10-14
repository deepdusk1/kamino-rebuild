import {createFileRoute} from '@tanstack/react-router';
import {useQuery} from '@tanstack/react-query';
import {CaptchaField} from '@/components/captcha-field';
import {getSignInCapabilities} from '@/lib/kamino/identity-v9';
export const Route=createFileRoute('/captcha')({component:Captcha});
function Captcha(){const query=useQuery({queryKey:['signInCapabilities'],queryFn:()=>getSignInCapabilities()});return <main className="mx-auto max-w-md space-y-4 px-4 py-10"><h1 className="text-2xl font-bold">Confirm you are a person</h1><p>Complete verification to continue creating your Kamino account in the app.</p>{query.data?.captchaSiteKey?<CaptchaField siteKey={query.data.captchaSiteKey} onToken={token=>{if(token)location.assign(`kamino://captcha-complete?token=${encodeURIComponent(token)}`);}}/>:<p>Verification is unavailable. Return to the app and try again.</p>}</main>;}

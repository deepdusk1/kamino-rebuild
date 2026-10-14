/** Real Twilio Verify integration. Nothing is delivered or approved when credentials are absent. */
const env=(key:string)=>process.env[key]?.trim();
export function phoneOtpConfigured(){return Boolean(env('TWILIO_ACCOUNT_SID')&&env('TWILIO_AUTH_TOKEN')&&env('TWILIO_VERIFY_SERVICE_SID'));}
async function twilio(path:string,values:Record<string,string>){
  if(!phoneOtpConfigured())throw new Error('Phone sign-in is unavailable until the SMS provider is connected.');
  const sid=env('TWILIO_ACCOUNT_SID')!,secret=env('TWILIO_AUTH_TOKEN')!,service=env('TWILIO_VERIFY_SERVICE_SID')!;
  const response=await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/${path}`,{method:'POST',headers:{authorization:`Basic ${Buffer.from(`${sid}:${secret}`).toString('base64')}`,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(values),signal:AbortSignal.timeout(10000)});
  const body=await response.json() as {status?:string};
  if(!response.ok)throw new Error('The SMS provider could not complete that request. Try again shortly.');
  return body;
}
export async function sendPhoneOtp(number:string){await twilio('Verifications',{To:number,Channel:'sms'});}
export async function verifyPhoneOtp(number:string,code:string){try{return (await twilio('VerificationCheck',{To:number,Code:code})).status==='approved';}catch{return false;}}

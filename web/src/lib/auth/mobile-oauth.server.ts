import { randomBytes } from 'node:crypto';
import { getSql } from '@/lib/db';
import { auth } from './server';
import { verifierHash, completeOAuthFlow, claimOAuthFlow } from './mobile-oauth-state';
export function configuredSocialProviders(){return {google:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET),apple:Boolean(process.env.APPLE_CLIENT_ID&&process.env.APPLE_CLIENT_SECRET)};}
export async function beginOAuth(provider:'google'|'apple',origin:string){
  if(!configuredSocialProviders()[provider])throw new Error(`${provider} sign-in is unavailable until the provider is connected.`);
  const sql=await getSql(),id=randomBytes(24).toString('base64url'),verifier=randomBytes(32).toString('base64url');
  await sql`delete from identity_oauth_flows where expires_at < now()`;
  await sql`insert into identity_oauth_flows(id,verifier_hash,provider) values(${id},${verifierHash(verifier)},${provider})`;
  return {flowId:id,verifier,url:`${origin}/api/v1/auth/mobile-start?flow=${encodeURIComponent(id)}`,returnUrl:'kamino://auth-complete'};
}
export async function mobileOAuthStart(request:Request){
  const id=new URL(request.url).searchParams.get('flow');const sql=await getSql();
  const flow=(await sql`select provider from identity_oauth_flows where id=${id??''} and expires_at>now() and used_at is null and session_id is null`)[0];
  if(!flow)return new Response('This sign-in request expired. Return to Kamino and try again.',{status:400});
  const origin=process.env.BETTER_AUTH_URL?.replace(/\/+$/,'')??new URL(request.url).origin;
  const response=await auth.api.signInSocial({body:{provider:String(flow.provider) as 'google'|'apple',callbackURL:`${origin}/api/v1/auth/mobile-callback?flow=${encodeURIComponent(id!)}`,disableRedirect:false},headers:request.headers,asResponse:true});
  const location=response.headers.get('location');
  if(!location)return response;
  return new Response(null,{status:302,headers:response.headers});
}
export async function mobileOAuthCallback(request:Request){
  const session=await auth.api.getSession({headers:request.headers});
  if(!session)return new Response('Sign-in failed. Return to Kamino and try again.',{status:401});
  const id=new URL(request.url).searchParams.get('flow');const sql=await getSql();
  let proof:string;
  try {proof=await completeOAuthFlow(sql,id??'',session.session.id);} catch{return new Response('This sign-in request expired.',{status:400});}
  return new Response(null,{status:302,headers:{location:`kamino://auth-complete?flow=${encodeURIComponent(id!)}&proof=${encodeURIComponent(proof)}`,'cache-control':'no-store','referrer-policy':'no-referrer'}});
}
export async function exchangeOAuth(id:string,verifier:string,callbackProof:string){
  const sql=await getSql();
  const sessionId=await claimOAuthFlow(sql,id,verifier,callbackProof);
  const session=(await sql`select token from "session" where id=${sessionId} and "expiresAt">now()`)[0];
  if(!session)throw new Error('This sign-in session expired. Please try again.');
  return {token:String(session.token)};
}

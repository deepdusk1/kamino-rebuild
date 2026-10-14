import { rpc } from './client';

export type Referral = {
  code: string;
  invited: number;
  repEarned: number;
  repPerInvite: number;
  repForFriend: number;
  path: string;
};
export type ReferralPreview = { valid: boolean; name?: string };
export type ReferralClaim = { referrerName: string; repEarned: number };

export const referrals = {
  mine: () => rpc<Referral>('getMyReferral'),
  preview: (code: string) => rpc<ReferralPreview>('getReferralPreview', { code }),
  claim: (code: string) => rpc<ReferralClaim>('claimReferral', { code }),
};

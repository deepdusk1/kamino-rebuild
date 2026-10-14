import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { communityV9 } from '@/api/community-v9';
import { api } from '@/api/endpoints';
import { Button, Card, ErrorState, Loading, Screen, Txt } from '@/components/ui';
import { showError } from '@/lib/errors';

export default function CommunityInvitation() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const invite = useQuery({ queryKey: ['community-invitation', code], queryFn: () => communityV9.inviteDetails(code!), enabled: !!code });
  if (invite.isPending) return <Loading />;
  if (invite.error || !invite.data) return <ErrorState error={invite.error} onRetry={() => void invite.refetch()} />;
  const details = invite.data;
  const accept = async () => {
    setBusy(true);
    try {
      await api.join({ slug: details.slug, invite: code! });
      await cache.invalidateQueries({ queryKey: ['community', details.slug] });
      router.replace(`/community/${details.slug}`);
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  };
  return <Screen><Txt variant="heading">You’re invited</Txt><Card><Txt variant="heading">{details.name}</Txt><Txt tone="muted">{details.tagline}</Txt><Txt variant="small" tone="subtle">For members age {details.ageGate} and over</Txt><Button label={details.joined ? 'Open community' : 'Accept invitation'} busy={busy} onPress={() => details.joined ? router.replace(`/community/${details.slug}`) : void accept()} /></Card></Screen>;
}

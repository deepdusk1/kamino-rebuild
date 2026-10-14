import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useSession } from '@/auth/session';
import { identityApi } from '@/lib/identity-v9';
import { Button, Card, Txt } from './ui';

export function TutorialPrompt() {
  const { status } = useSession();
  const query = useQuery({ queryKey: ['identityDashboard'], queryFn: identityApi.dashboard, enabled: status === 'signedIn' });
  if (!query.data || query.data.preferences.tutorialComplete) return null;
  return <View style={{ paddingHorizontal: 16 }}><Card><Txt variant="heading">Make yourself at home</Txt>
    <Txt tone="muted">Four quick steps to find your people, share something and choose your privacy.</Txt>
    <Button label="Take the welcome tour" small onPress={() => router.push('/tutorial' as never)} />
  </Card></View>;
}

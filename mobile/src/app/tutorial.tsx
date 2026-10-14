import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { notify } from '@/components/community/platform';
import { errorMessage } from '@/lib/errors';
import { identityApi } from '@/lib/identity-v9';
import { useTheme } from '@/theme';

const steps = [
  { title: 'Find your first community', icon: 'compass-outline', text: 'Browse topics you enjoy. Open a community, read its rules, then choose Join. Private communities may ask a few questions before a moderator approves you.', action: 'Explore communities', route: '/explore' },
  { title: 'Share something with your people', icon: 'chatbubble-outline', text: 'Choose a community you joined, then open Create. Write a post, ask a question or share your work. Preview it, add an image description if needed and publish when you are ready.', action: 'Open Create', route: '/create' },
  { title: 'Build your circle', icon: 'people-outline', text: 'Follow members whose work you enjoy. Add close friends or favorites from your privacy dashboard. Teen accounts can message mutual follows; other members can choose who may contact them.', action: 'Find members', route: '/tools' },
  { title: 'Make Kamino comfortable for you', icon: 'shield-checkmark-outline', text: 'Choose who can mention or invite you. Mute, restrict or block unwanted contact, and report harmful posts from their menu. Turn on two-factor authentication and review signed-in devices in Security.', action: 'Choose privacy settings', route: '/privacy-dashboard' },
] as const;
export default function Tutorial() {
  const theme = useTheme(), client = useQueryClient();
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false);
  const current = steps[step]!;
  const finish = async () => {
    setBusy(true);
    try { await identityApi.preferences({ tutorialComplete: true }); await client.invalidateQueries({ queryKey: ['identityDashboard'] }); router.replace('/' as never); }
    catch (error) { notify('Could not save your progress', errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <Screen><Txt variant="title">Welcome to Kamino</Txt><Txt tone="muted">A quick tour. Revisit it from Settings anytime.</Txt>
    <Txt accessibilityLiveRegion="polite">Step {step + 1} of {steps.length}</Txt>
    <View style={{ flexDirection: 'row', gap: 6 }}>{steps.map((_, index) => <View key={index} style={{ height: 6, flex: 1, borderRadius: 3, backgroundColor: index <= step ? theme.accent : theme.border }} />)}</View>
    <Card><Ionicons name={current.icon} size={40} color={theme.accent} /><Txt variant="heading">{current.title}</Txt><Txt tone="muted">{current.text}</Txt>
      <Button label={current.action} variant="secondary" onPress={() => router.push(current.route as never)} /></Card>
    <View style={{ flexDirection: 'row', gap: 10 }}><Button label="Back" variant="secondary" disabled={step === 0 || busy} onPress={() => setStep(step - 1)} />
      <Button label={step === steps.length - 1 ? 'Finish tour' : 'Next'} busy={busy} onPress={() => step === steps.length - 1 ? void finish() : setStep(step + 1)} /></View>
    <Button label="Skip for now" variant="ghost" disabled={busy} onPress={() => void finish()} />
  </Screen>;
}

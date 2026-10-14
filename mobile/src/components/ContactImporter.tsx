import { useState } from 'react';
import { Platform, Switch, View } from 'react-native';
import { Button, Sheet, Txt } from '@/components/ui';
import { notify } from '@/components/community/platform';
import { previewContacts, matchSelectedContacts, type ContactCandidate } from '@/lib/contact-import';
import { identityApi, type IdentityPerson } from '@/lib/identity-v9';
import { errorMessage } from '@/lib/errors';

export function ContactImporter({ onMatches }: { onMatches: (people: IdentityPerson[]) => void }) {
  const [candidates, setCandidates] = useState<ContactCandidate[]>([]), [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const clear = () => { setOpen(false); setCandidates([]); setSelected(new Set()); };
  const load = async () => {
    if (Platform.OS === 'web') return notify('Use your phone', 'Device contacts are available in the iOS and Android apps. You can paste email addresses here.');
    setBusy(true);
    try {
      const Contacts = await import('expo-contacts');
      const preview = await previewContacts({
        requestPermission: async () => (await Contacts.requestPermissionsAsync()).granted,
        readDetails: () => Contacts.Contact.getAllDetails([Contacts.ContactField.FULL_NAME, Contacts.ContactField.EMAILS], { limit: 200 }),
      });
      if (preview.permissionDenied) return notify('Contacts permission declined', 'No contacts were read or sent. You can paste email addresses instead, or enable contact access in your device settings.');
      if (!preview.candidates.length) return notify('No email addresses found', 'The contacts accessible to Kamino have no valid email addresses. You can paste email addresses instead.');
      setCandidates(preview.candidates); setSelected(new Set()); setOpen(true);
    } catch (error) { notify('Could not open contacts', errorMessage(error)); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!selected.size) return;
    setBusy(true);
    try { const matches = await matchSelectedContacts(candidates, selected, identityApi.contacts); onMatches(matches); clear(); if (!matches.length) notify('No matches', 'None of the selected addresses matched a member who allows discovery.'); }
    catch (error) { notify('Could not find contacts', errorMessage(error)); }
    finally { setBusy(false); }
  };
  return <>
    <Txt tone="muted">Preview up to 200 contact email addresses on your phone. Only addresses you select and confirm will be matched; contact names stay on your device.</Txt>
    <Button label="Preview device contacts" variant="secondary" busy={busy && !open} onPress={() => void load()} />
    <Sheet visible={open} title="Choose contacts to match" onClose={() => { if (!busy) clear(); }}>
      <Txt tone="muted">Select the email addresses you want to check. Nothing has been sent yet. Matching only finds members who allow discovery.</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button small label="Select all" variant="secondary" disabled={busy} onPress={() => setSelected(new Set(candidates.map(candidate => candidate.email)))} /><Button small label="Clear selection" variant="ghost" disabled={busy} onPress={() => setSelected(new Set())} /></View>
      <Button label={`Match ${selected.size} selected addresses`} disabled={!selected.size} busy={busy} onPress={() => void confirm()} />
      {candidates.map(candidate => <View key={candidate.email} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}><Txt>{candidate.name}</Txt><Txt variant="caption" tone="muted">{candidate.email}</Txt></View>
        <Switch accessibilityLabel={`Match ${candidate.email}`} disabled={busy} value={selected.has(candidate.email)} onValueChange={enabled => setSelected(previous => { const next = new Set(previous); if (enabled) next.add(candidate.email); else next.delete(candidate.email); return next; })} />
      </View>)}
      <Button label="Cancel and clear preview" variant="ghost" disabled={busy} onPress={clear} />
    </Sheet>
  </>;
}

export type ContactCandidate = { name: string; email: string };
export type ContactDetails = { fullName?: string | null; emails?: readonly { address?: string | null }[] };
export const CONTACT_IMPORT_LIMIT = 200;

/** Device-side projection: ignore empty/invalid addresses and never include names in a matching request. */
export function contactCandidates(contacts: readonly ContactDetails[]): ContactCandidate[] {
  const seen = new Set<string>(), candidates: ContactCandidate[] = [];
  for (const contact of contacts) {
    for (const entry of contact.emails ?? []) {
      const email = entry.address?.trim().toLowerCase() ?? '';
      if (email.length > 254 || !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email) || seen.has(email)) continue;
      seen.add(email); candidates.push({ name: contact.fullName?.trim() || email, email });
      if (candidates.length === CONTACT_IMPORT_LIMIT) return candidates;
    }
  }
  return candidates;
}

/** No device read happens before explicit permission; this function never sends anything to the server. */
export async function previewContacts(adapter: {
  requestPermission: () => Promise<boolean>;
  readDetails: () => Promise<readonly ContactDetails[]>;
}) {
  if (!(await adapter.requestPermission())) return { permissionDenied: true, candidates: [] as ContactCandidate[] };
  return { permissionDenied: false, candidates: contactCandidates(await adapter.readDetails()) };
}

/** Only confirmed addresses from the local preview are matched, in the server's existing 100-address batches. */
export async function matchSelectedContacts<T extends { userId: string }>(
  candidates: readonly ContactCandidate[], selected: ReadonlySet<string>, matcher: (emails: string[]) => Promise<T[]>,
) {
  const emails = [...new Set(candidates.filter(candidate => selected.has(candidate.email)).map(candidate => candidate.email))].slice(0, CONTACT_IMPORT_LIMIT);
  const matches = new Map<string, T>();
  for (let offset = 0; offset < emails.length; offset += 100) {
    for (const member of await matcher(emails.slice(offset, offset + 100))) matches.set(member.userId, member);
  }
  return [...matches.values()];
}

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { getIdentityDashboard } from '@/lib/kamino/identity-v9';

export function TutorialPrompt() {
  const { user } = useCurrentUserState();
  const query = useQuery({ queryKey: ['identityDashboard'], queryFn: () => getIdentityDashboard(), enabled: !!user });
  if (!query.data || query.data.preferences.tutorialComplete) return null;
  return <div className="mx-4 mt-3 rounded-card border border-violet/20 bg-violet/10 p-4">
    <strong className="text-violet-ink">Make yourself at home</strong>
    <p className="mt-1 text-sm text-muted">Four quick steps to find your people, share something and choose your privacy.</p>
    <Link to="/tutorial" className="k-focus mt-2 inline-block font-bold text-violet">Take the welcome tour</Link>
  </div>;
}

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSession } from '@/auth/session';
import { AppearanceProvider } from '@/theme';
import { identityApi } from '@/lib/identity-v9';
export function IdentityAppearance({children}:{children:ReactNode}) {
  const {status}=useSession();
  const query=useQuery({queryKey:['identityDashboard'],queryFn:identityApi.dashboard,enabled:status==='signedIn',retry:false});
  const p=status==='signedIn'?query.data?.preferences:undefined;
  return <AppearanceProvider value={{highContrast:p?.highContrast??false,textScale:p?.textScale??'standard'}}>{children}</AppearanceProvider>;
}

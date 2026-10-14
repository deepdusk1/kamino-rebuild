import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { api } from "@/api/endpoints";
import { AppHeader } from "@/components/k";
import { ProfileScreen } from "@/components/profile/ProfileScreen";
import { ErrorState, SkeletonList } from "@/components/ui";
import { useTheme } from "@/theme";

/**
 * The Profile tab: your own profile, drawn by the same screen as everyone else's (mockup 10-profile).
 * Edit profile, Settings, Saved, Safety and Sign out are in the menu under the chevron next to "Edit profile".
 */
export default function Me() {
  const theme = useTheme();
  const boot = useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap });
  const handle = boot.data?.profile?.handle;
  if (handle) return <ProfileScreen handle={handle} inTabs />;
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <AppHeader />
      {boot.isError ? <ErrorState error={boot.error} onRetry={() => void boot.refetch()} /> : <View style={{ padding: 12 }}><SkeletonList count={2} /></View>}
    </View>
  );
}

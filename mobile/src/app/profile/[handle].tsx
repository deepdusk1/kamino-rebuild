import { useLocalSearchParams } from "expo-router";
import { ProfileScreen } from "@/components/profile/ProfileScreen";

/** Someone's profile (or your own, opened from a link). The screen itself lives in `components/profile`. */
export default function Profile() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  return <ProfileScreen handle={handle ?? ""} />;
}

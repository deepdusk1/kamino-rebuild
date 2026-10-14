import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";
import { api } from "@/api/endpoints";
import { safety } from "@/api/site-reports";
import { SiteSafetyQueues } from "@/components/safety/SiteSafetyQueues";
import { Button, Card, ErrorState, Loading, Screen, Txt } from "@/components/ui";
import { space } from "@/theme";

/** Personal safety information and own appeals for members; site queues require verified server-side admin access. */
export default function SafetyCenter() {
  const communities = useQuery({ queryKey: ["mySafetyCommunities"], queryFn: safety.communities });
  const role = useQuery({ queryKey: ["safetyRole"], queryFn: api.safetyRole, staleTime: 60_000 });
  return <Screen refreshing={communities.isRefetching || role.isRefetching} onRefresh={() => { void communities.refetch(); void role.refetch(); }}>
    <Txt variant="title">Safety Center</Txt>
    <Card><Txt variant="heading">A safer community starts with you</Txt><Txt tone="muted">No threats, hate, scams or sexual content involving minors. Report a profile, post, comment or message from its menu. Blocking hides someone&apos;s posts and messages; muting hides their activity for you.</Txt></Card>
    <Card><Txt variant="heading">Your privacy and help</Txt><View style={{ gap: space.sm }}>
      <Button variant="secondary" label="Privacy and muted people" onPress={() => router.push("/privacy-dashboard" as never)} />
      <Button variant="secondary" label="Blocked people and settings" onPress={() => router.push("/settings")} />
      <Button variant="secondary" label="Contact support" onPress={() => router.push("/tools?tab=support" as never)} />
    </View></Card>
    <Card><Txt variant="heading">Your community standing</Txt><Txt tone="muted">See your warnings, mutes, removals and appeals. You can still appeal after removal from a community.</Txt>
      {communities.isPending ? <Loading /> : communities.isError ? <ErrorState error={communities.error} onRetry={() => void communities.refetch()} /> : communities.data?.length ? communities.data.map(community => <Button key={community.id} variant="secondary" label={`${community.name} · ${community.status}`} onPress={() => router.push(`/community/${community.id}/standing` as never)} />) : <Txt tone="muted">You have no community records yet.</Txt>}
    </Card>
    <Card><Txt variant="heading">When things feel heavy</Txt><Txt tone="muted">Reach out to someone you trust or a local crisis line. If someone is in danger right now, contact local emergency services. Community reports are reviewed by people and are not an emergency service.</Txt></Card>
    {role.isError ? <ErrorState error={role.error} onRetry={() => void role.refetch()} /> : role.data?.siteAdmin ? <SiteSafetyQueues /> : null}
  </Screen>;
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { api } from "@/api/endpoints";
import { AppealsTab } from "@/components/mod/AppealsTab";
import { BansTab } from '@/components/mod/BansTab';
import { AuditTab } from '@/components/mod/AuditTab';
import { PeopleTab } from "@/components/mod/PeopleTab";
import { ReportsTab } from "@/components/mod/ReportsTab";
import { RequestsTab } from "@/components/mod/RequestsTab";
import { SafetyTab } from "@/components/mod/SafetyTab";
import { ToolsTab } from "@/components/mod/ToolsTab";
import { Chip, ErrorState, Loading, Screen } from "@/components/ui";
import { space } from "@/theme";
import { withCommunityTheme } from "@/components/CommunityTheme";

type Tab = "safety" | "reports" | "requests" | "people" | "appeals" | "tools" | 'bans' | 'audit';

/** Leader and curator tools, split into tabs so each screen stays small and easy to read. */
function Moderation() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const mod = useQuery({ queryKey: ["mod", slug], queryFn: () => api.moderation(slug!), enabled: !!slug });
  const page = useQuery({ queryKey: ["community", slug], queryFn: () => api.community(slug!), enabled: !!slug });
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const appeals = useQuery({ queryKey: ["appeals", slug], queryFn: () => api.appeals(slug!), enabled: !!slug });
  const safety = useQuery({ queryKey: ["safety", slug], queryFn: () => api.safetyFlags(slug!), enabled: !!slug });
  const [tab, setTab] = useState<Tab>("safety");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["mod", slug] });
    void queryClient.invalidateQueries({ queryKey: ["appeals", slug] });
    void queryClient.invalidateQueries({ queryKey: ["community", slug] });
    void queryClient.invalidateQueries({ queryKey: ["safety", slug] });
    void queryClient.invalidateQueries({ queryKey: ['mod-details',slug] });
  };

  if (mod.isPending || page.isPending) return <Loading />;
  if (mod.isError || !mod.data) return <ErrorState error={mod.error} onRetry={() => void mod.refetch()} />;

  const data = mod.data;
  const openReports = data.reports.filter((r) => r.status === "open").length;
  const strikeCounts = new Map<string, number>();
  for (const s of data.strikes) strikeCounts.set(s.userId, (strikeCounts.get(s.userId) ?? 0) + 1);
  const openAppeals = (appeals.data ?? []).filter((a) => a.status === "open").length;

  const openSafety = (safety.data ?? []).filter((f) => f.status === "open").length;
  const tabs: { id: Tab; label: string }[] = [
    { id: "safety", label: `Safety${openSafety ? ` (${openSafety})` : ""}` },
    { id: "reports", label: `Reports${openReports ? ` (${openReports})` : ""}` },
    { id: "requests", label: `Requests${data.pending.length ? ` (${data.pending.length})` : ""}` },
    { id: "people", label: "People" },
    { id: 'bans',label:'Bans' },
    { id: 'audit',label:'Activity log' },
    { id: "appeals", label: `Appeals${openAppeals ? ` (${openAppeals})` : ""}` },
    { id: "tools", label: "Tools" },
  ];

  return (
    <Screen refreshing={mod.isRefetching} onRefresh={refresh}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {tabs.map((t) => <Chip key={t.id} label={t.label} selected={tab === t.id} onPress={() => setTab(t.id)} />)}
      </ScrollView>
      <View>
        {tab === "safety" ? <SafetyTab slug={slug!} /> : null}
        {tab === "reports" ? <ReportsTab slug={slug!} reports={data.reports} onChanged={refresh} /> : null}
        {tab === "requests" ? <RequestsTab slug={slug!} pending={data.pending} answers={data.joinAnswers} questions={data.joinQuestions.map((q) => q.prompt)} onChanged={refresh} /> : null}
        {tab === "people" ? <PeopleTab slug={slug!} members={page.data?.members ?? []} strikeCounts={strikeCounts} myRole={data.role} myId={me.data?.profile.userId} onChanged={refresh} /> : null}
        {tab === 'bans' ? <BansTab slug={slug!} onChanged={refresh}/> :null}
        {tab === 'audit' ? <AuditTab slug={slug!}/> :null}
        {tab === "appeals" ? <AppealsTab slug={slug!} appeals={appeals.data ?? []} onChanged={refresh} /> : null}
        {tab === "tools" ? <ToolsTab slug={slug!} data={data} onChanged={refresh} /> : null}
      </View>
    </Screen>
  );
}

export default withCommunityTheme(Moderation);

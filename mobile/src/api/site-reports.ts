import { rpc } from "./client";
import type { SafetyFlag } from "./types";

export type SiteReport = {
  id: number; communityId: string | null; communityName: string;
  targetType: string; targetId: string; reason: string; details: string; status: string; createdAt: string;
};
export type SiteReportPage = { reports: SiteReport[]; nextBeforeId: number | null };
export type SafetyCommunity = { id: string; name: string; status: string; role: string };

export const safety = {
  communities: () => rpc<SafetyCommunity[]>("listMySafetyCommunities"),
  flags: () => rpc<SafetyFlag[]>("listSiteSafetyFlags"),
  reports: (data: { closed?: boolean; beforeId?: number } = {}) => rpc<SiteReportPage>("listSiteReports", data),
  review: (id: number, status: "resolved" | "dismissed", note: string) =>
    rpc<{ ok: true; status: "resolved" | "dismissed" }>("reviewSiteReport", { id, status, note }),
};

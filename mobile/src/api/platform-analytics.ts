import { rpc } from "./client";
export type PlatformAnalytics = {
  metrics: {
    members: number;
    dau: number;
    wau: number;
    mau: number;
    newMembers7: number;
  };
  activity: { day: string; activeMembers: number; newMembers: number }[];
  cohorts: {
    week: string;
    members: number | null;
    eligible7: number | null;
    retained7: number | null;
    retention7: number | null;
    eligible30: number | null;
    retained30: number | null;
    retention30: number | null;
  }[];
  definition: string;
};
export const getPlatformAnalytics = () =>
  rpc<PlatformAnalytics>("getPlatformAnalytics");

import { rpc } from "./client";
export type OperationRow = Record<string, string | number | boolean | null>;
export type ProgressionSeason = {
  id: number;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  points: number;
  level: number;
  sets: OperationRow[];
};
export type OperationsCenter = {
  emailDigest: boolean;
  emailConfigured: boolean;
  pushConfigured: boolean;
  cases: OperationRow[];
  appeals: OperationRow[];
  events: OperationRow[];
  seasons: ProgressionSeason[];
  deliveries: OperationRow[];
  isAdmin: boolean;
};
export type AdminOperations = {
  cases: OperationRow[];
  events: OperationRow[];
  appeals: OperationRow[];
  reports: OperationRow[];
  experiments: OperationRow[];
  seasons: ProgressionSeason[];
  deliveryStats: OperationRow[];
  emailConfigured: boolean;
  pushConfigured: boolean;
  userId: string;
};
export type CaseDecision = "no_action" | "warning" | "suspended" | "banned";
export type ExperimentInput = {
  id?: number;
  key: string;
  title: string;
  featureKey: "related_discovery" | "discovery_assistant";
  treatmentPercent: number;
  status: "draft" | "running" | "ended";
};
export type SeasonInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  sets: {
    title: string;
    description?: string;
    cosmetic: "aurora" | "sunrise" | "ocean" | "forest";
    requiredPoints: number;
    supply: number;
  }[];
};
export const operations = {
  center: () => rpc<OperationsCenter>("getOperationsCenter"),
  admin: () => rpc<AdminOperations>("getAdminOperations"),
  digest: (enabled: boolean) => rpc<{ ok: boolean }>("setEmailDigest", enabled),
  claim: (setId: number) =>
    rpc<{ ok: boolean; alreadyClaimed: boolean }>(
      "claimSeasonCollectible",
      setId,
    ),
  appeal: (caseId: number, message: string) =>
    rpc<{ id: number }>("submitCaseAppeal", { caseId, message }),
  openCase: (data: {
    reportId?: number;
    subjectId?: string;
    summary: string;
    priority?: "normal" | "urgent";
  }) => rpc<{ id: number }>("openModerationCase", data),
  updateCase: (data: {
    id: number;
    action: "claim" | "unassign" | "investigating" | "close" | "note";
    note?: string;
    memberVisible?: boolean;
  }) => rpc<{ ok: boolean }>("updateModerationCase", data),
  decide: (data: {
    id: number;
    decision: CaseDecision;
    reason: string;
    days?: number;
  }) => rpc<{ ok: boolean }>("decideModerationCase", data),
  reviewAppeal: (id: number, decision: "upheld" | "overturned", note: string) =>
    rpc<{ ok: boolean }>("reviewCaseAppeal", { id, decision, note }),
  experiment: (data: ExperimentInput) =>
    rpc<{ ok: boolean }>("savePlatformExperiment", data),
  season: (data: SeasonInput) =>
    rpc<{ id: number }>("createProgressionSeason", data),
  endSeason: (id: number) => rpc<{ ok: boolean }>("endProgressionSeason", id),
  requestLink: (email: string, caseId?: number) =>
    rpc<{ ok: boolean; message: string }>("requestCaseAppealLink", {
      email,
      caseId,
    }),
  verified: (proof: string) =>
    rpc<{
      case: OperationRow;
      events: OperationRow[];
      appeals: OperationRow[];
    }>("getVerifiedCaseAppeal", proof),
  verifiedAppeal: (proof: string, message: string) =>
    rpc<{ id: number }>("submitVerifiedCaseAppeal", { proof, message }),
};

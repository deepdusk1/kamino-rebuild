import { rpc } from "./client";
export type Row = Record<string, string | number | boolean | null>;
export type Hub = {
  communities: Row[];
  posts: Row[];
  relatedEnabled: boolean;
  relatedPosts: Row[];
  relatedCreators: Row[];
  events: Row[];
  visits: Row[];
  chats: Row[];
  live: Row[];
  collections: {
    id: number;
    title: string;
    description: string;
    communities: Row[];
  }[];
  trending: Row[];
  aiAvailable: boolean;
  feedback: Row[];
};
export type Creator = {
  isAdmin: boolean;
  stats: Row;
  daily: Row[];
  topPosts: Row[];
  offers: Row[];
  audience: Row[];
  payments: { enabled: boolean; reason: string };
};
export type Admin = {
  metrics: Row;
  communities: Row[];
  creators: Row[];
  verification: Row[];
  taxonomy: Row[];
  flags: Row[];
  collections: Row[];
  tickets: Row[];
  audit: Row[];
  paymentsEnabled: boolean;
};
export const platform = {
  hub: (data: { query?: string; localArea?: string; contextCommunityId?: string } = {}) =>
    rpc<Hub>("getDiscoveryHub", data),
  creator: () => rpc<Creator>("getCreatorDashboard"),
  market: () =>
    rpc<{ offers: Row[]; paymentsEnabled: boolean }>("getMarketplace"),
  admin: () => rpc<Admin>("getAdminDashboard"),
  support: () => rpc<Row[]>("getMySupportTickets"),
  taxonomy: () => rpc<Row[]>("getCustomTaxonomy"),
  matching: () =>
    rpc<{
      interests: string[];
      people: {
        userId: string;
        handle: string;
        name: string;
        shared: string[];
        introduction: string;
      }[];
    }>("getPeopleMatching"),
  feedback: (targetId: string, preference: "more" | "less" | "hide") =>
    rpc("setDiscoveryFeedback", {
      targetType: "community",
      targetId,
      preference,
    }),
  reset: () => rpc("resetDiscovery"),
  ai: (task: string, text: string, language = "English") =>
    rpc<{ text: string }>("aiAssistant", { task, text, language }),
  offer: (data: {
    id?: number;
    kind: string;
    title: string;
    description?: string;
    priceMinor: number;
    published?: boolean;
    currency?: string;
    communityId?: string;
  }) => rpc("saveCreatorOffer", data),
  submit: (subject: string, body: string) =>
    rpc("submitSupportTicket", { subject, body }),
  collection: (title: string, communityIds: string[]) =>
    rpc("saveEditorialCollection", { title, communityIds, published: true }),
  flag: (key: string, enabled: boolean, rolloutPercent: number) =>
    rpc("setPlatformFlag", { key, enabled, rolloutPercent }),
  reply: (id: number, response: string) =>
    rpc("respondSupportTicket", { id, response, status: "resolved" }),
  visit: (communityId: string) => rpc("recordCommunityVisit", { communityId }),
  accounts: (query: string) =>
    rpc<
      {
        userId: string;
        handle: string;
        name: string;
        email: string;
        emailVerified: boolean;
        status: string;
        reason: string;
        until: string | null;
      }[]
    >("adminListAccounts", query),
  accountStatus: (
    userId: string,
    status: "active" | "suspended" | "banned",
    reason: string,
  ) => rpc("adminSetAccountStatus", { userId, status, reason }),
  verification: (id: number, approve: boolean, note: string) =>
    rpc("decideVerification", { id, approve, note }),
  featureCreator: (userId: string, featured: boolean) =>
    rpc("adminFeatureCreator", { userId, featured }),
  manageCommunity: (
    communityId: string,
    category: string,
    language: string,
    verified: boolean,
  ) => rpc("adminSaveCommunity", { communityId, category, language, verified }),
  saveCategory: (key: string, label: string, icon: string, active: boolean) =>
    rpc("adminSaveTaxonomy", { key, label, icon, active }),
  campaign: (title: string, body: string, href: string) =>
    rpc("adminPublishCampaign", { title, body, href }),
  collaborations: () =>
    rpc<{ open: Row[]; mine: Row[]; proposals: Row[]; userId: string }>(
      "getCollaborations",
    ),
  brief: (data: {
    id?: number;
    title: string;
    brief: string;
    budgetNote: string;
    open: boolean;
  }) => rpc("saveCollaborationBrief", data),
  propose: (briefId: number, introduction: string) =>
    rpc("proposeCollaboration", { briefId, introduction }),
  decide: (id: number, action: "accepted" | "declined" | "withdrawn") =>
    rpc("decideCollaboration", { id, action }),
  billingStatus: () =>
    rpc<{
      enabled: boolean;
      mode: "disabled" | "test" | "live";
      reason: string;
      mobilePaymentsEnabled: boolean;
      creatorPayoutsEnabled: boolean;
    }>("getBillingStatus"),
  billing: () =>
    rpc<{
      showSupporterBadges: boolean;
      orders: {
        id: string;
        offerId: number;
        title: string;
        kind: string;
        priceMinor: number;
        currency: string;
        status: string;
        testMode: true;
        subscription: boolean;
        createdAt: string;
      }[];
      entitlements: {
        offerId: number;
        title: string;
        state: string;
        expiresAt: string | null;
        testMode: true;
      }[];
      requirements: {
        kind: "community" | "post" | "chat" | "event";
        resourceId: string;
        offerId: number;
      }[];
    }>("getMyBilling"),
  paidChoices: () =>
    rpc<{
      resources: {
        kind: "community" | "post" | "chat" | "event";
        resourceId: string;
        title: string;
        communityId: string | null;
      }[];
      offers: {
        id: number;
        title: string;
        kind: string;
        communityId: string | null;
        published: boolean;
      }[];
    }>("getPaidResourceChoices"),
  paidResource: (
    kind: "community" | "post" | "chat" | "event",
    resourceId: string,
    offerId: number | null,
  ) => rpc("setPaidResource", { kind, resourceId, offerId }),
  supporterBadge: (visible: boolean) =>
    rpc("setSupporterBadgeVisibility", { visible }),
};

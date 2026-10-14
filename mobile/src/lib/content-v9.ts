import type { MediaInput, ContentMediaItem } from "@/api/content-types";
import { rpc } from "@/api/client";
export const POST_EMOJI = [
  "💜",
  "😂",
  "🔥",
  "👏",
  "✨",
  "😮",
  "💡",
  "🎉",
] as const;
export type { MediaInput, ContentMediaItem } from "@/api/content-types";
export type PostContent = {
  reactions: { emoji: string; count: number; mine: boolean }[];
  media: ContentMediaItem[];
  bestAnswerId: number | null;
  parents: { id: number; parentId: number | null }[];
  history: { id: number; title: string; body: string; editedAt: string }[];
  sharingAllowed: boolean;
  commentRule: string;
  hidden: boolean;
  muted: boolean;
  following: boolean;
  canChooseAnswer: boolean;
  canManage: boolean;
};
export type StoryContent = {
  scope: string;
  background: string;
  overlayText: string;
  sticker: string;
  mentions: string[];
  question: string;
  pollOptions: string[];
  responses: { option_index: number | null; count: number }[];
  mine: { optionIndex: number | null; answer: string } | null;
  answers: string[];
  authorId: string;
  title: string;
};
export type ProfileContentData = {
  portfolio: {
    id: number;
    title: string;
    description: string;
    url: string;
    postId: number | null;
  }[];
  highlights: { id: number; title: string; postIds: number[] }[];
  media: { id: number; title: string; slug: string; type: string }[];
  mine: boolean;
};
export type ChatContent = {
  kind: string;
  ownerId: string;
  canPin: boolean;
  pins: { id: number; body: string }[];
  attachments: (ContentMediaItem & { messageId: number })[];
  cards: {
    messageId: number;
    kind: string;
    title: string;
    subtitle: string;
    href: string;
  }[];
  people: {
    userId: string;
    name: string;
    handle: string;
    lastActive: string | null;
  }[];
};
export const contentApi = {
  uploadAllowance: () =>
    rpc<{
      premium: boolean;
      animatedAvatar: boolean;
      avatarBytes: number;
      limits: Record<string, number>;
    }>("getUploadAllowance"),
  post: (postId: number) => rpc<PostContent>("postContentTools", { postId }),
  react: (postId: number, emoji: (typeof POST_EMOJI)[number]) =>
    rpc("reactToPost", { postId, emoji }),
  personal: (
    postId: number,
    flags: { hidden?: boolean; muted?: boolean; following?: boolean },
  ) => rpc("setPostPersonal", { postId, ...flags }),
  rules: (
    postId: number,
    sharingAllowed: boolean,
    commentRule: "members" | "followers" | "none",
  ) => rpc("setPostContentRules", { postId, sharingAllowed, commentRule }),
  view: (postId: number) => rpc("recordPostView", { postId }),
  analytics: (postId: number) =>
    rpc<Record<string, number>>("postAnalytics", { postId }),
  reply: (postId: number, parentId: number, body: string) =>
    rpc<{ id: number; held: boolean }>("replyToComment", {
      postId,
      parentId,
      body,
    }),
  best: (postId: number, commentId: number | null) =>
    rpc("chooseBestAnswer", { postId, commentId }),
  quote: (slug: string, postId: number, note: string) =>
    rpc<{ id: number }>("repost", { slug, postId, note }),
  story: (postId: number) => rpc<StoryContent>("getStoryTools", { postId }),
  respond: (
    postId: number,
    response: { optionIndex?: number; answer?: string },
  ) => rpc("respondToStory", { postId, ...response }),
  profile: (userId: string) =>
    rpc<ProfileContentData>("profileContent", { userId }),
  highlight: (title: string, postIds: number[]) =>
    rpc("saveProfileHighlight", { title, postIds }),
  portfolio: (title: string, description: string, url?: string) =>
    rpc("savePortfolioItem", { title, description, url }),
  removeProfile: (kind: "highlight" | "portfolio", id: number) =>
    rpc("removeProfileContent", { kind, id }),
  create: (data: {
    slug: string;
    title: string;
    body: string;
    kind: "article" | "video" | "short" | "audio" | "gif" | "story";
    media?: MediaInput;
    images?: (MediaInput & {kind:"image"})[];
    sharingAllowed: boolean;
    commentRule: "members" | "followers" | "none";
    visibility: "public" | "members";
    contentWarning: string;
    publishAt?: string | null;
    story?: {
      scope: "profile" | "community";
      background: string;
      overlayText: string;
      sticker: string;
      mentions: string[];
      question: string;
      pollOptions: string[];
    };
  }) =>
    rpc<{ id: number; slug: string; held: boolean }>("createMediaPost", data),
  chat: (roomId: number) => rpc<ChatContent>("chatContentTools", { roomId }),
  group: (name: string, handles: string[]) =>
    rpc<{ roomId: number }>("createGroupChat", { name, handles }),
  updateGroup: (
    roomId: number,
    data: {
      name?: string;
      addHandle?: string;
      removeUserId?: string;
      leave?: boolean;
    },
  ) => rpc("updateGroupChat", { roomId, ...data }),
  pin: (roomId: number, messageId: number, pinned: boolean) =>
    rpc("pinChatMessage", { roomId, messageId, pinned }),
  block: (roomId: number, userId: string) =>
    rpc("blockChatPeer", { roomId, userId }),
  attach: (roomId: number, media: MediaInput) =>
    rpc<{ id: number; held: boolean }>("sendChatAttachment", { roomId, media }),
  share: (
    roomId: number,
    kind: "post" | "profile" | "community",
    targetId: string,
  ) => rpc("shareInChat", { roomId, kind, targetId }),
};

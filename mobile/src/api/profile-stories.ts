import { rpc } from "./client";
import type { ContentMediaItem, MediaInput } from "./content-types";
import type { StoryLayer } from "./media-v10-types";
export type ProfileStory = {
  id: number;
  caption: string;
  background: string;
  audience: string;
  minimumAge: number;
  contentWarning: string;
  blur: boolean;
  highlighted: boolean;
  hidden: boolean;
  expired: boolean;
  createdAt: string;
  expiresAt: string;
  question: string;
  pollOptions: string[];
  layers:StoryLayer[];
  media: ContentMediaItem | null;
  music: ContentMediaItem | null;
};
export type ProfileStories = {
  mine: boolean;
  ownerId: string;
  handle: string;
  displayName: string;
  stories: ProfileStory[];
};
export type StoryResponses = {
  votes: { optionIndex: number | null; count: number }[];
  mine: { optionIndex: number | null; answer: string } | null;
  answers: string[];
};
export const stories = {
  list: (userId?: string) =>
    rpc<ProfileStories>("getProfileStories", { userId }),
  publish: (d: {
    caption: string;
    background: "violet" | "ocean" | "rose" | "midnight";
    audience: "public" | "followers" | "close_friends";
    minimumAge: 13 | 16 | 18;
    contentWarning: string;
    question: string;
    pollOptions: string[];
    media?: MediaInput;
    music?:MediaInput&{kind:"audio"};
    layers?:StoryLayer[];
  }) => rpc<{ id: number }>("publishProfileStory", d),
  highlight: (storyId: number, highlighted: boolean) =>
    rpc<{ ok: boolean }>("setProfileStoryHighlight", { storyId, highlighted }),
  remove: (storyId: number) =>
    rpc<{ ok: boolean }>("deleteProfileStory", { storyId }),
  responses: (storyId: number) =>
    rpc<StoryResponses>("getProfileStoryResponses", { storyId }),
  respond: (
    storyId: number,
    response: { optionIndex?: number | null; answer?: string },
  ) => rpc<{ ok: boolean }>("respondToProfileStory", { storyId, ...response }),
  report: (storyId: number, reason: string) =>
    rpc<{ ok: boolean }>("reportProfileStory", {
      storyId,
      reason,
      details: "",
    }),
  hide: (storyId: number, hidden: boolean, reason: string) =>
    rpc<{ ok: boolean }>("setProfileStoryHidden", { storyId, hidden, reason }),
};

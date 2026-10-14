import { createContext, useContext } from "react";

/**
 * Things the community layout (`/c/$slug`) owns that its pages can trigger: the ⋯ menu, the post composer,
 * the topics editor, the join form, and a refresh of the community's data after a change.
 */
export type CommunityActions = {
  openMenu: () => void;
  openComposer: () => void;
  openTopics: () => void;
  openJoin: () => void;
  refresh: () => Promise<void>;
};

const noop = () => {};

export const CommunityActionsContext = createContext<CommunityActions>({
  openMenu: noop,
  openComposer: noop,
  openTopics: noop,
  openJoin: noop,
  refresh: async () => {},
});

export function useCommunityActions(): CommunityActions {
  return useContext(CommunityActionsContext);
}

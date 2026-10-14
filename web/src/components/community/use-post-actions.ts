import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { toggleFavorite, toggleLike } from "@/lib/kamino/server";
import type { Post } from "@/lib/kamino/types";

/**
 * Like and save for one post. The heart and bookmark change at once and roll back if the server says no
 * (like the phone app's `usePostActions`). When the post data changes from outside (a refetch), the buttons
 * follow it. Signed-out visitors are sent to sign in.
 */
export function usePostActions(
  post: Pick<Post, "id" | "liked" | "likeCount" | "saved">,
  /**
   * Older pages pass their own like/save handlers (they call the server and reload their list). When given,
   * these are used instead of calling the server here; the buttons still change at once.
   */
  overrides: { onLike?: (id: number) => unknown; onSave?: (id: number) => unknown } = {},
) {
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, setState] = useState({ liked: post.liked, likeCount: post.likeCount, saved: post.saved });
  const [seen, setSeen] = useState(`${post.id}|${post.liked}|${post.likeCount}|${post.saved}`);
  const now = `${post.id}|${post.liked}|${post.likeCount}|${post.saved}`;
  if (now !== seen) {
    setSeen(now);
    setState({ liked: post.liked, likeCount: post.likeCount, saved: post.saved });
  }

  async function like() {
    if (!user) return void navigate({ to: "/login" });
    const before = state;
    setState((s) => ({ ...s, liked: !s.liked, likeCount: Math.max(0, s.likeCount + (s.liked ? -1 : 1)) }));
    try {
      if (overrides.onLike) {
        await overrides.onLike(post.id);
        return;
      }
      const res = await toggleLike({ data: post.id });
      setState((s) => (s.liked === res.liked ? s : { ...s, liked: res.liked }));
    } catch (e) {
      setState(before);
      toast.error(e instanceof Error ? e.message : "Please try again.");
    }
  }

  async function save() {
    if (!user) return void navigate({ to: "/login" });
    const before = state;
    setState((s) => ({ ...s, saved: !s.saved }));
    try {
      if (overrides.onSave) {
        await overrides.onSave(post.id);
        toast.success(before.saved ? "Removed from saved" : "Saved");
        return;
      }
      const res = await toggleFavorite({ data: post.id });
      setState((s) => ({ ...s, saved: res.saved }));
      toast.success(res.saved ? "Saved" : "Removed from saved");
      void queryClient.invalidateQueries({ queryKey: ["saved"] });
    } catch (e) {
      setState(before);
      toast.error(e instanceof Error ? e.message : "Please try again.");
    }
  }

  return { ...state, like, save };
}

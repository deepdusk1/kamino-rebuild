import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/api/endpoints";
import type { Post } from "@/api/types";
import { showError } from "./errors";

/** Like / save with instant feedback: the button changes at once and rolls back if the server says no. */
export function usePostActions(post: Pick<Post, "id" | "liked" | "likeCount" | "saved">) {
  const queryClient = useQueryClient();
  const [liked, setLiked] = useState(post.liked);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [saved, setSaved] = useState(post.saved);

  // The post can arrive after the first render (the post screen loads it from the server).
  // When the server's numbers change, adopt them, otherwise the buttons would keep showing stale values.
  const [seen, setSeen] = useState({ liked: post.liked, likeCount: post.likeCount, saved: post.saved });
  if (seen.liked !== post.liked || seen.likeCount !== post.likeCount || seen.saved !== post.saved) {
    setSeen({ liked: post.liked, likeCount: post.likeCount, saved: post.saved });
    setLiked(post.liked);
    setLikeCount(post.likeCount);
    setSaved(post.saved);
  }

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      await api.like(post.id);
      void queryClient.invalidateQueries({ queryKey: ["post", post.id] });
    } catch (error) {
      setLiked(!next);
      setLikeCount((n) => Math.max(0, n + (next ? -1 : 1)));
      showError(error);
    }
  };

  const toggleSave = async () => {
    const next = !saved;
    setSaved(next);
    try {
      await api.save(post.id);
      void queryClient.invalidateQueries({ queryKey: ["saved"] });
    } catch (error) {
      setSaved(!next);
      showError(error);
    }
  };

  return { liked, likeCount, saved, toggleLike, toggleSave };
}

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { EmptyHint, GradientButton, ScreenTitle } from "@/components/k";
import { PostCard } from "@/components/post-card";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { compactNumber } from "@/lib/format-ui";
import { listFavorites } from "@/lib/kamino/server";

export const Route = createFileRoute("/saved")({ component: Saved });

/** Posts you bookmarked, newest first, in the redesign's card style (same as the phone app). */
function Saved() {
  const { user, isPending } = useCurrentUserState();
  const q = useQuery({ queryKey: ["saved"], queryFn: () => listFavorites(), enabled: !!user });
  if (!isPending && !user) return <RedirectToSignIn />;
  const count = q.data?.length ?? 0;

  return (
    <AppShell>
      <div className="lg:mx-auto lg:max-w-[1000px] lg:pt-2">
        <ScreenTitle
          title="Saved"
          subtitle={
            count
              ? `${compactNumber(count)} post${count === 1 ? "" : "s"} you kept for later. Only you can see this list.`
              : "Posts you keep for later. Only you can see this list."
          }
          className="px-4 lg:px-0"
        />
        <div className="mt-3">
          {isPending || q.isPending ? (
            <div className="space-y-3 px-4 lg:px-0" aria-busy="true" aria-label="Loading saved posts">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-36 animate-pulse rounded-card bg-surface-alt" />
              ))}
            </div>
          ) : q.isError ? (
            <EmptyHint
              icon="😕"
              title="Couldn't load your saved posts"
              text={q.error.message}
              action={
                <GradientButton size="sm" onClick={() => void q.refetch()}>
                  Try again
                </GradientButton>
              }
              className="mx-4 lg:mx-0"
            />
          ) : count === 0 ? (
            <EmptyHint
              icon="🔖"
              title="Nothing saved yet"
              text="Tap Save on any post to keep it here."
              action={
                <GradientButton size="sm" to="/">
                  Find something to read
                </GradientButton>
              }
              className="mx-4 lg:mx-0"
            />
          ) : (
            <div className="space-y-3 px-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0 lg:px-0">
              {q.data.map((post) => (
                <PostCard key={post.id} post={post} communityName={post.communityName} onSave={() => void q.refetch()} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

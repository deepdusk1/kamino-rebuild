import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ChatsOverview } from "@/components/chat/chats-overview";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/chats/")({ component: Chats });

/** Chats & Live Rooms (mockup 08-chats). The screen itself lives in `components/chat/chats-overview.tsx`. */
function Chats() {
  const { user, isPending } = useCurrentUserState();
  if (!isPending && !user) return <RedirectToSignIn />;
  return (
    <AppShell>
      <a href="/inbox-tools" className="mx-4 mt-3 inline-block rounded-full border border-border px-4 py-2 font-bold text-violet">Create a group chat</a>
      <ChatsOverview />
    </AppShell>
  );
}

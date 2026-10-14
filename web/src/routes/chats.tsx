import { Outlet, createFileRoute, useParams } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ChatSidebar } from "@/components/chat/chats-overview";
import { AppHeader } from "@/components/k";

export const Route = createFileRoute("/chats")({ component: ChatsLayout });

/**
 * Chats layout. Without an open conversation the Chats screen fills the page. With one open:
 * - phones: the conversation fills the screen (its own header with a back button, no bottom nav);
 * - computers (1024px and wider): the usual header on top, the chat list on the left and the conversation on the right.
 */
function ChatsLayout() {
  const { roomId } = useParams({ strict: false });
  if (!roomId) return <Outlet />;
  return (
    <AppShell chrome="none">
      <div className="hidden lg:block">
        <AppHeader />
      </div>
      <div className="mx-auto flex h-dvh w-full max-w-[1120px] lg:h-[calc(100dvh-72px)] lg:gap-4 lg:px-4 lg:pb-4">
        <aside className="hidden w-[360px] shrink-0 lg:block" aria-label="Your chats">
          <ChatSidebar activeId={Number(roomId)} />
        </aside>
        <section className="flex min-w-0 flex-1 flex-col lg:overflow-hidden lg:rounded-card lg:border lg:border-border lg:shadow-card">
          <Outlet />
        </section>
      </div>
    </AppShell>
  );
}

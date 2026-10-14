import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  Ellipsis,
  Flame,
  FolderOpen,
  Info,
  LogOut,
  MessagesSquare,
  Palette,
  PenSquare,
  Search,
  Share,
  ShieldCheck,
  Tags,
  Trophy,
  UserRound,
  Users,
  Lock,
  Drama,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Composer } from "@/components/composer";
import { EmptyHint, GradientButton, IconButton } from "@/components/k";
import {
  CommunityActionsContext,
  type CommunityActions,
} from "@/components/community/community-context";
import {
  AboutDialog,
  JoinDialog,
  PersonaDialog,
  TopicsDialog,
} from "@/components/community/community-dialogs";
import {
  CommunityHero,
  CommunityMiniHeader,
  type SectionLink,
} from "@/components/community/community-hero";
import { CommunityTheme } from "@/components/community/community-theme";
import { isLeaderRole, isModRole } from "@/components/community/helpers";
import { ActionMenu, type MenuItem } from "@/components/community/sheet";
import { shareLink } from "@/components/community/share";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { checkInCommunity } from "@/lib/kamino/engagement";
import { getCommunityPage, joinCommunity, leaveCommunity } from "@/lib/kamino/server";
import { communityOverview } from "@/lib/kamino/social";
import type { CommunityModule } from "@/lib/kamino/types";

export const Route = createFileRoute("/c/$slug")({
  loader: ({ params }) => getCommunityPage({ data: { slug: params.slug } }),
  component: CommunityLayout,
});

/** Sections of a community, in the order the small header shows them (when the community has them on). */
const SECTIONS: { key: string; label: string; path: string; module?: CommunityModule }[] = [
  { key: "home", label: "Home", path: "" },
  { key: "chats", label: "Chats", path: "/chats", module: "chats" },
  { key: "wiki", label: "Wiki", path: "/wiki", module: "wiki" },
  { key: "files", label: "Files", path: "/files", module: "files" },
  { key: "events", label: "Events", path: "/events", module: "events" },
  { key: "roleplay", label: "Stories", path: "/roleplay", module: "roleplay" },
  { key: "rank", label: "Rank", path: "/rank", module: "rank" },
  { key: "members", label: "Members", path: "/members", module: "members" },
];

/**
 * Every community page (`/c/<slug>/…`) goes through here.
 * - The community home gets the big header (cover, icon, name, Join, description); its body is in `c/$slug/index`.
 * - Other sections (chats, wiki, events …) get a small header with pills to move between sections.
 * - A post page draws its own header (it has its own ⋯ menu), so here it only gets the community colours.
 * Everything a community has beyond the tabs lives in the ⋯ menu (same items as the phone app). Members can check
 * in, write posts, edit their persona and leave; leaders also edit topics and the look; moderators reach the tools.
 */
function CommunityLayout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { slug } = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useCurrentUserState();
  const page = useQuery({
    queryKey: ["community", slug],
    queryFn: () => getCommunityPage({ data: { slug } }),
    initialData: Route.useLoaderData(),
  });
  const overview = useQuery({
    queryKey: ["communityOverview", slug],
    queryFn: () => communityOverview({ data: { slug } }),
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [busy, setBusy] = useState<"join" | "checkin" | null>(null);

  const base = `/c/${slug}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/\/$/, "") : "";
  const mode = rest === "" ? "home" : rest.startsWith("/p/") ? "post" : "section";

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["community", slug] }),
      queryClient.invalidateQueries({ queryKey: ["communityOverview", slug] }),
    ]);
  }

  const data = page.data;
  const c = data?.community;
  const member = data?.member ?? null;
  const active = member?.status === "active";
  const role = member?.role;
  const canModerate = active && isModRole(role);
  const isLeader = active && isLeaderRole(role);

  async function join() {
    if (!user) return void navigate({ to: "/login" });
    if (!c) return;
    // Private communities (questions, invite codes) use the join form; public ones join straight away.
    if (c.visibility === "private" || (data?.joinQuestions.length ?? 0) > 0) return setJoinOpen(true);
    setBusy("join");
    try {
      const res = await joinCommunity({ data: { slug } });
      if (res.pending)
        toast.success("Request sent", {
          description: "The leaders will review your request. You'll get a notification when you're in.",
        });
      else toast.success(`Welcome to ${c.name}!`);
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ["exploreOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["shell"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not join");
    } finally {
      setBusy(null);
    }
  }

  async function checkIn() {
    setBusy("checkin");
    try {
      const res = await checkInCommunity({ data: { slug } });
      if (!res.already)
        toast.success(`${res.streak}-day streak! 🔥`, { description: "Checked in. See you tomorrow!" });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check in");
    } finally {
      setBusy(null);
    }
  }

  async function leave() {
    if (!confirm("Leave this community? You can join again any time.")) return;
    try {
      await leaveCommunity({ data: slug });
      await refresh();
      void queryClient.invalidateQueries({ queryKey: ["exploreOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["shell"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not leave");
    }
  }

  const actions: CommunityActions = {
    openMenu: () => setMenuOpen(true),
    openComposer: () => setComposerOpen(true),
    openTopics: () => setTopicsOpen(true),
    openJoin: () => void join(),
    refresh,
  };

  // A post page brings its own header; it only needs the community colours and these actions.
  if (mode === "post") {
    return (
      <CommunityActionsContext.Provider value={actions}>
        <CommunityTheme community={c}>
          <Outlet />
        </CommunityTheme>
      </CommunityActionsContext.Provider>
    );
  }

  if (!data || !c) {
    return (
      <AppShell back>
        <EmptyHint icon="🧭" title="Community not found" text="It may have moved or been closed." className="mx-4 mt-6" />
      </AppShell>
    );
  }

  const has = (m?: CommunityModule) => !m || c.modules.includes(m);
  const memberCount = overview.data?.community.memberCount ?? c.memberCount;
  const onlineCount = overview.data?.onlineCount ?? 0;
  const topics = overview.data?.community.topics ?? c.topics;

  const menu: MenuItem[] = [
    ...(active && !member!.checkedInToday
      ? [{ key: "checkin", label: "Check in today", icon: <Flame />, tone: "orange" as const, hint: "Earn reputation and keep your streak", onSelect: () => void checkIn() }]
      : []),
    ...(active ? [{ key: "post", label: "New post", icon: <PenSquare />, onSelect: () => setComposerOpen(true) }] : []),
    ...(has("chats") ? [{ key: "chats", label: "Chat rooms", icon: <MessagesSquare />, tone: "blue" as const, to: `${base}/chats` }] : []),
    ...(has("wiki") ? [{ key: "wiki", label: "Wiki", icon: <BookOpen />, tone: "green" as const, to: `${base}/wiki` }] : []),
    ...(has("files") ? [{ key: "files", label: "Shared files", icon: <FolderOpen />, tone: "orange" as const, to: `${base}/files` }] : []),
    ...(has("events") ? [{ key: "events", label: "Events & challenges", icon: <CalendarDays />, tone: "pink" as const, to: `${base}/events` }] : []),
    ...(has("rank") ? [{ key: "rank", label: "Leaderboard", icon: <Trophy />, tone: "orange" as const, to: `${base}/rank` }] : []),
    ...(has("members") ? [{ key: "members", label: "Members", icon: <Users />, to: `${base}/members` }] : []),
    ...(has("roleplay") ? [{ key: "stories", label: "Stories & role-play", icon: <Drama />, tone: "pink" as const, to: `${base}/roleplay` }] : []),
    { key: "info", label: "About & rules", icon: <Info />, tone: "violet", onSelect: () => setInfoOpen(true) },
    { key: "share", label: "Share community", icon: <Share />, tone: "blue", onSelect: () => void shareLink(c.name, base) },
    ...(active
      ? [{ key: "persona", label: "My persona", icon: <UserRound />, tone: "green" as const, hint: member!.streak ? `${member!.streak}-day check-in streak` : "Your name and bio here", onSelect: () => setPersonaOpen(true) }]
      : []),
    ...(isLeader ? [{ key: "topics", label: "Edit topics", icon: <Tags />, onSelect: () => setTopicsOpen(true) }] : []),
    ...(isLeader ? [{ key: "look", label: "Community look", icon: <Palette />, tone: "pink" as const, hint: "Colours, banner, icon and words", to: `${base}/mod` }] : []),
    ...(canModerate ? [{ key: "mod", label: "Moderation", icon: <ShieldCheck />, tone: "violet" as const, to: `${base}/mod` }] : []),
    ...(active && c.createdBy !== member!.userId
      ? [{ key: "leave", label: "Leave community", icon: <LogOut />, destructive: true, onSelect: () => void leave() }]
      : []),
  ];

  const sections: SectionLink[] = [
    ...SECTIONS.filter((s) => has(s.module)).map((s) => ({
      key: s.key,
      label: s.label,
      to: `${base}${s.path}`,
      active: s.path === "" ? rest === "" : rest.startsWith(s.path),
    })),
    ...(canModerate ? [{ key: "mod", label: "Mod tools", to: `${base}/mod`, active: rest.startsWith("/mod") }] : []),
  ];

  const headerActions = (
    <>
      <Link
        to="/explore"
        hash="search"
        aria-label="Search"
        className="k-focus grid size-11 place-items-center rounded-full text-ink hover:bg-surface-alt"
      >
        <Search className="size-6" strokeWidth={2.2} aria-hidden />
      </Link>
      <IconButton label={`Share ${c.name}`} onClick={() => void shareLink(c.name, base)}>
        <Share className="size-[23px]" strokeWidth={2.2} aria-hidden />
      </IconButton>
      <IconButton label="Community menu" onClick={() => setMenuOpen(true)}>
        <Ellipsis className="size-7" strokeWidth={2.4} aria-hidden />
      </IconButton>
    </>
  );

  const heroProps = {
    community: c,
    member,
    memberCount,
    onlineCount,
    joinBusy: busy === "join",
    onJoin: () => void join(),
    onJoined: () => setMenuOpen(true),
  };

  return (
    <CommunityActionsContext.Provider value={actions}>
      <CommunityTheme community={c}>
        <AppShell back headerActions={headerActions}>
          {mode === "home" ? (
            <CommunityHero
              {...heroProps}
              aside={
                active && !member!.checkedInToday ? (
                  <GradientButton
                    size="sm"
                    gradient="hero"
                    icon={<Flame className="size-4" aria-hidden />}
                    disabled={busy === "checkin"}
                    onClick={() => void checkIn()}
                  >
                    Check in
                  </GradientButton>
                ) : undefined
              }
            />
          ) : (
            <CommunityMiniHeader {...heroProps} sections={sections} />
          )}

          {data.locked ? (
            <div className="px-4 pt-5">
              <EmptyHint
                icon={<Lock className="size-6 text-violet" aria-hidden />}
                title="Private community"
                text={
                  member?.status === "pending"
                    ? "Your request is waiting for a leader. You'll get a notification when you're in."
                    : "Ask to join to see posts, chats and members."
                }
                action={
                  member?.status !== "pending" && member?.status !== "banned" ? (
                    <GradientButton size="sm" onClick={() => (user ? setJoinOpen(true) : void navigate({ to: "/login" }))}>
                      Ask to join
                    </GradientButton>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Outlet />
          )}
        </AppShell>

        {mode === "home" && active && !data.locked ? (
          // New post button (bottom right), above the phone nav.
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            aria-label="New post"
            className="k-focus fixed right-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-full bg-grad-fab text-white shadow-fab transition-transform hover:scale-105 lg:right-[max(24px,calc((100vw-1120px)/2-72px))] lg:bottom-10"
          >
            <PenSquare className="size-6" strokeWidth={2.4} aria-hidden />
          </button>
        ) : null}

        <ActionMenu open={menuOpen} onOpenChange={setMenuOpen} title={c.name} items={menu} />
        <JoinDialog
          open={joinOpen}
          onOpenChange={setJoinOpen}
          community={c}
          questions={data.joinQuestions}
          onJoined={() => void refresh()}
        />
        <AboutDialog open={infoOpen} onOpenChange={setInfoOpen} community={c} />
        {active && personaOpen ? (
          <PersonaDialog
            open={personaOpen}
            onOpenChange={setPersonaOpen}
            slug={slug}
            member={member!}
            onSaved={() => void refresh()}
          />
        ) : null}
        {isLeader && topicsOpen ? (
          <TopicsDialog
            open={topicsOpen}
            onOpenChange={setTopicsOpen}
            slug={slug}
            topics={topics}
            onSaved={() => void refresh()}
          />
        ) : null}
        {composerOpen ? (
          <Composer
            slug={slug}
            onClose={() => setComposerOpen(false)}
            onCreated={(id) => {
              setComposerOpen(false);
              void refresh();
              void navigate({ to: "/c/$slug/p/$postId", params: { slug, postId: String(id) } });
            }}
          />
        ) : null}
      </CommunityTheme>
    </CommunityActionsContext.Provider>
  );
}

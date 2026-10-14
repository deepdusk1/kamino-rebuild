import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useState } from "react";
import {useQuery} from '@tanstack/react-query';
import {getCustomTaxonomy} from '@/lib/kamino/platform-v9';
import { AppShell } from "@/components/app-shell";
import { SheetField, fieldClass } from "@/components/community/sheet";
import { Composer as FullEditor } from "@/components/creator-studio";
import { useMyCommunities } from "@/components/create/my-communities";
import { CREATE_KINDS, type CreateKind } from "@/components/create/compose";
import { Problem, TypeTile } from "@/components/create/parts";
import { PostComposer } from "@/components/create/post-composer";
import { EventSheet, StartRoomSheet } from "@/components/create/sheets";
import { GradientButton } from "@/components/k";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { heroArt } from "@/lib/brand-art";
import { createCommunity } from "@/lib/kamino/server";
import { CATEGORIES, type PostType } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";

type CreateSearch = { slug?: string; type?: "community" };

export const Route = createFileRoute("/new")({
  validateSearch: (search: Record<string, unknown>): CreateSearch => ({
    slug: typeof search.slug === "string" && search.slug ? search.slug : undefined,
    type: search.type === "community" ? "community" : undefined,
  }),
  component: CreateRoute,
});

function CreateRoute() {
  const { user, isPending } = useCurrentUserState();
  if (!isPending && !user) return <RedirectToSignIn />;
  return <Create />;
}

/**
 * Create (mockup 07-create): five type tiles (Post · Story · Community · Live Room · Event) and the "Create a Post"
 * card. Open `/new?slug=<community>` to preselect where the post goes, `/new?type=community` to start a community.
 * Story opens the story editor of the chosen community; Live Room and Event open small panels. Same as the phone.
 */
function Create() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { list } = useMyCommunities();
  const [sheet, setSheet] = useState<null | "live" | "event">(null);
  const [full, setFull] = useState<{ type: PostType; slug: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const showCommunity = search.type === "community";
  const selected: CreateKind = showCommunity ? "community" : "post";
  // The community the post card starts with (for Story, Live Room and Event too).
  const suggested =
    list.find((c) => c.slug === search.slug) ??
    [...list].sort((a, b) => b.memberCount - a.memberCount)[0] ??
    null;

  const onTile = (kind: CreateKind) => {
    setProblem(null);
    if (kind === "post")
      return void navigate({ to: "/new", search: { slug: search.slug }, replace: true });
    if (kind === "community")
      return void navigate({
        to: "/new",
        search: { slug: search.slug, type: "community" },
        replace: true,
      });
    if (kind === "live") return setSheet("live");
    if (kind === "event") return setSheet("event");
    // Story: the story editor of the chosen community (pictures with captions that disappear after 24 hours).
    if (!suggested) return setProblem("Join a community first, then share a story there.");
    setFull({ type: "story", slug: suggested.slug });
  };

  return (
    <AppShell>
      <a href="/content-studio" className="mx-4 mt-3 inline-block rounded-full border border-border px-4 py-2 font-bold text-violet">Video, audio, stories & portfolio</a>
      <div className="mx-auto max-w-[820px] px-2.5 lg:px-4">
        {/* ── Title, subline and soft artwork ── */}
        <div className="relative min-h-[84px] px-1 lg:min-h-[150px]">
          <img
            src={heroArt.create}
            alt=""
            aria-hidden
            className="absolute top-[-2px] right-0.5 h-[82px] w-[52%] rounded-[16px] object-cover dark:opacity-35 lg:h-[146px] lg:w-[50%] lg:rounded-[22px]"
          />
          <h1 className="relative text-[30px] leading-9 font-extrabold tracking-[-0.6px] text-ink lg:pt-4 lg:text-[44px] lg:leading-[52px]">
            Create
          </h1>
          <p className="relative mt-1.5 max-w-[70%] text-[13px] leading-[15px] text-muted lg:max-w-[46%] lg:text-[16px] lg:leading-[22px]">
            Share your ideas, start something new, and bring people together.
          </p>
        </div>

        {/* ── Type tiles ── */}
        <div
          className="mt-2.5 flex gap-1.5 lg:mt-4 lg:gap-3"
          role="group"
          aria-label="What do you want to create?"
        >
          {CREATE_KINDS.map((k) => (
            <TypeTile
              key={k.key}
              kind={k.key}
              label={k.label}
              hint={k.hint}
              selected={k.key === selected}
              onClick={() => onTile(k.key)}
              className={
                k.key === "post" ? "flex-[0.86]" : k.key === "story" ? "flex-[0.9]" : "flex-1"
              }
            />
          ))}
        </div>

        {problem ? (
          <div className="mt-2.5">
            <Problem>{problem}</Problem>
          </div>
        ) : null}

        <section className="mt-2.5 rounded-card border border-border bg-surface p-3 pt-[13px] shadow-card lg:mt-4 lg:p-6">
          {showCommunity ? (
            <CommunityForm />
          ) : (
            <PostComposer
              slug={search.slug}
              onFullEditor={(type, slug) => setFull({ type, slug })}
            />
          )}
        </section>
      </div>

      <StartRoomSheet
        open={sheet === "live"}
        onOpenChange={(o) => setSheet(o ? "live" : null)}
        initialSlug={suggested?.slug}
      />
      <EventSheet
        open={sheet === "event"}
        onOpenChange={(o) => setSheet(o ? "event" : null)}
        initialSlug={suggested?.slug}
        onStartCommunity={() => void navigate({ to: "/new", search: { type: "community" } })}
      />
      {full ? (
        <FullEditor
          slug={full.slug}
          initialType={full.type}
          onClose={() => setFull(null)}
          onCreated={(id) => {
            const slug = full.slug;
            setFull(null);
            void navigate({ to: "/c/$slug/p/$postId", params: { slug, postId: String(id) } });
          }}
        />
      ) : null}
    </AppShell>
  );
}

/** "Create a Community": name, tagline, description, category, who can join, age and house rules. */
function CommunityForm() {
  const taxonomy=useQuery({queryKey:['customTaxonomy'],queryFn:()=>getCustomTaxonomy()});
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const select = cn(fieldClass, "h-12 appearance-auto");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true);
        setError(null);
        void createCommunity({
          data: {
            name: String(fd.get("name")),
            tagline: String(fd.get("tagline")),
            description: String(fd.get("description")),
            category: String(fd.get("category")),
            visibility: String(fd.get("visibility")) as "public" | "private" | "unlisted",
            // Kamino is 18+ only, so every community is 18+. No age choice is offered.
            ageGate: 18,
            rules: String(fd.get("rules")),
          },
        })
          .then((r) => navigate({ to: "/c/$slug", params: { slug: r.id } }))
          .catch((err) =>
            setError(
              err instanceof Error
                ? err.message
                : "Could not create the community. Please try again.",
            ),
          )
          .finally(() => setBusy(false));
      }}
    >
      <div>
        <h2 className="text-[17px] leading-[22px] font-extrabold tracking-[-0.2px] text-ink lg:text-[22px] lg:leading-7">
          Create a Community
        </h2>
        <p className="text-[11.5px] leading-[15px] text-muted lg:text-[14.5px] lg:leading-5">
          Start a home for your people. You’ll be its leader. Public communities are listed, private
          ones ask to join, unlisted ones are link-only.
        </p>
      </div>
      <SheetField label="Name">
        <input
          name="name"
          required
          minLength={3}
          maxLength={60}
          placeholder="Cozy Corner"
          className={fieldClass}
        />
      </SheetField>
      <SheetField label="Tagline">
        <input
          name="tagline"
          maxLength={120}
          placeholder="A short line people see first"
          className={fieldClass}
        />
      </SheetField>
      <SheetField label="What happens here">
        <textarea
          name="description"
          rows={3}
          placeholder="Tell people what this community is about"
          className={fieldClass}
        />
      </SheetField>
      <div className="grid gap-3 sm:grid-cols-3">
        <SheetField label="Category">
          <select name="category" className={select} defaultValue="Anime">
            {[...CATEGORIES,...(taxonomy.data??[]).map(t=>String(t.label))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </SheetField>
        <SheetField label="Who can join">
          <select name="visibility" className={select} defaultValue="public">
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private (join requests)</option>
          </select>
        </SheetField>
        <SheetField label="Age">
          <p className="flex h-12 items-center gap-2 text-[15px] font-bold text-ink">
            18+
            <span className="text-[12.5px] font-medium text-muted">Kamino is 18+ only, so every community is too.</span>
          </p>
        </SheetField>
      </div>
      <SheetField label="House rules">
        <textarea name="rules" rows={3} placeholder="Be kind. No spam. …" className={fieldClass} />
      </SheetField>
      {error ? <Problem>{error}</Problem> : null}
      <GradientButton
        type="submit"
        gradient="publish"
        full
        disabled={busy}
        icon={<Users className="size-5" aria-hidden />}
        className="h-11 text-[16px] lg:h-12 lg:text-[17px]"
      >
        {busy ? "Creating…" : "Create community"}
      </GradientButton>
    </form>
  );
}

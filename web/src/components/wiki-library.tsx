import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, Plus, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { Composer } from "./composer";
import { EmptyHint, FilterPills, GradientButton, OutlineButton, Pill, SearchField } from "@/components/k";
import { fieldClass } from "@/components/community/sheet";
import { getWiki, reviewWiki, submitWiki } from "@/lib/kamino/server";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function WikiLibrary({ slug }: { slug: string }) {
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("library");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const q = useQuery({
    queryKey: ["wiki", slug, user?.id],
    queryFn: () => getWiki({ data: slug }),
  });
  const entries = q.data?.entries ?? [];
  const member = q.data?.member?.status === "active" ? q.data.member : null;
  const mod = member && ["agent", "leader", "curator"].includes(member.role);
  const cats = [...new Set(entries.map((e) => e.payload.category || "General"))].sort();
  const shown = entries.filter(
    (e) =>
      (filter === "library"
        ? e.wikiStatus === "approved"
        : filter === "mine"
          ? e.author.userId === user?.id
          : filter === "review"
            ? e.wikiStatus === "pending"
            : true) &&
      (!category || (e.payload.category || "General") === category) &&
      `${e.title} ${e.body} ${e.author.nickname}`.toLowerCase().includes(search.toLowerCase()),
  );
  async function act(id: number, action: () => Promise<unknown>) {
    if (pending !== null) return;
    setPending(id);
    try {
      await action();
      await q.refetch();
      toast.success("Wiki updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update wiki");
    } finally {
      setPending(null);
    }
  }
  if (q.error)
    return (
      <div className="px-4 py-6">
        <EmptyHint icon="☁️" title="The wiki didn't load" text={q.error.message} />
      </div>
    );
  if (q.data?.locked)
    return (
      <div className="px-4 py-6">
        <EmptyHint icon="🔒" title="Members only" text="Join this community to open its wiki." />
      </div>
    );
  const pendingCount = entries.filter((e) => e.wikiStatus === "pending").length;
  return (
    <div className="space-y-4 px-4 py-4 lg:space-y-5 lg:py-6">
      <div className="relative overflow-hidden rounded-hero bg-[linear-gradient(120deg,var(--color-tint-green),var(--color-tint-blue)_60%,var(--color-tint-violet))] p-5 lg:p-8">
        <span className="grid size-11 place-items-center rounded-full bg-surface text-green-ink shadow-card" aria-hidden>
          <BookOpen className="size-6" />
        </span>
        <p className="mt-3 text-[12px] font-bold tracking-[0.12em] text-green-ink uppercase">Made by the community</p>
        <h1 className="mt-1 text-[24px] leading-tight font-extrabold tracking-[-0.02em] text-ink lg:text-[32px]">
          A home for everything you know.
        </h1>
        <p className="mt-1.5 max-w-lg text-[13.5px] text-body lg:text-[15px]">
          Character lore, thoughtful guides, and stories worth keeping. Submit your page for a place in the
          community library.
        </p>
        {member && user && (
          <GradientButton className="mt-4" size="sm" icon={<Plus className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
            Create a wiki page
          </GradientButton>
        )}
      </div>
      <FilterPills
        label="Which pages"
        value={filter}
        onChange={setFilter}
        items={[
          { key: "library", label: "Community library" },
          { key: "all", label: "All pages" },
          ...(user ? [{ key: "mine", label: "My pages" }] : []),
          ...(mod ? [{ key: "review", label: `Review queue (${pendingCount})` }] : []),
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <SearchField
          value={search}
          onChange={setSearch}
          label="Search wiki pages"
          placeholder="Search lore, guides, creators…"
          className="min-w-[220px] flex-1"
        />
        <select
          aria-label="Wiki category filter"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="k-focus h-10 max-w-full rounded-[14px] border border-border bg-surface px-3 text-[14px] text-ink shadow-card lg:h-12"
        >
          <option value="">All categories</option>
          {cats.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {q.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Opening the library">
          <div className="h-40 animate-pulse rounded-card bg-surface-alt" />
          <div className="h-40 animate-pulse rounded-card bg-surface-alt" />
        </div>
      ) : !shown.length ? (
        <EmptyHint
          icon="📚"
          title={search || category ? "No matching pages" : "No pages here yet"}
          text={
            search || category
              ? "Try another search or category."
              : filter === "library"
                ? "Approved pages appear here. Look in All pages to find more."
                : "Try a different search or create the first page."
          }
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {shown.map((e) => (
          <article key={e.id} className="k-card relative flex min-w-0 flex-col overflow-hidden rounded-card">
            {e.cover && !e.contentWarning && (
              <img src={e.cover} alt="" className="aspect-[2.2] w-full object-cover" loading="lazy" />
            )}
            <div className="flex flex-1 flex-col p-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Pill tone="green" className="max-w-[60%] truncate">
                  {e.payload.category || "General"}
                </Pill>
                <span className="flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-muted">
                  {e.wikiStatus === "approved" ? (
                    <>
                      <CheckCircle2 className="size-3.5 text-green-ink" aria-hidden />
                      In the library
                    </>
                  ) : e.wikiStatus === "pending" ? (
                    <>
                      <Clock className="size-3.5 text-orange-ink" aria-hidden />
                      In review
                    </>
                  ) : (
                    "Community page"
                  )}
                </span>
              </div>
              <Link
                to="/c/$slug/p/$postId"
                params={{ slug, postId: String(e.id) }}
                className="k-focus text-[16px] leading-snug font-extrabold text-ink hover:text-violet"
              >
                {e.title}
              </Link>
              <p className="mt-1.5 line-clamp-3 text-[13px] leading-[19px] break-words text-muted">
                {e.contentWarning ? `Content warning: ${e.contentWarning}` : e.body}
              </p>
              <p className="mt-2.5 text-[12px] text-subtle">By {e.author.nickname}</p>
              {e.author.userId === user?.id && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  {e.wikiReviewNote && <p className="text-[12.5px] text-muted">Review feedback: {e.wikiReviewNote}</p>}
                  {["draft", "rejected"].includes(e.wikiStatus) && (
                    <OutlineButton
                      size="sm"
                      disabled={pending !== null}
                      onClick={() => void act(e.id, () => submitWiki({ data: e.id }))}
                    >
                      Submit to library
                    </OutlineButton>
                  )}
                </div>
              )}
              {mod && e.wikiStatus === "pending" && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <input
                    aria-label={`Review feedback for ${e.title}`}
                    maxLength={500}
                    value={notes[e.id] ?? ""}
                    onChange={(ev) => setNotes({ ...notes, [e.id]: ev.target.value })}
                    className={fieldClass}
                    placeholder="Helpful feedback (optional)"
                  />
                  <div className="flex flex-wrap gap-2">
                    <GradientButton
                      size="sm"
                      disabled={pending !== null}
                      onClick={() =>
                        void act(e.id, () =>
                          reviewWiki({ data: { postId: e.id, decision: "approved", note: notes[e.id] } }),
                        )
                      }
                    >
                      Approve
                    </GradientButton>
                    <OutlineButton
                      size="sm"
                      disabled={pending !== null}
                      onClick={() =>
                        void act(e.id, () =>
                          reviewWiki({ data: { postId: e.id, decision: "rejected", note: notes[e.id] } }),
                        )
                      }
                    >
                      Request changes
                    </OutlineButton>
                  </div>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {open && (
        <Composer
          slug={slug}
          initialType="wiki"
          onClose={() => setOpen(false)}
          onCreated={(id) => {
            setOpen(false);
            void q.refetch();
            void navigate({ to: "/c/$slug/p/$postId", params: { slug, postId: String(id) } });
          }}
        />
      )}
    </div>
  );
}

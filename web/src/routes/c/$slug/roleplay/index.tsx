import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Drama, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createScene, draftScene, getAiStatus, listScenes } from "@/lib/kamino/ai-features";
import { HELD_MESSAGE } from "@/lib/kamino/held";
import { getCommunityPage } from "@/lib/kamino/server";
import { cn, timeAgo } from "@/lib/utils";

export const Route = createFileRoute("/c/$slug/roleplay/")({ component: Stories });

type CharacterDraft = { name: string; description: string };
const field = "w-full rounded-lg bg-elevated px-3 py-2 text-sm";

/** A community's role-play stories, and the form to start one (by hand, or set up by the AI storyteller). */
function Stories() {
  const { slug } = Route.useParams();
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scenes = useQuery({
    queryKey: ["scenes", slug],
    queryFn: () => listScenes({ data: { slug } }),
  });
  const ai = useQuery({ queryKey: ["ai-status"], queryFn: () => getAiStatus() });
  const page = useQuery({
    queryKey: ["community", slug],
    queryFn: () => getCommunityPage({ data: { slug } }),
  });
  // Who is signed in is only known in the browser, so member-only parts appear after the page has loaded there.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isMember = mounted && page.data?.member?.status === "active";

  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [idea, setIdea] = useState("");
  const [title, setTitle] = useState("");
  const [premise, setPremise] = useState("");
  const [characters, setCharacters] = useState<CharacterDraft[]>([{ name: "", description: "" }]);
  const [opening, setOpening] = useState("");
  const [playAs, setPlayAs] = useState("");
  const [busy, setBusy] = useState<"draft" | "create" | null>(null);

  async function draft() {
    setBusy("draft");
    try {
      const d = await draftScene({ data: { slug, source, idea } });
      setTitle(d.title);
      setPremise(d.premise);
      setCharacters(d.characters);
      setOpening(d.opening);
      setPlayAs(d.characters[0]?.name ?? "");
      toast.success("The storyteller set it up. Change anything you like, then start.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The storyteller could not set it up");
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    setBusy("create");
    try {
      const res = await createScene({
        data: {
          slug,
          title,
          source,
          premise,
          characters: characters.filter((c) => c.name.trim()),
          opening: opening || undefined,
          playAs: playAs || undefined,
        },
      });
      if (res.held) toast.info(HELD_MESSAGE);
      if (res.aiError) toast.info(res.aiError);
      await queryClient.invalidateQueries({ queryKey: ["scenes", slug] });
      void navigate({
        to: "/c/$slug/roleplay/$sceneId",
        params: { slug, sceneId: String(res.id) },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the story");
    } finally {
      setBusy(null);
    }
  }

  const named = characters.filter((c) => c.name.trim());

  return (
    <div className="space-y-5 px-4 py-5">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
            <Drama className="size-5 text-accent" /> Stories
          </h2>
          <p className="text-sm text-muted">
            Play characters from the stories and films you love, and change how they end. Members
            write their character's lines;{" "}
            {ai.data?.storyteller
              ? "the AI storyteller narrates the rest."
              : "the AI storyteller is not set up on this server yet, so members narrate."}
          </p>
        </div>
        {user && isMember ? (
          <Button onClick={() => setOpen((v) => !v)} variant={open ? "secondary" : "primary"}>
            <Plus className="size-4" /> New story
          </Button>
        ) : null}
      </header>

      {open ? (
        <section aria-label="Start a story" className="glass-card space-y-3 rounded-2xl p-4">
          {ai.data?.storyteller ? (
            <div className="space-y-2 rounded-xl bg-accent/10 p-3">
              <p className="text-sm font-bold">Let the storyteller set it up</p>
              <input
                className={field}
                maxLength={80}
                placeholder="Inspired by (a book, film, game…) — optional"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                aria-label="Inspired by"
              />
              <textarea
                className={field}
                rows={2}
                maxLength={400}
                placeholder="Your idea, e.g. “the ship never sinks and everyone arrives in New York”"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                aria-label="Your idea"
              />
              <Button
                size="sm"
                disabled={busy !== null || idea.trim().length < 5}
                onClick={() => void draft()}
              >
                <Sparkles className="size-4" />{" "}
                {busy === "draft" ? "Setting it up…" : "Set it up for me"}
              </Button>
            </div>
          ) : null}
          <input
            className={field}
            maxLength={80}
            placeholder="Story title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Story title"
          />
          {!ai.data?.storyteller ? (
            <input
              className={field}
              maxLength={80}
              placeholder="Inspired by (optional)"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              aria-label="Inspired by"
            />
          ) : null}
          <textarea
            className={field}
            rows={3}
            maxLength={1500}
            placeholder="The situation, and what is different from the original"
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            aria-label="Premise"
          />
          <div className="space-y-2">
            <p className="text-xs font-bold">Characters people can play</p>
            {characters.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={cn(field, "max-w-[11rem]")}
                  maxLength={40}
                  placeholder="Name"
                  value={c.name}
                  aria-label={`Character ${i + 1} name`}
                  onChange={(e) =>
                    setCharacters((all) =>
                      all.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className={field}
                  maxLength={200}
                  placeholder="Who they are"
                  value={c.description}
                  aria-label={`Character ${i + 1} description`}
                  onChange={(e) =>
                    setCharacters((all) =>
                      all.map((x, n) => (n === i ? { ...x, description: e.target.value } : x)),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={`Remove character ${i + 1}`}
                  className="p-2 text-danger disabled:opacity-30"
                  disabled={characters.length === 1}
                  onClick={() => setCharacters((all) => all.filter((_, n) => n !== i))}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {characters.length < 8 ? (
              <button
                type="button"
                className="text-xs font-bold text-accent"
                onClick={() => setCharacters((all) => [...all, { name: "", description: "" }])}
              >
                + Add character
              </button>
            ) : null}
          </div>
          {named.length ? (
            <label className="block text-sm">
              <span className="text-xs font-bold">I'll play</span>
              <select className={field} value={playAs} onChange={(e) => setPlayAs(e.target.value)}>
                <option value="">Nobody yet</option>
                {named.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {opening ? (
            <p className="rounded-lg bg-elevated p-3 text-sm italic text-muted">{opening}</p>
          ) : null}
          <Button
            disabled={
              busy !== null ||
              title.trim().length < 3 ||
              premise.trim().length < 10 ||
              !named.length
            }
            onClick={() => void create()}
          >
            {busy === "create" ? "Starting…" : "Start the story"}
          </Button>
        </section>
      ) : null}

      {scenes.error ? <p className="text-sm text-warn">{(scenes.error as Error).message}</p> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {(scenes.data ?? []).map((s) => (
          <li key={s.id}>
            <Link
              to="/c/$slug/roleplay/$sceneId"
              params={{ slug, sceneId: String(s.id) }}
              className="block h-full rounded-2xl bg-surface p-4 shadow-border transition-shadow hover:shadow-lg"
            >
              <div className="flex items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">
                  {s.title}
                </h3>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-bold",
                    s.status === "open" ? "bg-accent/15 text-accent" : "bg-elevated text-muted",
                  )}
                >
                  {s.status === "open" ? "Open" : "Ended"}
                </span>
              </div>
              {s.source ? <p className="text-xs text-subtle">Inspired by {s.source}</p> : null}
              <p className="mt-2 line-clamp-3 text-sm text-muted">{s.premise}</p>
              <p className="mt-3 text-xs text-subtle">
                {s.castCount} playing · {s.turnCount} turns
                {s.endingCount ? ` · ${s.endingCount} endings` : ""} · by {s.creatorName} ·{" "}
                {timeAgo(s.updatedAt)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {!scenes.isPending && !(scenes.data ?? []).length ? (
        <p className="py-10 text-center text-sm text-muted">
          No stories yet. {isMember ? "Start the first one!" : "Join the community to start one."}
        </p>
      ) : null}
    </div>
  );
}

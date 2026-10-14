import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, BookOpenCheck, Feather, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Face } from "@/components/face";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  addTurn,
  continueScene,
  deleteScene,
  endScene,
  getAiStatus,
  getScene,
  joinScene,
  leaveScene,
  writeEnding,
} from "@/lib/kamino/ai-features";
import { HELD_MESSAGE } from "@/lib/kamino/held";
import type { RoleplayTurn } from "@/lib/kamino/types";
import { cn, timeAgo } from "@/lib/utils";

export const Route = createFileRoute("/c/$slug/roleplay/$sceneId")({ component: Scene });

const field = "w-full rounded-lg bg-elevated px-3 py-2 text-sm";

/** One role-play story: the cast, the story so far, and (for its players) the turn box and storyteller buttons. */
function Scene() {
  const { slug, sceneId } = Route.useParams();
  const id = Number(sceneId);
  const navigate = useNavigate();
  const { user } = useCurrentUserState();
  const q = useQuery({
    queryKey: ["scene", id],
    queryFn: () => getScene({ data: { sceneId: id } }),
    refetchInterval: 5000,
  });
  const ai = useQuery({ queryKey: ["ai-status"], queryFn: () => getAiStatus() });
  const [text, setText] = useState("");
  const [narrate, setNarrate] = useState(true);
  const [nudge, setNudge] = useState("");
  const [ending, setEnding] = useState("");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const turnCount = q.data?.turns.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turnCount]);

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    try {
      await action();
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  if (q.error)
    return (
      <p className="px-4 py-12 text-center text-sm text-muted">{(q.error as Error).message}</p>
    );
  const s = q.data;
  if (!s) return <p className="px-4 py-12 text-center text-sm text-muted">Loading the story…</p>;
  const storyteller = Boolean(ai.data?.storyteller);
  const playing = Boolean(s.myCharacter);
  const open = s.status === "open";

  return (
    <div className="space-y-5 px-4 py-5">
      <Link
        to="/c/$slug/roleplay"
        params={{ slug }}
        className="inline-flex items-center gap-1 text-sm font-bold text-accent"
      >
        <ArrowLeft className="size-4" /> All stories
      </Link>
      <header>
        <h2 className="font-display text-2xl font-semibold">{s.title}</h2>
        {s.source ? <p className="text-xs text-subtle">Inspired by {s.source}</p> : null}
        <p className="mt-2 text-sm text-muted">{s.premise}</p>
        {!open ? (
          <p className="mt-2 text-sm font-bold text-muted">
            This story has ended. You can still read it.
          </p>
        ) : null}
      </header>

      <section aria-label="Characters" className="flex flex-wrap gap-2">
        {s.characters.map((c) => {
          const mine = c.playedBy?.userId === user?.id;
          const free = !c.playedBy;
          return (
            <div
              key={c.name}
              className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                mine ? "border-accent bg-accent/10" : "border-border bg-surface",
              )}
            >
              <p className="font-bold">{c.name}</p>
              {c.description ? (
                <p className="max-w-[16rem] text-xs text-muted">{c.description}</p>
              ) : null}
              <p className="mt-1 text-xs text-subtle">
                {c.playedBy
                  ? `Played by ${mine ? "you" : c.playedBy.name}`
                  : storyteller
                    ? "Voiced by the storyteller"
                    : "Free to play"}
              </p>
              {free && s.canPlay && user ? (
                <button
                  type="button"
                  className="mt-1 text-xs font-bold text-accent"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("join", () => joinScene({ data: { sceneId: id, character: c.name } }))
                  }
                >
                  Play as {c.name}
                </button>
              ) : null}
            </div>
          );
        })}
      </section>
      {s.canPlay && user && !playing ? (
        <div className="flex gap-2">
          <input
            className={field}
            maxLength={40}
            placeholder="Or add your own character"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            aria-label="Your own character"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null || custom.trim().length < 2}
            onClick={() =>
              void run("join", async () => {
                await joinScene({ data: { sceneId: id, character: custom } });
                setCustom("");
              })
            }
          >
            Join
          </Button>
        </div>
      ) : null}

      <ol className="space-y-3" aria-label="The story so far">
        {s.turns.map((t) => (
          <Turn key={t.id} turn={t} />
        ))}
        {!s.turns.length ? <li className="text-sm text-muted">Nothing has happened yet.</li> : null}
      </ol>
      <div ref={endRef} />

      {open && playing ? (
        <section aria-label="Your turn" className="glass-card space-y-2 rounded-2xl p-4">
          <label className="block text-xs font-bold" htmlFor="turn">
            What does {s.myCharacter} say or do?
          </label>
          <textarea
            id="turn"
            className={field}
            rows={3}
            maxLength={1200}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`${s.myCharacter} steps forward and…`}
          />
          <div className="flex flex-wrap items-center gap-3">
            {storyteller ? (
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={narrate}
                  onChange={(e) => setNarrate(e.target.checked)}
                />
                The storyteller continues after my turn
              </label>
            ) : null}
            <Button
              className="ml-auto"
              disabled={busy !== null || !text.trim()}
              onClick={() =>
                void run("turn", async () => {
                  const res = await addTurn({ data: { sceneId: id, body: text, narrate } });
                  if (res.held) toast.info(HELD_MESSAGE);
                  if (res.aiError) toast.info(res.aiError);
                  setText("");
                })
              }
            >
              <Feather className="size-4" />{" "}
              {busy === "turn"
                ? narrate && storyteller
                  ? "The storyteller is writing…"
                  : "Sending…"
                : "Play my turn"}
            </Button>
          </div>
          <button
            type="button"
            className="text-xs text-muted underline"
            disabled={busy !== null}
            onClick={() => void run("leave", () => leaveScene({ data: { sceneId: id } }))}
          >
            Stop playing {s.myCharacter}
          </button>
        </section>
      ) : null}

      {open && (playing || s.canManage) && storyteller ? (
        <section aria-label="Storyteller" className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-border">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Sparkles className="size-4 text-accent" /> What happens next?
            </p>
            <input
              className={field}
              maxLength={200}
              placeholder="Optional twist, e.g. “a storm hits”"
              value={nudge}
              onChange={(e) => setNudge(e.target.value)}
              aria-label="Twist"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() =>
                void run("next", async () => {
                  await continueScene({ data: { sceneId: id, nudge } });
                  setNudge("");
                })
              }
            >
              {busy === "next" ? "Writing…" : "Continue the story"}
            </Button>
          </div>
          <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-border">
            <p className="flex items-center gap-2 text-sm font-bold">
              <BookOpenCheck className="size-4 text-accent" /> Change the ending
            </p>
            <input
              className={field}
              maxLength={300}
              placeholder="How should it end? e.g. “the villain becomes a hero”"
              value={ending}
              onChange={(e) => setEnding(e.target.value)}
              aria-label="Ending"
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null || ending.trim().length < 5}
              onClick={() =>
                void run("ending", async () => {
                  await writeEnding({ data: { sceneId: id, direction: ending } });
                  setEnding("");
                })
              }
            >
              {busy === "ending" ? "Writing the ending…" : "Write this ending"}
            </Button>
          </div>
        </section>
      ) : null}
      {storyteller && ai.data ? (
        <p className="text-xs text-subtle">
          The free storyteller has {ai.data.repliesLeft} replies left today for everyone on this
          server.
        </p>
      ) : null}

      {s.canManage ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {open ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void run("end", () => endScene({ data: { sceneId: id } }))}
            >
              End the story
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={() => {
              if (!confirm("Delete this story for everyone?")) return;
              void deleteScene({ data: { sceneId: id } })
                .then(() => navigate({ to: "/c/$slug/roleplay", params: { slug } }))
                .catch((e) => toast.error(e instanceof Error ? e.message : "Could not delete"));
            }}
          >
            Delete
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Turn({ turn }: { turn: RoleplayTurn }) {
  if (turn.kind === "ending") {
    return (
      <li className="rounded-2xl border-2 border-accent/40 bg-accent/5 p-4">
        <p className="text-xs font-bold tracking-wide text-accent uppercase">An alternate ending</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{turn.body}</p>
      </li>
    );
  }
  if (turn.kind === "narration" || !turn.author) {
    return (
      <li className="rounded-2xl bg-elevated/60 p-4">
        <p className="text-xs font-bold text-subtle">Storyteller</p>
        <p className="mt-1 whitespace-pre-wrap font-serif text-sm leading-relaxed italic">
          {turn.body}
        </p>
      </li>
    );
  }
  return (
    <li className="flex gap-3">
      <Face
        name={turn.author.name}
        hue={turn.author.hue}
        userId={turn.author.userId}
        version={turn.author.avatarV}
      />
      <div className="min-w-0 flex-1 rounded-2xl bg-surface p-3 shadow-border">
        <p className="text-sm">
          <span className="font-bold">{turn.character}</span>{" "}
          <span className="text-xs text-subtle">
            played by {turn.author.name} · {timeAgo(turn.createdAt)}
          </span>
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{turn.body}</p>
      </div>
    </li>
  );
}

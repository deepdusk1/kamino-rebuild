import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getCollaborations,
  saveCollaborationBrief,
  proposeCollaboration,
  decideCollaboration,
} from "@/lib/kamino/platform-v9";
import { fieldClass } from "@/components/community/sheet";
export function Collaborations({ browse = false }: { browse?: boolean }) {
  const q = useQuery({
    queryKey: ["collaborations"],
    queryFn: () => getCollaborations(),
    retry: false,
  });
  const [title, setTitle] = useState(""),
    [brief, setBrief] = useState(""),
    [budgetNote, setBudgetNote] = useState(""),
    [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      await q.refetch();
      toast.success("Collaboration updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  };
  const box = "space-y-3 rounded-card border border-border bg-surface p-5";
  if (q.isError)
    return (
      <section className={box}>
        <h2 className="font-bold">Collaborations</h2>
        <p className="text-muted">{q.error.message}</p>
      </section>
    );
  if (!q.data) return null;
  return (
    <section className="space-y-4">
      <div className={box}>
        <h2 className="text-xl font-extrabold">
          {browse ? "Brand & creator collaborations" : "Your collaborations"}
        </h2>
        <p className="text-sm text-muted">
          Share a brief, send a proposal, and track the response. Accepting a proposal does not
          collect or send money.
        </p>
      </div>
      {browse ? (
        q.data.open.map((b) => (
          <div className={box} key={Number(b.id)}>
            <h3 className="font-bold">{String(b.title)}</h3>
            <a href={`/u/${b.handle}`} className="text-violet">
              @{String(b.handle)}
            </a>
            <p className="whitespace-pre-wrap">{String(b.brief)}</p>
            <p>{String(b.budget_note)}</p>
            {String(b.owner_id) !== q.data.userId ? (
              <Proposal briefId={Number(b.id)} run={run} busy={busy} />
            ) : null}
          </div>
        ))
      ) : (
        <>
          <form
            className={box}
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await saveCollaborationBrief({ data: { title, brief, budgetNote, open: true } });
                setTitle("");
                setBrief("");
                setBudgetNote("");
              });
            }}
          >
            <h3 className="font-bold">Post an open brief</h3>
            <p className="text-sm text-muted">
              Open briefs are shown with public profiles. Include deliverables and expectations.
            </p>
            <label className="block">
              Title
              <input
                className={fieldClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={3}
                maxLength={100}
              />
            </label>
            <label className="block">
              Brief
              <textarea
                className={fieldClass}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                required
                minLength={20}
                maxLength={4000}
                rows={4}
              />
            </label>
            <label className="block">
              Budget / terms
              <input
                className={fieldClass}
                value={budgetNote}
                onChange={(e) => setBudgetNote(e.target.value)}
                maxLength={200}
              />
            </label>
            <button
              className="k-focus min-h-11 rounded-full bg-violet px-5 text-white"
              disabled={busy}
            >
              Post brief
            </button>
          </form>
          {q.data.mine.map((b) => (
            <div className={box} key={Number(b.id)}>
              <h3 className="font-bold">{String(b.title)}</h3>
              <p>{String(b.brief)}</p>
              <p>{b.open ? "Open for proposals" : "Closed"}</p>
              <button
                className="k-focus min-h-11 font-bold text-violet"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    saveCollaborationBrief({
                      data: {
                        id: Number(b.id),
                        title: String(b.title),
                        brief: String(b.brief),
                        budgetNote: String(b.budget_note),
                        open: !b.open,
                      },
                    }),
                  )
                }
              >
                {b.open ? "Close brief" : "Reopen brief"}
              </button>
            </div>
          ))}
          <div className={box}>
            <h3 className="font-bold">Proposals</h3>
            {!q.data.proposals.length ? <p>No proposals yet.</p> : null}
            {q.data.proposals.map((p) => (
              <article className="space-y-2 border-t border-border py-3" key={Number(p.id)}>
                <h4 className="font-bold">{String(p.title)}</h4>
                <a href={`/u/${p.handle}`} className="text-violet">
                  @{String(p.handle)}
                </a>
                <p className="whitespace-pre-wrap">{String(p.introduction)}</p>
                <p>{String(p.status)}</p>
                {p.status === "pending" ? (
                  String(p.owner_id) === q.data.userId ? (
                    <div className="flex gap-4">
                      {(["accepted", "declined"] as const).map((action) => (
                        <button
                          key={action}
                          className="k-focus min-h-11 font-bold text-violet"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              decideCollaboration({ data: { id: Number(p.id), action } }),
                            )
                          }
                        >
                          {action === "accepted" ? "Accept" : "Decline"}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      className="k-focus min-h-11 text-muted"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          decideCollaboration({ data: { id: Number(p.id), action: "withdrawn" } }),
                        )
                      }
                    >
                      Withdraw
                    </button>
                  )
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
function Proposal({
  briefId,
  run,
  busy,
}: {
  briefId: number;
  run: (work: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await proposeCollaboration({ data: { briefId, introduction: text } });
          setText("");
        });
      }}
    >
      <label>
        Your proposal
        <textarea
          className={fieldClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
          minLength={20}
          maxLength={2000}
          required
          rows={3}
        />
      </label>
      <button className="k-focus min-h-11 rounded-full bg-violet px-5 text-white" disabled={busy}>
        Send proposal
      </button>
    </form>
  );
}

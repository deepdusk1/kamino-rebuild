import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileText, Save, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { HELD_MESSAGE, HELD_TITLE } from "@/lib/kamino/held";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createPost, listDrafts, saveDraft, deleteDraft } from "@/lib/kamino/server";
import { MAX_ALBUM_EXTRAS } from "@/lib/kamino/albums";
import { emptyDraft, type DraftContent, type CreatorDraft } from "@/lib/kamino/writing";
import type { PostType, PostPayload } from "@/lib/kamino/types";
import { cn } from "@/lib/utils";
import { FormattedBody } from "./formatted-body";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

const TYPES: { id: PostType; label: string }[] = [
  { id: "blog", label: "Blog" },
  { id: "image", label: "Image" },
  { id: "question", label: "Q&A" },
  { id: "link", label: "Link" },
  { id: "poll", label: "Poll" },
  { id: "quiz", label: "Quiz" },
  { id: "wiki", label: "Wiki" },
  { id: "story", label: "Story" },
];
const field =
  "w-full rounded-xl border border-border bg-elevated px-3 py-2.5 text-sm text-fg outline-none focus:ring-2 focus:ring-accent";

export function Composer({
  slug,
  onClose,
  onCreated,
  initialType = "blog",
}: {
  slug: string;
  onClose: () => void;
  onCreated: (id: number) => void;
  initialType?: PostType;
}) {
  const [form, setForm] = useState<DraftContent>(() => emptyDraft(initialType));
  const [baseline, setBaseline] = useState(() => JSON.stringify(emptyDraft(initialType)));
  const [draft, setDraft] = useState<{ id: string; revision: number } | null>(null);
  const [library, setLibrary] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useCurrentUserState();
  const q = useQuery({
    queryKey: ["drafts", slug, user?.id],
    queryFn: () => listDrafts({ data: slug }),
    enabled: !!user,
  });
  const dirty = JSON.stringify(form) !== baseline;
  function change<K extends keyof DraftContent>(key: K, value: DraftContent[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function questionChange(i: number, patch: Partial<DraftContent["questions"][number]>) {
    change(
      "questions",
      form.questions.map((v, n) => (n === i ? { ...v, ...patch } : v)),
    );
  }
  function moveQuestion(i: number, delta: number) {
    const questions = [...form.questions];
    [questions[i], questions[i + delta]] = [questions[i + delta]!, questions[i]!];
    change("questions", questions);
  }
  async function task(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function persist(copy = false) {
    const target = !copy && draft ? draft : { id: crypto.randomUUID(), revision: 0 };
    const saved = await saveDraft({ data: { ...target, slug, content: form } });
    setDraft(saved);
    setBaseline(JSON.stringify(form));
    await q.refetch();
  }
  // Autosave: a few seconds after you stop typing, the draft is saved to your account.
  // Failures stay quiet here (the "Save draft" button still shows errors), so typing is never interrupted.
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  });
  useEffect(() => {
    if (!user || !dirty) return;
    if (!form.title.trim() && !form.body.trim() && !form.image) return;
    const timer = setTimeout(() => {
      if (busyRef.current) return;
      busyRef.current = true;
      persistRef
        .current()
        .catch(() => undefined)
        .finally(() => {
          busyRef.current = false;
        });
    }, 5000);
    return () => clearTimeout(timer);
  }, [form, dirty, user]);
  function load(d: CreatorDraft) {
    setForm(d.content);
    setBaseline(JSON.stringify(d.content));
    setDraft({ id: d.id, revision: d.revision });
    setLibrary(false);
    setError(null);
  }
  function requestClose() {
    if (!busyRef.current) {
      if (dirty) setClosing(true);
      else onClose();
    }
  }
  async function submit() {
    const payload: PostPayload = { format: "markdown" };
    if (form.type === "poll") {
      payload.options = form.opts.map((s) => s.trim()).filter(Boolean);
      if (payload.options.length < 2) throw new Error("Polls need at least two options.");
    }
    if (form.type === "quiz") {
      // Pictures travel beside the payload (they are stored as files), never inside it.
      payload.questions = form.questions.map(({ image: _image, ...q }) => ({
        ...q,
        q: q.q.trim(),
        choices: q.choices.map((c) => c.trim()),
      }));
      if (form.timeLimitSec) payload.timeLimitSec = form.timeLimitSec;
      if (
        payload.questions.some(
          (q) => !q.q || q.choices.some((c) => !c) || q.answer >= q.choices.length,
        )
      )
        throw new Error("Complete every question and answer choice, or remove unused choices.");
    }
    if (form.type === "story") {
      // One caption per scene (the cover, then each album picture); empty ones are simply left out.
      const scenes = 1 + (form.album?.length ?? 0);
      const captions = Array.from({ length: scenes }, (_, n) => (form.captions?.[n] ?? "").trim());
      if (captions.some(Boolean)) payload.captions = captions;
    }
    if (form.type === "wiki") payload.category = form.opts[0].trim() || "General";
    if (form.type === "link") payload.url = form.url.trim();
    if ((form.type === "image" || form.type === "story") && !form.image)
      throw new Error("Choose an image for your post.");
    const res = await createPost({
      data: {
        slug,
        type: form.type,
        title: form.title,
        body: form.body,
        contentWarning: form.warning,
        payload,
        cover: form.image,
        album:
          (form.type === "image" || form.type === "story") && form.album?.length
            ? form.album
            : undefined,
        questionImages:
          form.type === "quiz" && form.questions.some((q) => q.image)
            ? form.questions.map((q) => q.image ?? "")
            : undefined,
        commentsDisabled: form.commentsOff,
        announcement: form.announce,
      },
    });
    if (draft) {
      try {
        await deleteDraft({ data: draft });
      } catch {
        toast.info("Published. A newer or changed draft was kept in your library.");
      }
    }
    if (res.held) toast.info(HELD_TITLE, { description: HELD_MESSAGE });
    onCreated(res.id);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto border-border bg-surface p-5 sm:max-w-2xl">
        <div className="flex items-start justify-between gap-3 pr-6">
          <div>
            <p className="mb-1 text-[10px] font-extrabold tracking-[.2em] text-accent uppercase">
              Your creative space
            </p>
            <DialogTitle className="font-display text-2xl font-extrabold">
              {draft ? "Continue your draft" : "Create something wonderful"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs text-muted">
              Share with {slug}. Drafts are private to your account.
            </DialogDescription>
          </div>
          <Button variant="ghost" size="sm" disabled={busy} onClick={requestClose}>
            Close
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-elevated p-2">
          <span aria-live="polite" className="px-2 text-xs text-muted">
            {dirty ? "Unsaved changes" : draft ? "Draft saved to your account" : "Make it yours"}
          </span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setLibrary(!library)}>
            <BookOpen className="size-4" /> Drafts ({q.data?.length ?? 0})
          </Button>
        </div>
        {library && (
          <section
            aria-label="Saved drafts"
            className="space-y-2 rounded-xl border border-border p-3"
          >
            <h2 className="text-sm font-bold">Your drafts in this community</h2>
            {q.isPending && <p className="text-xs text-muted">Loading drafts…</p>}
            {q.error && (
              <p role="alert" className="text-xs text-danger">
                Could not load drafts. <button onClick={() => void q.refetch()}>Retry</button>
              </p>
            )}
            {!q.isPending && !q.error && !q.data?.length && (
              <p className="text-xs text-muted">
                Save an idea and come back whenever inspiration strikes.
              </p>
            )}
            {q.data?.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-lg bg-elevated px-3 py-2">
                <FileText className="size-4 shrink-0 text-accent" />
                <button
                  className="min-w-0 flex-1 text-left"
                  disabled={busy || draft?.id === d.id}
                  onClick={() =>
                    void task(async () => {
                      if (dirty) await persist();
                      load(d);
                    })
                  }
                >
                  <span className="block truncate text-sm font-bold">
                    {d.content.title || "Untitled draft"}
                  </span>
                  <span className="text-xs text-muted">
                    {d.content.type} · {new Date(d.updatedAt).toLocaleDateString()}
                    {draft?.id === d.id ? " · Open" : ""}
                  </span>
                </button>
                <button
                  aria-label={`Delete draft ${d.content.title || "Untitled draft"}`}
                  className="p-2 text-muted hover:text-danger"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      await deleteDraft({ data: { id: d.id, revision: d.revision } });
                      if (draft?.id === d.id) {
                        setDraft(null);
                        setBaseline(JSON.stringify(emptyDraft(initialType)));
                      }
                      await q.refetch();
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            {dirty && (
              <p className="text-xs text-muted">
                Opening another draft saves your current changes first.
              </p>
            )}
          </section>
        )}
        {closing && (
          <div role="alert" className="rounded-xl border border-accent/40 bg-accent/10 p-4">
            <p className="text-sm font-bold">Keep your work for later?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await persist();
                    onClose();
                  })
                }
              >
                Save & close
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => setClosing(false)}
              >
                Keep editing
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
                Discard unsaved changes
              </Button>
            </div>
          </div>
        )}
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-1.5" aria-label="Post type">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={form.type === t.id}
                onClick={() => change("type", t.id)}
                className={cn(
                  "h-9 rounded-full px-3 text-sm font-bold",
                  form.type === t.id ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            aria-label="Post title"
            maxLength={120}
            value={form.title}
            onChange={(e) => change("title", e.target.value)}
            placeholder={form.type === "question" ? "Your question" : "Give your idea a title"}
            className={field}
          />
          {form.type === "link" && (
            <input
              aria-label="Link URL"
              maxLength={2000}
              value={form.url}
              onChange={(e) => change("url", e.target.value)}
              placeholder="https://"
              className={field}
            />
          )}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1" aria-label="Writing tools">
              {[
                ["Bold", "**", "**"],
                ["Italic", "_", "_"],
                ["Heading", "\n## ", ""],
                ["Quote", "\n> ", ""],
                ["List", "\n- ", ""],
              ].map(([label, before, after]) => (
                <button
                  key={label}
                  type="button"
                  disabled={preview}
                  className="rounded-lg bg-elevated px-2.5 py-2 text-xs font-bold disabled:opacity-40"
                  onClick={() => {
                    const el = bodyRef.current;
                    const start = el?.selectionStart ?? form.body.length;
                    const end = el?.selectionEnd ?? start;
                    change(
                      "body",
                      (
                        form.body.slice(0, start) +
                        before +
                        (form.body.slice(start, end) || "text") +
                        after +
                        form.body.slice(end)
                      ).slice(0, 8000),
                    );
                    el?.focus();
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={preview}
                className="ml-auto px-2 py-2 text-xs font-bold text-accent"
                onClick={() => setPreview(!preview)}
              >
                {preview ? "Edit text" : "Preview"}
              </button>
            </div>
            {preview ? (
              <div
                className="min-h-36 rounded-xl border border-border p-4"
                aria-label="Post preview"
              >
                <FormattedBody body={form.body || "Your writing preview appears here."} formatted />
              </div>
            ) : (
              <textarea
                ref={bodyRef}
                aria-label="Post body"
                maxLength={8000}
                value={form.body}
                onChange={(e) => change("body", e.target.value)}
                placeholder={
                  form.type === "quiz" ? "Introduce your quiz (optional)" : "Tell your story…"
                }
                rows={5}
                className={field}
              />
            )}
          </div>
          <div className="flex justify-between text-xs text-subtle">
            <span>Hashtags help people find your post.</span>
            <span>{form.body.length}/8,000</span>
          </div>
          <details
            className="rounded-xl border border-dashed border-border p-3"
            open={form.type === "image" || form.type === "story" || !!form.image}
          >
            <summary className="cursor-pointer text-sm font-bold">
              {form.image ? "Cover image added" : "Add a cover image"}
            </summary>
            <input
              aria-label="Choose image"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="mt-3 w-full text-xs"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (
                  !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) ||
                  file.size > 2 * 1024 * 1024
                ) {
                  setError("Choose a PNG, JPEG, WebP or GIF under 2 MB.");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  change("image", String(reader.result));
                  setError(null);
                };
                reader.onerror = () => setError("Could not read this image.");
                reader.readAsDataURL(file);
              }}
            />
            {form.image && (
              <>
                <img
                  src={form.image}
                  alt="Post preview"
                  className="mt-3 max-h-48 w-full rounded-lg object-cover"
                />
                <button
                  type="button"
                  className="mt-2 text-xs text-danger"
                  onClick={() =>
                    // The next album picture becomes the cover, so an album never loses its first picture.
                    setForm((prev) => ({
                      ...prev,
                      image: prev.album?.[0] ?? "",
                      album: prev.album?.slice(1),
                      captions: prev.captions?.slice(1),
                    }))
                  }
                >
                  Remove image
                </button>
              </>
            )}
            {(form.type === "image" || form.type === "story") && form.image && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-bold">
                  {form.type === "story" ? "Scenes" : "Album"} ({(form.album?.length ?? 0) + 1}/
                  {MAX_ALBUM_EXTRAS + 1} pictures)
                </p>
                <div className="flex flex-wrap gap-2">
                  {(form.album ?? []).map((picture, i) => (
                    <div key={i} className="relative">
                      <img
                        src={picture}
                        alt={`Album picture ${i + 2}`}
                        className="size-16 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        aria-label={`Remove album picture ${i + 2}`}
                        className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-danger text-[11px] font-bold text-white"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            album: (prev.album ?? []).filter((_, n) => n !== i),
                            // Scene i + 2 is album picture i; its caption goes with it.
                            captions: prev.captions?.filter((_, n) => n !== i + 1),
                          }))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                {(form.album?.length ?? 0) < MAX_ALBUM_EXTRAS && (
                  <input
                    aria-label={
                      form.type === "story"
                        ? "Add another scene"
                        : "Add another picture to the album"
                    }
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="w-full text-xs"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      if (
                        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
                          file.type,
                        ) ||
                        file.size > 2 * 1024 * 1024
                      ) {
                        setError("Choose a PNG, JPEG, WebP or GIF under 2 MB.");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setForm((prev) => ({
                          ...prev,
                          album: [...(prev.album ?? []), String(reader.result)].slice(
                            0,
                            MAX_ALBUM_EXTRAS,
                          ),
                        }));
                        setError(null);
                      };
                      reader.onerror = () => setError("Could not read this image.");
                      reader.readAsDataURL(file);
                    }}
                  />
                )}
                {form.type === "story" && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted">
                      A short caption for each scene (optional, up to 140 characters).
                    </p>
                    {Array.from({ length: 1 + (form.album?.length ?? 0) }, (_, n) => (
                      <input
                        key={n}
                        aria-label={`Caption for scene ${n + 1}`}
                        maxLength={140}
                        className={field}
                        placeholder={`Scene ${n + 1} caption`}
                        value={form.captions?.[n] ?? ""}
                        onChange={(e) =>
                          setForm((prev) => {
                            const next = [...(prev.captions ?? [])];
                            while (next.length <= n) next.push("");
                            next[n] = e.target.value;
                            return { ...prev, captions: next };
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="mt-2 text-xs text-subtle">PNG, JPEG, WebP or GIF · up to 2 MB each</p>
          </details>
          {(form.type === "poll" || form.type === "wiki") && (
            <div className="space-y-2">
              {(form.type === "wiki" ? [0] : [0, 1, 2, 3, 4]).map((i) => (
                <input
                  key={i}
                  aria-label={form.type === "wiki" ? "Wiki category" : `Poll option ${i + 1}`}
                  maxLength={200}
                  value={form.opts[i]}
                  onChange={(e) =>
                    change(
                      "opts",
                      form.opts.map((v, n) => (n === i ? e.target.value : v)),
                    )
                  }
                  placeholder={
                    form.type === "wiki"
                      ? "Category (e.g. Characters, Guides, Lore)"
                      : `Option ${i + 1}${i > 1 ? " (optional)" : ""}`
                  }
                  className={field}
                />
              ))}
            </div>
          )}
          {form.type === "quiz" && (
            <section aria-label="Quiz questions" className="space-y-3">
              <div className="flex justify-between">
                <h2 className="font-bold">Build your quiz</h2>
                <span className="text-xs text-muted">{form.questions.length}/30 questions</span>
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-bold">Time limit for the whole quiz (seconds)</span>
                <input
                  aria-label="Time limit in seconds"
                  type="number"
                  inputMode="numeric"
                  min={10}
                  max={3600}
                  className={field}
                  value={form.timeLimitSec ?? ""}
                  placeholder="Leave empty for no time limit (10 to 3600)"
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    change("timeLimitSec", value === "" ? undefined : Math.floor(Number(value)));
                  }}
                />
              </label>
              {form.questions.map((question, i) => (
                <div
                  key={i}
                  className="space-y-3 rounded-2xl border border-border bg-elevated/40 p-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-accent">Question {i + 1}</h3>
                    <div className="flex">
                      <button
                        type="button"
                        aria-label={`Move question ${i + 1} up`}
                        disabled={i === 0}
                        onClick={() => moveQuestion(i, -1)}
                        className="p-2 disabled:opacity-30"
                      >
                        <ArrowUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move question ${i + 1} down`}
                        disabled={i === form.questions.length - 1}
                        onClick={() => moveQuestion(i, 1)}
                        className="p-2 disabled:opacity-30"
                      >
                        <ArrowDown className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove question ${i + 1}`}
                        disabled={form.questions.length === 1}
                        onClick={() =>
                          change(
                            "questions",
                            form.questions.filter((_, n) => n !== i),
                          )
                        }
                        className="p-2 text-danger disabled:opacity-30"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    aria-label={`Question ${i + 1}`}
                    maxLength={500}
                    rows={2}
                    className={field}
                    value={question.q}
                    placeholder="What would you like to ask?"
                    onChange={(e) => questionChange(i, { q: e.target.value })}
                  />
                  {question.image ? (
                    <div className="relative w-fit">
                      <img
                        src={question.image}
                        alt={`Picture for question ${i + 1}`}
                        className="max-h-40 rounded-lg object-contain"
                      />
                      <button
                        type="button"
                        aria-label={`Remove picture from question ${i + 1}`}
                        className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-danger text-[11px] font-bold text-white"
                        onClick={() => questionChange(i, { image: undefined })}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <input
                      aria-label={`Add a picture to question ${i + 1}`}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="w-full text-xs"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        if (
                          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
                            file.type,
                          ) ||
                          file.size > 2 * 1024 * 1024
                        ) {
                          setError("Choose a PNG, JPEG, WebP or GIF under 2 MB.");
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          questionChange(i, { image: String(reader.result) });
                          setError(null);
                        };
                        reader.onerror = () => setError("Could not read this image.");
                        reader.readAsDataURL(file);
                      }}
                    />
                  )}
                  <p className="text-xs text-muted">Select the circle beside the correct answer.</p>
                  {question.choices.map((choice, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`answer-${i}`}
                        aria-label={`Question ${i + 1} correct answer ${j + 1}`}
                        checked={question.answer === j}
                        onChange={() => questionChange(i, { answer: j })}
                        className="size-4 accent-accent"
                      />
                      <input
                        aria-label={`Question ${i + 1} choice ${j + 1}`}
                        maxLength={200}
                        className={field}
                        value={choice}
                        placeholder={`Answer ${j + 1}`}
                        onChange={(e) =>
                          questionChange(i, {
                            choices: question.choices.map((v, n) => (n === j ? e.target.value : v)),
                          })
                        }
                      />
                      {question.choices.length > 2 && (
                        <button
                          type="button"
                          aria-label={`Remove question ${i + 1} choice ${j + 1}`}
                          onClick={() =>
                            questionChange(i, {
                              choices: question.choices.filter((_, n) => n !== j),
                              answer:
                                question.answer === j
                                  ? 0
                                  : question.answer > j
                                    ? question.answer - 1
                                    : question.answer,
                            })
                          }
                          className="p-2 text-muted"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {question.choices.length < 6 && (
                    <button
                      type="button"
                      className="text-xs font-bold text-accent"
                      onClick={() => questionChange(i, { choices: [...question.choices, ""] })}
                    >
                      + Add answer choice
                    </button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={form.questions.length >= 30}
                onClick={() =>
                  change("questions", [
                    ...form.questions,
                    { q: "", choices: ["", "", "", ""], answer: 0 },
                  ])
                }
              >
                <Plus className="size-4" />
                Add question
              </Button>
            </section>
          )}
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-bold">Post settings</summary>
            <div className="mt-3 space-y-3">
              <input
                aria-label="Content warning"
                maxLength={120}
                value={form.warning}
                onChange={(e) => change("warning", e.target.value)}
                placeholder="Content warning (optional)"
                className={field}
              />
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.commentsOff}
                  onChange={(e) => change("commentsOff", e.target.checked)}
                />
                Disable comments
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.announce}
                  onChange={(e) => change("announce", e.target.checked)}
                />
                Pin as announcement (leaders)
              </label>
            </div>
          </details>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void task(async () => {
                await persist();
                toast.success("Draft saved");
              })
            }
          >
            <Save className="size-4" />
            Save draft
          </Button>
          {draft && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  await persist(true);
                  toast.success("Draft copy saved");
                })
              }
            >
              Save a copy
            </Button>
          )}
          <Button className="ml-auto" disabled={busy} onClick={() => void task(submit)}>
            {busy ? "Saving…" : "Publish"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

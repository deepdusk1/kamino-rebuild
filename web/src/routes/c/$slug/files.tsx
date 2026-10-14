import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight, FileText, Folder, FolderInput, Lock, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { folderCounts, normalizeFolder } from "@/lib/kamino/albums";
import { addShared, deleteShared, listShared, moveShared } from "@/lib/kamino/server";
import { canLead, canModerate } from "@/lib/kamino/safety";
import { timeAgo } from "@/lib/utils";

export const Route = createFileRoute("/c/$slug/files")({ component: SharedFolder });

function SharedFolder() {
  const { slug } = Route.useParams();
  const { user } = useCurrentUserState();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** The folder being looked at, such as "Guides/Maps". "" is the top level. */
  const [here, setHere] = useState("");
  const q = useQuery({ queryKey: ["shared", slug], queryFn: () => listShared({ data: slug }) });
  const member = q.data?.member?.status === "active" ? q.data.member : null;
  const leader = canLead(member?.role);

  const { items, subfolders } = useMemo(() => {
    const all = q.data?.items ?? [];
    const counts = folderCounts(all.map((item) => item.folder));
    const prefix = here ? `${here}/` : "";
    return {
      items: all.filter((item) => item.folder === here),
      // Direct children of the current folder only.
      subfolders: counts.filter((c) => c.folder.startsWith(prefix) && c.folder !== here && !c.folder.slice(prefix.length).includes("/")),
    };
  }, [q.data, here]);
  const crumbs = here ? here.split("/") : [];

  return (
    <div className="px-4 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-sm text-muted">Shared folder — links and notes the hall keeps together.</p>
        {member && (
          <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
            <Plus className="size-4" />
            Add
          </Button>
        )}
      </div>

      <nav aria-label="Folder path" className="mb-3 flex flex-wrap items-center gap-1 text-sm font-bold">
        <button type="button" className={here ? "text-accent" : ""} onClick={() => setHere("")}>
          All files
        </button>
        {crumbs.map((name, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="size-3 text-subtle" aria-hidden />
            <button type="button" className={i < crumbs.length - 1 ? "text-accent" : ""} onClick={() => setHere(crumbs.slice(0, i + 1).join("/"))}>
              {name}
            </button>
          </span>
        ))}
      </nav>

      {open && member && (
        <form
          className="mb-4 space-y-2 rounded-2xl bg-surface p-4 shadow-border"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setErr(null);
            void addShared({
              data: {
                slug,
                title: String(fd.get("title") || ""),
                url: String(fd.get("url") || ""),
                note: String(fd.get("note") || ""),
                folder: String(fd.get("folder") || ""),
                minLevel: leader ? Number(fd.get("minLevel") || 1) : undefined,
              },
            })
              .then(() => {
                setOpen(false);
                void q.refetch();
              })
              .catch((e) => setErr(e instanceof Error ? e.message : "Could not add"));
          }}
        >
          <input name="title" required placeholder="Name" className="h-11 w-full rounded-full bg-elevated px-4 text-sm" />
          <input name="url" placeholder="https:// (optional)" className="h-11 w-full rounded-full bg-elevated px-4 text-sm" />
          <input name="note" placeholder="Note" className="h-11 w-full rounded-full bg-elevated px-4 text-sm" />
          <input name="folder" defaultValue={here} placeholder="Folder, e.g. Guides/Maps (optional)" className="h-11 w-full rounded-full bg-elevated px-4 text-sm" />
          {leader && (
            <label className="block text-sm">
              Level needed to open it (1 = everyone)
              <input name="minLevel" type="number" min={1} max={30} defaultValue={1} className="mt-1 h-11 w-full rounded-full bg-elevated px-4 text-sm" />
            </label>
          )}
          {err ? <p className="text-sm text-danger">{err}</p> : null}
          <Button type="submit" className="w-full" disabled={!user}>
            Save to folder
          </Button>
        </form>
      )}

      {subfolders.length > 0 && (
        <ul className="mb-3 grid grid-cols-2 gap-2">
          {subfolders.map((f) => (
            <li key={f.folder}>
              <button type="button" onClick={() => setHere(f.folder)} className="flex h-12 w-full items-center gap-2 rounded-xl bg-surface px-3 text-left text-sm font-bold shadow-border">
                <Folder className="size-4 text-accent" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{f.folder.split("/").pop()}</span>
                <span className="text-xs text-subtle">{f.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-border">
        {items.map((item) => {
          const canManage = Boolean(user && (user.id === item.authorId || canModerate(member?.role)));
          return (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 grid size-10 place-items-center rounded-full bg-elevated text-accent">
                {item.locked ? <Lock className="size-4" /> : <FileText className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                {item.locked ? (
                  <p className="font-bold">{item.title}</p>
                ) : item.url ? (
                  <a href={item.url} target="_blank" rel="noreferrer" className="font-bold text-accent">
                    {item.title}
                  </a>
                ) : (
                  <p className="font-bold">{item.title}</p>
                )}
                {item.locked ? (
                  <p className="text-sm text-muted">Opens at level {item.minLevel}. Keep taking part to get there.</p>
                ) : item.note ? (
                  <p className="text-sm text-muted">{item.note}</p>
                ) : null}
                <p className="text-[11px] font-semibold text-subtle">
                  {item.author} · {timeAgo(item.createdAt)}
                  {item.minLevel > 1 && !item.locked ? ` · level ${item.minLevel}+` : ""}
                </p>
              </div>
              {canManage && (
                <>
                  <button
                    type="button"
                    aria-label={`Move ${item.title}`}
                    className="grid size-11 place-items-center text-muted"
                    onClick={() => {
                      const folder = window.prompt("Move to which folder? (leave empty for the top level)", item.folder);
                      if (folder === null) return;
                      void moveShared({ data: { slug, id: item.id, folder: normalizeFolder(folder) } })
                        .then(() => q.refetch())
                        .catch((e) => setErr(e instanceof Error ? e.message : "Could not move"));
                    }}
                  >
                    <FolderInput className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${item.title}`}
                    className="grid size-11 place-items-center text-muted"
                    onClick={() => {
                      if (!confirm("Remove this file?")) return;
                      void deleteShared({ data: { slug, id: item.id } }).then(() => q.refetch());
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {items.length === 0 && subfolders.length === 0 && <p className="py-12 text-center text-sm text-muted">This folder is empty.</p>}
      {err && !open ? <p className="mt-2 text-sm text-danger">{err}</p> : null}
    </div>
  );
}

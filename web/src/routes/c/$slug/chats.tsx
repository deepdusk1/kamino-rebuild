import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Hash, Mic, MonitorPlay, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createRoom, getCommunityPage } from "@/lib/kamino/server";
import { timeAgo } from "@/lib/utils";

export const Route = createFileRoute("/c/$slug/chats")({ component: CommunityChats });

function CommunityChats() {
  const { slug } = Route.useParams();
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"public" | "voice" | "screening" | "private">("public");
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["community", slug, "rooms"],
    queryFn: () => getCommunityPage({ data: { slug } }),
  });
  const rooms = q.data?.rooms ?? [];
  const member = q.data?.member?.status === "active" ? q.data.member : null;
  const canLead = member && (member.role === "agent" || member.role === "leader");

  return (
    <div className="px-4 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-sm text-muted">
          Public rooms stay on. Voice is a live call. Screening is a watch party — play, pause, and seek stay together.
        </p>
        {member && (
          <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
            <Plus className="size-4" />
            Room
          </Button>
        )}
      </div>
      {open && member && (
        <form
          className="mb-4 space-y-2 rounded-xl bg-surface p-4 shadow-border"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            void createRoom({ data: { slug, name, kind } })
              .then((r) => {
                setOpen(false);
                setName("");
                void navigate({ to: "/chats/$roomId", params: { roomId: String(r.id) } });
              })
              .catch((e) => setErr(e instanceof Error ? e.message : "Could not open room"));
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Room name"
            className="h-11 w-full rounded-lg bg-elevated px-3 text-sm"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="h-11 w-full rounded-lg bg-elevated px-3 text-sm"
          >
            <option value="public">Public chat</option>
            {canLead && <option value="voice">Voice call</option>}
            {canLead && <option value="screening">Watch party</option>}
            {canLead && <option value="private">Private</option>}
          </select>
          {err ? <p className="text-sm text-danger">{err}</p> : null}
          <Button type="submit" className="w-full" disabled={!user}>
            Open room
          </Button>
        </form>
      )}
      <ul className="space-y-2">
        {rooms.map((r) => {
          const Icon = r.kind === "voice" ? Mic : r.kind === "screening" ? MonitorPlay : Hash;
          return (
            <li key={r.id}>
              <Link
                to="/chats/$roomId"
                params={{ roomId: String(r.id) }}
                className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 shadow-border"
              >
                <span className="grid size-10 place-items-center rounded-full bg-elevated text-accent">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium capitalize">{r.name}</p>
                  <p className="truncate text-sm text-muted">{r.lastMessage ?? "No messages yet"}</p>
                </div>
                <div className="text-right text-xs text-subtle">
                  {r.lastAt ? timeAgo(r.lastAt) : ""}
                  {r.kind === "voice" || r.kind === "screening" ? (
                    <p className="tabular-nums text-accent">{r.voiceCount} live</p>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {rooms.length === 0 && <p className="py-12 text-center text-sm text-muted">No rooms yet.</p>}
    </div>
  );
}

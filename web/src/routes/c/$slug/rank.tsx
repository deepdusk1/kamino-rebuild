import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Face } from "@/components/face";
import { communityRank } from "@/lib/kamino/engagement";
import type { RankBoard, RankPeriod } from "@/lib/kamino/types";
import { cn, levelFromRep } from "@/lib/utils";

export const Route = createFileRoute("/c/$slug/rank")({ component: Rank });

const BOARDS: { key: RankBoard; label: string; blurb: string; unit: string }[] = [
  { key: "activity", label: "Activity", blurb: "Likes received × 3 plus posts × 4.", unit: "pts" },
  { key: "streak", label: "Check-ins", blurb: "Days in a row checked in to this community.", unit: "days" },
  { key: "quiz", label: "Quizzes", blurb: "Points scored on quizzes.", unit: "pts" },
];
const PERIODS: { key: RankPeriod; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
];

function Pills<T extends string>({ items, value, onChange, label }: { items: { key: T; label: string }[]; value: T; onChange: (key: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.key}
          role="tab"
          aria-selected={value === item.key}
          onClick={() => onChange(item.key)}
          className={cn("h-9 rounded-full px-4 text-sm font-bold transition-colors", value === item.key ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg")}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function Rank() {
  const { slug } = Route.useParams();
  const [by, setBy] = useState<RankBoard>("activity");
  const [period, setPeriod] = useState<RankPeriod>("week");
  const q = useQuery({
    queryKey: ["rank", slug, by, period],
    queryFn: () => communityRank({ data: { slug, by, period } }),
  });
  const board = BOARDS.find((b) => b.key === by)!;

  return (
    <div className="px-4 py-5">
      <h2 className="font-display text-lg font-extrabold">Leaderboard</h2>
      <div className="mt-3 space-y-2">
        <Pills items={BOARDS} value={by} onChange={setBy} label="Leaderboard" />
        {by !== "streak" && <Pills items={PERIODS} value={period} onChange={setPeriod} label="Time window" />}
      </div>
      <p className="mt-3 mb-4 text-sm text-muted">{board.blurb} All-time rep is on Members.</p>
      {q.error ? (
        <p className="py-12 text-center text-sm text-muted">{(q.error as Error).message}</p>
      ) : !q.data ? (
        <p className="py-12 text-center text-sm text-muted">Ranking…</p>
      ) : (
        <ol className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-border">
          {q.data.rank.map((row, i) => (
            <li key={row.userId} className="flex items-center gap-3 px-4 py-3">
              <span className="w-6 text-right text-xs font-extrabold tabular-nums text-accent">{i + 1}</span>
              <Link to="/u/$handle" params={{ handle: row.handle }} className="flex min-w-0 flex-1 items-center gap-3">
                <Face name={row.nickname} hue={row.hue} level={levelFromRep(row.rep)} ring={i < 3} />
                <div className="min-w-0">
                  <p className="truncate font-bold">{row.nickname}</p>
                  <p className="text-xs font-semibold text-subtle">
                    {row.score} {board.unit}
                    {by === "activity" ? ` · ${row.weekPosts} posts · ${row.weekLikes} likes` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { getPeopleMatching } from "@/lib/kamino/platform-v9";
export function PeopleMatching() {
  const q = useQuery({ queryKey: ["peopleMatching"], queryFn: () => getPeopleMatching() });
  if (!q.data) return null;
  const { interests, people } = q.data;
  const points = interests
    .slice(0, 12)
    .map((label, i, a) => ({
      label,
      x: 200 + Math.cos((i * 2 * Math.PI) / a.length) * 140,
      y: 150 + Math.sin((i * 2 * Math.PI) / a.length) * 110,
    }));
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 space-y-3">
      <h2 className="text-lg font-bold">Find my people</h2>
      <p className="text-sm text-muted">
        Matches share your chosen interests. Introductions are previews you can copy and
        personalize.
      </p>
      {points.length ? (
        <svg
          viewBox="0 0 400 300"
          role="img"
          aria-label={`Your interest graph: ${interests.join(", ")}`}
          className="mx-auto w-full max-w-lg"
        >
          <title>Your chosen interests</title>
          {points.map((p) => (
            <g key={p.label}>
              <line
                x1={200}
                y1={150}
                x2={p.x}
                y2={p.y}
                stroke="currentColor"
                className="text-violet/30"
              />
              <circle cx={p.x} cy={p.y} r={23} fill="currentColor" className="text-violet/10" />
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                fill="currentColor"
                className="text-body"
                fontSize={12}
              >
                {p.label}
              </text>
            </g>
          ))}
          <circle cx={200} cy={150} r={25} fill="currentColor" className="text-violet" />
          <text x={200} y={154} textAnchor="middle" fill="white" fontSize={14}>
            You
          </text>
        </svg>
      ) : (
        <p>Choose interests in your privacy dashboard to find matches.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {people.map((p) => (
          <article key={p.userId} className="rounded-xl bg-bg p-3">
            <a href={`/u/${p.handle}`} className="font-bold text-violet">
              {p.name} · @{p.handle}
            </a>
            <p className="my-2 text-sm">{p.shared.join(" · ")}</p>
            <p className="text-sm text-muted">{p.introduction}</p>
            <button
              className="mt-2 rounded-full border border-border px-3 py-2 text-sm"
              onClick={() => void navigator.clipboard?.writeText(p.introduction)}
            >
              Copy introduction
            </button>
          </article>
        ))}
      </div>
      {!people.length ? (
        <p>
          No matches yet. More members with shared interests will appear as the community grows.
        </p>
      ) : null}
    </section>
  );
}

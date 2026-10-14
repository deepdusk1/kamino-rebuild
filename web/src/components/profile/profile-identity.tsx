import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getProfileIdentity } from "@/lib/kamino/identity-v9";

export function ProfileIdentity({ handle }: { handle: string }) {
  const query = useQuery({
    queryKey: ["profileIdentity", handle],
    queryFn: () => getProfileIdentity({ data: handle }),
    enabled: !!handle,
  });
  const identity = query.data;
  if (
    !identity ||
    (!identity.links.length &&
      !identity.interests.length &&
      !identity.mutuals.length &&
      !identity.supporterBadges.length)
  )
    return null;
  return (
    <div
      className="mt-3 space-y-2 border-l-[3px] pl-3"
      style={{ borderColor: `hsl(${identity.profileHue} 70% 55%)` }}
    >
      {identity.supporterBadges.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Supporter badges">
          {identity.supporterBadges.map((badge) => (
            <span
              key={badge}
              className="rounded-pill bg-violet/10 px-2.5 py-1 text-xs font-semibold text-violet"
            >
              {badge}
            </span>
          ))}
        </div>
      ) : null}
      {identity.interests.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Interests">
          {identity.interests.map((interest) => (
            <span
              key={interest}
              className="rounded-pill bg-surface-alt px-2.5 py-1 text-xs font-semibold"
            >
              {interest}
            </span>
          ))}
        </div>
      ) : null}
      {identity.links.length ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {identity.links.map((link) => (
            <a
              key={link.url}
              href={link.url}
              rel="noopener noreferrer"
              target="_blank"
              className="k-focus text-sm font-semibold text-violet"
            >
              {link.label} ↗
            </a>
          ))}
        </div>
      ) : null}
      {identity.mutuals.length ? (
        <p className="text-xs text-muted">
          Connections in common:{" "}
          {identity.mutuals.map((person, index) => (
            <span key={person.handle}>
              {index ? ", " : ""}
              <Link
                to="/u/$handle"
                params={{ handle: person.handle }}
                className="k-focus font-semibold text-violet"
              >
                {person.name}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

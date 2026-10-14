import type { CSSProperties, ReactNode } from "react";
import { communityColors } from "@/lib/kamino/theme";
import type { Community } from "@/lib/kamino/types";

/**
 * Wraps a community's pages so its own colour (the leaders' "Look") becomes the accent colour inside it: the
 * accent buttons, links and highlights of the community's tools (chats, wiki, files, events …) use it. The new
 * Kamino parts (Join, tabs, "See All", chips) keep Kamino's violet like the mockups and the phone app.
 * The accent is always dark enough for white text on it.
 * On phones the header's avatar is hidden here, like the mockups (back, logo, search, share, ⋯).
 *
 * The wrapper is `display: contents`, so it adds no box of its own; the colours reach everything inside through
 * CSS variables.
 */
export function CommunityTheme({
  community,
  children,
}: {
  community: Pick<Community, "hue" | "themeStyle"> | null | undefined;
  children: ReactNode;
}) {
  if (!community) return <>{children}</>;
  const light = communityColors(community.hue, community.themeStyle).accent;
  const style = { "--k-c-light": light } as CSSProperties;
  return (
    <div className="k-community contents" style={style}>
      <style>{`
.k-community{--color-accent:var(--k-c-light)}
@media (max-width:1023px){.k-community header a[aria-label="My profile"]{display:none}}
`}</style>
      {children}
    </div>
  );
}

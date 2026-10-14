import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/profile/profile-page";
import { profileOverview } from "@/lib/kamino/social";

/**
 * Someone's profile (mockup 10-profile). The page itself lives in `src/components/profile/profile-page.tsx`
 * so `/me` can show the same page for your own profile.
 */
export const Route = createFileRoute("/u/$handle")({
  // Loaded on the server so the header paints straight away; a missing profile shows a friendly message.
  loader: async ({ params }) => {
    try {
      return { overview: await profileOverview({ data: { handle: params.handle } }) };
    } catch {
      return { overview: undefined };
    }
  },
  component: Profile,
});

function Profile() {
  const { handle } = Route.useParams();
  const { overview } = Route.useLoaderData();
  return <ProfilePage key={handle} handle={handle} initial={overview} />;
}

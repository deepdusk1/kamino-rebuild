import { createFileRoute } from "@tanstack/react-router";
import { WikiLibrary } from "@/components/wiki-library";
export const Route = createFileRoute("/c/$slug/wiki")({ component: Wiki });
function Wiki() {
  const { slug } = Route.useParams();
  return <WikiLibrary slug={slug} />;
}

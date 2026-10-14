import { createFileRoute } from "@tanstack/react-router";
import { PlatformTools } from "@/components/platform-tools";
export const Route = createFileRoute("/marketplace")({
  component: () => <PlatformTools mode="marketplace" />,
});

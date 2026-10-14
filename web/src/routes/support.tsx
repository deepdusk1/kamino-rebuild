import { createFileRoute } from "@tanstack/react-router";
import { PlatformTools } from "@/components/platform-tools";
export const Route = createFileRoute("/support")({
  component: () => <PlatformTools mode="support" />,
});

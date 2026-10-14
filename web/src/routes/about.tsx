import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/home/landing";

/** The marketing page. The app's own Welcome screen stays at `/` and the guided tour at /welcome. */
export const Route = createFileRoute("/about")({ component: Landing });

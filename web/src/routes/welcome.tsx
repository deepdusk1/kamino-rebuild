import { createFileRoute } from "@tanstack/react-router";
import { WelcomeScreen } from "@/components/home/welcome-screen";

/**
 * Welcome ("Find Your People", mockup 01-welcome). The same screen also shows at / for visitors
 * who are not signed in; this address lets anyone open it directly.
 */
export const Route = createFileRoute("/welcome")({
  head: () => ({ meta: [{ title: "Welcome to Kamino" }] }),
  component: WelcomeScreen,
});

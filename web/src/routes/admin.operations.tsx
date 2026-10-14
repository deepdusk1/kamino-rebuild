import { createFileRoute } from "@tanstack/react-router";
import { AdminOperations } from "@/components/operations-v10";
export const Route = createFileRoute("/admin/operations")({ component: AdminOperations });

import { createFileRoute } from "@tanstack/react-router";
import { OperationsCenter } from "@/components/operations-v10";
export const Route = createFileRoute("/operations")({ component: OperationsCenter });

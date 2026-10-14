import { createFileRoute } from "@tanstack/react-router";
import { CaseAppealPage } from "@/components/case-appeal-v10";
export const Route = createFileRoute("/appeal")({ component: CaseAppealPage });

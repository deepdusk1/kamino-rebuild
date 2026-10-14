import { z } from "zod";

function isDatabaseId(value: string) {
  return /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 2_147_483_647;
}

export const fileReportSchema = z.object({
  communityId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/).optional(),
  targetType: z.enum(["post", "comment", "message", "user", "community"]),
  targetId: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(300),
  details: z.string().max(5000).default(""),
}).superRefine((value, context) => {
  const valid = value.targetType === "comment"
    ? value.targetId.split("/").length <= 2 && value.targetId.split("/").every(isDatabaseId)
    : value.targetType === "post" || value.targetType === "message"
      ? isDatabaseId(value.targetId)
      : value.targetType === "community"
        ? /^[a-z0-9][a-z0-9-]{0,99}$/.test(value.targetId)
        : ![...value.targetId].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127);
  if (!valid) context.addIssue({ code: "custom", path: ["targetId"], message: "Choose a valid report target." });
});

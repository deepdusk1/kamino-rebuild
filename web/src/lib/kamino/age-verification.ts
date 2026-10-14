/**
 * Age verification operations (Stripe Identity). Rules live in `age-verification.server.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { internals } from "./server";
import {
  ageVerificationStatus,
  startAgeVerificationSession,
} from "./age-verification.server";

type Authed = { userId: string };

export const getAgeVerificationStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    return ageVerificationStatus(sql, userId);
  });

export const startAgeVerification = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({}))
  .handler(async ({ context }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    return startAgeVerificationSession(sql, userId);
  });

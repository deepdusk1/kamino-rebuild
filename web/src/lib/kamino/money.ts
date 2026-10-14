/**
 * Creator money operations: the RPC surface for the phone app and the web creator page.
 * The database/provider rules live in `money.server.ts` with unit tests.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { internals } from "./server";
import {
  connectOnboardingUrl,
  creatorMoneySummary,
  payOutCreator,
} from "./money.server";

type Authed = { userId: string };

export const getCreatorMoney = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    return creatorMoneySummary(sql, userId);
  });

export const startConnectOnboarding = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    return connectOnboardingUrl(sql, userId);
  });

export const requestCreatorPayout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({}))
  .handler(async ({ context }) => {
    const sql = await internals.db();
    const { userId } = context as Authed;
    return payOutCreator(sql, userId);
  });

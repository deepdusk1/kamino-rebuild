import { createMiddleware } from "@tanstack/react-start";

export type Viewer = {
  userId: string | null;
  email: string | null;
  name: string | null;
  image: string | null;
};

const emptyViewer: Viewer = { userId: null, email: null, name: null, image: null };

export const optionalAuth = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getBearerToken } = await import("@/lib/auth/client");
    return next({ sendContext: { bearerToken: getBearerToken() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { auth, authConfigured } = await import("@/lib/auth/server");
    const request = getRequest();
    if (!request || !authConfigured) {
      return next({ context: emptyViewer });
    }
    let headers = request.headers;
    const token = (context as { bearerToken?: string }).bearerToken;
    if (token) {
      headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${token}`);
    }
    const session = await auth.api.getSession({ headers });
    const u = session?.user as { id?: string; email?: string | null; name?: string | null; image?: string | null } | undefined;
    const viewer: Viewer = {
      userId: u?.id ?? null,
      email: u?.email ?? null,
      name: u?.name ?? null,
      image: u?.image ?? null,
    };
    if (viewer.userId) {
      const { getSql } = await import('../db');
      const { internals } = await import('./server');
      await internals.assertAccountAllowed(await getSql(), viewer.userId);
      // "Online now": remember when this person was last active (at most one write a minute).
      const { touchPresence } = await import("./presence.server");
      touchPresence(viewer.userId);
    }
    return next({ context: viewer });
  });

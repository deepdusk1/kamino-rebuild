import { apiBaseUrl } from "./config";

/** Error thrown for any failed server call. `status` is the HTTP status (401 = not signed in). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get isUnauthorized() {
    return this.status === 401;
  }
}

/** The session token is kept by the AuthProvider and handed to us through this hook-free setter. */
let bearer: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  bearer = token;
}
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}
export function getAuthToken() {
  return bearer;
}

const TIMEOUT_MS = 30_000;

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { message: text.slice(0, 200) };
    }
    return { status: response.status, body };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    throw new ApiError(
      timedOut ? "The server took too long to answer. Please try again." : "Can't reach Kamino. Check your connection.",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Call a server function: `rpc("homeFeed")`, `rpc("addComment", { postId, body })`.
 * The typed wrappers in `endpoints.ts` are what screens should normally use.
 */
export async function rpc<T>(name: string, data?: unknown): Promise<T> {
  const { status, body } = await fetchJson(`${apiBaseUrl()}/api/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify({ data: data ?? null }),
  });
  const payload = (body ?? {}) as { result?: T; error?: { message?: string; status?: number } };
  if (payload.error || status >= 400) {
    const failure = new ApiError(payload.error?.message ?? "Something went wrong.", payload.error?.status ?? status);
    if (failure.isUnauthorized && bearer) onUnauthorized?.();
    throw failure;
  }
  return payload.result as T;
}

/** Sign-in and account calls go to the auth service, which answers in a different shape. */
export async function authRequest(
  path: string,
  json: unknown,
  extraHeaders: Record<string,string> = {},
): Promise<{ body: Record<string, unknown>; token: string | null }> {
  const response = await fetch(`${apiBaseUrl()}/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: apiBaseUrl(), ...authHeaders(), ...extraHeaders },
    body: JSON.stringify(json),
  }).catch(() => {
    throw new ApiError("Can't reach Kamino. Check your connection.", 0);
  });
  const body = ((await response.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(typeof body.message === "string" ? body.message : "Could not complete that request.", response.status);
  }
  return { body, token: response.headers.get("set-auth-token") };
}

/** URL of a chat attachment; pass `authHeaders()` along when loading it. */
export function messageMediaUrl(roomId: number, messageId: number): string {
  return `${apiBaseUrl()}/api/v1/media/message/${roomId}/${messageId}`;
}
/** URL of an extra picture of an image post (position 1 is the first after the cover); pass `authHeaders()` along. */
export function postImageUrl(postId: number, position: number): string {
  return `${apiBaseUrl()}/api/v1/media/post/${postId}/${position}`;
}
export function authHeaders(): Record<string, string> {
  return bearer ? { authorization: `Bearer ${bearer}` } : {};
}
/**
 * An image source for a post picture. Pictures on the server (built-in covers, or files kept in object storage) may
 * need the sign-in token, so it is sent, but ONLY to Kamino's own server, never to another website's address.
 */
export function imageSource(path: string): { uri: string; headers?: Record<string, string> } {
  const uri = assetUrl(path);
  return uri.startsWith(apiBaseUrl()) ? { uri, headers: authHeaders() } : { uri };
}
/** Turns "/covers/x.jpg" from the server into a full address; leaves https:// and data: URLs alone. */
export function assetUrl(path: string): string {
  if (!path) return "";
  if (/^(https?:|data:|file:)/i.test(path)) return path;
  return `${apiBaseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
}

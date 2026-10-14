/* Kamino's installable web app. Cache public files only, never user data. */
const CACHE_PREFIX = "kamino-public-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = "/offline.html";
const PUBLIC_FILES = new Set([
  OFFLINE_URL, "/manifest.webmanifest", "/favicon.svg", "/kamino-logo.svg",
  "/icons/kamino-192.png", "/icons/kamino-512.png",
]);
const MAX_PUBLIC_FILES = 80;

function isPrivateEndpoint(path) {
  return /^\/(?:api|auth)(?:\/|$)/.test(path) || path.startsWith("/_");
}

function isPublicAsset(request) {
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.search || url.hash) return false;
  if (request.headers.has("authorization") || request.headers.has("range") || isPrivateEndpoint(url.pathname)) return false;
  // Only build-generated CSS/JS/fonts; never arbitrary images, JSON, media or HTML under /assets.
  return PUBLIC_FILES.has(url.pathname) || /^\/assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{6,}\.(?:js|css|woff2?)$/.test(url.pathname);
}

function isPublicResponse(request, response) {
  if (!isPublicAsset(request) || response.status !== 200 || response.redirected || response.type === "opaque") return false;
  const control = response.headers.get("cache-control") ?? "";
  const vary = response.headers.get("vary") ?? "";
  if (/(?:private|no-store)/i.test(control) || /(?:\*|cookie|authorization)/i.test(vary) || response.headers.has("set-cookie")) return false;
  const path = new URL(request.url).pathname;
  const mime = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (path === OFFLINE_URL) return mime === "text/html";
  if (path.endsWith(".webmanifest")) return mime === "application/manifest+json" || mime === "application/json";
  if (path.endsWith(".svg")) return mime === "image/svg+xml";
  if (path.endsWith(".png")) return mime === "image/png";
  if (path.endsWith(".css")) return mime === "text/css";
  if (path.endsWith(".js")) return mime === "application/javascript" || mime === "text/javascript";
  return /^font\//.test(mime) || mime === "application/font-woff";
}

async function storePublicAsset(cache, request, response) {
  if (!isPublicResponse(request, response)) return;
  await cache.put(request.url, response.clone());
  const removable = (await cache.keys()).filter((key) => new URL(key.url).pathname !== OFFLINE_URL);
  for (const old of removable.slice(0, Math.max(0, removable.length - MAX_PUBLIC_FILES + 1))) await cache.delete(old);
}

async function publicAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    // Public resources must not depend on the visitor's cookies or bearer token.
    const response = await fetch(new Request(request.url, { credentials: "omit", cache: "no-store" }));
    await storePublicAsset(cache, request, response);
    return response;
  } catch (error) {
    const cached = await cache.match(request.url);
    if (cached) return cached;
    throw error;
  }
}

async function navigation(request) {
  try {
    // Never save signed-in HTML, even if its server headers accidentally allow caching.
    return await fetch(new Request(request, { cache: "no-store" }));
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const offline = await cache.match(new URL(OFFLINE_URL, self.location.origin).href);
    return new Response(offline ? await offline.text() : "Kamino needs an internet connection. Reconnect and try again.", {
      status: 503,
      headers: { "content-type": offline ? "text/html; charset=utf-8" : "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const file of PUBLIC_FILES) {
      const request = new Request(new URL(file, self.location.origin), { credentials: "omit", cache: "no-store" });
      await storePublicAsset(cache, request, await fetch(request));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || isPrivateEndpoint(url.pathname)) return;
  if (isPublicAsset(request)) event.respondWith(publicAsset(request));
  else if (request.mode === "navigate") event.respondWith(navigation(request));
  // RPC, auth, private media and API requests are always handled by the network.
});

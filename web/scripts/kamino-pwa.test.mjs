import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const origin = "https://kamino.example";
const workerCode = readFileSync(new URL("../public/kamino-sw.js", import.meta.url), "utf8");

function worker() {
  const handlers = {}, stores = new Map(), fetched = [];
  let offline = false, headers = {};
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const values = stores.get(name);
    const key = (request) => typeof request === "string" ? request : request.url;
    return {
      put: async (request, response) => values.set(key(request), response),
      match: async (request) => values.get(key(request))?.clone(),
      keys: async () => [...values.keys()].map((url) => new Request(url)),
      delete: async (request) => values.delete(key(request)),
    };
  };
  const context = vm.createContext({
    Request, Response, URL, Set,
    self: { location: { origin }, addEventListener: (type, handler) => { handlers[type] = handler; }, skipWaiting: async () => undefined, clients: { claim: async () => undefined } },
    caches: { open: async (name) => cacheFor(name), keys: async () => [...stores.keys()], delete: async (name) => stores.delete(name) },
    fetch: async (request) => {
      fetched.push(request);
      if (offline) throw new Error("No connection");
      const path = new URL(request.url).pathname;
      const mime = path.endsWith(".html") ? "text/html" : path.endsWith(".webmanifest") ? "application/manifest+json" : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".png") ? "image/png" : path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html";
      return new Response(path === "/offline.html" ? "Reconnect to use Kamino. No account data is saved." : `network:${path}`, { headers: { "content-type": mime, ...headers } });
    },
  });
  vm.runInContext(workerCode, context);
  const dispatch = (type, request) => {
    let pending;
    handlers[type]({ request, waitUntil: (promise) => { pending = promise; }, respondWith: (promise) => { pending = promise; } });
    return pending;
  };
  return { context, dispatch, stores, fetched, cacheFor, setOffline: (value) => { offline = value; }, setHeaders: (value) => { headers = value; } };
}

test("private URLs, bearer tokens, query strings and byte ranges never qualify for PWA caching", () => {
  const w = worker();
  for (const path of ["/", "/settings", "/me", "/chats/1", "/c/private", "/api/v1/content-media/1", "/api/v1/rpc", "/auth/popup", "/__serverFn/abcd", "/assets/private.jpg", "/assets/profile.json", "/assets/export.html", "/icons/kamino-192.png?user=1"]) {
    const request = new Request(origin + path);
    assert.equal(w.context.isPublicAsset(request), false, path);
    if (w.context.isPrivateEndpoint(path)) assert.equal(w.dispatch("fetch", request), undefined, path);
  }
  for (const options of [{ headers: { authorization: "Bearer private-token" } }, { headers: { range: "bytes=0-99" } }, { method: "POST" }]) {
    assert.equal(w.context.isPublicAsset(new Request(origin + "/icons/kamino-192.png", options)), false);
  }
  assert.equal(w.context.isPublicAsset(new Request("https://other.example/assets/app-abcdef.js")), false);
  assert.equal(w.context.isPublicAsset(new Request(origin + "/assets/app-abcdef.js")), true);
});

test("installation preloads only six credential-free public files", async () => {
  const w = worker();
  await w.dispatch("install");
  const entries = [...w.stores.values()][0];
  assert.equal(entries.size, 6);
  for (const request of w.fetched) {
    assert.equal(request.credentials, "omit");
    assert.equal(request.cache, "no-store");
    assert.equal(request.headers.has("authorization"), false);
    assert.equal(w.context.isPublicAsset(request), true);
  }
});

test("static caching rejects private/no-store, varied identity, cookie and HTML masquerading as JavaScript", async () => {
  const w = worker(), request = new Request(origin + "/assets/app-abcdef.js");
  for (const headers of [{ "cache-control": "private" }, { "cache-control": "no-store" }, { vary: "Cookie" }, { vary: "Authorization" }, { vary: "*" }, { "set-cookie": "session=secret" }, { "content-type": "text/html" }]) {
    w.setHeaders(headers);
    await w.dispatch("fetch", request);
    assert.equal([...w.stores.values()][0].size, 0, JSON.stringify(headers));
  }
  w.setHeaders({});
  await w.dispatch("fetch", request);
  assert.equal([...w.stores.values()][0].size, 1);
  assert.equal(w.fetched.at(-1).credentials, "omit");
});

test("signed-in navigation goes to the network without saving HTML; offline navigation gets only a generic fallback", async () => {
  const w = worker();
  await w.dispatch("install");
  const request = new Request(origin + "/chats/123");
  Object.defineProperty(request, "mode", { value: "navigate" });
  const online = await w.dispatch("fetch", request);
  assert.equal(await online.text(), "network:/chats/123");
  assert.equal(w.fetched.at(-1).cache, "no-store");
  for (const store of w.stores.values()) assert.equal(store.has(request.url), false);
  w.setOffline(true);
  const fallback = await w.dispatch("fetch", request);
  assert.equal(fallback.status, 503);
  assert.equal(fallback.headers.get("cache-control"), "no-store");
  assert.match(await fallback.text(), /Reconnect to use Kamino/);
  for (const store of w.stores.values()) assert.equal(store.has(request.url), false);
  assert.equal(w.dispatch("fetch", new Request(origin + "/api/v1/rpc")), undefined);
});

test("activation removes only old Kamino public caches", async () => {
  const w = worker();
  w.cacheFor("kamino-public-old");
  w.cacheFor("unrelated-app-cache");
  await w.dispatch("install");
  await w.dispatch("activate");
  assert.equal(w.stores.has("kamino-public-old"), false);
  assert.equal(w.stores.has("kamino-public-v1"), true);
  assert.equal(w.stores.has("unrelated-app-cache"), true);
});

test("desktop manifest has a same-origin root scope and real 192/512 icons", () => {
  const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((item) => item.sizes === `${size}x${size}`);
    assert.ok(icon);
    const bytes = readFileSync(new URL(`../public${icon.src}`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});

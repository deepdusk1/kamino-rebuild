/**
 * Where pictures, voice notes and videos live (server-only).
 *
 * By default they are kept inside the database, which needs nothing to set up and is fine for a first
 * community. Set the KAMINO_S3_* variables and new files go to an S3-compatible bucket instead
 * (Amazon S3, Cloudflare R2, Backblaze B2, MinIO ...); the database then only keeps a short reference
 * such as `s3:chat/1f2e...|image/jpeg`. Old files that are still inside the database keep working, so you can
 * switch on storage at any time without moving anything.
 *
 *   KAMINO_S3_ENDPOINT           https://<account>.r2.cloudflarestorage.com  (or https://s3.<region>.amazonaws.com)
 *   KAMINO_S3_BUCKET             the bucket name
 *   KAMINO_S3_ACCESS_KEY_ID      the access key
 *   KAMINO_S3_SECRET_ACCESS_KEY  its secret
 *   KAMINO_S3_REGION             optional; "auto" for R2, "us-east-1" (default) for most others
 *   KAMINO_S3_PATH_STYLE         optional; "true" (default) puts the bucket in the path, which works everywhere
 *
 * The bucket must stay PRIVATE: Kamino checks who may see a file and then hands it over itself.
 */
import { randomUUID } from "node:crypto";
import { amzDateNow, sha256Hex, signRequest, uriEncode } from "./sigv4.ts";

export type S3Config = {
  endpoint: URL;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathStyle: boolean;
};

/** Reads the settings; returns null when object storage is not configured (files stay in the database). */
export function s3ConfigFrom(env: Record<string, string | undefined>): S3Config | null {
  const endpoint = env.KAMINO_S3_ENDPOINT?.trim();
  const bucket = env.KAMINO_S3_BUCKET?.trim();
  const accessKeyId = env.KAMINO_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.KAMINO_S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("KAMINO_S3_ENDPOINT is not a valid address (it should start with https://).");
  }
  return {
    endpoint: url,
    bucket,
    region: env.KAMINO_S3_REGION?.trim() || "us-east-1",
    accessKeyId,
    secretAccessKey,
    pathStyle: !/^(false|0|no)$/i.test(env.KAMINO_S3_PATH_STYLE ?? ""),
  };
}

const config = () => s3ConfigFrom(process.env);

export const mediaStorageEnabled = (): boolean => config() !== null;

// ────────────────────────────── references ──────────────────────────────

const REF = /^s3:([A-Za-z0-9/_-]+)\|([a-z]+\/[a-z0-9.+-]+)$/;

/** True for a value that points at a stored file (as opposed to holding the file itself as a data URL). */
export const isMediaRef = (value: string): boolean => value.startsWith("s3:");

export function parseMediaRef(value: string): { key: string; mime: string } | null {
  const match = REF.exec(value);
  return match ? { key: match[1]!, mime: match[2]! } : null;
}

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+)(?:;[a-z0-9=.,-]+)*;base64,(.+)$/is;

// ────────────────────────────── the S3 calls ──────────────────────────────

async function s3Request(
  cfg: S3Config,
  method: "PUT" | "GET" | "DELETE",
  key: string,
  body?: Uint8Array,
  contentType?: string,
): Promise<Response> {
  const encodedKey = uriEncode(key, true);
  const host = cfg.pathStyle ? cfg.endpoint.host : `${cfg.bucket}.${cfg.endpoint.host}`;
  const basePath = cfg.endpoint.pathname.replace(/\/$/, "");
  const path = cfg.pathStyle
    ? `${basePath}/${cfg.bucket}/${encodedKey}`
    : `${basePath}/${encodedKey}`;
  const payloadHash = sha256Hex(body ?? "");
  const amzDate = amzDateNow();
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;
  const { authorization } = signRequest({
    method,
    path,
    headers,
    payloadHash,
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    amzDate,
  });
  const { host: _host, ...sendHeaders } = headers;
  void _host; // fetch sets Host itself
  return fetch(`${cfg.endpoint.protocol}//${host}${path}`, {
    method,
    headers: { ...sendHeaders, authorization },
    body: body as BodyInit | undefined,
    signal: AbortSignal.timeout(30_000),
  });
}

// ────────────────────────────── what the rest of the server uses ──────────────────────────────

/**
 * Saves a file (a data URL) and returns what to store in the database: the same data URL when object
 * storage is off, otherwise a short reference. `kind` only names the folder ("chat", "post", "avatar" ...).
 */
export async function storeMedia(kind: string, dataUrl: string): Promise<string> {
  const cfg = config();
  if (!cfg || isMediaRef(dataUrl)) return dataUrl;
  const match = DATA_URL.exec(dataUrl);
  if (!match) throw new Error("That file could not be read.");
  const mime = match[1]!.toLowerCase();
  const key = `${kind.replace(/[^a-z0-9-]/gi, "")}/${randomUUID()}`;
  let response: Response;
  try {
    response = await s3Request(cfg, "PUT", key, Buffer.from(match[2]!, "base64"), mime);
  } catch (error) {
    console.error("[media] upload failed:", error);
    throw new Error("Could not save the file right now. Please try again.");
  }
  if (!response.ok) {
    console.error(
      `[media] upload refused (${response.status}):`,
      (await response.text()).slice(0, 300),
    );
    throw new Error("Could not save the file right now. Please try again.");
  }
  return `s3:${key}|${mime}`;
}

/** Turns a stored value back into a data URL (fetching it from the bucket when it is a reference). */
export async function loadMedia(stored: string): Promise<string> {
  if (!isMediaRef(stored)) return stored;
  const ref = parseMediaRef(stored);
  if (!ref) throw new Error("This file is unavailable.");
  const cfg = config();
  if (!cfg)
    throw new Error(
      "This file is stored in object storage, which is not configured on this server.",
    );
  let response: Response;
  try {
    response = await s3Request(cfg, "GET", ref.key);
  } catch (error) {
    console.error("[media] download failed:", error);
    throw new Error("This file is unavailable right now.");
  }
  if (!response.ok) throw new Error("This file is unavailable.");
  return `data:${ref.mime};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
}

/** Deletes one object, rejecting failures so durable cleanup can retain and retry its reference. */
export async function deleteMediaObject(stored: string): Promise<void> {
  const ref = parseMediaRef(stored);
  if (!ref) throw new Error("Invalid stored media reference.");
  const cfg = config();
  if (!cfg) throw new Error("Object storage is not configured on this server.");
  let response: Response;
  try {
    response = await s3Request(cfg, "DELETE", ref.key);
  } catch {
    throw new Error("Object storage deletion request failed.");
  }
  if (!response.ok && response.status !== 404)
    throw new Error(`Object storage deletion refused (HTTP ${response.status}).`);
}

/** Removes stored files (best effort: a failure is logged and never stops what the person was doing). */
export async function deleteMedia(stored: Array<string | null | undefined>): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  for (const value of stored) {
    const ref = value ? parseMediaRef(value) : null;
    if (!ref) continue;
    try {
      const response = await s3Request(cfg, "DELETE", ref.key);
      if (!response.ok && response.status !== 404)
        console.warn(`[media] delete refused (${response.status}) for ${ref.key}`);
    } catch (error) {
      console.warn("[media] delete failed:", error);
    }
  }
}

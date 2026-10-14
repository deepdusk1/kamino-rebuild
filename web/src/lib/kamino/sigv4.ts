/**
 * AWS Signature Version 4 request signing (the login method every S3-compatible storage understands:
 * Amazon S3, Cloudflare R2, Backblaze B2, MinIO, Wasabi ...). Small on purpose, so Kamino needs no
 * cloud SDK. Pure functions only: no network and no environment, which keeps them testable.
 */
import { createHash, createHmac } from "node:crypto";

export const sha256Hex = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Uint8Array, data: string): Buffer =>
  createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding as S3 wants it. `keepSlash` leaves "/" alone (used for the path). */
export function uriEncode(value: string, keepSlash: boolean): string {
  const encoded = encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return keepSlash ? encoded.replace(/%2F/g, "/") : encoded;
}

export type SignInput = {
  method: string;
  /** The path as it will be sent, already encoded, starting with "/". */
  path: string;
  /** Query string parameters (none for our simple calls). */
  query?: Record<string, string>;
  /** Headers to sign; the names must be lower-case. Must include `host`, `x-amz-content-sha256` and `x-amz-date`. */
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Like 20130524T000000Z. */
  amzDate: string;
};

/** Returns the `Authorization` header value, and the signature on its own (handy for tests). */
export function signRequest(input: SignInput): { authorization: string; signature: string } {
  const service = input.service ?? "s3";
  const date = input.amzDate.slice(0, 8);
  const names = Object.keys(input.headers).sort();
  const canonicalHeaders = names
    .map((n) => `${n}:${input.headers[n]!.trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = names.join(";");
  const canonicalQuery = Object.entries(input.query ?? {})
    .map(([k, v]) => [uriEncode(k, false), uriEncode(v, false)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonicalRequest = [
    input.method,
    input.path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  const scope = `${date}/${input.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", input.amzDate, scope, sha256Hex(canonicalRequest)].join(
    "\n",
  );
  const kDate = hmac(`AWS4${input.secretAccessKey}`, date);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");
  return {
    signature,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** The current time in the compact form SigV4 uses: 20130524T000000Z. */
export function amzDateNow(now = new Date()): string {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

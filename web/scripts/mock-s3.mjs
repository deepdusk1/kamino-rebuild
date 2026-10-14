/**
 * A tiny pretend S3 bucket for the automatic tests (never used in production).
 * It stores files in memory, and it CHECKS the Signature Version 4 login on every request the same way
 * a real bucket would, so a request Kamino signs wrongly is refused here too.
 */
import { createServer } from "node:http";
import { sha256Hex, signRequest } from "../src/lib/kamino/sigv4.ts";

export const MOCK_S3 = {
  bucket: "kamino-test",
  region: "auto",
  accessKeyId: "TESTACCESSKEY",
  secretAccessKey: "test/secret+key",
};

export function startMockS3(port) {
  /** key -> { body: Buffer, type: string } */
  const objects = new Map();
  const log = { refused: [] };
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const refuse = (status, why) => {
      log.refused.push(`${req.method} ${req.url}: ${why}`);
      res.writeHead(status).end(why);
    };

    // 1. The login: recompute the signature from what actually arrived.
    const auth = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/.exec(req.headers.authorization ?? "");
    if (!auth) return refuse(403, "missing or malformed Authorization");
    const [, accessKeyId, , region, signedHeaders, signature] = auth;
    if (accessKeyId !== MOCK_S3.accessKeyId) return refuse(403, "unknown access key");
    const headers = {};
    for (const name of signedHeaders.split(";")) headers[name] = String(req.headers[name] ?? "");
    if (req.headers["x-amz-content-sha256"] !== sha256Hex(body)) return refuse(400, "payload hash does not match the body");
    const expected = signRequest({
      method: req.method, path: new URL(req.url, "http://x").pathname, headers, payloadHash: String(req.headers["x-amz-content-sha256"]),
      region, accessKeyId, secretAccessKey: MOCK_S3.secretAccessKey, amzDate: String(req.headers["x-amz-date"]),
    });
    if (expected.signature !== signature) return refuse(403, "SignatureDoesNotMatch");

    // 2. The file itself (path style: /<bucket>/<key>).
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const prefix = `/${MOCK_S3.bucket}/`;
    if (!path.startsWith(prefix)) return refuse(404, "no such bucket");
    const key = path.slice(prefix.length);
    if (req.method === "PUT") {
      objects.set(key, { body, type: String(req.headers["content-type"] ?? "application/octet-stream") });
      return res.writeHead(200).end();
    }
    if (req.method === "GET") {
      const object = objects.get(key);
      if (!object) return refuse(404, "NoSuchKey");
      return res.writeHead(200, { "content-type": object.type, "content-length": object.body.length }).end(object.body);
    }
    if (req.method === "DELETE") {
      objects.delete(key);
      return res.writeHead(204).end();
    }
    return refuse(405, "method not allowed");
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ objects, log, close: () => server.close() })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.MOCK_S3_PORT ?? 9100);
  await startMockS3(port);
  console.log(`Mock S3 on http://127.0.0.1:${port} (bucket ${MOCK_S3.bucket})`);
}

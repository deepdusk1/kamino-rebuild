import assert from "node:assert/strict";
import { test } from "node:test";
import { amzDateNow, sha256Hex, signRequest, uriEncode } from "./sigv4.ts";

// The worked example "GET Object" from Amazon's own Signature Version 4 documentation.
const ACCESS = "AKIAIOSFODNN7EXAMPLE";
const SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

test("matches Amazon's documented example signature (GET Object)", () => {
  assert.equal(sha256Hex(""), EMPTY);
  const { signature, authorization } = signRequest({
    method: "GET",
    path: "/test.txt",
    headers: { host: "examplebucket.s3.amazonaws.com", range: "bytes=0-9", "x-amz-content-sha256": EMPTY, "x-amz-date": "20130524T000000Z" },
    payloadHash: EMPTY,
    region: "us-east-1",
    accessKeyId: ACCESS,
    secretAccessKey: SECRET,
    amzDate: "20130524T000000Z",
  });
  assert.equal(signature, "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
  assert.equal(
    authorization,
    `AWS4-HMAC-SHA256 Credential=${ACCESS}/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=${signature}`,
  );
});

test("matches Amazon's documented example signature (PUT Object)", () => {
  const body = "Welcome to Amazon S3.";
  const hash = sha256Hex(body);
  assert.equal(hash, "44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072");
  const { signature } = signRequest({
    method: "PUT",
    path: "/test%24file.text",
    headers: {
      date: "Fri, 24 May 2013 00:00:00 GMT",
      host: "examplebucket.s3.amazonaws.com",
      "x-amz-content-sha256": hash,
      "x-amz-date": "20130524T000000Z",
      "x-amz-storage-class": "REDUCED_REDUNDANCY",
    },
    payloadHash: hash,
    region: "us-east-1",
    accessKeyId: ACCESS,
    secretAccessKey: SECRET,
    amzDate: "20130524T000000Z",
  });
  assert.equal(signature, "98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd");
});

test("path encoding keeps slashes and escapes the rest", () => {
  assert.equal(uriEncode("chat/abc def+1", true), "chat/abc%20def%2B1");
  assert.equal(uriEncode("a/b", false), "a%2Fb");
});

test("the date is in the compact SigV4 form", () => {
  assert.equal(amzDateNow(new Date("2013-05-24T00:00:00.123Z")), "20130524T000000Z");
});

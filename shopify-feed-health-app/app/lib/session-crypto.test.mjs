import test from "node:test";
import assert from "node:assert/strict";
import {
  decryptSessionPayload,
  encryptSessionPayload,
} from "./session-crypto.mjs";

const secret = "test-session-secret-that-is-long-enough-123456";

test("encrypted Shopify session payload round-trips", () => {
  const properties = [
    ["id", "offline_example.myshopify.com"],
    ["shop", "example.myshopify.com"],
    ["state", "state-value"],
    ["isOnline", "false"],
    ["accessToken", "sensitive-token-value"],
    ["refreshToken", "sensitive-refresh-value"],
  ];
  const encrypted = encryptSessionPayload(properties, secret);
  assert.ok(encrypted.startsWith("v1."));
  assert.ok(!encrypted.includes("sensitive-token-value"));
  assert.ok(!encrypted.includes("example.myshopify.com"));
  assert.deepEqual(decryptSessionPayload(encrypted, secret), properties);
});

test("tampering is rejected by AES-GCM authentication", () => {
  const encrypted = encryptSessionPayload([["id", "session-1"]], secret);
  const parts = encrypted.split(".");
  const ciphertext = Buffer.from(parts[3], "base64url");
  ciphertext[0] ^= 1;
  parts[3] = ciphertext.toString("base64url");
  assert.throws(() => decryptSessionPayload(parts.join("."), secret));
});

test("short encryption secret is rejected", () => {
  assert.throws(() => encryptSessionPayload([["id", "session-1"]], "too-short"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeRequestTarget } from "./server-logging.mjs";

test("removes Shopify signed query parameters from request logs", () => {
  const raw = "/app?shop=pal-feed-health-dev.myshopify.com&id_token=secret-token&hmac=secret-hmac&session=secret-session";
  const safe = sanitizeRequestTarget(raw);

  assert.equal(safe, "/app");
  assert.equal(safe.includes("id_token"), false);
  assert.equal(safe.includes("hmac"), false);
  assert.equal(safe.includes("session"), false);
  assert.equal(safe.includes("shop="), false);
});

test("keeps only the pathname for ordinary URLs", () => {
  assert.equal(sanitizeRequestTarget("/app/pricing?plan=pro"), "/app/pricing");
  assert.equal(sanitizeRequestTarget("/"), "/");
});

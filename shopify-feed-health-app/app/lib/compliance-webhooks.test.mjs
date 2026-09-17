import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tomlPath = new URL("../../shopify.app.toml", import.meta.url);
const routePath = new URL("../routes/webhooks.compliance.tsx", import.meta.url);

test("Shopify config declares every mandatory compliance topic", async () => {
  const toml = await readFile(tomlPath, "utf8");

  assert.match(toml, /uri\s*=\s*"\/webhooks\/compliance"/);
  for (const topic of ["customers/data_request", "customers/redact", "shop/redact"]) {
    assert.ok(toml.includes(`"${topic}"`), `missing compliance topic: ${topic}`);
  }
});

test("compliance route delegates HMAC verification to Shopify authentication", async () => {
  const route = await readFile(routePath, "utf8");
  assert.match(route, /await authenticate\.webhook\(request\)/);
});

test("shop redact removes persisted sessions while customer topics do not access customer data", async () => {
  const route = await readFile(routePath, "utf8");
  assert.match(route, /topic === "shop\/redact"/);
  assert.match(route, /db\.session\.deleteMany\(\{ where: \{ shop \} \}\)/);
  assert.doesNotMatch(route, /customer|order/i);
});

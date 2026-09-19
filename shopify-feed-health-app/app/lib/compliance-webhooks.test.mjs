import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tomlPath = new URL("../../shopify.app.toml", import.meta.url);
const routePath = new URL("../routes/webhooks.compliance.tsx", import.meta.url);
const uninstallPath = new URL("../routes/webhooks.app.uninstalled.tsx", import.meta.url);
const safeAuthPath = new URL("./authenticate-webhook-safe.server.ts", import.meta.url);

test("Shopify config declares every mandatory compliance topic", async () => {
  const toml = await readFile(tomlPath, "utf8");

  assert.match(toml, /uri\s*=\s*"\/webhooks\/compliance"/);
  for (const topic of ["customers/data_request", "customers/redact", "shop/redact"]) {
    assert.ok(toml.includes(`"${topic}"`), `missing compliance topic: ${topic}`);
  }
});

test("compliance and uninstall routes use safe webhook authentication", async () => {
  const [route, uninstall] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(uninstallPath, "utf8"),
  ]);

  assert.match(route, /authenticateWebhookSafely\(request\)/);
  assert.match(uninstall, /authenticateWebhookSafely\(request\)/);
  assert.match(route, /status:\s*200/);
  assert.match(uninstall, /status:\s*200/);
});

test("safe webhook auth only falls back after a Shopify auth 500 and re-verifies HMAC", async () => {
  const helper = await readFile(safeAuthPath, "utf8");

  assert.match(helper, /error instanceof Response/);
  assert.match(helper, /error\.status !== 500/);
  assert.match(helper, /createHmac\("sha256"/);
  assert.match(helper, /timingSafeEqual/);
  assert.match(helper, /SHOPIFY_API_SECRET/);
  assert.match(helper, /x-shopify-shop-domain/);
  assert.match(helper, /x-shopify-topic/);
});

test("shop redact and uninstall remove persisted shop data", async () => {
  const [route, uninstall] = await Promise.all([
    readFile(routePath, "utf8"),
    readFile(uninstallPath, "utf8"),
  ]);

  assert.match(route, /topic === "shop\/redact"/);
  assert.match(route, /db\.session\.deleteMany\(\{ where: \{ shop \} \}\)/);
  assert.match(uninstall, /db\.session\.deleteMany\(\{ where: \{ shop \} \}\)/);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  APIHUB_AUDIT_PATH,
  APIHUB_HEADER,
  apiHubCatalogAuditMetadata,
  apiHubCatalogAuditOpenApi,
  apiHubCatalogAuditPost,
  apiHubTokenMatches,
} from "./apihub-catalog-audit.mjs";

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(nameOrObject, value) {
      if (typeof nameOrObject === "string") {
        this.headers[nameOrObject.toLowerCase()] = value;
      } else {
        for (const [key, val] of Object.entries(nameOrObject || {})) {
          this.headers[key.toLowerCase()] = val;
        }
      }
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function request(body, token) {
  return {
    body,
    get(name) {
      return name.toLowerCase() === APIHUB_HEADER.toLowerCase() ? token : undefined;
    },
  };
}

function cleanProduct() {
  return {
    id: "sku-1",
    title: "Example product",
    link: "https://example.com/products/sku-1",
    image_link: "https://example.com/images/sku-1.jpg",
    price: "19.99 USD",
    availability: "in_stock",
    brand: "Example",
    gtin: "1234567890123",
  };
}

test("apiHubTokenMatches requires a strong exact secret", () => {
  const secret = "a".repeat(48);
  assert.equal(apiHubTokenMatches(secret, secret), true);
  assert.equal(apiHubTokenMatches("b".repeat(48), secret), false);
  assert.equal(apiHubTokenMatches("short", "short"), false);
});

test("metadata is public but never exposes the configured secret", () => {
  process.env.PAL_APIHUB_UPSTREAM_TOKEN = "s".repeat(48);
  const res = responseRecorder();

  apiHubCatalogAuditMetadata({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.endpoint, APIHUB_AUDIT_PATH);
  assert.equal(res.body.upstream_auth_header, APIHUB_HEADER);
  assert.equal(JSON.stringify(res.body).includes(process.env.PAL_APIHUB_UPSTREAM_TOKEN), false);
  assert.equal(res.headers["cache-control"], "no-store");
});

test("OpenAPI advertises provider-proxy authentication without a credential value", () => {
  process.env.PAL_APIHUB_UPSTREAM_TOKEN = "t".repeat(48);
  const res = responseRecorder();

  apiHubCatalogAuditOpenApi({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.openapi, "3.0.3");
  assert.equal(
    res.body.components.securitySchemes.ApiHubUpstreamKey.name,
    APIHUB_HEADER,
  );
  assert.ok(res.body.paths[APIHUB_AUDIT_PATH].post);
  assert.equal(JSON.stringify(res.body).includes(process.env.PAL_APIHUB_UPSTREAM_TOKEN), false);
});

test("provider POST fails closed when the route secret is not configured", async () => {
  const previous = process.env.PAL_APIHUB_UPSTREAM_TOKEN;
  delete process.env.PAL_APIHUB_UPSTREAM_TOKEN;
  try {
    const res = responseRecorder();
    await apiHubCatalogAuditPost(request({ products: [cleanProduct()] }, ""), res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, "provider_route_not_configured");
  } finally {
    if (previous == null) delete process.env.PAL_APIHUB_UPSTREAM_TOKEN;
    else process.env.PAL_APIHUB_UPSTREAM_TOKEN = previous;
  }
});

test("provider POST rejects a wrong credential before auditing", async () => {
  process.env.PAL_APIHUB_UPSTREAM_TOKEN = "u".repeat(48);
  const res = responseRecorder();

  await apiHubCatalogAuditPost(
    request({ products: [cleanProduct()] }, "v".repeat(48)),
    res,
  );

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, "unauthorized");
});

test("provider POST validates the bounded catalog after authentication", async () => {
  const secret = "w".repeat(48);
  process.env.PAL_APIHUB_UPSTREAM_TOKEN = secret;
  const res = responseRecorder();

  await apiHubCatalogAuditPost(request({ products: [] }, secret), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "invalid_request");
});

test("provider POST returns a deterministic audit with no Nano payment fields", async () => {
  const secret = "x".repeat(48);
  process.env.PAL_APIHUB_UPSTREAM_TOKEN = secret;
  const body = { products: [cleanProduct()] };

  const first = responseRecorder();
  const second = responseRecorder();
  await apiHubCatalogAuditPost(request(body, secret), first);
  await apiHubCatalogAuditPost(request(body, secret), second);

  assert.equal(first.statusCode, 200);
  assert.equal(first.body.service, "PAL Catalog Audit");
  assert.equal(first.body.channel, "apihub");
  assert.equal(first.body.summary.errors, 0);
  assert.equal(first.body.summary.passed, true);
  assert.equal(first.body.audit_id, second.body.audit_id);
  assert.equal("payment" in first.body, false);
  assert.equal(JSON.stringify(first.body).includes(secret), false);
});

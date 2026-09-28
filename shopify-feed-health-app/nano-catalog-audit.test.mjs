import assert from "node:assert/strict";
import test from "node:test";

import {
  auditCatalog,
  bodyDigest,
  buildPaymentQuote,
  stableStringify,
  validateAuditBody,
} from "./nano-catalog-audit.mjs";

test("stableStringify and bodyDigest ignore object key order", () => {
  const a = { products: [{ id: "1", title: "A" }], meta: { b: 2, a: 1 } };
  const b = { meta: { a: 1, b: 2 }, products: [{ title: "A", id: "1" }] };
  assert.equal(stableStringify(a), stableStringify(b));
  assert.equal(bodyDigest(a), bodyDigest(b));
});

test("validateAuditBody enforces a bounded products array", () => {
  assert.equal(validateAuditBody({ products: [{}] }).ok, true);
  assert.equal(validateAuditBody({}).ok, false);
  assert.equal(validateAuditBody({ products: [] }).ok, false);
  assert.equal(validateAuditBody({ products: Array.from({ length: 101 }, () => ({})) }).ok, false);
});

test("auditCatalog reports clean required fields without errors", () => {
  const report = auditCatalog([
    {
      id: "sku-1",
      title: "Example product",
      link: "https://example.com/products/sku-1",
      image_link: "https://example.com/images/sku-1.jpg",
      price: "19.99 USD",
      availability: "in stock",
      brand: "Example",
      gtin: "1234567890123",
    },
  ]);
  assert.equal(report.summary.products_checked, 1);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.summary.passed, true);
});

test("auditCatalog catches duplicate IDs and malformed commerce fields", () => {
  const report = auditCatalog([
    {
      id: "dup",
      title: "",
      link: "not-a-url",
      image_link: "",
      price: "free",
      availability: "maybe",
    },
    {
      id: "dup",
      title: "Second",
      link: "https://example.com/p/2",
      image_link: "https://example.com/2.jpg",
      price: 10,
      availability: "in_stock",
    },
  ]);
  const codes = new Set(report.issues.map((row) => row.code));
  assert.ok(codes.has("duplicate_id"));
  assert.ok(codes.has("missing_title"));
  assert.ok(codes.has("invalid_link"));
  assert.ok(codes.has("invalid_image_link"));
  assert.ok(codes.has("invalid_price"));
  assert.ok(codes.has("invalid_availability"));
  assert.ok(report.summary.errors >= 6);
});

test("buildPaymentQuote exposes only public payment metadata", () => {
  process.env.PAL_NANO_ADDRESS = "nano_1cwckodornuho5eytrz5qjrk8a6x7udadyq3jsris9sqitmu5y5btad3jq6x";
  process.env.PAL_NANO_PRICE_RAW = "10000000000000000000000000000";
  process.env.PAL_NANO_PRICE_XNO = "0.01";
  const body = { products: [{ id: "sku-1" }] };
  const quote = buildPaymentQuote(body);
  assert.equal(quote.network, "nano:mainnet");
  assert.equal(quote.asset, "XNO");
  assert.equal(quote.amount_xno, "0.01");
  assert.equal(quote.amount_raw, "10000000000000000000000000000");
  assert.equal(quote.pay_to, process.env.PAL_NANO_ADDRESS);
  assert.equal(quote.request_sha256, bodyDigest(body));
  assert.equal("seed" in quote, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  auditCatalog,
  createCatalogScanReplayStore,
  quoteDigest,
  stableJson,
  validateCatalogInput,
} from "./nano-catalog-preflight.mjs";

test("stableJson is order independent for object keys", () => {
  assert.equal(
    stableJson({ b: 2, a: { d: 4, c: 3 } }),
    stableJson({ a: { c: 3, d: 4 }, b: 2 }),
  );
  assert.equal(quoteDigest({ b: 2, a: 1 }), quoteDigest({ a: 1, b: 2 }));
});

test("rejects invalid input before payment", () => {
  assert.deepEqual(validateCatalogInput({ products: [] }), {
    ok: false,
    error: "products must contain at least one product.",
  });
  assert.equal(validateCatalogInput({ products: [{}] }).ok, true);
});

test("audits malformed rows and duplicate identifiers", () => {
  const report = auditCatalog({
    products: [
      {
        id: "1",
        title: "Widget A",
        handle: "widget",
        sku: "SKU-1",
        gtin: "123",
        price: 0,
        currency: "usd",
        availability: "available",
        image_url: "not-a-url",
      },
      {
        id: "2",
        title: "Widget B",
        handle: "widget",
        sku: "SKU-1",
        gtin: "12345678",
        brand: "PAL",
        mpn: "M-2",
        price: 10,
        currency: "USD",
        availability: "in stock",
        image_url: "https://example.com/b.jpg",
      },
    ],
  });

  assert.equal(report.summary.products_checked, 2);
  assert.ok(report.summary.errors >= 4);
  assert.ok(report.rows[0].issues.some((x) => x.code === "invalid_gtin"));
  assert.ok(report.rows[0].issues.some((x) => x.code === "duplicate_handle"));
  assert.ok(report.rows[1].issues.some((x) => x.code === "duplicate_sku"));
});

test("clean row can score 100", () => {
  const report = auditCatalog({
    products: [
      {
        id: "1",
        title: "Healthy Widget",
        handle: "healthy-widget",
        sku: "HEALTHY-1",
        gtin: "12345678",
        brand: "PAL",
        mpn: "PAL-1",
        price: 19.99,
        currency: "USD",
        availability: "in stock",
        image_url: "https://example.com/healthy.jpg",
      },
    ],
  });

  assert.equal(report.summary.errors, 0);
  assert.equal(report.summary.warnings, 0);
  assert.equal(report.summary.score, 100);
});


test("durable replay store persists a payment and resolves a duplicate create", async () => {
  const rows = new Map();
  const prisma = {
    catalogScan: {
      async findUnique({ where }) {
        return rows.get(where.id) ?? null;
      },
      async create({ data }) {
        if (rows.has(data.id)) {
          const error = new Error("duplicate");
          error.code = "P2002";
          throw error;
        }
        rows.set(data.id, { ...data, createdAt: new Date() });
        return rows.get(data.id);
      },
    },
  };

  const store = createCatalogScanReplayStore(prisma);
  const hash = "A".repeat(64);
  const record = {
    quote: "quote-1",
    result: {
      generated_at: new Date().toISOString(),
      summary: {
        score: 94,
        errors: 0,
        warnings: 2,
        products_checked: 1,
      },
      rows: [],
    },
    payment: { hash, amount_nano: "0.01" },
    at: Date.now(),
  };

  const first = await store.put(hash, record);
  assert.equal(first.created, true);

  const loaded = await store.get(hash);
  assert.equal(loaded.quote, "quote-1");
  assert.equal(loaded.payment.hash, hash);
  assert.equal(loaded.result.summary.score, 94);

  const second = await store.put(hash, { ...record, quote: "quote-2" });
  assert.equal(second.created, false);
  assert.equal(second.record.quote, "quote-1");
});

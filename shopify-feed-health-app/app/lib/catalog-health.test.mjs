import test from "node:test";
import assert from "node:assert/strict";
import { auditCatalog } from "./catalog-health.mjs";

test("healthy product stays high-scoring", () => {
  const report = auditCatalog([{ id: "p1", title: "Trail Shoe", vendor: "PAL Test", onlineStoreUrl: "https://example.com/products/trail-shoe", images: { nodes: [{ width: 1200, height: 1200 }] }, variants: { nodes: [{ title: "Blue / 42", sku: "TS-42-B", barcode: "1234567890123", price: "99.00", selectedOptions: [{ name: "Size", value: "42" }, { name: "Color", value: "Blue" }] }], pageInfo: { hasNextPage: false } } }]);
  assert.equal(report.errors, 0);
  assert.equal(report.warnings, 0);
  assert.equal(report.score, 100);
  assert.deepEqual(report.issueCounts, {});
});

test("flags image, identifier, price and duplicate variant problems", () => {
  const report = auditCatalog([{ id: "p2", title: "Risky Product", vendor: "", onlineStoreUrl: null, images: { nodes: [{ width: 300, height: 300 }] }, variants: { nodes: [{ title: "A", sku: "", barcode: "", price: "0", selectedOptions: [{ name: "Size", value: "M" }] }, { title: "B", sku: "", barcode: "", price: "20", selectedOptions: [{ name: "Size", value: "M" }] }], pageInfo: { hasNextPage: false } } }]);
  const codes = new Set(report.issues.map((entry) => entry.code));
  for (const code of ["MISSING_BRAND", "NO_ONLINE_STORE_URL", "IMAGE_BELOW_500", "IDENTIFIER_GAP", "NON_POSITIVE_PRICE", "DUPLICATE_VARIANT_OPTIONS"]) assert.ok(codes.has(code), `missing ${code}`);
  assert.equal(report.issueCounts.IMAGE_BELOW_500, 1);
  assert.equal(report.issueCounts.IDENTIFIER_GAP, 2);
  assert.equal(report.issueCounts.NON_POSITIVE_PRICE, 1);
  assert.equal(report.issueCounts.DUPLICATE_VARIANT_OPTIONS, 1);
  assert.equal(report.productsWithCritical, 1);
  assert.ok(report.errors > 0);
  assert.ok(report.score < 100);
});

test("summarizes missing-image and missing-brand counts", () => {
  const report = auditCatalog([
    { id: "p3", title: "No Image", vendor: "", onlineStoreUrl: "https://example.com/products/no-image", images: { nodes: [] }, variants: { nodes: [], pageInfo: { hasNextPage: false } } },
    { id: "p4", title: "Also No Image", vendor: "Brand", onlineStoreUrl: "https://example.com/products/no-image-2", images: { nodes: [] }, variants: { nodes: [], pageInfo: { hasNextPage: false } } },
  ]);
  assert.equal(report.issueCounts.MISSING_IMAGE, 2);
  assert.equal(report.issueCounts.MISSING_BRAND, 1);
  assert.equal(report.productsWithCritical, 2);
});

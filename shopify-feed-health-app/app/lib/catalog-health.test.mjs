import test from "node:test";
import assert from "node:assert/strict";
import { auditCatalog } from "./catalog-health.mjs";

test("healthy product stays high-scoring", () => {
  const report = auditCatalog([{ id: "p1", title: "Trail Shoe", vendor: "PAL Test", onlineStoreUrl: "https://example.com/products/trail-shoe", images: { nodes: [{ width: 1200, height: 1200 }], pageInfo: { hasNextPage: false } }, variants: { nodes: [{ title: "Blue / 42", sku: "TS-42-B", barcode: "1234567890123", price: "99.00", selectedOptions: [{ name: "Size", value: "42" }, { name: "Color", value: "Blue" }] }], pageInfo: { hasNextPage: false } } }]);
  assert.equal(report.errors, 0);
  assert.equal(report.warnings, 0);
  assert.equal(report.score, 100);
  assert.equal(report.imageReadiness.imagesBelow500, 0);
  assert.equal(report.imageReadiness.productsMissingImages, 0);
  assert.equal(report.imageReadiness.readyPercent, 100);
  assert.equal(report.imageReadiness.enforcementDate, "2027-01-31");
});

test("flags image, identifier, price and duplicate variant problems", () => {
  const report = auditCatalog([{ id: "p2", title: "Risky Product", vendor: "", onlineStoreUrl: null, images: { nodes: [{ width: 300, height: 300 }], pageInfo: { hasNextPage: false } }, variants: { nodes: [{ title: "A", sku: "", barcode: "", price: "0", selectedOptions: [{ name: "Size", value: "M" }] }, { title: "B", sku: "", barcode: "", price: "20", selectedOptions: [{ name: "Size", value: "M" }] }], pageInfo: { hasNextPage: false } } }]);
  const codes = new Set(report.issues.map((entry) => entry.code));
  for (const code of ["MISSING_BRAND", "NO_ONLINE_STORE_URL", "IMAGE_BELOW_500", "IDENTIFIER_GAP", "NON_POSITIVE_PRICE", "DUPLICATE_VARIANT_OPTIONS"]) assert.ok(codes.has(code), `missing ${code}`);
  assert.ok(report.errors > 0);
  assert.ok(report.score < 100);
  assert.equal(report.imageReadiness.imagesBelow500, 1);
  assert.equal(report.imageReadiness.productsWithImageRisk, 1);
});

test("reports dynamic Pro truncation limits and missing-image readiness risk", () => {
  const report = auditCatalog(
    [{
      id: "p3",
      title: "Large Product",
      vendor: "PAL",
      onlineStoreUrl: "https://example.com/products/large",
      images: { nodes: [], pageInfo: { hasNextPage: true } },
      variants: { nodes: [], pageInfo: { hasNextPage: true } },
    }],
    { variantLimit: 250, imageLimit: 100 },
  );

  const byCode = new Map(report.issues.map((entry) => [entry.code, entry]));
  assert.match(byCode.get("VARIANT_SCAN_TRUNCATED").message, /250 variants/);
  assert.match(byCode.get("IMAGE_SCAN_TRUNCATED").message, /100 images/);
  assert.equal(report.imageReadiness.productsMissingImages, 1);
  assert.equal(report.imageReadiness.productsWithImageRisk, 1);
});
